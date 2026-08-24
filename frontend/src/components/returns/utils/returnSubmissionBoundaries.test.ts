import { getPurchaseReturnSubmissionBoundary } from '../hooks/usePurchaseReturnSave';
import { getSalesReturnSubmissionBoundary } from './returnSubmissionBoundaries';

describe('return submission boundaries', () => {
    it('omits the sales-return write handler until its canonical identities are mapped', () => {
        const boundary = getSalesReturnSubmissionBoundary();

        expect(boundary.saving).toBe(false);
        expect(boundary.handleSaveReturn).toBeUndefined();
        expect(boundary.unavailableReason).toContain('dispatch allocation');
    });

    it('omits the purchase-return write handler until its canonical identities are mapped', () => {
        const boundary = getPurchaseReturnSubmissionBoundary();

        expect(boundary.saving).toBe(false);
        expect(boundary.handleSaveReturn).toBeUndefined();
        expect(boundary.unavailableReason).toContain('goods-receipt line');
    });
});
