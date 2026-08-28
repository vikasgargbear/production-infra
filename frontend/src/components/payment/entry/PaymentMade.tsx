import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle, Loader2, RefreshCw, X } from 'lucide-react';

import { clientUuid } from '../../../utils/clientUuid';
import type { CanonicalCommandPreview } from '../../../services/api/canonicalOperatorActions';
import {
  canonicalSupplierPaymentsApi, executeSupplierPayment, prepareSupplierPayment,
  reconcileSupplierPayment, type PostedSupplierPayment,
} from '../../../services/api/modules/finance/canonicalSupplierPayments.api';
import {
  allocateSupplierFifo, buildSupplierPaymentPreparePayload,
  supplierMoneyToMinor, supplierMinorToMoney, type SupplierPaymentContext,
  type SupplierPaymentPreparePayload,
} from './supplierPaymentCommand';
import { reconcileCanonicalSupplierPayment } from './supplierPaymentLifecycle';

interface PaymentMadeProps { onClose?: () => void }
type Step = 'entry' | 'review' | 'posted';
type AllocationMode = 'fifo' | 'manual';

const errorMessage = (error: any): string => {
  const detail = error?.response?.data?.detail;
  return detail?.message || detail || error?.message || 'Canonical supplier-payment request failed.';
};

const PaymentMade: React.FC<PaymentMadeProps> = ({ onClose }) => {
  const [context, setContext] = useState<SupplierPaymentContext | null>(null);
  const [step, setStep] = useState<Step>('entry');
  const [supplierId, setSupplierId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [bankId, setBankId] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [maximumPaymentDate, setMaximumPaymentDate] = useState('');
  const [method, setMethod] = useState<'upi' | 'bank_transfer' | ''>('');
  const [reference, setReference] = useState('');
  const [amount, setAmount] = useState('');
  const [allocationMode, setAllocationMode] = useState<AllocationMode>('fifo');
  const [allocations, setAllocations] = useState<Array<{ open_item_id: string; amount: string }>>([]);
  const [prepared, setPrepared] = useState<CanonicalCommandPreview | null>(null);
  const [preparedPayload, setPreparedPayload] = useState<SupplierPaymentPreparePayload | null>(null);
  const [actorConfirmed, setActorConfirmed] = useState(false);
  const [postedPaymentId, setPostedPaymentId] = useState('');
  const [posted, setPosted] = useState<PostedSupplierPayment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const prepareAttempt = useRef(`erp-web-supplier-payment-prepare:${clientUuid()}`);
  const lifecycle = useRef(clientUuid());
  const contextRequestSequence = useRef(0);

  const load = useCallback(async (dateValue?: string) => {
    const requestSequence = ++contextRequestSequence.current;
    setBusy(true); setError('');
    try {
      const next = (await canonicalSupplierPaymentsApi.getContext(dateValue)).data;
      if (requestSequence !== contextRequestSequence.current) return;
      setContext(next);
      setPaymentDate(next.payment_date);
      setMaximumPaymentDate(current => current || next.payment_date);
    } catch (requestError) {
      if (requestSequence === contextRequestSequence.current) {
        setContext(null); setError(errorMessage(requestError));
      }
    } finally {
      if (requestSequence === contextRequestSequence.current) setBusy(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const supplier = context?.suppliers.find(row => row.supplier_account_id === supplierId) || null;
  const bank = context?.bank_accounts.find(row => row.bank_account_id === bankId) || null;
  const visibleItems = useMemo(
    () => (supplier?.open_items || []).filter(item => item.branch_id === branchId),
    [branchId, supplier],
  );
  const allocatedTotal = useMemo(
    () => allocations.reduce((sum, row) => sum + supplierMoneyToMinor(row.amount), 0n),
    [allocations],
  );

  const invalidate = () => {
    setPrepared(null); setPreparedPayload(null); setActorConfirmed(false);
    setPostedPaymentId(''); setPosted(null); setStep('entry');
    prepareAttempt.current = `erp-web-supplier-payment-prepare:${clientUuid()}`;
    lifecycle.current = clientUuid();
  };
  const chooseSupplier = (value: string) => {
    invalidate(); setSupplierId(value); setAllocations([]); setAmount('');
    setBranchId('');
  };
  const applyFifo = () => {
    try {
      if (!supplier) throw new Error('Select a supplier first.');
      setAllocations(allocateSupplierFifo(amount, supplier.open_items, branchId));
      setError(''); setPrepared(null); setPreparedPayload(null);
    } catch (allocationError) { setAllocations([]); setError(errorMessage(allocationError)); }
  };
  const changeAllocationMode = (next: AllocationMode) => {
    invalidate(); setAllocationMode(next); setAmount(''); setAllocations([]); setError('');
  };
  const setManualAllocation = (openItemId: string, value: string) => {
    invalidate(); setError('');
    setAllocations(current => {
      const retained = current.filter(row => row.open_item_id !== openItemId);
      return value ? [...retained, { open_item_id: openItemId, amount: value }] : retained;
    });
  };
  const prepare = async () => {
    if (!context || !bank || !method) return;
    setBusy(true); setError('');
    try {
      const payload = buildSupplierPaymentPreparePayload({
        supplier_account_id: supplierId, branch_id: branchId,
        bank_account_id: bank.bank_account_id, settlement_account_id: bank.settlement_account_id,
        payment_date: paymentDate, payment_method: method,
        external_reference: reference, allocations,
      }, context, prepareAttempt.current);
      const response = await prepareSupplierPayment(payload);
      setPreparedPayload(payload); setPrepared(response.data); setActorConfirmed(false); setStep('review');
    } catch (requestError) { setError(errorMessage(requestError)); }
    finally { setBusy(false); }
  };
  const postOrReconcile = async () => {
    if (!prepared || !preparedPayload || !actorConfirmed) return;
    setBusy(true); setError('');
    try {
      const readback = await reconcileCanonicalSupplierPayment(
        prepared, lifecycle.current, postedPaymentId || null,
        executeSupplierPayment,
        paymentId => reconcileSupplierPayment(paymentId, preparedPayload),
        setPostedPaymentId,
      );
      setPosted(readback); setStep('posted'); setError('');
    } catch (requestError) { setError(errorMessage(requestError)); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex h-full flex-col bg-slate-50">
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 py-3 sm:px-5 sm:py-4">
        <div className="min-w-0"><h1 className="text-lg font-semibold text-slate-900 sm:text-xl">Supplier Payment</h1><p className="hidden text-sm text-slate-600 sm:block">Posted invoice payables through reviewed canonical accounting</p></div>
        {onClose && <button type="button" onClick={onClose} aria-label="Close supplier payment" className="min-h-11 min-w-11 rounded-lg border border-slate-200 p-2"><X className="mx-auto h-5 w-5" /></button>}
      </header>
      <main className="flex-1 overflow-auto p-3 sm:p-5" data-testid="canonical-immutable-preview"><div className="mx-auto max-w-5xl space-y-4">
        {error && <div role="alert" className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800"><AlertCircle className="h-5 w-5 shrink-0" />{error}</div>}
        {context && !context.ready && <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900"><p className="font-medium">Posting unavailable</p><ul className="mt-2 list-disc pl-5">{context.blocking_reasons.map(reason => <li key={reason}>{reason}</li>)}</ul></div>}
        {busy && !context && <div role="status" className="flex gap-2 rounded-lg border bg-white p-5"><Loader2 className="h-5 w-5 animate-spin" />Loading canonical payables…</div>}

        {step === 'entry' && context && <>
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Payment details</h2><button type="button" onClick={() => void load(paymentDate || undefined)} disabled={busy} className="min-h-11 rounded-lg border border-slate-300 px-4"><RefreshCw className="mr-2 inline h-4 w-4" />Refresh</button></div>
            <p className="mb-4 text-sm text-slate-600">Required: select supplier, branch, bank, method, reference, and at least one exact payable allocation.</p>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium">Supplier<select value={supplierId} onChange={event => chooseSupplier(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border px-3"><option value="">Select supplier</option>{context.suppliers.map(row => <option key={row.supplier_account_id} value={row.supplier_account_id}>{row.supplier_code} — {row.supplier_name}</option>)}</select></label>
              <label className="text-sm font-medium">Branch<select value={branchId} onChange={event => { invalidate(); setBranchId(event.target.value); setAllocations([]); }} className="mt-1 min-h-11 w-full rounded-lg border px-3"><option value="">Select branch</option>{context.branches.map(row => <option key={row.branch_id} value={row.branch_id}>{row.branch_code} — {row.branch_name}</option>)}</select></label>
              <label className="text-sm font-medium">Organization payment date<input type="date" max={maximumPaymentDate || undefined} value={paymentDate} onChange={event => { const nextDate = event.target.value; invalidate(); setPaymentDate(nextDate); if (nextDate) void load(nextDate); else setContext(null); }} className="mt-1 min-h-11 w-full rounded-lg border px-3" /></label>
              <label className="text-sm font-medium">Bank and settlement ledger<select value={bankId} onChange={event => { invalidate(); setBankId(event.target.value); }} className="mt-1 min-h-11 w-full rounded-lg border px-3"><option value="">Select INR bank</option>{context.bank_accounts.map(row => <option key={row.bank_account_id} value={row.bank_account_id}>{row.bank_name} — {row.account_holder_name} ({row.ifsc})</option>)}</select></label>
              <label className="text-sm font-medium">Method<select value={method} onChange={event => { invalidate(); setMethod(event.target.value as typeof method); }} className="mt-1 min-h-11 w-full rounded-lg border px-3"><option value="">Select payment method</option><option value="upi">UPI</option><option value="bank_transfer">Bank transfer</option></select></label>
              <label className="text-sm font-medium">Bank / UPI reference<input value={reference} onChange={event => { invalidate(); setReference(event.target.value); }} maxLength={256} className="mt-1 min-h-11 w-full rounded-lg border px-3" /></label>
            </div>
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="font-semibold">Invoice allocation</h2><p className="mt-1 text-sm text-slate-600">Automatic FIFO is the default. You can instead enter exact amounts per invoice. Review every allocation before posting.</p>
            <fieldset className="mt-4 flex flex-wrap gap-3" aria-label="Allocation method">
              <legend className="sr-only">Allocation method</legend>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-4"><input type="radio" name="supplier-allocation-mode" checked={allocationMode === 'fifo'} onChange={() => changeAllocationMode('fifo')} />Automatic FIFO</label>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-4"><input type="radio" name="supplier-allocation-mode" checked={allocationMode === 'manual'} onChange={() => changeAllocationMode('manual')} />Manual per invoice</label>
            </fieldset>
            {allocationMode === 'fifo' && <div className="mt-4 flex flex-wrap gap-3"><label className="min-w-64 flex-1 text-sm font-medium">Payment amount<input inputMode="decimal" value={amount} onChange={event => { invalidate(); setAmount(event.target.value); setAllocations([]); }} placeholder="0.00" className="mt-1 min-h-11 w-full rounded-lg border px-3" /></label><button type="button" onClick={applyFifo} disabled={!supplier || !branchId || !amount} className="min-h-11 self-end rounded-lg bg-blue-600 px-5 text-white disabled:bg-slate-300">Allocate FIFO</button></div>}
            {allocationMode === 'manual' && <p className="mt-4 text-sm text-slate-600">Enter the exact amount beside each invoice. Blank invoices are not included.</p>}
            <div className="mt-4 space-y-3 md:hidden" data-testid="supplier-payment-mobile-allocations">{visibleItems.map(item => { const row = allocations.find(value => value.open_item_id === item.open_item_id); return <article key={item.open_item_id} className="rounded-lg border border-slate-200 bg-white p-3"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{item.document_number}</h3><p className="text-sm text-slate-600">{item.document_date} · due {item.due_date}</p></div><p className="whitespace-nowrap font-semibold">₹{item.outstanding_amount}</p></div>{allocationMode === 'manual' ? <label className="mt-3 block text-sm font-medium">Allocate amount<input data-testid={`allocate-supplier-invoice-mobile-${item.supplier_invoice_id}`} aria-label={`Allocation for ${item.document_number} — canonical supplier invoice ${item.supplier_invoice_id}`} inputMode="decimal" value={row?.amount || ''} onChange={event => setManualAllocation(item.open_item_id, event.target.value)} placeholder="0.00" className="mt-1 min-h-12 w-full rounded-lg border px-3 text-right text-base" /></label> : <p className="mt-3 text-sm text-emerald-700">Allocated <strong>₹{row?.amount || '0.00'}</strong></p>}</article>; })}</div>
            <div className="mt-4 hidden overflow-x-auto md:block"><table className="min-w-full text-sm"><thead><tr className="border-b text-left text-slate-600"><th className="p-3">Invoice</th><th className="p-3">Date / Due</th><th className="p-3 text-right">Outstanding</th><th className="p-3 text-right">Allocated</th></tr></thead><tbody>{visibleItems.map(item => { const row = allocations.find(value => value.open_item_id === item.open_item_id); return <tr key={item.open_item_id} className="border-b border-slate-100"><td className="p-3 font-medium">{item.document_number}</td><td className="p-3">{item.document_date}<br /><span className="text-slate-500">Due {item.due_date}</span></td><td className="p-3 text-right">₹{item.outstanding_amount}</td><td className="p-3 text-right">{allocationMode === 'manual' ? <input data-testid={`allocate-supplier-invoice-${item.supplier_invoice_id}`} aria-label={`Allocation for ${item.document_number} — canonical supplier invoice ${item.supplier_invoice_id}`} inputMode="decimal" value={row?.amount || ''} onChange={event => setManualAllocation(item.open_item_id, event.target.value)} placeholder="0.00" className="min-h-11 w-32 rounded-lg border px-3 text-right" /> : <>₹{row?.amount || '0.00'}</>}</td></tr>; })}</tbody></table></div>
            <div className="sticky bottom-0 mt-4 flex flex-col gap-3 border-t bg-white/95 pt-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between"><span className="font-semibold">Allocated ₹{supplierMinorToMoney(allocatedTotal)}</span><button type="button" onClick={() => void prepare()} disabled={busy || !context.ready || !supplierId || !branchId || !bankId || !method || !reference.trim() || !allocations.length} className="min-h-12 w-full rounded-lg bg-blue-600 px-6 font-medium text-white disabled:bg-slate-300 sm:w-auto">Review immutable preview</button></div>
          </section>
        </>}

        {step === 'review' && preparedPayload && <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-semibold">Confirm supplier payment</h2><p className="mt-1 text-sm text-slate-600">Posts one bank disbursement, debits accounts payable, credits the selected bank ledger, and allocates the listed invoices.</p>
          {prepared && <p aria-label="Canonical command ID" className="mt-2 break-all font-mono text-xs text-slate-600">Command: {prepared.command_request_id}</p>}
          <dl className="mt-5 grid gap-3 rounded-lg bg-slate-50 p-4 md:grid-cols-2"><div><dt className="text-xs uppercase text-slate-500">Expected gross reduction</dt><dd className="font-semibold">₹{preparedPayload.expected_gross_amount}</dd></div><div><dt className="text-xs uppercase text-slate-500">Reference</dt><dd className="font-semibold">{preparedPayload.external_reference}</dd></div><div><dt className="text-xs uppercase text-slate-500">Date</dt><dd>{preparedPayload.payment_date}</dd></div><div><dt className="text-xs uppercase text-slate-500">Settlement components</dt><dd>{preparedPayload.allocations.length} posted invoice(s)</dd></div></dl>
          <label className="mt-5 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border p-3"><input type="checkbox" checked={actorConfirmed} onChange={event => setActorConfirmed(event.target.checked)} className="h-5 w-5" /><span>I reviewed the exact bank, reference, amount, and allocations and authorize posting.</span></label>
          <div className="mt-5 flex justify-end gap-3"><button type="button" onClick={() => { setStep('entry'); setActorConfirmed(false); }} disabled={busy || !!postedPaymentId} className="min-h-11 rounded-lg border px-5">Back</button><button type="button" onClick={() => void postOrReconcile()} disabled={busy || !actorConfirmed} className="min-h-11 rounded-lg bg-blue-600 px-6 font-medium text-white disabled:bg-slate-300">{busy ? 'Working…' : postedPaymentId ? 'Reconcile posted payment' : `Post ₹${preparedPayload.expected_gross_amount}`}</button></div>
        </section>}

        {step === 'posted' && posted && <section className="rounded-xl border border-green-200 bg-white p-6"><div className="flex gap-3"><CheckCircle className="h-7 w-7 text-green-600" /><div><h2 className="text-lg font-semibold">Supplier payment reconciled</h2><p className="break-all font-mono text-xs text-slate-600">{posted.payment_id}</p><p className="text-slate-600">{posted.payment_number} · ₹{posted.amount} · journal {posted.journal_number}</p></div></div><div className="mt-5 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900">Allocations, payable residuals, and the balanced two-line journal match authoritative backend data.</div></section>}
      </div></main>
    </div>
  );
};

export default PaymentMade;
