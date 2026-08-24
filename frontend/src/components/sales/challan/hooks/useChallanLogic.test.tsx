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
jest.mock('../../../../hooks/useCanonicalBusinessDate', () => ({
    useCanonicalBusinessDate: () => ({ businessDate: '2026-08-25', organizationTimezone: 'Asia/Kolkata', loading: false, error: '' }),
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
        mockedPreview.mockImplementation(async challan => ({
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
            gst_type: challan.gst_type,
        }));
    });

    it('initializes dispatch dates from the organization business date', async () => {
        const { result } = renderHook(() => useChallanLogic());
        await waitFor(() => expect(result.current.challan.challan_date).toBe('2026-08-25'));
        expect(result.current.challan.expected_delivery_date).toBe('2026-08-26');
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

    it('re-derives the next preview after delivery-address save and same-as-billing mutations', async () => {
        const { result } = renderHook(() => useChallanLogic());
        const maharashtraCustomer = {
            ...interstateCustomer,
            customer_name: 'Maharashtra Customer',
            address: '1 Mumbai Road',
            city: 'Mumbai',
            state: 'Maharashtra',
            pincode: '400001',
            gst_number: '27ABCDE1234F1Z5',
        };

        await act(async () => {
            await result.current.handleImport({
                customer_id: maharashtraCustomer.customer_id,
                customer_name: maharashtraCustomer.customer_name,
                customer_details: maharashtraCustomer,
                delivery_address: maharashtraCustomer.address,
                delivery_city: maharashtraCustomer.city,
                delivery_state: maharashtraCustomer.state,
                delivery_pincode: maharashtraCustomer.pincode,
                items: [{
                    id: 'saved-address-line',
                    product_id: '10000000-0000-7000-8000-000000000002',
                    product_name: 'Carton',
                    quantity: 1,
                    unit_price: 100,
                    gst_percent: 12,
                }],
            });
        });
        await waitFor(() => expect(mockedPreview).toHaveBeenCalled());

        mockedPreview.mockClear();
        act(() => {
            // Mirrors AddressForm.onSave in ChallanPreviewStep.
            result.current.setSameAsBilling(false);
            result.current.setChallan(previous => ({
                ...previous,
                delivery_address: '2 Bengaluru Road',
                delivery_city: 'Bengaluru',
                delivery_state: 'Karnataka',
                delivery_pincode: '560001',
            }));
        });

        await waitFor(() => expect(mockedPreview).toHaveBeenCalledWith(
            expect.objectContaining({
                delivery_state: 'Karnataka',
                gst_type: 'IGST',
            }),
            true
        ));

        mockedPreview.mockClear();
        act(() => {
            // Mirrors AddressForm.onSameAsBillingChange in ChallanPreviewStep.
            result.current.setSameAsBilling(true);
            result.current.setChallan(previous => ({
                ...previous,
                delivery_address: maharashtraCustomer.address,
                delivery_city: maharashtraCustomer.city,
                delivery_state: maharashtraCustomer.state,
                delivery_pincode: maharashtraCustomer.pincode,
            }));
        });

        await waitFor(() => expect(mockedPreview).toHaveBeenCalledWith(
            expect.objectContaining({
                delivery_state: 'Maharashtra',
                gst_type: 'CGST/SGST',
            }),
            true
        ));
    });
});
