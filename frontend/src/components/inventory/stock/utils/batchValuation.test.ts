import { calculateCompleteBatchValuation } from './batchValuation';

test('does not turn missing canonical batch cost into a false zero', () => {
  expect(calculateCompleteBatchValuation([
    { quantity_available: 95, cost_per_unit: null },
    { quantity_available: 76, cost_per_unit: null },
  ])).toBeNull();
});

test('sums only when every canonical batch has cost', () => {
  expect(calculateCompleteBatchValuation([
    { quantity_available: 2, cost_per_unit: 10 },
    { quantity_available: 3, cost_per_unit: 5 },
  ])).toBe(35);
  expect(calculateCompleteBatchValuation([
    { quantity_available: 2, cost_per_unit: '10.50' },
  ])).toBe(21);
  expect(calculateCompleteBatchValuation([])).toBe(0);
});
