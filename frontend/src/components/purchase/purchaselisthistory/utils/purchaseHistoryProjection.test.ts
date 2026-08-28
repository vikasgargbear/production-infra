import {
  buildPurchaseHistoryParams,
  purchaseHistoryCsv,
  resolvePurchaseHistoryDates,
} from './purchaseHistoryProjection';

describe('purchase history query and export projection', () => {
  const filters = {
    searchQuery: ' ACME ', dateFilter: 'last7days', statusFilter: 'paid', dateFrom: '', dateTo: '',
  };

  it('uses the shared canonical status filter for every purchase document', () => {
    const invoice = buildPurchaseHistoryParams(filters, 'supplier_invoice', '2026-08-24');
    const order = buildPurchaseHistoryParams({ ...filters, statusFilter: 'approved' }, 'purchase_order', '2026-08-24');
    expect(invoice).toMatchObject({ search: 'ACME', status: 'paid' });
    expect(order).toMatchObject({ search: 'ACME', status: 'approved' });
  });

  it('calculates organization calendar presets without browser-clock drift', () => {
    expect(resolvePurchaseHistoryDates('last7days', '', '', '2026-08-24')).toEqual({
      from_date: '2026-08-18', to_date: '2026-08-24',
    });
    expect(resolvePurchaseHistoryDates('all', '', '', '2026-08-24')).toEqual({});
  });

  it('does not block all-time or explicit exact searches on business-date bootstrap', () => {
    const allTime = buildPurchaseHistoryParams({
      ...filters,
      searchQuery: '6ef82619-a636-5c6b-8125-7635848028e5',
      dateFilter: 'all',
      statusFilter: 'all',
    }, 'purchase_order');
    expect(allTime).toEqual(expect.objectContaining({
      search: '6ef82619-a636-5c6b-8125-7635848028e5',
      status: undefined,
    }));
    expect(resolvePurchaseHistoryDates('all')).toEqual({});
    expect(resolvePurchaseHistoryDates('last7days', '2026-08-01', '2026-08-07')).toEqual({
      from_date: '2026-08-01',
      to_date: '2026-08-07',
    });
    expect(() => resolvePurchaseHistoryDates('last7days')).toThrow(
      'Organization business date is unavailable.',
    );
  });

  it('escapes supplier names and document numbers in CSV', () => {
    const csv = purchaseHistoryCsv([{
      po_number: 'PI,"42"', supplier_name: 'A, B Pharma', po_date: '2026-08-24',
      total_amount: '100.00', paid_amount: '0.00', pending_amount: '100.00', payment_status: 'pending',
    }], 'Supplier Invoice #');
    expect(csv).toContain('"PI,""42"""');
    expect(csv).toContain('"A, B Pharma"');
    expect(purchaseHistoryCsv([{
      po_number: '  =2+2', supplier_name: '@attacker', po_date: '2026-08-24',
      total_amount: '100.00', paid_amount: null, pending_amount: null, status: 'approved',
    }], 'Purchase Order #')).toContain('"\'  =2+2"');
  });
});
