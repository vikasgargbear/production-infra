import React, { useMemo, useState } from 'react';
import { RotateCcw, Search, ShieldCheck, Play, FileCheck2 } from 'lucide-react';
import { clientUuid } from '../../utils/clientUuid';
import type { CanonicalCommandReview } from '../../services/api/canonicalOperatorActions';
import {
  approveCommercialReversal,
  executeCommercialReversal,
  loadCommercialReversalSource,
  prepareCommercialReversal,
  readCommercialReversal,
  reviewCommercialReversal,
  type CommercialReversalKind,
  type CommercialReversalReadback,
} from './utils/commercialReversalCommand';

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

const CommercialReversalFlow: React.FC = () => {
  const [kind, setKind] = useState<CommercialReversalKind>('sales_return');
  const [sourceId, setSourceId] = useState('');
  const [rowVersion, setRowVersion] = useState('');
  const [reversalDate, setReversalDate] = useState(today);
  const [reason, setReason] = useState('');
  const [evidenceId, setEvidenceId] = useState('');
  const [commandId, setCommandId] = useState('');
  const [review, setReview] = useState<CanonicalCommandReview | null>(null);
  const [readback, setReadback] = useState<CommercialReversalReadback | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const prepareIdentity = useMemo(() => clientUuid(), [kind, sourceId]);
  const canPrepare = Boolean(sourceId && rowVersion && reversalDate && reason.trim().length >= 8);

  const perform = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage('');
    try { await action(); } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Canonical reversal action failed.');
    } finally { setBusy(false); }
  };

  const prepare = () => perform(async () => {
    const preview = await prepareCommercialReversal({
      kind,
      originalResourceId: sourceId,
      expectedRowVersion: rowVersion,
      reversalDate,
      reason,
      amendmentEvidenceAttachmentId: evidenceId || undefined,
      idempotencyKey: `erp-web-commercial-reversal-prepare:${prepareIdentity}`,
    });
    setCommandId(preview.command_request_id);
    const next = await reviewCommercialReversal(preview.command_request_id);
    setReview(next);
    setMessage('Immutable preview prepared. A distinct authorized membership must review and approve it.');
  });

  const resolveSource = () => perform(async () => {
    const source = await loadCommercialReversalSource(kind, sourceId);
    setRowVersion(String(source.expected_row_version));
    if (reversalDate < source.original_note_date) setReversalDate(source.original_note_date);
    setMessage(source.amendment_evidence_required
      ? 'Exact source resolved. Verified statutory amendment/counter-note evidence is required.'
      : 'Exact unreported source resolved. The command will create a direct counter-document.');
  });

  const loadReview = () => perform(async () => {
    const next = await reviewCommercialReversal(commandId);
    setReview(next);
    setReadback(null);
    setMessage('Exact immutable command preview loaded.');
  });

  const approve = () => perform(async () => {
    if (!review) throw new Error('Load the immutable command review first.');
    await approveCommercialReversal(review, clientUuid());
    setMessage('Independent approval recorded against this exact preview. The requester can now execute it.');
  });

  const execute = () => perform(async () => {
    if (!review) throw new Error('Load the approved immutable command review first.');
    await executeCommercialReversal(review, clientUuid());
    const exact = await readCommercialReversal(review.command_request_id);
    setReadback(exact);
    setMessage('Compensating evidence posted and reconciled to the authoritative readback.');
  });

  return <div className="mx-auto max-w-5xl space-y-5 p-5" data-testid="commercial-reversal-flow">
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-amber-950"><RotateCcw className="h-5 w-5" />Correct an erroneous posted return or note</h2>
      <p className="mt-1 text-sm text-amber-900">This never deletes history. Normal goods returns still use the return and credit/debit-note flows. Use this only to post exact compensating evidence.</p>
    </div>

    <section className="grid gap-4 rounded-xl border bg-white p-5 md:grid-cols-2" aria-label="Prepare reversal">
      <label className="text-sm font-medium">Posted source type<select className="mt-1 w-full rounded border p-2" value={kind} onChange={event => setKind(event.target.value as CommercialReversalKind)}><option value="sales_return">Sales return</option><option value="purchase_return">Purchase return</option><option value="adjustment_note">Customer credit / supplier debit note</option></select></label>
      <label className="text-sm font-medium">Exact source UUID<input className="mt-1 w-full rounded border p-2 font-mono" value={sourceId} onChange={event => { setSourceId(event.target.value); setRowVersion(''); }} /></label>
      <div><button disabled={busy} onClick={resolveSource} className="mt-6 rounded border px-3 py-2">Resolve exact posted source</button></div>
      <label className="text-sm font-medium">Authoritative row version<input aria-label="Authoritative row version" className="mt-1 w-full rounded border bg-gray-50 p-2" readOnly value={rowVersion} /></label>
      <label className="text-sm font-medium">Counter-document date<input className="mt-1 w-full rounded border p-2" type="date" value={reversalDate} onChange={event => setReversalDate(event.target.value)} /></label>
      <label className="text-sm font-medium md:col-span-2">Why was the posted source erroneous?<textarea className="mt-1 w-full rounded border p-2" value={reason} onChange={event => setReason(event.target.value)} /></label>
      <label className="text-sm font-medium md:col-span-2">Verified amendment/counter-note attachment UUID <span className="font-normal text-gray-500">(required only after statutory reporting)</span><input className="mt-1 w-full rounded border p-2 font-mono" value={evidenceId} onChange={event => setEvidenceId(event.target.value)} /></label>
      <button disabled={busy || !canPrepare} onClick={prepare} className="rounded bg-amber-700 px-4 py-2 font-medium text-white disabled:opacity-50">Prepare immutable review</button>
    </section>

    <section className="rounded-xl border bg-white p-5" aria-label="Review approve execute reversal">
      <label className="text-sm font-medium">Command UUID<input className="mt-1 w-full rounded border p-2 font-mono" value={commandId} onChange={event => setCommandId(event.target.value)} /></label>
      <div className="mt-3 flex flex-wrap gap-2"><button disabled={busy} onClick={loadReview} className="flex items-center gap-2 rounded border px-3 py-2"><Search className="h-4 w-4" />Load exact review</button><button disabled={busy || !review} onClick={approve} className="flex items-center gap-2 rounded border border-blue-600 px-3 py-2 text-blue-700"><ShieldCheck className="h-4 w-4" />Approve as distinct reviewer</button><button disabled={busy || !review} onClick={execute} className="flex items-center gap-2 rounded bg-green-700 px-3 py-2 text-white"><Play className="h-4 w-4" />Execute as requester</button></div>
      {review && <pre className="mt-4 max-h-80 overflow-auto rounded bg-slate-950 p-3 text-xs text-slate-100" data-testid="canonical-immutable-preview">{review.preview_canonical_json}</pre>}
    </section>

    {message && <p role="status" className="rounded border bg-white p-3 text-sm">{message}</p>}
    {readback && <section className="rounded-xl border border-green-200 bg-green-50 p-5" data-testid="commercial-reversal-readback"><h3 className="flex items-center gap-2 font-semibold text-green-900"><FileCheck2 className="h-5 w-5" />Authoritative compensating readback</h3><dl className="mt-3 grid gap-2 text-sm md:grid-cols-2"><div><dt>Counter note</dt><dd className="font-mono">{readback.reversal_adjustment_note_id}</dd></div><div><dt>Journal</dt><dd className="font-mono">{readback.reversal_journal_id}</dd></div><div><dt>Balanced amount</dt><dd>{readback.journal_debit_total} / {readback.journal_credit_total}</dd></div><div><dt>Exact stock inversions</dt><dd>{readback.stock_entries.length}</dd></div></dl></section>}
  </div>;
};

export default CommercialReversalFlow;
