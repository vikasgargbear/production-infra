import { normalizeCanonicalSalesDispatchReadback } from './challans.api';

const id = (suffix: string) => `10000000-0000-7000-8000-${suffix.padStart(12, '0')}`;

const readback = {
  dispatch_id: id('1'), challan_number: 'DC-1', sales_order_id: id('2'),
  status: 'posted', customer_name: 'Canonical Customer', inventory_document_id: id('3'),
  inventory_base_quantity: '3.000000', inventory_value: '168.00',
  lines: [{
    dispatch_line_id: id('4'), sales_order_line_id: id('5'), product_id: id('6'),
    batch_id: id('7'), from_location_id: id('8'), billed_quantity: '2.000000',
    free_quantity: '1.000000', base_billed_quantity: '2.000000',
    base_free_quantity: '1.000000', inventory_document_line_id: id('9'),
    ledger_entry_id: id('10'), ledger_base_quantity: '3.000000', ledger_value: '168.00',
  }],
};

describe('canonical sales-dispatch readback', () => {
  it('preserves exact inventory and lineage evidence without a selling total', () => {
    expect(normalizeCanonicalSalesDispatchReadback(readback)).toEqual(readback);
    expect(normalizeCanonicalSalesDispatchReadback(readback)).not.toHaveProperty('total_amount');
  });

  it.each([
    ['JSON-number money', { ...readback, inventory_value: 168 }],
    ['non-posted status', { ...readback, status: 'draft' }],
    ['missing lineage', { ...readback, lines: [{ ...readback.lines[0], sales_order_line_id: null }] }],
    ['line quantity mismatch', { ...readback, lines: [{ ...readback.lines[0], ledger_base_quantity: '2.000000' }] }],
    ['document value mismatch', { ...readback, inventory_value: '169.00' }],
  ])('rejects %s', (_label, candidate) => {
    expect(() => normalizeCanonicalSalesDispatchReadback(candidate)).toThrow();
  });
});
