import React from 'react';
import { AlertTriangle, CheckCircle, Search, ShieldCheck, Play } from 'lucide-react';

import type { CanonicalCommandPreview, CanonicalCommandReview } from '../../../services/api/canonicalOperatorActions';
import {
  approveCustomerChequeAction,
  executeCustomerChequeAction,
  loadCustomerChequeReceiptSource,
  prepareCustomerChequeAction,
  reviewCustomerChequeAction,
  type CustomerChequeAction,
  type CustomerChequeReceiptSource,
} from '../../../services/api/modules/finance/customerChequeActions.api';
import {
  getCustomerReceiptContext,
  type CustomerReceiptContext,
} from '../../../services/api/modules/finance/customerReceipts.api';
import { clientUuid } from '../../../utils/clientUuid';

const CustomerChequeLifecycleFlow: React.FC = () => {
  const [action, setAction] = React.useState<CustomerChequeAction>('clearance');
  const [sourceId, setSourceId] = React.useState('');
  const [source, setSource] = React.useState<CustomerChequeReceiptSource | null>(null);
  const [date, setDate] = React.useState('');
  const [evidenceId, setEvidenceId] = React.useState('');
  const [bankId, setBankId] = React.useState('');
  const [reference, setReference] = React.useState('');
  const [reason, setReason] = React.useState<'funds_insufficient' | 'signature_mismatch' | 'account_closed' | 'payment_stopped' | 'instrument_invalid' | 'other'>('funds_insufficient');
  const [commandId, setCommandId] = React.useState('');
  const [preview, setPreview] = React.useState<CanonicalCommandPreview | null>(null);
  const [review, setReview] = React.useState<CanonicalCommandReview | null>(null);
  const [confirmed, setConfirmed] = React.useState(false);
  const [result, setResult] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [settlementAccounts, setSettlementAccounts] = React.useState<CustomerReceiptContext['settlement_accounts']>([]);
  const prepareIdentity = React.useRef(clientUuid());
  const sourceResolutionSequence = React.useRef(0);
  const reviewResolutionSequence = React.useRef(0);

  React.useEffect(() => {
    let active = true;
    void getCustomerReceiptContext().then(response => {
      if (!active) return;
      setSettlementAccounts(response.data.settlement_accounts);
      setDate(response.data.business_date);
    }).catch(() => {
      if (active) setError('Canonical cheque context could not be loaded. Terminal actions remain unavailable.');
    });
    return () => { active = false; };
  }, []);

  const perform = async (work: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setMessage('');
    try { await work(); } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Canonical cheque action failed.');
    } finally { setBusy(false); }
  };

  const resolveSource = () => perform(async () => {
    const requestSequence = ++sourceResolutionSequence.current;
    const exact = await loadCustomerChequeReceiptSource(sourceId.trim());
    if (requestSequence !== sourceResolutionSequence.current) return;
    setSource(exact);
    setEvidenceId(exact.evidence_attachment_id);
    setPreview(null);
    setReview(null);
    setResult('');
    prepareIdentity.current = clientUuid();
    setMessage('Exact uncleared cheque receipt resolved with its authoritative row version.');
  });

  const prepare = () => perform(async () => {
    if (!source) throw new Error('Resolve one exact uncleared cheque receipt first.');
    const next = await prepareCustomerChequeAction(action, {
      branch_id: source.branch_id,
      original_payment_id: source.payment_id,
      original_payment_row_version: source.row_version,
      action_date: date,
      evidence_attachment_id: evidenceId,
      bank_account_id: action === 'clearance' ? bankId : undefined,
      clearance_reference: action === 'clearance' ? reference : undefined,
      reason_code: action === 'bounce' ? reason : undefined,
    }, `erp-web-customer-cheque-${action}-prepare:${prepareIdentity.current}`);
    setPreview(next);
    setReview(null);
    setCommandId(next.command_request_id);
    setMessage('Immutable preview prepared. A distinct finance reviewer must approve this exact command.');
  });

  const loadReview = () => perform(async () => {
    const requestSequence = ++reviewResolutionSequence.current;
    const next = await reviewCustomerChequeAction(commandId.trim());
    if (requestSequence !== reviewResolutionSequence.current) return;
    setReview(next);
    setPreview(next);
    setAction(next.capability_code === 'finance.customer_cheque_bounce.prepare' ? 'bounce' : 'clearance');
    setConfirmed(false);
    setResult('');
    setMessage('Exact immutable cheque command loaded.');
  });

  const approve = () => perform(async () => {
    if (!review) throw new Error('Load the exact immutable cheque command first.');
    await approveCustomerChequeAction(review, clientUuid());
    setMessage('Independent approval recorded. The original requester can now reload and execute it.');
  });

  const execute = () => perform(async () => {
    if (!review || !confirmed) throw new Error('Load and confirm the independently approved command first.');
    const paymentId = await executeCustomerChequeAction(action, review, clientUuid());
    setResult(paymentId);
    setPreview(null);
    setReview(null);
    setConfirmed(false);
    setMessage('Cheque terminal action posted and reconciled to its authoritative receipt, allocation, and journal readback.');
  });

  const canPrepare = Boolean(source && date && evidenceId && (
    action === 'clearance' ? bankId && reference.trim() : reason
  ));

  return <div className="mx-auto max-w-5xl space-y-5 p-5" data-testid="customer-cheque-lifecycle-flow">
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
      <h2 className="text-lg font-semibold text-blue-950">Clear or bounce an exact posted customer cheque</h2>
      <p className="mt-1 text-sm text-blue-900">The requester prepares; a different finance member approves; the requester then executes once. This screen never creates a receipt or selects a recent payment.</p>
    </div>

    <section className="grid gap-4 rounded-xl border bg-white p-5 md:grid-cols-2" aria-label="Prepare cheque terminal action">
      <label className="text-sm font-medium md:col-span-2">Exact posted cheque receipt UUID
        <input value={sourceId} onChange={event => { sourceResolutionSequence.current += 1; setSourceId(event.target.value); setSource(null); }} className="mt-1 min-h-11 w-full rounded border px-3 font-mono" />
      </label>
      <button type="button" onClick={resolveSource} disabled={busy || !sourceId.trim()} className="min-h-11 rounded border px-4">Resolve exact cheque receipt</button>
      <p className="self-center break-all text-xs text-slate-600">{source ? `Branch ${source.branch_id} · row ${source.row_version}` : 'No source resolved'}</p>
      <label className="text-sm font-medium">Action
        <select value={action} onChange={event => { setAction(event.target.value as CustomerChequeAction); setPreview(null); prepareIdentity.current = clientUuid(); }} className="mt-1 min-h-11 w-full rounded border px-3">
          <option value="clearance">Clear into bank</option><option value="bounce">Bounce and compensate</option>
        </select>
      </label>
      <label className="text-sm font-medium">Action date<input aria-label="Action date" type="date" value={date} onChange={event => setDate(event.target.value)} className="mt-1 min-h-11 w-full rounded border px-3" /></label>
      <label className="text-sm font-medium md:col-span-2">Verified evidence ID<input value={evidenceId} onChange={event => setEvidenceId(event.target.value)} className="mt-1 min-h-11 w-full rounded border px-3 font-mono" /></label>
      {action === 'clearance' ? <>
        <label className="text-sm font-medium">Settlement bank account<select value={bankId} onChange={event => setBankId(event.target.value)} className="mt-1 min-h-11 w-full rounded border px-3"><option value="">Select canonical bank</option>{settlementAccounts.map(account => <option key={account.bank_account_id} value={account.bank_account_id}>{account.bank_name} · {account.settlement_account_code}</option>)}</select></label>
        <label className="text-sm font-medium">Clearance reference<input value={reference} onChange={event => setReference(event.target.value)} className="mt-1 min-h-11 w-full rounded border px-3" /></label>
      </> : <label className="text-sm font-medium">Bounce reason<select value={reason} onChange={event => setReason(event.target.value as typeof reason)} className="mt-1 min-h-11 w-full rounded border px-3"><option value="funds_insufficient">Funds insufficient</option><option value="signature_mismatch">Signature mismatch</option><option value="account_closed">Account closed</option><option value="payment_stopped">Payment stopped</option><option value="instrument_invalid">Instrument invalid</option><option value="other">Other</option></select></label>}
      <button type="button" onClick={prepare} disabled={busy || !canPrepare} className="min-h-11 rounded bg-blue-700 px-4 font-semibold text-white disabled:bg-slate-300">Prepare terminal action</button>
    </section>

    <section className="rounded-xl border bg-white p-5" aria-label="Review approve execute cheque action">
      <label className="text-sm font-medium">Command UUID<input value={commandId} onChange={event => { reviewResolutionSequence.current += 1; setCommandId(event.target.value); setReview(null); }} className="mt-1 min-h-11 w-full rounded border px-3 font-mono" /></label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={loadReview} disabled={busy || !commandId.trim()} className="flex min-h-11 items-center gap-2 rounded border px-4"><Search className="h-4 w-4" />Load exact review</button>
        <button type="button" onClick={approve} disabled={busy || !review || review.status !== 'pending_approval'} className="flex min-h-11 items-center gap-2 rounded border border-blue-600 px-4 text-blue-700 disabled:opacity-50"><ShieldCheck className="h-4 w-4" />Approve as distinct reviewer</button>
      </div>
      {(preview || review) && <pre data-testid="canonical-immutable-preview" className="mt-4 max-h-80 overflow-auto rounded bg-slate-950 p-3 text-xs text-slate-100">{review?.preview_canonical_json || JSON.stringify(preview, null, 2)}</pre>}
      {review?.status === 'approved' && <div className="mt-4 rounded border border-amber-300 bg-amber-50 p-4">
        <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I am the original requester and authorize one execution of this approved cheque action.</label>
        <button type="button" onClick={execute} disabled={busy || !confirmed} className="mt-3 flex min-h-11 items-center gap-2 rounded bg-green-700 px-4 font-semibold text-white disabled:bg-slate-300"><Play className="h-4 w-4" />Execute as requester</button>
      </div>}
    </section>

    {message && <p role="status" className="rounded border bg-white p-3 text-sm">{message}</p>}
    {result && <div role="status" className="rounded border border-green-200 bg-green-50 p-4 text-green-900"><p className="flex items-center gap-2 font-semibold"><CheckCircle className="h-5 w-5" />Cheque terminal action posted and reconciled</p><p data-testid="canonical-posted-resource-id" className="mt-2 break-all font-mono text-xs">{result}</p></div>}
    {error && <p role="alert" className="flex items-center gap-2 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertTriangle className="h-4 w-4" />{error}</p>}
  </div>;
};

export default CustomerChequeLifecycleFlow;
