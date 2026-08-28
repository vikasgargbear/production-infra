/** Purchase Return canonical prepare boundary. */

import { buildPurchaseReturnPreparePayload } from '../utils/canonicalReturnCommand';

export const PURCHASE_RETURN_SUBMIT_UNAVAILABLE_REASON =
    'Purchase return submission is unavailable until original supplier-invoice, goods-receipt line, batch allocation, and GST treatment identities are canonically mapped.';

export interface UsePurchaseReturnSaveReturn {
    canPrepare: boolean;
    unavailableReason: string;
}

export function getPurchaseReturnSubmissionBoundary(returnData: Record<string, unknown>): UsePurchaseReturnSaveReturn {
    try {
        buildPurchaseReturnPreparePayload(
            returnData,
            'erp-web-purchase-return-prepare:boundary-probe',
        );
        return { canPrepare: true, unavailableReason: '' };
    } catch (error) {
        return {
            canPrepare: false,
            unavailableReason: error instanceof Error
                ? `Canonical purchase return is blocked: ${error.message}`
                : PURCHASE_RETURN_SUBMIT_UNAVAILABLE_REASON,
        };
    }
}

export function usePurchaseReturnSave(returnData: Record<string, unknown>): UsePurchaseReturnSaveReturn {
    return getPurchaseReturnSubmissionBoundary(returnData);
}

export default usePurchaseReturnSave;
