import { projectPaymentOutstandingInvoices } from './paymentOutstandingProjection';

describe('projectPaymentOutstandingInvoices', () => {
  it('preserves canonical UUIDv7 invoice and open-item identities', () => {
    const invoiceId = '0198ea37-2b1d-7c8d-9123-123456789abc';
    const openItemId = '0198ea37-2b1e-7c8d-9123-123456789abc';
    const branchId = '0198ea37-2b1f-7c8d-9123-123456789abc';

    expect(projectPaymentOutstandingInvoices({ invoice_count: 1, invoices: [{
      invoice_id: invoiceId,
      open_item_id: openItemId,
      branch_id: branchId,
      invoice_number: 'DEMO-SI-1',
      invoice_date: '2026-08-24',
      total_amount: '168.00',
      allocated: '18.00',
      due: '150.00',
      payment_status: 'partial'
    }] })).toEqual([expect.objectContaining({
      invoice_id: invoiceId,
      open_item_id: openItemId,
      branch_id: branchId,
      total_amount: '168.00',
      amount_due: '150.00',
      total_allocated: '18.00'
    })]);
  });

  it('reconciles values beyond JavaScript safe integers without drift', () => {
    expect(projectPaymentOutstandingInvoices({ invoice_count: 1, invoices: [{
      invoice_id: '0198ea37-2b1d-7c8d-9123-123456789abc',
      open_item_id: '0198ea37-2b1e-7c8d-9123-123456789abc',
      branch_id: '0198ea37-2b1f-7c8d-9123-123456789abc',
      invoice_number: 'BIG-1', invoice_date: '2026-08-24',
      total_amount: '9007199254740993.31', allocated: '0.20',
      due: '9007199254740993.11', payment_status: 'partial',
    }] })[0]).toEqual(expect.objectContaining({
      total_amount: '9007199254740993.31',
      total_allocated: '0.20',
      amount_due: '9007199254740993.11',
    }));
  });

  it('fails closed for malformed or incomplete rows', () => {
    expect(() => projectPaymentOutstandingInvoices({ invoice_count: 1, invoices: [
      { invoice_id: '0198ea37-2b1d-7c8d-9123-123456789abc', due: '0.00' },
    ] })).toThrow('invalid open_item_id');
    expect(() => projectPaymentOutstandingInvoices({ invoice_count: 2, invoices: [] })).toThrow('incomplete');
  });

  it('rejects duplicate open items instead of showing a partial list', () => {
    const row = {
      invoice_id: '0198ea37-2b1d-7c8d-9123-123456789abc',
      open_item_id: '0198ea37-2b1e-7c8d-9123-123456789abc',
      branch_id: '0198ea37-2b1f-7c8d-9123-123456789abc',
      invoice_number: 'A', invoice_date: '2026-08-25', total_amount: '10.00', allocated: '0.00', due: '10.00', payment_status: 'pending',
    };
    expect(() => projectPaymentOutstandingInvoices({ invoice_count: 2, invoices: [
      row,
      { ...row, invoice_id: '0198ea37-2b20-7c8d-9123-123456789abc' },
    ] })).toThrow('duplicate identities');
  });
});
