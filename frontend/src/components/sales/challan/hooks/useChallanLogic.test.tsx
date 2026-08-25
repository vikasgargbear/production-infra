import { act, renderHook, waitFor } from '@testing-library/react';
import { apiClient, employeesApi } from '../../../../services/api';
import { useChallanLogic } from './useChallanLogic';

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
    useCanonicalBusinessDate: () => ({
        businessDate: '2026-08-25',
        organizationTimezone: 'Asia/Kolkata',
        loading: false,
        error: '',
    }),
}));
jest.mock('../../../../services/api', () => ({
    employeesApi: { getAll: jest.fn().mockResolvedValue({ data: [] }) },
    apiClient: { get: jest.fn() },
}));
jest.mock('./useChallanSave', () => ({
    useChallanSave: () => ({
        saving: false,
        submissionUnavailableReason: 'Unavailable in test',
        preparedPreview: null,
        reviewOpen: false,
        handleSaveChallan: jest.fn(),
        confirmPreparedChallan: jest.fn(),
        closeChallanReview: jest.fn(),
    }),
}));

const mockedEmployeeGetAll = employeesApi.getAll as jest.MockedFunction<typeof employeesApi.getAll>;
const mockedApiGet = apiClient.get as jest.MockedFunction<typeof apiClient.get>;

const interstateCustomer = {
    customer_id: '10000000-0000-7000-8000-000000000001',
    customer_name: 'Karnataka Customer',
    address: '1 Bengaluru Road',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560001',
    gst_number: '29ABCDE1234F1Z5',
};

describe('useChallanLogic canonical draft boundaries', () => {
    beforeEach(() => {
        mockedEmployeeGetAll.mockResolvedValue({ data: [] } as Awaited<ReturnType<typeof employeesApi.getAll>>);
        mockedApiGet.mockResolvedValue({ data: { success: true, data: [] } } as any);
    });

    it('uses the organization business date without inventing an expected delivery date', async () => {
        const { result } = renderHook(() => useChallanLogic());
        await waitFor(() => expect(result.current.challan.challan_date).toBe('2026-08-25'));
        expect(result.current.challan.expected_delivery_date).toBe('');
    });

    it('preserves customer identity and clears it explicitly', async () => {
        const { result } = renderHook(() => useChallanLogic());

        await act(async () => {
            await result.current.handleCustomerSelect(interstateCustomer);
        });
        expect(result.current.challan.customer_id).toBe(interstateCustomer.customer_id);
        expect(result.current.challan.customer_name).toBe(interstateCustomer.customer_name);

        await act(async () => {
            await result.current.handleCustomerSelect(null);
        });
        expect(result.current.challan.customer_id).toBe('');
        expect(result.current.challan.customer_name).toBe('');
    });

    it('imports exact order quantities without invoking a separate monetary calculation', async () => {
        const { result } = renderHook(() => useChallanLogic());
        await act(async () => {
            await result.current.handleImport({
                source_order_id: '10000000-0000-7000-8000-000000000009',
                customer_id: interstateCustomer.customer_id,
                customer_name: interstateCustomer.customer_name,
                customer_details: interstateCustomer,
                items: [{
                    id: '10000000-0000-7000-8000-000000000002',
                    source_order_line_id: '10000000-0000-7000-8000-000000000002',
                    product_id: '10000000-0000-7000-8000-000000000003',
                    product_name: 'Carton',
                    branch_id: '10000000-0000-7000-8000-000000000004',
                    location_id: '10000000-0000-7000-8000-000000000005',
                    batch_id: '10000000-0000-7000-8000-000000000006',
                    batch_number: 'BATCH-1',
                    uom_conversion_id: '10000000-0000-7000-8000-000000000007',
                    uom_code: 'EA',
                    quantity: '2.000000',
                    free_quantity: '1.000000',
                    unit_price: '50.0000',
                    gst_percent: '12.000000',
                    discount_percent: '0.000000',
                    free_supply_tax_treatment: 'included_at_unit_rate',
                } as any],
            });
        });
        expect(result.current.challan.source_order_id).toBe('10000000-0000-7000-8000-000000000009');
        expect(result.current.challan.items[0]).toEqual(expect.objectContaining({
            quantity: '2.000000',
            free_quantity: '1.000000',
            source_order_line_id: '10000000-0000-7000-8000-000000000002',
        }));
    });
});
