/** Fail-closed sales-order submission until a canonical command exists. */

import { useCallback } from 'react';
import { toast } from 'react-toastify';
import type { Order, CreatedOrderData } from '../../../../types/models';

export const SALES_ORDER_SUBMISSION_UNAVAILABLE =
    'Sales Order submission is temporarily unavailable while the canonical API command is being completed. Nothing was saved or queued.';

export interface UseSalesOrderSaveProps {
    order: Order;
    selectedCustomer: unknown;
    isOnline: boolean;
    setOrder: React.Dispatch<React.SetStateAction<Order>>;
    setCreatedOrderData: React.Dispatch<React.SetStateAction<CreatedOrderData | null>>;
    setShowSuccessModal: React.Dispatch<React.SetStateAction<boolean>>;
    setMessage: (msg: string) => void;
    setMessageType: (type: string) => void;
}

export interface UseSalesOrderSaveReturn {
    saving: boolean;
    submissionUnavailableReason: string;
    handleSaveOrder: () => Promise<void>;
}

export function useSalesOrderSave(props: UseSalesOrderSaveProps): UseSalesOrderSaveReturn {
    const { setMessage, setMessageType } = props;
    const handleSaveOrder = useCallback(async () => {
        setMessage(SALES_ORDER_SUBMISSION_UNAVAILABLE);
        setMessageType('error');
        toast.error(SALES_ORDER_SUBMISSION_UNAVAILABLE);
    }, [setMessage, setMessageType]);

    return {
        saving: false,
        submissionUnavailableReason: SALES_ORDER_SUBMISSION_UNAVAILABLE,
        handleSaveOrder,
    };
}

export default useSalesOrderSave;
