import { batchDisabledReason } from './batchEligibility';

describe('canonical batch eligibility', () => {
    it('allows only released, unexpired batches with stock', () => {
        expect(batchDisabledReason({
            batch_status: 'released',
            quantity_available: 10,
            days_to_expiry: 90,
        })).toBeNull();
    });

    it.each([
        ['blocked', 'Blocked by inventory or quality control'],
        ['quarantined', 'Not saleable while batch status is quarantined'],
        ['draft', 'Not saleable while batch status is draft'],
        [null, 'Batch release status is unavailable'],
    ])('keeps %s lifecycle stock disabled with an explicit reason', (status, reason) => {
        expect(batchDisabledReason({
            batch_status: status,
            quantity_available: 10,
            days_to_expiry: 90,
        })).toBe(reason);
    });

    it('blocks expired and empty released batches', () => {
        expect(batchDisabledReason({
            batch_status: 'released', quantity_available: 10, days_to_expiry: 0,
        })).toBe('Expired batch cannot be sold');
        expect(batchDisabledReason({
            batch_status: 'released', quantity_available: 0, days_to_expiry: 90,
        })).toBe('No saleable stock is available');
    });
});
