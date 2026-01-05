import React, { useState, useEffect, ChangeEvent } from 'react';
import { X, Building2, Phone, Mail, MapPin, CreditCard, FileText, Save, Shield, Calendar, Banknote, MessageCircle, AlertCircle, User, Clock, Star, Package, Hash, Globe, Briefcase, Check } from 'lucide-react';
import { supplierAPI } from '../../../services/api';
import { searchCache } from '../../../utils/searchCache';
import { useToast } from '../ui';
import { APP_CONFIG } from '../../../config/app.config';
import { FullScreenModal } from '../modals/FullScreenModal';

// ==================== INLINE TRANSFORMERS ====================

/**
 * Prepare supplier data for API submission
 */
const prepareSupplierForAPI = (supplierData: Record<string, unknown>) => ({
    name: supplierData.supplier_name || supplierData.name,
    code: supplierData.supplier_code || null,
    supplier_type: supplierData.supplier_type || 'distributor',
    contact_person: supplierData.contact_person || null,
    contact_person_phone: supplierData.contact_person_phone || null,
    phone: supplierData.phone || null,
    secondary_phone: supplierData.secondary_phone || null,
    whatsapp_number: (supplierData.whatsapp_number as string) || (supplierData.phone as string) || null,
    email: supplierData.email || null,
    website: supplierData.website || null,
    address: supplierData.address_line1 || supplierData.address || null,
    address_line2: supplierData.address_line2 || null,
    city: supplierData.city || null,
    state: supplierData.state || null,
    pincode: supplierData.pincode || null,
    gst_number: supplierData.gst_number || null,
    pan_number: supplierData.pan_number || null,
    drug_license_number: supplierData.drug_license_no || null,
    drug_license_validity: supplierData.drug_license_validity || null,
    bank_name: supplierData.bank_name || null,
    account_number: supplierData.bank_account_no || null,
    ifsc_code: supplierData.bank_ifsc_code || null,
    account_holder_name: supplierData.account_holder_name || null,
    payment_terms: supplierData.payment_terms || null,
    payment_days: supplierData.payment_terms === 'custom'
        ? parseInt(String(supplierData.payment_days || 30))
        : parseInt(String(supplierData.payment_terms || 30)),
    credit_days: parseInt(String(supplierData.credit_days || 0)),
    quality_rating: supplierData.quality_rating || 4,
    delivery_rating: supplierData.delivery_rating || 4,
    compliance_rating: supplierData.compliance_rating || 'good',
    notes: supplierData.notes || null,
    internal_notes: supplierData.notes || null,
    org_id: supplierData.org_id
});

/**
 * Transform supplier data from API response to frontend format
 */
const transformSupplier = (supplier: Record<string, unknown>) => ({
    supplier_id: String(supplier.supplier_id || supplier.id || ''),
    name: String(supplier.supplier_name || supplier.name || ''),
    code: String(supplier.supplier_code || ''),
    type: String(supplier.supplier_type || ''),
    contact_person: String(supplier.contact_person_name || supplier.contact_person || ''),
    phone: String(supplier.primary_phone || supplier.phone || ''),
    email: String(supplier.primary_email || supplier.email || ''),
    gst_number: String(supplier.gst_number || supplier.gst_number || ''),
    pan_number: String(supplier.pan_number || ''),
    is_active: supplier.is_active ?? true,
});

const INDIAN_STATES: string[] = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
    'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
    'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
    'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
    'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli',
    'Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep',
    'Puducherry'
];

interface Supplier {
    supplier_id?: number | string;
    id?: number | string;
    supplier_name?: string;
    supplier_code?: string;
    [key: string]: unknown;
}

