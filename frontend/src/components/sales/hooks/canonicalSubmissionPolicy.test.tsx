import { act, renderHook } from '@testing-library/react';
import { challansApi } from '../../../services/api/modules/sales/challans.api';
import { ordersApi } from '../../../services/api/modules/sales/orders.api';
import { useChallanSave } from '../challan/hooks/useChallanSave';
import { useSalesOrderSave } from '../order/hooks/useSalesOrderSave';

jest.mock('react-toastify', () => ({ toast: { error: jest.fn() } }));
jest.mock('../../../utils/clientUuid', () => ({ clientUuid: () => '10000000-0000-4000-8000-000000000099' }));
jest.mock('../../../services/api/modules/sales/orders.api', () => ({
    ordersApi: { prepareCanonical: jest.fn(), executePreparedCanonical: jest.fn(), getCanonical: jest.fn() },
}));
jest.mock('../../../services/api/modules/sales/challans.api', () => ({
    challansApi: { prepareCanonical: jest.fn(), executePreparedCanonical: jest.fn(), getCanonical: jest.fn() },
}));
jest.mock('../utils/canonicalSalesChainCommand', () => ({
    buildCanonicalSalesOrderCommand: (_order: unknown, idempotencyKey: string) => ({ idempotency_key: idempotencyKey, lines: [] }),
    buildCanonicalSalesDispatchCommand: (_challan: unknown, idempotencyKey: string) => ({ idempotency_key: idempotencyKey, lines: [] }),
}));

const preview = {
    command_request_id: '10000000-0000-4000-8000-000000000001',
    preview_hash: `sha256:${'a'.repeat(64)}`,
};

describe('reviewed canonical sales-document lifecycles', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (ordersApi.prepareCanonical as jest.Mock).mockResolvedValue({ data: preview });
        (ordersApi.executePreparedCanonical as jest.Mock).mockResolvedValue({ data: { resource_id: '10000000-0000-4000-8000-000000000002' } });
        (ordersApi.getCanonical as jest.Mock).mockResolvedValue({ data: {
            sales_order_id: '10000000-0000-4000-8000-000000000002', order_number: 'SO-1', customer_name: 'Customer', total_amount: '168.00',
        } });
        (challansApi.prepareCanonical as jest.Mock).mockResolvedValue({ data: preview });
        (challansApi.executePreparedCanonical as jest.Mock).mockResolvedValue({ data: { resource_id: '10000000-0000-4000-8000-000000000003' } });
        (challansApi.getCanonical as jest.Mock).mockResolvedValue({ data: {
            dispatch_id: '10000000-0000-4000-8000-000000000003', challan_number: 'DC-1', customer_name: 'Customer', items: [], total_amount: '168.00',
        } });
    });

    it('keeps order Back read-only and reopens the unchanged immutable preview', async () => {
        const props = {
            order: {}, selectedCustomer: { customer_id: 'customer' }, isOnline: true,
            setCreatedOrderData: jest.fn(), setShowSuccessModal: jest.fn(),
            setMessage: jest.fn(), setMessageType: jest.fn(), setOrder: jest.fn(),
        } as any;
        const { result } = renderHook(() => useSalesOrderSave(props));
        await act(async () => result.current.handleSaveOrder());
        act(() => result.current.closeOrderReview());
        await act(async () => result.current.handleSaveOrder());
        expect(ordersApi.prepareCanonical).toHaveBeenCalledTimes(1);
        expect(ordersApi.executePreparedCanonical).not.toHaveBeenCalled();
        await act(async () => result.current.confirmPreparedOrder());
        expect(ordersApi.executePreparedCanonical).toHaveBeenCalledWith(preview, '10000000-0000-4000-8000-000000000099');
        expect(props.setShowSuccessModal).toHaveBeenCalledWith(true);
    });

    it('retries dispatch response loss with the same command/lifecycle and no duplicate prepare', async () => {
        (challansApi.executePreparedCanonical as jest.Mock)
            .mockRejectedValueOnce(new Error('response lost after POST'))
            .mockResolvedValueOnce({ data: { resource_id: '10000000-0000-4000-8000-000000000003' } });
        const props = {
            challan: { items: [], total_amount: '168.00' },
            selectedCustomer: { customer_id: 'customer', customer_name: 'Customer' },
            isOnline: true, setCreatedChallanData: jest.fn(), setShowSuccessModal: jest.fn(),
            setChallan: jest.fn(), companyInfo: {}, generateChallanNumber: jest.fn(),
        } as any;
        const { result } = renderHook(() => useChallanSave(props));
        await act(async () => result.current.handleSaveChallan());
        await act(async () => result.current.confirmPreparedChallan());
        await act(async () => result.current.confirmPreparedChallan());
        expect(challansApi.prepareCanonical).toHaveBeenCalledTimes(1);
        expect(challansApi.executePreparedCanonical).toHaveBeenCalledTimes(2);
        expect((challansApi.executePreparedCanonical as jest.Mock).mock.calls[0])
            .toEqual((challansApi.executePreparedCanonical as jest.Mock).mock.calls[1]);
        expect(props.setShowSuccessModal).toHaveBeenCalledWith(true);
    });
});
