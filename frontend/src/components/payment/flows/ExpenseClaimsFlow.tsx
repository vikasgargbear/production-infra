import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle, Loader2, Plus, Receipt, RefreshCw, Trash2, Upload } from 'lucide-react';

import { ModuleHeader } from '../../global';
import { branchesApi } from '../../../services/api';
import {
  approveCanonicalAction, getCanonicalCommandReview, getCanonicalCommandStatus,
  type CanonicalCommandExecution, type CanonicalCommandPreview, type CanonicalCommandReview,
} from '../../../services/api/canonicalOperatorActions';
import {
  buildExpenseClaimPayload, canonicalExpenseClaimsApi, executeApprovedExpenseClaim,
  prepareExpenseClaim, type ExpenseClaimContext, type PostedExpenseClaim,
} from '../../../services/api/modules/finance/canonicalExpenseClaims.api';
import { clientUuid } from '../../../utils/clientUuid';
import { addExactDecimals, formatExactCurrency } from '../../../utils/exactDecimal';
import { isCanonicalUuid } from '../../../utils/canonicalUuid';

interface ExpenseClaimsFlowProps { onClose?: () => void; open?: boolean }
interface BranchChoice { branch_id: string; branch_code: string; branch_name: string }
interface ExpenseDraftLine {
  id: string; expense_date: string; expense_account_id: string; description: string;
  merchant_name: string; receipt_attachment_id: string; claimed_amount: string;
}
type Workspace = 'prepare' | 'approve' | 'execute';
type ReceiptUploadResult = {
  state: 'pending' | 'verified' | 'failed';
  message: string;
};
const moneyOptions = { scale: 2, maximumWholeDigits: 20 } as const;
const emptyLine = (): ExpenseDraftLine => ({
  id: clientUuid(), expense_date: '', expense_account_id: '', description: '',
  merchant_name: '', receipt_attachment_id: '', claimed_amount: '',
});
const messageFrom = (error: any): string => {
  const detail = error?.response?.data?.detail;
  return detail?.message || detail || error?.message || 'Canonical expense-claim request failed.';
};

