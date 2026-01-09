import React, { useState } from 'react';
import { User, Phone, Mail, MapPin, Building, FileText, Shield, Calendar, CreditCard, MessageCircle, AlertCircle } from 'lucide-react';
import { customersApi } from '../../../services/api';
import { FullScreenModal } from '../modals/FullScreenModal';

// Imports from centralized types
import type {
    Customer,
    CustomerFormData
} from '../../sales/invoice/types/invoiceTypes';

// ==================== INLINE TRANSFORMERS ====================

/**
 * Prepare customer data for API submission
 */
const prepareCustomerForAPI = (customerData: CustomerFormData & { org_id?: string | null }) => ({
    customer_name: customerData.customer_name,
    primary_phone: customerData.primary_phone,

    whatsapp_number: customerData.whatsapp_number || null,
    email: customerData.primary_email || null,
    customer_type: customerData.customer_type || 'retail',
    gst_number: customerData.gst_number || null,
    pan_number: customerData.pan_number || null,
    drug_license_number: customerData.drug_license_number || null,
    credit_limit: parseFloat(String(customerData.credit_limit || 0)),
    credit_days: parseInt(String(customerData.credit_days || 0)),
    org_id: customerData.org_id,
    address_line1: customerData.address?.address_line1 || '',
    address_line2: customerData.address?.address_line2 || '',
    city: customerData.address?.city || '',
    state: customerData.address?.state || '',
    pincode: customerData.address?.pincode || '',
});

/**
 * Transform customer data from API response to frontend format
 */
const transformCustomer = (customer: Record<string, unknown>): Customer => ({
    customer_id: String(customer.customer_id || customer.id || ''),
    customer_name: String(customer.customer_name || ''),
    primary_phone: String(customer.primary_phone || ''),
    primary_email: String(customer.primary_email || customer.email || ''),
    gst_number: String(customer.gst_number || customer.gst_number || ''),
    pan_number: String(customer.pan_number || ''),
    drug_license_number: String(customer.drug_license_number || ''),
    credit_limit: parseFloat(String(customer.credit_limit || 0)),
    credit_days: parseInt(String(customer.credit_days || 0)),
    customer_type: String(customer.customer_type || 'retail'),
    current_outstanding: parseFloat(String(customer.current_outstanding || 0)),
});

// ==================== TYPES ====================

interface CustomerCreationModalProps {
    show: boolean;
    onClose: () => void;
    onCustomerCreated?: (customer: Customer) => void;
}

// ==================== COMPONENT ====================

