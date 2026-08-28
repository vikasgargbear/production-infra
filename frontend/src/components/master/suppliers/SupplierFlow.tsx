/**
 * SupplierFlow Component
 * 
 * Full-page immersive supplier creation experience.
 * Streamlined layout following CustomerFlow/ProductFlow pattern.
 */

import React, { useState, useRef, useCallback } from 'react';
import {
    Building2, Phone, MapPin, FileText,
    AlertTriangle, ArrowLeft, Loader2, Save,
    Banknote
} from 'lucide-react';
import { suppliersApi } from '../../../services/api';
import useEscapeKey from '../../../hooks/useEscapeKey';
import { useEnterAsTab } from '../../../hooks/useEnterAsTab';
import { toast } from 'react-toastify';
import {
    validateSupplierFields,
    validateSupplierMandatoryFields,
    type SupplierField,
    type SupplierFieldErrors,
} from './supplierValidation';
import GSTJurisdictionSelect from '../../global/ui/forms/GSTJurisdictionSelect';
import { newMasterCreateIdempotencyKey } from '../../../services/api/modules/master/masterCreationContract';
import type { CanonicalSupplierCreateResponse } from '../../../services/api/modules/master/masterCreationContract';

// ==================== TYPES ====================

interface SupplierFlowProps {
    open?: boolean;
    show?: boolean;  // Alias for backward compatibility
    isOpen?: boolean;  // Another alias used by some components
    onClose?: () => void;
    onSupplierCreated?: (supplier: CanonicalSupplierCreateResponse) => void;
    initialData?: Partial<SupplierFormData>;
}

interface SupplierFormData {
    // Basic Info
    supplier_name: string;
    // Contact
    phone: string;
    email: string;
    // Contact Person
    contact_person: string;
    // Address
    address_line1: string;
    address_line2: string;
    city: string;
    state_code: string;
    pincode: string;
    // Compliance
    gst_number: string;
    pan_number: string;
    // Terms
    credit_days: number | '';
}

const SUPPLIER_FIELD_IDS: Record<SupplierField, string> = {
    supplier_name: 'supplier-name',
    phone: 'supplier-phone',
    email: 'supplier-email',
    address_line1: 'supplier-address-line1',
    city: 'supplier-city',
    state_code: 'supplier-state-code',
    pincode: 'supplier-pincode',
    gst_number: 'supplier-gstin',
    pan_number: 'supplier-pan',
    credit_days: 'supplier-payment-days',
};

const API_FIELD_NAMES: Record<string, SupplierField> = {
    supplier_name: 'supplier_name',
    primary_phone: 'phone',
    primary_email: 'email',
    address_line1: 'address_line1',
    city: 'city',
    state_code: 'state_code',
    pincode: 'pincode',
    gst_number: 'gst_number',
    pan_number: 'pan_number',
    payment_days: 'credit_days',
};

// ==================== COMPONENT ====================

