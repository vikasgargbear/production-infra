import {
  addExactDecimals,
  compareExactDecimals,
  normalizeAuthoritativeDecimal,
} from '../../../utils/exactDecimal';
import { isCanonicalUuid } from '../../../utils/canonicalUuid';
import type { InvoiceDetail, OutstandingSummary, PartyOutstanding } from './types/outstanding.types';

const MONEY_OPTIONS = {
  scale: 2,
  maximumWholeDigits: 20,
  allowNegative: false,
} as const;

type JsonObject = Record<string, unknown>;
type AgingBucket = InvoiceDetail['aging_bucket'];
type InvoiceStatus = InvoiceDetail['status'];

const object = (value: unknown, label: string): JsonObject => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} is invalid.`);
  }
  return value as JsonObject;
};

const array = (value: unknown, label: string): unknown[] => {
  if (!Array.isArray(value)) throw new Error(`${label} is invalid.`);
  return value;
};

const text = (value: unknown, label: string, allowEmpty = false): string => {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
};

const uuid = (value: unknown, label: string): string => {
  const normalized = text(value, label).trim();
  if (!isCanonicalUuid(normalized)) throw new Error(`${label} must be a canonical UUID.`);
  return normalized;
};

const money = (value: unknown, label: string): string => (
  normalizeAuthoritativeDecimal(value, label, MONEY_OPTIONS)
);

const count = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`${label} is invalid.`);
  return value as number;
};

const sumMoney = (values: readonly string[], label: string): string => (
  addExactDecimals(values, label, MONEY_OPTIONS)
);

const assertMoneyEquals = (actual: string, expected: string, label: string): void => {
  if (compareExactDecimals(actual, expected, label, MONEY_OPTIONS) !== 0) {
    throw new Error(`${label} does not reconcile.`);
  }
};

const agingBucket = (value: unknown): AgingBucket => {
  if (value === 'current' || value === '1-30' || value === '31-60'
    || value === '61-90' || value === 'over_90') return value;
  throw new Error('Invoice aging bucket is invalid.');
};

const invoiceStatus = (value: unknown): InvoiceStatus => {
  if (value === 'pending' || value === 'partial' || value === 'overdue') return value;
  throw new Error('Invoice payment status is invalid.');
};

const expectedBucket = (days: number): AgingBucket => {
  if (days === 0) return 'current';
  if (days <= 30) return '1-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return 'over_90';
};

const projectInvoice = (value: unknown, index: number): InvoiceDetail => {
  const source = object(value, `Invoice ${index + 1}`);
  const daysOverdue = count(source.days_overdue, `Invoice ${index + 1} days overdue`);
  const bucket = agingBucket(source.aging_bucket);
  if (bucket !== expectedBucket(daysOverdue)) {
    throw new Error(`Invoice ${index + 1} aging bucket does not match its overdue days.`);
  }

  const originalAmount = money(source.original_amount, `Invoice ${index + 1} original amount`);
  const paidAmount = money(source.paid_amount, `Invoice ${index + 1} paid amount`);
  const currentOutstanding = money(source.current_outstanding, `Invoice ${index + 1} outstanding`);
  assertMoneyEquals(
    sumMoney([paidAmount, currentOutstanding], `Invoice ${index + 1} settlement`),
    originalAmount,
    `Invoice ${index + 1} settlement`,
  );

  return {
    invoice_id: uuid(source.invoice_id, `Invoice ${index + 1} identity`),
    invoice_number: text(source.invoice_number, `Invoice ${index + 1} number`),
    invoice_date: text(source.invoice_date, `Invoice ${index + 1} date`),
    due_date: text(source.due_date, `Invoice ${index + 1} due date`),
    original_amount: originalAmount,
    paid_amount: paidAmount,
    current_outstanding: currentOutstanding,
    days_overdue: daysOverdue,
    aging_bucket: bucket,
    status: invoiceStatus(source.status),
  };
};

const bucketMoney = (invoices: readonly InvoiceDetail[], bucket: AgingBucket): string => (
  sumMoney(
    invoices.filter(invoice => invoice.aging_bucket === bucket).map(invoice => invoice.current_outstanding),
    `${bucket} invoice outstanding`,
  )
);

const projectParty = (value: unknown, index: number): PartyOutstanding => {
  const source = object(value, `Party ${index + 1}`);
  const invoices = array(source.invoices, `Party ${index + 1} invoices`)
    .map(projectInvoice);
  const totalOutstanding = money(source.total_outstanding, `Party ${index + 1} outstanding`);
  const totalOverdue = money(source.overdue_amount, `Party ${index + 1} overdue`);
  const overdueInvoices = invoices.filter(invoice => invoice.days_overdue > 0);

  assertMoneyEquals(
    totalOutstanding,
    sumMoney(invoices.map(invoice => invoice.current_outstanding), `Party ${index + 1} invoice outstanding`),
    `Party ${index + 1} outstanding`,
  );
  assertMoneyEquals(
    totalOverdue,
    sumMoney(overdueInvoices.map(invoice => invoice.current_outstanding), `Party ${index + 1} overdue invoices`),
    `Party ${index + 1} overdue`,
  );

  const rowBuckets: Array<[AgingBucket, string]> = [
    ['current', 'current'],
    ['1-30', 'days_1_30'],
    ['31-60', 'days_31_60'],
    ['61-90', 'days_61_90'],
    ['over_90', 'over_90'],
  ];
  rowBuckets.forEach(([bucket, key]) => {
    assertMoneyEquals(
      money(source[key], `Party ${index + 1} ${bucket} amount`),
      bucketMoney(invoices, bucket),
      `Party ${index + 1} ${bucket} amount`,
    );
  });

  const invoiceCount = count(source.invoice_count, `Party ${index + 1} invoice count`);
  const overdueCount = count(source.overdue_invoices, `Party ${index + 1} overdue invoice count`);
  if (invoiceCount !== invoices.length) throw new Error(`Party ${index + 1} invoice count does not reconcile.`);
  if (overdueCount !== overdueInvoices.length) throw new Error(`Party ${index + 1} overdue invoice count does not reconcile.`);

  return {
    party_id: uuid(source.customer_id, `Party ${index + 1} customer identity`),
    party_name: text(source.customer_name, `Party ${index + 1} name`),
    party_phone: text(source.phone, `Party ${index + 1} phone`, true),
    party_email: text(source.email, `Party ${index + 1} email`, true),
    total_outstanding: totalOutstanding,
    total_overdue: totalOverdue,
    invoice_count: invoiceCount,
    overdue_count: overdueCount,
    oldest_invoice_days: count(source.max_overdue_days, `Party ${index + 1} oldest overdue days`),
    credit_limit: money(source.credit_limit, `Party ${index + 1} credit limit`),
    invoices,
  };
};

export const hasPositiveMoney = (value: string, label: string): boolean => (
  compareExactDecimals(value, '0.00', label, MONEY_OPTIONS) > 0
);

export function projectCanonicalLedger(payload: unknown): {
  parties: PartyOutstanding[];
  summary: OutstandingSummary;
} {
  const root = object(payload, 'Canonical ledger response');
  const source = object(root.summary, 'Canonical ledger summary');
  const parties = array(root.aging_data, 'Canonical ledger aging data').map(projectParty);
  const invoices = parties.flatMap(party => party.invoices ?? []);
  const overdueParties = parties.filter(party => hasPositiveMoney(party.total_overdue, 'Party overdue'));

  const summary: OutstandingSummary = {
    total_receivable: money(source.total, 'Total receivable'),
    total_overdue: money(source.overdue, 'Total overdue'),
    party_count: count(source.party_count, 'Party count'),
    overdue_party_count: overdueParties.length,
    aging_summary: {
      current: { count: count(source.current_count, 'Current count'), amount: money(source.current, 'Current amount') },
      '1-30': { count: count(source['1_30_count'], '1-30 count'), amount: money(source['1_30'], '1-30 amount') },
      '31-60': { count: count(source['31_60_count'], '31-60 count'), amount: money(source['31_60'], '31-60 amount') },
      '61-90': { count: count(source['61_90_count'], '61-90 count'), amount: money(source['61_90'], '61-90 amount') },
      over_90: { count: count(source.over_90_count, '90+ count'), amount: money(source.over_90, '90+ amount') },
    },
  };

  if (summary.party_count !== parties.length) throw new Error('Party count does not reconcile.');
  assertMoneyEquals(
    summary.total_receivable,
    sumMoney(parties.map(party => party.total_outstanding), 'Party outstanding total'),
    'Total receivable',
  );
  assertMoneyEquals(
    summary.total_overdue,
    sumMoney(parties.map(party => party.total_overdue), 'Party overdue total'),
    'Total overdue',
  );

  (Object.keys(summary.aging_summary) as AgingBucket[]).forEach(bucket => {
    const projected = summary.aging_summary[bucket];
    const bucketInvoices = invoices.filter(invoice => invoice.aging_bucket === bucket);
    if (projected.count !== bucketInvoices.length) {
      throw new Error(`${bucket} invoice count does not reconcile.`);
    }
    assertMoneyEquals(
      projected.amount,
      sumMoney(bucketInvoices.map(invoice => invoice.current_outstanding), `${bucket} summary outstanding`),
      `${bucket} summary outstanding`,
    );
  });

  return { parties, summary };
}
