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
    quantity_available: '12',
    cost_per_unit: '40',
    unit_price: '55',
    gst_percent: '12',
  };

  it('creates a manual row only from an exact canonical product batch', () => {
    const item = manualPurchaseReturnItem(canonicalBatch);
    expect(item.product_id).toBe(canonicalBatch.product_id);
    expect(item.batch_id).toBe(canonicalBatch.batch_id);
    expect(item.return_quantity).toBe('1.000000');
    expect(item.max_returnable_qty).toBe('12.000000');
    expect(item.unit_price).toBe('40.000000');
  });

  it('keeps table quantity edits in return_quantity state', () => {
    const item = manualPurchaseReturnItem(canonicalBatch);
    const updated = updatePurchaseReturnItem([item], 0, 'quantity', '3.123456');
    expect(updated[0].return_quantity).toBe('3.123456');
    expect(purchaseReturnItemsForTable(updated)[0].quantity).toBe('3.123456');
  });

  it('keeps six-place billed and free edits separate while reconciling their total', () => {
    const item = {
      ...manualPurchaseReturnItem(canonicalBatch),
      return_paid_qty: '0.000000',
      return_free_qty: '0.000000',
      return_quantity: '0.000000',
    };
    const billed = updatePurchaseReturnItem([item], 0, 'return_paid_qty', '0.123456');
    const free = updatePurchaseReturnItem(billed, 0, 'return_free_qty', '0.876544');

    expect(free[0]).toEqual(expect.objectContaining({
      return_paid_qty: '0.123456',
      return_free_qty: '0.876544',
      return_quantity: '1.000000',
    }));
  });

  it('rejects unresolved and empty batches', () => {
    expect(() => manualPurchaseReturnItem({ product_id: canonicalBatch.product_id })).toThrow(/available batch/);
    expect(() => manualPurchaseReturnItem({ ...canonicalBatch, quantity_available: '0' })).toThrow(/no available quantity/);
  });

  it('preserves exact fractional values and rejects malformed or over-scale evidence', () => {
    const item = manualPurchaseReturnItem({
      ...canonicalBatch,
      quantity_available: '900719925474.123456',
      cost_per_unit: '0.100001',
    });
    expect(item.max_returnable_qty).toBe('900719925474.123456');
    expect(item.unit_price).toBe('0.100001');
    expect(() => manualPurchaseReturnItem({ ...canonicalBatch, quantity_available: '1e3' }))
      .toThrow(/plain decimal string/);
    expect(() => manualPurchaseReturnItem({ ...canonicalBatch, quantity_available: '0.1234567' }))
      .toThrow(/precision/);
  });
});
