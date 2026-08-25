import React from 'react';
import { AlertTriangle, CheckCircle, X } from 'lucide-react';

import type { CanonicalCommandPreview } from '../../../services/api/canonicalOperatorActions';
import { formatExactCurrency } from '../../../utils/exactDecimal';
import type { CanonicalCustomerReceiptPreparePayload, ReceiptAllocation } from './customerReceiptCommand';

interface CustomerReceiptReviewDialogProps {
  preview: CanonicalCommandPreview;
  payload: CanonicalCustomerReceiptPreparePayload;
  allocations: readonly ReceiptAllocation[];
  customerName: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const focusableSelector = [
  'button:not([disabled])', '[href]', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

const CustomerReceiptReviewDialog: React.FC<CustomerReceiptReviewDialogProps> = ({
  preview, payload, allocations, customerName, busy, onCancel, onConfirm,
}) => {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const cancelButtonRef = React.useRef<HTMLButtonElement>(null);
  const previousFocusRef = React.useRef<HTMLElement | null>(null);
  const warnings = Array.isArray(preview.policy_warnings)
    ? preview.policy_warnings.filter((warning): warning is string => typeof warning === 'string')
    : [];

  React.useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelButtonRef.current?.focus();
    return () => previousFocusRef.current?.focus();
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      if (!busy) onCancel();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4"
      role="presentation" onMouseDown={() => { if (!busy) onCancel(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" data-testid="canonical-immutable-preview"
        aria-labelledby="customer-receipt-review-title"
        aria-describedby="customer-receipt-review-description"
        onKeyDown={handleKeyDown} onMouseDown={(event) => event.stopPropagation()}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Authoritative server preview</p>
            <h2 id="customer-receipt-review-title" className="mt-1 text-xl font-semibold text-gray-900">Approve customer receipt</h2>
            <p id="customer-receipt-review-description" className="mt-1 text-sm text-gray-600">
              Review the immutable request prepared by the ERP. Nothing is posted until you choose Approve &amp; Post Receipt.
            </p>
          </div>
          <button ref={cancelButtonRef} type="button" onClick={onCancel} disabled={busy}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Close receipt review without posting"><X className="h-5 w-5" /></button>
        </header>

        <div className="space-y-5 px-6 py-5">
          <dl className="grid grid-cols-[minmax(9rem,auto)_1fr] gap-x-4 text-sm">
            {[
              ['Customer', customerName],
              ['Receipt amount', formatExactCurrency(payload.amount, 'Receipt amount')],
              ['Payment date', payload.payment_date],
              ['Method', payload.payment_method.replace('_', ' ')],
              ['Reference', payload.external_reference],
              ['Command', preview.command_request_id],
            ].map(([term, detail]) => <React.Fragment key={term}>
              <dt className="border-b border-gray-100 py-3 text-gray-500">{term}</dt>
              <dd className="break-all border-b border-gray-100 py-3 font-medium text-gray-900">{detail}</dd>
            </React.Fragment>)}
          </dl>

          <section aria-labelledby="receipt-allocation-review-title">
            <h3 id="receipt-allocation-review-title" className="text-sm font-semibold text-gray-900">Invoice allocations ({allocations.length})</h3>
            <div className="mt-2 overflow-hidden rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600"><tr><th className="px-4 py-3 text-left">Invoice</th><th className="px-4 py-3 text-right">Apply now</th></tr></thead>
                <tbody>{allocations.map((allocation) => <tr key={allocation.invoice_id} className="border-t border-gray-100">
                  <td className="px-4 py-3 font-medium text-gray-900">{allocation.invoice_number}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatExactCurrency(allocation.amount, `Allocation for ${allocation.invoice_number}`)}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </section>

          {warnings.length > 0 && <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" />Server warnings</div>
            <ul className="mt-2 list-disc space-y-1 pl-5">{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
          </div>}
          <p className="break-all rounded-md bg-gray-50 px-3 py-2 font-mono text-xs text-gray-500">Preview: {preview.preview_hash}</p>
        </div>

        <footer className="flex flex-wrap justify-end gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4">
          <button type="button" onClick={onCancel} disabled={busy}
            className="min-h-11 rounded-md border border-gray-300 bg-white px-5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50">
            Back Without Posting
          </button>
          <button type="button" onClick={onConfirm} disabled={busy}
            className="flex min-h-11 items-center gap-2 rounded-md bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60">
            <CheckCircle className="h-4 w-4" />{busy ? 'Posting…' : 'Approve & Post Receipt'}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default CustomerReceiptReviewDialog;
