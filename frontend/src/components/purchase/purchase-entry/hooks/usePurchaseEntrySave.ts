/**
 * Purchase Entry submission boundary.
 *
 * A purchase entry spans canonical goods-receipt and supplier-invoice actions.
 * The current form does not collect all required branch, location, UOM, QC,
 * registration, receipt-line, and allocation identities. Fail closed until the
 * reviewed canonical command mapping is complete.
 */

export const PURCHASE_ENTRY_SUBMIT_UNAVAILABLE_REASON =
    'Purchase entry submission is unavailable until canonical goods-receipt and supplier-invoice actions are fully mapped.';

export interface UsePurchaseEntrySaveReturn {
    saving: false;
    handleSavePurchase?: undefined;
    unavailableReason: string;
}

export function getPurchaseEntrySubmissionBoundary(): UsePurchaseEntrySaveReturn {
    return {
        saving: false,
        handleSavePurchase: undefined,
        unavailableReason: PURCHASE_ENTRY_SUBMIT_UNAVAILABLE_REASON
    };
}

export function usePurchaseEntrySave(): UsePurchaseEntrySaveReturn {
    return getPurchaseEntrySubmissionBoundary();
}

export default usePurchaseEntrySave;
