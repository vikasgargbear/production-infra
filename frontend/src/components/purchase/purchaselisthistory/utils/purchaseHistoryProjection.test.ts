import {
  buildPurchaseHistoryParams,
  purchaseHistoryCsv,
  resolvePurchaseHistoryDates,
} from './purchaseHistoryProjection';

describe('purchase history query and export projection', () => {
  const filters = {
    searchQuery: ' ACME ', dateFilter: 'last7days', statusFilter: 'paid', dateFrom: '', dateTo: '',
  };

  it('uses payment state only for supplier invoices', () => {
    const invoice = buildPurchaseHistoryParams(filters, 'supplier_invoice');
    const order = buildPurchaseHistoryParams({ ...filters, statusFilter: 'approved' }, 'purchase_order');
    expect(invoice).toMatchObject({ search: 'ACME', payment_status: 'paid' });
    expect(invoice).not.toHaveProperty('status');
    expect(order).toMatchObject({ search: 'ACME', status: 'approved' });
    expect(order).not.toHaveProperty('payment_status');
  });

  it('calculates local calendar presets without UTC date drift', () => {
    expect(resolvePurchaseHistoryDates('last7days', '', '', new Date(2026, 7, 24, 12))).toEqual({
      from_date: '2026-08-18', to_date: '2026-08-24',
    });
    expect(resolvePurchaseHistoryDates('all')).toEqual({});
  });

  it('escapes supplier names and document numbers in CSV', () => {
    const csv = purchaseHistoryCsv([{
      po_number: 'PI,"42"', supplier_name: 'A, B Pharma', po_date: '2026-08-24',
      total_amount: 100, paid_amount: 0, pending_amount: 100, payment_status: 'pending',
    }], 'Supplier Invoice #');
    expect(csv).toContain('"PI,""42"""');
    expect(csv).toContain('"A, B Pharma"');
  });
});
