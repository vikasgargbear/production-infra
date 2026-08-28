import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';

import { useCanonicalBusinessDate } from '../../hooks/useCanonicalBusinessDate';
import { reportingApi } from '../../services/api';
import { formatExactCurrency } from '../../utils/exactDecimal';
import { organizationPeriodRange } from '../../utils/calendarDate';
import { isValidReportDateRange } from './utils/reportDateRange';
import {
  projectProfitLoss,
  projectTrialBalance,
} from './utils/canonicalReportingProjection';

interface FinancialReportProps {
  title?: string;
  showTrialBalance?: boolean;
  showProfitLoss?: boolean;
}

const FinancialReport: React.FC<FinancialReportProps> = ({
  title = 'Financial statements',
  showTrialBalance = true,
  showProfitLoss = true,
}) => {
  const { businessDate, loading: clockLoading, error: clockError, retry: retryClock } = useCanonicalBusinessDate();
  const [period, setPeriod] = React.useState({ date_from: '', date_to: '' });

  React.useEffect(() => {
    if (!businessDate) return;
    const range = organizationPeriodRange(businessDate, 'current');
    setPeriod({ date_from: range.from, date_to: range.to });
  }, [businessDate]);

  const validPeriod = isValidReportDateRange(period.date_from, period.date_to);
  const report = useQuery({
    queryKey: ['canonical-financial-report', period, showTrialBalance, showProfitLoss],
    enabled: Boolean(period.date_from && period.date_to && validPeriod),
    queryFn: async () => {
      const [trialResponse, profitResponse] = await Promise.all([
        showTrialBalance ? reportingApi.getTrialBalance(period) : Promise.resolve(null),
        showProfitLoss ? reportingApi.getProfitLoss(period) : Promise.resolve(null),
      ]);
      return {
        trial: trialResponse ? projectTrialBalance(trialResponse.data) : null,
        profit: profitResponse ? projectProfitLoss(profitResponse.data) : null,
      };
    },
    retry: 1,
  });

  if (clockLoading) {
    return <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-blue-600" aria-label="Loading organization date" /></div>;
  }
  if (clockError) {
    return (
      <div role="alert" className="m-4 rounded-xl border border-red-200 bg-white p-6 text-center">
        <p className="font-semibold text-red-700">The organization business date is unavailable.</p>
        <button type="button" onClick={retryClock} className="mt-4 min-h-11 rounded-lg bg-blue-600 px-4 text-base font-semibold text-white">Retry</button>
      </div>
    );
  }

  return (
    <main className="min-h-full bg-gray-50 p-4 sm:p-6">
      <section className="mx-auto max-w-7xl space-y-5">
        <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-xl font-semibold text-gray-950">{title}</h1>
              <p className="mt-1 text-sm text-gray-600">Posted, effective ledger entries · canonical-factual-v1</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(150px,1fr)_minmax(150px,1fr)_auto]">
              <label className="text-sm font-medium text-gray-700">From
                <input aria-label="Financial report from date" type="date" value={period.date_from} max={period.date_to || businessDate} onChange={event => setPeriod(value => ({ ...value, date_from: event.target.value }))} className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 text-base" />
              </label>
              <label className="text-sm font-medium text-gray-700">To
                <input aria-label="Financial report to date" type="date" value={period.date_to} min={period.date_from} max={businessDate} onChange={event => setPeriod(value => ({ ...value, date_to: event.target.value }))} className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 text-base" />
              </label>
              <button type="button" disabled={!validPeriod || report.isFetching} onClick={() => report.refetch()} className="min-h-11 self-end rounded-lg bg-blue-600 px-4 text-base font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-300">
                <RefreshCw className={`mr-2 inline h-4 w-4 ${report.isFetching ? 'animate-spin' : ''}`} />Refresh
              </button>
            </div>
          </div>
          {!validPeriod && period.date_from && period.date_to && <p role="alert" className="mt-3 text-sm text-red-700">From date must not be after To date.</p>}
        </div>

        {report.isLoading ? (
          <div className="rounded-xl border border-gray-200 bg-white p-10 text-center"><Loader2 className="mx-auto h-7 w-7 animate-spin text-blue-600" /><p className="mt-3 text-sm text-gray-600">Loading canonical statements…</p></div>
        ) : report.error ? (
          <div role="alert" className="rounded-xl border border-red-200 bg-white p-6 text-center"><AlertCircle className="mx-auto h-8 w-8 text-red-500" /><p className="mt-3 font-semibold text-red-700">Financial statements are unavailable.</p><p className="mt-1 text-sm text-gray-600">No totals are shown because the canonical request failed.</p><button type="button" onClick={() => report.refetch()} className="mt-4 min-h-11 rounded-lg bg-blue-600 px-4 text-base font-semibold text-white">Retry</button></div>
        ) : report.data ? (
          <>
            {report.data.profit && (
              <section aria-labelledby="profit-loss-heading" className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
                <h2 id="profit-loss-heading" className="text-lg font-semibold text-gray-950">Factual profit & loss</h2>
                <p className="mt-1 text-sm text-gray-600">Income and expense accounts only; no inferred margins or statutory sections.</p>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {[['Income', report.data.profit.income, 'text-green-700'], ['Expenses', report.data.profit.expenses, 'text-red-700'], ['Result', report.data.profit.result, 'text-gray-950']].map(([label, value, color]) => <div key={label} className="rounded-lg border border-gray-200 p-4"><p className="text-sm text-gray-600">{label}</p><p className={`mt-1 text-xl font-semibold ${color}`}>{formatExactCurrency(value, label)}</p></div>)}
                </div>
                <div className="mt-4 space-y-3 sm:hidden">{report.data.profit.rows.map(row => <article key={row.account_id} className="rounded-lg border border-gray-200 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-medium text-gray-950">{row.account_name}</h3><p className="mt-1 text-xs text-gray-500">{row.account_code} · {row.account_type}</p></div><p className="shrink-0 font-semibold">{formatExactCurrency(row.amount, `${row.account_name} amount`)}</p></div></article>)}</div>
                <div className="mt-4 hidden overflow-x-auto sm:block">
                  <table className="min-w-[640px] w-full text-sm"><thead><tr className="border-b bg-gray-50 text-left text-gray-600"><th className="px-3 py-3">Account</th><th className="px-3 py-3">Type</th><th className="px-3 py-3 text-right">Amount</th></tr></thead><tbody>{report.data.profit.rows.map(row => <tr key={row.account_id} className="border-b border-gray-100"><td className="px-3 py-3"><span className="font-medium">{row.account_name}</span><span className="ml-2 text-xs text-gray-500">{row.account_code}</span></td><td className="px-3 py-3 capitalize">{row.account_type}</td><td className="px-3 py-3 text-right font-medium">{formatExactCurrency(row.amount, `${row.account_name} amount`)}</td></tr>)}</tbody></table>
                </div>
                {report.data.profit.rows.length === 0 && <p className="py-8 text-center text-sm text-gray-500">No posted income or expense movement in this period.</p>}
              </section>
            )}

            {report.data.trial && (
              <section aria-labelledby="trial-balance-heading" className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><h2 id="trial-balance-heading" className="text-lg font-semibold text-gray-950">Trial balance</h2><p className="mt-1 text-sm text-gray-600">Opening plus exact period debits and credits.</p></div><span className={`rounded-full px-3 py-1 text-sm font-medium ${report.data.trial.period_balanced ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{report.data.trial.period_balanced ? 'Period balanced' : 'Period not balanced'}</span></div>
                <div className="mt-4 space-y-3 sm:hidden">{report.data.trial.rows.map(row => <article key={row.account_id} className="rounded-lg border border-gray-200 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-medium text-gray-950">{row.account_name}</h3><p className="mt-1 text-xs text-gray-500">{row.account_code} · {row.account_type}</p></div><p className="shrink-0 font-semibold">{formatExactCurrency(row.closing_balance, 'Closing balance')}</p></div><dl className="mt-3 grid grid-cols-3 gap-2 text-xs"><div><dt className="text-gray-500">Opening</dt><dd className="mt-1">{formatExactCurrency(row.opening_balance, 'Opening balance')}</dd></div><div><dt className="text-gray-500">Debit</dt><dd className="mt-1">{formatExactCurrency(row.period_debit, 'Period debit')}</dd></div><div><dt className="text-gray-500">Credit</dt><dd className="mt-1">{formatExactCurrency(row.period_credit, 'Period credit')}</dd></div></dl></article>)}</div>
                <div className="mt-4 hidden overflow-x-auto sm:block">
                  <table className="min-w-[860px] w-full text-sm"><thead><tr className="border-b bg-gray-50 text-left text-gray-600"><th className="px-3 py-3">Account</th><th className="px-3 py-3">Type</th><th className="px-3 py-3 text-right">Opening</th><th className="px-3 py-3 text-right">Debit</th><th className="px-3 py-3 text-right">Credit</th><th className="px-3 py-3 text-right">Closing</th></tr></thead><tbody>{report.data.trial.rows.map(row => <tr key={row.account_id} className="border-b border-gray-100"><td className="px-3 py-3"><span className="font-medium">{row.account_name}</span><span className="ml-2 text-xs text-gray-500">{row.account_code}</span></td><td className="px-3 py-3 capitalize">{row.account_type}</td><td className="px-3 py-3 text-right">{formatExactCurrency(row.opening_balance, 'Opening balance')}</td><td className="px-3 py-3 text-right">{formatExactCurrency(row.period_debit, 'Period debit')}</td><td className="px-3 py-3 text-right">{formatExactCurrency(row.period_credit, 'Period credit')}</td><td className="px-3 py-3 text-right font-medium">{formatExactCurrency(row.closing_balance, 'Closing balance')}</td></tr>)}</tbody></table>
                </div>
                {report.data.trial.rows.length === 0 && <p className="py-8 text-center text-sm text-gray-500">No posted ledger movement through this period.</p>}
              </section>
            )}
          </>
        ) : null}
      </section>
    </main>
  );
};

export default FinancialReport;