const ExpenseClaimsFlow: React.FC<ExpenseClaimsFlowProps> = ({ onClose, open = true }) => {
  const [workspace, setWorkspace] = useState<Workspace>('prepare');
  const [branches, setBranches] = useState<BranchChoice[]>([]);
  const [branchId, setBranchId] = useState('');
  const [context, setContext] = useState<ExpenseClaimContext | null>(null);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [purpose, setPurpose] = useState('');
  const [reimbursementAccountId, setReimbursementAccountId] = useState('');
  const [lines, setLines] = useState<ExpenseDraftLine[]>([emptyLine()]);
  const [prepared, setPrepared] = useState<CanonicalCommandPreview | null>(null);
  const [commandId, setCommandId] = useState('');
  const [review, setReview] = useState<CanonicalCommandReview | null>(null);
  const [status, setStatus] = useState<CanonicalCommandExecution | null>(null);
  const [posted, setPosted] = useState<PostedExpenseClaim | null>(null);
  const [receiptDate, setReceiptDate] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<ReceiptUploadResult | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const prepareKey = useRef(`erp-web-expense-claim-prepare:${clientUuid()}`);
  const approvalKey = useRef(clientUuid());
  const executeKey = useRef(clientUuid());
  const receiptInput = useRef<HTMLInputElement | null>(null);

  const invalidatePrepared = useCallback(() => {
    setPrepared(null); setStatus(null); setPosted(null); setConfirmed(false);
    prepareKey.current = `erp-web-expense-claim-prepare:${clientUuid()}`;
  }, []);
  const loadBranches = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const response = await branchesApi.getAll();
      const raw = Array.isArray(response.data?.branches) ? response.data.branches : [];
      const next: BranchChoice[] = raw.filter((row: any) => row?.is_active !== false
        && isCanonicalUuid(String(row?.branch_id || ''))
        && String(row?.branch_code || '').trim() && String(row?.branch_name || '').trim())
        .map((row: any) => ({ branch_id: String(row.branch_id), branch_code: String(row.branch_code), branch_name: String(row.branch_name) }));
      if (!next.length) throw new Error('No active canonical branch is available for expense claims.');
      setBranches(next);
      setBranchId(current => next.some(row => row.branch_id === current) ? current : '');
    } catch (requestError) {
      setBranches([]); setBranchId(''); setContext(null); setError(messageFrom(requestError));
    } finally { setBusy(false); }
  }, []);
  const loadContext = useCallback(async (selectedBranch: string) => {
    if (!selectedBranch) return;
    setBusy(true); setError(''); setContext(null); invalidatePrepared();
    try {
      const next = (await canonicalExpenseClaimsApi.context(selectedBranch)).data;
      setContext(next); setPeriodStart(''); setPeriodEnd('');
      setReimbursementAccountId('');
      setLines([emptyLine()]);
      setReceiptDate(''); setReceiptFile(null); setUploadResult(null);
      if (receiptInput.current) receiptInput.current.value = '';
    } catch (requestError) { setError(messageFrom(requestError)); }
    finally { setBusy(false); }
  }, [invalidatePrepared]);
  useEffect(() => { if (open) void loadBranches(); }, [loadBranches, open]);
  useEffect(() => { if (open && branchId) void loadContext(branchId); }, [branchId, loadContext, open]);

  const total = useMemo(() => {
    if (lines.some(line => !line.claimed_amount.trim())) return null;
    try { return addExactDecimals(lines.map(line => line.claimed_amount), 'Expense total', moneyOptions); }
    catch { return null; }
  }, [lines]);
  const usedReceipts = useMemo(() => new Set(lines.map(line => line.receipt_attachment_id).filter(Boolean)), [lines]);
  const updateLine = (id: string, patch: Partial<ExpenseDraftLine>) => {
    setLines(current => current.map(line => line.id === id ? { ...line, ...patch } : line)); invalidatePrepared();
  };
  const chooseReceipt = (line: ExpenseDraftLine, receiptId: string) => {
    const receipt = context?.receipts.find(row => row.receipt_attachment_id === receiptId);
    updateLine(line.id, { receipt_attachment_id: receiptId, expense_date: receipt?.document_date || '' });
  };
  const changeCommandId = (value: string) => {
    setCommandId(value); setReview(null); setStatus(null); setPosted(null); setConfirmed(false);
    approvalKey.current = clientUuid(); executeKey.current = clientUuid();
  };

  const uploadReceipt = async () => {
    if (!context || !receiptFile || !receiptDate) return;
    setBusy(true); setError('');
    setUploadResult({ state: 'pending', message: 'Receipt upload in progress.' });
    invalidatePrepared();
    try {
      const uploaded = (await canonicalExpenseClaimsApi.uploadReceipt(
        context.branch_id, receiptDate, receiptFile,
      )).data;
      const refreshed = (await canonicalExpenseClaimsApi.context(context.branch_id)).data;
      if (!refreshed.receipts.some(row => row.receipt_attachment_id === uploaded.attachment_id)) {
        throw new Error('Verified receipt is not available in authoritative claim context. Refresh before continuing.');
      }
      setContext(refreshed);
      setLines(current => {
        let selected = false;
        const next = current.map(line => {
          if (!selected && !line.receipt_attachment_id) {
            selected = true;
            return { ...line, receipt_attachment_id: uploaded.attachment_id, expense_date: uploaded.document_date };
          }
          return line;
        });
        return selected ? next : [...next, { ...emptyLine(), receipt_attachment_id: uploaded.attachment_id, expense_date: uploaded.document_date }];
      });
      setUploadResult({
        state: 'verified',
        message: `Receipt verified and selected. ${uploaded.original_filename} — SHA-256 ${uploaded.sha256.slice(0, 12)}…`,
      });
      setReceiptDate(''); setReceiptFile(null);
      if (receiptInput.current) receiptInput.current.value = '';
    } catch (requestError) {
      const message = messageFrom(requestError);
      setUploadResult({ state: 'failed', message: `Receipt upload failed. ${message}` });
      setError(message);
    }
    finally { setBusy(false); }
  };

  const prepare = async () => {
    if (!context) return;
    setBusy(true); setError('');
    try {
      const payload = buildExpenseClaimPayload(context, {
        idempotency_key: prepareKey.current, period_start: periodStart, period_end: periodEnd,
        purpose, reimbursement_account_id: reimbursementAccountId,
        lines: lines.map(({ id: _id, ...line }) => line),
      });
      const response = await prepareExpenseClaim(payload);
      setPrepared(response.data); setCommandId(response.data.command_request_id);
    } catch (requestError) { setError(messageFrom(requestError)); }
    finally { setBusy(false); }
  };
  const fetchReview = async () => {
    setBusy(true); setError(''); setReview(null); setConfirmed(false);
    try {
      const next = (await getCanonicalCommandReview(commandId.trim())).data;
      if (next.capability_code !== 'finance.expense_claim.prepare') throw new Error('This command is not an expense claim.');
      setReview(next);
    } catch (requestError) { setError(messageFrom(requestError)); }
    finally { setBusy(false); }
  };
  const approve = async () => {
    if (!review || !confirmed) return;
    setBusy(true); setError('');
    try {
      await approveCanonicalAction('finance.expense_claim.prepare', review, approvalKey.current);
      setReview({ ...review, status: 'approved' }); setConfirmed(false);
    } catch (requestError) { setError(messageFrom(requestError)); }
    finally { setBusy(false); }
  };
  const fetchStatus = async () => {
    setBusy(true); setError(''); setStatus(null); setPosted(null); setConfirmed(false);
    try {
      const next = (await getCanonicalCommandStatus(commandId.trim())).data;
      setStatus(next);
      if (['executed', 'succeeded'].includes(next.status)) setPosted((await canonicalExpenseClaimsApi.readback(commandId.trim())).data);
    } catch (requestError) { setError(messageFrom(requestError)); }
    finally { setBusy(false); }
  };
  const execute = async () => {
    if (!status || !confirmed) return;
    setBusy(true); setError('');
    try {
      const result = await executeApprovedExpenseClaim(status, executeKey.current);
      if (result.command_request_id !== commandId.trim()) throw new Error('Expense execution identity differs from the approved command. Query status before retrying.');
      setStatus(result); setPosted((await canonicalExpenseClaimsApi.readback(commandId.trim())).data); setConfirmed(false);
    } catch (requestError) { setError(messageFrom(requestError)); }
    finally { setBusy(false); }
  };

  if (!open) return null;
  return <div className="flex h-full flex-col bg-slate-50">
    <ModuleHeader title="Expense Claims" icon={Receipt} iconColor="text-blue-600" onClose={onClose} status={posted ? 'Posted' : prepared ? 'Prepared' : 'New'} />
    <main className="flex-1 overflow-auto p-5" data-testid="canonical-immutable-preview"><div className="mx-auto max-w-6xl space-y-4">
      <nav aria-label="Expense claim lifecycle" className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2">
        {([['prepare', '1. Prepare claim'], ['approve', '2. Independent approval'], ['execute', '3. Execute & verify']] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={workspace === id} onClick={() => { setWorkspace(id); setError(''); setConfirmed(false); }} className={`min-h-11 rounded-lg px-4 text-sm font-medium ${workspace === id ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`}>{label}</button>)}
      </nav>
      {error && <div role="alert" className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800"><AlertCircle className="h-5 w-5 shrink-0" />{error}</div>}
      {busy && <div role="status" className="flex gap-2 rounded-lg border bg-white p-4"><Loader2 className="h-5 w-5 animate-spin" />Working with the canonical API…</div>}
      {workspace === 'prepare' && <PrepareWorkspace busy={busy} branches={branches} branchId={branchId} setBranchId={setBranchId} context={context} loadBranches={loadBranches} receiptDate={receiptDate} setReceiptDate={setReceiptDate} receiptFile={receiptFile} setReceiptFile={setReceiptFile} receiptInput={receiptInput} uploadReceipt={uploadReceipt} uploadResult={uploadResult} periodStart={periodStart} setPeriodStart={value => { setPeriodStart(value); invalidatePrepared(); }} periodEnd={periodEnd} setPeriodEnd={value => { setPeriodEnd(value); invalidatePrepared(); }} purpose={purpose} setPurpose={value => { setPurpose(value); invalidatePrepared(); }} reimbursementAccountId={reimbursementAccountId} setReimbursementAccountId={value => { setReimbursementAccountId(value); invalidatePrepared(); }} lines={lines} setLines={setLines} updateLine={updateLine} chooseReceipt={chooseReceipt} usedReceipts={usedReceipts} total={total} prepare={prepare} prepared={prepared} invalidatePrepared={invalidatePrepared} />}
      {workspace === 'approve' && <ApproveWorkspace busy={busy} commandId={commandId} changeCommandId={changeCommandId} fetchReview={fetchReview} review={review} confirmed={confirmed} setConfirmed={setConfirmed} approve={approve} />}
      {workspace === 'execute' && <ExecuteWorkspace busy={busy} commandId={commandId} changeCommandId={changeCommandId} fetchStatus={fetchStatus} status={status} posted={posted} confirmed={confirmed} setConfirmed={setConfirmed} execute={execute} />}
    </div></main>
  </div>;
};

