/**
 * CustomerFlow Component
 * 
 * Full-page immersive customer creation experience.
 * Streamlined layout with all essential B2B pharma fields.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    User, Phone, Mail, MapPin, Building, FileText, Shield,
    CreditCard, AlertCircle,
    ArrowLeft, Loader2, Save, Users
} from 'lucide-react';
import { customersApi } from '../../../services/api';
import { useFeatureFlags } from '../../../hooks/useFeatureFlags';
import useEscapeKey from '../../../hooks/useEscapeKey';
import { useEnterAsTab } from '../../../hooks/useEnterAsTab';
import { toast } from 'react-toastify';
import GSTJurisdictionSelect from '../../global/ui/forms/GSTJurisdictionSelect';
import { newMasterCreateIdempotencyKey } from '../../../services/api/modules/master/masterCreationContract';
import type { CanonicalCustomerCreateResponse } from '../../../services/api/modules/master/masterCreationContract';

// ==================== TYPES ====================

interface CustomerFlowProps {
    open?: boolean;
    onClose?: () => void;
    onCustomerCreated?: (customer: CanonicalCustomerCreateResponse) => void;
}

interface CustomerFormData {
    customer_name: string;
    primary_phone: string;
    primary_email: string;
    customer_type: 'individual' | 'organization';
    // Contact Person
    contact_person_name: string;
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
    };
}

type CustomerField =
    | 'customer_name'
    | 'primary_phone'
    | 'primary_email'
    | 'address_line1'
    | 'city'
    | 'state_code'
    | 'pincode'
    | 'gst_number'
    | 'pan_number'
    | 'credit_limit'
    | 'credit_days';

type CustomerFieldErrors = Partial<Record<CustomerField, string>>;

const CUSTOMER_FIELD_IDS: Record<CustomerField, string> = {
    customer_name: 'customer-name',
    primary_phone: 'customer-phone',
    primary_email: 'customer-email',
    address_line1: 'customer-address-line1',
    city: 'customer-city',
    state_code: 'customer-state-code',
    pincode: 'customer-pincode',
    gst_number: 'customer-gstin',
    pan_number: 'customer-pan',
    credit_limit: 'customer-credit-limit',
    credit_days: 'customer-credit-days',
};

const API_FIELD_NAMES: Record<string, CustomerField> = {
    customer_name: 'customer_name',
    primary_phone: 'primary_phone',
    primary_email: 'primary_email',
    address_line1: 'address_line1',
    city: 'city',
    state_code: 'state_code',
    pincode: 'pincode',
    gst_number: 'gst_number',
    pan_number: 'pan_number',
    credit_limit: 'credit_limit',
    credit_days: 'credit_days',
};

// ==================== COMPONENT ====================

const CustomerFlow: React.FC<CustomerFlowProps> = ({
    open = true,
    onClose,
    onCustomerCreated
}) => {
    const { customerMode, isB2BOnly, isB2COnly, features } = useFeatureFlags();

    const formRef = useRef<HTMLDivElement>(null);
    const submissionInFlightRef = useRef(false);
    const idempotencyKeyRef = useRef(newMasterCreateIdempotencyKey('customer'));
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState<string[]>([]);
    const [fieldErrors, setFieldErrors] = useState<CustomerFieldErrors>({});

    const getInitialCustomerType = (): CustomerFormData['customer_type'] => {
        if (isB2COnly) return 'individual';
        return 'organization';
    };

    const [isBusinessCustomer, setIsBusinessCustomer] = useState(!isB2COnly);
    const [formData, setFormData] = useState<CustomerFormData>({
        customer_name: '',
        primary_phone: '',
        primary_email: '',
        customer_type: getInitialCustomerType(),
        // Contact Person
        contact_person_name: '',
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
            pincode: ''
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
        if (field in CUSTOMER_FIELD_IDS) {
            setFieldErrors(prev => ({ ...prev, [field]: undefined }));
        }
    };

    const updateAddress = (field: keyof CustomerFormData['address'], value: string) => {
        setFormData(prev => ({
            ...prev,
            address: { ...prev.address, [field]: value }
        }));
        if (field in CUSTOMER_FIELD_IDS) {
            setFieldErrors(prev => ({ ...prev, [field]: undefined }));
        }
    };

    const focusFirstInvalidField = (invalidFields: CustomerFieldErrors) => {
        const firstField = (Object.keys(CUSTOMER_FIELD_IDS) as CustomerField[])
            .find(field => Boolean(invalidFields[field]));
        if (!firstField) return;
        window.setTimeout(() => {
            document.getElementById(CUSTOMER_FIELD_IDS[firstField])?.focus();
        }, 0);
    };

    const validateForm = (): boolean => {
        const newFieldErrors: CustomerFieldErrors = {};

        if (!formData.customer_name.trim()) newFieldErrors.customer_name = 'Customer name is required';
        if (!formData.primary_phone.trim()) {
            newFieldErrors.primary_phone = 'Phone number is required';
        } else if (!/^\d{10}$/.test(formData.primary_phone.replace(/\D/g, ''))) {
            newFieldErrors.primary_phone = 'Enter a valid 10-digit phone number';
        }
        if (formData.primary_email.trim()
            && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.primary_email.trim())) {
            newFieldErrors.primary_email = 'Enter a valid email address';
        }
        if (!formData.address.address_line1.trim()) newFieldErrors.address_line1 = 'Address is required';
        if (!formData.address.city.trim()) newFieldErrors.city = 'City is required';
        if (!/^\d{2}$/.test(formData.address.state_code)) {
            newFieldErrors.state_code = 'Select a GST state code';
        }
        if (!formData.address.pincode.trim()) {
            newFieldErrors.pincode = 'Pincode is required';
        } else if (!/^\d{6}$/.test(formData.address.pincode)) {
            newFieldErrors.pincode = 'Enter a valid 6-digit pincode';
        }

        if (isBusinessCustomer) {
            if (features.require_gst_for_b2b && !formData.gst_number.trim()) {
                newFieldErrors.gst_number = 'GST number is required';
            }
            if (formData.gst_number && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(formData.gst_number)) {
                newFieldErrors.gst_number = 'Enter a valid 15-character GSTIN';
            }
            if (formData.gst_number && /^\d{2}$/.test(formData.address.state_code)
                && formData.gst_number.slice(0, 2) !== formData.address.state_code) {
                newFieldErrors.gst_number = 'GSTIN state code must match the address state';
                newFieldErrors.state_code = 'Address state must match the GSTIN';
            }
            if (formData.pan_number && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(formData.pan_number)) {
                newFieldErrors.pan_number = 'Enter a valid 10-character PAN';
            }
        }
        if (formData.credit_limit === '') {
            newFieldErrors.credit_limit = 'Credit limit is required; enter 0 for no credit';
        } else if (!/^(?:0|[1-9]\d{0,17})(?:\.\d{1,2})?$/.test(formData.credit_limit)) {
            newFieldErrors.credit_limit = 'Enter a non-negative amount with at most 2 decimals';
        }
        if (formData.credit_days === '') {
            newFieldErrors.credit_days = 'Credit days are required; enter 0 for immediate payment';
        } else if (!Number.isInteger(formData.credit_days)
            || formData.credit_days < 0 || formData.credit_days > 365) {
            newFieldErrors.credit_days = 'Enter a whole number from 0 to 365';
        }

        setFieldErrors(newFieldErrors);
        const newErrors = Object.values(newFieldErrors).filter((error): error is string => Boolean(error));
        setErrors(newErrors);
        if (newErrors.length > 0) focusFirstInvalidField(newFieldErrors);
        return newErrors.length === 0;
    };

    const handleSave = async () => {
        if (!validateForm()) {
            toast.error('Please fix the errors');
            return;
        }
        if (submissionInFlightRef.current) return;

        submissionInFlightRef.current = true;
        setSaving(true);
        setErrors([]);
        setFieldErrors({});

        try {
            const customerData = {
                customer_name: formData.customer_name,
                primary_phone: formData.primary_phone,
                primary_email: formData.primary_email || null,
                customer_type: formData.customer_type,
                // Contact Person
                contact_person_name: formData.contact_person_name || null,
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

            const response = await customersApi.create(customerData, idempotencyKeyRef.current);

            if (response?.data) {
                toast.success(`Customer ${response.data.customer_code} created successfully.`);
                idempotencyKeyRef.current = newMasterCreateIdempotencyKey('customer');
                if (onCustomerCreated) onCustomerCreated(response.data);
                if (onClose) onClose();
            }
        } catch (error: any) {
            if (error.response?.data?.detail) {
                const detail = error.response.data.detail;
                if (Array.isArray(detail)) {
                    const apiFieldErrors: CustomerFieldErrors = {};
                    const messages = detail.map((err: any) => {
                        const fieldName = Array.isArray(err?.loc) ? err.loc[err.loc.length - 1] : undefined;
                        const field = typeof fieldName === 'string' ? API_FIELD_NAMES[fieldName] : undefined;
                        const message = typeof err === 'string' ? err : err.msg || JSON.stringify(err);
                        if (field) apiFieldErrors[field] = message;
                        return message;
                    });
                    setErrors(messages);
                    setFieldErrors(apiFieldErrors);
                    focusFirstInvalidField(apiFieldErrors);
                } else {
                    setErrors([typeof detail === 'string' ? detail : JSON.stringify(detail)]);
                }
            } else {
                setErrors(['Failed to create customer']);
            }
            toast.error('Failed to create customer');
        } finally {
            submissionInFlightRef.current = false;
            setSaving(false);
        }
    };

    if (!open) return null;

    // Compact input classes - STANDARD: py-2.5 for all inputs
    const inputClass = "min-h-12 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-base outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100";
    const inputNoIconClass = "min-h-12 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100";
    const invalidClass = "border-red-500 bg-red-50 focus:ring-red-500";
    const fieldClass = (field: CustomerField, baseClass: string) => `${baseClass} ${fieldErrors[field] ? invalidClass : ''}`;
    const fieldError = (field: CustomerField) => fieldErrors[field] ? (
        <p id={`${CUSTOMER_FIELD_IDS[field]}-error`} className="mt-1 text-xs text-red-600" role="alert">
            {fieldErrors[field]}
        </p>
    ) : null;
    const fieldA11y = (field: CustomerField) => ({
        id: CUSTOMER_FIELD_IDS[field],
        'aria-invalid': Boolean(fieldErrors[field]) || undefined,
        'aria-describedby': fieldErrors[field] ? `${CUSTOMER_FIELD_IDS[field]}-error` : undefined,
    });
    const labelClass = "mb-1 block text-sm font-medium text-gray-800";

    return (
        <div ref={formRef} className="fixed inset-0 z-50 flex min-w-0 flex-col bg-gray-50">
            {/* Header - STANDARD: py-4 */}
            <div className="flex-shrink-0 border-b border-gray-200 bg-white px-3 py-3 sm:px-6 sm:py-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button aria-label="Close customer form"
                            onClick={onClose}
                            className="grid min-h-11 min-w-11 place-items-center rounded-lg hover:bg-gray-100"
                        >
                            <ArrowLeft className="w-5 h-5 text-gray-600" />
                        </button>
                        <div><h1 className="text-lg font-semibold text-gray-950 sm:text-xl">Create customer</h1><p className="text-sm text-gray-500">Identity, billing address, tax registration and credit terms</p></div>
                    </div>

                    <span className="hidden rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-800 sm:inline">Canonical customer account</span>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-3 py-5 pb-28 sm:px-6">
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
                                    className={`min-h-11 px-4 py-2 text-sm rounded-md transition-all ${isBusinessCustomer ? 'bg-white shadow text-blue-600 font-medium' : 'text-gray-600'
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
                                    className={`min-h-11 px-4 py-2 text-sm rounded-md transition-all ${!isBusinessCustomer ? 'bg-white shadow text-green-600 font-medium' : 'text-gray-600'
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
                        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
                            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5 mb-3">
                                <User className="w-4 h-4 text-blue-600" />
                                Basic Information
                            </h3>
                            <p className="mb-3 text-xs text-gray-500">
                                Internal customer code is generated automatically after saving.
                            </p>

                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                                <div className="sm:col-span-2">
                                    <label htmlFor="customer-name" className={labelClass}>Customer Name *</label>
                                    <div className="relative">
                                        <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                        <input
                                            {...fieldA11y('customer_name')}
                                            type="text"
                                            value={formData.customer_name}
                                            onChange={(e) => updateField('customer_name', e.target.value)}
                                            className={fieldClass('customer_name', inputClass)}
                                            placeholder={isBusinessCustomer ? "Company name" : "Full name"}
                                            autoFocus
                                        />
                                    </div>
                                    {fieldError('customer_name')}
                                </div>

                                <div>
                                    <label className={labelClass}>Account Type</label>
                                    <input value={isBusinessCustomer ? 'Organization' : 'Individual'} readOnly className={`${inputNoIconClass} bg-gray-100`} />
                                </div>

                                <div>
                                    <label htmlFor="customer-phone" className={labelClass}>Phone *</label>
                                    <div className="relative">
                                        <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                        <input
                                            {...fieldA11y('primary_phone')}
                                            type="tel"
                                            inputMode="tel"
                                            autoComplete="tel"
                                            value={formData.primary_phone}
                                            onChange={(e) => updateField('primary_phone', e.target.value)}
                                            className={fieldClass('primary_phone', inputClass)}
                                            placeholder="10-digit"
                                            maxLength={10}
                                        />
                                    </div>
                                    {fieldError('primary_phone')}
                                </div>

                                <div>
                                    <label htmlFor="customer-email" className={labelClass}>Email</label>
                                    <div className="relative">
                                        <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                        <input
                                            {...fieldA11y('primary_email')}
                                            type="email"
                                            autoComplete="email"
                                            value={formData.primary_email}
                                            onChange={(e) => updateField('primary_email', e.target.value)}
                                            className={fieldClass('primary_email', inputClass)}
                                            placeholder="email@company.com"
                                        />
                                    </div>
                                    {fieldError('primary_email')}
                                </div>
                            </div>
                        </div>

                        {/* Contact Person - B2B Only */}
                        {isBusinessCustomer && (
                        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
                                <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5 mb-3">
                                    <Users className="w-4 h-4 text-purple-600" />
                                    Contact Person
                                </h3>

                                <div className="grid grid-cols-1 gap-3">
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

                                </div>
                            </div>
                        )}

                        {/* Address */}
                        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
                            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5 mb-3">
                                <MapPin className="w-4 h-4 text-blue-600" />
                                Address
                            </h3>

                            <div className="space-y-3">
                                {/* Row 1: Address Line 1 */}
                                <div>
                                    <label htmlFor="customer-address-line1" className={labelClass}>Address Line 1 *</label>
                                    <input
                                        {...fieldA11y('address_line1')}
                                        type="text"
                                        value={formData.address.address_line1}
                                        autoComplete="street-address"
                                        onChange={(e) => updateAddress('address_line1', e.target.value)}
                                        className={fieldClass('address_line1', inputNoIconClass)}
                                        placeholder="Building, street address"
                                    />
                                    {fieldError('address_line1')}
                                </div>

                                {/* Row 2: Address Line 2 */}
                                <div className="grid grid-cols-1 gap-3">
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
                                </div>

                                {/* Row 3: City, GST state code, Pincode */}
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                                    <div>
                                        <label htmlFor="customer-city" className={labelClass}>City *</label>
                                        <input
                                            {...fieldA11y('city')}
                                            type="text"
                                        value={formData.address.city}
                                        autoComplete="address-level2"
                                            onChange={(e) => updateAddress('city', e.target.value)}
                                            className={fieldClass('city', inputNoIconClass)}
                                            placeholder="City"
                                        />
                                        {fieldError('city')}
                                    </div>
                                    <div>
                                        <label htmlFor="customer-state-code" className={labelClass}>GST state code (2 digits) *</label>
                                        <GSTJurisdictionSelect
                                            {...fieldA11y('state_code')}
                                            value={formData.address.state_code}
                                            onChange={(stateCode) => updateAddress('state_code', stateCode)}
                                            className={fieldClass('state_code', inputNoIconClass)}
                                            required
                                        />
                                        {fieldError('state_code')}
                                    </div>
                                    <div>
                                        <label htmlFor="customer-pincode" className={labelClass}>Pincode *</label>
                                        <input
                                            {...fieldA11y('pincode')}
                                            type="text"
                                            value={formData.address.pincode}
                                            onChange={(e) => updateAddress('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))}
                                            className={fieldClass('pincode', inputNoIconClass)}
                                            placeholder="6-digit"
                                            maxLength={6}
                                            inputMode="numeric"
                                            autoComplete="postal-code"
                                        />
                                        {fieldError('pincode')}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Compliance - B2B Only */}
                        {isBusinessCustomer && (
                        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
                                <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5 mb-3">
                                    <Shield className="w-4 h-4 text-red-600" />
                                    Compliance & Licenses
                                </h3>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                        <label htmlFor="customer-gstin" className={labelClass}>
                                            GST Number {features.require_gst_for_b2b && '*'}
                                        </label>
                                        <div className="relative">
                                            <FileText className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                            <input
                                                {...fieldA11y('gst_number')}
                                                type="text"
                                                value={formData.gst_number}
                                                onChange={(e) => updateField('gst_number', e.target.value.toUpperCase())}
                                                className={fieldClass('gst_number', inputClass)}
                                                placeholder="27AAPFU0939F1ZV"
                                                maxLength={15}
                                            />
                                        </div>
                                        {fieldError('gst_number')}
                                    </div>

                                    <div>
                                        <label htmlFor="customer-pan" className={labelClass}>PAN</label>
                                        <div className="relative">
                                            <FileText className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                            <input
                                                {...fieldA11y('pan_number')}
                                                type="text"
                                                value={formData.pan_number}
                                                onChange={(e) => updateField('pan_number', e.target.value.toUpperCase())}
                                                className={fieldClass('pan_number', inputClass)}
                                                placeholder="AAPFU0939F"
                                                maxLength={10}
                                            />
                                        </div>
                                        {fieldError('pan_number')}
                                    </div>
                                </div>
                                <p className="mt-3 text-xs text-gray-500">
                                    Drug and FSSAI licenses are verified after the core customer profile is created.
                                </p>
                            </div>
                        )}

                        {/* Credit terms are explicit for every canonical customer account. */}
                        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
                                <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5 mb-3">
                                    <CreditCard className="w-4 h-4 text-blue-600" />
                                    Credit & Payment Terms
                                </h3>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                        <label htmlFor="customer-credit-limit" className={labelClass}>Credit Limit (₹) *</label>
                                        <input
                                            {...fieldA11y('credit_limit')}
                                            type="number"
                                            inputMode="decimal"
                                            step="0.01"
                                            value={formData.credit_limit}
                                            onChange={(e) => updateField('credit_limit', e.target.value)}
                                            className={fieldClass('credit_limit', inputNoIconClass)}
                                            placeholder="5000"
                                            min={0}
                                        />
                                        {fieldError('credit_limit')}
                                    </div>

                                    <div>
                                        <label htmlFor="customer-credit-days" className={labelClass}>Credit Days *</label>
                                        <input
                                            {...fieldA11y('credit_days')}
                                            type="number"
                                            value={formData.credit_days}
                                            onChange={(e) => updateField('credit_days', e.target.value === '' ? '' : Number(e.target.value))}
                                            className={fieldClass('credit_days', inputNoIconClass)}
                                            min={0}
                                            max={365}
                                        />
                                        {fieldError('credit_days')}
                                    </div>
                                </div>
                            </div>
                    </div>
                </div>
            </div>

            {/* Sticky Footer - STANDARD: py-4, full-width, right-aligned */}
            <div className="absolute inset-x-0 bottom-0 flex-shrink-0 border-t border-gray-200 bg-white/95 px-3 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.06)] backdrop-blur sm:px-6">
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
                        {saving ? 'Saving...' : 'Save Customer'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CustomerFlow;
