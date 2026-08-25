import { act, renderHook } from '@testing-library/react';
import {
    getInitialPurchase,
    purchaseEntryDraftReadinessError,
    usePurchaseEntryLogic,
} from './usePurchaseEntryLogic';
import { calculatePurchaseOrderPreview } from '../../../../services/calculations/purchaseOrderCalculationService';

const mockError = jest.fn();

jest.mock('../../../global', () => ({
    useToast: () => ({ error: mockError })
}));

jest.mock('../../../../services/calculations/purchaseOrderCalculationService', () => {
    const actual = jest.requireActual('../../../../services/calculations/purchaseOrderCalculationService');
    return { ...actual, calculatePurchaseOrderPreview: jest.fn() };
});

jest.mock('./usePurchaseEntrySave', () => ({
    usePurchaseEntrySave: () => ({ saving: false })
}));

const mockedPreview = calculatePurchaseOrderPreview as jest.MockedFunction<typeof calculatePurchaseOrderPreview>;

describe('usePurchaseEntryLogic calculation scheduling', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
    });

    afterEach(() => jest.useRealTimers());

    it('starts without inferred dates, payment, status, delivery or totals', () => {
        expect(getInitialPurchase()).toMatchObject({
            invoice_date: '', delivery_date: '', delivery_type: '',
            payment_methods: [], payment_status: '', items: [],
            gross_amount: '', discount_amount: '', tax_amount: '',
            freight_charges: '', insurance_charges: '', other_charges: '',
            round_off: '', net_amount: '', total_amount: '',
        });
    });

    it('keeps review unavailable until canonical identities, batch facts and API totals exist', () => {
        const draft = getInitialPurchase();
        const supplier = { supplier_id: '0198ea37-2b1c-7c8d-9123-123456789abc' };
        draft.supplier_id = supplier.supplier_id;
        draft.supplier_invoice_number = 'SUP-INV-1';
        draft.invoice_date = '2026-08-25';
        draft.delivery_date = '2026-08-25';
        draft.freight_charges = '0';
        draft.insurance_charges = '0';
        draft.other_charges = '0';
        draft.items = [{
            product_id: '0198ea37-2b1d-7c8d-9123-123456789abc', product_name: 'Product',
            quantity: '1', unit_price: '100', mrp: '150', free_quantity: '0',
            discount_percent: '0', tax_percent: '12',
        }];
        expect(purchaseEntryDraftReadinessError(draft, supplier)).toMatch(/UOM identity/i);
        draft.items[0].uom_conversion_id = '0198ea37-2b1e-7c8d-9123-123456789abc';
        draft.items[0].batch_number = 'BATCH-1';
        draft.items[0].expiry_date = '2028-08';
        expect(purchaseEntryDraftReadinessError(draft, supplier)).toMatch(/calculation API/i);
        draft.total_amount = '112.00';
        expect(purchaseEntryDraftReadinessError(draft, supplier)).toBeNull();
    });

    it('debounces one UUIDv7 calculation and does not loop after projection state updates', async () => {
        mockedPreview.mockResolvedValue({
            items: [{ taxable_amount: '100.00', tax_amount: '12.00', total: '112.00' }],
            totals: {
                subtotal_amount: '100.00',
                discount_amount: '0.00',
                tax_amount: '12.00',
                round_off_amount: '0.00',
                net_amount: '112.00',
                final_amount: '112.00',
            },
            gst_type: 'CGST/SGST',
        });
        const { result } = renderHook(() => usePurchaseEntryLogic({ onClose: jest.fn() }));

        act(() => result.current.setPurchase(previous => ({
            ...previous,
            supplier_id: '0198ea37-2b1c-7c8d-9123-123456789abc',
            freight_charges: '0', insurance_charges: '0', other_charges: '0',
            items: [{
                product_id: '0198ea37-2b1d-7c8d-9123-123456789abc',
                product_name: 'Test Product',
                quantity: 1,
                free_quantity: 0,
                unit_price: 100,
                mrp: 150,
                discount_percent: 0,
                tax_percent: 12,
            }]
        })));

        await act(async () => {
            jest.advanceTimersByTime(250);
            await Promise.resolve();
        });
        await act(async () => {
            jest.advanceTimersByTime(250);
            await Promise.resolve();
        });

        expect(mockedPreview).toHaveBeenCalledTimes(1);
        expect(result.current.purchase.total_amount).toBe('112.00');
        expect(mockError).not.toHaveBeenCalled();
    });

    it('does not call the API while an explicit calculation fact is missing', async () => {
        const { result } = renderHook(() => usePurchaseEntryLogic({ onClose: jest.fn() }));
        act(() => result.current.setPurchase(previous => ({
            ...previous,
            supplier_id: '0198ea37-2b1c-7c8d-9123-123456789abc',
            items: [{
                product_id: '0198ea37-2b1d-7c8d-9123-123456789abc',
                product_name: 'Incomplete Product', quantity: '', unit_price: '', tax_percent: '',
            }],
        })));
        await act(async () => {
            jest.advanceTimersByTime(250);
            await Promise.resolve();
        });
        expect(mockedPreview).not.toHaveBeenCalled();
        expect(result.current.purchase.total_amount).toBe('');
    });
});
