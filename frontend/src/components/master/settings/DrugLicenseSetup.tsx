import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileCheck2, Loader2, ShieldCheck } from 'lucide-react';
import { usePermissions } from '../../../hooks/usePermissions';
import drugLicensesApi, {
  DrugLicenseSetupContext,
  LicenseSubjectKind,
  WholesaleLicenseType,
} from '../../../services/api/modules/compliance/drugLicenses.api';

type FormState = {
  subjectKind: LicenseSubjectKind;
  subjectId: string;
  evidenceBranchId: string;
  licenseType: WholesaleLicenseType;
  licenseNumber: string;
  issuingAuthority: string;
  jurisdictionCode: string;
  issuedOn: string;
  validFrom: string;
  nextVerificationDueOn: string;
  file: File | null;
  reviewed: boolean;
};

const emptyForm = (): FormState => ({
  subjectKind: 'branch', subjectId: '', evidenceBranchId: '',
  licenseType: 'drug_wholesale_form_20b', licenseNumber: '',
  issuingAuthority: '', jurisdictionCode: '', issuedOn: '', validFrom: '',
  nextVerificationDueOn: '', file: null, reviewed: false,
});

const labelForType = (value: WholesaleLicenseType) => (
  value === 'drug_wholesale_form_20b' ? 'Form 20B — wholesale medicines' : 'Form 21B — wholesale Schedule C/C(1) medicines'
);

const errorMessage = (error: any) => (
  error?.response?.data?.detail || error?.message || 'Unable to save the reviewed drug licence'
);