const SupplierFlow: React.FC<SupplierFlowProps> = ({
    open,
    show,
    isOpen: isOpenProp,
    onClose,
    onSupplierCreated,
    initialData = {}
}) => {
    // Use any of the visibility props
    const isOpen = open ?? show ?? isOpenProp ?? true;

    const formRef = useRef<HTMLDivElement>(null);
    const submissionInFlightRef = useRef(false);
    const idempotencyKeyRef = useRef(newMasterCreateIdempotencyKey('supplier'));
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState<string[]>([]);
    const [fieldErrors, setFieldErrors] = useState<SupplierFieldErrors>({});
    const [formData, setFormData] = useState<SupplierFormData>({
        // Basic Info
        supplier_name: '',
        // Contact
        phone: '',
        email: '',
        // Contact Person
        contact_person: '',
        // Address
        address_line1: '',
        address_line2: '',
        city: '',
        state_code: '',
        pincode: '',
        // Compliance
        gst_number: '',
        pan_number: '',
        // Terms
        credit_days: '',
        ...initialData
    });

    // Enable Enter-as-Tab navigation
    useEnterAsTab({
        containerRef: formRef,
        enabled: isOpen,
        excludeSelectors: ['textarea', 'button[type="submit"]']
    });

    // ESC key handling
    useEscapeKey(
        useCallback(() => {
            if (onClose) onClose();
        }, [onClose]),
        isOpen,
        'SupplierFlow-Main'
    );

    const updateField = <K extends keyof SupplierFormData>(field: K, value: SupplierFormData[K]) => {
        setFormData(previous => ({ ...previous, [field]: value }));
        if (field in SUPPLIER_FIELD_IDS) {
            setFieldErrors(previous => ({ ...previous, [field]: undefined }));
        }
    };

    const focusFirstInvalidField = (invalidFields: SupplierFieldErrors) => {
        const firstField = (Object.keys(SUPPLIER_FIELD_IDS) as SupplierField[])
            .find(field => Boolean(invalidFields[field]));
        if (!firstField) return;
        window.setTimeout(() => {
            document.getElementById(SUPPLIER_FIELD_IDS[firstField])?.focus();
        }, 0);
    };

    // Save supplier
    const handleSave = async () => {
        if (submissionInFlightRef.current) return;
        setSaving(true);
        setErrors([]);
        setFieldErrors({});

        // Validation
        const validationErrors = validateSupplierMandatoryFields(formData);
        if (validationErrors.length > 0) {
            const invalidFields = validateSupplierFields(formData);
            setErrors(validationErrors);
            setFieldErrors(invalidFields);
            focusFirstInvalidField(invalidFields);
            setSaving(false);
            return;
        }

        submissionInFlightRef.current = true;
        try {
            const supplierData = {
                supplier_name: formData.supplier_name,
                primary_phone: formData.phone,
                primary_email: formData.email || undefined,
                contact_person: formData.contact_person || undefined,
                address_line1: formData.address_line1 || undefined,
                address_line2: formData.address_line2 || undefined,
                city: formData.city,
                state_code: formData.state_code,
                pincode: formData.pincode || undefined,
                gst_number: formData.gst_number || undefined,
                pan_number: formData.pan_number || undefined,
                payment_days: formData.credit_days
            };

            const response = await suppliersApi.create(supplierData, idempotencyKeyRef.current);

            if (response.data) {
                toast.success(`Supplier ${response.data.supplier_code} created successfully.`);
                idempotencyKeyRef.current = newMasterCreateIdempotencyKey('supplier');
                onSupplierCreated?.(response.data);
                onClose?.();
            }
        } catch (error: any) {
            const detail = error.response?.data?.detail;
            if (typeof detail === 'string') {
                setErrors([detail]);
            } else if (Array.isArray(detail)) {
                const apiFieldErrors: SupplierFieldErrors = {};
                const messages = detail.map((entry: any) => {
                    const fieldName = Array.isArray(entry?.loc) ? entry.loc[entry.loc.length - 1] : undefined;
                    const field = typeof fieldName === 'string' ? API_FIELD_NAMES[fieldName] : undefined;
                    const message = typeof entry === 'string' ? entry : entry.msg || JSON.stringify(entry);
                    if (field) apiFieldErrors[field] = message;
                    return message;
                });
                setErrors(messages);
                setFieldErrors(apiFieldErrors);
                focusFirstInvalidField(apiFieldErrors);
            } else {
                setErrors(['Failed to create supplier. Please try again.']);
            }
            toast.error('Failed to create supplier');
        } finally {
            submissionInFlightRef.current = false;
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    const inputClass = "min-h-12 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100";
    const invalidClass = "border-red-500 bg-red-50 focus:ring-red-500";
    const fieldClass = (field: SupplierField, baseClass: string) => `${baseClass} ${fieldErrors[field] ? invalidClass : ''}`;
    const fieldError = (field: SupplierField) => fieldErrors[field] ? (
        <p id={`${SUPPLIER_FIELD_IDS[field]}-error`} className="mt-1 text-xs text-red-600" role="alert">
            {fieldErrors[field]}
        </p>
    ) : null;
    const fieldA11y = (field: SupplierField) => ({
        id: SUPPLIER_FIELD_IDS[field],
        'aria-invalid': Boolean(fieldErrors[field]) || undefined,
        'aria-describedby': fieldErrors[field] ? `${SUPPLIER_FIELD_IDS[field]}-error` : undefined,
    });

    return (
        <div className="fixed inset-0 z-50 flex min-w-0 flex-col overflow-hidden bg-gray-50">
            {/* Header - STANDARD: full-width, py-4, right-aligned save */}
            <header className="shrink-0 border-b border-gray-200 bg-white px-3 py-3 sm:px-6 sm:py-4">
                <div className="flex items-center justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                        <button
                            onClick={onClose}
                            className="grid min-h-11 min-w-11 place-items-center rounded-lg hover:bg-gray-100"
                            aria-label="Close supplier form"
                        >
                            <ArrowLeft className="w-5 h-5 text-gray-600" />
                        </button>
                        <div className="min-w-0">
                            <h1 className="truncate text-lg font-semibold text-gray-950 sm:text-xl">Create supplier</h1>
                            <p className="truncate text-sm text-gray-500">Legal identity, address, tax registration and payment terms</p>
                        </div>
                    </div>
                    <span className="hidden rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-800 sm:inline">Canonical supplier account</span>
                </div>
            </header>

            {/* Scrollable Content */}
            <main className="flex-1 overflow-y-auto py-5 pb-28" ref={formRef}>
                <div className="mx-auto max-w-6xl space-y-5 px-3 sm:px-6">
                    {/* Error Display */}
                    {errors.length > 0 && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-medium text-red-800">Please fix the following errors:</p>
                                    <ul className="mt-2 text-sm text-red-700 list-disc list-inside">
                                        {errors.map((err, i) => <li key={i}>{err}</li>)}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Basic Information */}
                    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <Building2 className="w-5 h-5 text-blue-600" />
                            Basic Information
                        </h2>
                        <p className="mb-4 text-sm text-gray-500">
                            Internal supplier code is generated automatically after saving.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="supplier-name" className="block text-sm font-medium text-gray-700 mb-1">
                                    Supplier Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                    {...fieldA11y('supplier_name')}
                                    type="text"
                                    autoComplete="organization"
                                    required
                                    value={formData.supplier_name}
                                    onChange={(e) => updateField('supplier_name', e.target.value)}
                                    className={fieldClass('supplier_name', inputClass)}
                                    placeholder="e.g., ABC Pharmaceuticals"
                                />
                                {fieldError('supplier_name')}
                            </div>
                        </div>
                    </section>

                    {/* Contact Information */}
                    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <Phone className="w-5 h-5 text-blue-600" />
                            Contact Information
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="supplier-phone" className="block text-sm font-medium text-gray-700 mb-1">
                                    Phone <span className="text-red-500">*</span>
                                </label>
                                <input
                                    {...fieldA11y('phone')}
                                    type="tel"
                                    required
                                    inputMode="tel"
                                    autoComplete="tel"
                                    value={formData.phone}
                                    onChange={(e) => updateField('phone', e.target.value)}
                                    className={fieldClass('phone', inputClass)}
                                    placeholder="Business phone"
                                />
                                {fieldError('phone')}
                            </div>
                            <div>
                                <label htmlFor="supplier-email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                <input
                                    {...fieldA11y('email')}
                                    type="email"
                                    autoComplete="email"
                                    value={formData.email}
                                    onChange={(e) => updateField('email', e.target.value)}
                                    className={fieldClass('email', inputClass)}
                                    placeholder="email@example.com"
                                />
                                {fieldError('email')}
                            </div>
                        </div>

                        {/* Contact Person row */}
                        <div className="grid grid-cols-1 gap-4 mt-4">
                            <div>
                                <label htmlFor="supplier-contact" className="block text-sm font-medium text-gray-700 mb-1">Contact Person</label>
                                <input
                                    type="text"
                                    id="supplier-contact"
                                    value={formData.contact_person}
                                    onChange={(e) => updateField('contact_person', e.target.value)}
                                    className={inputClass}
                                    placeholder="Contact person name"
                                />
                            </div>
                        </div>
                    </section>

                    {/* Address */}
                    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <MapPin className="w-5 h-5 text-blue-600" />
                            Address
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <label htmlFor="supplier-address-line1" className="text-sm font-medium text-gray-700">Building / Street Address *
                                <input {...fieldA11y('address_line1')} autoComplete="street-address" value={formData.address_line1} onChange={(event) => updateField('address_line1', event.target.value)} className={fieldClass('address_line1', `${inputClass} mt-1`)} />
                                {fieldError('address_line1')}
                            </label>
                            <label htmlFor="supplier-address-line2" className="text-sm font-medium text-gray-700">Area / Additional
                                <input id="supplier-address-line2" value={formData.address_line2} onChange={(event) => updateField('address_line2', event.target.value)} className={`${inputClass} mt-1`} />
                            </label>
                            <label htmlFor="supplier-city" className="text-sm font-medium text-gray-700">City *
                                <input {...fieldA11y('city')} autoComplete="address-level2" value={formData.city} onChange={(event) => updateField('city', event.target.value)} className={fieldClass('city', `${inputClass} mt-1`)} />
                                {fieldError('city')}
                            </label>
                            <label htmlFor="supplier-state-code" className="text-sm font-medium text-gray-700">GST state code (2 digits) *
                                <GSTJurisdictionSelect {...fieldA11y('state_code')} value={formData.state_code} onChange={(stateCode) => updateField('state_code', stateCode)} className={fieldClass('state_code', `${inputClass} mt-1`)} required />
                                {fieldError('state_code')}
                            </label>
                            <label htmlFor="supplier-pincode" className="text-sm font-medium text-gray-700">Pincode *
                                <input {...fieldA11y('pincode')} type="text" inputMode="numeric" autoComplete="postal-code" pattern="[0-9]{6}" maxLength={6} value={formData.pincode} onChange={(event) => updateField('pincode', event.target.value.replace(/\D/g, '').slice(0, 6))} className={fieldClass('pincode', `${inputClass} mt-1`)} />
                                {fieldError('pincode')}
                            </label>
                        </div>
                    </section>

                    {/* Tax & Compliance */}
                    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <FileText className="w-5 h-5 text-blue-600" />
                            Tax & Compliance
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="supplier-gstin" className="block text-sm font-medium text-gray-700 mb-1">GSTIN</label>
                                <input
                                    {...fieldA11y('gst_number')}
                                    type="text"
                                    value={formData.gst_number}
                                    onChange={(e) => updateField('gst_number', e.target.value.toUpperCase())}
                                    className={fieldClass('gst_number', inputClass)}
                                    placeholder="15 characters"
                                    maxLength={15}
                                />
                                {fieldError('gst_number')}
                            </div>
                            <div>
                                <label htmlFor="supplier-pan" className="block text-sm font-medium text-gray-700 mb-1">PAN</label>
                                <input
                                    {...fieldA11y('pan_number')}
                                    type="text"
                                    value={formData.pan_number}
                                    onChange={(e) => updateField('pan_number', e.target.value.toUpperCase())}
                                    className={fieldClass('pan_number', inputClass)}
                                    placeholder="10 characters"
                                    maxLength={10}
                                />
                                {fieldError('pan_number')}
                            </div>
                        </div>
                        <p className="mt-3 text-xs text-gray-500">
                            License verification is completed after the supplier profile is created.
                        </p>
                    </section>

                    {/* Payment terms */}
                    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <Banknote className="w-5 h-5 text-blue-600" />
                            Payment Terms
                        </h2>
                        <div className="max-w-sm">
                            <div>
                                <label htmlFor="supplier-payment-days" className="block text-sm font-medium text-gray-700 mb-1">Payment days *</label>
                                <input
                                    {...fieldA11y('credit_days')}
                                    type="number"
                                    inputMode="numeric"
                                    min={0}
                                    max={180}
                                    value={formData.credit_days}
                                    onChange={(e) => updateField('credit_days', e.target.value === '' ? '' : Number(e.target.value))}
                                    className={fieldClass('credit_days', inputClass)}
                                    placeholder="Enter 0–180"
                                />
                                {fieldError('credit_days')}
                            </div>
                        </div>
                        <p className="mt-3 text-xs text-gray-500">
                            Bank details are added through the reviewed banking workflow.
                        </p>
                    </section>
                </div>
            </main>

            {/* Sticky Footer - STANDARD: full-width, py-4, right-aligned */}
            <footer className="absolute inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] shrink-0 border-t border-gray-200 bg-white/95 px-3 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.06)] backdrop-blur sm:px-6 md:bottom-0">
                <div className="flex items-center justify-end gap-3">
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="min-h-12 rounded-lg border border-gray-300 px-5 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex min-h-12 min-w-40 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-base font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {saving ? 'Saving...' : 'Save Supplier'}
                    </button>
                </div>
            </footer>
        </div>
    );
};

export default SupplierFlow;
