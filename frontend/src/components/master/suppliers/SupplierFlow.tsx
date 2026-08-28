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
import { validateSupplierMandatoryFields } from './supplierValidation';
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

    // Save supplier
    const handleSave = async () => {
        if (submissionInFlightRef.current) return;
        setSaving(true);
        setErrors([]);

        // Validation
        const validationErrors = validateSupplierMandatoryFields(formData);
        if (formData.credit_days === '') {
            validationErrors.push('Payment days are required');
        }

        if (validationErrors.length > 0) {
            setErrors(validationErrors);
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
                setErrors(detail.map((e: any) => e.msg || JSON.stringify(e)));
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

    const inputClass = "min-h-12 w-full rounded-lg border border-gray-300 px-3 text-base transition-colors focus:border-transparent focus:ring-2 focus:ring-blue-500";

    return (
        <div className="fixed inset-0 bg-gray-50 z-50 overflow-hidden flex flex-col">
            {/* Header - STANDARD: full-width, py-4, right-aligned save */}
            <header className="shrink-0 border-b border-gray-200 bg-white px-3 py-3 sm:px-6 sm:py-4">
                <div className="flex items-center justify-between">
                    <div className="flex min-w-0 items-center gap-2 sm:gap-4">
                        <button
                            onClick={onClose}
                            className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
                            aria-label="Close supplier form"
                        >
                            <ArrowLeft className="w-5 h-5 text-gray-600" />
                        </button>
                        <div>
                            <h1 className="truncate text-lg font-semibold text-gray-900 sm:text-xl">Add New Supplier</h1>
                            <p className="hidden text-sm text-gray-500 sm:block">Create supplier profile</p>
                        </div>
                    </div>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="hidden min-h-12 items-center gap-2 rounded-lg bg-blue-600 px-4 text-white transition-colors hover:bg-blue-700 disabled:opacity-50 sm:flex"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save Supplier
                    </button>
                </div>
            </header>

            {/* Scrollable Content */}
            <main className="flex-1 overflow-y-auto py-4 sm:py-6" ref={formRef}>
                <div className="mx-auto max-w-6xl space-y-4 px-3 sm:space-y-8 sm:px-6">
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
                    <section className="bg-white rounded-xl border border-gray-200 p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <Building2 className="w-5 h-5 text-blue-600" />
                            Basic Information
                        </h2>
                        <p className="mb-4 text-sm text-gray-500">
                            Internal supplier code is generated automatically after saving.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Supplier Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formData.supplier_name}
                                    onChange={(e) => setFormData({ ...formData, supplier_name: e.target.value })}
                                    className={inputClass}
                                    placeholder="e.g., ABC Pharmaceuticals"
                                />
                            </div>
                        </div>
                    </section>

                    {/* Contact Information */}
                    <section className="bg-white rounded-xl border border-gray-200 p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <Phone className="w-5 h-5 text-blue-600" />
                            Contact Information
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Phone <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="tel"
                                    required
                                    inputMode="tel"
                                    value={formData.phone}
                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                    className={inputClass}
                                    placeholder="Business phone"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    className={inputClass}
                                    placeholder="email@example.com"
                                />
                            </div>
                        </div>

                        {/* Contact Person row */}
                        <div className="grid grid-cols-1 gap-4 mt-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Contact Person</label>
                                <input
                                    type="text"
                                    value={formData.contact_person}
                                    onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                                    className={inputClass}
                                    placeholder="Contact person name"
                                />
                            </div>
                        </div>
                    </section>

                    {/* Address */}
                    <section className="bg-white rounded-xl border border-gray-200 p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <MapPin className="w-5 h-5 text-blue-600" />
                            Address
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <label className="text-sm font-medium text-gray-700">Building / Street Address *
                                <input value={formData.address_line1} onChange={(event) => setFormData({ ...formData, address_line1: event.target.value })} className={`${inputClass} mt-1`} />
                            </label>
                            <label className="text-sm font-medium text-gray-700">Area / Additional
                                <input value={formData.address_line2} onChange={(event) => setFormData({ ...formData, address_line2: event.target.value })} className={`${inputClass} mt-1`} />
                            </label>
                            <label className="text-sm font-medium text-gray-700">City *
                                <input value={formData.city} onChange={(event) => setFormData({ ...formData, city: event.target.value })} className={`${inputClass} mt-1`} />
                            </label>
                            <label className="text-sm font-medium text-gray-700">GST state code (2 digits) *
                                <GSTJurisdictionSelect value={formData.state_code} onChange={(stateCode) => setFormData({ ...formData, state_code: stateCode })} className={`${inputClass} mt-1`} required />
                            </label>
                            <label className="text-sm font-medium text-gray-700">Pincode *
                                <input type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={formData.pincode} onChange={(event) => setFormData({ ...formData, pincode: event.target.value.replace(/\D/g, '').slice(0, 6) })} className={`${inputClass} mt-1`} />
                            </label>
                        </div>
                    </section>

                    {/* Tax & Compliance */}
                    <section className="bg-white rounded-xl border border-gray-200 p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <FileText className="w-5 h-5 text-blue-600" />
                            Tax & Compliance
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">GSTIN</label>
                                <input
                                    type="text"
                                    value={formData.gst_number}
                                    onChange={(e) => setFormData({ ...formData, gst_number: e.target.value.toUpperCase() })}
                                    className={inputClass}
                                    placeholder="15 characters"
                                    maxLength={15}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">PAN</label>
                                <input
                                    type="text"
                                    value={formData.pan_number}
                                    onChange={(e) => setFormData({ ...formData, pan_number: e.target.value.toUpperCase() })}
                                    className={inputClass}
                                    placeholder="10 characters"
                                    maxLength={10}
                                />
                            </div>
                        </div>
                        <p className="mt-3 text-xs text-gray-500">
                            License verification is completed after the supplier profile is created.
                        </p>
                    </section>

                    {/* Payment terms */}
                    <section className="bg-white rounded-xl border border-gray-200 p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <Banknote className="w-5 h-5 text-blue-600" />
                            Payment Terms
                        </h2>
                        <div className="max-w-sm">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Payment days *</label>
                                <input
                                    type="number"
                                    inputMode="numeric"
                                    min={0}
                                    max={180}
                                    value={formData.credit_days}
                                    onChange={(e) => setFormData({ ...formData, credit_days: e.target.value === '' ? '' : Number(e.target.value) })}
                                    className={inputClass}
                                    placeholder="Enter 0–180"
                                />
                            </div>
                        </div>
                        <p className="mt-3 text-xs text-gray-500">
                            Bank details are added through the reviewed banking workflow.
                        </p>
                    </section>
                </div>
            </main>

            {/* Sticky Footer - STANDARD: full-width, py-4, right-aligned */}
            <footer className="shrink-0 border-t border-gray-200 bg-white px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-4">
                <div className="flex items-center justify-end gap-2 sm:gap-3">
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="min-h-12 flex-1 rounded-lg border border-gray-300 px-4 text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 sm:flex-none sm:px-6"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex min-h-12 flex-[2] items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-white transition-colors hover:bg-blue-700 disabled:opacity-50 sm:flex-none sm:px-6"
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
