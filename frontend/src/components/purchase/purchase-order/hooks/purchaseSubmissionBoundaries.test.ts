import { getPurchaseEntrySubmissionBoundary } from '../../purchase-entry/hooks/usePurchaseEntrySave';
import { getPurchaseOrderSubmissionBoundary } from './usePurchaseOrderSave';

describe('purchase submission boundaries', () => {
    it('fails closed for purchase entries without exposing a legacy save handler', () => {
        const boundary = getPurchaseEntrySubmissionBoundary();

        expect(boundary.saving).toBe(false);
        expect(boundary.handleSavePurchase).toBeUndefined();
        expect(boundary.unavailableReason).toContain('canonical goods-receipt');
    });

    it('routes purchase orders only through the canonical confirmed command', () => {
        const boundary = getPurchaseOrderSubmissionBoundary();

        expect(boundary).toEqual({
            operationKey: 'procurement.purchase_order.prepare',
            legacyEndpointAllowed: false,
            requiresActorConfirmation: true,
        });
    });
});
