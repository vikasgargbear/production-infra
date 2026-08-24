import { projectPaymentOutstandingInvoices } from './paymentOutstandingProjection';

describe('projectPaymentOutstandingInvoices', () => {
  it('preserves canonical UUIDv7 invoice and open-item identities', () => {
    const invoiceId = '0198ea37-2b1d-7c8d-9123-123456789abc';
    const openItemId = '0198ea37-2b1e-7c8d-9123-123456789abc';

    expect(projectPaymentOutstandingInvoices({ invoices: [{
      invoice_id: invoiceId,
      open_item_id: openItemId,
      invoice_number: 'DEMO-SI-1',
      invoice_date: '2026-08-24',
      final_amount: '168.00',
      allocated: '18.00',
      due: '150.00'
    }] })).toEqual([expect.objectContaining({
      invoice_id: invoiceId,
      open_item_id: openItemId,
      total_amount: 168,
      amount_due: 150,
      total_allocated: 18
    })]);
  });

  it('drops settled and malformed rows', () => {
    expect(projectPaymentOutstandingInvoices({ invoices: [
      { invoice_id: '0198ea37-2b1d-7c8d-9123-123456789abc', due: '0.00' },
      { invoice_id: '', due: '10.00' }
    ] })).toEqual([]);
  });
});
