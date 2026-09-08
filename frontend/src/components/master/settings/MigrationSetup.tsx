import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { usePermissions } from '../../../hooks/usePermissions';
import { canonicalInventoryReadsApi, InventoryContext } from '../../../services/api/modules/inventory/canonicalInventoryReads.api';
import { MigrationBundle, MigrationReview, migrationApi, runMigration } from '../../../services/api/modules/master/migration.api';

const label = (value: string) => value.replace(/_/g, ' ');
const failure = (error: unknown) => {
  const value = error as { response?: { data?: { detail?: unknown } }; message?: string };
  const detail = value.response?.data?.detail;
  return typeof detail === 'string' ? detail : value.message || 'Migration could not continue. Completed batches are retained.';
};
const ExceptionList: React.FC<{ value: unknown; depth?: number }> = ({ value, depth = 0 }) => (
  <ul className="list-disc pl-5 space-y-1 break-words">
    {Object.entries(value && typeof value === 'object' ? value : {}).map(([key, item]) => (
      <li key={key}>
        {Array.isArray(value) ? '' : `${label(key)}: `}
        {item && typeof item === 'object' ? (depth < 5 ? <ExceptionList value={item} depth={depth + 1} /> : 'See downloaded review for details') : String(item)}
      </li>
    ))}
  </ul>
);

