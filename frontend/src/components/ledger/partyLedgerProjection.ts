import { addExactDecimals, normalizeAuthoritativeDecimal } from '../../utils/exactDecimal';
import { isCanonicalUuid } from '../../utils/canonicalUuid';
import type { CanonicalPartyLedgerEntryWire, CanonicalPartyLedgerWire } from '../../services/api/modules/finance/ledger.api';

const moneyOptions = { scale: 2, maximumWholeDigits: 20, allowNegative: true } as const;

const object = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} is invalid.`);
  return value as Record<string, unknown>;
};
const uuid = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !isCanonicalUuid(value)) throw new Error(`${label} is not a canonical UUID.`);
  return value;
};
const text = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is missing.`);
  return value;
};
const integer = (value: unknown, label: string, minimum = 0): number => {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) throw new Error(`${label} is invalid.`);
  return Number(value);
};

export type CanonicalPartyLedger = CanonicalPartyLedgerWire;

export function projectCanonicalPartyLedger(payload: unknown): CanonicalPartyLedger {
  const row = object(payload, 'Party statement');
  if (!Array.isArray(row.items)) throw new Error('Party statement items are invalid.');
  const partyType = row.party_type;
  if (partyType !== 'customer' && partyType !== 'supplier') throw new Error('Party type is invalid.');
  const opening = normalizeAuthoritativeDecimal(row.opening_balance, 'Opening balance', moneyOptions);
  const pageOpening = normalizeAuthoritativeDecimal(row.page_opening_balance, 'Page opening balance', moneyOptions);
  let running = pageOpening;
  const items = row.items.map((candidate, index): CanonicalPartyLedgerEntryWire => {
    const item = object(candidate, `Statement item ${index + 1}`);
    const debit = normalizeAuthoritativeDecimal(item.debit, `Statement debit ${index + 1}`, moneyOptions);
    const credit = normalizeAuthoritativeDecimal(item.credit, `Statement credit ${index + 1}`, moneyOptions);
    const debitUnits = BigInt(debit.replace('.', ''));
    const creditUnits = BigInt(credit.replace('.', ''));
    if (debitUnits < 0n || creditUnits < 0n || (debitUnits > 0n && creditUnits > 0n)) {
      throw new Error(`Statement item ${index + 1} has invalid posting sides.`);
    }
    running = addExactDecimals(
      [running, partyType === 'customer' ? debit : credit, partyType === 'customer' ? `-${credit}` : `-${debit}`],
      `Statement running balance ${index + 1}`,
      moneyOptions,
    );
    const suppliedRunning = normalizeAuthoritativeDecimal(item.running_balance, `Statement running balance ${index + 1}`, moneyOptions);
    if (suppliedRunning !== running) throw new Error(`Statement running balance ${index + 1} does not reconcile.`);
    return {
      journal_entry_id: uuid(item.journal_entry_id, 'Journal entry'),
      journal_line_id: uuid(item.journal_line_id, 'Journal line'),
      accounting_event_id: uuid(item.accounting_event_id, 'Accounting event'),
      source_document_id: uuid(item.source_document_id, 'Source document'),
      source_type: text(item.source_type, 'Source type'),
      journal_number: text(item.journal_number, 'Journal number'),
      posting_date: text(item.posting_date, 'Posting date'),
      line_number: integer(item.line_number, 'Line number', 1),
      description: text(item.description, 'Description'),
      debit,
      credit,
      running_balance: suppliedRunning,
    };
  });
  const total = integer(row.total, 'Statement total');
  const page = integer(row.page, 'Statement page', 1);
  const pageSize = integer(row.page_size, 'Statement page size', 1);
  if (items.length > pageSize || total < items.length) throw new Error('Statement page metadata is inconsistent.');
  if (page === 1 && pageOpening !== opening) throw new Error('First statement page does not start at the opening balance.');
  const closing = normalizeAuthoritativeDecimal(row.closing_balance, 'Closing balance', moneyOptions);
  if (page === 1 && total === items.length && closing !== running) throw new Error('Statement closing balance does not reconcile.');
  return {
    party_account_id: uuid(row.party_account_id, 'Party account'),
    party_id: uuid(row.party_id, 'Party'),
    party_type: partyType,
    party_name: text(row.party_name, 'Party name'),
    account_id: uuid(row.account_id, 'Ledger account'),
    currency_code: row.currency_code === 'INR' ? 'INR' : (() => { throw new Error('Statement currency is invalid.'); })(),
    date_from: text(row.date_from, 'Date from'),
    date_to: text(row.date_to, 'Date to'),
    opening_balance: opening,
    page_opening_balance: pageOpening,
    closing_balance: closing,
    total_debit: normalizeAuthoritativeDecimal(row.total_debit, 'Total debit', moneyOptions),
    total_credit: normalizeAuthoritativeDecimal(row.total_credit, 'Total credit', moneyOptions),
    items,
    page,
    page_size: pageSize,
    total,
  };
}
