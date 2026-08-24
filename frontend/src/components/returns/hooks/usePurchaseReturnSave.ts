/** Purchase Return canonical submission boundary. */

export const PURCHASE_RETURN_SUBMIT_UNAVAILABLE_REASON =
    'Purchase return submission is unavailable until original supplier-invoice, goods-receipt line, batch allocation, and GST treatment identities are canonically mapped.';

export interface UsePurchaseReturnSaveReturn {
    saving: false;
    handleSaveReturn?: undefined;
    unavailableReason: string;
}

export function getPurchaseReturnSubmissionBoundary(): UsePurchaseReturnSaveReturn {
    return {
        saving: false,
        handleSaveReturn: undefined,
        unavailableReason: PURCHASE_RETURN_SUBMIT_UNAVAILABLE_REASON
    };
}

export function usePurchaseReturnSave(): UsePurchaseReturnSaveReturn {
    return getPurchaseReturnSubmissionBoundary();
}

export default usePurchaseReturnSave;
