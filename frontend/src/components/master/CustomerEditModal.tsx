import React, { useState, useEffect } from 'react';
import { 
  X, Save, Loader2, User, Phone, Building, CreditCard, Shield
} from 'lucide-react';
import { customersApi } from '../../services/api';
import { useToast } from '../global/ui/feedback/Toast';
import Input from '../global/ui/forms/Input';
import Button from '../global/ui/Button';

interface CustomerEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  customer?: any;
}

const CustomerEditModal: React.FC<CustomerEditModalProps> = ({ 
  isOpen, 
  onClose, 
  onSave,
  customer = null
}) => {
  const toast = useToast();
  
  // Initialize form data with default values to prevent null warnings
  const getInitialFormData = () => ({
    // Basic Information
    customer_code: customer?.customer_code || '',
    customer_name: customer?.customer_name || '',
    customer_type: customer?.customer_type || 'retail', // lowercase to match backend
    business_type: customer?.business_type || '',
    customer_category: customer?.customer_category || '',
    
    // Contact Information
    primary_phone: customer?.primary_phone || '',
    primary_email: customer?.primary_email || '',
    secondary_phone: customer?.secondary_phone || '',
    whatsapp_number: customer?.whatsapp_number || '',
    contact_person_name: customer?.contact_person_name || '',
    contact_person_phone: customer?.contact_person_phone || '',
    contact_person_email: customer?.contact_person_email || '',
    
    // Address
    address_line_1: customer?.address_line_1 || '',
    address_line_2: customer?.address_line_2 || '',
    city: customer?.city || '',
    state: customer?.state || '',
    pincode: customer?.pincode || '',
    
    // Compliance & GST
    gst_number: customer?.gst_number || customer?.gstin || '',
    pan_number: customer?.pan_number || '',
    drug_license_number: customer?.drug_license_number || '',
    drug_license_validity: customer?.drug_license_validity || '',
    fssai_number: customer?.fssai_number || '',
    
    // Credit Management
    credit_limit: customer?.credit_limit || 0,
    credit_days: customer?.credit_days || 0,
    credit_rating: customer?.credit_rating || 'B',
    payment_terms: customer?.payment_terms || 'NET30',
    current_outstanding: customer?.current_outstanding || 0,
    security_deposit: customer?.security_deposit || 0,
    
    // Preferences
    preferred_payment_mode: customer?.preferred_payment_mode || 'cash',
    preferred_delivery_time: customer?.preferred_delivery_time || '',
    prefer_sms: customer?.prefer_sms !== false,
    prefer_email: customer?.prefer_email !== false,
    prefer_whatsapp: customer?.prefer_whatsapp !== false,
    
    // Status
    is_active: customer?.is_active !== false,
    
    // Notes
    internal_notes: customer?.internal_notes || ''
  });

  const [formData, setFormData] = useState(getInitialFormData());
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState('basic');

  // Reset form when modal opens/closes or customer changes
  useEffect(() => {
    if (isOpen) {
      setFormData(getInitialFormData());
      setActiveSection('basic');
      setError(null);
    }
  }, [isOpen, customer]);

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const validateForm = () => {
    if (!formData.customer_name.trim()) {
      setError('Customer name is required');
      setActiveSection('basic');
      return false;
    }
    if (!formData.primary_phone.trim()) {
      setError('Primary phone is required');
      setActiveSection('basic');
      return false;
    }
    if (formData.gst_number && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(formData.gst_number)) {
      setError('Invalid GST number format');
      setActiveSection('compliance');
      return false;
    }
    if (formData.primary_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.primary_email)) {
      setError('Invalid email format');
      setActiveSection('basic');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    try {
      setIsSaving(true);
      setError(null);
      
      const dataToSave = {
        ...formData,
        credit_limit: parseFloat(String(formData.credit_limit)) || 0,
        credit_days: parseInt(String(formData.credit_days)) || 0,
        current_outstanding: parseFloat(String(formData.current_outstanding)) || 0,
        security_deposit: parseFloat(String(formData.security_deposit)) || 0,
        // Map GST field properly
        gstin: formData.gst_number || formData.gstin,
        gst_number: formData.gst_number || formData.gstin
      };
      
      if (customer) {
        await customersApi.update(customer.customer_id, dataToSave);
        toast.success('Customer updated successfully');
      } else {
        // Generate customer code if not provided
        if (!dataToSave.customer_code) {
          dataToSave.customer_code = `CUST${Date.now().toString().slice(-6)}`;
        }
        await customersApi.create(dataToSave);
        toast.success('Customer created successfully');
      }
      
      onSave();
      onClose();
    } catch (err: any) {
      console.error('Error saving customer:', err);
      setError(err.response?.data?.message || 'Failed to save customer');
    } finally {
      setIsSaving(false);
    }
  };

  // Simplified sections - matching ProductMaster pattern
  const sections = [
    { id: 'basic', label: 'Basic Information', icon: User },
    { id: 'contact', label: 'Contact & Address', icon: Phone },
    { id: 'compliance', label: 'Compliance & GST', icon: Shield },
    { id: 'credit', label: 'Credit & Payment', icon: CreditCard },
    { id: 'additional', label: 'Additional Info', icon: Building }
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl m-4 max-h-[90vh] flex flex-col">
        <form onSubmit={handleSubmit} className="flex flex-col h-full">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">
                {customer ? 'Edit Customer' : 'Add New Customer'}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            {error && (
              <div className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded">
                {error}
              </div>
            )}
          </div>

          {/* Body with Sidebar */}
          <div className="flex flex-1 overflow-hidden">
            {/* Sidebar Navigation */}
            <div className="w-48 bg-gray-50 p-4 border-r border-gray-200">
              <nav className="space-y-1">
                {sections.map((section) => {
                  const Icon = section.icon;
                  return (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => setActiveSection(section.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg flex items-center space-x-2 transition-colors text-sm ${
                        activeSection === section.id
                          ? 'bg-blue-100 text-blue-700'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="font-medium">{section.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Basic Information Section */}
              {activeSection === 'basic' && (
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                    <User className="w-5 h-5 mr-2" />
                    Basic Information
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Customer Name <span className="text-red-500">*</span>
                      </label>
                      <Input
                        type="text"
                        required
                        value={formData.customer_name}
                        onChange={(e) => handleInputChange('customer_name', e.target.value)}
                        placeholder="Enter customer name"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Customer Code
                      </label>
                      <Input
                        type="text"
                        value={formData.customer_code}
                        onChange={(e) => handleInputChange('customer_code', e.target.value)}
                        placeholder="Auto-generated if empty"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Customer Type
                      </label>
                      <select
                        value={formData.customer_type}
                        onChange={(e) => handleInputChange('customer_type', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      >
                        <option value="retail">Retail</option>
                        <option value="wholesale">Wholesale</option>
                        <option value="hospital">Hospital</option>
                        <option value="clinic">Clinic</option>
                        <option value="pharmacy">Pharmacy</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Business Type
                      </label>
                      <Input
                        type="text"
                        value={formData.business_type}
                        onChange={(e) => handleInputChange('business_type', e.target.value)}
                        placeholder="e.g., Retail Pharmacy, Hospital"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Category
                      </label>
                      <select
                        value={formData.customer_category}
                        onChange={(e) => handleInputChange('customer_category', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      >
                        <option value="PREMIUM">Premium</option>
                        <option value="GOLD">Gold</option>
                        <option value="SILVER">Silver</option>
                        <option value="REGULAR">Regular</option>
                        <option value="NEW">New</option>
                      </select>
                    </div>

                    <div className="flex items-center space-x-4">
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={formData.is_active}
                          onChange={(e) => handleInputChange('is_active', e.target.checked)}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm text-gray-700">Active Customer</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* Contact & Address Section */}
              {activeSection === 'contact' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                    <Phone className="w-5 h-5 mr-2" />
                    Contact & Address
                  </h3>
                  
                  {/* Contact Details */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-3">Contact Information</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Primary Phone <span className="text-red-500">*</span>
                        </label>
                        <Input
                          type="tel"
                          required
                          value={formData.primary_phone}
                          onChange={(e) => handleInputChange('primary_phone', e.target.value)}
                          placeholder="+91-9876543210"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Primary Email
                        </label>
                        <Input
                          type="email"
                          value={formData.primary_email}
                          onChange={(e) => handleInputChange('primary_email', e.target.value)}
                          placeholder="customer@example.com"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          WhatsApp Number
                        </label>
                        <Input
                          type="tel"
                          value={formData.whatsapp_number}
                          onChange={(e) => handleInputChange('whatsapp_number', e.target.value)}
                          placeholder="+91-9876543210"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Secondary Phone
                        </label>
                        <Input
                          type="tel"
                          value={formData.secondary_phone}
                          onChange={(e) => handleInputChange('secondary_phone', e.target.value)}
                          placeholder="+91-9876543211"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Contact Person */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-3">Contact Person</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Contact Person Name
                        </label>
                        <Input
                          type="text"
                          value={formData.contact_person_name}
                          onChange={(e) => handleInputChange('contact_person_name', e.target.value)}
                          placeholder="John Doe"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Contact Person Phone
                        </label>
                        <Input
                          type="tel"
                          value={formData.contact_person_phone}
                          onChange={(e) => handleInputChange('contact_person_phone', e.target.value)}
                          placeholder="+91-9876543210"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Address */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-3">Address</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Address Line 1
                        </label>
                        <Input
                          type="text"
                          value={formData.address_line_1}
                          onChange={(e) => handleInputChange('address_line_1', e.target.value)}
                          placeholder="Street address"
                        />
                      </div>

                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Address Line 2
                        </label>
                        <Input
                          type="text"
                          value={formData.address_line_2}
                          onChange={(e) => handleInputChange('address_line_2', e.target.value)}
                          placeholder="Apartment, suite, etc."
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          City
                        </label>
                        <Input
                          type="text"
                          value={formData.city}
                          onChange={(e) => handleInputChange('city', e.target.value)}
                          placeholder="Mumbai"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          State
                        </label>
                        <Input
                          type="text"
                          value={formData.state}
                          onChange={(e) => handleInputChange('state', e.target.value)}
                          placeholder="Maharashtra"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Pincode
                        </label>
                        <Input
                          type="text"
                          value={formData.pincode}
                          onChange={(e) => handleInputChange('pincode', e.target.value)}
                          placeholder="400001"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Compliance & GST Section */}
              {activeSection === 'compliance' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                    <Shield className="w-5 h-5 mr-2" />
                    Compliance & GST
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        GST Number
                      </label>
                      <Input
                        type="text"
                        value={formData.gst_number}
                        onChange={(e) => handleInputChange('gst_number', e.target.value.toUpperCase())}
                        placeholder="27AABCU9603R1ZM"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        PAN Number
                      </label>
                      <Input
                        type="text"
                        value={formData.pan_number}
                        onChange={(e) => handleInputChange('pan_number', e.target.value.toUpperCase())}
                        placeholder="AABCU9603R"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Drug License Number
                      </label>
                      <Input
                        type="text"
                        value={formData.drug_license_number}
                        onChange={(e) => handleInputChange('drug_license_number', e.target.value)}
                        placeholder="DL-12345"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Drug License Validity
                      </label>
                      <Input
                        type="date"
                        value={formData.drug_license_validity}
                        onChange={(e) => handleInputChange('drug_license_validity', e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        FSSAI Number
                      </label>
                      <Input
                        type="text"
                        value={formData.fssai_number}
                        onChange={(e) => handleInputChange('fssai_number', e.target.value)}
                        placeholder="FSSAI-12345"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Credit & Payment Section */}
              {activeSection === 'credit' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                    <CreditCard className="w-5 h-5 mr-2" />
                    Credit & Payment
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Credit Limit (₹)
                      </label>
                      <Input
                        type="number"
                        value={formData.credit_limit}
                        onChange={(e) => handleInputChange('credit_limit', e.target.value)}
                        min="0"
                        step="1000"
                        placeholder="50000"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Credit Days
                      </label>
                      <Input
                        type="number"
                        value={formData.credit_days}
                        onChange={(e) => handleInputChange('credit_days', e.target.value)}
                        min="0"
                        max="365"
                        placeholder="30"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Current Outstanding (₹)
                      </label>
                      <Input
                        type="number"
                        value={formData.current_outstanding}
                        onChange={(e) => handleInputChange('current_outstanding', e.target.value)}
                        min="0"
                        placeholder="0"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Security Deposit (₹)
                      </label>
                      <Input
                        type="number"
                        value={formData.security_deposit}
                        onChange={(e) => handleInputChange('security_deposit', e.target.value)}
                        min="0"
                        placeholder="0"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Credit Rating
                      </label>
                      <select
                        value={formData.credit_rating}
                        onChange={(e) => handleInputChange('credit_rating', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      >
                        <option value="AAA">AAA - Excellent</option>
                        <option value="AA">AA - Very Good</option>
                        <option value="A">A - Good</option>
                        <option value="B">B - Average</option>
                        <option value="C">C - Below Average</option>
                        <option value="D">D - Poor</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Payment Terms
                      </label>
                      <select
                        value={formData.payment_terms}
                        onChange={(e) => handleInputChange('payment_terms', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      >
                        <option value="IMMEDIATE">Immediate</option>
                        <option value="NET7">Net 7 Days</option>
                        <option value="NET15">Net 15 Days</option>
                        <option value="NET30">Net 30 Days</option>
                        <option value="NET45">Net 45 Days</option>
                        <option value="NET60">Net 60 Days</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Preferred Payment Mode
                      </label>
                      <select
                        value={formData.preferred_payment_mode}
                        onChange={(e) => handleInputChange('preferred_payment_mode', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      >
                        <option value="cash">Cash</option>
                        <option value="credit">Credit</option>
                        <option value="cheque">Cheque</option>
                        <option value="upi">UPI</option>
                        <option value="card">Card</option>
                        <option value="neft">NEFT/RTGS</option>
                      </select>
                    </div>
                  </div>

                  {/* Credit Analysis */}
                  {formData.credit_limit > 0 && (
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Credit Analysis</h4>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-gray-500">Available Credit:</span>
                          <span className="ml-2 font-medium">
                            ₹{((formData.credit_limit || 0) - (formData.current_outstanding || 0)).toLocaleString()}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">Credit Utilization:</span>
                          <span className="ml-2 font-medium">
                            {formData.credit_limit ? (((formData.current_outstanding || 0) / formData.credit_limit) * 100).toFixed(1) : 0}%
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">Credit Status:</span>
                          <span className={`ml-2 font-medium ${
                            (formData.current_outstanding || 0) > formData.credit_limit ? 'text-red-600' :
                            (formData.current_outstanding || 0) > formData.credit_limit * 0.8 ? 'text-yellow-600' :
                            'text-green-600'
                          }`}>
                            {(formData.current_outstanding || 0) > formData.credit_limit ? 'Over Limit' :
                             (formData.current_outstanding || 0) > formData.credit_limit * 0.8 ? 'Near Limit' :
                             'Good'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Additional Info Section */}
              {activeSection === 'additional' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                    <Building className="w-5 h-5 mr-2" />
                    Additional Information
                  </h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Preferred Delivery Time
                      </label>
                      <Input
                        type="text"
                        value={formData.preferred_delivery_time}
                        onChange={(e) => handleInputChange('preferred_delivery_time', e.target.value)}
                        placeholder="e.g., Morning 9 AM - 12 PM"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-3">
                        Communication Preferences
                      </label>
                      <div className="space-y-2">
                        <label className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={formData.prefer_sms}
                            onChange={(e) => handleInputChange('prefer_sms', e.target.checked)}
                            className="rounded border-gray-300"
                          />
                          <span className="text-sm text-gray-700">SMS Notifications</span>
                        </label>
                        <label className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={formData.prefer_email}
                            onChange={(e) => handleInputChange('prefer_email', e.target.checked)}
                            className="rounded border-gray-300"
                          />
                          <span className="text-sm text-gray-700">Email Notifications</span>
                        </label>
                        <label className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={formData.prefer_whatsapp}
                            onChange={(e) => handleInputChange('prefer_whatsapp', e.target.checked)}
                            className="rounded border-gray-300"
                          />
                          <span className="text-sm text-gray-700">WhatsApp Notifications</span>
                        </label>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Internal Notes
                      </label>
                      <textarea
                        value={formData.internal_notes}
                        onChange={(e) => handleInputChange('internal_notes', e.target.value)}
                        rows={4}
                        placeholder="Add any internal notes about this customer..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between bg-gray-50">
            <div className="text-sm text-gray-500">
              {customer ? `Customer ID: ${customer.customer_id}` : 'New Customer'}
            </div>
            <div className="flex items-center space-x-3">
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={isSaving}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    {customer ? 'Update' : 'Create'}
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CustomerEditModal;