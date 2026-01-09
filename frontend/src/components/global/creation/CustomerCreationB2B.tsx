import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Building2, User, Phone, Mail, Save, X, AlertCircle, CheckCircle, MapPin, Shield, MessageCircle, CreditCard } from 'lucide-react';
import { useEnterAsTab } from '../../../hooks/useEnterAsTab';
import useEscapeKey from '../../../hooks/useEscapeKey';
import { useOfflineCustomers } from '../../../hooks/offline/sales';
import { toast } from 'react-toastify';

/**
 * Enhanced Customer Creation Component
 * 
 * Features:
 * - B2B/B2C toggle selection
 * - Complete field coverage (address, drug license, etc.)
 * - Product creation modal layout style
 * - Separate business and contact person sections for B2B
 * 
 * Based on parties.customers schema with full field support
 */
const CustomerCreationB2B = ({ onClose, onCustomerCreated }) => {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [customerType, setCustomerType] = useState('B2B'); // B2B or B2C toggle
  const [useBusinessContactInfo, setUseBusinessContactInfo] = useState(false);

  const customerFormRef = useRef(null);

  // Enable Enter-as-Tab navigation (Marg ERP style)
  useEnterAsTab({
    containerRef: customerFormRef,
    enabled: true,
    excludeSelectors: ['textarea', 'button[type="submit"]', '[data-no-enter-tab]']
  });

  // ESC key handling
  useEscapeKey(
    useCallback(() => {
      if (onClose) onClose();
    }, [onClose]),
    true,
    'CustomerCreation-Main'
  );

  const [formData, setFormData] = useState({
    // Basic Details (aligned with schema)
    customer_name: '',
    customer_type: customerType === 'B2B' ? 'wholesale' : 'retail', // Map to backend values
    business_type: '',

    // Contact Information
    primary_phone: '',
    primary_email: '',
    whatsapp_number: '',

    // B2B Specific - Contact Person
    contact_person: '',
    contact_person_phone: '',
    contact_person_email: '',

    // Address Information
    address: {
      address_line1: '',
      address_line2: '',
      city: '',
      state: '',
      pincode: ''
    },

    // Compliance & Licensing
    gst_number: '',
    pan_number: '',
    drug_license_number: '',
    drug_license_validity: '',

    // Credit Terms (aligned with schema)
    credit_limit: 50000,
    credit_days: 30,
    credit_rating: 'B',
    payment_terms: 'Credit',
    customer_category: 'Regular',

    // Status
    is_active: true
  });

  interface FormErrors {
    customer_name?: string;
    contact_person?: string;
    primary_phone?: string;
    contact_person_phone?: string;
    whatsapp_number?: string;
    primary_email?: string;
    contact_person_email?: string;
    gst_number?: string;
    pan_number?: string;
    [key: string]: string | undefined;
  }

  const [errors, setErrors] = useState<FormErrors>({});

  // Handle copying business contact info to contact person
  useEffect(() => {
    if (useBusinessContactInfo && customerType === 'B2B') {
      setFormData(prev => ({
        ...prev,
        contact_person_phone: prev.primary_phone,
        contact_person_email: prev.primary_email
      }));
    }
  }, [useBusinessContactInfo, formData.primary_phone, formData.primary_email, customerType]);

  const validateForm = () => {
    const newErrors: FormErrors = {};

    // Required fields validation
    if (!formData.customer_name.trim()) {
      newErrors.customer_name = 'Customer/Business name is required';
    }

    // For B2B, contact person is required
    if (customerType === 'B2B' && !formData.contact_person.trim()) {
      newErrors.contact_person = 'Contact person name is required for B2B customers';
    }

    if (!formData.primary_phone.trim()) {
      newErrors.primary_phone = 'Phone number is required';
    }

    // Phone validation
    const phoneRegex = /^[6-9]\d{9}$/;
    if (formData.primary_phone && !phoneRegex.test(formData.primary_phone.replace(/\D/g, ''))) {
      newErrors.primary_phone = 'Enter valid 10-digit phone number';
    }

    if (formData.contact_person_phone && !phoneRegex.test(formData.contact_person_phone.replace(/\D/g, ''))) {
      newErrors.contact_person_phone = 'Enter valid 10-digit phone number';
    }

    if (formData.whatsapp_number && !phoneRegex.test(formData.whatsapp_number.replace(/\D/g, ''))) {
      newErrors.whatsapp_number = 'Enter valid 10-digit WhatsApp number';
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (formData.primary_email && !emailRegex.test(formData.primary_email)) {
      newErrors.primary_email = 'Enter valid email address';
    }

    if (formData.contact_person_email && !emailRegex.test(formData.contact_person_email)) {
      newErrors.contact_person_email = 'Enter valid email address';
    }

    // GST validation (optional but if provided should be valid)
    if (formData.gst_number) {
      const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
      if (!gstRegex.test(formData.gst_number)) {
        newErrors.gst_number = 'Enter valid GST number (15 characters)';
      }
    }

    // PAN validation (optional but if provided should be valid)
    if (formData.pan_number) {
      const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
      if (!panRegex.test(formData.pan_number)) {
        newErrors.pan_number = 'Enter valid PAN number';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field, value) => {
    if (field.startsWith('address.')) {
      const addressField = field.replace('address.', '');
      setFormData(prev => ({
        ...prev,
        address: {
          ...prev.address,
          [addressField]: value
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [field]: value
      }));
    }

    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };

  const handleCustomerTypeToggle = (type) => {
    setCustomerType(type);
    setFormData(prev => ({
      ...prev,
      customer_type: type === 'B2B' ? 'wholesale' : 'retail', // Map to backend values
      // Clear B2B specific fields when switching to B2C
      ...(type === 'B2C' ? {
        contact_person: '',
        contact_person_phone: '',
        contact_person_email: ''
      } : {})
    }));
    // Reset contact info copying when switching types
    setUseBusinessContactInfo(false);
  };

  const generateCustomerCode = () => {
    // Generate customer code based on business name
    const nameParts = formData.customer_name.trim().split(' ');
    const initials = nameParts.map(part => part.charAt(0).toUpperCase()).join('');
    const timestamp = Date.now().toString().slice(-4);
    return `${initials}${timestamp}`;
  };

  // Use optimistic offline hook
  const { saveCustomer: saveCustomerOffline } = useOfflineCustomers();

  const handleSubmit = async () => {
    if (!validateForm()) {
      toast.error('Please fix the validation errors');
      return;
    }

    setLoading(true);

    // Auto-fill WhatsApp number with primary phone if not provided
    const whatsappNumber = formData.whatsapp_number || formData.primary_phone;

    const customerData = {
      customer_name: formData.customer_name,
      customer_type: (customerType === 'B2B' ? 'wholesale' : 'b2c') as 'regular' | 'b2b' | 'b2c' | 'wholesale',
      primary_phone: formData.primary_phone.replace(/\D/g, ''),
      primary_email: formData.primary_email || undefined,
      whatsapp_number: whatsappNumber ? whatsappNumber.replace(/\D/g, '') : undefined,
      contact_person: formData.contact_person || undefined,
      contact_person_phone: formData.contact_person_phone ? formData.contact_person_phone.replace(/\D/g, '') : undefined,
      contact_person_email: formData.contact_person_email || undefined,
      gst_number: formData.gst_number || undefined,
      pan_number: formData.pan_number || undefined,
      drug_license_number: formData.drug_license_number || undefined,
      drug_license_validity: formData.drug_license_validity || undefined,
      business_type: formData.business_type || 'retail_pharmacy',
      billing_address: {
        street: formData.address.address_line1 || undefined,
        city: formData.address.city || undefined,
        state: formData.address.state || undefined,
        pincode: formData.address.pincode || undefined
      },
      credit_limit: formData.credit_limit ? Number(formData.credit_limit) : 0,
      credit_days: formData.credit_days ? Number(formData.credit_days) : 0,
      is_active: true
    };

    try {
      // OPTIMISTIC: Save customer (returns immediately!)
      const customerId = await saveCustomerOffline(customerData);

      // Show success immediately
      toast.success(`${customerType} customer created!`);

      // Call callback if provided
      if (onCustomerCreated) {
        onCustomerCreated({
          ...customerData,
          customer_id: customerId
        });
      }

      // Close modal immediately (user doesn't wait!)
      onClose();

    } catch (error) {
      console.error('Customer creation failed:', error);
      toast.error('Failed to create customer. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const clearMessage = () => setMessage('');

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl mx-4 max-h-[95vh] overflow-hidden transform transition-all animate-slide-up" ref={customerFormRef}>

        {/* Header */}
        <div className="bg-gradient-to-r from-green-50 to-blue-50 px-6 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-green-500 to-blue-500 rounded-xl shadow-lg">
                <User className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Create Customer</h2>
                <p className="text-gray-600 text-sm">Add new customer to your business</p>
              </div>
            </div>

            {/* B2B/B2C Toggle */}
            <div className="flex items-center gap-4">
              <div className="flex items-center bg-white rounded-lg p-1 shadow-sm border">
                <button
                  onClick={() => handleCustomerTypeToggle('B2B')}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${customerType === 'B2B'
                    ? 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  <Building2 className="w-3.5 h-3.5 inline mr-1.5" />
                  B2B Business
                </button>
                <button
                  onClick={() => handleCustomerTypeToggle('B2C')}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${customerType === 'B2C'
                    ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  <User className="w-3.5 h-3.5 inline mr-1.5" />
                  B2C Individual
                </button>
              </div>

              <button
                onClick={onClose}
                className="p-1.5 hover:bg-white/80 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
          </div>
        </div>

        {/* Content - Optimized Height */}
        <div className="p-6 max-h-[calc(95vh-120px)] overflow-y-auto">

          {/* Message Display */}
          {message && (
            <div className={`
              mb-4 p-3 rounded-lg flex items-start text-sm animate-slide-down
              ${messageType === 'success' ? 'bg-gray-50 text-green-700 border border-green-200' :
                messageType === 'error' ? 'bg-gray-50 text-red-700 border border-red-200' :
                  'bg-gray-50 text-blue-700 border border-blue-200'
              }
            `}>
              {messageType === 'success' && <CheckCircle className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" />}
              {messageType === 'error' && <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" />}
              <div className="flex-1 font-medium">{message}</div>
              <button onClick={clearMessage} className="ml-2 p-0.5 hover:bg-black/10 rounded transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="space-y-4">
            {/* Business Information Section */}
            <div className="border border-gray-200 p-4 rounded-lg">
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center">
                <Building2 className="w-4 h-4 mr-2 text-green-600" />
                Business Information
              </h3>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={formData.customer_name}
                      onChange={(e) => handleInputChange('customer_name', e.target.value)}
                      placeholder={customerType === 'B2B' ? 'Business/Company Name' : 'Full Name'}
                      className={`w-full pl-10 pr-3 py-2.5 text-sm border ${errors.customer_name ? 'border-red-300' : 'border-gray-200'
                        } rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white`}
                    />
                  </div>
                  <select
                    value={formData.business_type}
                    onChange={(e) => handleInputChange('business_type', e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 bg-white"
                  >
                    <option value="">{customerType === 'B2B' ? 'Select Business Type' : 'Customer Category'}</option>
                    {customerType === 'B2B' ? (
                      <>
                        <option value="Pharmacy">Pharmacy</option>
                        <option value="Hospital">Hospital</option>
                        <option value="Clinic">Clinic</option>
                        <option value="Distributor">Distributor</option>
                        <option value="Wholesaler">Wholesaler</option>
                        <option value="Medical Store">Medical Store</option>
                      </>
                    ) : (
                      <>
                        <option value="Individual">Individual Customer</option>
                        <option value="Consumer">Consumer</option>
                        <option value="Walk-in">Walk-in Customer</option>
                        <option value="Regular">Regular Customer</option>
                      </>
                    )}
                  </select>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="tel"
                      value={formData.primary_phone}
                      onChange={(e) => handleInputChange('primary_phone', e.target.value)}
                      placeholder="Primary Phone Number"
                      className={`w-full pl-10 pr-3 py-2.5 text-sm border ${errors.primary_phone ? 'border-red-300' : 'border-gray-200'
                        } rounded-lg focus:ring-2 focus:ring-green-500 bg-white`}
                    />
                  </div>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="email"
                      value={formData.primary_email}
                      onChange={(e) => handleInputChange('primary_email', e.target.value)}
                      placeholder="Email Address"
                      className={`w-full pl-10 pr-3 py-2.5 text-sm border ${errors.primary_email ? 'border-red-300' : 'border-gray-200'
                        } rounded-lg focus:ring-2 focus:ring-green-500 bg-white`}
                    />
                  </div>
                  <div className="relative">
                    <MessageCircle className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="tel"
                      value={formData.whatsapp_number}
                      onChange={(e) => handleInputChange('whatsapp_number', e.target.value)}
                      placeholder="WhatsApp (defaults to primary phone)"
                      className={`w-full pl-10 pr-3 py-2.5 text-sm border ${errors.whatsapp_number ? 'border-red-300' : 'border-gray-200'
                        } rounded-lg focus:ring-2 focus:ring-green-500 bg-white`}
                    />
                  </div>
                </div>
              </div>
            </div>
            {/* Contact Person - B2B Only */}
            {customerType === 'B2B' && (
              <div className="border border-gray-200 p-4 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900 flex items-center">
                    <User className="w-4 h-4 mr-2 text-purple-600" />
                    Contact Person Details
                  </h3>
                  <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useBusinessContactInfo}
                      onChange={(e) => setUseBusinessContactInfo(e.target.checked)}
                      className="w-4 h-4 text-gray-600 rounded"
                    />
                    Same as business
                  </label>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={formData.contact_person}
                      onChange={(e) => handleInputChange('contact_person', e.target.value)}
                      placeholder="Contact Person Name"
                      className={`w-full pl-10 pr-3 py-2.5 text-sm border ${errors.contact_person ? 'border-red-300' : 'border-gray-200'
                        } rounded-lg focus:ring-2 focus:ring-green-500 bg-white`}
                    />
                  </div>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="tel"
                      value={formData.contact_person_phone}
                      onChange={(e) => handleInputChange('contact_person_phone', e.target.value)}
                      placeholder="Contact Phone"
                      disabled={useBusinessContactInfo}
                      className={`w-full pl-10 pr-3 py-2.5 text-sm border ${errors.contact_person_phone ? 'border-red-300' : 'border-gray-200'
                        } rounded-lg focus:ring-2 focus:ring-green-500 ${useBusinessContactInfo ? 'bg-gray-100' : 'bg-white'
                        }`}
                    />
                  </div>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="email"
                      value={formData.contact_person_email}
                      onChange={(e) => handleInputChange('contact_person_email', e.target.value)}
                      placeholder="Contact Email"
                      disabled={useBusinessContactInfo}
                      className={`w-full pl-10 pr-3 py-2.5 text-sm border ${errors.contact_person_email ? 'border-red-300' : 'border-gray-200'
                        } rounded-lg focus:ring-2 focus:ring-green-500 ${useBusinessContactInfo ? 'bg-gray-100' : 'bg-white'
                        }`}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Address Section */}
            <div className="border border-gray-200 p-4 rounded-lg">
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center">
                <MapPin className="w-4 h-4 mr-2 text-orange-600" />
                Address Information
              </h3>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={formData.address.address_line1}
                    onChange={(e) => handleInputChange('address.address_line1', e.target.value)}
                    placeholder="Address Line 1"
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 bg-white"
                  />
                  <input
                    type="text"
                    value={formData.address.address_line2}
                    onChange={(e) => handleInputChange('address.address_line2', e.target.value)}
                    placeholder="Address Line 2 (Optional)"
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 bg-white"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <input
                    type="text"
                    value={formData.address.city}
                    onChange={(e) => handleInputChange('address.city', e.target.value)}
                    placeholder="City"
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 bg-white"
                  />
                  <input
                    type="text"
                    value={formData.address.state}
                    onChange={(e) => handleInputChange('address.state', e.target.value)}
                    placeholder="State"
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 bg-white"
                  />
                  <input
                    type="text"
                    value={formData.address.pincode}
                    onChange={(e) => handleInputChange('address.pincode', e.target.value)}
                    placeholder="Pincode"
                    maxLength={6}
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 bg-white"
                  />
                </div>
              </div>
            </div>

            {/* Compliance & Licensing - B2B Only */}
            {customerType === 'B2B' && (
              <div className="border border-gray-200 p-4 rounded-lg">
                <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center">
                  <Shield className="w-4 h-4 mr-2 text-red-600" />
                  Compliance & Licensing
                </h3>
                <div className="grid grid-cols-4 gap-3">
                  <input
                    type="text"
                    value={formData.gst_number}
                    onChange={(e) => handleInputChange('gst_number', e.target.value.toUpperCase())}
                    placeholder="GST Number"
                    maxLength={15}
                    className={`w-full px-3 py-2.5 text-sm border ${errors.gst_number ? 'border-red-300' : 'border-gray-200'
                      } rounded-lg focus:ring-2 focus:ring-green-500 bg-white`}
                  />
                  <input
                    type="text"
                    value={formData.pan_number}
                    onChange={(e) => handleInputChange('pan_number', e.target.value.toUpperCase())}
                    placeholder="PAN Number"
                    maxLength={10}
                    className={`w-full px-3 py-2.5 text-sm border ${errors.pan_number ? 'border-red-300' : 'border-gray-200'
                      } rounded-lg focus:ring-2 focus:ring-green-500 bg-white`}
                  />
                  <input
                    type="text"
                    value={formData.drug_license_number}
                    onChange={(e) => handleInputChange('drug_license_number', e.target.value)}
                    placeholder="Drug License Number"
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 bg-white"
                  />
                  <div className="relative">
                    <input
                      type="date"
                      value={formData.drug_license_validity}
                      onChange={(e) => handleInputChange('drug_license_validity', e.target.value)}
                      title="Drug License Validity Date"
                      className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 bg-white"
                    />
                    <label className="absolute -top-2 left-2 px-1 bg-white text-xs text-gray-600">
                      License Valid Until
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Credit Terms - B2B Only */}
            {customerType === 'B2B' && (
              <div className="border border-gray-200 p-4 rounded-lg">
                <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center">
                  <CreditCard className="w-4 h-4 mr-2 text-indigo-600" />
                  Credit Terms
                </h3>
                <div className="grid grid-cols-4 gap-3">
                  <input
                    type="number"
                    value={formData.credit_limit}
                    onChange={(e) => handleInputChange('credit_limit', e.target.value)}
                    placeholder="Credit Limit (₹)"
                    min="0"
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 bg-white"
                  />
                  <select
                    value={formData.credit_days}
                    onChange={(e) => handleInputChange('credit_days', e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 bg-white"
                    title="Credit Days"
                  >
                    <option value="0">Cash Only</option>
                    <option value="15">15 Days</option>
                    <option value="30">30 Days</option>
                    <option value="45">45 Days</option>
                    <option value="60">60 Days</option>
                    <option value="90">90 Days</option>
                  </select>
                  <select
                    value={formData.credit_rating}
                    onChange={(e) => handleInputChange('credit_rating', e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 bg-white"
                    title="Credit Rating"
                  >
                    <option value="A">A - Excellent</option>
                    <option value="B">B - Good</option>
                    <option value="C">C - Fair</option>
                    <option value="D">D - Poor</option>
                  </select>
                  <select
                    value={formData.payment_terms}
                    onChange={(e) => handleInputChange('payment_terms', e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 bg-white"
                    title="Payment Terms"
                  >
                    <option value="Cash">Cash</option>
                    <option value="Credit">Credit</option>
                    <option value="Advance">Advance</option>
                    <option value="COD">Cash on Delivery</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-t border-gray-200">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              <span className="font-medium">Type:</span> {customerType}
              {customerType === 'B2B' && formData.contact_person && (
                <span className="ml-3">
                  <span className="font-medium">Contact:</span> {formData.contact_person}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 font-medium text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="px-5 py-2 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg hover:from-green-700 hover:to-green-800 transition-all disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed flex items-center gap-2 font-medium text-sm shadow-lg"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Creating...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Create {customerType}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomerCreationB2B;