const CustomerCreationModal: React.FC<CustomerCreationModalProps> = ({ show, onClose, onCustomerCreated }) => {
    const [isBusinessCustomer, setIsBusinessCustomer] = useState<boolean>(true);
    const [newCustomer, setNewCustomer] = useState<CustomerFormData>({
        customer_name: '',
        primary_phone: '',
        primary_email: '',
        whatsapp_number: '',
        customer_type: 'pharmacy',
        gst_number: '',
        pan_number: '',
        drug_license_number: '',
        drug_license_validity: '',
        credit_limit: 5000,
        credit_days: 0,
        credit_rating: 'B',
        address: {
            address_line1: '',
            address_line2: '',
            city: '',
            state: '',
            pincode: '',
            country: 'India'
        }
    });
    const [saving, setSaving] = useState<boolean>(false);
    const [errors, setErrors] = useState<string[]>([]);

    const saveCustomer = async (): Promise<void> => {
        setSaving(true);
        setErrors([]);
        try {
            const customerData = prepareCustomerForAPI({
                ...newCustomer,
                org_id: localStorage.getItem('pharma_org_id') || sessionStorage.getItem('pharma_org_id')
            });

            const response = await customersApi.create(customerData);

            if (response) {
                const createdCustomer = transformCustomer(response.data as Record<string, unknown>);

                if (onCustomerCreated) {
                    onCustomerCreated(createdCustomer);
                }

                setNewCustomer({
                    customer_name: '',
                    primary_phone: '',
                    primary_email: '',
                    whatsapp_number: '',
                    customer_type: isBusinessCustomer ? 'pharmacy' : 'individual',
                    gst_number: '',
                    pan_number: '',
                    drug_license_number: '',
                    drug_license_validity: '',
                    credit_limit: 5000,
                    credit_days: 0,
                    credit_rating: 'B',
                    address: {
                        address_line1: '',
                        address_line2: '',
                        city: '',
                        state: '',
                        pincode: '',
                        country: 'India'
                    }
                });

                onClose();
            } else {
                setErrors(['Customer created but response format unexpected']);
            }
        } catch (error: any) {
            if (error.response?.data?.detail) {
                if (Array.isArray(error.response.data.detail)) {
                    setErrors(error.response.data.detail.map((err: unknown) => {
                        if (typeof err === 'string') {
                            return err;
                        } else if (err && typeof err === 'object' && 'msg' in err) {
                            const typedErr = err as { msg: string; loc?: string[] };
                            return typedErr.loc ? `${typedErr.loc.join('.')} - ${typedErr.msg}` : typedErr.msg;
                        } else {
                            return JSON.stringify(err);
                        }
                    }));
                } else if (typeof error.response.data.detail === 'string') {
                    setErrors([error.response.data.detail]);
                } else {
                    setErrors([JSON.stringify(error.response.data.detail)]);
                }
            } else {
                setErrors(['Failed to save customer']);
            }
        } finally {
            setSaving(false);
        }
    };

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

    return (
        <FullScreenModal
            isOpen={show}
            onClose={onClose}
            title="Add New Customer"
            subtitle="Create a new customer profile - Use Tab/Enter to navigate"
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
                        onClick={saveCustomer}
                        disabled={saving}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                        {saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                        {saving ? 'Saving...' : 'Save Customer'}
                    </button>
                </div>
            }
        >
            <div className="space-y-6">
                {/* Icon Header */}
                <div className="flex items-center space-x-3 pb-4 border-b border-gray-200">
                    <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                        <User className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="text-sm text-gray-600">
                        Fill in customer details below. Press <kbd className="px-2 py-1 bg-gray-100 border border-gray-300 rounded text-xs font-mono">Tab</kbd> or <kbd className="px-2 py-1 bg-gray-100 border border-gray-300 rounded text-xs font-mono">Enter</kbd> to navigate.
                    </div>
                </div>

                <div className="space-y-6">
                    {/* Customer Type Toggle */}
                    <div className="flex items-center justify-center space-x-1 bg-gray-100 rounded-xl p-1">
                        <button
                            type="button"
                            onClick={() => {
                                setIsBusinessCustomer(true);
                                setNewCustomer({ ...newCustomer, customer_type: 'pharmacy' });
                            }}
                            className={`flex-1 px-4 py-2 rounded-lg font-medium transition-all duration-200 ${isBusinessCustomer
                                ? 'bg-white text-blue-600 shadow-sm'
                                : 'text-gray-600 hover:text-gray-800'
                                }`}
                        >
                            <Building className="inline-block w-4 h-4 mr-2" />
                            Business
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setIsBusinessCustomer(false);
                                setNewCustomer({ ...newCustomer, customer_type: 'individual' });
                            }}
                            className={`flex-1 px-4 py-2 rounded-lg font-medium transition-all duration-200 ${!isBusinessCustomer
                                ? 'bg-white text-blue-600 shadow-sm'
                                : 'text-gray-600 hover:text-gray-800'
                                }`}
                        >
                            <User className="inline-block w-4 h-4 mr-2" />
                            Individual
                        </button>
                    </div>

                    {/* Basic Information */}
                    <div className="space-y-4">
                        <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Basic Information</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Customer Name *</label>
                                <div className="relative">
                                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                                    <input
                                        type="text"
                                        value={newCustomer.customer_name}
                                        onChange={(e) => setNewCustomer({ ...newCustomer, customer_name: e.target.value })}
                                        className="w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                        placeholder="Enter customer name"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number *</label>
                                <div className="relative">
                                    <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                                    <input
                                        type="text"
                                        value={newCustomer.primary_phone}
                                        onChange={(e) => setNewCustomer({ ...newCustomer, primary_phone: e.target.value })}
                                        className="w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                        placeholder="Enter phone number"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">WhatsApp Number</label>
                                <div className="relative">
                                    <MessageCircle className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-green-500" />
                                    <input
                                        type="text"
                                        value={newCustomer.whatsapp_number}
                                        onChange={(e) => setNewCustomer({ ...newCustomer, whatsapp_number: e.target.value })}
                                        className="w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                        placeholder="WhatsApp number"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                                    <input
                                        type="email"
                                        value={newCustomer.primary_email}
                                        onChange={(e) => setNewCustomer({ ...newCustomer, primary_email: e.target.value })}
                                        className="w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                        placeholder="Enter email address"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Address Information */}
                    <div className="space-y-4">
                        <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Address Information</h4>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Address *</label>
                                <div className="relative">
                                    <MapPin className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                                    <textarea
                                        value={newCustomer.address.address_line1}
                                        onChange={(e) => setNewCustomer({ ...newCustomer, address: { ...newCustomer.address, address_line1: e.target.value } })}
                                        className="w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
                                        rows={2}
                                        placeholder="Enter complete address"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">City *</label>
                                    <div className="relative">
                                        <Building className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                                        <input
                                            type="text"
                                            value={newCustomer.address.city}
                                            onChange={(e) => setNewCustomer({ ...newCustomer, address: { ...newCustomer.address, city: e.target.value } })}
                                            className="w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                            placeholder="Enter city"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">State *</label>
                                    <select
                                        value={newCustomer.address.state}
                                        onChange={(e) => setNewCustomer({ ...newCustomer, address: { ...newCustomer.address, state: e.target.value } })}
                                        className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                    >
                                        <option value="">Select State</option>
                                        {INDIAN_STATES.map(state => (
                                            <option key={state} value={state}>{state}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className={`grid ${isBusinessCustomer ? 'grid-cols-2' : 'grid-cols-1'} gap-4`}>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Pincode *</label>
                                    <input
                                        type="text"
                                        value={newCustomer.address.pincode}
                                        onChange={(e) => setNewCustomer({ ...newCustomer, address: { ...newCustomer.address, pincode: e.target.value } })}
                                        className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                        placeholder="Enter pincode"
                                        maxLength={6}
                                    />
                                </div>

                                {isBusinessCustomer && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Business Type *</label>
                                        <select
                                            value={newCustomer.customer_type}
                                            onChange={(e) => setNewCustomer({ ...newCustomer, customer_type: e.target.value })}
                                            className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                        >
                                            <option value="pharmacy">Pharmacy</option>
                                            <option value="hospital">Hospital</option>
                                            <option value="clinic">Clinic</option>
                                            <option value="institution">Institution</option>
                                            <option value="doctor">Doctor</option>
                                        </select>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Compliance Information - Only for Business Customers */}
                    {isBusinessCustomer && (
                        <div className="space-y-4">
                            <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider flex items-center">
                                <Shield className="w-4 h-4 text-red-500 mr-2" />
                                Compliance Information (Required for Pharmacy/Hospital)
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Drug License Number *</label>
                                    <div className="relative">
                                        <Shield className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                                        <input
                                            type="text"
                                            value={newCustomer.drug_license_number}
                                            onChange={(e) => setNewCustomer({ ...newCustomer, drug_license_number: e.target.value })}
                                            className="w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                            placeholder="e.g., DL-MH-12345"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">License Validity Date *</label>
                                    <div className="relative">
                                        <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                                        <input
                                            type="date"
                                            value={newCustomer.drug_license_validity}
                                            onChange={(e) => setNewCustomer({ ...newCustomer, drug_license_validity: e.target.value })}
                                            className="w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                            min={new Date().toISOString().split('T')[0]}
                                        />
                                    </div>
                                    {newCustomer.drug_license_validity && new Date(newCustomer.drug_license_validity) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) && (
                                        <p className="text-xs text-amber-600 mt-1 flex items-center">
                                            <AlertCircle className="w-3 h-3 mr-1" />
                                            License expiring soon
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">GST Number</label>
                                    <div className="relative">
                                        <FileText className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                                        <input
                                            type="text"
                                            value={newCustomer.gst_number}
                                            onChange={(e) => setNewCustomer({ ...newCustomer, gst_number: e.target.value.toUpperCase() })}
                                            className="w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                            placeholder="e.g., 27ABCDE1234F1Z5"
                                            maxLength={15}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">PAN Number</label>
                                    <div className="relative">
                                        <FileText className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                                        <input
                                            type="text"
                                            value={newCustomer.pan_number}
                                            onChange={(e) => setNewCustomer({ ...newCustomer, pan_number: e.target.value.toUpperCase() })}
                                            className="w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                            placeholder="e.g., ABCDE1234F"
                                            maxLength={10}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Credit Management - Only for Business Customers */}
                    {isBusinessCustomer && (
                        <div className="space-y-4">
                            <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider flex items-center">
                                <CreditCard className="w-4 h-4 text-blue-500 mr-2" />
                                Credit Management
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Credit Rating *</label>
                                    <select
                                        value={newCustomer.credit_rating}
                                        onChange={(e) => setNewCustomer({ ...newCustomer, credit_rating: e.target.value })}
                                        className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                    >
                                        <option value="A">A - Excellent (Low Risk)</option>
                                        <option value="B">B - Good (Medium Risk)</option>
                                        <option value="C">C - Fair (High Risk)</option>
                                        <option value="D">D - Poor (Cash Only)</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Credit Limit (₹)</label>
                                    <input
                                        type="number"
                                        value={newCustomer.credit_limit}
                                        onChange={(e) => setNewCustomer({ ...newCustomer, credit_limit: parseInt(e.target.value) || 0 })}
                                        className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                        placeholder="Enter credit limit"
                                        min={0}
                                        disabled={newCustomer.credit_rating === 'D'}
                                    />
                                    {newCustomer.credit_rating === 'D' && (
                                        <p className="text-xs text-red-600 mt-1">D-rated customers must pay cash</p>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Credit Days</label>
                                    <input
                                        type="number"
                                        value={newCustomer.credit_days}
                                        onChange={(e) => setNewCustomer({ ...newCustomer, credit_days: parseInt(e.target.value) || 0 })}
                                        className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                        placeholder="Payment terms in days"
                                        min={0}
                                        max={90}
                                        disabled={newCustomer.credit_rating === 'D'}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Error Messages */}
                    {errors.length > 0 && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                            <div className="text-sm text-red-600 space-y-1">
                                {errors.map((error, index) => (
                                    <div key={index} className="flex items-start">
                                        <span className="block w-1 h-1 bg-red-600 rounded-full mt-2 mr-2 flex-shrink-0"></span>
                                        <span>{error}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </FullScreenModal>
    );
};

export default CustomerCreationModal;
