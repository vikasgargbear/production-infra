/**
 * CustomerFlow Component
 * 
 * Full-page immersive customer creation experience.
 * Streamlined layout with all essential B2B pharma fields.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    User, Phone, Mail, MapPin, Building, FileText, Shield,
    Calendar, CreditCard, MessageCircle, AlertCircle,
    ArrowLeft, Loader2, Save, Users, Percent, Banknote
} from 'lucide-react';
import { customersApi } from '../../../services/api';
import { useFeatureFlags } from '../../../hooks/useFeatureFlags';
import useEscapeKey from '../../../hooks/useEscapeKey';
import { useEnterAsTab } from '../../../hooks/useEnterAsTab';
import { toast } from 'react-toastify';

// ==================== TYPES ====================

interface CustomerFlowProps {
    open?: boolean;
    onClose?: () => void;
    onCustomerCreated?: (customer: any) => void;
}

interface CustomerFormData {
    customer_name: string;
    primary_phone: string;
    primary_email: string;
    whatsapp_number: string;
    secondary_phone: string;
    customer_type: string;
    // Contact Person
    contact_person_name: string;
    contact_person_phone: string;
    // Compliance
    gst_number: string;
    pan_number: string;
    drug_license_number: string;
    drug_license_validity: string;
    fssai_number: string;
    // Credit
    credit_limit: number;
    credit_days: number;
    credit_rating: string;
    payment_terms: string;
    discount_percent: number;
    // Address
    address: {
        address_line1: string;
        address_line2: string;
        city: string;
        state: string;
        pincode: string;
        country: string;
    };
    // Notes
    internal_notes: string;
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

const BUSINESS_TYPES = [
    { value: 'pharmacy', label: 'Retail Pharmacy' },
    { value: 'wholesale', label: 'Wholesale' },
    { value: 'hospital', label: 'Hospital' },
    { value: 'clinic', label: 'Clinic' },
    { value: 'institution', label: 'Institution' },
    { value: 'doctor', label: 'Doctor' },
    { value: 'distributor', label: 'Distributor' }
];

const PAYMENT_TERMS = [
    { value: 'CASH', label: 'Cash' },
    { value: 'NET15', label: 'Net 15 Days' },
    { value: 'NET30', label: 'Net 30 Days' },
    { value: 'NET45', label: 'Net 45 Days' },
    { value: 'NET60', label: 'Net 60 Days' }
];

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

    const getInitialCustomerType = () => {
        if (isB2COnly) return 'individual';
        return features.default_customer_type || 'pharmacy';
    };

    const [isBusinessCustomer, setIsBusinessCustomer] = useState(!isB2COnly);
    const [formData, setFormData] = useState<CustomerFormData>({
        customer_name: '',
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
        drug_license_number: '',
        drug_license_validity: '',
        fssai_number: '',
        // Credit
        credit_limit: 5000,
        credit_days: 0,
        credit_rating: 'B',
        payment_terms: 'CASH',
        discount_percent: 0,
        // Address
        address: {
            address_line1: '',
            address_line2: '',
            city: '',
            state: '',
            pincode: '',
            country: 'India'
        },
        // Notes
        internal_notes: ''
    });

    useEffect(() => {
        if (isB2BOnly) {
            setIsBusinessCustomer(true);
            setFormData(prev => ({
                ...prev,
                customer_type: features.default_customer_type || 'pharmacy'
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
        if (!formData.primary_phone.trim()) {
            newErrors.push('Phone number is required');
        } else if (!/^\d{10}$/.test(formData.primary_phone.replace(/\D/g, ''))) {
            newErrors.push('Please enter a valid 10-digit phone number');
        }
        if (!formData.address.address_line1.trim()) newErrors.push('Address is required');
        if (!formData.address.city.trim()) newErrors.push('City is required');
        if (!formData.address.state) newErrors.push('State is required');
        if (!formData.address.pincode.trim()) {
            newErrors.push('Pincode is required');
        } else if (!/^\d{6}$/.test(formData.address.pincode)) {
            newErrors.push('Please enter a valid 6-digit pincode');
        }

        if (isBusinessCustomer) {
            if (features.require_drug_license && !formData.drug_license_number.trim()) {
                newErrors.push('Drug License Number is required');
            }
            if (features.require_gst_for_b2b && !formData.gst_number.trim()) {
                newErrors.push('GST Number is required');
            }
            if (formData.gst_number && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(formData.gst_number)) {
                newErrors.push('Invalid GST number format');
            }
        }

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
                drug_license_number: formData.drug_license_number || null,
                drug_license_validity: formData.drug_license_validity || null,
                fssai_number: formData.fssai_number || null,
                // Credit
                credit_limit: parseFloat(String(formData.credit_limit || 0)),
                credit_days: parseInt(String(formData.credit_days || 0)),
                credit_rating: formData.credit_rating,
                payment_terms: formData.payment_terms,
                discount_percent: parseFloat(String(formData.discount_percent || 0)),
                // Notes
                internal_notes: formData.internal_notes || null,
                // Address
                org_id: localStorage.getItem('pharma_org_id') || sessionStorage.getItem('pharma_org_id'),
                address_line1: formData.address.address_line1,
                address_line2: formData.address.address_line2 || '',
                city: formData.address.city,
                state: formData.address.state,
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

    // Compact input classes
    const inputClass = "w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm";
    const inputNoIconClass = "w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm";
    const labelClass = "block text-xs font-medium text-gray-600 mb-1";

    return (
        <div ref={formRef} className="h-full bg-white flex flex-col">
            {/* Header */}
            <div className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-3">
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
                <div className="max-w-4xl mx-auto">

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
                                        updateField('customer_type', features.default_customer_type || 'pharmacy');
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

                                {isBusinessCustomer && (
                                    <div>
                                        <label className={labelClass}>Business Type *</label>
                                        <select
                                            value={formData.customer_type}
                                            onChange={(e) => updateField('customer_type', e.target.value)}
                                            className={inputNoIconClass}
                                        >
                                            {BUSINESS_TYPES.map(type => (
                                                <option key={type.value} value={type.value}>{type.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

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

                                {/* Row 3: City, State, Pincode */}
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
                                        <label className={labelClass}>State *</label>
                                        <select
                                            value={formData.address.state}
                                            onChange={(e) => updateAddress('state', e.target.value)}
                                            className={inputNoIconClass}
                                        >
                                            <option value="">Select</option>
                                            {INDIAN_STATES.map(state => (
                                                <option key={state} value={state}>{state}</option>
                                            ))}
                                        </select>
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

                                <div className="grid grid-cols-3 gap-3">
                                    <div>
                                        <label className={labelClass}>
                                            Drug License {features.require_drug_license && '*'}
                                        </label>
                                        <div className="relative">
                                            <Shield className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                            <input
                                                type="text"
                                                value={formData.drug_license_number}
                                                onChange={(e) => updateField('drug_license_number', e.target.value)}
                                                className={inputClass}
                                                placeholder="20B-MH-12345"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className={labelClass}>DL Validity</label>
                                        <div className="relative">
                                            <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                            <input
                                                type="date"
                                                value={formData.drug_license_validity}
                                                onChange={(e) => updateField('drug_license_validity', e.target.value)}
                                                className={inputClass}
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className={labelClass}>FSSAI License</label>
                                        <div className="relative">
                                            <FileText className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                            <input
                                                type="text"
                                                value={formData.fssai_number}
                                                onChange={(e) => updateField('fssai_number', e.target.value)}
                                                className={inputClass}
                                                placeholder="FSSAI number"
                                            />
                                        </div>
                                    </div>

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
                            </div>
                        )}

                        {/* Credit & Payment Terms - B2B Only */}
                        {isBusinessCustomer && (
                            <div className="bg-gray-50 rounded-lg p-4">
                                <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5 mb-3">
                                    <CreditCard className="w-4 h-4 text-blue-600" />
                                    Credit & Payment Terms
                                </h3>

                                <div className="grid grid-cols-4 gap-3">
                                    <div>
                                        <label className={labelClass}>Credit Rating</label>
                                        <select
                                            value={formData.credit_rating}
                                            onChange={(e) => updateField('credit_rating', e.target.value)}
                                            className={inputNoIconClass}
                                        >
                                            <option value="A">A - Excellent</option>
                                            <option value="B">B - Good</option>
                                            <option value="C">C - Fair</option>
                                            <option value="D">D - Cash Only</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className={labelClass}>Credit Limit (₹)</label>
                                        <input
                                            type="number"
                                            value={formData.credit_limit}
                                            onChange={(e) => updateField('credit_limit', parseInt(e.target.value) || 0)}
                                            className={inputNoIconClass}
                                            placeholder="5000"
                                            min={0}
                                            disabled={formData.credit_rating === 'D'}
                                        />
                                    </div>

                                    <div>
                                        <label className={labelClass}>Payment Terms</label>
                                        <select
                                            value={formData.payment_terms}
                                            onChange={(e) => {
                                                updateField('payment_terms', e.target.value);
                                                // Auto-set credit days based on payment terms
                                                const days = { CASH: 0, NET15: 15, NET30: 30, NET45: 45, NET60: 60 };
                                                updateField('credit_days', days[e.target.value as keyof typeof days] || 0);
                                            }}
                                            className={inputNoIconClass}
                                            disabled={formData.credit_rating === 'D'}
                                        >
                                            {PAYMENT_TERMS.map(term => (
                                                <option key={term.value} value={term.value}>{term.label}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className={labelClass}>Default Discount %</label>
                                        <div className="relative">
                                            <Percent className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                            <input
                                                type="number"
                                                value={formData.discount_percent}
                                                onChange={(e) => updateField('discount_percent', parseFloat(e.target.value) || 0)}
                                                className={inputClass}
                                                placeholder="0"
                                                min={0}
                                                max={100}
                                                step={0.5}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Internal Notes */}
                        <div className="bg-gray-50 rounded-lg p-4">
                            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5 mb-3">
                                <FileText className="w-4 h-4 text-gray-600" />
                                Internal Notes
                            </h3>
                            <textarea
                                value={formData.internal_notes}
                                onChange={(e) => updateField('internal_notes', e.target.value)}
                                className={inputNoIconClass + " h-20 resize-none"}
                                placeholder="Notes for internal reference (not visible to customer)"
                                maxLength={1000}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Sticky Footer */}
            <div className="flex-shrink-0 bg-white border-t border-gray-200">
                <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-end gap-3">
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
