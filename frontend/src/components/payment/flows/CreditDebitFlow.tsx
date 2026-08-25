import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle, FileText, Loader2, RefreshCw } from 'lucide-react';

import { ModuleHeader } from '../../global';
import { clientUuid } from '../../../utils/clientUuid';
import {
  approveCanonicalAction,
  getCanonicalCommandReview,
  getCanonicalCommandStatus,
  type CanonicalCommandPreview,
  type CanonicalCommandReview,
} from '../../../services/api/canonicalOperatorActions';
import {
  canonicalAdjustmentNotesApi,
  executeApprovedAdjustmentNote,
  prepareAdjustmentNote,
  reconcileAdjustmentNote,
  type AdjustmentNoteContext,
  type AdjustmentNotePreparePayload,
  type AdjustmentSide,
  type PostedAdjustmentNote,
} from '../../../services/api/modules/finance/canonicalAdjustmentNotes.api';
import {
  canonicalDocumentHistoryApi,
  type CanonicalDocumentHistoryItem,
} from '../../../services/api/modules/history/canonicalDocumentHistory.api';
import { buildAdjustmentNotePayload } from './adjustmentNoteCommand';
import { compareExactDecimals } from '../../../utils/exactDecimal';

interface CreditDebitFlowProps { onClose: () => void; open?: boolean; noteType?: 'credit' | 'debit' }
type Workspace = 'prepare' | 'approve' | 'execute';

const messageFrom = (error: any): string => {
  const detail = error?.response?.data?.detail;
  return detail?.message || detail || error?.message || 'Canonical adjustment-note request failed.';
};

