import React, { useState, useEffect } from 'react';
import { Building2, User, Phone, Mail, Save, X, AlertCircle, CheckCircle, MapPin, Shield, MessageCircle, FileText, CreditCard, ToggleLeft, ToggleRight, Check } from 'lucide-react';
import { customersApi } from '../../../../services/api/modules/customers.api';
import offlineStorage from '../../../../services/offlineStorage';

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
  const [selectedCreditPlan, setSelectedCreditPlan] = useState('custom');
  const [creditPlans, setCreditPlans] = useState([]);

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
    contact_person_name: '',
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

  const [errors, setErrors] = useState({});

  // Load credit plans on component mount (backend + offline cache)
  useEffect(() => {
    const loadCreditPlans = async () => {
      try {
        // Try backend first
        if (customersApi?.getCreditPlans) {
          const response = await customersApi.getCreditPlans();
          const plans = response.data || [];
          if (Array.isArray(plans) && plans.length > 0) {
            setCreditPlans(plans);
            await offlineStorage.storeOffline('credit_plans', plans, { persistent: true });
            return;
          }
        }
        // Fallback to offline cache
        const offline = await offlineStorage.getOffline('credit_plans', { persistent: true });
        if (offline && Array.isArray(offline.data) && offline.data.length > 0) {
          setCreditPlans(offline.data);
        } else {
          setMessage('Unable to load credit plans. Please configure in backend.');
          setMessageType('error');
        }
      } catch (error) {
        // Final fallback to offline cache
        const offline = await offlineStorage.getOffline('credit_plans', { persistent: true });
        if (offline && Array.isArray(offline.data) && offline.data.length > 0) {
          setCreditPlans(offline.data);
        } else {
          console.error('Error loading credit plans:', error);
          setMessage('Failed to load credit plans');
          setMessageType('error');
        }
      }
    };

    loadCreditPlans();
  }, []);

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
    const newErrors = {};
    
    // Required fields validation
    if (!formData.customer_name.trim()) {
      newErrors.customer_name = 'Customer/Business name is required';
    }
    
    // For B2B, contact person is required
    if (customerType === 'B2B' && !formData.contact_person_name.trim()) {
      newErrors.contact_person_name = 'Contact person name is required for B2B customers';
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
        contact_person_name: '',
        contact_person_phone: '',
        contact_person_email: ''
      } : {})
    }));
    // Reset contact info copying when switching types
    setUseBusinessContactInfo(false);
  };

  const handleCreditPlanChange = (planId) => {
    setSelectedCreditPlan(planId);
    
    if (planId !== 'custom') {
      const plan = creditPlans.find(p => p.id === planId || p.plan_id === planId);
      if (plan) {
        setFormData(prev => ({
          ...prev,
          credit_limit: plan.credit_limit,
          credit_days: plan.credit_days,
          credit_rating: plan.credit_rating,
          payment_terms: plan.payment_terms,
          customer_category: plan.customer_category
        }));
      }
    }
  };

  const generateCustomerCode = () => {
    // Generate customer code based on business name
    const nameParts = formData.customer_name.trim().split(' ');
    const initials = nameParts.map(part => part.charAt(0).toUpperCase()).join('');
    const timestamp = Date.now().toString().slice(-4);
    return `${initials}${timestamp}`;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      setMessage('Please fix the validation errors');
      setMessageType('error');
      return;
    }

    setLoading(true);
    setMessage('');

    const customerData = {
        org_id: localStorage.getItem('org_id') || 'ad808530-1ddb-4377-ab20-67bef145d80d',
        customer_name: formData.customer_name,
        customer_type: customerType === 'B2B' ? 'wholesale' : 'retail', // Map to backend validation values
        primary_phone: formData.primary_phone.replace(/\D/g, ''),
        email: formData.primary_email || null, // Backend expects 'email' not 'primary_email'
        secondary_phone: formData.whatsapp_number ? formData.whatsapp_number.replace(/\D/g, '') : null,
        contact_person: formData.contact_person_name || null, // Backend expects 'contact_person' not 'contact_person_name'
        gstin: formData.gst_number || null, // Backend expects 'gstin' not 'gst_number'
        pan_number: formData.pan_number || null,
        drug_license_number: formData.drug_license_number || null,
        credit_limit: formData.credit_limit ? parseFloat(formData.credit_limit) : 50000,
        credit_days: formData.credit_days ? parseInt(formData.credit_days) : 30,
        notes: `${customerType} customer. Business Type: ${formData.business_type || 'Not specified'}`,
        is_active: true
      };

    try {
      // If offline, queue operation and exit gracefully
      if (!navigator.onLine) {
        offlineStorage.queueOfflineOperation({
          type: 'CREATE_CUSTOMER',
          endpoint: 'customers.create',
          payload: customerData,
          priority: 'high'
        });
        setMessage('Offline: Customer creation queued. It will sync automatically when online.');
        setMessageType('success');
        setLoading(false);
        return;
      }

      const response = await customersApi.create(customerData);
      
      if (response.data) {
        setMessage(`${customerType} Customer created successfully!`);
        setMessageType('success');
        
        // Call the callback with the created customer
        if (onCustomerCreated) {
          const createdCustomer = {
            customer_id: response.data.customer_id || response.data.id,
            customer_name: customerData.customer_name,
            contact_person_name: customerData.contact_person_name,
            primary_phone: customerData.primary_phone,
            customer_type: 'B2B',
            ...response.data
          };
          onCustomerCreated(createdCustomer);
        }
        
        // Close modal after 1.5 seconds
        setTimeout(() => {
          onClose();
        }, 1500);
      }
    } catch (error) {
      console.error('Error creating B2B customer:', error);
      
      // Queue on server error/network issues as well
      offlineStorage.queueOfflineOperation({
        type: 'CREATE_CUSTOMER',
        endpoint: 'customers.create',
        payload: customerData,
        priority: 'high'
      });
      
      setMessage('Network issue: Saved locally and queued for sync.');
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  const clearMessage = () => setMessage('');

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl mx-4 max-h-[90vh] overflow-hidden transform transition-all animate-slide-up">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-green-50 to-blue-50 px-8 py-6 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-green-500 to-blue-500 rounded-2xl shadow-lg">
                <User className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Create Customer</h2>
                <p className="text-gray-600 mt-1">Add new customer to your business</p>
              </div>
            </div>
            
            {/* B2B/B2C Toggle */}
            <div className="flex items-center gap-6">
              <div className="flex items-center bg-white rounded-xl p-1 shadow-sm border">
                <button
                  onClick={() => handleCustomerTypeToggle('B2B')}
                  className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${
                    customerType === 'B2B'
                      ? 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Building2 className="w-4 h-4 inline mr-2" />
                  B2B Business
                </button>
                <button
                  onClick={() => handleCustomerTypeToggle('B2C')}
                  className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${
                    customerType === 'B2C'
                      ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <User className="w-4 h-4 inline mr-2" />
                  B2C Individual
                </button>
              </div>
              
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/80 rounded-xl transition-colors"
              >
                <X className="w-6 h-6 text-gray-500" />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-8 max-h-[75vh] overflow-y-auto">
          
          {/* Message Display */}
          {message && (
            <div className={`
              mb-6 p-4 rounded-xl flex items-start text-sm animate-slide-down
              ${messageType === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 
                messageType === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 
                'bg-blue-50 text-blue-700 border border-blue-200'
              }
            `}>
              {messageType === 'success' && <CheckCircle className="w-5 h-5 mr-3 flex-shrink-0 mt-0.5" />}
              {messageType === 'error' && <AlertCircle className="w-5 h-5 mr-3 flex-shrink-0 mt-0.5" />}
              <div className="flex-1 font-medium">{message}</div>
              <button onClick={clearMessage} className="ml-3 p-1 hover:bg-black/10 rounded-lg transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Basic Information Section */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <User className="w-5 h-5 mr-2 text-green-600" />
              Basic Information
            </h3>
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={formData.customer_name}
                    onChange={(e) => handleInputChange('customer_name', e.target.value)}
                    placeholder={customerType === 'B2B' ? 'Business/Party Name' : 'Customer Name'}
                    className={`w-full pl-11 pr-3 py-3 border ${
                      errors.customer_name ? 'border-red-300' : 'border-gray-200'
                    } rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all`}
                  />
                  {errors.customer_name && (
                    <p className="mt-1 text-sm text-red-600">{errors.customer_name}</p>
                  )}
                </div>

                <div>
                  <select
                    value={formData.business_type}
                    onChange={(e) => handleInputChange('business_type', e.target.value)}
                    className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
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
                        <option value="Nursing Home">Nursing Home</option>
                        <option value="Other Business">Other Business</option>
                      </>
                    ) : (
                      <>
                        <option value="Individual">Individual Customer</option>
                        <option value="Consumer">Consumer</option>
                        <option value="Walk-in">Walk-in Customer</option>
                        <option value="Regular">Regular Customer</option>
                        <option value="Other">Other</option>
                      </>
                    )}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Contact Information Section */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Phone className="w-5 h-5 mr-2 text-blue-600" />
              Contact Information
            </h3>
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="tel"
                    value={formData.primary_phone}
                    onChange={(e) => handleInputChange('primary_phone', e.target.value)}
                    placeholder="Primary Phone Number"
                    className={`w-full pl-11 pr-3 py-3 border ${
                      errors.primary_phone ? 'border-red-300' : 'border-gray-200'
                    } rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all`}
                  />
                  {errors.primary_phone && (
                    <p className="mt-1 text-sm text-red-600">{errors.primary_phone}</p>
                  )}
                </div>

                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="email"
                    value={formData.primary_email}
                    onChange={(e) => handleInputChange('primary_email', e.target.value)}
                    placeholder="Primary Email Address"
                    className={`w-full pl-11 pr-3 py-3 border ${
                      errors.primary_email ? 'border-red-300' : 'border-gray-200'
                    } rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all`}
                  />
                  {errors.primary_email && (
                    <p className="mt-1 text-sm text-red-600">{errors.primary_email}</p>
                  )}
                </div>

                <div className="relative">
                  <MessageCircle className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="tel"
                    value={formData.whatsapp_number}
                    onChange={(e) => handleInputChange('whatsapp_number', e.target.value)}
                    placeholder="WhatsApp Number"
                    className={`w-full pl-11 pr-3 py-3 border ${
                      errors.whatsapp_number ? 'border-red-300' : 'border-gray-200'
                    } rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all`}
                  />
                  {errors.whatsapp_number && (
                    <p className="mt-1 text-sm text-red-600">{errors.whatsapp_number}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* B2B Contact Person Section - Only show for B2B */}
          {customerType === 'B2B' && (
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <User className="w-5 h-5 mr-2 text-purple-600" />
                  Contact Person Details
                </h3>
                
                {/* Checkbox to copy business contact info */}
                <div className="flex items-center gap-2">
                  <input
                    id="copyBusinessContact"
                    type="checkbox"
                    checked={useBusinessContactInfo}
                    onChange={(e) => setUseBusinessContactInfo(e.target.checked)}
                    className="w-4 h-4 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500 focus:ring-2"
                  />
                  <label htmlFor="copyBusinessContact" className="text-sm text-gray-600 select-none cursor-pointer">
                    Use same as business contact info
                  </label>
                </div>
              </div>
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={formData.contact_person_name}
                      onChange={(e) => handleInputChange('contact_person_name', e.target.value)}
                      placeholder="Contact Person Name"
                      className={`w-full pl-11 pr-3 py-3 border ${
                        errors.contact_person_name ? 'border-red-300' : 'border-gray-200'
                      } rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all`}
                    />
                    {errors.contact_person_name && (
                      <p className="mt-1 text-sm text-red-600">{errors.contact_person_name}</p>
                    )}
                  </div>

                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="tel"
                      value={formData.contact_person_phone}
                      onChange={(e) => handleInputChange('contact_person_phone', e.target.value)}
                      placeholder="Contact Person Phone"
                      disabled={useBusinessContactInfo}
                      className={`w-full pl-11 pr-3 py-3 border ${
                        errors.contact_person_phone ? 'border-red-300' : 'border-gray-200'
                      } rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all ${
                        useBusinessContactInfo ? 'bg-gray-100 text-gray-500' : ''
                      }`}
                    />
                    {errors.contact_person_phone && (
                      <p className="mt-1 text-sm text-red-600">{errors.contact_person_phone}</p>
                    )}
                  </div>

                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="email"
                      value={formData.contact_person_email}
                      onChange={(e) => handleInputChange('contact_person_email', e.target.value)}
                      placeholder="Contact Person Email"
                      disabled={useBusinessContactInfo}
                      className={`w-full pl-11 pr-3 py-3 border ${
                        errors.contact_person_email ? 'border-red-300' : 'border-gray-200'
                      } rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all ${
                        useBusinessContactInfo ? 'bg-gray-100 text-gray-500' : ''
                      }`}
                    />
                    {errors.contact_person_email && (
                      <p className="mt-1 text-sm text-red-600">{errors.contact_person_email}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Address Information Section */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <MapPin className="w-5 h-5 mr-2 text-orange-600" />
              Address Information
            </h3>
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={formData.address.address_line1}
                    onChange={(e) => handleInputChange('address.address_line1', e.target.value)}
                    placeholder="Address Line 1"
                    className="w-full pl-11 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <input
                    type="text"
                    value={formData.address.address_line2}
                    onChange={(e) => handleInputChange('address.address_line2', e.target.value)}
                    placeholder="Address Line 2 (Optional)"
                    className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <input
                    type="text"
                    value={formData.address.city}
                    onChange={(e) => handleInputChange('address.city', e.target.value)}
                    placeholder="City"
                    className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <input
                    type="text"
                    value={formData.address.state}
                    onChange={(e) => handleInputChange('address.state', e.target.value)}
                    placeholder="State"
                    className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <input
                    type="text"
                    value={formData.address.pincode}
                    onChange={(e) => handleInputChange('address.pincode', e.target.value)}
                    placeholder="Pincode"
                    maxLength={6}
                    className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Compliance & Licensing Section - Only for B2B */}
          {customerType === 'B2B' && (
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <Shield className="w-5 h-5 mr-2 text-red-600" />
                Compliance & Licensing
              </h3>
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="relative">
                  <Shield className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={formData.gst_number}
                    onChange={(e) => handleInputChange('gst_number', e.target.value.toUpperCase())}
                    placeholder="GST Number"
                    maxLength={15}
                    className={`w-full pl-11 pr-3 py-3 border ${
                      errors.gst_number ? 'border-red-300' : 'border-gray-200'
                    } rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all`}
                  />
                  {errors.gst_number && (
                    <p className="mt-1 text-sm text-red-600">{errors.gst_number}</p>
                  )}
                </div>

                <div className="relative">
                  <FileText className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={formData.pan_number}
                    onChange={(e) => handleInputChange('pan_number', e.target.value.toUpperCase())}
                    placeholder="PAN Number"
                    maxLength={10}
                    className={`w-full pl-11 pr-3 py-3 border ${
                      errors.pan_number ? 'border-red-300' : 'border-gray-200'
                    } rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all`}
                  />
                  {errors.pan_number && (
                    <p className="mt-1 text-sm text-red-600">{errors.pan_number}</p>
                  )}
                </div>

                <div className="relative">
                  <FileText className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={formData.drug_license_number}
                    onChange={(e) => handleInputChange('drug_license_number', e.target.value)}
                    placeholder="Drug License Number"
                    className="w-full pl-11 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <input
                    type="date"
                    value={formData.drug_license_validity}
                    onChange={(e) => handleInputChange('drug_license_validity', e.target.value)}
                    className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                  />
                  <p className="text-xs text-gray-500 mt-1">Drug License Validity</p>
                </div>
              </div>
            </div>
          </div>
          )}

          {/* Credit Terms Section - Only for B2B */}
          {customerType === 'B2B' && (
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <CreditCard className="w-5 h-5 mr-2 text-indigo-600" />
                Credit Terms
              </h3>
            <div className="space-y-6">
              {/* Credit Plan Selection - Compact Dropdown */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Credit Plan</label>
                <select
                  value={selectedCreditPlan}
                  onChange={(e) => handleCreditPlanChange(e.target.value)}
                  className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                >
                  {creditPlans.map((plan) => (
                    <option key={plan.id || plan.plan_id} value={plan.id || plan.plan_id}>
                      {plan.name} - ₹{(plan.credit_limit / 1000)}K credit, {plan.credit_days} days
                    </option>
                  ))}
                  <option value="custom">Custom - Manual Entry</option>
                </select>
              </div>

              {/* Credit Details - Editable when Custom is selected */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text_sm font-medium text-gray-700 mb-1">Credit Limit (₹)</label>
                  <input
                    type="number"
                    value={formData.credit_limit}
                    onChange={(e) => {
                      handleInputChange('credit_limit', e.target.value);
                      if (selectedCreditPlan !== 'custom') setSelectedCreditPlan('custom');
                    }}
                    placeholder="Credit Limit"
                    min="0"
                    className={`w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all ${
                      selectedCreditPlan !== 'custom' ? 'bg-gray-100' : ''
                    }`}
                    readOnly={selectedCreditPlan !== 'custom'}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Credit Days</label>
                  <select
                    value={formData.credit_days}
                    onChange={(e) => {
                      handleInputChange('credit_days', e.target.value);
                      if (selectedCreditPlan !== 'custom') setSelectedCreditPlan('custom');
                    }}
                    className={`w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all ${
                      selectedCreditPlan !== 'custom' ? 'bg-gray-100' : ''
                    }`}
                    disabled={selectedCreditPlan !== 'custom'}
                  >
                    <option value="0">Cash Only</option>
                    <option value="15">15 Days</option>
                    <option value="30">30 Days</option>
                    <option value="45">45 Days</option>
                    <option value="60">60 Days</option>
                    <option value="90">90 Days</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Credit Rating</label>
                  <select
                    value={formData.credit_rating}
                    onChange={(e) => {
                      handleInputChange('credit_rating', e.target.value);
                      if (selectedCreditPlan !== 'custom') setSelectedCreditPlan('custom');
                    }}
                    className={`w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all ${
                      selectedCreditPlan !== 'custom' ? 'bg-gray-100' : ''
                    }`}
                    disabled={selectedCreditPlan !== 'custom'}
                  >
                    <option value="A">A - Excellent</option>
                    <option value="B">B - Good</option>
                    <option value="C">C - Fair</option>
                    <option value="D">D - Poor</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Terms</label>
                <select
                  value={formData.payment_terms}
                  onChange={(e) => {
                    handleInputChange('payment_terms', e.target.value);
                    if (selectedCreditPlan !== 'custom') setSelectedCreditPlan('custom');
                  }}
                  className={`w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all ${
                    selectedCreditPlan !== 'custom' ? 'bg-gray-100' : ''
                  }`}
                  disabled={selectedCreditPlan !== 'custom'}
                >
                  <option value="Cash">Cash</option>
                  <option value="Credit">Credit</option>
                  <option value="Advance">Advance</option>
                  <option value="COD">Cash on Delivery</option>
                </select>
              </div>
              
              {selectedCreditPlan !== 'custom' && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-sm text-green-700">
                    <span className="font-medium">Selected Plan:</span> {creditPlans.find(p => (p.id || p.plan_id) === selectedCreditPlan)?.name} 
                    - ₹{formData.credit_limit?.toLocaleString()} credit limit with {formData.credit_days} days payment terms
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-8 py-6 border-t border-gray-200">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              <span className="font-medium">Customer Type:</span> {customerType}
              {customerType === 'B2B' && formData.contact_person_name && (
                <span className="ml-4">
                  <span className="font-medium">Contact:</span> {formData.contact_person_name}
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-4">
              <button
                onClick={onClose}
                disabled={loading}
                className="px-6 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="px-8 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-xl hover:from-green-700 hover:to-green-800 transition-all disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed flex items-center gap-3 font-medium shadow-lg"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    Creating {customerType} Customer...
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    Create {customerType} Customer
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
