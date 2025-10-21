import React, { useState, useEffect } from 'react';
import { X, Building2, Phone, Mail, MapPin, CreditCard, FileText, Save, Shield, Calendar, Banknote, MessageCircle, AlertCircle, User, Clock, Star, Package, Hash, Globe, Briefcase, Check } from 'lucide-react';
import { supplierAPI } from '../../../services/api';
import { searchCache } from '../../../utils/searchCache';
import { useToast } from '../ui';
import DataTransformer from '../../../services/dataTransformer';
import { APP_CONFIG } from '../../../config/app.config';
import { FullScreenModal } from '../ui/FullScreenModal';

// Indian states for dropdown
const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli',
  'Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep',
  'Puducherry'
];

/**
 * Global Supplier Creation Modal
 * 
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether modal is open
 * @param {Function} props.onClose - Function to close modal
 * @param {Function} props.onSupplierCreated - Callback with created supplier data
 * @param {Object} props.initialData - Initial form data (for prefilling)
 * @param {string} props.title - Modal title (default: "Add New Supplier")
 */
const SupplierCreationModal = ({ 
  isOpen, 
  onClose, 
  onSupplierCreated,
  initialData = {},
  title = "Add New Supplier"
}) => {
  const toast = useToast();
  const [activeSection, setActiveSection] = useState('all');
  const [saving, setSaving] = useState(false);
  const [useBusinessPhoneForWhatsApp, setUseBusinessPhoneForWhatsApp] = useState(false);
  const [useBusinessContactForPerson, setUseBusinessContactForPerson] = useState(false);
  
  const [formData, setFormData] = useState({
    // Basic Information
    supplier_name: '',
    supplier_code: '',
    contact_person: '',
    contact_person_phone: '',  // Contact person's direct phone
    contact_person_email: '',  // Contact person's email
    phone: '',  // Business phone
    whatsapp_number: '',  // WhatsApp (can be same as phone)
    alternate_phone: '',
    email: '',  // Business email
    website: '',
    
    // Address Information
    address_line1: '',
    address_line2: '',
    city: '',
    state: 'Maharashtra',
    pincode: '',
    country: 'India',
    
    // Tax & Compliance - CRITICAL
    gstin: '',
    pan_number: '',
    drug_license_no: '',
    drug_license_validity: '',  // NEW: Critical for compliance
    
    // Banking Details - CRITICAL
    payment_terms: '30',
    bank_name: '',
    bank_account_no: '',
    bank_ifsc_code: '',
    account_holder_name: '',  // NEW: Required for payments
    
    // Performance Ratings - NEW
    quality_rating: 4,
    delivery_rating: 4,
    compliance_rating: 'good',
    
    // Additional Info
    supplier_type: 'distributor',
    notes: '',
    is_active: true,
    ...initialData
  });
  
  const [errors, setErrors] = useState({});

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

  // Validate GSTIN format
  const validateGSTIN = (gstin) => {
    if (!gstin) return true; // Optional field
    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    return gstinRegex.test(gstin);
  };

  // Validate PAN format
  const validatePAN = (pan) => {
    if (!pan) return true; // Optional field
    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
    return panRegex.test(pan);
  };

  // Validate phone number
  const validatePhone = (phone) => {
    const phoneRegex = /^[6-9]\d{9}$/;
    return phoneRegex.test(phone.replace(/\D/g, ''));
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    // Required fields
    if (!formData.supplier_name) newErrors.supplier_name = 'Supplier name is required';
    if (!formData.phone) newErrors.phone = 'Phone number is required';
    else if (!validatePhone(formData.phone)) newErrors.phone = 'Invalid phone number';
    
    if (!formData.city) newErrors.city = 'City is required';
    if (!formData.state) newErrors.state = 'State is required';
    
    // If city and state are provided, pincode becomes required (database constraint)
    if ((formData.city || formData.state) && !formData.pincode) {
      newErrors.pincode = 'Pincode is required when providing address';
    } else if (formData.pincode && !/^\d{6}$/.test(formData.pincode)) {
      newErrors.pincode = 'Pincode must be 6 digits';
    }
    
    // Format validations
    if (formData.gstin && !validateGSTIN(formData.gstin)) {
      newErrors.gstin = 'Invalid GSTIN format';
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

  const handleSubmit = async () => {
    if (!validateForm()) {
      toast.error('Please fix the errors before submitting');
      return;
    }
    
    setSaving(true);
    try {
      // Prepare data for API using DataTransformer
      const supplierData = DataTransformer.prepareSupplierForAPI(formData);
      
      const response = await supplierAPI.create(supplierData);
      
      if (response) {
        // Clear supplier cache to force refresh on next search
        searchCache.clearType('suppliers');
        
        // Transform response data
        const transformedSupplier = DataTransformer.transformSupplier(response.data || response, 'display');
        
        toast.success('Supplier created successfully');
        
        if (onSupplierCreated) {
          onSupplierCreated(transformedSupplier);
        }
        
        onClose();
      } else {
        throw new Error('Failed to create supplier');
      }
    } catch (error) {
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to create supplier';
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
                    onChange={(e) => handleInputChange('supplier_name', e.target.value)}
                    className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      errors.supplier_name ? 'border-red-300' : 'border-gray-300'
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
                    onChange={(e) => handleInputChange('supplier_type', e.target.value)}
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
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                    className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      errors.phone ? 'border-red-300' : 'border-gray-300'
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
                        onChange={(e) => setUseBusinessPhoneForWhatsApp(e.target.checked)}
                        className="mr-1"
                      />
                      Same
                    </label>
                  </label>
                  <input
                    type="tel"
                    value={formData.whatsapp_number}
                    onChange={(e) => handleInputChange('whatsapp_number', e.target.value)}
                    disabled={useBusinessPhoneForWhatsApp}
                    className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      useBusinessPhoneForWhatsApp ? 'bg-gray-100' : ''
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
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      errors.email ? 'border-red-300' : 'border-gray-300'
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
                    onChange={(e) => handleInputChange('website', e.target.value)}
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
                      onChange={(e) => setUseBusinessContactForPerson(e.target.checked)}
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
                      onChange={(e) => handleInputChange('contact_person', e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500"
                      placeholder="Contact person name"
                    />
                  </div>
                  <div>
                    <input
                      type="tel"
                      value={formData.contact_person_phone}
                      onChange={(e) => handleInputChange('contact_person_phone', e.target.value)}
                      disabled={useBusinessContactForPerson}
                      className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-purple-500 ${
                        useBusinessContactForPerson ? 'bg-gray-100' : ''
                      } border-gray-200`}
                      placeholder="Contact phone"
                    />
                  </div>
                  <div>
                    <input
                      type="email"
                      value={formData.contact_person_email}
                      onChange={(e) => handleInputChange('contact_person_email', e.target.value)}
                      disabled={useBusinessContactForPerson}
                      className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-purple-500 ${
                        useBusinessContactForPerson ? 'bg-gray-100' : ''
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
                  onChange={(e) => handleInputChange('address_line1', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Building/Street address"
                />
                <input
                  type="text"
                  value={formData.address_line2}
                  onChange={(e) => handleInputChange('address_line2', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Area/Landmark"
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <div>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => handleInputChange('city', e.target.value)}
                    className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                      errors.city ? 'border-red-300' : 'border-gray-300'
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
                    onChange={(e) => handleInputChange('state', e.target.value)}
                    className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                      errors.state ? 'border-red-300' : 'border-gray-300'
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
                    onChange={(e) => handleInputChange('pincode', e.target.value)}
                    className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                      errors.pincode ? 'border-red-300' : 'border-gray-300'
                    }`}
                    placeholder="Pincode *"
                    maxLength="6"
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
                  value={formData.gstin}
                  onChange={(e) => handleInputChange('gstin', e.target.value.toUpperCase())}
                  className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                    errors.gstin ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="GSTIN (15 chars)"
                  maxLength="15"
                />
                {errors.gstin && (
                  <p className="mt-1 text-xs text-red-600">{errors.gstin}</p>
                )}
              </div>
              
              <div>
                <input
                  type="text"
                  value={formData.pan_number}
                  onChange={(e) => handleInputChange('pan_number', e.target.value.toUpperCase())}
                  className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                    errors.pan_number ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="PAN (10 chars)"
                  maxLength="10"
                />
                {errors.pan_number && (
                  <p className="mt-1 text-xs text-red-600">{errors.pan_number}</p>
                )}
              </div>
              
              <div>
                <input
                  type="text"
                  value={formData.drug_license_no}
                  onChange={(e) => handleInputChange('drug_license_no', e.target.value)}
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
                    onChange={(e) => handleInputChange('payment_terms', e.target.value)}
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
                    onChange={(e) => handleInputChange('bank_name', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Bank Name"
                  />
                </div>
                
                <div>
                  <input
                    type="text"
                    value={formData.bank_account_no}
                    onChange={(e) => handleInputChange('bank_account_no', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Account No."
                  />
                </div>
                
                <div>
                  <input
                    type="text"
                    value={formData.bank_ifsc_code}
                    onChange={(e) => handleInputChange('bank_ifsc_code', e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="IFSC Code"
                    maxLength="11"
                  />
                </div>
              </div>
            </div>
          </details>
        </div>
      </div>
    </FullScreenModal>
  );
};

export default SupplierCreationModal;