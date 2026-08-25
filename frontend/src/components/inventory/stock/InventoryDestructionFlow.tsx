import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';

import { ModuleHeader } from '../../global';
import { clientUuid } from '../../../utils/clientUuid';
import {
  approveCanonicalAction,
  executeApprovedCanonicalAction,
  getCanonicalCommandReview,
  getCanonicalCommandStatus,
  prepareCanonicalAction,
  type CanonicalCommandPreview,
  type CanonicalCommandReview,
} from '../../../services/api/canonicalOperatorActions';
import {
  canonicalControlledOperationsApi,
  type InventoryDestructionContext,
  type InventoryDestructionReadback,
} from '../../../services/api/modules/controlledOperations.api';
import { compareExactDecimals, formatExactCurrency } from '../../../utils/exactDecimal';
import {
  isCanonicalUtcEventTimestamp,
  requireCanonicalUtcEventTimestamp,
} from './utils/canonicalEventTimestamp';

interface Props { open?: boolean; onClose?: () => void }
type Workspace = 'prepare' | 'approve' | 'execute';
type ReasonCode = 'expired' | 'damaged' | 'quality_rejected';
const messageFrom = (error: any): string => {
  const detail = error?.response?.data?.detail;
  return detail?.message || detail || error?.message || 'Canonical destruction request failed.';
};