const PrepareWorkspace = (props: any) => <>
  <section className="rounded-xl border border-slate-200 bg-white p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Authoritative claim context</h2><p className="text-sm text-slate-600">The server supplies claimant identity, India business date, eligible accounts, and verified unused receipts.</p></div><button type="button" onClick={() => void props.loadBranches()} disabled={props.busy} className="min-h-11 rounded-lg border px-4"><RefreshCw className="mr-2 inline h-4 w-4" />Refresh</button></div>
    <p className="mt-3 text-sm text-slate-600">Required: select a branch, exact claim period, reimbursement liability, verified unused receipt, expense account, merchant, description, amount, and business purpose.</p>
    <div className="mt-4 grid gap-4 md:grid-cols-3">
      <label className="text-sm font-medium">Branch<select aria-label="Branch" value={props.branchId} onChange={event => props.setBranchId(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border px-3"><option value="">Select branch</option>{props.branches.map((branch: BranchChoice) => <option key={branch.branch_id} value={branch.branch_id}>{branch.branch_code} — {branch.branch_name}</option>)}</select></label>
      <label className="text-sm font-medium">Claimant<input value={props.context?.claimant_display_name || ''} readOnly className="mt-1 min-h-11 w-full rounded-lg border bg-slate-50 px-3" /></label>
      <label className="text-sm font-medium">Server business date<input value={props.context?.business_date || ''} readOnly className="mt-1 min-h-11 w-full rounded-lg border bg-slate-50 px-3" /></label>
    </div>
    {props.context && (props.context.expense_accounts.length === 0 || props.context.reimbursement_accounts.length === 0 || props.context.receipts.length === 0) && <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Posting is unavailable until this branch has an active INR expense account, a member-reimbursement liability account, and at least one verified unused expense receipt.</p>}
    {props.context && <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4"><div className="flex items-start gap-3"><Upload className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" aria-hidden="true" /><div className="min-w-0 flex-1"><h3 className="font-semibold text-blue-950">Add a receipt securely</h3><p className="text-sm text-blue-900">Private PDF only, up to 10 MiB. The server reads it back and verifies SHA-256 before it becomes selectable.</p><div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto] md:items-end"><label className="text-sm font-medium text-slate-800">Receipt date<input aria-label="Receipt date" type="date" max={props.context.business_date} value={props.receiptDate} onChange={event => { props.setReceiptDate(event.target.value); props.invalidatePrepared(); }} className="mt-1 min-h-11 w-full rounded-lg border bg-white px-3" /></label><label className="text-sm font-medium text-slate-800">Receipt PDF<input aria-label="Receipt PDF" ref={props.receiptInput} type="file" accept="application/pdf,.pdf" onChange={event => { props.setReceiptFile(event.target.files?.[0] || null); props.invalidatePrepared(); }} className="mt-1 block min-h-11 w-full rounded-lg border bg-white px-3 py-2 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1" /></label><button type="button" onClick={() => void props.uploadReceipt()} disabled={props.busy || !props.receiptDate || !props.receiptFile} className="min-h-11 rounded-lg bg-blue-700 px-4 font-medium text-white disabled:bg-slate-300">Upload and verify receipt</button></div>{props.uploadResult && <p data-testid="expense-receipt-upload-result" role={props.uploadResult.state === 'failed' ? 'alert' : 'status'} aria-label="Expense receipt upload result" aria-live={props.uploadResult.state === 'failed' ? 'assertive' : 'polite'} className={`mt-3 break-all text-sm font-medium ${props.uploadResult.state === 'failed' ? 'text-red-800' : props.uploadResult.state === 'verified' ? 'text-emerald-800' : 'text-blue-900'}`}>{props.uploadResult.message}</p>}</div></div></div>}
    {!props.context && <div className="mt-5 flex justify-end"><button type="button" disabled className="min-h-11 rounded-lg bg-slate-300 px-6 font-medium text-white">Prepare immutable preview</button></div>}
  </section>
  {props.context && <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-semibold">Claim details</h2><p className="text-sm text-slate-600">Gross receipt expense only. GST input credit, withholding, FX, mileage, per diem, advances, reversals, and partial approval fail closed.</p><div className="mt-4 grid gap-4 md:grid-cols-3">
    <label className="text-sm font-medium">Period start<input aria-label="Period start" type="date" max={props.context.business_date} value={props.periodStart} onChange={event => props.setPeriodStart(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border px-3" /></label>
    <label className="text-sm font-medium">Period end<input aria-label="Period end" type="date" min={props.periodStart} max={props.context.business_date} value={props.periodEnd} onChange={event => props.setPeriodEnd(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border px-3" /></label>
    <label className="text-sm font-medium">Reimbursement liability<select aria-label="Reimbursement liability" value={props.reimbursementAccountId} onChange={event => props.setReimbursementAccountId(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border px-3"><option value="">Select account</option>{props.context.reimbursement_accounts.map((account: any) => <option key={account.account_id} value={account.account_id}>{account.account_code} — {account.account_name}</option>)}</select></label>
  </div><label className="mt-4 block text-sm font-medium">Business purpose<textarea aria-label="Business purpose" value={props.purpose} onChange={event => props.setPurpose(event.target.value)} rows={2} maxLength={1024} className="mt-1 w-full rounded-lg border px-3 py-2" /></label></section>}
  {props.context && <section className="rounded-xl border border-slate-200 bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-5"><div><h2 className="text-lg font-semibold">Verified receipt lines</h2><p className="text-sm text-slate-600">Receipt date is immutable evidence and becomes the expense date.</p></div><button type="button" onClick={() => { props.setLines((current: ExpenseDraftLine[]) => [...current, emptyLine()]); props.invalidatePrepared(); }} className="min-h-11 rounded-lg border px-4"><Plus className="mr-2 inline h-4 w-4" />Add receipt</button></div>
    <div className="space-y-4 p-5">{props.lines.map((line: ExpenseDraftLine, index: number) => <fieldset key={`${line.id}:${index}`} className="rounded-lg border p-4"><legend className="px-2 text-sm font-semibold">Expense {index + 1}</legend><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <label className="text-sm font-medium">Verified unused receipt<select value={line.receipt_attachment_id} onChange={event => props.chooseReceipt(line, event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border px-3"><option value="">Select receipt</option>{props.context.receipts.map((receipt: any) => <option key={receipt.receipt_attachment_id} value={receipt.receipt_attachment_id} disabled={props.usedReceipts.has(receipt.receipt_attachment_id) && receipt.receipt_attachment_id !== line.receipt_attachment_id}>{receipt.original_filename} — {receipt.document_date} — {receipt.status}</option>)}</select></label>
      <label className="text-sm font-medium">Selected receipt date<input value={line.expense_date} readOnly className="mt-1 min-h-11 w-full rounded-lg border bg-slate-50 px-3" /></label>
      <label className="text-sm font-medium">Expense account<select aria-label="Expense account" value={line.expense_account_id} onChange={event => props.updateLine(line.id, { expense_account_id: event.target.value })} className="mt-1 min-h-11 w-full rounded-lg border px-3"><option value="">Select account</option>{props.context.expense_accounts.map((account: any) => <option key={account.account_id} value={account.account_id}>{account.account_code} — {account.account_name}</option>)}</select></label>
      <label className="text-sm font-medium">Merchant<input aria-label="Merchant" value={line.merchant_name} onChange={event => props.updateLine(line.id, { merchant_name: event.target.value })} maxLength={256} className="mt-1 min-h-11 w-full rounded-lg border px-3" /></label>
      <label className="text-sm font-medium">Description<input aria-label="Description" value={line.description} onChange={event => props.updateLine(line.id, { description: event.target.value })} maxLength={1024} className="mt-1 min-h-11 w-full rounded-lg border px-3" /></label>
      <label className="text-sm font-medium">Gross INR amount<input aria-label="Gross INR amount" inputMode="decimal" value={line.claimed_amount} onChange={event => props.updateLine(line.id, { claimed_amount: event.target.value })} placeholder="0.00" className="mt-1 min-h-11 w-full rounded-lg border px-3 text-right" /></label>
    </div>{props.lines.length > 1 && <button type="button" aria-label={`Remove expense ${index + 1}`} onClick={() => { props.setLines((current: ExpenseDraftLine[]) => current.filter(row => row.id !== line.id)); props.invalidatePrepared(); }} className="mt-4 min-h-11 rounded-lg px-3 text-red-700 hover:bg-red-50"><Trash2 className="mr-2 inline h-4 w-4" />Remove</button>}</fieldset>)}</div>
    <div className="flex flex-wrap items-center justify-between gap-4 border-t p-5"><p className="text-lg font-semibold">Exact total: {props.total === null ? 'Invalid amount' : formatExactCurrency(props.total, 'Expense total')}</p><button type="button" onClick={() => void props.prepare()} disabled={props.busy || !props.total || !props.periodStart || !props.periodEnd || !props.reimbursementAccountId || props.context.expense_accounts.length === 0 || props.context.reimbursement_accounts.length === 0 || props.context.receipts.length === 0} className="min-h-11 rounded-lg bg-blue-600 px-6 font-medium text-white disabled:bg-slate-300">Prepare immutable preview</button></div>
  </section>}
  {props.prepared && <section className="rounded-xl border border-blue-200 bg-white p-5"><h2 className="text-lg font-semibold">Prepared — independent approval required</h2><p className="mt-1 text-sm text-slate-600">Nothing has posted. Give this command ID to a different authorized checker.</p><dl className="mt-4 grid gap-3 rounded-lg bg-blue-50 p-4 md:grid-cols-2"><div><dt className="text-xs uppercase text-slate-500">Command ID</dt><dd className="break-all font-mono text-sm">{props.prepared.command_request_id}</dd></div><div><dt className="text-xs uppercase text-slate-500">Exact claim</dt><dd className="font-semibold">{props.total && formatExactCurrency(props.total, 'Prepared expense total')}</dd></div><div className="md:col-span-2"><dt className="text-xs uppercase text-slate-500">Preview hash</dt><dd className="break-all font-mono text-xs">{props.prepared.preview_hash}</dd></div></dl></section>}
</>;

const ApproveWorkspace = (props: any) => <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-semibold">Independent checker approval</h2><p className="text-sm text-slate-600">Sign in as a different authorized reviewer. The server rejects self-approval and cross-tenant access.</p><div className="mt-4 flex flex-wrap gap-3"><label className="min-w-64 flex-1 text-sm font-medium">Command ID<input value={props.commandId} onChange={event => props.changeCommandId(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border px-3" /></label><button type="button" onClick={() => void props.fetchReview()} disabled={props.busy || !props.commandId.trim()} className="min-h-11 self-end rounded-lg border px-5">Load immutable review</button></div>{props.review && <div className="mt-5 rounded-lg border p-4"><p className="font-medium">{props.review.command_type} · {props.review.status}</p><p className="mt-1 break-all text-xs text-slate-600">{props.review.preview_hash}</p><pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs">{props.review.preview_canonical_json}</pre>{['prepared', 'pending_approval'].includes(props.review.status) && <><label className="mt-4 flex min-h-11 items-center gap-3 rounded-lg border p-3"><input type="checkbox" checked={props.confirmed} onChange={event => props.setConfirmed(event.target.checked)} /><span>I independently reviewed the exact claimant, receipts, accounts, dates, tax treatment, and amount.</span></label><button type="button" onClick={() => void props.approve()} disabled={!props.confirmed || props.busy} className="mt-4 min-h-11 rounded-lg bg-blue-600 px-6 font-medium text-white disabled:bg-slate-300">Approve exact preview</button></>}</div>}</section>;

const ExecuteWorkspace = (props: any) => <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-semibold">Requester execution and recovery</h2><p className="text-sm text-slate-600">Return as the original requester. Status and readback are GET-only; execution occurs once after separate approval.</p><div className="mt-4 flex flex-wrap gap-3"><label className="min-w-64 flex-1 text-sm font-medium">Command ID<input value={props.commandId} onChange={event => props.changeCommandId(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border px-3" /></label><button type="button" onClick={() => void props.fetchStatus()} disabled={props.busy || !props.commandId.trim()} className="min-h-11 self-end rounded-lg border px-5">Check status / recover</button></div>{props.status && !props.posted && <div className="mt-5 rounded-lg border p-4"><p className="font-medium">Status: {props.status.status}</p><p className="break-all text-xs text-slate-600">{props.status.preview_hash}</p>{props.status.status === 'approved' && <><label className="mt-4 flex min-h-11 items-center gap-3 rounded-lg border p-3"><input type="checkbox" checked={props.confirmed} onChange={event => props.setConfirmed(event.target.checked)} /><span>I am the original requester and authorize one idempotent execution of this approved preview.</span></label><button type="button" onClick={() => void props.execute()} disabled={!props.confirmed || props.busy} className="mt-4 min-h-11 rounded-lg bg-blue-600 px-6 font-medium text-white disabled:bg-slate-300">Execute approved claim</button></>}</div>}{props.posted && <div className="mt-5 flex gap-3 rounded-lg border border-green-200 bg-green-50 p-5 text-green-900"><CheckCircle className="h-6 w-6 shrink-0" /><div><h3 className="font-semibold">Posted and reconciled</h3><p className="break-all font-mono text-xs">{props.posted.expense_claim_id}</p><p>{props.posted.claim_number} · {formatExactCurrency(props.posted.approved_amount, 'Posted expense')}</p><p className="text-sm">{props.posted.lines.length} verified receipt line{props.posted.lines.length === 1 ? '' : 's'}; journal debit {formatExactCurrency(props.posted.journal_debit_total)} equals credit {formatExactCurrency(props.posted.journal_credit_total)}. Accounting event {props.posted.accounting_event_id} was loaded from canonical readback.</p></div></div>}</section>;

export default ExpenseClaimsFlow;
