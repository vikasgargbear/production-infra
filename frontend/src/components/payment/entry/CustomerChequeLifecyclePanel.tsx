import React from 'react';
import { AlertTriangle, CheckCircle } from 'lucide-react';

import type { CanonicalCommandPreview } from '../../../services/api/canonicalOperatorActions';
import {
  executeCustomerChequeAction,
  prepareCustomerChequeAction,
  type CustomerChequeAction,
} from '../../../services/api/modules/finance/customerChequeActions.api';
import { clientUuid } from '../../../utils/clientUuid';
import {
  getCustomerReceiptContext,
  type CustomerReceiptContext,
} from '../../../services/api/modules/finance/customerReceipts.api';

interface Props {
  branchId: string;
  paymentId: string;
  rowVersion: number;
}

const CustomerChequeLifecyclePanel: React.FC<Props> = ({ branchId, paymentId, rowVersion }) => {
  const [action, setAction] = React.useState<CustomerChequeAction>('clearance');
  const [date, setDate] = React.useState('');
  const [evidenceId, setEvidenceId] = React.useState('');
  const [bankId, setBankId] = React.useState('');
  const [reference, setReference] = React.useState('');
  const [reason, setReason] = React.useState<'funds_insufficient' | 'signature_mismatch' | 'account_closed' | 'payment_stopped' | 'instrument_invalid' | 'other'>('funds_insufficient');
  const [preview, setPreview] = React.useState<CanonicalCommandPreview | null>(null);
  const [confirmed, setConfirmed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState('');
  const [error, setError] = React.useState('');
  const [settlementAccounts, setSettlementAccounts] = React.useState<CustomerReceiptContext['settlement_accounts']>([]);
  const lifecycle = React.useRef({ idempotency: '', lifecycle: '' });

  React.useEffect(() => {
    let active = true;
    void getCustomerReceiptContext().then(response => {
      if (active) setSettlementAccounts(response.data.settlement_accounts);
    }).catch(() => {
      if (active) setError('Canonical bank identities could not be loaded. Clearance remains unavailable.');
    });
    return () => { active = false; };
  }, []);

  const prepare = async () => {
    setBusy(true); setError(''); setResult('');
    try {
      lifecycle.current = {
        idempotency: `erp-web-customer-cheque-${action}:${clientUuid()}`,
        lifecycle: clientUuid(),
      };
      setPreview(await prepareCustomerChequeAction(action, {
        branch_id: branchId, original_payment_id: paymentId,
        original_payment_row_version: rowVersion, action_date: date,
        evidence_attachment_id: evidenceId, bank_account_id: bankId,
        clearance_reference: reference, reason_code: reason,
      }, lifecycle.current.idempotency));
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Cheque action prepare failed.'); }
    finally { setBusy(false); }
  };
  const execute = async () => {
    if (!preview || !confirmed) return;
    setBusy(true); setError('');
    try {
      setResult(await executeCustomerChequeAction(action, preview, lifecycle.current.lifecycle));
      setPreview(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Cheque action execute failed.'); }
    finally { setBusy(false); }
  };

  return <section className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-5 text-left" aria-label="Cheque clearance or bounce">
    <h3 className="font-semibold text-blue-950">Cheque terminal action</h3>
    <p className="mt-1 text-sm text-blue-900">Prepare, review, approve, then execute one clearance or compensating bounce.</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="text-sm">Action<select value={action} onChange={event => { setAction(event.target.value as CustomerChequeAction); setPreview(null); }} className="mt-1 min-h-11 w-full rounded border px-3"><option value="clearance">Clear into bank</option><option value="bounce">Bounce and compensate</option></select></label>
      <label className="text-sm">Action date<input type="date" value={date} onChange={event => setDate(event.target.value)} className="mt-1 min-h-11 w-full rounded border px-3" /></label>
      <label className="text-sm">Verified evidence ID<input value={evidenceId} onChange={event => setEvidenceId(event.target.value)} className="mt-1 min-h-11 w-full rounded border px-3" /></label>
      {action === 'clearance' ? <>
        <label className="text-sm">Settlement bank account<select value={bankId} onChange={event => setBankId(event.target.value)} className="mt-1 min-h-11 w-full rounded border px-3"><option value="">Select canonical bank</option>{settlementAccounts.map(account => <option key={account.bank_account_id} value={account.bank_account_id}>{account.bank_name} · {account.settlement_account_code}</option>)}</select></label>
        <label className="text-sm">Clearance reference<input value={reference} onChange={event => setReference(event.target.value)} className="mt-1 min-h-11 w-full rounded border px-3" /></label>
      </> : <label className="text-sm">Bounce reason<select value={reason} onChange={event => setReason(event.target.value as typeof reason)} className="mt-1 min-h-11 w-full rounded border px-3"><option value="funds_insufficient">Funds insufficient</option><option value="signature_mismatch">Signature mismatch</option><option value="account_closed">Account closed</option><option value="payment_stopped">Payment stopped</option><option value="instrument_invalid">Instrument invalid</option><option value="other">Other</option></select></label>}
    </div>
    {!preview && !result && <button type="button" onClick={() => void prepare()} disabled={busy} className="mt-4 min-h-11 rounded bg-blue-700 px-5 font-semibold text-white">Prepare terminal action</button>}
    {preview && <div data-testid="canonical-immutable-preview" className="mt-4 rounded border border-amber-300 bg-white p-4">
      <div className="flex gap-2 font-semibold"><AlertTriangle className="h-5 w-5 text-amber-600" />Review {action} preview</div>
      <p className="mt-2 break-all font-mono text-xs">{preview.command_request_id} · {preview.preview_hash}</p>
      <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I approve this exact immutable action</label>
      <button type="button" onClick={() => void execute()} disabled={busy || !confirmed} className="mt-3 min-h-11 rounded bg-blue-700 px-5 font-semibold text-white disabled:bg-slate-300">Approve &amp; execute {action}</button>
    </div>}
    {result && <p role="status" className="mt-4 flex items-center gap-2 break-all text-sm font-semibold text-green-800"><CheckCircle className="h-5 w-5" />Terminal action posted: {result}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-red-800">{error}</p>}
  </section>;
};

export default CustomerChequeLifecyclePanel;
