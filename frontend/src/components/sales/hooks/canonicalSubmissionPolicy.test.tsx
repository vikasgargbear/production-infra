import { act, renderHook } from '@testing-library/react';
import { toast } from 'react-toastify';
import {
    CHALLAN_SUBMISSION_UNAVAILABLE,
    useChallanSave,
} from '../challan/hooks/useChallanSave';
import {
    SALES_ORDER_SUBMISSION_UNAVAILABLE,
    useSalesOrderSave,
} from '../order/hooks/useSalesOrderSave';

jest.mock('react-toastify', () => ({ toast: { error: jest.fn() } }));

describe('Sales documents without canonical command mappings', () => {
    beforeEach(() => jest.clearAllMocks());

    it('fails delivery challan submission closed without a success mutation', async () => {
        const setShowSuccessModal = jest.fn();
        const { result } = renderHook(() => useChallanSave({
            setShowSuccessModal,
        } as any));

        expect(result.current.saving).toBe(false);
        expect(result.current.submissionUnavailableReason).toBe(CHALLAN_SUBMISSION_UNAVAILABLE);
        await act(async () => result.current.handleSaveChallan());
        expect(setShowSuccessModal).not.toHaveBeenCalled();
        expect(toast.error).toHaveBeenCalledWith(CHALLAN_SUBMISSION_UNAVAILABLE);
    });

    it('fails sales order submission closed and exposes the reason in page state', async () => {
        const setMessage = jest.fn();
        const setMessageType = jest.fn();
        const setShowSuccessModal = jest.fn();
        const { result } = renderHook(() => useSalesOrderSave({
            setMessage,
            setMessageType,
            setShowSuccessModal,
        } as any));

        expect(result.current.saving).toBe(false);
        expect(result.current.submissionUnavailableReason).toBe(SALES_ORDER_SUBMISSION_UNAVAILABLE);
        await act(async () => result.current.handleSaveOrder());
        expect(setShowSuccessModal).not.toHaveBeenCalled();
        expect(setMessage).toHaveBeenCalledWith(SALES_ORDER_SUBMISSION_UNAVAILABLE);
        expect(setMessageType).toHaveBeenCalledWith('error');
        expect(toast.error).toHaveBeenCalledWith(SALES_ORDER_SUBMISSION_UNAVAILABLE);
    });
});
