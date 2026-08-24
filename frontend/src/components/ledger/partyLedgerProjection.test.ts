import { projectCanonicalPartyLedger } from './partyLedgerProjection';

const ids = Array.from({ length: 12 }, (_, index) => `d3000000-0000-7000-8000-${String(index + 1).padStart(12, '0')}`);

const statement = () => ({
  party_account_id: ids[0], party_id: ids[1], party_type: 'customer', party_name: 'Exact Customer',
  account_id: ids[2], currency_code: 'INR', date_from: '2026-08-01', date_to: '2026-08-31',
  opening_balance: '9007199254740993.00', page_opening_balance: '9007199254740993.00',
  closing_balance: '9007199254740993.30',
  total_debit: '0.30', total_credit: '0.00', page: 1, page_size: 100, total: 2,
  items: [
    { journal_entry_id: ids[3], journal_line_id: ids[4], accounting_event_id: ids[5], source_document_id: ids[6],
      source_type: 'sales_invoice', journal_number: 'JV-1', posting_date: '2026-08-02', line_number: 1,
      description: 'One tenth', debit: '0.10', credit: '0.00', running_balance: '9007199254740993.10' },
    { journal_entry_id: ids[7], journal_line_id: ids[8], accounting_event_id: ids[9], source_document_id: ids[10],
      source_type: 'sales_invoice', journal_number: 'JV-2', posting_date: '2026-08-03', line_number: 1,
      description: 'Two tenths', debit: '0.20', credit: '0.00', running_balance: '9007199254740993.30' },
  ],
});

it('reconciles 0.10 + 0.20 without IEEE-754 and preserves values above 2^53', () => {
  const projected = projectCanonicalPartyLedger(statement());
  expect(projected.total_debit).toBe('0.30');
  expect(projected.closing_balance).toBe('9007199254740993.30');
  expect(projected.items[1].running_balance).toBe('9007199254740993.30');
});

it.each([
  ['numeric money', (value: any) => { value.total_debit = 0.3; }],
  ['running drift', (value: any) => { value.items[1].running_balance = '9007199254740993.29'; }],
  ['integer identity', (value: any) => { value.party_account_id = 42; }],
  ['dual-sided posting', (value: any) => { value.items[0].credit = '0.01'; }],
])('fails closed for %s', (_name, mutate) => {
  const value = statement(); mutate(value);
  expect(() => projectCanonicalPartyLedger(value)).toThrow();
});

it('uses credit-minus-debit for supplier running balances', () => {
  const value = statement();
  value.party_type = 'supplier'; value.opening_balance = '0.00'; value.page_opening_balance = '0.00'; value.closing_balance = '0.30';
  value.items[0].debit = '0.00'; value.items[0].credit = '0.10'; value.items[0].running_balance = '0.10';
  value.items[1].debit = '0.00'; value.items[1].credit = '0.20'; value.items[1].running_balance = '0.30';
  expect(projectCanonicalPartyLedger(value).closing_balance).toBe('0.30');
});
