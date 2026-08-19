import React from 'react';
import { ArrowRightLeft, CheckCircle2, Clock3, ReceiptText } from 'lucide-react';
import { toast, type ToastOptions } from 'react-toastify';
import { formatCurrency } from './formatters';

export type FinancialEntryStatus = 'confirmed' | 'queued';

interface FinancialEntryNotificationOptions {
  title: string;
  reference?: string;
  amount?: number | string | null;
  status?: FinancialEntryStatus;
  impacts: string[];
}

interface FinancialEntryToastProps extends Required<Pick<FinancialEntryNotificationOptions, 'title' | 'impacts'>> {
  amount?: number | string | null;
  reference?: string;
  status: FinancialEntryStatus;
}

function FinancialEntryToast({
  title,
  reference,
  amount,
  status,
  impacts
}: FinancialEntryToastProps): JSX.Element {
  const isConfirmed = status === 'confirmed';
  const statusLabel = isConfirmed
    ? 'Saved in system'
    : 'Saved on this device, waiting to send';
  const statusIcon = isConfirmed
    ? <CheckCircle2 className="h-5 w-5 text-green-600" />
    : <Clock3 className="h-5 w-5 text-amber-600" />;
  const statusTone = isConfirmed
    ? 'border-green-200 bg-green-50 text-green-700'
    : 'border-amber-200 bg-amber-50 text-amber-700';

  return (
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${isConfirmed ? 'bg-green-100' : 'bg-amber-100'}`}>
          {statusIcon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            <ReceiptText className="h-4 w-4" />
            <span>{title}</span>
          </div>
          <p className={`mt-2 inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${statusTone}`}>
            {statusLabel}
          </p>
          <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
            {reference ? (
              <div className="rounded-xl bg-slate-50 px-3 py-2">
                <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Reference</p>
                <p className="mt-1 font-semibold text-slate-900">{reference}</p>
              </div>
            ) : null}
            {amount !== null && amount !== undefined ? (
              <div className="rounded-xl bg-slate-50 px-3 py-2">
                <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Amount</p>
                <p className="mt-1 font-semibold text-slate-900">{formatCurrency(amount)}</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div className="mt-4 rounded-xl bg-slate-50 px-3 py-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
          <ArrowRightLeft className="h-4 w-4" />
          <span>What this means</span>
        </div>
        <ul className="space-y-2">
          {impacts.map((impact) => (
            <li key={impact} className="flex items-start gap-2 text-sm text-slate-700">
              <span className={`mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full ${isConfirmed ? 'bg-green-500' : 'bg-amber-500'}`} />
              <span>{impact}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function showFinancialEntryNotification({
  title,
  reference,
  amount,
  status = 'confirmed',
  impacts
}: FinancialEntryNotificationOptions): void {
  const isConfirmed = status === 'confirmed';
  const toastMethod = isConfirmed ? toast.success : toast.info;
  const toastOptions: ToastOptions = {
    autoClose: isConfirmed ? 7000 : 9000,
    closeButton: true,
    hideProgressBar: true,
    icon: false,
    className: '!bg-transparent !shadow-none !p-0 !m-0'
  };

  toastMethod(
    <FinancialEntryToast
      title={title}
      reference={reference}
      amount={amount}
      status={status}
      impacts={impacts}
    />,
    toastOptions
  );
}
