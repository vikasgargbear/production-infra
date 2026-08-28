import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';

import { useCanonicalBusinessDate } from '../../hooks/useCanonicalBusinessDate';
import { reportingApi } from '../../services/api';
import { formatCalendarDate, organizationPeriodRange } from '../../utils/calendarDate';
import { formatExactCurrency } from '../../utils/exactDecimal';
import { isValidReportDateRange } from './utils/reportDateRange';
import { projectCustomerActivity } from './utils/canonicalReportingProjection';

const CustomerAnalytics: React.FC = () => {
  const { businessDate, loading: clockLoading, error: clockError, retry: retryClock } = useCanonicalBusinessDate();
  const [period, setPeriod] = React.useState({ date_from: '', date_to: '' });

  React.useEffect(() => {
    if (!businessDate) return;
    const range = organizationPeriodRange(businessDate, 'current');
    setPeriod({ date_from: range.from, date_to: range.to });
  }, [businessDate]);

  const validPeriod = isValidReportDateRange(period.date_from, period.date_to);
  const activity = useQuery({
    queryKey: ['canonical-customer-activity', period],
    enabled: Boolean(period.date_from && period.date_to && validPeriod),
    queryFn: async () => projectCustomerActivity((await reportingApi.getCustomerActivity(period)).data),
    retry: 1,
  });

  if (clockLoading) return <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-blue-600" aria-label="Loading organization date" /></div>;
  if (clockError) return <div role="alert" className="m-4 rounded-xl border border-red-200 bg-white p-6 text-center"><p className="font-semibold text-red-700">The organization business date is unavailable.</p><button type="button" onClick={retryClock} className="mt-4 min-h-11 rounded-lg bg-blue-600 px-4 text-base font-semibold text-white">Retry</button></div>;

  return (
    <main className="min-h-full bg-gray-50 p-4 sm:p-6">
      <section className="mx-auto max-w-7xl space-y-5">
        <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div><h1 className="text-xl font-semibold text-gray-950">Customer billed activity</h1><p className="mt-1 text-sm text-gray-600">Posted sales invoices only · no churn, retention, LTV, or segment inference.</p></div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(150px,1fr)_minmax(150px,1fr)_auto]">
              <label className="text-sm font-medium text-gray-700">From<input aria-label="Customer activity from date" type="date" value={period.date_from} max={period.date_to || businessDate} onChange={event => setPeriod(value => ({ ...value, date_from: event.target.value }))} className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 text-base" /></label>
              <label className="text-sm font-medium text-gray-700">To<input aria-label="Customer activity to date" type="date" value={period.date_to} min={period.date_from} max={businessDate} onChange={event => setPeriod(value => ({ ...value, date_to: event.target.value }))} className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 text-base" /></label>
              <button type="button" disabled={!validPeriod || activity.isFetching} onClick={() => activity.refetch()} className="min-h-11 self-end rounded-lg bg-blue-600 px-4 text-base font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-300"><RefreshCw className={`mr-2 inline h-4 w-4 ${activity.isFetching ? 'animate-spin' : ''}`} />Refresh</button>
            </div>
          </div>
          {!validPeriod && period.date_from && period.date_to && <p role="alert" className="mt-3 text-sm text-red-700">From date must not be after To date.</p>}
        </div>

        {activity.isLoading ? <div className="rounded-xl border border-gray-200 bg-white p-10 text-center"><Loader2 className="mx-auto h-7 w-7 animate-spin text-blue-600" /><p className="mt-3 text-sm text-gray-600">Loading customer activity…</p></div>
          : activity.error ? <div role="alert" className="rounded-xl border border-red-200 bg-white p-6 text-center"><AlertCircle className="mx-auto h-8 w-8 text-red-500" /><p className="mt-3 font-semibold text-red-700">Customer activity is unavailable.</p><p className="mt-1 text-sm text-gray-600">No customer totals are shown because the canonical request failed.</p><button type="button" onClick={() => activity.refetch()} className="mt-4 min-h-11 rounded-lg bg-blue-600 px-4 text-base font-semibold text-white">Retry</button></div>
          : activity.data ? <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-gray-200 bg-white p-4"><p className="text-sm text-gray-600">Billed sales</p><p className="mt-1 text-xl font-semibold text-gray-950">{formatExactCurrency(activity.data.billed_sales, 'Customer billed sales')}</p></div>
              <div className="rounded-xl border border-gray-200 bg-white p-4"><p className="text-sm text-gray-600">Posted invoices</p><p className="mt-1 text-xl font-semibold text-gray-950">{activity.data.invoice_count}</p></div>
              <div className="rounded-xl border border-gray-200 bg-white p-4"><p className="text-sm text-gray-600">Transacting customers</p><p className="mt-1 text-xl font-semibold text-gray-950">{activity.data.transacting_customer_count}</p></div>
            </div>
            <section className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
              <h2 className="text-lg font-semibold text-gray-950">Customers with posted invoices</h2>
              <div className="mt-4 space-y-3 sm:hidden">{activity.data.customers.map(row => <article key={row.customer_account_id} className="rounded-lg border border-gray-200 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-medium text-gray-950">{row.customer_name}</h3><p className="mt-1 text-xs text-gray-500">{row.customer_code} · {row.account_status.replace('_', ' ')}</p></div><p className="shrink-0 font-semibold">{formatExactCurrency(row.billed_sales, `${row.customer_name} billed sales`)}</p></div><p className="mt-3 text-xs text-gray-600">{row.invoice_count} invoices · {formatCalendarDate(row.first_invoice_date)} – {formatCalendarDate(row.last_invoice_date)}</p></article>)}</div>
              <div className="mt-4 hidden overflow-x-auto sm:block"><table className="min-w-[760px] w-full text-sm"><thead><tr className="border-b bg-gray-50 text-left text-gray-600"><th className="px-3 py-3">Customer</th><th className="px-3 py-3">Account status</th><th className="px-3 py-3">First / last invoice</th><th className="px-3 py-3 text-right">Invoices</th><th className="px-3 py-3 text-right">Billed sales</th></tr></thead><tbody>{activity.data.customers.map(row => <tr key={row.customer_account_id} className="border-b border-gray-100"><td className="px-3 py-3"><span className="font-medium">{row.customer_name}</span><span className="ml-2 text-xs text-gray-500">{row.customer_code}</span></td><td className="px-3 py-3 capitalize">{row.account_status.replace('_', ' ')}</td><td className="px-3 py-3">{formatCalendarDate(row.first_invoice_date)} – {formatCalendarDate(row.last_invoice_date)}</td><td className="px-3 py-3 text-right">{row.invoice_count}</td><td className="px-3 py-3 text-right font-medium">{formatExactCurrency(row.billed_sales, `${row.customer_name} billed sales`)}</td></tr>)}</tbody></table></div>{activity.data.customers.length === 0 && <p className="py-8 text-center text-sm text-gray-500">No posted customer invoices in this period.</p>}
            </section>
          </> : null}
      </section>
    </main>
  );
};

export default CustomerAnalytics;
