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

const optionalText = (value: unknown, label: string): string => {
  if (value == null) return '';
  return text(value, label, true);
};

const calendarDate = (value: unknown, label: string): string => {
  const normalized = text(value, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw new Error(`${label} is invalid.`);
  return normalized;
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
  const paidAmount = money(source.settled_amount, `Invoice ${index + 1} paid amount`);
  const currentOutstanding = money(source.outstanding_amount, `Invoice ${index + 1} outstanding`);
  assertMoneyEquals(
    sumMoney([paidAmount, currentOutstanding], `Invoice ${index + 1} settlement`),
    originalAmount,
    `Invoice ${index + 1} settlement`,
  );

  return {
    invoice_id: uuid(source.document_id, `Invoice ${index + 1} identity`),
    open_item_id: uuid(source.open_item_id, `Invoice ${index + 1} open-item identity`),
    branch_id: uuid(source.branch_id, `Invoice ${index + 1} branch identity`),
    document_kind: source.document_kind === 'sales_invoice'
      || source.document_kind === 'supplier_invoice'
      || source.document_kind === 'opening_balance'
      ? source.document_kind : (() => { throw new Error('Document kind is invalid.'); })(),
    invoice_number: text(source.document_number, `Invoice ${index + 1} number`),
    invoice_date: calendarDate(source.document_date, `Invoice ${index + 1} date`),
    due_date: calendarDate(source.due_date, `Invoice ${index + 1} due date`),
    original_amount: originalAmount,
    paid_amount: paidAmount,
    current_outstanding: currentOutstanding,
    days_overdue: daysOverdue,
    aging_bucket: bucket,
    status: invoiceStatus(source.status),
  };
};

const projectParty = (value: unknown, index: number): PartyOutstanding => {
  const source = object(value, `Party ${index + 1}`);
  const invoices = array(source.documents, `Party ${index + 1} invoices`)
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

  const invoiceCount = count(source.document_count, `Party ${index + 1} invoice count`);
  const overdueCount = count(source.overdue_document_count, `Party ${index + 1} overdue invoice count`);
  if (invoiceCount !== invoices.length) throw new Error(`Party ${index + 1} invoice count does not reconcile.`);
  if (overdueCount !== overdueInvoices.length) throw new Error(`Party ${index + 1} overdue invoice count does not reconcile.`);

  return {
    party_account_id: uuid(source.party_account_id, `Party ${index + 1} account identity`),
    party_id: uuid(source.party_id, `Party ${index + 1} identity`),
    party_type: source.party_type === 'customer' || source.party_type === 'supplier'
      ? source.party_type : (() => { throw new Error('Party type is invalid.'); })(),
    party_code: text(source.party_code, `Party ${index + 1} code`),
    party_name: text(source.party_name, `Party ${index + 1} name`),
    account_status: source.account_status === 'active' || source.account_status === 'on_hold' || source.account_status === 'closed'
      ? source.account_status : (() => { throw new Error('Party account status is invalid.'); })(),
    party_phone: optionalText(source.phone, `Party ${index + 1} phone`),
    party_email: optionalText(source.email, `Party ${index + 1} email`),
    total_outstanding: totalOutstanding,
    total_overdue: totalOverdue,
    invoice_count: invoiceCount,
    overdue_count: overdueCount,
    oldest_invoice_days: count(source.max_overdue_days, `Party ${index + 1} oldest overdue days`),
    credit_limit: source.limit_amount == null
      ? undefined : money(source.limit_amount, `Party ${index + 1} credit limit`),
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
  if (root.contract_version !== '1.0.0') throw new Error('Canonical ledger contract version is unsupported.');
  if (root.currency_code !== 'INR') throw new Error('Canonical ledger currency is unsupported.');
  const partyType = root.party_type;
  if (partyType !== 'customer' && partyType !== 'supplier') throw new Error('Canonical ledger party type is invalid.');
  const asOfDate = calendarDate(root.as_of_date, 'Canonical ledger as-of date');
  const parties = array(root.parties, 'Canonical ledger aging data').map(projectParty);
  if (parties.some(party => party.party_type !== partyType)) {
    throw new Error('Canonical ledger party type does not reconcile.');
  }
  const invoices = parties.flatMap(party => party.invoices ?? []);
  const overdueParties = parties.filter(party => hasPositiveMoney(party.total_overdue, 'Party overdue'));

  const summary: OutstandingSummary = {
    as_of_date: asOfDate,
    document_count: count(source.document_count, 'Document count'),
    total_receivable: money(source.total_outstanding, 'Total receivable'),
    total_overdue: money(source.total_overdue, 'Total overdue'),
    party_count: count(source.party_count, 'Party count'),
    overdue_party_count: overdueParties.length,
    aging_summary: {
      current: projectSummaryBucket(source, 'current'),
      '1-30': projectSummaryBucket(source, '1-30'),
      '31-60': projectSummaryBucket(source, '31-60'),
      '61-90': projectSummaryBucket(source, '61-90'),
      over_90: projectSummaryBucket(source, 'over_90'),
    },
  };

  if (summary.party_count !== parties.length) throw new Error('Party count does not reconcile.');
  if (summary.document_count !== invoices.length) throw new Error('Document count does not reconcile.');
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

function projectSummaryBucket(source: JsonObject, key: AgingBucket): { count: number; amount: string } {
  const buckets = object(source.buckets, 'Canonical ledger buckets');
  const bucket = object(buckets[key], `${key} bucket`);
  return {
    count: count(bucket.document_count, `${key} count`),
    amount: money(bucket.amount, `${key} amount`),
  };
}
