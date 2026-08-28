import { mergeSuppliersWithCanonicalAging } from './supplierAgingProjection';

const suppliers = [
  { supplier_id: 'supplier-a', supplier_name: 'A' },
  { supplier_id: 'supplier-b', supplier_name: 'B' },
];

test('joins exact canonical payable facts by supplier account identity', () => {
  expect(mergeSuppliersWithCanonicalAging(suppliers, [
    { party_account_id: 'supplier-a', total_outstanding: '9007199254740993.01' },
  ])).toEqual([
    expect.objectContaining({ supplier_id: 'supplier-a', current_outstanding: '9007199254740993.01', outstanding_available: true }),
    expect.objectContaining({ supplier_id: 'supplier-b', current_outstanding: null, outstanding_available: false }),
  ]);
});

test('rejects numeric payable money before precision can be lost', () => {
  expect(() => mergeSuppliersWithCanonicalAging(suppliers, [
    { party_account_id: 'supplier-a', total_outstanding: 1563.99 },
  ])).toThrow('exact decimal string');
});

test('marks payables unavailable when the canonical aging read fails', () => {
  expect(mergeSuppliersWithCanonicalAging(suppliers, null)).toEqual([
    expect.objectContaining({ current_outstanding: null, outstanding_available: false }),
    expect.objectContaining({ current_outstanding: null, outstanding_available: false }),
  ]);
});
