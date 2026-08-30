import React from 'react';
import { AlertCircle, Archive, ChevronLeft, ChevronRight, Loader2, Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import { reportingApi } from '../../../../../services/api';
import { formatCalendarDate } from '../../../../../utils/calendarDate';
import { formatExactCurrency } from '../../../../../utils/exactDecimal';
import { projectHistoricalInvoiceArchive } from '../utils/historicalInvoiceArchiveProjection';

const PAGE_SIZE = 50;

export const ImportedInvoiceArchive: React.FC = () => {
  const [search, setSearch] = React.useState('');
  const [query, setQuery] = React.useState('');
  const [offset, setOffset] = React.useState(0);
  React.useEffect(() => {
    const timer = window.setTimeout(() => { setQuery(search.trim()); setOffset(0); }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  const report = useQuery({
    queryKey: ['historical-sales-invoices', query, offset],
    queryFn: async () => projectHistoricalInvoiceArchive((await reportingApi.getHistoricalInvoices({ search: query, offset, limit: PAGE_SIZE })).data),
    retry: 1,
  });
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pages = report.data ? Math.max(1, Math.ceil(report.data.total / PAGE_SIZE)) : 1;

  return <section aria-labelledby="imported-invoices-heading" className="space-y-4">
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4"><div className="flex gap-3"><Archive className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" /><div><h2 id="imported-invoices-heading" className="font-semibold text-blue-950">Imported MARG invoices</h2><p className="mt-1 text-sm text-blue-900">Read-only observed history. These records do not post stock, GST, receivables, or invoice numbers in this ERP.</p></div></div></div>
    <label className="relative block max-w-xl"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-gray-400" /><span className="sr-only">Search imported invoices</span><input value={search} onChange={event => setSearch(event.target.value)} className="min-h-11 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-base" placeholder="Search imported invoice number or customer" /></label>
    {report.isLoading ? <div className="rounded-xl border bg-white p-10 text-center"><Loader2 aria-label="Loading imported invoices" className="mx-auto h-7 w-7 animate-spin text-blue-600" /></div>
      : report.error ? <div role="alert" className="rounded-xl border border-red-200 bg-white p-6 text-center"><AlertCircle className="mx-auto h-7 w-7 text-red-500" /><p className="mt-3 font-semibold text-red-700">Imported invoices are unavailable.</p><button type="button" onClick={() => report.refetch()} className="mt-4 min-h-11 rounded-lg bg-blue-600 px-4 font-semibold text-white">Retry</button></div>
      : report.data ? <>
        <div className="space-y-3 md:hidden">{report.data.items.map(row => <article key={row.record_key} className="rounded-lg border border-gray-200 bg-white p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="font-semibold text-gray-950">{row.invoice_number}</h3><p className="mt-1 break-words text-sm text-gray-700">{row.customer_name}</p><p className="mt-1 text-xs text-gray-500">{formatCalendarDate(row.invoice_date)} · {row.line_count} lines</p></div><p className="shrink-0 font-semibold">{formatExactCurrency(row.total_amount, 'Imported invoice total')}</p></div></article>)}</div>
        <div className="hidden overflow-x-auto rounded-lg border border-gray-200 bg-white md:block"><table className="min-w-[760px] w-full text-sm"><thead className="border-b bg-gray-50 text-left text-gray-600"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Invoice</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3 text-right">Lines</th><th className="px-4 py-3 text-right">Taxable</th><th className="px-4 py-3 text-right">Tax</th><th className="px-4 py-3 text-right">Total</th></tr></thead><tbody className="divide-y divide-gray-100">{report.data.items.map(row => <tr key={row.record_key}><td className="whitespace-nowrap px-4 py-3">{formatCalendarDate(row.invoice_date)}</td><td className="px-4 py-3 font-medium">{row.invoice_number}</td><td className="px-4 py-3">{row.customer_name}</td><td className="px-4 py-3 text-right">{row.line_count}</td><td className="px-4 py-3 text-right">{formatExactCurrency(row.taxable_amount, 'Imported invoice taxable amount')}</td><td className="px-4 py-3 text-right">{formatExactCurrency(row.tax_amount, 'Imported invoice tax')}</td><td className="px-4 py-3 text-right font-semibold">{formatExactCurrency(row.total_amount, 'Imported invoice total')}</td></tr>)}</tbody></table></div>
        {report.data.items.length === 0 && <p className="rounded-lg border bg-white p-10 text-center text-sm text-gray-600">No imported invoices match this search.</p>}
        <div className="flex items-center justify-between gap-3 text-sm text-gray-600"><p>{report.data.total.toLocaleString('en-IN')} imported invoices · page {page} of {pages}</p><div className="flex gap-2"><button type="button" aria-label="Previous imported invoice page" disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - PAGE_SIZE))} className="min-h-11 min-w-11 rounded-lg border bg-white disabled:opacity-40"><ChevronLeft className="mx-auto h-4 w-4" /></button><button type="button" aria-label="Next imported invoice page" disabled={offset + PAGE_SIZE >= report.data.total} onClick={() => setOffset(value => value + PAGE_SIZE)} className="min-h-11 min-w-11 rounded-lg border bg-white disabled:opacity-40"><ChevronRight className="mx-auto h-4 w-4" /></button></div></div>
      </> : null}
  </section>;
};
