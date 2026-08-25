/**
 * CustomerFlow Component
 * 
 * Full-page immersive customer creation experience.
 * Streamlined layout with all essential B2B pharma fields.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    User, Phone, Mail, MapPin, Building, FileText, Shield,
    CreditCard, MessageCircle, AlertCircle,
    ArrowLeft, Loader2, Save, Users
} from 'lucide-react';
import { customersApi } from '../../../services/api';
import { useFeatureFlags } from '../../../hooks/useFeatureFlags';
import useEscapeKey from '../../../hooks/useEscapeKey';
import { useEnterAsTab } from '../../../hooks/useEnterAsTab';
import { toast } from 'react-toastify';
import GSTJurisdictionSelect from '../../global/ui/forms/GSTJurisdictionSelect';

// ==================== TYPES ====================

interface CustomerFlowProps {
    open?: boolean;
    onClose?: () => void;
    onCustomerCreated?: (customer: any) => void;
}

interface CustomerFormData {
    customer_name: string;
    customer_code: string;
    primary_phone: string;
    primary_email: string;
    whatsapp_number: string;
    secondary_phone: string;
    customer_type: 'individual' | 'organization';
    // Contact Person
    contact_person_name: string;
    contact_person_phone: string;
    // Compliance
    gst_number: string;
    pan_number: string;
    // Credit
    credit_limit: string;
    credit_days: number | '';
    // Address
    address: {
        address_line1: string;
        address_line2: string;
        city: string;
        state_code: string;
        pincode: string;
        country: string;
    };
}

// ==================== COMPONENT ====================

const CustomerFlow: React.FC<CustomerFlowProps> = ({
    open = true,
    onClose,
    onCustomerCreated
}) => {
    const { customerMode, isB2BOnly, isB2COnly, features } = useFeatureFlags();

    const formRef = useRef<HTMLDivElement>(null);
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState<string[]>([]);

    const getInitialCustomerType = (): CustomerFormData['customer_type'] => {
        if (isB2COnly) return 'individual';
        return 'organization';
    };

    const [isBusinessCustomer, setIsBusinessCustomer] = useState(!isB2COnly);
    const [formData, setFormData] = useState<CustomerFormData>({
        customer_name: '',
        customer_code: '',
        primary_phone: '',
        primary_email: '',
        whatsapp_number: '',
        secondary_phone: '',
        customer_type: getInitialCustomerType(),
        // Contact Person
        contact_person_name: '',
        contact_person_phone: '',
        // Compliance
        gst_number: '',
        pan_number: '',
        // Credit
        credit_limit: '',
        credit_days: '',
        // Address
        address: {
            address_line1: '',
            address_line2: '',
            city: '',
            state_code: '',
            pincode: '',
            country: 'India'
        }
    });

    useEffect(() => {
        if (isB2BOnly) {
            setIsBusinessCustomer(true);
            setFormData(prev => ({
                ...prev,
                customer_type: 'organization'
            }));
        } else if (isB2COnly) {
            setIsBusinessCustomer(false);
            setFormData(prev => ({ ...prev, customer_type: 'individual' }));
        }
    }, [customerMode, isB2BOnly, isB2COnly, features.default_customer_type]);

    useEnterAsTab({
        containerRef: formRef,
        enabled: true,
        excludeSelectors: ['textarea', 'button[type="submit"]', '[data-no-enter-tab]']
    });

    useEscapeKey(
        useCallback(() => {
            if (onClose) onClose();
        }, [onClose]),
        true,
        'CustomerFlow-Main'
    );

    const updateField = (field: keyof CustomerFormData, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const updateAddress = (field: keyof CustomerFormData['address'], value: string) => {
        setFormData(prev => ({
            ...prev,
            address: { ...prev.address, [field]: value }
        }));
    };

    const validateForm = (): boolean => {
        const newErrors: string[] = [];

        if (!formData.customer_name.trim()) newErrors.push('Customer name is required');
        if (!formData.customer_code.trim()) newErrors.push('Customer code is required');
        if (!formData.primary_phone.trim()) {
            newErrors.push('Phone number is required');
        } else if (!/^\d{10}$/.test(formData.primary_phone.replace(/\D/g, ''))) {
            newErrors.push('Please enter a valid 10-digit phone number');
        }
        if (!formData.address.address_line1.trim()) newErrors.push('Address is required');
        if (!formData.address.city.trim()) newErrors.push('City is required');
        if (!/^\d{2}$/.test(formData.address.state_code)) {
            newErrors.push('GST state code must contain exactly 2 digits');
        }
        if (!formData.address.pincode.trim()) {
            newErrors.push('Pincode is required');
        } else if (!/^\d{6}$/.test(formData.address.pincode)) {
            newErrors.push('Please enter a valid 6-digit pincode');
        }

        if (isBusinessCustomer) {
            if (features.require_gst_for_b2b && !formData.gst_number.trim()) {
                newErrors.push('GST Number is required');
            }
            if (formData.gst_number && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(formData.gst_number)) {
                newErrors.push('Invalid GST number format');
            }
            if (formData.gst_number && /^\d{2}$/.test(formData.address.state_code)
                && formData.gst_number.slice(0, 2) !== formData.address.state_code) {
                newErrors.push('GSTIN state code must match the address GST state code');
            }
        }
        if (formData.credit_limit === '') newErrors.push('Credit limit is required; enter 0 for no credit');
        if (formData.credit_days === '') newErrors.push('Credit days are required; enter 0 for immediate payment');

        setErrors(newErrors);
        return newErrors.length === 0;
    };

    const handleSave = async () => {
        if (!validateForm()) {
            toast.error('Please fix the errors');
            return;
        }

        setSaving(true);
        setErrors([]);

        try {
            const customerData = {
                customer_name: formData.customer_name,
                customer_code: formData.customer_code.trim(),
                primary_phone: formData.primary_phone,
                whatsapp_number: formData.whatsapp_number || null,
                secondary_phone: formData.secondary_phone || null,
                primary_email: formData.primary_email || null,
                customer_type: formData.customer_type,
                // Contact Person
                contact_person_name: formData.contact_person_name || null,
                contact_person_phone: formData.contact_person_phone || null,
                // Compliance
                gst_number: formData.gst_number || null,
                pan_number: formData.pan_number || null,
                // Credit
                credit_limit: formData.credit_limit,
                credit_days: formData.credit_days,
                // Address
                address_line1: formData.address.address_line1,
                address_line2: formData.address.address_line2 || '',
                city: formData.address.city,
                state_code: formData.address.state_code,
                pincode: formData.address.pincode,
            };

            const response = await customersApi.create(customerData);

            if (response?.data) {
                toast.success('Customer created!');
                if (onCustomerCreated) onCustomerCreated(response.data);
                if (onClose) onClose();
            }
        } catch (error: any) {
            console.error('Error creating customer:', error);
            if (error.response?.data?.detail) {
                const detail = error.response.data.detail;
                if (Array.isArray(detail)) {
                    setErrors(detail.map((err: any) => typeof err === 'string' ? err : err.msg || JSON.stringify(err)));
                } else {
                    setErrors([typeof detail === 'string' ? detail : JSON.stringify(detail)]);
                }
            } else {
                setErrors(['Failed to create customer']);
            }
            toast.error('Failed to create customer');
        } finally {
            setSaving(false);
        }
    };

    if (!open) return null;

    // Compact input classes - STANDARD: py-2.5 for all inputs
    const inputClass = "w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm";
    const inputNoIconClass = "w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm";
    const labelClass = "block text-xs font-medium text-gray-600 mb-1";

    return (
        <div ref={formRef} className="h-full bg-white flex flex-col">
            {/* Header - STANDARD: py-4 */}
            <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onClose}
                            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            <ArrowLeft className="w-5 h-5 text-gray-600" />
                        </button>
                        <h1 className="text-xl font-semibold text-gray-900">New Customer</h1>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={onClose}
                            disabled={saving}
                            className="px-3 py-1.5 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1.5 disabled:opacity-50"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            {saving ? 'Saving...' : 'Save Customer'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
                <div className="max-w-6xl mx-auto">

                    {/* Error Messages */}
                    {errors.length > 0 && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                            <div className="flex gap-2">
                                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                                <div className="text-sm text-red-600">
                                    {errors.map((error, i) => <div key={i}>{error}</div>)}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* B2B/B2C Toggle - Only in hybrid mode */}
                    {customerMode === 'hybrid' && (
                        <div className="mb-4 flex justify-center">
                            <div className="inline-flex bg-gray-100 rounded-lg p-0.5">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsBusinessCustomer(true);
                                        updateField('customer_type', 'organization');
                                    }}
                                    className={`px-4 py-1.5 text-sm rounded-md transition-all ${isBusinessCustomer ? 'bg-white shadow text-blue-600 font-medium' : 'text-gray-600'
                                        }`}
                                >
                                    <Building className="inline w-4 h-4 mr-1" />
                                    Business
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsBusinessCustomer(false);
                                        updateField('customer_type', 'individual');
                                    }}
                                    className={`px-4 py-1.5 text-sm rounded-md transition-all ${!isBusinessCustomer ? 'bg-white shadow text-green-600 font-medium' : 'text-gray-600'
                                        }`}
                                >
                                    <User className="inline w-4 h-4 mr-1" />
                                    Individual
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Single Column Layout */}
                    <div className="space-y-4">

                        {/* Basic Information */}
                        <div className="bg-gray-50 rounded-lg p-4">
                            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5 mb-3">
                                <User className="w-4 h-4 text-blue-600" />
                                Basic Information
                            </h3>

                            <div className="grid grid-cols-3 gap-3">
                                <div className="col-span-3 sm:col-span-2">
                                    <label className={labelClass}>Customer Name *</label>
                                    <div className="relative">
                                        <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                        <input
                                            type="text"
                                            value={formData.customer_name}
                                            onChange={(e) => updateField('customer_name', e.target.value)}
                                            className={inputClass}
                                            placeholder={isBusinessCustomer ? "Company name" : "Full name"}
                                            autoFocus
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className={labelClass}>Customer Code *</label>
                                    <input
                                        required
                                        maxLength={50}
                                        value={formData.customer_code}
                                        onChange={(e) => updateField('customer_code', e.target.value)}
                                        className={inputNoIconClass}
                                        placeholder="e.g. CUST-001"
                                    />
                                    <p className="mt-1 text-xs text-gray-500">Your unique internal customer account code; it will not be generated.</p>
                                </div>

                                <div>
                                    <label className={labelClass}>Account Type</label>
                                    <input value={isBusinessCustomer ? 'Organization' : 'Individual'} readOnly className={`${inputNoIconClass} bg-gray-100`} />
                                </div>

                                <div>
                                    <label className={labelClass}>Phone *</label>
                                    <div className="relative">
                                        <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                        <input
                                            type="text"
                                            value={formData.primary_phone}
                                            onChange={(e) => updateField('primary_phone', e.target.value)}
                                            className={inputClass}
                                            placeholder="10-digit"
                                            maxLength={10}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className={labelClass}>WhatsApp</label>
                                    <div className="relative">
                                        <MessageCircle className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500" />
                                        <input
                                            type="text"
                                            value={formData.whatsapp_number}
                                            onChange={(e) => updateField('whatsapp_number', e.target.value)}
                                            className={inputClass}
                                            placeholder="10-digit"
                                            maxLength={10}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className={labelClass}>Email</label>
                                    <div className="relative">
                                        <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                        <input
                                            type="email"
                                            value={formData.primary_email}
                                            onChange={(e) => updateField('primary_email', e.target.value)}
                                            className={inputClass}
                                            placeholder="email@company.com"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Contact Person - B2B Only */}
                        {isBusinessCustomer && (
                            <div className="bg-gray-50 rounded-lg p-4">
                                <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5 mb-3">
                                    <Users className="w-4 h-4 text-purple-600" />
                                    Contact Person
                                </h3>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className={labelClass}>Name</label>
                                        <div className="relative">
                                            <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                            <input
                                                type="text"
                                                value={formData.contact_person_name}
                                                onChange={(e) => updateField('contact_person_name', e.target.value)}
                                                className={inputClass}
                                                placeholder="Person to contact"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className={labelClass}>Phone</label>
                                        <div className="relative">
                                            <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                            <input
                                                type="text"
                                                value={formData.contact_person_phone}
                                                onChange={(e) => updateField('contact_person_phone', e.target.value)}
                                                className={inputClass}
                                                placeholder="10-digit"
                                                maxLength={10}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Address */}
                        <div className="bg-gray-50 rounded-lg p-4">
                            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5 mb-3">
                                <MapPin className="w-4 h-4 text-blue-600" />
                                Address
                            </h3>

                            <div className="space-y-3">
                                {/* Row 1: Address Line 1 */}
                                <div>
                                    <label className={labelClass}>Address Line 1 *</label>
                                    <input
                                        type="text"
                                        value={formData.address.address_line1}
                                        onChange={(e) => updateAddress('address_line1', e.target.value)}
                                        className={inputNoIconClass}
                                        placeholder="Building, street address"
                                    />
                                </div>

                                {/* Row 2: Address Line 2 + Landmark */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className={labelClass}>Address Line 2</label>
                                        <input
                                            type="text"
                                            value={formData.address.address_line2}
                                            onChange={(e) => updateAddress('address_line2', e.target.value)}
                                            className={inputNoIconClass}
                                            placeholder="Additional address"
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClass}>Landmark</label>
                                        <input
                                            type="text"
                                            className={inputNoIconClass}
                                            placeholder="Near / Opposite to"
                                        />
                                    </div>
                                </div>

                                {/* Row 3: City, GST state code, Pincode */}
                                <div className="grid grid-cols-3 gap-3">
                                    <div>
                                        <label className={labelClass}>City *</label>
                                        <input
                                            type="text"
                                            value={formData.address.city}
                                            onChange={(e) => updateAddress('city', e.target.value)}
                                            className={inputNoIconClass}
                                            placeholder="City"
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="customer-state-code" className={labelClass}>GST state code (2 digits) *</label>
                                        <GSTJurisdictionSelect
                                            id="customer-state-code"
                                            value={formData.address.state_code}
                                            onChange={(stateCode) => updateAddress('state_code', stateCode)}
                                            className={inputNoIconClass}
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClass}>Pincode *</label>
                                        <input
                                            type="text"
                                            value={formData.address.pincode}
                                            onChange={(e) => updateAddress('pincode', e.target.value)}
                                            className={inputNoIconClass}
                                            placeholder="6-digit"
                                            maxLength={6}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Compliance - B2B Only */}
                        {isBusinessCustomer && (
                            <div className="bg-gray-50 rounded-lg p-4">
                                <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5 mb-3">
                                    <Shield className="w-4 h-4 text-red-600" />
                                    Compliance & Licenses
                                </h3>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                        <label className={labelClass}>
                                            GST Number {features.require_gst_for_b2b && '*'}
                                        </label>
                                        <div className="relative">
                                            <FileText className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                            <input
                                                type="text"
                                                value={formData.gst_number}
                                                onChange={(e) => updateField('gst_number', e.target.value.toUpperCase())}
                                                className={inputClass}
                                                placeholder="27AAPFU0939F1ZV"
                                                maxLength={15}
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className={labelClass}>PAN</label>
                                        <div className="relative">
                                            <FileText className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                            <input
                                                type="text"
                                                value={formData.pan_number}
                                                onChange={(e) => updateField('pan_number', e.target.value.toUpperCase())}
                                                className={inputClass}
                                                placeholder="AAPFU0939F"
                                                maxLength={10}
                                            />
                                        </div>
                                    </div>
                                </div>
                                <p className="mt-3 text-xs text-gray-500">
                                    Drug and FSSAI licenses are verified after the core customer profile is created.
                                </p>
                            </div>
                        )}

                        {/* Credit & Payment Terms - B2B Only */}
                        {isBusinessCustomer && (
                            <div className="bg-gray-50 rounded-lg p-4">
                                <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5 mb-3">
                                    <CreditCard className="w-4 h-4 text-blue-600" />
                                    Credit & Payment Terms
                                </h3>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                        <label className={labelClass}>Credit Limit (₹)</label>
                                        <input
                                            type="number"
                                            inputMode="decimal"
                                            step="0.01"
                                            value={formData.credit_limit}
                                            onChange={(e) => updateField('credit_limit', e.target.value)}
                                            className={inputNoIconClass}
                                            placeholder="5000"
                                            min={0}
                                        />
                                    </div>

                                    <div>
                                        <label className={labelClass}>Credit Days</label>
                                        <input
                                            type="number"
                                            value={formData.credit_days}
                                            onChange={(e) => updateField('credit_days', e.target.value === '' ? '' : Number(e.target.value))}
                                            className={inputNoIconClass}
                                            min={0}
                                            max={365}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Sticky Footer - STANDARD: py-4, full-width, right-aligned */}
            <div className="flex-shrink-0 bg-white border-t border-gray-200 px-6 py-4">
                <div className="flex items-center justify-end gap-3">
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50 transition-colors"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {saving ? 'Saving...' : 'Save Customer'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CustomerFlow;
