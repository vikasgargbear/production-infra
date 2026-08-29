import { buildSupplierInvoiceDraftPayload, requireSupplierInvoiceDraftState } from './supplierInvoiceDraftState';

describe('supplier invoice shared editor draft', () => {
  it('resumes exact quoted rates and leaves posting authority separate', () => {
    const payload = buildSupplierInvoiceDraftPayload({
      selected_receipt_id: '10000000-0000-7000-8000-000000000001',
      invoice_number: 'BILL-42',
      invoice_date: '2026-08-29',
      received_date: '2026-08-29',
      rates: { line: '123.4500' },
      allocation_methods: { line: 'quantity_weighted' },
      charge_allocation_methods: {},
      itc_attested: false,
    }, null);
    const restored = requireSupplierInvoiceDraftState(JSON.parse(JSON.stringify(payload)));
    expect(restored.rates.line).toBe('123.4500');
    expect(restored.itc_attested).toBe(false);
    expect(payload.command_payload).toBeNull();
  });
});
