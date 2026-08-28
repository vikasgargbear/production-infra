import {
    applyDispatchBatchChoice,
    eligibleDispatchBatchChoices,
} from './dispatchBatchChoice';
import type { ChallanItem } from '../types/challanTypes';

const line = 'd3900000-0000-7000-8000-000000000001';
const location = 'd3000000-0000-7000-8000-000000000006';
const batches = [
    { batch_id: 'd3000000-0000-7000-8000-000000000017', batch_number: 'EARLY-A', expiry_date: '2027-01-01', available_quantity: '2.000000', fefo_priority: 1 },
    { batch_id: 'd3000000-0000-7000-8000-000000000018', batch_number: 'EARLY-B', expiry_date: '2027-01-01', available_quantity: '2.000000', fefo_priority: 2 },
    { batch_id: 'd3000000-0000-7000-8000-000000000019', batch_number: 'LATER', expiry_date: '2027-02-01', available_quantity: '9.000000', fefo_priority: 3 },
    { batch_id: 'd3000000-0000-7000-8000-000000000020', batch_number: 'SHORT', expiry_date: '2027-01-01', available_quantity: '0.500000', fefo_priority: 4 },
].map(batch => ({
    ...batch,
    location_id: location,
    location_name: 'Saleable',
    mrp: '100.0000',
    available_base_quantity: batch.available_quantity,
}));

const item: ChallanItem = {
    id: `${line}:${batches[0].batch_id}`,
    source_order_line_id: line,
    product_id: 'd3000000-0000-7000-8000-000000000015',
    product_name: 'Test product',
    location_id: location,
    batch_id: batches[0].batch_id,
    batch_number: batches[0].batch_number,
    expiry_date: batches[0].expiry_date,
    quantity: '1.000000',
    free_quantity: '0.000000',
    base_billed_quantity: '1.000000',
    base_free_quantity: '0.000000',
    eligible_batches: batches,
};

test('offers only available batches in the allocation FEFO expiry tier', () => {
    expect(eligibleDispatchBatchChoices(item, [item]).map(batch => batch.batch_number))
        .toEqual(['EARLY-A', 'EARLY-B']);
});

test('applies an eligible batch and rejects later-expiry or insufficient choices', () => {
    expect(applyDispatchBatchChoice([item], item.id, batches[1].batch_id)[0]).toMatchObject({
        id: `${line}:${batches[1].batch_id}`,
        batch_id: batches[1].batch_id,
        batch_number: 'EARLY-B',
    });
    expect(() => applyDispatchBatchChoice([item], item.id, batches[2].batch_id)).toThrow(/FEFO/i);
    expect(() => applyDispatchBatchChoice([item], item.id, batches[3].batch_id)).toThrow(/availability/i);
});

test('does not offer a batch already used by another allocation of the same order line', () => {
    const sibling = {
        ...item,
        id: `${line}:${batches[1].batch_id}`,
        batch_id: batches[1].batch_id,
        batch_number: batches[1].batch_number,
    };
    expect(eligibleDispatchBatchChoices(item, [item, sibling]).map(batch => batch.batch_number))
        .toEqual(['EARLY-A']);
});

test('enforces shared base-stock capacity across separate lines for the same product', () => {
    const otherLine = {
        ...item,
        id: `d3900000-0000-7000-8000-000000000002:${batches[1].batch_id}`,
        source_order_line_id: 'd3900000-0000-7000-8000-000000000002',
        batch_id: batches[1].batch_id,
        batch_number: batches[1].batch_number,
        base_billed_quantity: '1.500000',
    };
    expect(eligibleDispatchBatchChoices(item, [item, otherLine]).map(batch => batch.batch_number))
        .toEqual(['EARLY-A']);
});