const CreditDebitFlow: React.FC<CreditDebitFlowProps> = ({ onClose, open = true, noteType = 'credit' }) => {
  const [workspace, setWorkspace] = useState<Workspace>('prepare');
  const [side, setSide] = useState<AdjustmentSide>(noteType === 'debit' ? 'purchase' : 'sales');
  const [documents, setDocuments] = useState<CanonicalDocumentHistoryItem[]>([]);
  const [businessDate, setBusinessDate] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [context, setContext] = useState<AdjustmentNoteContext | null>(null);
  const [ruleId, setRuleId] = useState('');
  const [reason, setReason] = useState('');
  const [quantities, setQuantities] = useState<Record<string, { billed: string; free: string }>>({});
  const [recipientEvidenceId, setRecipientEvidenceId] = useState('');
  const [recipientConfirmedAt, setRecipientConfirmedAt] = useState('');
  const [portalLineId, setPortalLineId] = useState('');
  const [prepared, setPrepared] = useState<CanonicalCommandPreview | null>(null);
  const [preparedPayload, setPreparedPayload] = useState<AdjustmentNotePreparePayload | null>(null);
  const [commandId, setCommandId] = useState('');
  const [review, setReview] = useState<CanonicalCommandReview | null>(null);
  const [statusPreview, setStatusPreview] = useState<CanonicalCommandPreview | null>(null);
  const [posted, setPosted] = useState<PostedAdjustmentNote | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const prepareKey = useRef(`erp-web-adjustment-note-prepare:${clientUuid()}`);
  const approvalKey = useRef(clientUuid());
  const executeKey = useRef(clientUuid());

  const invalidatePreparedDraft = () => {
    setPrepared(null);
    setPreparedPayload(null);
    prepareKey.current = `erp-web-adjustment-note-prepare:${clientUuid()}`;
  };
  const changeCommandId = (value: string) => {
    setCommandId(value);
    setReview(null); setStatusPreview(null); setPosted(null); setConfirmed(false);
    approvalKey.current = clientUuid();
    executeKey.current = clientUuid();
  };

  const loadDocuments = useCallback(async (selectedSide: AdjustmentSide) => {
    setBusy(true); setError(''); setContext(null); setDocumentId(''); setPrepared(null); setPreparedPayload(null); setPosted(null);
    prepareKey.current = `erp-web-adjustment-note-prepare:${clientUuid()}`;
    try {
      const history = await canonicalDocumentHistoryApi.get({
        document_kind: selectedSide === 'sales' ? 'sales_invoice' : 'supplier_invoice',
        status: 'posted', page_size: 100,
      });
      setBusinessDate(history.business_date);
      setDocuments(history.items.filter(row => row.status === 'posted'
        && row.outstanding_amount !== null
        && compareExactDecimals(row.outstanding_amount, '0.00', 'Outstanding adjustment balance', {
          scale: 2, maximumWholeDigits: 20,
        }) > 0));
    } catch (requestError) {
      setDocuments([]); setError(messageFrom(requestError));
    } finally { setBusy(false); }
  }, []);

  useEffect(() => { if (open) void loadDocuments(side); }, [loadDocuments, open, side]);

  const selectDocument = async (nextId: string) => {
    setDocumentId(nextId); setContext(null); invalidatePreparedDraft(); setError(''); setQuantities({});
    if (!nextId || !businessDate) return;
    setBusy(true);
    try {
      const next = (await canonicalAdjustmentNotesApi.getContext(side, nextId, businessDate)).data;
      setContext(next);
      setRuleId('');
      setQuantities(Object.fromEntries(next.lines.map(line => [line.original_line_id, { billed: '', free: '' }])));
    } catch (requestError) { setError(messageFrom(requestError)); }
    finally { setBusy(false); }
  };

  const chosenRule = context?.rule_choices.find(row => row.id === ruleId) || null;
  const selectedDocument = documents.find(row => row.document_id === documentId) || null;
  const previewAmount = useMemo(() => {
    const impact = prepared && Array.isArray(prepared.financial_impact) ? prepared.financial_impact[0] as any : null;
    return impact?.amount ? String(impact.amount) : '';
  }, [prepared]);

  const prepare = async () => {
    if (!context) return;
    setBusy(true); setError('');
    try {
      const payload = buildAdjustmentNotePayload(context, {
        noteDate: businessDate, ruleId, reason, quantities,
        recipientEvidenceId, recipientConfirmedAt, portalLineId,
      }, prepareKey.current);
      const response = await prepareAdjustmentNote(payload);
      setPreparedPayload(payload); setPrepared(response.data); setCommandId(response.data.command_request_id);
    } catch (requestError) { setError(messageFrom(requestError)); }
    finally { setBusy(false); }
  };

  const fetchReview = async () => {
    setBusy(true); setError(''); setReview(null); setConfirmed(false);
    try {
      const next = (await getCanonicalCommandReview(commandId.trim())).data;
      if (next.capability_code !== 'finance.adjustment_note.prepare') throw new Error('This command is not a standalone adjustment note.');
      setReview(next);
    } catch (requestError) { setError(messageFrom(requestError)); }
    finally { setBusy(false); }
  };

  const approve = async () => {
    if (!review || !confirmed) return;
    setBusy(true); setError('');
    try {
      await approveCanonicalAction('finance.adjustment_note.prepare', review, approvalKey.current);
      setReview({ ...review, status: 'approved' }); setConfirmed(false);
    } catch (requestError) { setError(messageFrom(requestError)); }
    finally { setBusy(false); }
  };

  const fetchStatus = async () => {
    setBusy(true); setError(''); setStatusPreview(null); setPosted(null); setConfirmed(false);
    try {
      const next = (await getCanonicalCommandStatus(commandId.trim())).data;
      setStatusPreview(next as CanonicalCommandPreview);
    } catch (requestError) { setError(messageFrom(requestError)); }
    finally { setBusy(false); }
  };

  const execute = async () => {
    if (!statusPreview || !confirmed) return;
    setBusy(true); setError('');
    try {
      const noteId = await executeApprovedAdjustmentNote(statusPreview, executeKey.current);
      setPosted(preparedPayload
        ? await reconcileAdjustmentNote(noteId, preparedPayload)
        : (await canonicalAdjustmentNotesApi.getPosted(noteId)).data);
    } catch (requestError) { setError(messageFrom(requestError)); }
    finally { setBusy(false); }
  };

  if (!open) return null;
  return <div className="flex h-full flex-col bg-slate-50">
    <ModuleHeader title="Credit & Debit Notes" icon={FileText} iconColor="text-blue-600" onClose={onClose} />
    <main className="flex-1 overflow-auto p-5"><div className="mx-auto max-w-6xl space-y-4">
      <nav aria-label="Adjustment note lifecycle" className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2">
        {([['prepare', '1. Prepare note'], ['approve', '2. Independent approval'], ['execute', '3. Execute & verify']] as const).map(([id, label]) =>
          <button key={id} type="button" aria-pressed={workspace === id} onClick={() => { setWorkspace(id); setError(''); setConfirmed(false); }} className={`min-h-11 rounded-lg px-4 text-sm font-medium ${workspace === id ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`}>{label}</button>)}
      </nav>
      {error && <div role="alert" className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800"><AlertCircle className="h-5 w-5 shrink-0" />{error}</div>}
      {busy && <div role="status" className="flex gap-2 rounded-lg border bg-white p-4"><Loader2 className="h-5 w-5 animate-spin" />Working with the canonical API…</div>}

      {workspace === 'prepare' && <>
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Choose the posted source</h2><p className="text-sm text-slate-600">Sales creates a customer credit; Purchase creates a supplier debit. Only documents with an authoritative open balance are shown.</p></div><button type="button" onClick={() => void loadDocuments(side)} disabled={busy} className="min-h-11 rounded-lg border px-4"><RefreshCw className="mr-2 inline h-4 w-4" />Refresh</button></div>
          <fieldset className="mt-4 flex flex-wrap gap-3" aria-label="Adjustment side">
            <label className="flex min-h-11 items-center gap-2 rounded-lg border px-4"><input type="radio" checked={side === 'sales'} onChange={() => setSide('sales')} />Customer credit</label>
            <label className="flex min-h-11 items-center gap-2 rounded-lg border px-4"><input type="radio" checked={side === 'purchase'} onChange={() => setSide('purchase')} />Supplier debit</label>
          </fieldset>
          <label className="mt-4 block text-sm font-medium">Posted {side === 'sales' ? 'sales' : 'supplier'} invoice<select value={documentId} onChange={event => void selectDocument(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border px-3"><option value="">Select document</option>{documents.map(row => <option key={row.document_id} value={row.document_id}>{row.document_number} — {row.party_name} — ₹{row.outstanding_amount}</option>)}</select></label>
          {!busy && documents.length === 0 && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">No eligible posted documents with an open balance were returned. No legacy invoice list is used.</p>}
        </section>
        {context && <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Adjustment facts</h2><p className="text-sm text-slate-600">{context.original_document_number} · {context.party_name} · open ₹{context.original_open_item_outstanding}</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2"><label className="text-sm font-medium">Reviewed GST rule<select value={ruleId} onChange={event => { setRuleId(event.target.value); invalidatePreparedDraft(); }} className="mt-1 min-h-11 w-full rounded-lg border px-3"><option value="">Select reviewed GST rule</option>{context.rule_choices.map(rule => <option key={rule.id} value={rule.id}>{rule.reason_code} — {rule.gst_tax_treatment.replace('_', ' ')}</option>)}</select></label><label className="text-sm font-medium">Business reason<input value={reason} onChange={event => { setReason(event.target.value); invalidatePreparedDraft(); }} maxLength={1024} className="mt-1 min-h-11 w-full rounded-lg border px-3" /></label></div>
          {chosenRule?.gst_tax_treatment === 'statutory' && side === 'sales' && <div className="mt-4 grid gap-4 md:grid-cols-2"><label className="text-sm font-medium">ITC-reversal evidence attachment UUID<input value={recipientEvidenceId} onChange={event => { setRecipientEvidenceId(event.target.value); invalidatePreparedDraft(); }} className="mt-1 min-h-11 w-full rounded-lg border px-3" /></label><label className="text-sm font-medium">ITC reversal confirmed at (RFC 3339 with offset)<input type="text" value={recipientConfirmedAt} placeholder="2026-08-25T10:00:00+05:30" onChange={event => { setRecipientConfirmedAt(event.target.value); invalidatePreparedDraft(); }} className="mt-1 min-h-11 w-full rounded-lg border px-3" /></label></div>}
          {chosenRule?.gst_tax_treatment === 'statutory' && side === 'purchase' && <label className="mt-4 block text-sm font-medium">GSTR-2B supplier credit-note line UUID<input value={portalLineId} onChange={event => { setPortalLineId(event.target.value); invalidatePreparedDraft(); }} className="mt-1 min-h-11 w-full rounded-lg border px-3" /></label>}
          <div className="mt-5 overflow-x-auto"><table className="min-w-full text-sm"><thead><tr className="border-b text-left text-slate-600"><th className="p-3">Product</th><th className="p-3 text-right">Remaining billed</th><th className="p-3 text-right">Adjust billed</th><th className="p-3 text-right">Remaining free</th><th className="p-3 text-right">Adjust free</th></tr></thead><tbody>{context.lines.map(line => <tr key={line.original_line_id} className="border-b border-slate-100"><td className="p-3"><span className="font-medium">{line.product_name}</span><br /><span className="text-slate-500">{line.sku} · {line.uom_code}</span></td><td className="p-3 text-right">{line.remaining_billed_quantity}</td><td className="p-3 text-right"><input aria-label={`Billed quantity for ${line.product_name}`} inputMode="decimal" value={quantities[line.original_line_id]?.billed || ''} onChange={event => { setQuantities(current => ({ ...current, [line.original_line_id]: { ...current[line.original_line_id], billed: event.target.value } })); invalidatePreparedDraft(); }} className="min-h-11 w-28 rounded-lg border px-3 text-right" /></td><td className="p-3 text-right">{line.remaining_free_quantity}</td><td className="p-3 text-right"><input aria-label={`Free quantity for ${line.product_name}`} inputMode="decimal" value={quantities[line.original_line_id]?.free || ''} onChange={event => { setQuantities(current => ({ ...current, [line.original_line_id]: { ...current[line.original_line_id], free: event.target.value } })); invalidatePreparedDraft(); }} className="min-h-11 w-28 rounded-lg border px-3 text-right" /></td></tr>)}</tbody></table></div>
          <div className="mt-5 flex justify-end"><button type="button" onClick={() => void prepare()} disabled={busy || !ruleId} className="min-h-11 rounded-lg bg-blue-600 px-6 font-medium text-white disabled:bg-slate-300">Prepare immutable preview</button></div>
        </section>}
        {prepared && <section className="rounded-xl border border-blue-200 bg-white p-5"><h2 className="text-lg font-semibold">Prepared — independent approval required</h2><p className="mt-1 text-sm text-slate-600">Nothing has posted. Give the command ID to a different authorized reviewer, then return to Execute & verify.</p><dl className="mt-4 grid gap-3 rounded-lg bg-blue-50 p-4 md:grid-cols-2"><div><dt className="text-xs uppercase text-slate-500">Command ID</dt><dd className="break-all font-mono text-sm">{prepared.command_request_id}</dd></div><div><dt className="text-xs uppercase text-slate-500">Exact impact</dt><dd className="font-semibold">{previewAmount ? `₹${previewAmount}` : 'See immutable review'}</dd></div><div className="md:col-span-2"><dt className="text-xs uppercase text-slate-500">Preview hash</dt><dd className="break-all font-mono text-xs">{prepared.preview_hash}</dd></div></dl></section>}
      </>}

      {workspace === 'approve' && <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-semibold">Independent checker approval</h2><p className="text-sm text-slate-600">Sign in as a different authorized reviewer. The API loads immutable preview bytes; it rejects self-approval and cross-tenant commands.</p><div className="mt-4 flex gap-3"><label className="flex-1 text-sm font-medium">Command ID<input value={commandId} onChange={event => changeCommandId(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border px-3" /></label><button type="button" onClick={() => void fetchReview()} disabled={busy || !commandId} className="min-h-11 self-end rounded-lg border px-5">Load review</button></div>{review && <div className="mt-5 rounded-lg border p-4"><p className="font-medium">{review.command_type} · {review.status}</p><p className="mt-1 break-all text-xs text-slate-600">{review.preview_hash}</p><pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs">{review.preview_canonical_json}</pre>{review.status === 'prepared' && <><label className="mt-4 flex min-h-11 items-center gap-3 rounded-lg border p-3"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>I independently reviewed the exact immutable preview and approve this command.</span></label><button type="button" onClick={() => void approve()} disabled={!confirmed || busy} className="mt-4 min-h-11 rounded-lg bg-blue-600 px-6 font-medium text-white disabled:bg-slate-300">Approve exact preview</button></>}</div>}</section>}

      {workspace === 'execute' && <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-semibold">Requester execute and authoritative readback</h2><p className="text-sm text-slate-600">Return as the original requester. Status is read-only; execution is allowed only after the separate approval exists.</p><div className="mt-4 flex gap-3"><label className="flex-1 text-sm font-medium">Command ID<input value={commandId} onChange={event => changeCommandId(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border px-3" /></label><button type="button" onClick={() => void fetchStatus()} disabled={busy || !commandId} className="min-h-11 self-end rounded-lg border px-5">Check status</button></div>{statusPreview && !posted && <div className="mt-5 rounded-lg border p-4"><p className="font-medium">Status: {String((statusPreview as any).status)}</p><p className="break-all text-xs text-slate-600">{statusPreview.preview_hash}</p>{String((statusPreview as any).status) === 'approved' && <><label className="mt-4 flex min-h-11 items-center gap-3 rounded-lg border p-3"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>I am the requester and authorize one idempotent execution of this approved preview.</span></label><button type="button" onClick={() => void execute()} disabled={!confirmed || busy} className="mt-4 min-h-11 rounded-lg bg-blue-600 px-6 font-medium text-white disabled:bg-slate-300">Execute approved note</button></>}</div>}{posted && <div className="mt-5 flex gap-3 rounded-lg border border-green-200 bg-green-50 p-5 text-green-900"><CheckCircle className="h-6 w-6 shrink-0" /><div><h3 className="font-semibold">Posted and reconciled</h3><p>{posted.note_number} · ₹{posted.counterparty_payable_amount}</p><p className="text-sm">Journal debit ₹{posted.journal_debit_total} = credit ₹{posted.journal_credit_total}; allocation and residual were loaded from the canonical readback.</p></div></div>}</section>}
      {selectedDocument && <p className="sr-only">Selected source {selectedDocument.document_number}</p>}
    </div></main>
  </div>;
};

export default CreditDebitFlow;
