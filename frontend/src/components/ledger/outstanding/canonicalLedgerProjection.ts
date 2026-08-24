import { compareExactDecimals, normalizeAuthoritativeDecimal } from '../../../utils/exactDecimal';
import type { InvoiceDetail, OutstandingSummary, PartyOutstanding } from './types/outstanding.types';

const exactMoney = (value: unknown, label: string): string => normalizeAuthoritativeDecimal(value, label, {
  scale: 2,
  maximumWholeDigits: 20,
  allowNegative: true,
});

const count = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`${label} is invalid.`);
  return value as number;
};

export const hasPositiveMoney = (value: string, label: string): boolean => (
  compareExactDecimals(value, '0.00', label, {
    scale: 2, maximumWholeDigits: 20, allowNegative: true,
  }) > 0
);

export function projectCanonicalLedger(payload: any): {
  parties: PartyOutstanding[];
  summary: OutstandingSummary;
} {
  if (!payload || !Array.isArray(payload.aging_data) || !payload.summary) {
    throw new Error('Canonical ledger response is incomplete.');
  }
  const parties = payload.aging_data.map((party: any): PartyOutstanding => ({
    party_id: String(party.customer_id || party.party_id),
    party_name: String(party.customer_name || ''),
    party_phone: String(party.phone || ''),
    party_email: String(party.email || ''),
    total_outstanding: exactMoney(party.total_outstanding, 'Party outstanding'),
    total_overdue: exactMoney(party.overdue_amount, 'Party overdue'),
    invoice_count: count(party.invoice_count, 'Invoice count'),
    overdue_count: count(party.overdue_invoices, 'Overdue invoice count'),
    oldest_invoice_days: count(party.max_overdue_days, 'Oldest overdue days'),
    credit_limit: exactMoney(party.credit_limit, 'Credit limit'),
    customer_net_position: exactMoney(party.total_outstanding, 'Customer net position'),
    total_advance: '0.00',
    invoices: (party.invoices || []).map((invoice: any): InvoiceDetail => ({
      invoice_id: String(invoice.invoice_id),
      invoice_number: String(invoice.invoice_number),
      invoice_date: String(invoice.invoice_date),
      due_date: String(invoice.due_date),
      original_amount: exactMoney(invoice.original_amount, 'Invoice original amount'),
      paid_amount: exactMoney(invoice.paid_amount, 'Invoice paid amount'),
      current_outstanding: exactMoney(invoice.current_outstanding, 'Invoice outstanding'),
      days_overdue: count(invoice.days_overdue, 'Invoice days overdue'),
      aging_bucket: invoice.aging_bucket,
      status: invoice.status,
    })),
  }));
  const source = payload.summary;
  const summary: OutstandingSummary = {
    total_receivable: exactMoney(source.total, 'Total receivable'),
    total_payable: '0.00',
    total_overdue: exactMoney(source.overdue, 'Total overdue'),
    party_count: count(source.party_count, 'Party count'),
    overdue_party_count: parties.filter(party => hasPositiveMoney(party.total_overdue, 'Party overdue')).length,
    aging_summary: {
      current: { count: count(source.current_count, 'Current count'), amount: exactMoney(source.current, 'Current amount') },
      '1-30': { count: count(source['1_30_count'], '1-30 count'), amount: exactMoney(source['1_30'], '1-30 amount') },
      '31-60': { count: count(source['31_60_count'], '31-60 count'), amount: exactMoney(source['31_60'], '31-60 amount') },
      '61-90': { count: count(source['61_90_count'], '61-90 count'), amount: exactMoney(source['61_90'], '61-90 amount') },
      over_90: { count: count(source.over_90_count, '90+ count'), amount: exactMoney(source.over_90, '90+ amount') },
    },
  };
  return { parties, summary };
}
