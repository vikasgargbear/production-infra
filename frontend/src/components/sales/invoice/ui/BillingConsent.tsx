import React, { useEffect, useRef, useState } from 'react';
import { billingConsentApi, BillingConsentSnapshot as Snapshot } from '../../../../services/api/modules/billingConsent.api';
import { formatExactCurrency } from '../../../../utils/exactDecimal';

export default function BillingConsent({ onClose }: { onClose: () => void }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [branch, setBranch] = useState('');
  const [amount, setAmount] = useState('');
  const [expiry, setExpiry] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestKey = useRef<{ payload: string; key: string } | null>(null);
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => trigger?.focus();
  }, []);
  useEffect(() => { billingConsentApi.read().then(r => setSnapshot(r.data))
    .catch(() => setError('Unable to read billing authorization. Try again.')); }, []);
  async function save() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const payload = JSON.stringify({ branch, amount, expiry });
      if (requestKey.current?.payload !== payload) requestKey.current = { payload, key: crypto.randomUUID() };
      const result = await billingConsentApi.create({
        branch_id: branch, maximum_amount: amount, expires_at: new Date(expiry).toISOString(),
        idempotency_key: requestKey.current.key, confirmed,
      });
      setSnapshot(result.data); setConfirmed(false); requestKey.current = null;
    } catch { setError('Could not confirm authorization. Retry unchanged details or reload to check its status.'); }
    finally { setBusy(false); }
  }
  async function revoke(grant: Snapshot['grants'][number]) {
    if (!window.confirm('Revoke this billing authorization? Unposted prepared invoices using it will no longer be executable.')) return;
    setBusy(true); setError('');
    try { setSnapshot((await billingConsentApi.revoke(grant.id, grant.row_version)).data); requestKey.current = null; }
    catch { setError('Revocation could not be confirmed. Reload authorization before retrying.'); }
    finally { setBusy(false); }
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Billing authorization"
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!busy) onClose(); }
      if (event.key === 'Tab') {
        const nodes = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)') || []);
        const first = nodes[0]; const last = nodes[nodes.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
    <section ref={dialog} tabIndex={-1} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white p-6">
      <h2 className="text-xl font-semibold">My billing authorization</h2>
      <p className="my-3 text-sm">Authorized administrators can enable their own invoice billing. This does not change roles or grant access to another user. Each invoice remains subject to your current permissions and review.</p>
      {error && <p role="alert" className="mb-3 text-red-700">{error}</p>}
      {snapshot?.grants.map(grant => <div key={grant.id} className="my-3 border p-3 text-sm">
        <p>Invoice limit {formatExactCurrency(grant.maximum_amount, 'Billing authorization limit')} · {grant.status}</p>
        <p>Expires {new Date(grant.expires_at).toLocaleString()}</p>
        {['active', 'suspended'].includes(grant.status) && <button type="button" disabled={busy} onClick={() => revoke(grant)} className="min-h-[44px] text-red-700">Revoke authorization</button>}
      </div>)}
      {snapshot && !snapshot.can_manage && <p>Ask an authorized administrator. Your account cannot issue billing consent.</p>}
      {snapshot?.can_manage && <form onSubmit={e => { e.preventDefault(); save(); }} className="space-y-3"><fieldset disabled={busy} className="space-y-3">
        <label className="block">Branch<select required value={branch} onChange={e => setBranch(e.target.value)} className="block min-h-[44px] w-full border p-2 text-base"><option value="">Choose branch</option>{snapshot.branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label className="block">Maximum amount per invoice (INR)<input required inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" value={amount} onChange={e => setAmount(e.target.value)} className="block min-h-[44px] w-full border p-2 text-base" /></label>
        <label className="block">Authorization expiry (your local time)<input required type="datetime-local" value={expiry} onChange={e => setExpiry(e.target.value)} className="block min-h-[44px] w-full border p-2 text-base" /></label>
        <label className="flex gap-2"><input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I approve invoice preparation, review, posting and status access for myself in this branch up to this limit until this expiry.</label>
        <button type="submit" disabled={busy || !confirmed} className="min-h-[44px] rounded bg-blue-600 px-4 text-white disabled:opacity-50">Confirm authorization</button>
      </fieldset></form>}
      <button type="button" disabled={busy} onClick={onClose} className="mt-3 min-h-[44px] border px-4">Close</button>
    </section>
  </div>;
}
