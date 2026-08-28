import { act, renderHook, waitFor } from '@testing-library/react';
import {
    calculateSalesOrderPreview,
    isSalesOrderPreviewReady,
} from '../../../../services/calculations/salesOrderCalculationService';
import { apiClient } from '../../../../services/api';
import { useSalesOrderLogic } from './useSalesOrderLogic';

const mockHandleSaveOrder = jest.fn();

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
jest.mock('../../../../services/api', () => ({
    apiClient: { get: jest.fn() },
}));
jest.mock('./useSalesOrderSave', () => ({
    useSalesOrderSave: () => ({
        saving: false,
        submissionUnavailableReason: 'Unavailable in test',
        handleSaveOrder: mockHandleSaveOrder,
    }),
}));
jest.mock('../../../../services/calculations/salesOrderCalculationService', () => ({
    calculateSalesOrderPreview: jest.fn(),
    isSalesOrderPreviewReady: jest.fn(),
}));

const mockedPreview = calculateSalesOrderPreview as jest.MockedFunction<
    typeof calculateSalesOrderPreview
>;
const mockedPreviewReady = isSalesOrderPreviewReady as jest.MockedFunction<
    typeof isSalesOrderPreviewReady
>;
const mockedApiGet = apiClient.get as jest.MockedFunction<typeof apiClient.get>;

