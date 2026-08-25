import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle, Loader2, RefreshCw, X } from 'lucide-react';

import { clientUuid } from '../../../utils/clientUuid';
import {
  approveCanonicalAction,
  canonicalExecutionCompleted,
  getCanonicalCommandReview,
  getCanonicalCommandStatus,
  type CanonicalCommandPreview,
  type CanonicalCommandReview,
} from '../../../services/api/canonicalOperatorActions';
import {
  canonicalSupplierAdvancesApi,
  executeApprovedSupplierAdvance,
  prepareSupplierAdvance,
  reconcileSupplierAdvance,
  type PostedSupplierAdvance,
} from '../../../services/api/modules/finance/canonicalSupplierAdvances.api';
import {
  buildSupplierAdvancePreparePayload,
  type SupplierAdvanceContext,
  type SupplierAdvanceMethod,
  type SupplierAdvancePreparePayload,
} from './supplierAdvanceCommand';
import { reconcileCanonicalSupplierAdvance } from './supplierAdvanceLifecycle';

interface SupplierAdvanceProps { onClose?: () => void }
type Workspace = 'prepare' | 'approve' | 'execute';

const messageFrom = (error: any): string => {
  const detail = error?.response?.data?.detail;
  return detail?.message || detail || error?.message || 'Canonical supplier-advance request failed.';
};