const DrugLicenseSetup: React.FC = () => {
  const { hasCapability } = usePermissions();
  const canManage = hasCapability('compliance.license.manage');
  const [context, setContext] = useState<DrugLicenseSetupContext | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(canManage);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const errorRef = useRef<HTMLDivElement>(null);
  const idempotencyKeyRef = useRef(`license-ui-${crypto.randomUUID()}`);

  const load = async () => {
    if (!canManage) return;
    setLoading(true); setError('');
    try {
      const value = await drugLicensesApi.setup();
      setContext(value);
      setForm(current => {
        const subjectId = current.subjectId || value.branches[0]?.id || '';
        return {
          ...current,
          subjectId,
          evidenceBranchId: current.evidenceBranchId || value.branches[0]?.id || '',
          issuedOn: current.issuedOn || value.business_date,
          validFrom: current.validFrom || value.business_date,
          nextVerificationDueOn: current.nextVerificationDueOn || value.business_date,
        };
      });
    } catch (value) { setError(errorMessage(value)); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [canManage]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  const subjects = useMemo(() => (
    form.subjectKind === 'branch' ? context?.branches || [] : context?.suppliers || []
  ), [context, form.subjectKind]);

  const chooseSubjectKind = (subjectKind: LicenseSubjectKind) => {
    const next = subjectKind === 'branch' ? context?.branches[0] : context?.suppliers[0];
    setForm(current => ({
      ...current, subjectKind, subjectId: next?.id || '',
      evidenceBranchId: subjectKind === 'branch' ? next?.id || '' : current.evidenceBranchId,
    }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setSuccess(''); setFieldErrors({});
    const errors: Record<string, string> = {};
    if (!form.subjectId || !form.evidenceBranchId) errors.subject = 'Select the licence holder and evidence branch';
    if (!form.licenseNumber.trim()) errors.licenseNumber = 'Enter the licence number exactly as shown';
    if (!form.issuingAuthority.trim()) errors.issuingAuthority = 'Enter the authority that issued the licence';
    if (!form.jurisdictionCode.trim()) errors.jurisdictionCode = 'Enter the jurisdiction or state code';
    if (!form.issuedOn || !form.validFrom || !form.nextVerificationDueOn) errors.dates = 'Enter the issue, effective and review dates';
    else if (form.issuedOn > form.validFrom || form.validFrom > (context?.business_date || '')) errors.dates = 'Issue date ≤ effective date ≤ business date';
    else if (form.nextVerificationDueOn < (context?.business_date || '')) errors.dates = 'Choose today or a later review date';
    if (!form.file) errors.file = 'Attach the reviewed licence PDF';
    if (!form.reviewed) errors.reviewed = 'Review and confirm the licence details';
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      setError('Review the highlighted licence fields');
      const first = ['subject', 'licenseNumber', 'issuingAuthority', 'jurisdictionCode', 'dates', 'file', 'reviewed'].find(key => errors[key]);
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-license-field="${first}"]`)?.focus());
      return;
    }
    setSaving(true);
    try {
      const evidence = await drugLicensesApi.uploadEvidence(
        form.evidenceBranchId, form.issuedOn, form.file as File,
      );
      const recorded = await drugLicensesApi.record({
        subject_kind: form.subjectKind,
        subject_id: form.subjectId,
        evidence_branch_id: form.evidenceBranchId,
        license_type_code: form.licenseType,
        license_number: form.licenseNumber,
        issuing_authority: form.issuingAuthority,
        jurisdiction_code: form.jurisdictionCode.toUpperCase(),
        issued_on: form.issuedOn,
        valid_from: form.validFrom,
        next_verification_due_on: form.nextVerificationDueOn,
        evidence_attachment_id: evidence.attachment_id,
        reviewed: true,
        idempotency_key: idempotencyKeyRef.current,
      });
      setSuccess(`${labelForType(recorded.license.license_type_code)} recorded for ${recorded.license.subject_name}`);
      idempotencyKeyRef.current = `license-ui-${crypto.randomUUID()}`;
      setForm(current => ({ ...emptyForm(), subjectKind: current.subjectKind }));
      await load();
    } catch (value) { setError(errorMessage(value)); }
    finally { setSaving(false); }
  };

  if (!canManage) return (
    <div className="p-4 sm:p-6" data-testid="drug-license-setup">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        You do not have permission to manage drug licences. Ask an administrator to update your role.
      </div>
    </div>
  );

  return (
    <div className="min-w-0 overflow-x-hidden bg-gray-50" data-testid="drug-license-setup">
      <div className="mx-auto w-full max-w-6xl space-y-4 p-4 pb-28 sm:p-6 sm:pb-28">
        <header>
          <div className="flex items-center gap-3"><ShieldCheck className="h-7 w-7 text-blue-600" />
            <div><h1 className="text-xl font-semibold text-gray-900">Drug licence setup</h1>
              <p className="text-sm text-gray-600">Record reviewed Forms 20B and 21B for a branch or supplier.</p></div>
          </div>
        </header>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex gap-2"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div><strong>Controlled-drug movements remain unavailable.</strong>
              <p className="mt-1">{context?.controlled_drug_message || 'Forms 20B/21B do not authorize Schedule H/H1/X or NDPS workflows.'}</p></div>
          </div>
        </div>

        {error && <div ref={errorRef} tabIndex={-1} role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
        {success && <div role="status" className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800"><CheckCircle2 className="h-5 w-5" />{success}</div>}

        {loading ? <div className="flex min-h-44 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div> : (
          <form id="drug-license-form" noValidate onSubmit={submit} className="space-y-4">
            {!context?.branches.length && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Create an active branch before recording licence evidence. The PDF must be held by a branch your account can access.
            </div>}
            {form.subjectKind === 'supplier' && !context?.suppliers.length && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Create the supplier first, then return here to record the supplier’s reviewed Forms 20B and 21B.
            </div>}
            <section className="rounded-xl border bg-white p-4 sm:p-5">
              <h2 className="font-semibold text-gray-900">Licence holder</h2>
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="text-sm font-medium text-gray-700">Holder type
                  <select data-testid="license-holder-type" className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 text-base" value={form.subjectKind} onChange={e => chooseSubjectKind(e.target.value as LicenseSubjectKind)}>
                    <option value="branch">Our branch</option><option value="supplier">Supplier</option>
                  </select>
                </label>
                <label className="text-sm font-medium text-gray-700">{form.subjectKind === 'branch' ? 'Branch' : 'Supplier'}
                  <select data-testid="license-subject" data-license-field="subject" aria-invalid={Boolean(fieldErrors.subject)} required className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 text-base" value={form.subjectId} onChange={e => setForm(current => ({ ...current, subjectId: e.target.value, ...(current.subjectKind === 'branch' ? { evidenceBranchId: e.target.value } : {}) }))}>
                    <option value="">Select {form.subjectKind}</option>{subjects.map(option => <option key={option.id} value={option.id}>{option.name} ({option.code})</option>)}
                  </select>
                  {fieldErrors.subject && <span className="mt-1 block text-sm font-normal text-red-700">{fieldErrors.subject}</span>}
                </label>
                {form.subjectKind === 'supplier' && <label className="text-sm font-medium text-gray-700">Branch holding the evidence
                  <select data-testid="license-evidence-branch" required className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 text-base" value={form.evidenceBranchId} onChange={e => setForm(current => ({ ...current, evidenceBranchId: e.target.value }))}>
                    <option value="">Select branch</option>{context?.branches.map(option => <option key={option.id} value={option.id}>{option.name} ({option.code})</option>)}
                  </select>
                </label>}
              </div>
            </section>

            <section className="rounded-xl border bg-white p-4 sm:p-5">
              <h2 className="font-semibold text-gray-900">Reviewed licence details</h2>
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="text-sm font-medium text-gray-700 md:col-span-2">Licence form
                  <select className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 text-base" value={form.licenseType} onChange={e => setForm(current => ({ ...current, licenseType: e.target.value as WholesaleLicenseType }))}>
                    <option value="drug_wholesale_form_20b">Form 20B — wholesale medicines</option>
                    <option value="drug_wholesale_form_21b">Form 21B — Schedule C/C(1) medicines</option>
                  </select>
                </label>
                <label className="text-sm font-medium text-gray-700">Licence number<input data-license-field="licenseNumber" aria-invalid={Boolean(fieldErrors.licenseNumber)} required maxLength={128} className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 text-base" value={form.licenseNumber} onChange={e => setForm(current => ({ ...current, licenseNumber: e.target.value }))} />{fieldErrors.licenseNumber && <span className="mt-1 block text-sm font-normal text-red-700">{fieldErrors.licenseNumber}</span>}</label>
                <label className="text-sm font-medium text-gray-700">Issuing authority<input data-license-field="issuingAuthority" aria-invalid={Boolean(fieldErrors.issuingAuthority)} required maxLength={500} className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 text-base" value={form.issuingAuthority} onChange={e => setForm(current => ({ ...current, issuingAuthority: e.target.value }))} />{fieldErrors.issuingAuthority && <span className="mt-1 block text-sm font-normal text-red-700">{fieldErrors.issuingAuthority}</span>}</label>
                <label className="text-sm font-medium text-gray-700">Jurisdiction / state code<input data-license-field="jurisdictionCode" aria-invalid={Boolean(fieldErrors.jurisdictionCode)} required maxLength={32} className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 text-base uppercase" value={form.jurisdictionCode} onChange={e => setForm(current => ({ ...current, jurisdictionCode: e.target.value }))} />{fieldErrors.jurisdictionCode && <span className="mt-1 block text-sm font-normal text-red-700">{fieldErrors.jurisdictionCode}</span>}</label>
                <label className="text-sm font-medium text-gray-700">Issue date<input data-license-field="dates" aria-invalid={Boolean(fieldErrors.dates)} required type="date" max={context?.business_date} className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 text-base" value={form.issuedOn} onChange={e => setForm(current => ({ ...current, issuedOn: e.target.value }))} /></label>
                <label className="text-sm font-medium text-gray-700">Effective from<input required type="date" max={context?.business_date} className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 text-base" value={form.validFrom} onChange={e => setForm(current => ({ ...current, validFrom: e.target.value }))} /></label>
                <label className="text-sm font-medium text-gray-700">Review again by<input required type="date" min={context?.business_date} className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 text-base" value={form.nextVerificationDueOn} onChange={e => setForm(current => ({ ...current, nextVerificationDueOn: e.target.value }))} /></label>
                <label className="text-sm font-medium text-gray-700 md:col-span-2">Licence PDF
                  <input data-license-field="file" required aria-invalid={Boolean(fieldErrors.file)} type="file" accept="application/pdf,.pdf" className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 bg-white p-2 text-base" onChange={e => setForm(current => ({ ...current, file: e.target.files?.[0] || null }))} />
                  {fieldErrors.file && <span className="mt-1 block text-sm font-normal text-red-700">{fieldErrors.file}</span>}
                  <span className="mt-1 block text-xs font-normal text-gray-500">The private PDF is hash-verified and retained under legal hold.</span>
                </label>
              </div>
              {fieldErrors.dates && <p className="mt-2 text-sm text-red-700">{fieldErrors.dates}</p>}
              <label className="mt-5 flex min-h-11 items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">
                <input data-license-field="reviewed" type="checkbox" aria-invalid={Boolean(fieldErrors.reviewed)} className="mt-1 h-5 w-5" checked={form.reviewed} onChange={e => setForm(current => ({ ...current, reviewed: e.target.checked }))} />
                <span>I reviewed the PDF and confirm the holder, form, number, authority, jurisdiction and dates match exactly.{fieldErrors.reviewed && <span className="mt-1 block text-red-700">{fieldErrors.reviewed}</span>}</span>
              </label>
            </section>

            <section className="rounded-xl border bg-white p-4 sm:p-5">
              <h2 className="font-semibold text-gray-900">Current effective licences</h2>
              {context?.licenses.length ? <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">{context.licenses.map(license => (
                <article key={license.license_id} className="rounded-lg border p-3 text-sm">
                  <div className="flex items-start gap-2"><FileCheck2 className="mt-0.5 h-5 w-5 text-green-600" /><div className="min-w-0"><strong>{license.subject_name}</strong><p>{labelForType(license.license_type_code)}</p><p className="break-words text-gray-600">{license.license_number} · review by {license.next_verification_due_on}</p></div></div>
                </article>
              ))}</div> : <p className="mt-2 text-sm text-gray-600">No reviewed Forms 20B/21B have been recorded yet.</p>}
            </section>
          </form>
        )}
      </div>
      <div className="fixed inset-x-0 bottom-16 z-20 border-t bg-white/95 p-3 backdrop-blur md:bottom-0">
        <div className="mx-auto flex max-w-6xl justify-end"><button form="drug-license-form" type="submit" disabled={saving || loading || !context?.branches.length || !subjects.length} className="min-h-11 w-full rounded-lg bg-blue-600 px-5 font-medium text-white disabled:opacity-50 sm:w-auto">{saving ? 'Verifying and saving…' : 'Save reviewed licence'}</button></div>
      </div>
    </div>
  );
};

export default DrugLicenseSetup;
