import {
  productCreateSchema,
  productUpdateSchema,
} from '../../types/models/product';

describe('product mutation contract', () => {
  it.each([
    ['hsn_code', '3004'],
    ['gst_percent', 12],
    ['gst_rate', 12],
    ['drug_schedule', 'H1'],
    ['schedule', 'H1'],
    ['is_narcotic', true],
    ['is_controlled', true],
    ['is_controlled_substance', true],
    ['requires_prescription', true],
    ['schedule_h2_applicable_from', '2027-07-01'],
    ['regulatory_ruleset_version', 'client-asserted'],
    ['composition', { active: 'Unverified' }],
    ['mrp_per_unit', 100],
    ['initial_quantity', 10],
  ])('rejects separate or unverified field %s', (field, value) => {
    expect(() => productCreateSchema.parse({
      product_name: 'Draft product',
      [field]: value,
    })).toThrow();
  });

  it('applies only documented server-aligned defaults', () => {
    expect(productCreateSchema.parse({ product_name: 'Draft product' })).toEqual({
      product_name: 'Draft product',
      product_kind: 'medicine',
    });
  });

  it('rejects legacy aliases instead of dropping them', () => {
    expect(() => productUpdateSchema.parse({ brand_name: 'Legacy brand' })).toThrow();
    expect(() => productUpdateSchema.parse({})).toThrow();
  });

  it('rejects inventory policy fields that belong to later commands', () => {
    expect(() => productCreateSchema.parse({
      product_name: 'Draft product',
      min_stock_quantity: 20,
      max_stock_quantity: 10,
    })).toThrow();
  });
});
