import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Download, FileText, Loader2, Printer } from 'lucide-react';
import { CustomerSearch, ModuleHeader, SupplierSearch } from '../global';
import type { Customer } from '../../types/models/customer';
import type { Supplier } from '../global/search/SupplierSearch';
import { ledgerApi } from '../../services/api';
import { formatExactCurrency } from '../../utils/exactDecimal';
import { isCanonicalUuid } from '../../utils/canonicalUuid';
import { projectCanonicalPartyLedger } from './partyLedgerProjection';

interface PartyLedgerProps { embedded?: boolean; onClose?: () => void; }
type PartyType = 'customer' | 'supplier';

const localDate = (date: Date): string => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const csvCell = (value: string | number): string => `"${String(value).replace(/"/g, '""')}"`;
const html = (value: string | number): string => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

const PartyLedger: React.FC<PartyLedgerProps> = ({ embedded = false, onClose }) => {
  const today = React.useMemo(() => new Date(), []);
  const [partyType, setPartyType] = React.useState<PartyType>('customer');
  const [customer, setCustomer] = React.useState<Customer | null>(null);
  const [supplier, setSupplier] = React.useState<Supplier | null>(null);
  const [dateFrom, setDateFrom] = React.useState(() => localDate(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [dateTo, setDateTo] = React.useState(() => localDate(today));
  const [page, setPage] = React.useState(1);
  const [feedback, setFeedback] = React.useState<string | null>(null);
  const candidateId = partyType === 'customer' ? customer?.customer_id : (supplier?.supplier_id ?? supplier?.id);
  const partyAccountId = typeof candidateId === 'string' && isCanonicalUuid(candidateId) ? candidateId : null;
  const dateRangeValid = Boolean(dateFrom && dateTo && dateFrom <= dateTo);

  const query = useQuery({
    queryKey: ['canonical-party-ledger', partyAccountId, partyType, dateFrom, dateTo, page],
    enabled: Boolean(partyAccountId && dateRangeValid),
    retry: 1,
    queryFn: async () => {
      if (!partyAccountId) throw new Error('Select a canonical party account.');
      const response = await ledgerApi.getCanonicalPartyStatement(partyAccountId, {
        party_type: partyType, date_from: dateFrom, date_to: dateTo, page, page_size: 100,
      });
      return projectCanonicalPartyLedger(response.data);
    },
  });
  const statement = query.data;
  const totalPages = statement ? Math.max(1, Math.ceil(statement.total / statement.page_size)) : 1;

  const resetParty = (next: PartyType) => {
    setPartyType(next); setCustomer(null); setSupplier(null); setPage(1); setFeedback(null);
  };
  const downloadPage = () => {
    if (!statement || statement.items.length === 0) { setFeedback('There are no posted statement rows to export.'); return; }
    const rows = [
      ['Date', 'Journal', 'Source Type', 'Source ID', 'Description', 'Debit', 'Credit', 'Running Balance'],
      ...statement.items.map(item => [item.posting_date, item.journal_number, item.source_type,
        item.source_document_id, item.description, item.debit, item.credit, item.running_balance]),
    ];
    const blob = new Blob([rows.map(row => row.map(csvCell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = `party-ledger-${statement.party_account_id}-page-${statement.page}.csv`;
    document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    setFeedback(`Exported page ${statement.page} of the authoritative statement.`);
  };
  const printPage = () => {
    if (!statement || statement.items.length === 0) { setFeedback('There are no posted statement rows to print.'); return; }
    const popup = window.open('', '_blank');
    if (!popup) { setFeedback('Printing was blocked by the browser. Allow pop-ups and try again.'); return; }
    popup.opener = null;
    popup.document.write(`<!doctype html><html><head><title>${html(statement.party_name)} ledger</title><style>body{font-family:system-ui;padding:24px;color:#111827}table{width:100%;border-collapse:collapse}th,td{border:1px solid #d1d5db;padding:7px;text-align:left}th{background:#f9fafb}.money{text-align:right}</style></head><body><h1>${html(statement.party_name)} — Party Ledger</h1><p>${html(statement.date_from)} to ${html(statement.date_to)} · page ${statement.page} of ${totalPages}</p><table><thead><tr><th>Date</th><th>Journal / source</th><th>Description</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead><tbody>${statement.items.map(item => `<tr><td>${html(item.posting_date)}</td><td>${html(item.journal_number)}<br><small>${html(item.source_type)} · ${html(item.source_document_id)}</small></td><td>${html(item.description)}</td><td class="money">${html(formatExactCurrency(item.debit))}</td><td class="money">${html(formatExactCurrency(item.credit))}</td><td class="money">${html(formatExactCurrency(item.running_balance))}</td></tr>`).join('')}</tbody></table></body></html>`);
    popup.document.close(); popup.print(); setFeedback(`Opened page ${statement.page} for printing.`);
  };

  return <div className={embedded ? 'h-full bg-gray-50 p-6' : 'h-full bg-gray-50'}>
    <div className="flex h-full flex-col">
      {!embedded && <ModuleHeader title="Party Ledger" documentNumber="" status="" icon={FileText}
        iconColor="text-blue-600" onClose={onClose} showSaveDraft={false} onSaveDraft={() => undefined} additionalActions={[]} />}
      <main className="flex-1 overflow-y-auto p-6">
        <section className="mx-auto max-w-7xl space-y-4" aria-labelledby="party-ledger-heading">
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <h1 id="party-ledger-heading" className="text-lg font-semibold text-gray-900">Posted party statement</h1>
            <p className="mt-1 text-sm text-gray-600">Cloud journal evidence only. Reversed and draft entries are excluded.</p>
            <div className="mt-4 flex gap-2" role="group" aria-label="Party type">
              {(['customer', 'supplier'] as PartyType[]).map(type => <button key={type} type="button" onClick={() => resetParty(type)}
                aria-pressed={partyType === type} className={`min-h-11 rounded-md border px-4 text-sm font-medium ${partyType === type ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white text-gray-700'}`}>{type === 'customer' ? 'Customer' : 'Supplier'}</button>)}
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(300px,1fr)_180px_180px]">
              {partyType === 'customer'
                ? <CustomerSearch value={customer} onChange={value => { setCustomer(value); setPage(1); setFeedback(null); }} showCreateButton={false} />
                : <SupplierSearch value={supplier} onChange={value => { setSupplier(value); setPage(1); setFeedback(null); }} showCreateButton={false} />}
              <label className="text-sm font-medium text-gray-700">From<input type="date" value={dateFrom} max={dateTo} onChange={event => { setDateFrom(event.target.value); setPage(1); }} className="mt-1 min-h-11 w-full rounded-md border border-gray-300 px-3" /></label>
              <label className="text-sm font-medium text-gray-700">To<input type="date" value={dateTo} min={dateFrom} onChange={event => { setDateTo(event.target.value); setPage(1); }} className="mt-1 min-h-11 w-full rounded-md border border-gray-300 px-3" /></label>
            </div>
            {!dateRangeValid && <p role="alert" className="mt-3 text-sm text-red-700">The end date must be on or after the start date.</p>}
            {candidateId != null && !partyAccountId && <p role="alert" className="mt-3 text-sm text-red-700">The selected party does not have a canonical UUID identity.</p>}
          </div>

          {query.isLoading && <div role="status" className="flex items-center justify-center gap-2 rounded-lg border bg-white p-10 text-gray-600"><Loader2 className="h-5 w-5 animate-spin" /> Loading posted journal evidence…</div>}
          {query.error && <div role="alert" className="rounded-lg border border-red-200 bg-white p-5 text-red-700"><AlertCircle className="mr-2 inline h-5 w-5" />The canonical statement could not be loaded. No balance has been estimated.</div>}
          {!partyAccountId && !query.isLoading && <div className="rounded-lg border border-gray-200 bg-white p-10 text-center text-gray-600">Select a party to load its statement.</div>}
          {statement && <>
            <div className="grid gap-3 md:grid-cols-4">
              {[['Opening', statement.opening_balance], ['Period debits', statement.total_debit], ['Period credits', statement.total_credit], ['Closing', statement.closing_balance]].map(([label, value]) => <div key={label} className="rounded-lg border border-gray-200 bg-white p-4"><p className="text-xs uppercase tracking-wide text-gray-500">{label}</p><p className="mt-1 text-lg font-semibold text-gray-900">{formatExactCurrency(value, label)}</p></div>)}
            </div>
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-4"><div><h2 className="font-semibold text-gray-900">{statement.party_name}</h2><p className="text-xs text-gray-500">{statement.total} posted journal line{statement.total === 1 ? '' : 's'}</p></div><div className="flex gap-2"><button type="button" onClick={downloadPage} className="min-h-11 rounded-md border border-gray-300 px-3 text-sm font-medium"><Download className="mr-2 inline h-4 w-4" />Export page</button><button type="button" onClick={printPage} className="min-h-11 rounded-md border border-gray-300 px-3 text-sm font-medium"><Printer className="mr-2 inline h-4 w-4" />Print page</button></div></div>
              {statement.items.length === 0 ? <p className="p-10 text-center text-gray-600">No effective posted journal entries exist in this date range.</p> : <div className="overflow-x-auto"><table className="min-w-full divide-y divide-gray-200 text-sm"><thead className="bg-gray-50"><tr>{['Date', 'Journal / source', 'Description', 'Debit', 'Credit', 'Balance'].map(header => <th key={header} scope="col" className="px-4 py-3 text-left font-medium text-gray-600">{header}</th>)}</tr></thead><tbody className="divide-y divide-gray-100">{statement.items.map(item => <tr key={item.journal_line_id}><td className="whitespace-nowrap px-4 py-3">{item.posting_date}</td><td className="px-4 py-3"><span className="font-medium">{item.journal_number}</span><br /><span className="text-xs text-gray-500">{item.source_type} · {item.source_document_id}</span></td><td className="px-4 py-3">{item.description}</td><td className="whitespace-nowrap px-4 py-3 text-right">{formatExactCurrency(item.debit)}</td><td className="whitespace-nowrap px-4 py-3 text-right">{formatExactCurrency(item.credit)}</td><td className="whitespace-nowrap px-4 py-3 text-right font-semibold">{formatExactCurrency(item.running_balance)}</td></tr>)}</tbody></table></div>}
              {statement.total > statement.page_size && <div className="flex items-center justify-between border-t border-gray-200 p-3"><button type="button" disabled={page === 1} onClick={() => setPage(value => value - 1)} className="min-h-11 rounded-md border px-4 disabled:opacity-40">Previous</button><span className="text-sm text-gray-600">Page {page} of {totalPages}</span><button type="button" disabled={page >= totalPages} onClick={() => setPage(value => value + 1)} className="min-h-11 rounded-md border px-4 disabled:opacity-40">Next</button></div>}
            </div>
          </>}
          {feedback && <p role="status" className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">{feedback}</p>}
        </section>
      </main>
    </div>
  </div>;
};

export default PartyLedger;
