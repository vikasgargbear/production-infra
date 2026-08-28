import { projectCanonicalLedger } from './canonicalLedgerProjection';

const payload = () => ({
  contract_version: '1.0.0',
  currency_code: 'INR',
  party_type: 'customer',
  as_of_date: '2026-08-25',
  parties: [{
    party_account_id: '018f0000-0000-7000-8000-000000000001',
    party_id: '018f0000-0000-7000-8000-000000000002',
    party_type: 'customer',
    party_code: 'CUST-1',
    party_name: 'Exact Buyer',
    account_status: 'closed',
    phone: null, email: null,
    total_outstanding: '9007199254740993.01',
    overdue_amount: '9007199254740993.01',
    limit_amount: '9999999999999999.99',
    document_count: 1,
    overdue_document_count: 1,
    max_overdue_days: 2,
    documents: [{
      document_id: '018f0000-0000-7000-8000-000000000003',
      open_item_id: '018f0000-0000-7000-8000-000000000004',
      branch_id: '018f0000-0000-7000-8000-000000000005',
      document_kind: 'sales_invoice',
      document_number: 'INV-EXACT', document_date: '2026-08-01', due_date: '2026-08-23',
      original_amount: '9007199254740993.01', settled_amount: '0.00',
      outstanding_amount: '9007199254740993.01', days_overdue: 2,
      aging_bucket: '1-30', status: 'overdue',
    }],
  }],
  summary: {
    total_outstanding: '9007199254740993.01', total_overdue: '9007199254740993.01',
    party_count: 1, document_count: 1,
    buckets: {
      current: { amount: '0.00', document_count: 0 },
      '1-30': { amount: '9007199254740993.01', document_count: 1 },
      '31-60': { amount: '0.00', document_count: 0 },
      '61-90': { amount: '0.00', document_count: 0 },
      over_90: { amount: '0.00', document_count: 0 },
    },
  },
});

test('preserves authoritative ledger money and closed-account debt', () => {
  const result = projectCanonicalLedger(payload());
  expect(result.summary.total_receivable).toBe('9007199254740993.01');
  expect(result.parties[0].account_status).toBe('closed');
  expect(result.parties[0].invoices?.[0].current_outstanding).toBe('9007199254740993.01');
});

test('fails closed on numeric money, missing buckets, or party-type drift', () => {
  const numeric = payload();
  numeric.summary.total_outstanding = 100 as unknown as string;
  expect(() => projectCanonicalLedger(numeric)).toThrow('exact decimal string');

  const incomplete = payload();
  delete (incomplete as any).summary.buckets.current;
  expect(() => projectCanonicalLedger(incomplete)).toThrow('current bucket is invalid');

  const drift = payload();
  drift.parties[0].party_type = 'supplier';
  expect(() => projectCanonicalLedger(drift)).toThrow('party type does not reconcile');
});