const MigrationSetup: React.FC = () => {
  const { user } = useAuth();
  const { hasCapability, hasPermission } = usePermissions();
  const allowed = hasCapability('core.organization.manage') && hasPermission('finance', 'view');
  const [context, setContext] = useState<InventoryContext | null>(null);
  const [bundle, setBundle] = useState<MigrationBundle | null>(null);
  const [review, setReview] = useState<MigrationReview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [complete, setComplete] = useState(false);
  const stop = useRef(false);
  const running = useRef(false);
  const scopeVersion = useRef(0);
  const errorRef = useRef<HTMLDivElement>(null);
  const currentOrg = useRef(user?.org_id);
  currentOrg.current = user?.org_id;

  useEffect(() => {
    let mounted = true;
    scopeVersion.current += 1;
    stop.current = false;
    setBundle(null); setReview(null); setContext(null); setConfirmed(false); setComplete(false);
    if (allowed) canonicalInventoryReadsApi.context().then(response => {
      if (mounted) setContext(response.data as InventoryContext);
    }).catch(value => { if (mounted) setError(failure(value)); });
    return () => { mounted = false; stop.current = true; };
  }, [allowed, user?.org_id]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (running.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const choose = async (file?: File) => {
    setBundle(null); setReview(null); setConfirmed(false); setComplete(false); setError(''); setProgress('');
    if (!file) return;
    try {
      if (file.size > 64 * 1024 * 1024) throw new Error('Package exceeds 64 MB. Ask for a bounded migration package.');
      const value = JSON.parse(await file.text()) as MigrationBundle;
      if (!value || value.schema_version !== 'aasopharma.marg-migration.v1' || !Array.isArray(value.import_requests)) {
        throw new Error('Choose migration-bundle.json from the export preparation step, not a raw CSV or MARG database.');
      }
      if (value.organization_id !== currentOrg.current || value.organization_id !== context?.organization_id) {
        throw new Error('This package belongs to another organization. Prepare it for the signed-in organization; it will not be retargeted automatically.');
      }
      const branch = context.branches.find(item => item.branch_id === value.branch_id);
      if (!branch?.locations.some(item => item.location_id === value.location_id && item.location_status === 'active')) {
        throw new Error('The package branch or stock location is unavailable in this organization. Correct the target before importing.');
      }
      setBundle(value);
    } catch (value) { setError(failure(value)); }
  };
  const validate = async () => {
    if (!bundle || running.current) return;
    running.current = true; setBusy(true); setError('');
    try {
      const value = await migrationApi.review(bundle);
      if (currentOrg.current === bundle.organization_id && !stop.current) setReview(value);
    } catch (value) { setError(failure(value)); }
    finally { running.current = false; setBusy(false); }
  };
  const start = async () => {
    if (!bundle || !review || !confirmed || running.current) return;
    running.current = true; stop.current = false; setBusy(true); setComplete(false); setError('');
    const version = scopeVersion.current;
    try {
      // Revalidate the whole immutable in-memory package on every resume.
      const checked = await migrationApi.review(bundle);
      await runMigration(bundle, checked, setProgress, () => stop.current || version !== scopeVersion.current || currentOrg.current !== bundle.organization_id);
      setComplete(true); setProgress('Import completed; stock and opening balances reconciled.');
    } catch (value) { setError(failure(value)); setProgress('Stopped safely. You can resume the same package after resolving the issue.'); }
    finally { running.current = false; setBusy(false); }
  };
  const branch = context?.branches.find(item => item.branch_id === bundle?.branch_id);
  const location = branch?.locations.find(item => item.location_id === bundle?.location_id);
  const downloadReview = () => {
    if (!bundle || !review) return;
    const file = new Blob([JSON.stringify({ dataset_id: bundle.dataset_id, opening_date: bundle.opening_date,
      review, exclusions: bundle.exclusions || {}, import_completed: complete }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a'); link.href = url; link.download = 'migration-review.json'; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  if (!allowed) return <p className="p-6">Organization management and finance-view access are required to import and verify data.</p>;
  return (
    <section className="h-full overflow-y-auto p-4 sm:p-6 pb-28" aria-label="Data migration">
      <div className="max-w-4xl mx-auto space-y-5">
        <h1 className="text-2xl font-semibold">Import business data</h1>
        <p>Use a prepared MARG export package to bring products, stock, parties and opening balances into this organization. Historical invoices remain available in the invoice archive; they are not posted again.</p>
        <p className="text-sm text-gray-600">Signed in as {user?.email}. Automatic extraction from a Windows MARG installation is a separate step and is not available on this screen.</p>
        {error && <div ref={errorRef} tabIndex={-1} role="alert" className="border border-red-300 bg-red-50 text-red-800 rounded-lg p-4 break-words">{error}</div>}
        <label className="block border rounded-lg p-4 space-y-2">
          <span className="block font-medium">1. Choose the prepared package</span>
          <input type="file" accept=".json,application/json" disabled={!context || busy} className="block w-full min-h-[44px] text-base" onChange={event => { void choose(event.target.files?.[0]); }} />
          <span className="block text-sm text-gray-600">The file is read locally first. Review sends it to your ERP for validation, without saving business records.</span>
        </label>
        {bundle && <div className="border rounded-lg p-4 space-y-3 break-words">
          <h2 className="font-semibold">2. Review this import</h2>
          <p>Destination: {branch?.branch_name} / {location?.location_name}</p>
          <p>Opening date: {bundle.opening_date} · Dataset: {bundle.dataset_id}</p>
          {!review && <button type="button" disabled={busy} onClick={() => { void validate(); }} className="min-h-[44px] px-4 py-2 rounded bg-blue-700 text-white disabled:opacity-50">{busy ? 'Reviewing…' : 'Review package'}</button>}
          {review && <>
            <p>{review.facts.toLocaleString('en-IN')} source records in {review.request_batches} resumable batches.</p>
            <button type="button" onClick={downloadReview} className="min-h-[44px] border rounded px-4 py-2">Download review and exceptions</button>
            <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Records and quarantined exceptions</caption><thead><tr><th className="p-2">Record type</th><th className="p-2 text-right">Source records</th><th className="p-2 text-right">Quarantined</th></tr></thead><tbody>
              {Object.entries(review.counts_by_kind).map(([kind, count]) => <tr key={kind} className="border-t"><td className="p-2 capitalize">{label(kind)}</td><td className="p-2 text-right tabular-nums">{count.toLocaleString('en-IN')}</td><td className="p-2 text-right tabular-nums">{(review.quarantined_by_kind[kind] || 0).toLocaleString('en-IN')}</td></tr>)}
            </tbody></table></div>
            <details open className="bg-amber-50 border border-amber-200 rounded p-3"><summary className="min-h-[44px] font-medium cursor-pointer">Excluded data and follow-up work</summary><ExceptionList value={bundle.exclusions} /><p className="mt-2">Quarantined records are retained as evidence, not made saleable or posted. Product setup and licence review may still be required before billing.</p></details>
            <label className="flex items-start gap-3 py-3"><input type="checkbox" className="mt-1 w-5 h-5" disabled={busy || complete} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>I reviewed this destination and the exclusions. Import this package and create its reviewed opening stock and balances. Do not delete existing data.</span></label>
            <button type="button" disabled={busy || !confirmed || complete} onClick={() => { void start(); }} className="min-h-[48px] px-5 py-3 rounded bg-blue-700 text-white disabled:opacity-50">{busy ? 'Import in progress…' : complete ? 'Import complete' : 'Import / resume this package'}</button>
            {busy && <button type="button" onClick={() => { stop.current = true; }} className="min-h-[48px] px-4 py-3 ml-2 border rounded">Pause after this batch</button>}
          </>}
        </div>}
        {progress && <p role="status" className="rounded-lg border p-4">{progress}</p>}
        {complete && <p>Check products, current stock and customer/supplier balances, then create a test invoice. This receipt does not certify Windows extraction or the invoice/PDF journey.</p>}
        <p className="text-sm text-gray-600">Keep the original package. If the connection drops or this screen closes, choose that same package and resume. Completed batches are checked again, not duplicated. No data is reset.</p>
      </div>
    </section>
  );
};
export default MigrationSetup;
