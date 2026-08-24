import {
    batchDisabledReason,
    batchSelectionDisabledReason,
    compareBatchesByCanonicalFefo,
} from './batchEligibility';

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

    it('sorts by exact expiry and then UUID, matching canonical resolution order', () => {
        const rows = [
            { batch_id: 'b', expiry_date: '2028-09-01', quantity_available: 1 },
            { batch_id: 'c', expiry_date: '2028-10-01', quantity_available: 1 },
            { batch_id: 'a', expiry_date: '2028-09-01', quantity_available: 1 },
        ];

        expect([...rows].sort(compareBatchesByCanonicalFefo).map(row => row.batch_id))
            .toEqual(['a', 'b', 'c']);
    });

    it('allows the earliest expiry tier and blocks later expiry at the same location', () => {
        const earliest = {
            batch_id: 'a', batch_number: 'EARLY', batch_status: 'released',
            expiry_date: '2028-09-01', location_id: 'location-a',
            quantity_available: 5, days_to_expiry: 365,
        };
        const samePriority = { ...earliest, batch_id: 'b', batch_number: 'SAME' };
        const later = {
            ...earliest, batch_id: 'c', batch_number: 'LATER', expiry_date: '2028-10-01',
        };
        const otherLocation = {
            ...later, batch_id: 'd', location_id: 'location-b',
        };
        const rows = [later, samePriority, otherLocation, earliest];

        expect(batchSelectionDisabledReason(earliest, rows, true)).toBeNull();
        expect(batchSelectionDisabledReason(samePriority, rows, true)).toBeNull();
        expect(batchSelectionDisabledReason(otherLocation, rows, true)).toBeNull();
        expect(batchSelectionDisabledReason(later, rows, true)).toBe(
            'FEFO requires batch EARLY (expires 2028-09-01) first'
        );
        expect(batchSelectionDisabledReason(later, rows, false)).toBeNull();
    });
});
