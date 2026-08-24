import { act, renderHook } from '@testing-library/react';
import { usePurchaseEntryLogic } from './usePurchaseEntryLogic';
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

    it('debounces one UUIDv7 calculation and does not loop after projection state updates', async () => {
        mockedPreview.mockResolvedValue({
            items: [{ taxable_amount: 100, tax_amount: 12, total: 112 }],
            totals: { subtotal_amount: 100, tax_amount: 12, total_amount: 112 }
        });
        const { result } = renderHook(() => usePurchaseEntryLogic({ onClose: jest.fn() }));

        act(() => result.current.setPurchase(previous => ({
            ...previous,
            supplier_id: '0198ea37-2b1c-7c8d-9123-123456789abc',
            items: [{
                product_id: '0198ea37-2b1d-7c8d-9123-123456789abc',
                product_name: 'Test Product',
                quantity: 1,
                unit_price: 100,
                tax_percent: 12
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
        expect(result.current.purchase.total_amount).toBe(112);
        expect(mockError).not.toHaveBeenCalled();
    });
});
