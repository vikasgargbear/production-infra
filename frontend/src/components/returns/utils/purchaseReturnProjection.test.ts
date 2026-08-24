import {
  manualPurchaseReturnItem,
  purchaseReturnItemsForTable,
  updatePurchaseReturnItem,
} from './purchaseReturnProjection';

describe('purchase return UI projection', () => {
  const canonicalBatch = {
    product_id: 'd3000000-0000-7000-8000-000000000015',
    product_name: 'Canonical carton',
    batch_id: 'd3000000-0000-7000-8000-000000000099',
    batch_number: 'B-1',
    quantity_available: 12,
    cost_per_unit: 40,
    unit_price: 55,
    gst_percent: 12,
  };

  it('creates a manual row only from an exact canonical product batch', () => {
    const item = manualPurchaseReturnItem(canonicalBatch);
    expect(item.product_id).toBe(canonicalBatch.product_id);
    expect(item.batch_id).toBe(canonicalBatch.batch_id);
    expect(item.return_quantity).toBe(1);
    expect(item.max_returnable_qty).toBe(12);
    expect(item.unit_price).toBe(40);
  });

  it('keeps table quantity edits in return_quantity state', () => {
    const item = manualPurchaseReturnItem(canonicalBatch);
    const updated = updatePurchaseReturnItem([item], 0, 'quantity', 3);
    expect(updated[0].return_quantity).toBe(3);
    expect(purchaseReturnItemsForTable(updated)[0].quantity).toBe(3);
  });

  it('rejects unresolved and empty batches', () => {
    expect(() => manualPurchaseReturnItem({ product_id: canonicalBatch.product_id })).toThrow(/available batch/);
    expect(() => manualPurchaseReturnItem({ ...canonicalBatch, quantity_available: 0 })).toThrow(/no available quantity/);
  });
});
