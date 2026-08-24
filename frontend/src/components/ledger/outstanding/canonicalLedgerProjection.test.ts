import { projectCanonicalLedger } from './canonicalLedgerProjection';

const payload = () => ({
  aging_data: [{
    customer_id: '018f0000-0000-7000-8000-000000000001',
    customer_name: 'Exact Buyer',
    phone: '', email: '',
    total_outstanding: '9007199254740993.01',
    overdue_amount: '9007199254740993.01',
    current: '0.00', days_1_30: '9007199254740993.01',
    days_31_60: '0.00', days_61_90: '0.00', over_90: '0.00',
    credit_limit: '9999999999999999.99',
    invoice_count: 1,
    overdue_invoices: 1,
    max_overdue_days: 2,
    invoices: [{
      invoice_id: '018f0000-0000-7000-8000-000000000002',
      invoice_number: 'INV-EXACT', invoice_date: '2026-08-01', due_date: '2026-08-23',
      original_amount: '9007199254740993.01', paid_amount: '0.00',
      current_outstanding: '9007199254740993.01', days_overdue: 2,
      aging_bucket: '1-30', status: 'overdue',
    }],
  }],
  summary: {
    total: '9007199254740993.01', overdue: '9007199254740993.01', party_count: 1,
    current: '0.00', current_count: 0,
    '1_30': '9007199254740993.01', '1_30_count': 1,
    '31_60': '0.00', '31_60_count': 0,
    '61_90': '0.00', '61_90_count': 0,
    over_90: '0.00', over_90_count: 0,
  },
});

test('preserves authoritative ledger money strings beyond safe integer range', () => {
  const result = projectCanonicalLedger(payload());
  expect(result.summary.total_receivable).toBe('9007199254740993.01');
  expect(result.parties[0].invoices?.[0].current_outstanding).toBe('9007199254740993.01');
});

test('fails closed on numeric or malformed authoritative money', () => {
  const numeric = payload();
  numeric.summary.total = 100 as unknown as string;
  expect(() => projectCanonicalLedger(numeric)).toThrow('exact decimal string');

  const incomplete = payload();
  delete (incomplete as any).summary;
  expect(() => projectCanonicalLedger(incomplete)).toThrow('summary is invalid');
});
