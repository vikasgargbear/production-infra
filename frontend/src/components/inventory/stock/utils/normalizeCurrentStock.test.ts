import { normalizeCurrentStock } from './normalizeCurrentStock';

describe('normalizeCurrentStock', () => {
  it('decodes the canonical product-grain stock contract', () => {
    const result = normalizeCurrentStock([{
      product_id: 'product-uuid', product_name: 'Paracetamol', product_code: 'PCM',
      total_quantity_available: '15.000000', total_value: '375.00', cost_per_unit: '25.0000',
      total_batches: 2, expired_batches: 0, near_expiry_batches: 1, unit: 'EA'
    }]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      product_id: 'product-uuid',
      total_quantity_available: 15,
      available_stock: 15,
      total_batches: 2,
      total_value: 375,
      cost_per_unit: 25,
      unit: 'EA'
    });
  });

  it('rejects legacy batch/location rows instead of silently adapting them', () => {
    expect(() => normalizeCurrentStock([{
      product_id: 'product-uuid', product_name: 'Legacy batch row',
      quantity_available: 12, inventory_value: 60,
    }])).toThrow('missing total_quantity_available');
  });
});
