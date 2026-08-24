import { act, renderHook, waitFor } from '@testing-library/react';
import { calculateChallanPreview } from '../../../../services/calculations/challanCalculationService';
import { employeesApi } from '../../../../services/api';
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
jest.mock('../../../../services/api', () => ({
    employeesApi: {
        getAll: jest.fn().mockResolvedValue({ data: [] }),
    },
    apiClient: {
        get: jest.fn(),
    },
}));
jest.mock('./useChallanSave', () => ({
    useChallanSave: () => ({
        saving: false,
        submissionUnavailableReason: 'Unavailable in test',
        handleSaveChallan: jest.fn(),
    }),
}));
jest.mock('../../../../services/calculations/challanCalculationService', () => ({
    calculateChallanPreview: jest.fn(),
}));

const mockedPreview = calculateChallanPreview as jest.MockedFunction<
    typeof calculateChallanPreview
>;
const mockedEmployeeGetAll = employeesApi.getAll as jest.MockedFunction<
    typeof employeesApi.getAll
>;

const interstateCustomer = {
    customer_id: '10000000-0000-7000-8000-000000000001',
    customer_name: 'Karnataka Customer',
    address: '1 Bengaluru Road',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560001',
    gst_number: '29ABCDE1234F1Z5',
};

describe('useChallanLogic GST place-of-supply state', () => {
    beforeEach(() => {
        mockedEmployeeGetAll.mockResolvedValue({ data: [] } as Awaited<ReturnType<typeof employeesApi.getAll>>);
        mockedPreview.mockReset();
        mockedPreview.mockResolvedValue({
            items: [{
                taxable_amount: 100,
                total_tax_amount: 12,
                line_total: 112,
            }],
            totals: {
                taxable_amount: 100,
                total_tax_amount: 12,
                final_amount: 112,
            },
            gst_type: 'IGST',
        });
    });

    it('derives IGST for an inter-state UUID customer and resets on clear', async () => {
        const { result } = renderHook(() => useChallanLogic());

        await act(async () => {
            await result.current.handleCustomerSelect(interstateCustomer);
        });

        expect(result.current.challan.customer_id).toBe(interstateCustomer.customer_id);
        expect(result.current.challan.delivery_state).toBe('Karnataka');
        expect(result.current.challan.gst_type).toBe('IGST');

        await act(async () => {
            await result.current.handleCustomerSelect(null);
        });

        expect(result.current.challan.customer_id).toBe('');
        expect(result.current.challan.delivery_state).toBe('');
        expect(result.current.challan.gst_type).toBe('CGST/SGST');
    });

    it('preserves the imported delivery state as IGST in the calculation request', async () => {
        const { result } = renderHook(() => useChallanLogic());

        await act(async () => {
            await result.current.handleImport({
                customer_id: interstateCustomer.customer_id,
                customer_name: interstateCustomer.customer_name,
                customer_details: interstateCustomer,
                delivery_address: '2 Mysuru Road',
                delivery_city: 'Mysuru',
                delivery_state: 'Karnataka',
                delivery_pincode: '570001',
                items: [{
                    id: 'imported-line',
                    product_id: '10000000-0000-7000-8000-000000000002',
                    product_name: 'Carton',
                    quantity: 1,
                    unit_price: 100,
                    gst_percent: 12,
                }],
            });
        });

        await waitFor(() => expect(mockedPreview).toHaveBeenCalled());
        const calculatedChallan = mockedPreview.mock.calls[0][0];
        expect(calculatedChallan.customer_id).toBe(interstateCustomer.customer_id);
        expect(calculatedChallan.delivery_state).toBe('Karnataka');
        expect(calculatedChallan.gst_type).toBe('IGST');
        expect(result.current.challan.gst_type).toBe('IGST');
    });
});
