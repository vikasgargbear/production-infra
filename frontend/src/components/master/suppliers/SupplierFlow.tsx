/**
 * SupplierFlow Component
 * 
 * Full-page immersive supplier creation experience.
 * Streamlined layout following CustomerFlow/ProductFlow pattern.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    Building2, Phone, Mail, MapPin, FileText,
    AlertTriangle, ArrowLeft, Loader2, Save,
    Banknote
} from 'lucide-react';
import { suppliersApi } from '../../../services/api';
import useEscapeKey from '../../../hooks/useEscapeKey';
import { useEnterAsTab } from '../../../hooks/useEnterAsTab';
import { toast } from 'react-toastify';
import { AddressInput, AddressInputData } from '../../global';
import { validateSupplierMandatoryFields } from './supplierValidation';

// ==================== TYPES ====================

interface SupplierFlowProps {
    open?: boolean;
    show?: boolean;  // Alias for backward compatibility
    isOpen?: boolean;  // Another alias used by some components
    onClose?: () => void;
    onSupplierCreated?: (supplier: any) => void;
    initialData?: Partial<SupplierFormData>;
}

interface SupplierFormData {
    // Basic Info
    supplier_name: string;
    supplier_code: string;
    supplier_type: string;
    // Contact
    phone: string;
    whatsapp_number: string;
    email: string;
    // Contact Person
    contact_person: string;
    contact_person_phone: string;
    // Address
    address_line1: string;
    address_line2: string;
    city: string;
    state: string;
    pincode: string;
    // Compliance
    gst_number: string;
    pan_number: string;
    // Terms
    payment_terms: string;
    credit_days: number;
}

// ==================== CONSTANTS ====================

const INDIAN_STATES = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
    'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
    'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
    'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
    'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
    'Andaman and Nicobar Islands', 'Chandigarh',
    'Dadra and Nagar Haveli and Daman and Diu', 'Delhi',
    'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry'
];

const SUPPLIER_TYPES = [
    { value: 'distributor', label: 'Distributor' },
    { value: 'manufacturer', label: 'Manufacturer' },
    { value: 'stockist', label: 'Stockist' },
    { value: 'wholesaler', label: 'Wholesaler' },
    { value: 'importer', label: 'Importer' }
];

const PAYMENT_TERMS = [
    { value: 'CASH', label: 'Cash', days: 0 },
    { value: 'NET7', label: 'Net 7 Days', days: 7 },
    { value: 'NET15', label: 'Net 15 Days', days: 15 },
    { value: 'NET30', label: 'Net 30 Days', days: 30 },
    { value: 'NET45', label: 'Net 45 Days', days: 45 },
    { value: 'NET60', label: 'Net 60 Days', days: 60 }
];

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
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState<string[]>([]);
    const [useBusinessPhone, setUseBusinessPhone] = useState(false);

    const [formData, setFormData] = useState<SupplierFormData>({
        // Basic Info
        supplier_name: '',
        supplier_code: '',
        supplier_type: 'distributor',
        // Contact
        phone: '',
        whatsapp_number: '',
        email: '',
        // Contact Person
        contact_person: '',
        contact_person_phone: '',
        // Address
        address_line1: '',
        address_line2: '',
        city: '',
        state: 'Maharashtra',
        pincode: '',
        // Compliance
        gst_number: '',
        pan_number: '',
        // Terms
        payment_terms: 'NET30',
        credit_days: 30,
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

    // Auto-sync WhatsApp with business phone
    useEffect(() => {
        if (useBusinessPhone && formData.phone) {
            setFormData(prev => ({ ...prev, whatsapp_number: prev.phone }));
        }
    }, [useBusinessPhone, formData.phone]);

    // Auto-calculate credit days from payment terms
    const handlePaymentTermsChange = (value: string) => {
        const term = PAYMENT_TERMS.find(t => t.value === value);
        setFormData({
            ...formData,
            payment_terms: value,
            credit_days: term?.days ?? 30
        });
    };

    // Save supplier
    const handleSave = async () => {
        setSaving(true);
        setErrors([]);

        // Validation
        const validationErrors = validateSupplierMandatoryFields(formData);

        if (validationErrors.length > 0) {
            setErrors(validationErrors);
            setSaving(false);
            return;
        }

        try {
            const supplierData = {
                supplier_name: formData.supplier_name,
                supplier_code: formData.supplier_code || undefined,
                supplier_type: formData.supplier_type,
                primary_phone: formData.phone,
                secondary_phone: formData.whatsapp_number !== formData.phone ? formData.whatsapp_number : undefined,
                primary_email: formData.email || undefined,
                contact_person: formData.contact_person || undefined,
                contact_person_phone: formData.contact_person_phone || undefined,
                address_line1: formData.address_line1 || undefined,
                address_line2: formData.address_line2 || undefined,
                city: formData.city,
                state: formData.state,
                pincode: formData.pincode || undefined,
                gst_number: formData.gst_number || undefined,
                pan_number: formData.pan_number || undefined,
                payment_days: formData.credit_days
            };

            const response = await suppliersApi.create(supplierData);

            if (response.data) {
                toast.success(`Supplier "${formData.supplier_name}" created successfully!`);
                onSupplierCreated?.(response.data);
                onClose?.();
            }
        } catch (error: any) {
            console.error('Error creating supplier:', error);
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
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    const inputClass = "w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors";

    return (
        <div className="fixed inset-0 bg-gray-50 z-50 overflow-hidden flex flex-col">
            {/* Header - STANDARD: full-width, py-4, right-aligned save */}
            <header className="bg-white border-b border-gray-200 shrink-0 px-6 py-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            <ArrowLeft className="w-5 h-5 text-gray-600" />
                        </button>
                        <div>
                            <h1 className="text-xl font-semibold text-gray-900">Add New Supplier</h1>
                            <p className="text-sm text-gray-500">Create supplier profile</p>
                        </div>
                    </div>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save Supplier
                    </button>
                </div>
            </header>

            {/* Scrollable Content */}
            <main className="flex-1 overflow-y-auto py-6" ref={formRef}>
                <div className="max-w-6xl mx-auto px-6 space-y-8">
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
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="md:col-span-2">
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
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Supplier Type</label>
                                <select
                                    value={formData.supplier_type}
                                    onChange={(e) => setFormData({ ...formData, supplier_type: e.target.value })}
                                    className={inputClass}
                                >
                                    {SUPPLIER_TYPES.map(t => (
                                        <option key={t.value} value={t.value}>{t.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </section>

                    {/* Contact Information */}
                    <section className="bg-white rounded-xl border border-gray-200 p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <Phone className="w-5 h-5 text-blue-600" />
                            Contact Information
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center justify-between">
                                    <span>WhatsApp</span>
                                    <label className="text-xs font-normal flex items-center gap-1">
                                        <input
                                            type="checkbox"
                                            checked={useBusinessPhone}
                                            onChange={(e) => setUseBusinessPhone(e.target.checked)}
                                            className="rounded"
                                        />
                                        Same
                                    </label>
                                </label>
                                <input
                                    type="tel"
                                    value={formData.whatsapp_number}
                                    onChange={(e) => setFormData({ ...formData, whatsapp_number: e.target.value })}
                                    disabled={useBusinessPhone}
                                    className={`${inputClass} ${useBusinessPhone ? 'bg-gray-100' : ''}`}
                                    placeholder="WhatsApp"
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
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
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
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Contact Person Phone</label>
                                <input
                                    type="tel"
                                    value={formData.contact_person_phone}
                                    onChange={(e) => setFormData({ ...formData, contact_person_phone: e.target.value })}
                                    className={inputClass}
                                    placeholder="Direct line"
                                />
                            </div>
                        </div>
                    </section>

                    {/* Address - Using shared AddressInput component */}
                    <section className="bg-white rounded-xl border border-gray-200 p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <MapPin className="w-5 h-5 text-blue-600" />
                            Address
                        </h2>
                        <AddressInput
                            value={{
                                address_line1: formData.address_line1,
                                address_line2: formData.address_line2,
                                city: formData.city,
                                state: formData.state,
                                pincode: formData.pincode
                            }}
                            onChange={(address: AddressInputData) => setFormData({
                                ...formData,
                                address_line1: address.address_line1,
                                address_line2: address.address_line2 || '',
                                city: address.city,
                                state: address.state,
                                pincode: address.pincode
                            })}
                            inputClassName={inputClass}
                            showLandmark={true}
                            labels={{
                                address_line1: 'Building / Street Address',
                                address_line2: 'Area / Additional'
                            }}
                        />
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
                                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Terms</label>
                                <select
                                    value={formData.payment_terms}
                                    onChange={(e) => handlePaymentTermsChange(e.target.value)}
                                    className={inputClass}
                                >
                                    {PAYMENT_TERMS.map(t => (
                                        <option key={t.value} value={t.value}>{t.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <p className="mt-3 text-xs text-gray-500">
                            Bank details are added through the reviewed banking workflow.
                        </p>
                    </section>
                </div>
            </main>

            {/* Sticky Footer - STANDARD: full-width, py-4, right-aligned */}
            <footer className="bg-white border-t border-gray-200 shrink-0 px-6 py-4">
                <div className="flex items-center justify-end gap-3">
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="px-6 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
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
