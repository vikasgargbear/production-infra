import { act, renderHook, waitFor } from '@testing-library/react';
import { calculateSalesOrderPreview } from '../../../../services/calculations/salesOrderCalculationService';
import { useSalesOrderLogic } from './useSalesOrderLogic';

jest.mock('react-toastify', () => ({
    toast: { error: jest.fn(), warning: jest.fn() },
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
jest.mock('../../../../hooks/useCanonicalBusinessDate', () => ({
    useCanonicalBusinessDate: () => ({ businessDate: '2026-08-25', organizationTimezone: 'Asia/Kolkata', loading: false, error: '' }),
}));
jest.mock('./useSalesOrderSave', () => ({
    useSalesOrderSave: () => ({
        saving: false,
        submissionUnavailableReason: 'Unavailable in test',
        handleSaveOrder: jest.fn(),
    }),
}));
jest.mock('../../../../services/calculations/salesOrderCalculationService', () => ({
    calculateSalesOrderPreview: jest.fn(),
}));

const mockedPreview = calculateSalesOrderPreview as jest.MockedFunction<
    typeof calculateSalesOrderPreview
>;

describe('useSalesOrderLogic canonical import calculation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedPreview.mockResolvedValue({
            items: [{
                taxable_amount: 200,
                tax_amount: 24,
                gst_amount: 24,
                total_amount: 224,
                line_total: 224,
            }],
            totals: {
                subtotal_amount: 200,
                total_tax_amount: 24,
                final_amount: 224,
            },
            gst_type: 'CGST/SGST',
        });
    });

    it('initializes order and delivery dates from the organization business date', async () => {
        const { result } = renderHook(() => useSalesOrderLogic());
        await waitFor(() => expect(result.current.order.order_date).toBe('2026-08-25'));
        expect(result.current.order.expected_delivery_date).toBe('');
    });

    it('calculates an import from its committed customer UUID and preserves lineage', async () => {
        const { result } = renderHook(() => useSalesOrderLogic());
        const customerId = '10000000-0000-7000-8000-000000000001';
        const productId = '10000000-0000-7000-8000-000000000002';

        act(() => result.current.handleImport({
            source_type: 'invoice',
            source_id: '10000000-0000-7000-8000-000000000003',
            customer_id: customerId,
            customer_name: 'Canonical Customer',
            customer_details: {
                customer_id: customerId,
                customer_name: 'Canonical Customer',
                state: 'Maharashtra',
            },
            items: [{
                product_id: productId,
                product_name: 'Carton',
                batch_id: '10000000-0000-7000-8000-000000000004',
                batch_number: 'BATCH-1',
                expiry_date: null,
                quantity: 1,
                free_quantity: 1,
                unit_price: 100,
                sale_price: 100,
                gst_percent: 12,
                discount_percent: 0,
                free_supply_tax_treatment: 'included_at_unit_rate',
                source_line_id: '10000000-0000-7000-8000-000000000005',
                source_allocation_kind: 'direct_issue',
                allocation_id: '10000000-0000-7000-8000-000000000006',
                command_request_id: '10000000-0000-7000-8000-000000000007',
                inventory_document_id: '10000000-0000-7000-8000-000000000008',
                inventory_document_line_id: '10000000-0000-7000-8000-000000000006',
            }],
        }));

        await waitFor(() => expect(mockedPreview).toHaveBeenCalledTimes(1));
        const calculatedOrder = mockedPreview.mock.calls[0][0];
        expect(calculatedOrder.customer_id).toBe(customerId);
        expect(calculatedOrder.customer_id).not.toBe('0');
        expect(calculatedOrder.items[0]).toEqual(expect.objectContaining({
            product_id: productId,
            free_quantity: 1,
            free_supply_tax_treatment: 'included_at_unit_rate',
            command_request_id: '10000000-0000-7000-8000-000000000007',
            inventory_document_line_id: '10000000-0000-7000-8000-000000000006',
            expiry_date: null,
        }));
        await waitFor(() => expect(result.current.order.total_amount).toBe(224));
        expect(result.current.order.customer_id).toBe(customerId);
        expect(result.current.order.items[0]).toEqual(expect.objectContaining({
            command_request_id: '10000000-0000-7000-8000-000000000007',
            free_supply_tax_treatment: 'included_at_unit_rate',
        }));
    });
});
