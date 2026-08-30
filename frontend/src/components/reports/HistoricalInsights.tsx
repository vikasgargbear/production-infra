import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Archive, Loader2, RefreshCw } from 'lucide-react';

import { reportingApi } from '../../services/api';
import { formatExactCurrency, formatExactDecimal } from '../../utils/exactDecimal';
import { projectHistoricalInsights } from './utils/historicalInsightsProjection';

const quantityOptions = { scale: 6, maximumWholeDigits: 20, allowNegative: true } as const;
const count = (value: number) => value.toLocaleString('en-IN');
const month = (value: string) => {
  const [year, monthNumber] = value.slice(0, 7).split('-').map(Number);
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][monthNumber - 1]} ${year}`;
};

const HistoricalInsights: React.FC = () => {
  const report = useQuery({
    queryKey: ['historical-migration-insights'],
    queryFn: async () => projectHistoricalInsights((await reportingApi.getHistoricalInsights()).data),
    retry: 1,
  });

  return (
    <main className="min-h-full bg-gray-50 p-4 sm:p-6">
      <section className="mx-auto max-w-7xl space-y-5">
        <header className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div><h1 className="text-xl font-semibold text-gray-950">Imported MARG history</h1><p className="mt-1 text-sm text-gray-600">Observed historical facts for analysis. These figures do not post stock, GST, or ledger entries.</p></div>
            <button type="button" onClick={() => report.refetch()} disabled={report.isFetching} className="min-h-11 rounded-lg bg-blue-600 px-4 text-base font-semibold text-white disabled:bg-gray-300"><RefreshCw className={`mr-2 inline h-4 w-4 ${report.isFetching ? 'animate-spin' : ''}`} />Refresh</button>
          </div>
        </header>

        {report.isLoading ? <div className="rounded-xl border border-gray-200 bg-white p-10 text-center"><Loader2 aria-label="Loading imported history" className="mx-auto h-7 w-7 animate-spin text-blue-600" /></div>
          : report.error ? <div role="alert" className="rounded-xl border border-red-200 bg-white p-6 text-center"><AlertCircle className="mx-auto h-8 w-8 text-red-500" /><p className="mt-3 font-semibold text-red-700">Imported history is unavailable.</p><p className="mt-1 text-sm text-gray-600">No substitute totals are shown.</p><button type="button" onClick={() => report.refetch()} className="mt-4 min-h-11 rounded-lg bg-blue-600 px-4 text-base font-semibold text-white">Retry</button></div>
          : report.data ? <>
            <section aria-label="Imported history totals" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ['Sales', formatExactCurrency(report.data.sales.total, 'Historical sales'), `${count(report.data.sales.invoice_count)} invoices`],
                ['Purchases', formatExactCurrency(report.data.purchases.total, 'Historical purchases'), `${count(report.data.purchases.invoice_count)} invoices`],
                ['Batch inventory evidence', formatExactCurrency(report.data.inventory.value, 'Historical inventory value'), `${formatExactDecimal(report.data.inventory.quantity, 'Historical inventory quantity', quantityOptions, 2)} units · ${count(report.data.inventory.batch_count)} batches`],
                ['Payable evidence', formatExactCurrency(report.data.outstanding.payable, 'Historical payable'), `${count(report.data.outstanding.item_count)} opening items`],
              ].map(([label, value, detail]) => <article key={label} className="rounded-xl border border-gray-200 bg-white p-4"><p className="text-sm text-gray-600">{label}</p><p className="mt-1 text-xl font-semibold text-gray-950">{value}</p><p className="mt-1 text-xs text-gray-500">{detail}</p></article>)}
            </section>

            <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <article className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5"><h2 className="text-lg font-semibold text-gray-950">Monthly observed sales</h2><div className="mt-4 divide-y divide-gray-100">{report.data.monthly_sales.map(row => <div key={row.month} className="flex items-center justify-between gap-4 py-3"><div><p className="font-medium text-gray-900">{month(row.month)}</p><p className="text-xs text-gray-500">{count(row.invoices)} invoices</p></div><p className="font-semibold text-gray-950">{formatExactCurrency(row.total, `${row.month} sales`)}</p></div>)}</div></article>
              <article className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5"><h2 className="text-lg font-semibold text-gray-950">Returns and expiry attention</h2><dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2"><div className="rounded-lg bg-gray-50 p-3"><dt className="text-sm text-gray-600">Sales returns</dt><dd className="mt-1 font-semibold">{formatExactCurrency(report.data.returns.sales_total, 'Historical sales returns')} · {count(report.data.returns.sales_count)}</dd></div><div className="rounded-lg bg-gray-50 p-3"><dt className="text-sm text-gray-600">Purchase returns</dt><dd className="mt-1 font-semibold">{formatExactCurrency(report.data.returns.purchase_total, 'Historical purchase returns')} · {count(report.data.returns.purchase_count)}</dd></div><div className="rounded-lg bg-amber-50 p-3 sm:col-span-2"><dt className="text-sm text-amber-800">Near-expiry batch evidence</dt><dd className="mt-1 font-semibold text-amber-950">{count(report.data.inventory.near_expiry_batches)} batches · {formatExactCurrency(report.data.inventory.near_expiry_value, 'Historical near-expiry value')}</dd></div></dl></article>
            </section>

            <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <article className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5"><h2 className="text-lg font-semibold text-gray-950">Top products</h2><div className="mt-3 divide-y divide-gray-100">{report.data.top_products.map(row => <div key={row.name} className="flex items-start justify-between gap-4 py-3"><div className="min-w-0"><p className="break-words font-medium text-gray-900">{row.name}</p><p className="text-xs text-gray-500">{formatExactDecimal(row.quantity, `${row.name} quantity`, quantityOptions, 2)} units</p></div><p className="shrink-0 font-semibold">{formatExactCurrency(row.total, `${row.name} sales`)}</p></div>)}</div></article>
              <article className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5"><h2 className="text-lg font-semibold text-gray-950">Top customers</h2><div className="mt-3 divide-y divide-gray-100">{report.data.top_customers.map(row => <div key={row.name} className="flex items-start justify-between gap-4 py-3"><div className="min-w-0"><p className="break-words font-medium text-gray-900">{row.name}</p><p className="text-xs text-gray-500">{count(row.invoices)} invoices</p></div><p className="shrink-0 font-semibold">{formatExactCurrency(row.total, `${row.name} sales`)}</p></div>)}</div></article>
            </section>

            <section className="rounded-xl border border-blue-200 bg-blue-50 p-4"><div className="flex gap-3"><Archive className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" /><div><h2 className="font-semibold text-blue-950">Coverage and limitations</h2><p className="mt-1 text-sm text-blue-900">{Object.entries(report.data.coverage).map(([kind, value]) => `${kind.replace(/_/g, ' ')}: ${count(value)}`).join(' · ')}</p><ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-blue-900">{report.data.limitations.map(item => <li key={item}>{item}</li>)}</ul></div></div></section>
          </> : null}
      </section>
    </main>
  );
};

export default HistoricalInsights;
