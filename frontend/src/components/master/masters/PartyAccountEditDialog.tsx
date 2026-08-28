import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Save, X } from 'lucide-react';
import { toast } from 'react-toastify';

import Button from '../../global/ui/Button';
import { customersApi } from '../../../services/api/modules/master/customers.api';
import { suppliersApi } from '../../../services/api/modules/master/suppliers.api';
import { newMasterUpdateIdempotencyKey } from '../../../services/api/modules/master/masterCreationContract';

type PartyKind = 'customer' | 'supplier';
type EditField = 'name' | 'type' | 'phone' | 'email' | 'contact' | 'pan' | 'terms';

export interface EditablePartyAccount {
  customer_id?: string;
  supplier_id?: string;
  customer_name?: string;
  supplier_name?: string;
  customer_type?: string;
  primary_phone?: string | null;
  primary_email?: string | null;
  contact_person_name?: string | null;
  contact_person?: string | null;
  pan_number?: string | null;
  credit_limit?: string | number;
  credit_days?: number;
  payment_days?: number;
  account_row_version: number;
  party_row_version: number;
}

interface Props {
  kind: PartyKind;
  account: EditablePartyAccount;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

type FormState = Record<EditField, string>;
type FieldErrors = Partial<Record<EditField | 'form', string>>;

const PHONE = /^\d{10}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const MONEY = /^(?:0|[1-9][0-9]{0,17})(?:\.[0-9]{1,2})?$/;

const initialForm = (kind: PartyKind, account: EditablePartyAccount): FormState => ({
  name: String(kind === 'customer' ? account.customer_name || '' : account.supplier_name || ''),
  type: String(account.customer_type || 'organization'),
  phone: String(account.primary_phone || ''),
  email: String(account.primary_email || ''),
  contact: String(account.contact_person_name || account.contact_person || ''),
  pan: String(account.pan_number || ''),
  terms: kind === 'customer'
    ? `${String(account.credit_limit ?? '0.00')}|${String(account.credit_days ?? 0)}`
    : String(account.payment_days ?? 0),
});

const PartyAccountEditDialog: React.FC<Props> = ({ kind, account, onClose, onSaved }) => {
  const initial = initialForm(kind, account);
  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const idempotencyKey = useRef(newMasterUpdateIdempotencyKey(kind));
  const fields = useRef<Partial<Record<EditField, HTMLInputElement | HTMLSelectElement | null>>>({});

  useEffect(() => {
    fields.current.name?.focus();
  }, []);

  const set = (field: EditField, value: string) => {
    setForm(current => ({ ...current, [field]: value }));
    setErrors(current => ({ ...current, [field]: undefined, form: undefined }));
  };

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    if (!form.name.trim()) next.name = `${kind === 'customer' ? 'Customer' : 'Supplier'} name is required.`;
    if (kind === 'customer' && !PHONE.test(form.phone.replace(/\D/g, ''))) {
      next.phone = 'Enter the exact 10-digit customer phone number.';
    }
    if (kind === 'supplier' && form.phone.trim() && !PHONE.test(form.phone.replace(/\D/g, ''))) {
      next.phone = 'Enter a 10-digit supplier phone number or leave it blank.';
    }
    if (form.email.trim() && !EMAIL.test(form.email.trim())) next.email = 'Enter a valid email address.';
    const supplierContactTouched = kind === 'supplier'
      && (form.phone !== initial.phone || form.email !== initial.email || form.contact !== initial.contact);
    if (supplierContactTouched && !form.phone.trim() && !form.email.trim()) {
      next.phone = 'Keep either a supplier phone number or email address.';
    }
    if (form.pan.trim() && !PAN.test(form.pan.trim().toUpperCase())) {
      next.pan = 'Enter PAN as 5 letters, 4 digits, and 1 letter.';
    }
    if (kind === 'customer') {
      const [limit, days] = form.terms.split('|');
      if (!MONEY.test(limit)) next.terms = 'Enter a non-negative credit limit with at most 2 decimals.';
      else if (!/^\d+$/.test(days) || Number(days) > 365) next.terms = 'Credit days must be an integer from 0 to 365.';
    } else if (!/^\d+$/.test(form.terms) || Number(form.terms) > 180) {
      next.terms = 'Payment days must be an integer from 0 to 180.';
    }
    return next;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors = validate();
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      const first = (['name', 'phone', 'email', 'pan', 'terms'] as EditField[])
        .find(field => nextErrors[field]);
      if (first) fields.current[first]?.focus();
      return;
    }

    const dirty = (Object.keys(form) as EditField[]).filter(field => form[field] !== initial[field]);
    if (!dirty.length) {
      setErrors({ form: 'Change at least one canonical account field before saving.' });
      return;
    }

