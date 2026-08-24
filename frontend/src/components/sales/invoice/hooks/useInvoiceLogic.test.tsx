import { act, renderHook, waitFor } from '@testing-library/react';
import { calculateInvoicePreview } from '../../../../services/calculations/invoiceCalculationService';
import type { Customer } from '../../../../types/models/customer';
import { buildCanonicalInvoicePreparePayload } from '../utils/canonicalInvoiceCommand';
import { useInvoiceLogic } from './useInvoiceLogic';

jest.mock('react-toastify', () => ({
    toast: { error: jest.fn(), success: jest.fn() },
}));
jest.mock('../../../../contexts/CompanyContext', () => ({
    useCompany: () => ({
        companyInfo: {
            state: 'Maharashtra',
            gst_number: '27ABCDE1234F1Z5',
        },
    }),
}));
jest.mock('../../../../hooks/useNetworkStatus', () => ({
    useNetworkStatus: () => ({ isOnline: true }),
}));
jest.mock('../../../../services/api', () => ({
    employeesApi: { getAll: jest.fn().mockResolvedValue({ data: [] }) },
}));
jest.mock('../../../../services/calculations/invoiceCalculationService', () => ({
    calculateInvoicePreview: jest.fn(),
}));
jest.mock('./useInvoiceSave', () => ({
    useInvoiceSave: () => ({ saving: false, handleSaveInvoice: jest.fn() }),
}));

const ids = {
    branch: '10000000-0000-7000-8000-000000000001',
    location: '10000000-0000-7000-8000-000000000002',
    customer: '10000000-0000-7000-8000-000000000003',
    product: '10000000-0000-7000-8000-000000000004',
    batch: '10000000-0000-7000-8000-000000000005',
    uom: '10000000-0000-7000-8000-000000000006',
};

const customer = {
    customer_id: ids.customer,
    customer_code: 'C-1',
    customer_name: 'Canonical Customer',
    customer_type: 'retail',
    primary_phone: '9000000000',
    place_of_supply_state_code: '27',
} as Customer;

const selectedProduct = {
    product_id: ids.product,
    product_name: 'Fractional Carton',
    batch_id: ids.batch,
    batch_number: 'BATCH-1',
    branch_id: ids.branch,
    location_id: ids.location,
    uom_conversion_id: ids.uom,
    quantity_available: 20,
    unit_price: 100,
    mrp: 120,
    hsn_code: '481910',
    gst_percent: 18,
};

const mockedPreview = calculateInvoicePreview as jest.MockedFunction<
    typeof calculateInvoicePreview
>;

describe('useInvoiceLogic selected quantity boundary', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedPreview.mockResolvedValue({
            items: [],
            totals: {
                subtotal: 0,
                taxable_amount: 0,
                total_tax: 0,
                final_amount: 0,
            },
            gst_type: 'CGST/SGST',
        } as any);
    });

    it.each([
        {
            label: 'free-only selection',
            billed: 0,
            free: 0.5,
            treatment: 'included_at_unit_rate' as const,
        },
        {
            label: 'fractional billed/free selection',
            billed: 0.375001,
            free: 0.125001,
            treatment: 'excluded_from_taxable_value' as const,
        },
    ])('keeps a $label in draft state but rejects its fractional JS number at the posting boundary', async ({
        billed,
        free,
        treatment,
    }) => {
        const { result } = renderHook(() => useInvoiceLogic());
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        await act(async () => {
            await result.current.handleAddItem({
                ...selectedProduct,
                quantity: billed,
                free_quantity: free,
                free_supply_tax_treatment: treatment,
            });
        });

        expect(result.current.invoice.items[0]).toEqual(expect.objectContaining({
            quantity: billed,
            free_quantity: free,
            free_supply_tax_treatment: treatment,
        }));

        expect(() => buildCanonicalInvoicePreparePayload({
                ...result.current.invoice,
                billing_address: '1 Canonical Customer Road',
                shipping_address: '1 Canonical Customer Road',
                delivery_type: 'PICKUP',
            }, customer, `erp-web-invoice:${billed}:${free}`),
        ).toThrow(/must remain an exact decimal string/i);
    });

    it('adds the exact billed/free selection when the same batch is selected again', async () => {
        const { result } = renderHook(() => useInvoiceLogic());
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        await act(async () => {
            await result.current.handleAddItem({
                ...selectedProduct,
                quantity: 0,
                free_quantity: 0.5,
                free_supply_tax_treatment: 'included_at_unit_rate',
            });
            await result.current.handleAddItem({
                ...selectedProduct,
                quantity: 0.375001,
                free_quantity: 0.125001,
                free_supply_tax_treatment: 'included_at_unit_rate',
            });
        });

        expect(result.current.invoice.items).toHaveLength(1);
        expect(result.current.invoice.items[0]).toEqual(expect.objectContaining({
            quantity: 0.375001,
            free_quantity: 0.625001,
            free_supply_tax_treatment: 'included_at_unit_rate',
        }));
    });

    it('does not let numeric preview output overwrite exact dispatch-import strings', async () => {
        mockedPreview.mockResolvedValue({
            items: [{
                quantity: 1.125, free_quantity: 0.25, unit_price: 84.125,
                discount_percent: 0, base_billed_quantity: 11.25,
                base_free_quantity: 2.5,
            }],
            totals: { subtotal: 94.64, taxable_amount: 94.64, total_tax: 11.36, final_amount: 106 },
            gst_type: 'CGST/SGST',
        } as any);
        const { result } = renderHook(() => useInvoiceLogic());
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        await act(async () => {
            await result.current.handleImport({
                source: 'delivery_challan', customer,
                items: [{
                    product_id: ids.product, product_name: 'Fractional Carton',
                    batch_id: ids.batch, batch_number: 'BATCH-1',
                    branch_id: ids.branch, location_id: ids.location,
                    uom_conversion_id: ids.uom,
                    quantity: '1.125000', free_quantity: '0.250000',
                    base_billed_quantity: '11.250000', base_free_quantity: '2.500000',
                    source_billed_quantity: '1.125000', source_free_quantity: '0.250000',
                    unit_price: '84.1250', sale_price: '84.1250',
                    gst_percent: '12.000000', discount_percent: '0.000000',
                    free_supply_tax_treatment: 'excluded_from_taxable_value',
                }],
            } as any);
        });
        await waitFor(() => expect(mockedPreview).toHaveBeenCalled());
        await waitFor(() => expect(result.current.invoice.items[0]).toEqual(expect.objectContaining({
            quantity: '1.125000', free_quantity: '0.250000', unit_price: '84.1250',
            discount_percent: '0.000000', base_billed_quantity: '11.250000',
            base_free_quantity: '2.500000', source_billed_quantity: '1.125000',
            source_free_quantity: '0.250000',
        })));
    });
});