const SupplierAdvance: React.FC<SupplierAdvanceProps> = ({ onClose }) => {
  const [workspace, setWorkspace] = useState<Workspace>('prepare');
  const [context, setContext] = useState<SupplierAdvanceContext | null>(null);
  const [supplierId, setSupplierId] = useState('');
  const [lineId, setLineId] = useState('');
  const [bankId, setBankId] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [maximumDate, setMaximumDate] = useState('');
  const [method, setMethod] = useState<SupplierAdvanceMethod | ''>('');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [prepared, setPrepared] = useState<CanonicalCommandPreview | null>(null);
  const [preparedPayload, setPreparedPayload] = useState<SupplierAdvancePreparePayload | null>(null);
  const [commandId, setCommandId] = useState('');
  const [review, setReview] = useState<CanonicalCommandReview | null>(null);
  const [statusPreview, setStatusPreview] = useState<CanonicalCommandPreview | null>(null);
  const [postedPaymentId, setPostedPaymentId] = useState('');
  const [posted, setPosted] = useState<PostedSupplierAdvance | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const prepareKey = useRef(`erp-web-supplier-advance-prepare:${clientUuid()}`);
  const approveKey = useRef(clientUuid());
  const executeKey = useRef(clientUuid());
  const contextSequence = useRef(0);

  const invalidatePrepare = () => {
    setPrepared(null); setPreparedPayload(null); setPostedPaymentId(''); setPosted(null);
    prepareKey.current = `erp-web-supplier-advance-prepare:${clientUuid()}`;
  };

  const changeCommandId = (value: string) => {
    setCommandId(value); setReview(null); setStatusPreview(null); setPostedPaymentId('');
    setPosted(null); setConfirmed(false); approveKey.current = clientUuid(); executeKey.current = clientUuid();
  };

  const loadContext = useCallback(async (dateValue?: string) => {
    const sequence = ++contextSequence.current;
    setBusy(true); setError('');
    try {
      const next = (await canonicalSupplierAdvancesApi.getContext(dateValue)).data;
      if (sequence !== contextSequence.current) return;
      setContext(next); setPaymentDate(next.payment_date);
      setMaximumDate(current => current || next.payment_date);
    } catch (requestError) {
      if (sequence === contextSequence.current) { setContext(null); setError(messageFrom(requestError)); }
    } finally { if (sequence === contextSequence.current) setBusy(false); }
  }, []);

  useEffect(() => { void loadContext(); }, [loadContext]);

  const supplier = context?.suppliers.find(row => row.supplier_account_id === supplierId) || null;
  const selectedLine = supplier?.lines.find(row => row.purchase_order_line_id === lineId) || null;
  const previewImpact = useMemo(() => {
    if (!prepared || !Array.isArray(prepared.financial_impact)) return null;
    return prepared.financial_impact[0] as Record<string, unknown> | undefined;
  }, [prepared]);

  const prepare = async () => {
    if (!context || !method) return;
    setBusy(true); setError('');
    try {
      const payload = buildSupplierAdvancePreparePayload(context, {
        supplierAccountId: supplierId, purchaseOrderLineId: lineId,
        bankAccountId: bankId, paymentDate, paymentMethod: method,
        grossAmount: amount, externalReference: reference,
      }, prepareKey.current);
      const response = await prepareSupplierAdvance(payload);
      setPreparedPayload(payload); setPrepared(response.data);
      setCommandId(response.data.command_request_id); setConfirmed(false);
    } catch (requestError) { setError(messageFrom(requestError)); }
    finally { setBusy(false); }
  };

  const loadReview = async () => {
    setBusy(true); setError(''); setReview(null); setConfirmed(false);
    try {
      const next = (await getCanonicalCommandReview(commandId.trim())).data;
      if (next.capability_code !== 'finance.supplier_advance.prepare') {
        throw new Error('This command is not a supplier advance.');
      }
      setReview(next);
    } catch (requestError) { setError(messageFrom(requestError)); }
    finally { setBusy(false); }
  };

  const approve = async () => {
    if (!review || !confirmed) return;
    setBusy(true); setError('');
    try {
      await approveCanonicalAction('finance.supplier_advance.prepare', review, approveKey.current);
      setReview({ ...review, status: 'approved' }); setConfirmed(false);
    } catch (requestError) { setError(messageFrom(requestError)); }
    finally { setBusy(false); }
  };

  const loadStatus = async () => {
    setBusy(true); setError(''); setStatusPreview(null); setPosted(null); setConfirmed(false);
    try {
      const next = (await getCanonicalCommandStatus(commandId.trim())).data;
      setStatusPreview(next);
      const resourceId = String(next.resource_id || '');
      if (canonicalExecutionCompleted(next) && resourceId) {
        setPostedPaymentId(resourceId);
        setPosted(await reconcileSupplierAdvance(resourceId, preparedPayload || undefined));
      }
    } catch (requestError) { setError(messageFrom(requestError)); }
    finally { setBusy(false); }
  };

  const execute = async () => {
    if (!statusPreview || !confirmed) return;
    setBusy(true); setError('');
    try {
      const detail = await reconcileCanonicalSupplierAdvance(
        statusPreview, executeKey.current, postedPaymentId || null,
        executeApprovedSupplierAdvance,
        paymentId => reconcileSupplierAdvance(paymentId, preparedPayload || undefined),
        setPostedPaymentId,
      );
      setPosted(detail); setConfirmed(false);
    } catch (requestError) { setError(messageFrom(requestError)); }
    finally { setBusy(false); }
  };

  return <div className="flex h-full flex-col bg-slate-50">
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
      <div><h1 className="text-xl font-semibold text-slate-900">Supplier Advance</h1><p className="text-sm text-slate-600">Reviewed prepayment against one authoritative approved PO product line</p></div>
      {onClose && <button type="button" onClick={onClose} aria-label="Close supplier advance" className="min-h-11 min-w-11 rounded-lg border border-slate-200 p-2"><X className="mx-auto h-5 w-5" /></button>}
    </header>
    <main className="flex-1 overflow-auto p-5"><div className="mx-auto max-w-6xl space-y-4">
      <nav aria-label="Supplier advance lifecycle" className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2">
        {([['prepare', '1. Prepare advance'], ['approve', '2. Independent approval'], ['execute', '3. Execute & verify']] as const).map(([id, label]) =>
          <button key={id} type="button" aria-pressed={workspace === id} onClick={() => { setWorkspace(id); setError(''); setConfirmed(false); }} className={`min-h-11 rounded-lg px-4 text-sm font-medium ${workspace === id ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`}>{label}</button>)}
      </nav>
      {error && <div role="alert" className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800"><AlertCircle className="h-5 w-5 shrink-0" />{error}</div>}
      {busy && <div role="status" className="flex gap-2 rounded-lg border bg-white p-4"><Loader2 className="h-5 w-5 animate-spin" />Working with the canonical API…</div>}

      {workspace === 'prepare' && <>
        {context && !context.ready && <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900"><p className="font-medium">Advance unavailable</p><ul className="mt-2 list-disc pl-5">{context.blocking_reasons.map(reason => <li key={reason}>{reason}</li>)}</ul></div>}
        {context && <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Advance source</h2><p className="text-sm text-slate-600">Only approved INR goods PO lines with verified supplier and fiscal evidence are shown.</p></div><button type="button" onClick={() => void loadContext(paymentDate || undefined)} disabled={busy} className="min-h-11 rounded-lg border border-slate-300 px-4"><RefreshCw className="mr-2 inline h-4 w-4" />Refresh</button></div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium">Supplier<select value={supplierId} onChange={event => { invalidatePrepare(); setSupplierId(event.target.value); setLineId(''); }} className="mt-1 min-h-11 w-full rounded-lg border px-3"><option value="">Select supplier</option>{context.suppliers.map(row => <option key={row.supplier_account_id} value={row.supplier_account_id}>{row.supplier_code} — {row.supplier_name}</option>)}</select></label>
            <label className="text-sm font-medium">Approved PO product line<select value={lineId} onChange={event => { invalidatePrepare(); setLineId(event.target.value); setAmount(''); }} disabled={!supplier} className="mt-1 min-h-11 w-full rounded-lg border px-3"><option value="">Select PO line</option>{supplier?.lines.map(line => <option key={line.purchase_order_line_id} value={line.purchase_order_line_id}>{line.purchase_order_number} · line {line.line_number} · {line.product_code} · available ₹{line.remaining_advance_amount}</option>)}</select></label>
            <label className="text-sm font-medium">Organization payment date<input type="date" max={maximumDate || undefined} value={paymentDate} onChange={event => { const next = event.target.value; invalidatePrepare(); setPaymentDate(next); if (next) void loadContext(next); else setContext(null); }} className="mt-1 min-h-11 w-full rounded-lg border px-3" /></label>
            <label className="text-sm font-medium">Bank and settlement ledger<select value={bankId} onChange={event => { invalidatePrepare(); setBankId(event.target.value); }} className="mt-1 min-h-11 w-full rounded-lg border px-3"><option value="">Select INR bank</option>{context.bank_accounts.map(row => <option key={row.bank_account_id} value={row.bank_account_id}>{row.bank_name} — {row.account_holder_name} ({row.ifsc})</option>)}</select></label>
            <label className="text-sm font-medium">Method<select value={method} onChange={event => { invalidatePrepare(); setMethod(event.target.value as SupplierAdvanceMethod | ''); }} className="mt-1 min-h-11 w-full rounded-lg border px-3"><option value="">Select payment method</option><option value="upi">UPI</option><option value="bank_transfer">Bank transfer</option></select></label>
            <label className="text-sm font-medium">Bank / UPI reference<input value={reference} onChange={event => { invalidatePrepare(); setReference(event.target.value); }} maxLength={256} className="mt-1 min-h-11 w-full rounded-lg border px-3" /></label>
            <label className="text-sm font-medium">Gross advance amount<input inputMode="decimal" value={amount} onChange={event => { invalidatePrepare(); setAmount(event.target.value); }} placeholder="0.00" className="mt-1 min-h-11 w-full rounded-lg border px-3" /></label>
          </div>
          {selectedLine && <dl className="mt-5 grid gap-3 rounded-lg bg-slate-50 p-4 md:grid-cols-3"><div><dt className="text-xs uppercase text-slate-500">Product</dt><dd className="font-medium">{selectedLine.product_name} · {selectedLine.uom_code}</dd></div><div><dt className="text-xs uppercase text-slate-500">PO net / prior advance</dt><dd>₹{selectedLine.net_value_amount} / ₹{selectedLine.prior_active_gross}</dd></div><div><dt className="text-xs uppercase text-slate-500">Available advance</dt><dd className="font-semibold">₹{selectedLine.remaining_advance_amount}</dd></div></dl>}
          <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">Withholding: backend-verified not applicable for this bounded pilot. The immutable preview and posted readback must both prove ₹0.00 withheld.</div>
          <div className="mt-5 flex justify-end"><button type="button" onClick={() => void prepare()} disabled={busy || !context.ready || !lineId || !amount || !reference || !bankId || !method} className="min-h-11 rounded-lg bg-blue-600 px-6 font-medium text-white disabled:bg-slate-300">Prepare immutable preview</button></div>
        </section>}
        {prepared && <section className="rounded-xl border border-blue-200 bg-white p-5"><h2 className="text-lg font-semibold">Prepared — independent approval required</h2><p className="mt-1 text-sm text-slate-600">Nothing has posted. A different authorized reviewer must load the command ID and approve its immutable preview.</p><dl className="mt-4 grid gap-3 rounded-lg bg-blue-50 p-4 md:grid-cols-2"><div><dt className="text-xs uppercase text-slate-500">Command ID</dt><dd className="break-all font-mono text-sm">{prepared.command_request_id}</dd></div><div><dt className="text-xs uppercase text-slate-500">Gross / cash / withheld</dt><dd className="font-semibold">₹{String(previewImpact?.gross_advance_amount)} / ₹{String(previewImpact?.cash_disbursed_amount)} / ₹{String(previewImpact?.withheld_amount)}</dd></div><div className="md:col-span-2"><dt className="text-xs uppercase text-slate-500">Preview hash</dt><dd className="break-all font-mono text-xs">{prepared.preview_hash}</dd></div></dl></section>}
      </>}

      {workspace === 'approve' && <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-semibold">Independent checker approval</h2><p className="text-sm text-slate-600">Sign in as a different authorized reviewer. The server rejects self-approval, cross-tenant access, and preview drift.</p><div className="mt-4 flex flex-wrap gap-3"><label className="min-w-64 flex-1 text-sm font-medium">Command ID<input value={commandId} onChange={event => changeCommandId(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border px-3" /></label><button type="button" onClick={() => void loadReview()} disabled={busy || !commandId} className="min-h-11 self-end rounded-lg border px-5">Load immutable review</button></div>{review && <div className="mt-5 rounded-lg border p-4"><p className="font-medium">{review.command_type} · {review.status}</p><p className="mt-1 break-all text-xs text-slate-600">{review.preview_hash}</p><pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs">{review.preview_canonical_json}</pre>{review.status === 'prepared' && <><label className="mt-4 flex min-h-11 items-center gap-3 rounded-lg border p-3"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="h-5 w-5" /><span>I independently reviewed the exact PO lineage, bank, gross amount, cash, and withholding and approve this command.</span></label><button type="button" onClick={() => void approve()} disabled={!confirmed || busy} className="mt-4 min-h-11 rounded-lg bg-blue-600 px-6 font-medium text-white disabled:bg-slate-300">Approve exact preview</button></>}</div>}</section>}

      {workspace === 'execute' && <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-semibold">Requester execute and authoritative readback</h2><p className="text-sm text-slate-600">Return as the original requester. A completed command is reconciled with GET only; the browser never blindly executes twice.</p><div className="mt-4 flex flex-wrap gap-3"><label className="min-w-64 flex-1 text-sm font-medium">Command ID<input value={commandId} onChange={event => changeCommandId(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border px-3" /></label><button type="button" onClick={() => void loadStatus()} disabled={busy || !commandId} className="min-h-11 self-end rounded-lg border px-5">Check status / recover</button></div>{statusPreview && !posted && <div className="mt-5 rounded-lg border p-4"><p className="font-medium">Status: {String((statusPreview as any).status)}</p><p className="break-all text-xs text-slate-600">{statusPreview.preview_hash}</p>{String((statusPreview as any).status) === 'approved' && <><label className="mt-4 flex min-h-11 items-center gap-3 rounded-lg border p-3"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="h-5 w-5" /><span>I am the requester and authorize one idempotent execution of this approved preview.</span></label><button type="button" onClick={() => void execute()} disabled={!confirmed || busy} className="mt-4 min-h-11 rounded-lg bg-blue-600 px-6 font-medium text-white disabled:bg-slate-300">Execute approved advance</button></>}</div>}{posted && <div className="mt-5 flex gap-3 rounded-lg border border-green-200 bg-green-50 p-5 text-green-900"><CheckCircle className="h-6 w-6 shrink-0" /><div><h3 className="font-semibold">Supplier advance posted and reconciled</h3><p>{posted.payment_number} · gross ₹{posted.gross_advance_amount} · cash ₹{posted.cash_disbursed_amount} · withheld ₹{posted.withheld_amount}</p><p className="text-sm">PO {posted.allocations[0].purchase_order_number} line {posted.allocations[0].line_number}; prepayment open item and journal {posted.journal_number} match authoritative backend data.</p></div></div>}</section>}
    </div></main>
  </div>;
};

export default SupplierAdvance;