    setSaving(true);
    try {
      if (kind === 'customer') {
        const [creditLimit, creditDays] = form.terms.split('|');
        const payload: Parameters<typeof customersApi.update>[1] = {
          account_row_version: account.account_row_version,
          party_row_version: account.party_row_version,
        };
        if (dirty.includes('name')) payload.customer_name = form.name.trim();
        if (dirty.includes('type')) payload.customer_type = form.type as 'individual' | 'organization';
        if (dirty.includes('phone')) payload.primary_phone = form.phone.replace(/\D/g, '');
        if (dirty.includes('email')) payload.primary_email = form.email.trim() || null;
        if (dirty.includes('contact')) payload.contact_person_name = form.contact.trim() || null;
        if (dirty.includes('pan')) payload.pan_number = form.pan.trim().toUpperCase() || null;
        if (dirty.includes('terms')) {
          payload.credit_limit = creditLimit;
          payload.credit_days = Number(creditDays);
        }
        await customersApi.update(
          String(account.customer_id), payload, idempotencyKey.current,
        );
      } else {
        const payload: Parameters<typeof suppliersApi.update>[1] = {
          account_row_version: account.account_row_version,
          party_row_version: account.party_row_version,
        };
        if (dirty.includes('name')) payload.supplier_name = form.name.trim();
        if (dirty.includes('phone')) payload.primary_phone = form.phone.replace(/\D/g, '') || null;
        if (dirty.includes('email')) payload.primary_email = form.email.trim() || null;
        if (dirty.includes('contact')) payload.contact_person = form.contact.trim() || null;
        if (dirty.includes('pan')) payload.pan_number = form.pan.trim().toUpperCase() || null;
        if (dirty.includes('terms')) payload.payment_days = Number(form.terms);
        await suppliersApi.update(
          String(account.supplier_id), payload, idempotencyKey.current,
        );
      }
      toast.success(`${kind === 'customer' ? 'Customer' : 'Supplier'} updated.`);
      await onSaved();
      onClose();
    } catch (error: any) {
      const detail = error?.response?.data?.detail;
      setErrors({ form: typeof detail === 'string' ? detail : 'The canonical update could not be saved.' });
    } finally {
      setSaving(false);
    }
  };

  const inputClass = (field: EditField) => `min-h-11 w-full rounded-lg border px-3 text-base outline-none focus:ring-2 ${
    errors[field] ? 'border-red-500 focus:ring-red-300' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-200'
  }`;
  const describedBy = (field: EditField) => errors[field] ? `${kind}-edit-${field}-error` : undefined;
  const errorFor = (field: EditField) => errors[field] ? (
    <p id={`${kind}-edit-${field}-error`} className="mt-1 text-sm text-red-700">{errors[field]}</p>
  ) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby={`${kind}-edit-title`} className="max-h-[95vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:max-w-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between border-b px-5 py-4">
          <div><h2 id={`${kind}-edit-title`} className="text-lg font-semibold">Edit {kind} account</h2><p className="mt-1 text-sm text-gray-600">Account identity, row versions, and replay protection stay canonical.</p></div>
          <button type="button" aria-label="Close edit dialog" onClick={onClose} className="rounded p-2 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={submit} noValidate className="space-y-5 p-5">
          {errors.form && <div role="alert" className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertCircle className="h-5 w-5 shrink-0" />{errors.form}</div>}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2"><span className="mb-1 block text-sm font-medium">Legal name</span><input ref={node => { fields.current.name = node; }} value={form.name} onChange={e => set('name', e.target.value)} aria-invalid={Boolean(errors.name)} aria-describedby={describedBy('name')} className={inputClass('name')} />{errorFor('name')}</label>
            {kind === 'customer' && <label><span className="mb-1 block text-sm font-medium">Customer type</span><select ref={node => { fields.current.type = node; }} value={form.type} onChange={e => set('type', e.target.value)} className={inputClass('type')}><option value="individual">Individual</option><option value="organization">Organization</option></select></label>}
            <label><span className="mb-1 block text-sm font-medium">Phone</span><input ref={node => { fields.current.phone = node; }} inputMode="numeric" value={form.phone} onChange={e => set('phone', e.target.value)} aria-invalid={Boolean(errors.phone)} aria-describedby={describedBy('phone')} className={inputClass('phone')} />{errorFor('phone')}</label>
            <label><span className="mb-1 block text-sm font-medium">Email</span><input ref={node => { fields.current.email = node; }} type="email" value={form.email} onChange={e => set('email', e.target.value)} aria-invalid={Boolean(errors.email)} aria-describedby={describedBy('email')} className={inputClass('email')} />{errorFor('email')}</label>
            <label><span className="mb-1 block text-sm font-medium">Contact person</span><input ref={node => { fields.current.contact = node; }} value={form.contact} onChange={e => set('contact', e.target.value)} className={inputClass('contact')} /></label>
            <label><span className="mb-1 block text-sm font-medium">PAN</span><input ref={node => { fields.current.pan = node; }} value={form.pan} onChange={e => set('pan', e.target.value.toUpperCase())} maxLength={10} aria-invalid={Boolean(errors.pan)} aria-describedby={describedBy('pan')} className={inputClass('pan')} />{errorFor('pan')}</label>
            {kind === 'customer' ? <><label><span className="mb-1 block text-sm font-medium">Credit limit</span><input ref={node => { fields.current.terms = node; }} inputMode="decimal" value={form.terms.split('|')[0]} onChange={e => set('terms', `${e.target.value}|${form.terms.split('|')[1]}`)} aria-invalid={Boolean(errors.terms)} aria-describedby={describedBy('terms')} className={inputClass('terms')} />{errorFor('terms')}</label><label><span className="mb-1 block text-sm font-medium">Credit days</span><input inputMode="numeric" value={form.terms.split('|')[1]} onChange={e => set('terms', `${form.terms.split('|')[0]}|${e.target.value}`)} className={inputClass('terms')} /></label></> : <label><span className="mb-1 block text-sm font-medium">Payment days</span><input ref={node => { fields.current.terms = node; }} inputMode="numeric" value={form.terms} onChange={e => set('terms', e.target.value)} aria-invalid={Boolean(errors.terms)} aria-describedby={describedBy('terms')} className={inputClass('terms')} />{errorFor('terms')}</label>}
          </div>
          <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">GST registrations and addresses are separate canonical subresources and are not overwritten by this account edit.</p>
          <div className="flex justify-end gap-3 border-t pt-4"><Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" loading={saving} icon={<Save className="h-4 w-4" />}>Save canonical update</Button></div>
        </form>
      </section>
    </div>
  );
};

export default PartyAccountEditDialog;
