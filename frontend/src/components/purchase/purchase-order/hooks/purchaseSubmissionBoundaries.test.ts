import { getPurchaseEntrySubmissionBoundary } from '../../purchase-entry/hooks/usePurchaseEntrySave';
import { getPurchaseOrderSubmissionBoundary } from './usePurchaseOrderSave';

describe('purchase submission boundaries', () => {
    it('fails closed for purchase entries without exposing a legacy save handler', () => {
        const boundary = getPurchaseEntrySubmissionBoundary();

        expect(boundary.saving).toBe(false);
        expect(boundary.handleSavePurchase).toBeUndefined();
        expect(boundary.unavailableReason).toContain('canonical goods-receipt');
    });

    it('fails closed for purchase orders without exposing a legacy save handler', () => {
        const boundary = getPurchaseOrderSubmissionBoundary();

        expect(boundary.saving).toBe(false);
        expect(boundary.handleSavePurchaseOrder).toBeUndefined();
        expect(boundary.unavailableReason).toContain('canonical branch');
    });
});
