import { projectHistoricalInvoiceArchive } from './historicalInvoiceArchiveProjection';

test('preserves exact two-decimal imported invoice amounts', () => {
  expect(projectHistoricalInvoiceArchive({
    items: [{
      record_key: 'marg:sale:1',
      invoice_number: 'MARG-1',
      invoice_date: '2026-08-01',
      customer_name: 'Observed customer',
      line_count: 2,
      taxable_amount: '100.00',
      tax_amount: '12.00',
      total_amount: '112.00',
    }],
    total: 1,
    offset: 0,
    limit: 50,
  }).items[0].total_amount).toBe('112.00');
});

test('rejects numbers and invalid dates at the archive boundary', () => {
  expect(() => projectHistoricalInvoiceArchive({
    items: [{
      record_key: 'marg:sale:1', invoice_number: 'MARG-1',
      invoice_date: '08/01/2026', customer_name: 'Observed customer',
      line_count: 2, taxable_amount: '100.00', tax_amount: '12.00', total_amount: 112,
    }],
    total: 1, offset: 0, limit: 50,
  })).toThrow();
});