const InventoryDestructionFlow: React.FC<Props> = ({ open = true, onClose }) => {
  const [workspace, setWorkspace] = useState<Workspace>('prepare');
  const [context, setContext] = useState<InventoryDestructionContext | null>(null);
  const [candidateId, setCandidateId] = useState('');
  const [certificateId, setCertificateId] = useState('');
  const [itcReversalEvidenceId, setItcReversalEvidenceId] = useState('');
  const [reasonCode, setReasonCode] = useState<ReasonCode | ''>('');
  const [reason, setReason] = useState('');
  const [authorityReference, setAuthorityReference] = useState('');
  const [witnessName, setWitnessName] = useState('');
  const [witnessCredential, setWitnessCredential] = useState('');
  const [physicalConfirmed, setPhysicalConfirmed] = useState(false);
  const [physicalConfirmedAt, setPhysicalConfirmedAt] = useState('');
  const [prepared, setPrepared] = useState<CanonicalCommandPreview | null>(null);
  const [commandId, setCommandId] = useState('');
  const [review, setReview] = useState<CanonicalCommandReview | null>(null);
  const [status, setStatus] = useState<CanonicalCommandPreview | null>(null);
  const [readback, setReadback] = useState<InventoryDestructionReadback | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const prepareKey = useRef(`erp-web-inventory-destruction-prepare:${clientUuid()}`);
  const lineId = useRef(clientUuid());
  const approvalKey = useRef(clientUuid());
  const executionKey = useRef(clientUuid());
  const candidate = context?.candidates.find(
    row => `${row.batch_id}:${row.uom_conversion_id}` === candidateId,
  ) || null;

  const invalidate = () => {
    setPrepared(null); setReview(null); setStatus(null); setReadback(null); setConfirmed(false);
    prepareKey.current = `erp-web-inventory-destruction-prepare:${clientUuid()}`;
    lineId.current = clientUuid();
  };
  const load = useCallback(async () => {
    setBusy(true); setError(''); invalidate();
    try { setContext((await canonicalControlledOperationsApi.destructionContext()).data); setCandidateId(''); setCertificateId(''); setItcReversalEvidenceId(''); }
    catch (requestError) { setContext(null); setError(messageFrom(requestError)); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { if (open) void load(); }, [load, open]);

  const prepare = async () => {
    if (!context || !candidate || !certificateId || !itcReversalEvidenceId || !reasonCode || !physicalConfirmed) return;
    if (!isCanonicalUtcEventTimestamp(physicalConfirmedAt)) {
      setError('Enter the exact physical destruction time as canonical UTC: YYYY-MM-DDTHH:mm:ss.sssZ.');
      return;
    }
    setBusy(true); setError('');
    try {
      const response = await prepareCanonicalAction('inventory.destruction.prepare', {
        idempotency_key: prepareKey.current,
        branch_id: candidate.branch_id,
        destruction_date: context.business_date,
        physical_destruction_confirmed_at: requireCanonicalUtcEventTimestamp(
          physicalConfirmedAt,
          'Physical destruction time',
        ),
        location_id: candidate.location_id,
        method_code: context.method_code,
        reason_code: reasonCode,
        reason: reason.trim(),
        authority_reference: authorityReference.trim(),
        witness_name: witnessName.trim(),
        witness_credential: witnessCredential.trim(),
        certificate_attachment_id: certificateId,
        itc_reversal_evidence_attachment_id: itcReversalEvidenceId,
        itc_treatment: context.itc_treatment,
        lines: [{
          product_id: candidate.product_id,
          uom_conversion_id: candidate.uom_conversion_id,
          batch_allocations: [{
            inventory_document_line_id: lineId.current,
            batch_id: candidate.batch_id,
            entered_quantity: candidate.available_selected_quantity,
          }],
        }],
      });
      setPrepared(response.data); setCommandId(response.data.command_request_id);
    } catch (requestError) { setError(messageFrom(requestError)); }
    finally { setBusy(false); }
  };
  const changeCommand = (value: string) => {
    setCommandId(value); setReview(null); setStatus(null); setReadback(null); setConfirmed(false);
    approvalKey.current = clientUuid(); executionKey.current = clientUuid();
  };
  const loadReview = async () => {
    setBusy(true); setError(''); setReview(null); setConfirmed(false);
    try {
      const next = (await getCanonicalCommandReview(commandId.trim())).data;
      if (next.capability_code !== 'inventory.destruction.prepare') throw new Error('This command is not a canonical destruction.');
      setReview(next);
    } catch (requestError) { setError(messageFrom(requestError)); }
    finally { setBusy(false); }
  };
  const approve = async () => {
    if (!review || !confirmed) return;
    setBusy(true); setError('');
    try { await approveCanonicalAction('inventory.destruction.prepare', review, approvalKey.current); setReview({ ...review, status: 'approved' }); setConfirmed(false); }
    catch (requestError) { setError(messageFrom(requestError)); }
    finally { setBusy(false); }
  };
  const loadStatus = async () => {
    setBusy(true); setError(''); setStatus(null); setReadback(null); setConfirmed(false);
    try { setStatus((await getCanonicalCommandStatus(commandId.trim())).data); }
    catch (requestError) { setError(messageFrom(requestError)); }
    finally { setBusy(false); }
  };
  const execute = async () => {
    if (!status || !confirmed) return;
    setBusy(true); setError('');
    try {
      await executeApprovedCanonicalAction('inventory.destruction.prepare', status, executionKey.current);
      const posted = (await canonicalControlledOperationsApi.destructionReadback(commandId.trim())).data;
      if (candidate && (posted.certificate_attachment_id !== certificateId
          || posted.itc_reversal_evidence_attachment_id !== itcReversalEvidenceId
          || posted.lines.length !== 1 || posted.lines[0].batch_id !== candidate.batch_id
          || compareExactDecimals(posted.total_destroyed_base_quantity,
            candidate.available_base_quantity, 'Destroyed base quantity', {
              scale: 6, maximumWholeDigits: 14,
            }) !== 0
          || compareExactDecimals(posted.total_destroyed_value,
            candidate.inventory_value, 'Destroyed inventory value', {
              scale: 2, maximumWholeDigits: 18,
            }) !== 0
          || compareExactDecimals(posted.journal_debit_total,
            posted.journal_credit_total, 'Destruction journal', {
              scale: 2, maximumWholeDigits: 18,
            }) !== 0)) {
        throw new Error('Posted destruction does not reconcile to selected stock, certificate, and journal evidence.');
      }
      setReadback(posted); setConfirmed(false);
    } catch (requestError) { setError(messageFrom(requestError)); }
    finally { setBusy(false); }
  };

  if (!open) return null;
  return <div className="flex h-full flex-col bg-slate-50">
    <ModuleHeader title="Certified Destruction" icon={ShieldAlert} iconColor="text-red-600" onClose={onClose} />
    <main className="flex-1 overflow-auto p-5" data-testid="canonical-immutable-preview"><div className="mx-auto max-w-6xl space-y-4">
      <nav aria-label="Inventory destruction lifecycle" className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2">{([['prepare', '1. Evidence & stock'], ['approve', '2. Independent approval'], ['execute', '3. Execute & verify']] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={workspace === id} onClick={() => { setWorkspace(id); setError(''); setConfirmed(false); }} className={`min-h-11 rounded-lg px-4 text-sm font-medium ${workspace === id ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`}>{label}</button>)}</nav>
      {error && <div role="alert" className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800"><AlertCircle className="h-5 w-5 shrink-0" />{error}</div>}
      {busy && <div role="status" className="flex gap-2 rounded-lg border bg-white p-4"><Loader2 className="h-5 w-5 animate-spin" />Working with the canonical API…</div>}
      {workspace === 'prepare' && <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Certified full-balance destruction</h2><p className="text-sm text-slate-600">Only already destroyed, witnessed stock with verified same-day evidence can be prepared. This UI never treats deletion or a stock adjustment as destruction.</p></div><button type="button" onClick={() => void load()} disabled={busy} className="min-h-11 rounded-lg border px-4"><RefreshCw className="mr-2 inline h-4 w-4" />Refresh</button></div>
        {context && !context.ready && <div role="status" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900"><p className="font-medium">Posting unavailable</p><ul className="mt-2 list-disc pl-5">{context.blocking_reasons.map(row => <li key={row}>{row}</li>)}</ul></div>}
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900"><p className="font-medium">Certificate upload unavailable</p><p className="text-sm">{context?.certificate_upload_message || 'The canonical evidence-upload boundary is unavailable.'}</p></div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium">Eligible full stock balance<select value={candidateId} onChange={event => { setCandidateId(event.target.value); setReasonCode(''); invalidate(); }} className="mt-1 min-h-11 w-full rounded-lg border px-3"><option value="">Select stock</option>{context?.candidates.map(row => <option key={`${row.batch_id}:${row.uom_conversion_id}`} value={`${row.batch_id}:${row.uom_conversion_id}`}>{row.branch_code} · {row.location_code} · {row.product_name} · {row.batch_number} · {row.available_selected_quantity} {row.selected_uom_code} · {formatExactCurrency(row.inventory_value, 'Inventory value')}</option>)}</select></label>
          <label className="text-sm font-medium">Verified destruction certificate<select value={certificateId} onChange={event => { setCertificateId(event.target.value); invalidate(); }} className="mt-1 min-h-11 w-full rounded-lg border px-3"><option value="">Select certificate</option>{context?.certificates.map(row => <option key={row.certificate_attachment_id} value={row.certificate_attachment_id}>{row.original_filename} · {row.document_date}</option>)}</select></label>
          <label className="text-sm font-medium">Verified Section 17(5)(h) reversal evidence<select value={itcReversalEvidenceId} onChange={event => { setItcReversalEvidenceId(event.target.value); invalidate(); }} className="mt-1 min-h-11 w-full rounded-lg border px-3"><option value="">Select reversal evidence</option>{context?.itc_reversal_evidence.map(row => <option key={row.certificate_attachment_id} value={row.certificate_attachment_id}>{row.original_filename} · {row.document_date}</option>)}</select></label>
          <label className="text-sm font-medium">Reason code<select value={reasonCode} onChange={event => { setReasonCode(event.target.value as ReasonCode); invalidate(); }} className="mt-1 min-h-11 w-full rounded-lg border px-3"><option value="">Select reviewed reason</option>{candidate && context && candidate.expires_on <= context.business_date && <option value="expired">Expired</option>}{candidate?.batch_status !== 'expired' && <><option value="damaged">Damaged</option><option value="quality_rejected">Quality rejected</option></>}</select></label>
          <label className="text-sm font-medium">Detailed reason<input value={reason} onChange={event => { setReason(event.target.value); invalidate(); }} maxLength={1024} className="mt-1 min-h-11 w-full rounded-lg border px-3" /></label>
          <label className="text-sm font-medium">Authority reference<input value={authorityReference} onChange={event => { setAuthorityReference(event.target.value); invalidate(); }} maxLength={1024} className="mt-1 min-h-11 w-full rounded-lg border px-3" /></label>
          <label className="text-sm font-medium">Witness name<input value={witnessName} onChange={event => { setWitnessName(event.target.value); invalidate(); }} maxLength={1024} className="mt-1 min-h-11 w-full rounded-lg border px-3" /></label>
          <label className="text-sm font-medium">Witness credential<input value={witnessCredential} onChange={event => { setWitnessCredential(event.target.value); invalidate(); }} maxLength={1024} className="mt-1 min-h-11 w-full rounded-lg border px-3" /></label>
          <label className="text-sm font-medium">Physical destruction completed at (UTC)<input type="text" value={physicalConfirmedAt} onChange={event => { setPhysicalConfirmedAt(event.target.value); invalidate(); }} placeholder="YYYY-MM-DDTHH:mm:ss.sssZ" aria-describedby="destruction-time-help" aria-invalid={Boolean(physicalConfirmedAt) && !isCanonicalUtcEventTimestamp(physicalConfirmedAt)} className="mt-1 min-h-11 w-full rounded-lg border px-3 font-mono" /><span id="destruction-time-help" className="mt-1 block text-xs font-normal text-slate-500">Enter the exact timestamp recorded by the retained certificate or witness evidence. The browser does not supply or convert this time.</span></label>
        </div>
        {candidate && <div className="mt-4 rounded-lg border p-4"><p className="font-medium">{candidate.product_name} · batch {candidate.batch_number}</p><p className="text-sm text-slate-600">Full locked balance {candidate.available_base_quantity} {candidate.base_uom_code}; value {formatExactCurrency(candidate.inventory_value, 'Inventory value')}. Partial quantity editing is intentionally unavailable.</p><p className="mt-2 text-sm text-slate-700">Exact residual input-credit lineage: {candidate.input_credit_lot_count} lot(s); CGST {formatExactCurrency(candidate.eligible_itc_cgst_amount, 'Eligible CGST')}, SGST {formatExactCurrency(candidate.eligible_itc_sgst_amount, 'Eligible SGST')}, IGST {formatExactCurrency(candidate.eligible_itc_igst_amount, 'Eligible IGST')}, cess {formatExactCurrency(candidate.eligible_itc_cess_amount, 'Eligible cess')}.</p></div>}
        <label className="mt-4 flex min-h-11 items-start gap-3 rounded-lg border border-red-200 p-3"><input type="checkbox" checked={physicalConfirmed} onChange={event => { setPhysicalConfirmed(event.target.checked); invalidate(); }} /><span>I confirm the physical licensed incineration occurred at the entered evidence timestamp and the selected certificate and witness details are exact.</span></label>
        <div className="mt-5 flex justify-end"><button type="button" onClick={() => void prepare()} disabled={busy || !context?.ready || !candidate || !certificateId || !itcReversalEvidenceId || !reasonCode || !reason.trim() || !authorityReference.trim() || !witnessName.trim() || !witnessCredential.trim() || !isCanonicalUtcEventTimestamp(physicalConfirmedAt) || !physicalConfirmed} className="min-h-11 rounded-lg bg-red-600 px-6 font-medium text-white disabled:bg-slate-300">Prepare immutable destruction</button></div>
        {prepared && <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4"><p className="font-medium">Prepared; no stock or journal has posted.</p><p className="break-all font-mono text-xs">{prepared.command_request_id}</p><p className="break-all font-mono text-xs">{prepared.preview_hash}</p></div>}
      </section>}
      {workspace === 'approve' && <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-semibold">Independent destruction approval</h2><p className="text-sm text-slate-600">A different authorized member must inspect exact stock, certificate, residual input-credit lots, Section 17(5)(h) components, GSTR-3B period and balanced journal impacts.</p><div className="mt-4 flex gap-3"><label className="flex-1 text-sm font-medium">Command ID<input value={commandId} onChange={event => changeCommand(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border px-3" /></label><button type="button" onClick={() => void loadReview()} disabled={busy || !commandId} className="min-h-11 self-end rounded-lg border px-5">Load review</button></div>{review && <div className="mt-4 rounded-lg border p-4"><p data-testid="destruction-review-command" className="font-medium">{review.command_request_id} · {review.command_type} · {review.status}</p><pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs">{review.preview_canonical_json}</pre>{review.status === 'prepared' && <><label className="mt-4 flex min-h-11 items-center gap-3 rounded-lg border p-3"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>I independently reviewed and approve this exact certified destruction and GST input-credit reversal.</span></label><button type="button" onClick={() => void approve()} disabled={!confirmed || busy} className="mt-4 min-h-11 rounded-lg bg-blue-600 px-6 font-medium text-white disabled:bg-slate-300">Approve exact preview</button></>}</div>}</section>}
      {workspace === 'execute' && <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-semibold">Requester execution and readback</h2><p className="text-sm text-slate-600">The original requester posts after approval; the final view is loaded from stock, input-credit lots, GST reversal, GSTR-3B lineage, evidence and balanced journal records.</p><div className="mt-4 flex gap-3"><label className="flex-1 text-sm font-medium">Command ID<input value={commandId} onChange={event => changeCommand(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border px-3" /></label><button type="button" onClick={() => void loadStatus()} disabled={busy || !commandId} className="min-h-11 self-end rounded-lg border px-5">Check status</button></div>{status && !readback && <div className="mt-4 rounded-lg border p-4"><p>Status: <strong>{String((status as any).status)}</strong></p>{String((status as any).status) === 'approved' && <><label className="mt-4 flex min-h-11 items-center gap-3 rounded-lg border p-3"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>Execute this approved immutable destruction and Section 17(5)(h) reversal once.</span></label><button type="button" onClick={() => void execute()} disabled={!confirmed || busy} className="mt-4 min-h-11 rounded-lg bg-red-600 px-6 font-medium text-white disabled:bg-slate-300">Execute and verify</button></>}</div>}{readback && <div className="mt-4 flex gap-3 rounded-lg border border-green-200 bg-green-50 p-5 text-green-900"><CheckCircle className="h-6 w-6 shrink-0" /><div><h3 className="font-semibold">Posted and reconciled</h3><p className="break-all font-mono text-xs">{readback.destruction_id}</p><p>{readback.destruction_number} · {readback.total_destroyed_base_quantity} base units · {formatExactCurrency(readback.total_destroyed_value, 'Destroyed value')}</p><p className="text-sm">Stock is zero; CGST {formatExactCurrency(readback.itc_reversal_cgst_amount, 'CGST reversal')}, SGST {formatExactCurrency(readback.itc_reversal_sgst_amount, 'SGST reversal')}, IGST {formatExactCurrency(readback.itc_reversal_igst_amount, 'IGST reversal')} and cess {formatExactCurrency(readback.itc_reversal_cess_amount, 'cess reversal')} are bound to the GSTR-3B period; total journal debit equals credit.</p></div></div>}</section>}
      <p className="sr-only">Certified evidence selection is API-backed.</p>
    </div></main>
  </div>;
};

export default InventoryDestructionFlow;
