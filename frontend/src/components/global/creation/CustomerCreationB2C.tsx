import React, { useState } from 'react';
import { User, Phone, Mail, Save, X, AlertCircle, CheckCircle, MapPin, MessageCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { customersApi } from '../../../services/api';
import offlineStorage from '../../../services/offlineStorage';

interface CustomerCreationB2CProps {
  onClose: () => void;
  onCustomerCreated?: (customer: any) => void;
}

interface FormErrors {
  customer_name?: string;
  primary_phone?: string;
  primary_email?: string;
  whatsapp_number?: string;
  [key: string]: string | undefined;
}

/**
 * B2C Customer Creation Component
 * 
 * Purpose: Simplified customer creation for RETAIL businesses
 * Used when: Organization is configured for B2C/Retail operations
 * 
 * Features:
 * - Minimal fields (no business compliance)
 * - No credit terms (typically cash/immediate payment)
 * - Simple customer categories
 * - Focus on individual customer data
 * 
 * This component is used when:
 * - org.business_type === 'retail' or 'b2c'
 * - System is configured for walk-in/retail customers
 */
const CustomerCreationB2C: React.FC<CustomerCreationB2CProps> = ({ onClose, onCustomerCreated }) => {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [showAddressSection, setShowAddressSection] = useState(false);

  const [formData, setFormData] = useState({
    // Basic Details
    customer_name: '',
    customer_type: 'retail', // Always retail for B2C
    customer_category: 'walk-in', // walk-in, regular, vip

    // Contact Information
    primary_phone: '',
    primary_email: '',
    whatsapp_number: '',

    // Address Information (Optional for B2C)
    address: {
      address_line1: '',
      address_line2: '',
      city: '',
      state: '',
      pincode: ''
    },

    // B2C Specific
    date_of_birth: '',
    anniversary_date: '',

    // Status
    is_active: true
  });

  const [errors, setErrors] = useState<FormErrors>({});

  const validateForm = () => {
    const newErrors: FormErrors = {};

    // Only name and phone are required for B2C
    if (!formData.customer_name.trim()) {
      newErrors.customer_name = 'Customer name is required';
    }

    if (!formData.primary_phone.trim()) {
      newErrors.primary_phone = 'Phone number is required';
    }

    // Phone validation (Indian format)
    const phoneRegex = /^[6-9]\d{9}$/;
    if (formData.primary_phone && !phoneRegex.test(formData.primary_phone.replace(/\D/g, ''))) {
      newErrors.primary_phone = 'Enter valid 10-digit phone number';
    }

    if (formData.whatsapp_number && !phoneRegex.test(formData.whatsapp_number.replace(/\D/g, ''))) {
      newErrors.whatsapp_number = 'Enter valid 10-digit WhatsApp number';
    }

    // Email validation (optional)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (formData.primary_email && !emailRegex.test(formData.primary_email)) {
      newErrors.primary_email = 'Enter valid email address';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field: string, value: string) => {
    if (field.startsWith('address.')) {
      const addressField = field.replace('address.', '');
      setFormData(prev => ({
        ...prev,
        address: {
          ...prev.address,
          [addressField]: value
        }
      }));
      // Auto-expand address section if user starts typing address
      if (value && !showAddressSection) {
        setShowAddressSection(true);
      }
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

  const handleSubmit = async () => {
    if (!validateForm()) {
      setMessage('Please fix the validation errors');
      setMessageType('error');
      return;
    }

    setLoading(true);
    setMessage('');

    const customerData = {
      // org_id comes from auth token, not request body
      customer_name: formData.customer_name,
      customer_type: 'retail', // Always retail for B2C
      primary_phone: formData.primary_phone.replace(/\D/g, ''),
      email: formData.primary_email || null,
      secondary_phone: formData.whatsapp_number ? formData.whatsapp_number.replace(/\D/g, '') : null,

      // B2C customers typically have immediate payment terms
      credit_limit: 0,
      credit_days: 0,
      credit_rating: 'A', // Good by default for B2C

      // Address (optional - for future deliveries)
      ...(formData.address.address_line1 && {
        address_line1: formData.address.address_line1,
        address_line2: formData.address.address_line2 || null,
        city: formData.address.city || null,
        state: formData.address.state || null,
        pincode: formData.address.pincode || null
      }),

      // Additional B2C fields
      date_of_birth: formData.date_of_birth || null,
      anniversary_date: formData.anniversary_date || null,
      customer_category: formData.customer_category,

      notes: `B2C Customer - ${formData.customer_category}`,
      is_active: true
    };

    try {
      // If offline, queue operation
      if (!navigator.onLine) {
        offlineStorage.queueOfflineOperation({
          type: 'CREATE_CUSTOMER',
          endpoint: 'customers.create',
          payload: customerData,
          priority: 'high'
        });
        setMessage('Offline: Customer creation queued. Will sync when online.');
        setMessageType('success');
        setLoading(false);
        setTimeout(() => onClose(), 1500);
        return;
      }

      const response = await customersApi.create(customerData);

      if (response.data) {
        const hasAddress = formData.address.address_line1;
        setMessage(`Customer created successfully!${hasAddress ? ' Address saved for future deliveries.' : ''}`);
        setMessageType('success');

        // Call the callback with the created customer
        if (onCustomerCreated) {
          const createdCustomer = {
            customer_id: response.data.customer_id || response.data.id,
            customer_name: customerData.customer_name,
            primary_phone: customerData.primary_phone,
            customer_type: 'retail',
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

      // Queue on error as well
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] overflow-hidden transform transition-all animate-slide-up">

        {/* Header - Simplified for B2C */}
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 px-6 py-5 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-br from-blue-500 to-purple-500 rounded-xl shadow-md">
                <User className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Add Customer</h2>
                <p className="text-sm text-gray-600 mt-0.5">Quick customer registration</p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 hover:bg-white/80 rounded-xl transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Content - Simplified for B2C */}
        <div className="p-6 max-h-[65vh] overflow-y-auto">

          {/* Message Display */}
          {message && (
            <div className={`
              mb-4 p-3 rounded-xl flex items-start text-sm animate-slide-down
              ${messageType === 'success' ? 'bg-green-50 text-green-700 border border-green-200' :
                messageType === 'error' ? 'bg-red-50 text-red-700 border border-red-200' :
                  'bg-blue-50 text-blue-700 border border-blue-200'
              }
            `}>
              {messageType === 'success' && <CheckCircle className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" />}
              {messageType === 'error' && <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" />}
              <div className="flex-1">{message}</div>
              <button onClick={clearMessage} className="ml-2 p-0.5 hover:bg-black/10 rounded">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Basic Information */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wider">
              Customer Information
            </h3>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Full Name *
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={formData.customer_name}
                      onChange={(e) => handleInputChange('customer_name', e.target.value)}
                      placeholder="Enter customer name"
                      className={`w-full pl-10 pr-3 py-2.5 border ${errors.customer_name ? 'border-red-300' : 'border-gray-200'
                        } rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm`}
                    />
                    {errors.customer_name && (
                      <p className="mt-1 text-xs text-red-600">{errors.customer_name}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Customer Type
                  </label>
                  <select
                    value={formData.customer_category}
                    onChange={(e) => handleInputChange('customer_category', e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm"
                  >
                    <option value="walk-in">Walk-in Customer</option>
                    <option value="regular">Regular Customer</option>
                    <option value="vip">VIP Customer</option>
                    <option value="online">Online Customer</option>
                  </select>
                </div>
              </div>

              {/* Contact Information */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Phone Number *
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="tel"
                      value={formData.primary_phone}
                      onChange={(e) => handleInputChange('primary_phone', e.target.value)}
                      placeholder="10-digit number"
                      className={`w-full pl-10 pr-3 py-2.5 border ${errors.primary_phone ? 'border-red-300' : 'border-gray-200'
                        } rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm`}
                    />
                    {errors.primary_phone && (
                      <p className="mt-1 text-xs text-red-600">{errors.primary_phone}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Email (Optional)
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="email"
                      value={formData.primary_email}
                      onChange={(e) => handleInputChange('primary_email', e.target.value)}
                      placeholder="email@example.com"
                      className={`w-full pl-10 pr-3 py-2.5 border ${errors.primary_email ? 'border-red-300' : 'border-gray-200'
                        } rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm`}
                    />
                    {errors.primary_email && (
                      <p className="mt-1 text-xs text-red-600">{errors.primary_email}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    WhatsApp (Optional)
                  </label>
                  <div className="relative">
                    <MessageCircle className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="tel"
                      value={formData.whatsapp_number}
                      onChange={(e) => handleInputChange('whatsapp_number', e.target.value)}
                      placeholder="WhatsApp number"
                      className={`w-full pl-10 pr-3 py-2.5 border ${errors.whatsapp_number ? 'border-red-300' : 'border-gray-200'
                        } rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm`}
                    />
                    {errors.whatsapp_number && (
                      <p className="mt-1 text-xs text-red-600">{errors.whatsapp_number}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Special Dates (Optional) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Date of Birth (Optional)
                  </label>
                  <input
                    type="date"
                    value={formData.date_of_birth}
                    onChange={(e) => handleInputChange('date_of_birth', e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-0.5">For birthday offers</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Anniversary Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={formData.anniversary_date}
                    onChange={(e) => handleInputChange('anniversary_date', e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-0.5">For special offers</p>
                </div>
              </div>
            </div>
          </div>

          {/* Address (Optional - for future deliveries) */}
          <div className="mb-6">
            <button
              type="button"
              onClick={() => setShowAddressSection(!showAddressSection)}
              className="w-full text-left flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <div className="flex items-center">
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider flex items-center">
                  <MapPin className="w-4 h-4 mr-2 text-gray-500" />
                  Address (Optional)
                  <span className="ml-2 text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full normal-case">
                    For deliveries
                  </span>
                </h3>
              </div>
              {showAddressSection ? (
                <ChevronDown className="w-4 h-4 text-gray-500" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-500" />
              )}
            </button>

            {showAddressSection && (
              <>
                <div className="space-y-3 mt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="relative">
                      <MapPin className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={formData.address.address_line1}
                        onChange={(e) => handleInputChange('address.address_line1', e.target.value)}
                        placeholder="Address Line 1"
                        className="w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm"
                      />
                    </div>

                    <div>
                      <input
                        type="text"
                        value={formData.address.address_line2}
                        onChange={(e) => handleInputChange('address.address_line2', e.target.value)}
                        placeholder="Address Line 2"
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div>
                      <input
                        type="text"
                        value={formData.address.city}
                        onChange={(e) => handleInputChange('address.city', e.target.value)}
                        placeholder="City"
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm"
                      />
                    </div>

                    <div>
                      <input
                        type="text"
                        value={formData.address.state}
                        onChange={(e) => handleInputChange('address.state', e.target.value)}
                        placeholder="State"
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm"
                      />
                    </div>

                    <div>
                      <input
                        type="text"
                        value={formData.address.pincode}
                        onChange={(e) => handleInputChange('address.pincode', e.target.value)}
                        placeholder="Pincode"
                        maxLength={6}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm"
                      />
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2 text-center">
                  💡 Add address to enable home delivery for this customer in the future
                </p>
              </>
            )}
          </div>
        </div>

        {/* Footer - Simplified */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-100">
          <div className="flex justify-between items-center">
            <div className="text-xs text-gray-600">
              * Required fields
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                disabled={loading}
                className="px-5 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed flex items-center gap-2 text-sm font-medium shadow-md"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Customer
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

export default CustomerCreationB2C;