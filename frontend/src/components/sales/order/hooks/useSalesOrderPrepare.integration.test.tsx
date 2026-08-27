import { act, renderHook, waitFor } from '@testing-library/react';

import { apiClient } from '../../../../services/api';
import { ordersApi } from '../../../../services/api/modules/sales/orders.api';
import {
    calculateSalesOrderPreview,
    isSalesOrderPreviewReady,
} from '../../../../services/calculations/salesOrderCalculationService';
import { useSalesOrderLogic } from './useSalesOrderLogic';

jest.mock('react-toastify', () => ({
    toast: { error: jest.fn(), info: jest.fn(), warning: jest.fn() },
}));
jest.mock('../../../../contexts/CompanyContext', () => ({
    useCompany: () => ({ companyInfo: { name: 'Test company' } }),
}));

const policy = {
    allowed_rounding_policies: ['none'],
    default_rounding_policy: 'none',
    allowed_zero_rated_payment_modes: ['not_applicable', 'with_igst'],
    default_zero_rated_payment_mode: 'not_applicable',
    allowed_tax_charge_mechanisms: ['normal'],
    default_tax_charge_mechanism: 'normal',
    allowed_price_bases: ['tax_exclusive'],
    default_price_basis: 'tax_exclusive',
    logistics_modes: [{
        transport_mode: 'in_person',
        display_name: 'In person',
        requires_transporter_party: false,
        requires_vehicle: false,
        requires_transport_document: false,
    }],
    default_transport_mode: 'in_person',
} as const;

jest.mock('../../../../hooks/useCanonicalBusinessDate', () => ({
    useCanonicalBusinessDate: () => ({
        businessDate: '2026-08-28',
        organizationTimezone: 'Asia/Kolkata',
        documentPolicy: policy,
        loading: false,
        error: '',
    }),
}));
jest.mock('../../../../services/calculations/salesOrderCalculationService', () => ({
    calculateSalesOrderPreview: jest.fn(),
    isSalesOrderPreviewReady: jest.fn(),
}));
jest.mock('../../../../services/api/modules/sales/orders.api', () => ({
    ordersApi: {
        prepareCanonical: jest.fn(),
        executePreparedCanonical: jest.fn(),
        getCanonical: jest.fn(),
    },
}));

const ids = {
    address: '10000000-0000-7000-8000-000000000001',
    branch: '10000000-0000-7000-8000-000000000002',
    customer: '10000000-0000-7000-8000-000000000003',
    product: '10000000-0000-7000-8000-000000000004',
    uom: '10000000-0000-7000-8000-000000000005',
    batch: '10000000-0000-7000-8000-000000000006',
    location: '10000000-0000-7000-8000-000000000007',
};

test('the visible sales-order handlers calculate and then prepare the exact current draft', async () => {
    jest.spyOn(apiClient, 'get').mockResolvedValue({
        data: {
            success: true,
            data: [{
                address_id: ids.address,
                row_version: '1',
                address_type: 'billing',
                is_default: true,
                address_line1: 'Test street',
                city: 'Mumbai',
                state_code: '27',
                pincode: '400001',
                country_code: 'IN',
            }],
        },
    } as any);
    (isSalesOrderPreviewReady as jest.Mock).mockReturnValue(true);
    (calculateSalesOrderPreview as jest.Mock).mockResolvedValue({
        items: [{
            subtotal: '168.25', discount_amount: '0.00', gst_amount: '20.19',
            total_amount: '188.44', taxable_amount: '168.25',
        }],
        totals: {
            subtotal_amount: '168.25', discount_amount: '0.00',
            total_tax_amount: '20.19', final_amount: '188.44',
            cgst_amount: '10.10', sgst_amount: '10.09', igst_amount: '0.00',
        },
        gst_type: 'CGST/SGST',
    });
    (ordersApi.prepareCanonical as jest.Mock).mockResolvedValue({
        data: {
            command_request_id: '10000000-0000-7000-8000-000000000008',
            preview_hash: `sha256:${'a'.repeat(64)}`,
        },
    });

    const { result } = renderHook(() => useSalesOrderLogic());
    await waitFor(() => expect(result.current.order.order_date).toBe('2026-08-28'));
    await act(async () => result.current.handleCustomerSelect({
        customer_id: ids.customer,
        customer_name: 'Canonical Customer',
    } as any));
    act(() => result.current.setOrder(previous => ({
        ...previous,
        expected_delivery_date: '2026-08-30',
    })));
    act(() => result.current.handleProductSelect({
        product_id: ids.product,
        product_name: 'Canonical Product',
        product_code: 'PROD-1',
        hsn_code: '300490',
        batch_id: ids.batch,
        batch_number: 'BATCH-1',
        branch_id: ids.branch,
        location_id: ids.location,
        uom_conversion_id: ids.uom,
        quantity: '1.000000',
        sale_price: '100.0000',
        mrp: '120.0000',
        gst_percent: '12.000000',
        uom: 'EA',
    } as any));
    await waitFor(() => expect(result.current.order.items).toHaveLength(1));
    act(() => result.current.updateItem(0, 'quantity', '2.000000'));
    await waitFor(() => expect(result.current.order.items[0].quantity).toBe('2.000000'));
    act(() => result.current.updateItem(0, 'unit_price', '84.1250'));
    await waitFor(() => expect(result.current.order.total_amount).toBe('188.44'));

    await act(async () => result.current.saveOrder());

    expect(ordersApi.prepareCanonical).toHaveBeenCalledTimes(1);
});
