import { hasCanonicalBatchIdentity } from './productMapper';

describe('hasCanonicalBatchIdentity', () => {
    const canonicalBatch = {
        product_id: '11111111-1111-4111-8111-111111111111',
        batch_id: '22222222-2222-4222-8222-222222222222',
        uom_conversion_id: '33333333-3333-4333-8333-333333333333',
        location_id: '44444444-4444-4444-8444-444444444444',
        branch_id: '55555555-5555-4555-8555-555555555555',
    };

    it('accepts a batch scoped to canonical product, UOM, location, and branch UUIDs', () => {
        expect(hasCanonicalBatchIdentity(canonicalBatch)).toBe(true);
    });

    it.each(['product_id', 'batch_id', 'uom_conversion_id', 'location_id', 'branch_id'])(
        'rejects a stale cached batch without %s',
        field => {
            expect(hasCanonicalBatchIdentity({ ...canonicalBatch, [field]: undefined })).toBe(false);
        },
    );
});