interface SupplierFormData {
    supplier_name: string;
    supplier_code: string;
    contact_person: string;
    contact_person_phone: string;
    contact_person_email: string;
    phone: string;
    whatsapp_number: string;
    alternate_phone: string;
    email: string;
    website: string;
    address_line1: string;
    address_line2: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
    gst_number: string;
    pan_number: string;
    drug_license_no: string;
    drug_license_validity: string;
    payment_terms: string;
    bank_name: string;
    bank_account_no: string;
    bank_ifsc_code: string;
    account_holder_name: string;
    quality_rating: number;
    delivery_rating: number;
    compliance_rating: string;
    supplier_type: string;
    notes: string;
    is_active: boolean;
    [key: string]: unknown;
}

interface FormErrors {
    [key: string]: string;
}

export interface SupplierCreationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSupplierCreated?: (supplier: Supplier) => void;
    initialData?: Partial<SupplierFormData>;
    title?: string;
}

// ==================== COMPONENT ====================

const SupplierCreationModal: React.FC<SupplierCreationModalProps> = ({
    isOpen,
    onClose,
    onSupplierCreated,
    initialData = {},
    title = "Add New Supplier"
}) => {
    const toast = useToast();
    const [activeSection, setActiveSection] = useState<string>('all');
    const [saving, setSaving] = useState<boolean>(false);
    const [useBusinessPhoneForWhatsApp, setUseBusinessPhoneForWhatsApp] = useState<boolean>(false);
    const [useBusinessContactForPerson, setUseBusinessContactForPerson] = useState<boolean>(false);

    const [formData, setFormData] = useState<SupplierFormData>({
        supplier_name: '',
        supplier_code: '',
        contact_person: '',
        contact_person_phone: '',
        contact_person_email: '',
        phone: '',
        whatsapp_number: '',
        alternate_phone: '',
        email: '',
        website: '',
        address_line1: '',
        address_line2: '',
        city: '',
        state: 'Maharashtra',
        pincode: '',
        country: 'India',
        gst_number: '',
        pan_number: '',
        drug_license_no: '',
        drug_license_validity: '',
        payment_terms: '30',
        bank_name: '',
        bank_account_no: '',
        bank_ifsc_code: '',
        account_holder_name: '',
        quality_rating: 4,
        delivery_rating: 4,
        compliance_rating: 'good',
        supplier_type: 'distributor',
        notes: '',
        is_active: true,
        ...initialData
    });

    const [errors, setErrors] = useState<FormErrors>({});

    // Auto-generate supplier code
    useEffect(() => {
        if (formData.supplier_name && !formData.supplier_code) {
            const code = formData.supplier_name
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, '')
                .slice(0, 6) +
                '-' +
                Date.now().toString().slice(-4);
            setFormData(prev => ({ ...prev, supplier_code: code }));
        }
    }, [formData.supplier_name]);

    // Handle copying business phone to WhatsApp
    useEffect(() => {
        if (useBusinessPhoneForWhatsApp && formData.phone) {
            setFormData(prev => ({ ...prev, whatsapp_number: prev.phone }));
        }
    }, [useBusinessPhoneForWhatsApp, formData.phone]);

    // Handle copying business contact to contact person
    useEffect(() => {
        if (useBusinessContactForPerson) {
            setFormData(prev => ({
                ...prev,
                contact_person_phone: prev.phone,
                contact_person_email: prev.email
            }));
        }
    }, [useBusinessContactForPerson, formData.phone, formData.email]);

    const validateGSTIN = (gst_number: string): boolean => {
        if (!gst_number) return true;
        const gst_numberRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
        return gst_numberRegex.test(gst_number);
    };

    const validatePAN = (pan: string): boolean => {
        if (!pan) return true;
        const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
        return panRegex.test(pan);
    };

    const validatePhone = (phone: string): boolean => {
        const phoneRegex = /^[6-9]\d{9}$/;
        return phoneRegex.test(phone.replace(/\D/g, ''));
    };

    const handleInputChange = (field: keyof SupplierFormData, value: string | number | boolean): void => {
        setFormData(prev => ({ ...prev, [field]: value }));
        if (errors[field]) {
            setErrors(prev => ({ ...prev, [field]: '' }));
        }
    };

    const validateForm = (): boolean => {
        const newErrors: FormErrors = {};

        if (!formData.supplier_name) newErrors.supplier_name = 'Supplier name is required';
        if (!formData.phone) newErrors.phone = 'Phone number is required';
        else if (!validatePhone(formData.phone)) newErrors.phone = 'Invalid phone number';

        if (!formData.city) newErrors.city = 'City is required';
        if (!formData.state) newErrors.state = 'State is required';

        if ((formData.city || formData.state) && !formData.pincode) {
            newErrors.pincode = 'Pincode is required when providing address';
        } else if (formData.pincode && !/^\d{6}$/.test(formData.pincode)) {
            newErrors.pincode = 'Pincode must be 6 digits';
        }

        if (formData.gst_number && !validateGSTIN(formData.gst_number)) {
            newErrors.gst_number = 'Invalid GSTIN format';
        }

        if (formData.pan_number && !validatePAN(formData.pan_number)) {
            newErrors.pan_number = 'Invalid PAN format';
        }

        if (formData.email && !/\S+@\S+\.\S+/.test(formData.email)) {
            newErrors.email = 'Invalid email format';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (): Promise<void> => {
        if (!validateForm()) {
            toast.error('Please fix the errors before submitting');
            return;
        }

        setSaving(true);
        try {
            const supplierData = prepareSupplierForAPI(formData as unknown as Record<string, unknown>);

            const response = await supplierAPI.create(supplierData);

            if (response) {
                searchCache.clearType('suppliers');

                const transformedSupplier = transformSupplier((response.data || response) as Record<string, unknown>);

                toast.success('Supplier created successfully');

                if (onSupplierCreated) {
                    onSupplierCreated(transformedSupplier);
                }

                onClose();
            } else {
                throw new Error('Failed to create supplier');
            }
        } catch (error: unknown) {
            const err = error as { response?: { data?: { detail?: string } }; message?: string };
            const errorMessage = err.response?.data?.detail || err.message || 'Failed to create supplier';
            toast.error(errorMessage);
        } finally {
            setSaving(false);
        }
    };

    return (
        <FullScreenModal
            isOpen={isOpen}
            onClose={onClose}
            title={title}
            subtitle="Create a new supplier profile - Use Tab/Enter to navigate"
            size="large"
            footer={
                <div className="flex justify-between items-center">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                        Cancel (Esc)
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={saving}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                        {saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                        {saving ? 'Saving...' : 'Save Supplier'}
                    </button>
                </div>
            }
        >
            <div className="space-y-6">
                {/* Basic Information Section */}
                <div className="mb-4">
                    <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-blue-600" />
                        Basic Information
                    </h3>
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            <div className="lg:col-span-2">
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                    Supplier Name *
                                </label>
                                <input
                                    type="text"
                                    value={formData.supplier_name}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => handleInputChange('supplier_name', e.target.value)}
                                    className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${errors.supplier_name ? 'border-red-300' : 'border-gray-300'
                                        }`}
                                    placeholder="e.g., ABC Pharmaceuticals"
                                />
                                {errors.supplier_name && (
                                    <p className="mt-1 text-xs text-red-600">{errors.supplier_name}</p>
                                )}
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                    Type
                                </label>
                                <select
                                    value={formData.supplier_type}
                                    onChange={(e: ChangeEvent<HTMLSelectElement>) => handleInputChange('supplier_type', e.target.value)}
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                >
                                    <option value="distributor">Distributor</option>
                                    <option value="manufacturer">Manufacturer</option>
                                    <option value="stockist">Stockist</option>
                                    <option value="wholesaler">Wholesaler</option>
                                    <option value="importer">Importer</option>
                                </select>
                            </div>
                        </div>

                        {/* Business Contact - Single Row */}
                        <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                    Phone *
                                </label>
                                <input
                                    type="tel"
                                    value={formData.phone}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => handleInputChange('phone', e.target.value)}
                                    className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${errors.phone ? 'border-red-300' : 'border-gray-300'
                                        }`}
                                    placeholder="Business phone"
                                />
                                {errors.phone && (
                                    <p className="mt-1 text-xs text-red-600">{errors.phone}</p>
                                )}
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center justify-between">
                                    <span>WhatsApp</span>
                                    <label className="text-xs font-normal">
                                        <input
                                            type="checkbox"
                                            checked={useBusinessPhoneForWhatsApp}
                                            onChange={(e: ChangeEvent<HTMLInputElement>) => setUseBusinessPhoneForWhatsApp(e.target.checked)}
                                            className="mr-1"
                                        />
                                        Same
                                    </label>
                                </label>
                                <input
                                    type="tel"
                                    value={formData.whatsapp_number}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => handleInputChange('whatsapp_number', e.target.value)}
                                    disabled={useBusinessPhoneForWhatsApp}
                                    className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${useBusinessPhoneForWhatsApp ? 'bg-gray-100' : ''
                                        } border-gray-300`}
                                    placeholder="WhatsApp"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                    Email
                                </label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => handleInputChange('email', e.target.value)}
                                    className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${errors.email ? 'border-red-300' : 'border-gray-300'
                                        }`}
                                    placeholder="Business email"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                    Website
                                </label>
                                <input
                                    type="url"
                                    value={formData.website}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => handleInputChange('website', e.target.value)}
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="example.com"
                                />
                            </div>
                        </div>

                        {/* Contact Person - Optional compact section */}
                        <details className="border rounded-lg p-3 bg-gray-50">
                            <summary className="text-xs font-medium text-gray-700 cursor-pointer">
                                Contact Person (Optional)
                                <label className="ml-3 text-xs font-normal">
                                    <input
                                        type="checkbox"
                                        checked={useBusinessContactForPerson}
                                        onChange={(e: ChangeEvent<HTMLInputElement>) => setUseBusinessContactForPerson(e.target.checked)}
                                        className="mr-1"
                                    />
                                    Use business info
                                </label>
                            </summary>
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-3">
                                <div>
                                    <input
                                        type="text"
                                        value={formData.contact_person}
                                        onChange={(e: ChangeEvent<HTMLInputElement>) => handleInputChange('contact_person', e.target.value)}
                                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500"
                                        placeholder="Contact person name"
                                    />
                                </div>
                                <div>
                                    <input
                                        type="tel"
                                        value={formData.contact_person_phone}
                                        onChange={(e: ChangeEvent<HTMLInputElement>) => handleInputChange('contact_person_phone', e.target.value)}
                                        disabled={useBusinessContactForPerson}
                                        className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-purple-500 ${useBusinessContactForPerson ? 'bg-gray-100' : ''
                                            } border-gray-200`}
                                        placeholder="Contact phone"
                                    />
                                </div>
                                <div>
                                    <input
                                        type="email"
                                        value={formData.contact_person_email}
                                        onChange={(e: ChangeEvent<HTMLInputElement>) => handleInputChange('contact_person_email', e.target.value)}
                                        disabled={useBusinessContactForPerson}
                                        className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-purple-500 ${useBusinessContactForPerson ? 'bg-gray-100' : ''
                                            } border-gray-200`}
                                        placeholder="Contact email"
                                    />
                                </div>
                            </div>
                        </details>
                    </div>
                </div>

                {/* Address Section - Compact */}
                <div className="mb-6">
                    <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-blue-600" />
                        Address
                    </h3>
                    <div className="space-y-3">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                            <input
                                type="text"
                                value={formData.address_line1}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => handleInputChange('address_line1', e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                placeholder="Building/Street address"
                            />
                            <input
                                type="text"
                                value={formData.address_line2}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => handleInputChange('address_line2', e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                placeholder="Area/Landmark"
                            />
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                            <div>
                                <input
                                    type="text"
                                    value={formData.city}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => handleInputChange('city', e.target.value)}
                                    className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 ${errors.city ? 'border-red-300' : 'border-gray-300'
                                        }`}
                                    placeholder="City *"
                                />
                                {errors.city && (
                                    <p className="mt-1 text-xs text-red-600">{errors.city}</p>
                                )}
                            </div>

                            <div>
                                <select
                                    value={formData.state}
                                    onChange={(e: ChangeEvent<HTMLSelectElement>) => handleInputChange('state', e.target.value)}
                                    className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 ${errors.state ? 'border-red-300' : 'border-gray-300'
                                        }`}
                                >
                                    <option value="">State *</option>
                                    {INDIAN_STATES.map(state => (
                                        <option key={state} value={state}>{state}</option>
                                    ))}
                                </select>
                                {errors.state && (
                                    <p className="mt-1 text-xs text-red-600">{errors.state}</p>
                                )}
                            </div>

                            <div>
                                <input
                                    type="text"
                                    value={formData.pincode}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => handleInputChange('pincode', e.target.value)}
                                    className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 ${errors.pincode ? 'border-red-300' : 'border-gray-300'
                                        }`}
                                    placeholder="Pincode *"
                                    maxLength={6}
                                />
                                {errors.pincode && (
                                    <p className="mt-1 text-xs text-red-600">{errors.pincode}</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Tax & Compliance - Single Row */}
                <div className="mb-6">
                    <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-600" />
                        Tax & Compliance
                    </h3>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                        <div>
                            <input
                                type="text"
                                value={formData.gst_number}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => handleInputChange('gst_number', e.target.value.toUpperCase())}
                                className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 ${errors.gst_number ? 'border-red-300' : 'border-gray-300'
                                    }`}
                                placeholder="GSTIN (15 chars)"
                                maxLength={15}
                            />
                            {errors.gst_number && (
                                <p className="mt-1 text-xs text-red-600">{errors.gst_number}</p>
                            )}
                        </div>

                        <div>
                            <input
                                type="text"
                                value={formData.pan_number}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => handleInputChange('pan_number', e.target.value.toUpperCase())}
                                className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 ${errors.pan_number ? 'border-red-300' : 'border-gray-300'
                                    }`}
                                placeholder="PAN (10 chars)"
                                maxLength={10}
                            />
                            {errors.pan_number && (
                                <p className="mt-1 text-xs text-red-600">{errors.pan_number}</p>
                            )}
                        </div>

                        <div>
                            <input
                                type="text"
                                value={formData.drug_license_no}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => handleInputChange('drug_license_no', e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                placeholder="Drug License No."
                            />
                        </div>
                    </div>
                </div>

                {/* Commercial & Banking - Collapsible */}
                <details className="mb-6 border rounded-lg p-3 bg-gray-50">
                    <summary className="text-xs font-medium text-gray-700 cursor-pointer">
                        Banking & Payment (Optional)
                    </summary>
                    <div className="mt-3 space-y-3">
                        <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
                            <div>
                                <select
                                    value={formData.payment_terms}
                                    onChange={(e: ChangeEvent<HTMLSelectElement>) => handleInputChange('payment_terms', e.target.value)}
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="0">Immediate</option>
                                    <option value="7">7 Days</option>
                                    <option value="15">15 Days</option>
                                    <option value="30">30 Days</option>
                                    <option value="45">45 Days</option>
                                    <option value="60">60 Days</option>
                                    <option value="90">90 Days</option>
                                </select>
                            </div>

                            <div>
                                <input
                                    type="text"
                                    value={formData.bank_name}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => handleInputChange('bank_name', e.target.value)}
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    placeholder="Bank Name"
                                />
                            </div>

                            <div>
                                <input
                                    type="text"
                                    value={formData.bank_account_no}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => handleInputChange('bank_account_no', e.target.value)}
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    placeholder="Account No."
                                />
                            </div>

                            <div>
                                <input
                                    type="text"
                                    value={formData.bank_ifsc_code}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => handleInputChange('bank_ifsc_code', e.target.value.toUpperCase())}
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    placeholder="IFSC Code"
                                    maxLength={11}
                                />
                            </div>
                        </div>
                    </div>
                </details>
            </div>
        </FullScreenModal>
    );
};

export default SupplierCreationModal;
