/**
 * Purchase Order submission boundary.
 *
 * The current form does not collect the explicit canonical branch and product
 * UOM-conversion UUIDs required by procurement.purchase_order.prepare. Fail
 * closed instead of calling the legacy endpoint or persisting a local queue.
 */

export const PURCHASE_ORDER_SUBMIT_UNAVAILABLE_REASON =
    'Purchase order submission is unavailable until canonical branch and product UOM identities are mapped.';

export interface UsePurchaseOrderSaveReturn {
    saving: false;
    handleSavePurchaseOrder?: undefined;
    unavailableReason: string;
}

export function getPurchaseOrderSubmissionBoundary(): UsePurchaseOrderSaveReturn {
    return {
        saving: false,
        handleSavePurchaseOrder: undefined,
        unavailableReason: PURCHASE_ORDER_SUBMIT_UNAVAILABLE_REASON
    };
}

export function usePurchaseOrderSave(): UsePurchaseOrderSaveReturn {
    return getPurchaseOrderSubmissionBoundary();
}

export default usePurchaseOrderSave;
