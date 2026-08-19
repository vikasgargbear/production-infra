import EnterpriseCalculator from '../enterpriseCalculator';
import goldenVectors from '../../tests/fixtures/enterpriseCalculator.golden.json';

const operations = {
  calculateTotals: vector => EnterpriseCalculator.calculateTotals(vector.items, vector.options),
  calculateInvoice: vector => EnterpriseCalculator.calculateInvoice(vector.input),
  calculateSalesReturn: vector => EnterpriseCalculator.calculateSalesReturn(vector.input),
  calculatePurchaseReturn: vector => EnterpriseCalculator.calculatePurchaseReturn(vector.input)
};

describe('EnterpriseCalculator golden vectors', () => {
  test.each(goldenVectors.vectors)('$name', vector => {
    const result = operations[vector.operation](vector);

    expect(result.totals).toEqual(expect.objectContaining(vector.expectedTotals));
    if (vector.expectedFirstItem) {
      expect(result.items[0]).toEqual(expect.objectContaining(vector.expectedFirstItem));
    }
  });
});

describe('EnterpriseCalculator defensive numeric behavior', () => {
  test('uses zero for missing and non-numeric item inputs', () => {
    const result = EnterpriseCalculator.calculateItem({
      quantity: 'not-a-number',
      unit_price: null,
      discount_percent: undefined,
      gst_percent: 'invalid'
    });

    expect(result).toEqual(expect.objectContaining({
      quantity: 0,
      unit_price: 0,
      subtotal: 0,
      discount_amount: 0,
      taxable_amount: 0,
      gst_amount: 0,
      total_amount: 0
    }));
  });

  test.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'toNumber replaces non-finite value %s with its fallback',
    value => {
      expect(EnterpriseCalculator.toNumber(value, 17)).toBe(17);
    }
  );

  test('keeps negative values visible for validation instead of silently changing their sign', () => {
    const result = EnterpriseCalculator.calculateItem({
      quantity: -2,
      unit_price: 100,
      gst_percent: 18
    });

    expect(result).toEqual(expect.objectContaining({
      subtotal: -200,
      taxable_amount: -200,
      gst_amount: -36,
      total_amount: -236
    }));
  });
});
