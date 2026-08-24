import { withoutUnownedSupplierOutstanding } from './supplierProjection';

test('does not turn an unavailable supplier payable into a real zero', () => {
  expect(withoutUnownedSupplierOutstanding({
    supplier_id: 'supplier-uuid',
    supplier_name: 'Canonical Supplier',
    current_outstanding: '0.00',
  })).toEqual({
    supplier_id: 'supplier-uuid',
    supplier_name: 'Canonical Supplier',
    current_outstanding: null,
    outstanding: null,
    outstanding_available: false,
  });
});
