import { getPurchaseReturnSubmissionBoundary } from '../hooks/usePurchaseReturnSave';
import { getSalesReturnSubmissionBoundary } from './returnSubmissionBoundaries';

describe('return submission boundaries', () => {
    it('blocks sales-return prepare until its canonical identities are mapped', () => {
        const boundary = getSalesReturnSubmissionBoundary({});

        expect(boundary.canPrepare).toBe(false);
        expect(boundary.unavailableReason).toContain('Canonical sales return is blocked');
        expect(boundary.unavailableReason).toContain('GST treatment');
    });

    it('blocks purchase-return prepare until its canonical identities are mapped', () => {
        const boundary = getPurchaseReturnSubmissionBoundary({});

        expect(boundary.canPrepare).toBe(false);
        expect(boundary.unavailableReason).toContain('Canonical purchase return is blocked');
        expect(boundary.unavailableReason).toContain('GST treatment');
    });
});