describe('useSalesOrderLogic canonical import calculation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockHandleSaveOrder.mockReset();
        mockedApiGet.mockReset();
        mockedPreviewReady.mockImplementation(candidate => (
            Number(candidate.items[0]?.quantity ?? 0) > 0
        ));
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

    it('creates a complete canonical zero-free-quantity line from batch selection', async () => {
        const { result } = renderHook(() => useSalesOrderLogic());

        act(() => result.current.handleProductSelect({
            product_id: '10000000-0000-7000-8000-000000000002',
            product_name: 'Canonical Carton',
            batch_id: '10000000-0000-7000-8000-000000000003',
            batch_number: 'BATCH-1',
            branch_id: '10000000-0000-7000-8000-000000000004',
            location_id: '10000000-0000-7000-8000-000000000005',
            uom_conversion_id: '10000000-0000-7000-8000-000000000006',
            quantity: '1.000000',
            sale_price: '100.0000',
            mrp: '120.0000',
            gst_percent: '12.000000',
        } as any));

        await waitFor(() => expect(mockedPreview).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(result.current.order.gst_type).toBe('CGST/SGST'));
        expect(mockedPreview.mock.calls[0][0].items[0]).toEqual(expect.objectContaining({
            quantity: '1.000000',
            free_quantity: '0.000000',
            free_supply_tax_treatment: 'excluded_from_taxable_value',
        }));
        expect(result.current.order.items[0]).toEqual(expect.objectContaining({
            free_quantity: '0.000000',
            free_supply_tax_treatment: 'excluded_from_taxable_value',
        }));
        expect(result.current.calculationStatus).toBe('authoritative');
        expect(result.current.calculationUnavailableReason).toBe('');
    });

    it('ignores an older calculation that resolves after the current draft', async () => {
        let resolveFirst!: (value: any) => void;
        let resolveSecond!: (value: any) => void;
        mockedPreview
            .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }))
            .mockImplementationOnce(() => new Promise(resolve => { resolveSecond = resolve; }));
        const { result } = renderHook(() => useSalesOrderLogic());

        act(() => result.current.handleProductSelect({
            product_id: '10000000-0000-7000-8000-000000000002',
            product_name: 'Canonical Carton',
            batch_id: '10000000-0000-7000-8000-000000000003',
            batch_number: 'BATCH-1',
            branch_id: '10000000-0000-7000-8000-000000000004',
            location_id: '10000000-0000-7000-8000-000000000005',
            uom_conversion_id: '10000000-0000-7000-8000-000000000006',
            quantity: '1.000000', sale_price: '100.0000', mrp: '120.0000',
            gst_percent: '12.000000',
        } as any));
        await waitFor(() => expect(mockedPreview).toHaveBeenCalledTimes(1));
        expect(result.current.calculationStatus).toBe('pending');

        act(() => result.current.updateItem(0, 'quantity', '2.000000'));
        await waitFor(() => expect(mockedPreview).toHaveBeenCalledTimes(2));
        await act(async () => resolveSecond({
            items: [{ subtotal: '400.00', discount_amount: '0.00', gst_amount: '48.00', total_amount: '448.00', taxable_amount: '400.00' }],
            totals: { subtotal_amount: '400.00', discount_amount: '0.00', total_tax_amount: '48.00', final_amount: '448.00', cgst_amount: '0.00', sgst_amount: '0.00', igst_amount: '48.00' },
            gst_type: 'IGST',
        }));
        await waitFor(() => expect(result.current.calculationStatus).toBe('authoritative'));
        expect(result.current.order.total_amount).toBe('448.00');
        expect(result.current.order.gst_type).toBe('IGST');

        await act(async () => resolveFirst({
            items: [{ subtotal: '100.00', discount_amount: '0.00', gst_amount: '12.00', total_amount: '112.00', taxable_amount: '100.00' }],
            totals: { subtotal_amount: '100.00', discount_amount: '0.00', total_tax_amount: '12.00', final_amount: '112.00', cgst_amount: '6.00', sgst_amount: '6.00', igst_amount: '0.00' },
            gst_type: 'CGST/SGST',
        }));
        expect(result.current.order.total_amount).toBe('448.00');
        expect(result.current.order.gst_type).toBe('IGST');
        expect(result.current.order.items[0].quantity).toBe('2.000000');
    });

    it('refuses immediate posting until the current calculation becomes authoritative', async () => {
        let resolvePreview!: (value: any) => void;
        mockedPreview.mockImplementationOnce(() => new Promise(resolve => { resolvePreview = resolve; }));
        const { result } = renderHook(() => useSalesOrderLogic());

        act(() => result.current.handleProductSelect({
            product_id: '10000000-0000-7000-8000-000000000002',
            product_name: 'Canonical Carton',
            batch_id: '10000000-0000-7000-8000-000000000003',
            batch_number: 'BATCH-1',
            branch_id: '10000000-0000-7000-8000-000000000004',
            location_id: '10000000-0000-7000-8000-000000000005',
            uom_conversion_id: '10000000-0000-7000-8000-000000000006',
            quantity: '1.000000', sale_price: '100.0000', mrp: '120.0000',
            gst_percent: '12.000000',
        } as any));
        await waitFor(() => expect(result.current.calculationStatus).toBe('pending'));

        await act(async () => result.current.saveOrder());
        expect(mockHandleSaveOrder).not.toHaveBeenCalled();
        expect(result.current.message).toMatch(/calculating authoritative tax and totals/i);

        await act(async () => resolvePreview({
            items: [{ subtotal: '200.00', discount_amount: '0.00', gst_amount: '24.00', total_amount: '224.00', taxable_amount: '200.00' }],
            totals: { subtotal_amount: '200.00', discount_amount: '0.00', total_tax_amount: '24.00', final_amount: '224.00', cgst_amount: '12.00', sgst_amount: '12.00', igst_amount: '0.00' },
            gst_type: 'CGST/SGST',
        }));
        await waitFor(() => expect(result.current.calculationStatus).toBe('authoritative'));
        await act(async () => result.current.saveOrder());
        expect(mockHandleSaveOrder).toHaveBeenCalledTimes(1);
    });

    it('surfaces a current calculation failure and keeps posting blocked', async () => {
        mockedPreview.mockRejectedValueOnce(new Error('canonical calculator unavailable'));
        const { result } = renderHook(() => useSalesOrderLogic());
        act(() => result.current.handleProductSelect({
            product_id: '10000000-0000-7000-8000-000000000002',
            product_name: 'Canonical Carton',
            batch_id: '10000000-0000-7000-8000-000000000003',
            batch_number: 'BATCH-1',
            branch_id: '10000000-0000-7000-8000-000000000004',
            location_id: '10000000-0000-7000-8000-000000000005',
            uom_conversion_id: '10000000-0000-7000-8000-000000000006',
            quantity: '1.000000', sale_price: '100.0000', mrp: '120.0000',
            gst_percent: '12.000000',
        } as any));

        await waitFor(() => expect(result.current.calculationStatus).toBe('error'));
        expect(result.current.calculationUnavailableReason).toMatch(
            /canonical calculator unavailable/i,
        );
        expect(result.current.order.gst_type).toBe('');
        expect(result.current.order.total_amount).toBe(0);
        await act(async () => result.current.saveOrder());
        expect(mockHandleSaveOrder).not.toHaveBeenCalled();
    });

    it('replaces raw address network errors and clears them after a successful retry', async () => {
        const { result } = renderHook(() => useSalesOrderLogic());
        const customer = {
            customer_id: '10000000-0000-7000-8000-000000000001',
            customer_name: 'Canonical Customer',
        } as any;

        mockedApiGet.mockRejectedValueOnce(new Error('Network Error'));
        await act(async () => {
            await result.current.handleCustomerSelect(customer);
        });

        expect(result.current.message).toBe(
            'Could not load this customer’s saved addresses. Check your connection and select the customer again.',
        );
        expect(result.current.message).not.toContain('Network Error');
        expect(result.current.order.shipping_address_data).toBeNull();

        mockedApiGet.mockResolvedValueOnce({
            data: {
                success: true,
                data: [{
                    address_id: '10000000-0000-7000-8000-000000000002',
                    row_version: '1',
                    address_type: 'billing',
                    is_default: true,
                    address_line1: '1 Canonical Road',
                    address_line2: '',
                    city: 'Mumbai',
                    state_code: '27',
                    pincode: '400001',
                    country_code: 'IN',
                }],
            },
        } as any);
        await act(async () => {
            await result.current.handleCustomerSelect(customer);
        });

        expect(result.current.message).toBe('');
        expect(result.current.order.shipping_address_data).toEqual(expect.objectContaining({
            address_id: '10000000-0000-7000-8000-000000000002',
            row_version: '1',
            state_code: '27',
        }));
    });

    it('keeps a zero billed-quantity edit local and clears stale preview values', async () => {
        const { result } = renderHook(() => useSalesOrderLogic());

        act(() => result.current.handleProductSelect({
            product_id: '10000000-0000-7000-8000-000000000002',
            product_name: 'Canonical Carton',
            batch_id: '10000000-0000-7000-8000-000000000003',
            batch_number: 'BATCH-1',
            branch_id: '10000000-0000-7000-8000-000000000004',
            location_id: '10000000-0000-7000-8000-000000000005',
            uom_conversion_id: '10000000-0000-7000-8000-000000000006',
            quantity: '1.000000',
            sale_price: '100.0000',
            mrp: '120.0000',
            gst_percent: '12.000000',
        } as any));

        await waitFor(() => expect(result.current.order.total_amount).toBe(224));
        mockedPreview.mockClear();

        act(() => result.current.updateItem(0, 'quantity', 0));

        await waitFor(() => expect(result.current.order.total_amount).toBe(0));
        expect(result.current.order.gst_type).toBe('');
        expect(mockedPreview).not.toHaveBeenCalled();
        expect(result.current.order.items[0]).toEqual(expect.objectContaining({
            quantity: 0,
            subtotal: 0,
            tax_amount: 0,
            total: 0,
            calculated_total: 0,
            taxable_amount: 0,
        }));
        expect(result.current.order.calculatedLineItems).toEqual([]);

        act(() => result.current.updateItem(0, 'quantity', 2));

        await waitFor(() => expect(mockedPreview).toHaveBeenCalledTimes(1));
        expect(mockedPreview.mock.calls[0][0].items[0].quantity).toBe(2);
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
