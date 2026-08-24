import { mergeCustomersWithCanonicalAging } from './customerAgingProjection';

const customers = [
  { customer_id: 'customer-a', customer_name: 'A' },
  { customer_id: 'customer-b', customer_name: 'B' },
];

test('uses authoritative canonical aging and assigns zero only when that API succeeds', () => {
  expect(mergeCustomersWithCanonicalAging(customers, [
    { customer_id: 'customer-a', total_outstanding: 1563.99 },
  ])).toEqual([
    expect.objectContaining({ customer_id: 'customer-a', current_outstanding: 1563.99, outstanding_available: true }),
    expect.objectContaining({ customer_id: 'customer-b', current_outstanding: 0, outstanding_available: true }),
  ]);
});

test('marks balances unavailable when canonical aging cannot be read', () => {
  expect(mergeCustomersWithCanonicalAging(customers, null)).toEqual([
    expect.objectContaining({ current_outstanding: null, outstanding_available: false }),
    expect.objectContaining({ current_outstanding: null, outstanding_available: false }),
  ]);
});
