import { mergeCustomersWithCanonicalAging } from './customerAgingProjection';

const customers = [
  { customer_id: 'customer-a', customer_name: 'A' },
  { customer_id: 'customer-b', customer_name: 'B' },
];

test('uses only explicit authoritative customer aging facts', () => {
  expect(mergeCustomersWithCanonicalAging(customers, [
    { party_account_id: 'customer-a', total_outstanding: '9007199254740993.01' },
  ])).toEqual([
    expect.objectContaining({ customer_id: 'customer-a', current_outstanding: '9007199254740993.01', outstanding_available: true }),
    expect.objectContaining({ customer_id: 'customer-b', current_outstanding: null, outstanding_available: false }),
  ]);
});

test('rejects numeric money before it can lose precision', () => {
  expect(() => mergeCustomersWithCanonicalAging(customers, [
    { party_account_id: 'customer-a', total_outstanding: 1563.99 },
  ])).toThrow('exact decimal string');
});

test('marks balances unavailable when canonical aging cannot be read', () => {
  expect(mergeCustomersWithCanonicalAging(customers, null)).toEqual([
    expect.objectContaining({ current_outstanding: null, outstanding_available: false }),
    expect.objectContaining({ current_outstanding: null, outstanding_available: false }),
  ]);
});
