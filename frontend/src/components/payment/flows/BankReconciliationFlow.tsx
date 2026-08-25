import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle, Landmark, Loader2, RefreshCw, Upload } from 'lucide-react';

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
  type BankReconciliationCandidate,
  type BankReconciliationContext,
  type BankReconciliationReadback,
} from '../../../services/api/modules/controlledOperations.api';
import { compareExactDecimals, formatExactCurrency } from '../../../utils/exactDecimal';

interface Props { onClose?: () => void; open?: boolean }
type Workspace = 'prepare' | 'approve' | 'execute';
const messageFrom = (error: any): string => {
  const detail = error?.response?.data?.detail;
  return detail?.message || detail || error?.message || 'Canonical bank reconciliation request failed.';
};
const candidateKey = (row: BankReconciliationCandidate) => `${row.bank_statement_line_id}:${row.journal_entry_id}`;

const BankReconciliationFlow: React.FC<Props> = ({ onClose, open = true }) => {
  const [workspace, setWorkspace] = useState<Workspace>('prepare');
  const [context, setContext] = useState<BankReconciliationContext | null>(null);
  const [selectedKey, setSelectedKey] = useState('');
  const [matchMethod, setMatchMethod] = useState<'' | 'manual' | 'reference_exact'>('');
  const [prepared, setPrepared] = useState<CanonicalCommandPreview | null>(null);
  const [commandId, setCommandId] = useState('');
  const [review, setReview] = useState<CanonicalCommandReview | null>(null);
  const [status, setStatus] = useState<CanonicalCommandPreview | null>(null);
  const [readback, setReadback] = useState<BankReconciliationReadback | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const prepareKey = useRef(`erp-web-bank-reconciliation-prepare:${clientUuid()}`);
  const approvalKey = useRef(clientUuid());
  const executionKey = useRef(clientUuid());
  const selected = context?.candidates.find(row => candidateKey(row) === selectedKey) || null;

  const resetLifecycle = () => {
    setPrepared(null); setReview(null); setStatus(null); setReadback(null); setConfirmed(false);
    prepareKey.current = `erp-web-bank-reconciliation-prepare:${clientUuid()}`;
  };
  const load = useCallback(async () => {
    setBusy(true); setError(''); resetLifecycle();
    try { setContext((await canonicalControlledOperationsApi.bankContext()).data); setSelectedKey(''); }
    catch (requestError) { setContext(null); setError(messageFrom(requestError)); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { if (open) void load(); }, [load, open]);

  const chooseCandidate = (key: string) => {
    setSelectedKey(key); resetLifecycle();
    setMatchMethod('');
  };
  const prepare = async () => {
    if (!selected || !matchMethod || !selected.match_methods.includes(matchMethod)) return;
    setBusy(true); setError('');
    try {
      const response = await prepareCanonicalAction('finance.bank_reconciliation.prepare', {
        idempotency_key: prepareKey.current,
        branch_id: selected.branch_id,
        bank_statement_id: selected.bank_statement_id,
        bank_statement_line_id: selected.bank_statement_line_id,
        journal_entry_id: selected.journal_entry_id,
        matched_amount: selected.matched_amount,
        match_method: matchMethod,
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
      if (next.capability_code !== 'finance.bank_reconciliation.prepare') throw new Error('This command is not a canonical bank reconciliation.');
      setReview(next);
    } catch (requestError) { setError(messageFrom(requestError)); }
    finally { setBusy(false); }
  };
  const approve = async () => {
    if (!review || !confirmed) return;
    setBusy(true); setError('');
    try { await approveCanonicalAction('finance.bank_reconciliation.prepare', review, approvalKey.current); setReview({ ...review, status: 'approved' }); setConfirmed(false); }
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
      await executeApprovedCanonicalAction('finance.bank_reconciliation.prepare', status, executionKey.current);
      const posted = (await canonicalControlledOperationsApi.bankReadback(commandId.trim())).data;
      if (selected && (posted.bank_statement_line_id !== selected.bank_statement_line_id
          || posted.journal_entry_id !== selected.journal_entry_id
          || compareExactDecimals(posted.matched_amount, selected.matched_amount,
            'Bank reconciliation readback', { scale: 2, maximumWholeDigits: 18 }) !== 0)) {
        throw new Error('Posted reconciliation does not match the selected canonical sources.');
      }
      setReadback(posted); setConfirmed(false);
    } catch (requestError) { setError(messageFrom(requestError)); }
    finally { setBusy(false); }
  };

  if (!open) return null;
  return <div className="flex h-full flex-col bg-slate-50">
    <ModuleHeader title="Bank Reconciliation" icon={Landmark} iconColor="text-blue-600" onClose={onClose} />
    <main className="flex-1 overflow-auto p-5"><div className="mx-auto max-w-6xl space-y-4">
      <nav aria-label="Bank reconciliation lifecycle" className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2">
        {([['prepare', '1. Select & prepare'], ['approve', '2. Independent approval'], ['execute', '3. Execute & verify']] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={workspace === id} onClick={() => { setWorkspace(id); setError(''); setConfirmed(false); }} className={`min-h-11 rounded-lg px-4 text-sm font-medium ${workspace === id ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`}>{label}</button>)}
      </nav>
      {error && <div role="alert" className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800"><AlertCircle className="h-5 w-5 shrink-0" />{error}</div>}
      {busy && <div role="status" className="flex gap-2 rounded-lg border bg-white p-4"><Loader2 className="h-5 w-5 animate-spin" />Working with the canonical API…</div>}
      {workspace === 'prepare' && <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Exact imported-statement match</h2><p className="text-sm text-slate-600">Each choice is one unmatched statement line and one posted bank-ledger journal that already agree on date, direction and full amount.</p></div><button type="button" onClick={() => void load()} disabled={busy} className="min-h-11 rounded-lg border px-4"><RefreshCw className="mr-2 inline h-4 w-4" />Refresh</button></div>
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900"><div className="flex gap-2"><Upload className="h-5 w-5 shrink-0" /><div><p className="font-medium">Statement import unavailable</p><p className="text-sm">{context?.statement_import_message || 'The canonical import boundary is unavailable.'}</p></div></div></div>
        <label className="mt-4 block text-sm font-medium">Eligible statement and journal pair<select value={selectedKey} onChange={event => chooseCandidate(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border px-3"><option value="">Select exact match</option>{context?.candidates.map(row => <option key={candidateKey(row)} value={candidateKey(row)}>{row.transaction_date} · {row.bank_name} · {row.statement_reference} line {row.statement_line_number} · {row.journal_number} · {formatExactCurrency(row.matched_amount, 'Match amount')}</option>)}</select></label>
        {!busy && context?.candidates.length === 0 && <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">No exact unmatched canonical pair is currently available. No “all reconciled” claim is made.</p>}
        {selected && <div className="mt-4 grid gap-4 md:grid-cols-2"><div className="rounded-lg border p-4"><p className="text-xs uppercase text-slate-500">Statement</p><p className="font-medium">{selected.statement_description}</p><p className="text-sm text-slate-600">{selected.statement_direction} · {formatExactCurrency(selected.matched_amount, 'Statement amount')} · {selected.bank_reference || 'No bank reference'}</p></div><div className="rounded-lg border p-4"><p className="text-xs uppercase text-slate-500">Posted journal</p><p className="font-medium">{selected.journal_number}</p><p className="text-sm text-slate-600">{selected.journal_description}</p></div><label className="text-sm font-medium md:col-span-2">Reviewed match method<select value={matchMethod} onChange={event => { setMatchMethod(event.target.value as '' | 'manual' | 'reference_exact'); resetLifecycle(); }} className="mt-1 min-h-11 w-full rounded-lg border px-3"><option value="">Select reviewed match method</option>{selected.match_methods.map(method => <option key={method} value={method}>{method === 'reference_exact' ? 'Exact reference match' : 'Manual exact match'}</option>)}</select></label></div>}
        <div className="mt-5 flex justify-end"><button type="button" onClick={() => void prepare()} disabled={busy || !selected || !matchMethod || !selected.match_methods.includes(matchMethod)} className="min-h-11 rounded-lg bg-blue-600 px-6 font-medium text-white disabled:bg-slate-300">Prepare immutable match</button></div>
        {prepared && <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4"><p className="font-medium">Prepared; nothing matched yet.</p><p className="break-all font-mono text-xs">{prepared.command_request_id}</p><p className="break-all font-mono text-xs">{prepared.preview_hash}</p></div>}
      </section>}
      {workspace === 'approve' && <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-semibold">Independent checker approval</h2><p className="text-sm text-slate-600">A different authorized member must load and approve the immutable preview.</p><div className="mt-4 flex gap-3"><label className="flex-1 text-sm font-medium">Command ID<input value={commandId} onChange={event => changeCommand(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border px-3" /></label><button type="button" onClick={() => void loadReview()} disabled={busy || !commandId} className="min-h-11 self-end rounded-lg border px-5">Load review</button></div>{review && <div className="mt-4 rounded-lg border p-4"><p className="font-medium">{review.command_type} · {review.status}</p><pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs">{review.preview_canonical_json}</pre>{review.status === 'prepared' && <><label className="mt-4 flex min-h-11 items-center gap-3 rounded-lg border p-3"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>I independently reviewed and approve this exact match.</span></label><button type="button" onClick={() => void approve()} disabled={!confirmed || busy} className="mt-4 min-h-11 rounded-lg bg-blue-600 px-6 font-medium text-white disabled:bg-slate-300">Approve exact preview</button></>}</div>}</section>}
      {workspace === 'execute' && <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-semibold">Requester execution and readback</h2><p className="text-sm text-slate-600">The original requester executes only after separate approval. The API then reconciles the exact statement/journal/audit evidence.</p><div className="mt-4 flex gap-3"><label className="flex-1 text-sm font-medium">Command ID<input value={commandId} onChange={event => changeCommand(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border px-3" /></label><button type="button" onClick={() => void loadStatus()} disabled={busy || !commandId} className="min-h-11 self-end rounded-lg border px-5">Check status</button></div>{status && !readback && <div className="mt-4 rounded-lg border p-4"><p>Status: <strong>{String((status as any).status)}</strong></p>{String((status as any).status) === 'approved' && <><label className="mt-4 flex min-h-11 items-center gap-3 rounded-lg border p-3"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>Execute this approved immutable match once.</span></label><button type="button" onClick={() => void execute()} disabled={!confirmed || busy} className="mt-4 min-h-11 rounded-lg bg-blue-600 px-6 font-medium text-white disabled:bg-slate-300">Execute and verify</button></>}</div>}{readback && <div className="mt-4 flex gap-3 rounded-lg border border-green-200 bg-green-50 p-5 text-green-900"><CheckCircle className="h-6 w-6 shrink-0" /><div><h3 className="font-semibold">Matched and reconciled</h3><p>{formatExactCurrency(readback.matched_amount, 'Matched amount')} · {readback.match_method.replace('_', ' ')}</p><p className="text-sm">Audit events {readback.audit_event_count}; outbox events {readback.outbox_event_count}.</p></div></div>}</section>}
    </div></main>
  </div>;
};

export default BankReconciliationFlow;
