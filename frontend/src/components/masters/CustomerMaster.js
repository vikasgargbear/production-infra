import React, { useState, useEffect } from 'react';
import { 
  X, Save, Loader2, User, Phone, Mail, Building, CreditCard,
  Shield, Calendar, TrendingUp, AlertTriangle, MapPin, Users,
  FileText, Star, MessageSquare, Award, ChevronDown, ChevronUp,
  Check, XCircle, DollarSign, Clock, Briefcase, Hash, Plus, Trash2
} from 'lucide-react';
import { customersApi, metadataApi, territoriesApi } from '../../services/api';
import { useToast } from '../global';

const CustomerMaster = ({ 
  isOpen, 
  onClose, 
  customer = null,
  onSave,
  mode = 'edit' // 'edit' | 'create' | 'view'
}) => {
  const toast = useToast();
  
  // Comprehensive form data matching database schema
  const [formData, setFormData] = useState({
    // Basic Information
    customer_code: '',
    customer_name: '',
    customer_type: 'B2B',
    
    // Contact Information
    primary_phone: '',
    primary_email: '',
    secondary_phone: '',
    whatsapp_number: '',
    
    // Contact Person
    contact_person_name: '',
    contact_person_phone: '',
    contact_person_email: '',
    
    // Compliance & Registration
    gst_number: '',
    pan_number: '',
    drug_license_number: '',
    drug_license_validity: '',
    fssai_number: '',
    
    // Business Information
    establishment_year: '',
    business_type: '',
    customer_category: '',
    customer_grade: '',
    
    // Credit Management
    credit_limit: 0,
    current_outstanding: 0,
    credit_days: 30,
    credit_rating: 'B',
    payment_terms: 'NET30',
    security_deposit: 0,
    overdue_interest_rate: 0,
    
    // Territory & Assignment
    territory_id: '',
    route_id: '',
    area_code: '',
    assigned_salesperson_id: '',
    
    // Pricing & Discounts
    price_list_id: '',
    discount_group_id: '',
    
    // KYC
    kyc_status: 'pending',
    kyc_verified_date: '',
    kyc_documents: [],
    
    // Preferences
    preferred_payment_mode: 'cash',
    preferred_delivery_time: '',
    prefer_sms: true,
    prefer_email: true,
    prefer_whatsapp: true,
    
    // Transaction History
    first_transaction_date: '',
    last_transaction_date: '',
    total_business_amount: 0,
    total_transactions: 0,
    average_order_value: 0,
    
    // Loyalty
    loyalty_points: 0,
    loyalty_tier: 'bronze',
    
    // Status
    is_active: true,
    blacklisted: false,
    blacklist_reason: '',
    blacklist_date: '',
    
    // Notes
    internal_notes: '',
    
    // Additional Contacts
    additional_contacts: [],
    
    // Addresses
    addresses: []
  });

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [activeSection, setActiveSection] = useState('basic');
  const [territories, setTerritories] = useState([]);
  const [salespersons, setSalespersons] = useState([]);
  const [priceLists, setPriceLists] = useState([]);
  const [discountGroups, setDiscountGroups] = useState([]);
  const [newContact, setNewContact] = useState({
    contact_name: '',
    designation: '',
    mobile_number: '',
    email: '',
    is_primary: false
  });
  const [newAddress, setNewAddress] = useState({
    address_type: 'billing',
    address_line_1: '',
    address_line_2: '',
    city: '',
    state: '',
    pincode: '',
    is_default: false
  });

  // Customer types
  const customerTypes = [
    { value: 'B2B', label: 'Business to Business' },
    { value: 'B2C', label: 'Business to Consumer' },
    { value: 'HOSPITAL', label: 'Hospital' },
    { value: 'CLINIC', label: 'Clinic' },
    { value: 'PHARMACY', label: 'Pharmacy' },
    { value: 'DISTRIBUTOR', label: 'Distributor' },
    { value: 'RETAIL', label: 'Retail' },
    { value: 'INSTITUTION', label: 'Institution' }
  ];

  // Business types
  const businessTypes = [
    'Pharmacy', 'Hospital', 'Clinic', 'Diagnostic Center',
    'Retail Store', 'Wholesale', 'Distribution', 'Manufacturing',
    'Healthcare Provider', 'Laboratory', 'Other'
  ];

  // Customer categories
  const customerCategories = [
    { value: 'PREMIUM', label: 'Premium', color: 'purple' },
    { value: 'GOLD', label: 'Gold', color: 'yellow' },
    { value: 'SILVER', label: 'Silver', color: 'gray' },
    { value: 'REGULAR', label: 'Regular', color: 'blue' },
    { value: 'NEW', label: 'New', color: 'green' }
  ];

  // Customer grades
  const customerGrades = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D'];

  // Credit ratings
  const creditRatings = [
    { value: 'AAA', label: 'AAA - Excellent', color: 'green' },
    { value: 'AA', label: 'AA - Very Good', color: 'green' },
    { value: 'A', label: 'A - Good', color: 'blue' },
    { value: 'BBB', label: 'BBB - Average', color: 'blue' },
    { value: 'BB', label: 'BB - Below Average', color: 'yellow' },
    { value: 'B', label: 'B - Poor', color: 'orange' },
    { value: 'C', label: 'C - Very Poor', color: 'red' },
    { value: 'D', label: 'D - Default', color: 'red' }
  ];

  // Payment terms
  const paymentTerms = [
    { value: 'IMMEDIATE', label: 'Immediate' },
    { value: 'NET7', label: 'Net 7 Days' },
    { value: 'NET15', label: 'Net 15 Days' },
    { value: 'NET30', label: 'Net 30 Days' },
    { value: 'NET45', label: 'Net 45 Days' },
    { value: 'NET60', label: 'Net 60 Days' },
    { value: 'NET90', label: 'Net 90 Days' },
    { value: 'EOM', label: 'End of Month' },
    { value: '2/10_NET30', label: '2/10 Net 30' }
  ];

  // Payment modes
  const paymentModes = [
    'Cash', 'Credit', 'Cheque', 'NEFT', 'RTGS', 
    'UPI', 'Card', 'Wallet', 'Mixed'
  ];

  // KYC statuses
  const kycStatuses = [
    { value: 'pending', label: 'Pending', color: 'yellow' },
    { value: 'in_progress', label: 'In Progress', color: 'blue' },
    { value: 'verified', label: 'Verified', color: 'green' },
    { value: 'rejected', label: 'Rejected', color: 'red' },
    { value: 'expired', label: 'Expired', color: 'gray' }
  ];

  // Loyalty tiers
  const loyaltyTiers = [
    { value: 'bronze', label: 'Bronze', color: 'orange' },
    { value: 'silver', label: 'Silver', color: 'gray' },
    { value: 'gold', label: 'Gold', color: 'yellow' },
    { value: 'platinum', label: 'Platinum', color: 'purple' },
    { value: 'diamond', label: 'Diamond', color: 'blue' }
  ];

  useEffect(() => {
    loadMetadata();
    if (customer) {
      loadCustomerData();
    }
  }, [customer]);

  const loadMetadata = async () => {
    try {
      // Load territories
      const terrResponse = await territoriesApi.getAll();
      setTerritories(terrResponse.data || []);
      
      // Load salespersons
      const salesResponse = await metadataApi.getSalespersons();
      setSalespersons(salesResponse.data || []);
      
      // Load price lists
      const priceResponse = await metadataApi.getPriceLists();
      setPriceLists(priceResponse.data || []);
      
      // Load discount groups
      const discountResponse = await metadataApi.getDiscountGroups();
      setDiscountGroups(discountResponse.data || []);
    } catch (error) {
    }
  };

  const loadCustomerData = () => {
    setFormData({
      ...formData,
      ...customer,
      kyc_documents: customer.kyc_documents || [],
      additional_contacts: customer.contacts || [],
      addresses: customer.addresses || []
    });
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const addContact = () => {
    if (newContact.contact_name && newContact.mobile_number) {
      setFormData(prev => ({
        ...prev,
        additional_contacts: [...prev.additional_contacts, { ...newContact, id: Date.now() }]
      }));
      setNewContact({
        contact_name: '',
        designation: '',
        mobile_number: '',
        email: '',
        is_primary: false
      });
    }
  };

  const removeContact = (contactId) => {
    setFormData(prev => ({
      ...prev,
      additional_contacts: prev.additional_contacts.filter(c => c.id !== contactId)
    }));
  };

  const addAddress = () => {
    if (newAddress.address_line_1 && newAddress.city) {
      setFormData(prev => ({
        ...prev,
        addresses: [...prev.addresses, { ...newAddress, id: Date.now() }]
      }));
      setNewAddress({
        address_type: 'billing',
        address_line_1: '',
        address_line_2: '',
        city: '',
        state: '',
        pincode: '',
        is_default: false
      });
    }
  };

  const removeAddress = (addressId) => {
    setFormData(prev => ({
      ...prev,
      addresses: prev.addresses.filter(a => a.id !== addressId)
    }));
  };

  const validateForm = () => {
    if (!formData.customer_name.trim()) {
      setError('Customer name is required');
      return false;
    }
    if (!formData.primary_phone.trim()) {
      setError('Primary phone is required');
      return false;
    }
    if (!formData.customer_type) {
      setError('Customer type is required');
      return false;
    }
    if (formData.gst_number && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(formData.gst_number)) {
      setError('Invalid GST number format');
      return false;
    }
    if (formData.pan_number && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(formData.pan_number)) {
      setError('Invalid PAN number format');
      return false;
    }
    if (formData.primary_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.primary_email)) {
      setError('Invalid email format');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (mode === 'view') {
      onClose();
      return;
    }

    if (!validateForm()) return;

    try {
      setIsSaving(true);
      setError(null);
      
      const dataToSave = {
        ...formData,
        // Ensure numeric fields are proper numbers
        credit_limit: parseFloat(formData.credit_limit) || 0,
        current_outstanding: parseFloat(formData.current_outstanding) || 0,
        security_deposit: parseFloat(formData.security_deposit) || 0,
        overdue_interest_rate: parseFloat(formData.overdue_interest_rate) || 0,
        total_business_amount: parseFloat(formData.total_business_amount) || 0,
        average_order_value: parseFloat(formData.average_order_value) || 0,
        loyalty_points: parseFloat(formData.loyalty_points) || 0,
        credit_days: parseInt(formData.credit_days) || 30,
        establishment_year: formData.establishment_year ? parseInt(formData.establishment_year) : null,
        total_transactions: parseInt(formData.total_transactions) || 0
      };
      
      if (customer) {
        await customersApi.update(customer.customer_id, dataToSave);
        toast.success('Customer updated successfully');
      } else {
        await customersApi.create(dataToSave);
        toast.success('Customer created successfully');
      }
      
      if (onSave) {
        onSave();
      }
      
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save customer');
    } finally {
      setIsSaving(false);
    }
  };

  const sections = [
    { id: 'basic', label: 'Basic Information', icon: User },
    { id: 'contact', label: 'Contact Details', icon: Phone },
    { id: 'compliance', label: 'Compliance', icon: Shield },
    { id: 'business', label: 'Business Info', icon: Building },
    { id: 'credit', label: 'Credit Management', icon: CreditCard },
    { id: 'territory', label: 'Territory & Assignment', icon: MapPin },
    { id: 'kyc', label: 'KYC', icon: FileText },
    { id: 'preferences', label: 'Preferences', icon: MessageSquare },
    { id: 'transaction', label: 'Transaction History', icon: TrendingUp },
    { id: 'loyalty', label: 'Loyalty', icon: Award },
    { id: 'addresses', label: 'Addresses', icon: MapPin },
    { id: 'notes', label: 'Notes', icon: FileText }
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl m-4 max-h-[90vh] flex flex-col">
        <form onSubmit={handleSubmit} className="flex flex-col h-full">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">
                {mode === 'create' ? 'Create Customer Master' : mode === 'view' ? 'View Customer Master' : 'Edit Customer Master'}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg"
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
            <div className="w-56 bg-gray-50 p-4 border-r border-gray-200 overflow-y-auto">
              <nav className="space-y-1">
                {sections.map((section) => {
                  const Icon = section.icon;
                  return (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => setActiveSection(section.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg flex items-center space-x-2 transition-colors ${
                        activeSection === section.id
                          ? 'bg-blue-100 text-blue-700'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="text-sm font-medium">{section.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Basic Information Section */}
              {activeSection === 'basic' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                    <User className="w-5 h-5 mr-2" />
                    Basic Information
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Customer Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.customer_name}
                        onChange={(e) => handleInputChange('customer_name', e.target.value)}
                        disabled={mode === 'view'}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Customer Code
                      </label>
                      <input
                        type="text"
                        value={formData.customer_code}
                        onChange={(e) => handleInputChange('customer_code', e.target.value)}
                        disabled={mode === 'view'}
                        placeholder="Auto-generated if empty"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Customer Type <span className="text-red-500">*</span>
                      </label>
                      <select
                        required
                        value={formData.customer_type}
                        onChange={(e) => handleInputChange('customer_type', e.target.value)}
                        disabled={mode === 'view'}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      >
                        {customerTypes.map(type => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Business Type
                      </label>
                      <select
                        value={formData.business_type}
                        onChange={(e) => handleInputChange('business_type', e.target.value)}
                        disabled={mode === 'view'}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      >
                        <option value="">Select Business Type</option>
                        {businessTypes.map(type => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Customer Category
                      </label>
                      <select
                        value={formData.customer_category}
                        onChange={(e) => handleInputChange('customer_category', e.target.value)}
                        disabled={mode === 'view'}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      >
                        <option value="">Select Category</option>
                        {customerCategories.map(cat => (
                          <option key={cat.value} value={cat.value}>
                            {cat.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Customer Grade
                      </label>
                      <select
                        value={formData.customer_grade}
                        onChange={(e) => handleInputChange('customer_grade', e.target.value)}
                        disabled={mode === 'view'}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      >
                        <option value="">Select Grade</option>
                        {customerGrades.map(grade => (
                          <option key={grade} value={grade}>{grade}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Establishment Year
                      </label>
                      <input
                        type="number"
                        value={formData.establishment_year}
                        onChange={(e) => handleInputChange('establishment_year', e.target.value)}
                        disabled={mode === 'view'}
                        min={1900}
                        max={new Date().getFullYear()}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                    </div>

                    <div className="flex items-center space-x-6">
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={formData.is_active}
                          onChange={(e) => handleInputChange('is_active', e.target.checked)}
                          disabled={mode === 'view'}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm text-gray-700">Active</span>
                      </label>

                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={formData.blacklisted}
                          onChange={(e) => handleInputChange('blacklisted', e.target.checked)}
                          disabled={mode === 'view'}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm text-gray-700">Blacklisted</span>
                        {formData.blacklisted && <AlertTriangle className="w-4 h-4 text-red-500" />}
                      </label>
                    </div>

                    {formData.blacklisted && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Blacklist Reason
                          </label>
                          <input
                            type="text"
                            value={formData.blacklist_reason}
                            onChange={(e) => handleInputChange('blacklist_reason', e.target.value)}
                            disabled={mode === 'view'}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Blacklist Date
                          </label>
                          <input
                            type="date"
                            value={formData.blacklist_date}
                            onChange={(e) => handleInputChange('blacklist_date', e.target.value)}
                            disabled={mode === 'view'}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Contact Details Section */}
              {activeSection === 'contact' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                    <Phone className="w-5 h-5 mr-2" />
                    Contact Details
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Primary Phone <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="tel"
                        required
                        value={formData.primary_phone}
                        onChange={(e) => handleInputChange('primary_phone', e.target.value)}
                        disabled={mode === 'view'}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Primary Email
                      </label>
                      <input
                        type="email"
                        value={formData.primary_email}
                        onChange={(e) => handleInputChange('primary_email', e.target.value)}
                        disabled={mode === 'view'}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Secondary Phone
                      </label>
                      <input
                        type="tel"
                        value={formData.secondary_phone}
                        onChange={(e) => handleInputChange('secondary_phone', e.target.value)}
                        disabled={mode === 'view'}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        WhatsApp Number
                      </label>
                      <input
                        type="tel"
                        value={formData.whatsapp_number}
                        onChange={(e) => handleInputChange('whatsapp_number', e.target.value)}
                        disabled={mode === 'view'}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <h4 className="font-medium text-gray-900 mb-3">Primary Contact Person</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Contact Person Name
                        </label>
                        <input
                          type="text"
                          value={formData.contact_person_name}
                          onChange={(e) => handleInputChange('contact_person_name', e.target.value)}
                          disabled={mode === 'view'}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Contact Person Phone
                        </label>
                        <input
                          type="tel"
                          value={formData.contact_person_phone}
                          onChange={(e) => handleInputChange('contact_person_phone', e.target.value)}
                          disabled={mode === 'view'}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Contact Person Email
                        </label>
                        <input
                          type="email"
                          value={formData.contact_person_email}
                          onChange={(e) => handleInputChange('contact_person_email', e.target.value)}
                          disabled={mode === 'view'}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <h4 className="font-medium text-gray-900 mb-3">Additional Contacts</h4>
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newContact.contact_name}
                          onChange={(e) => setNewContact({...newContact, contact_name: e.target.value})}
                          placeholder="Name"
                          disabled={mode === 'view'}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                        />
                        <input
                          type="text"
                          value={newContact.designation}
                          onChange={(e) => setNewContact({...newContact, designation: e.target.value})}
                          placeholder="Designation"
                          disabled={mode === 'view'}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                        />
                        <input
                          type="tel"
                          value={newContact.mobile_number}
                          onChange={(e) => setNewContact({...newContact, mobile_number: e.target.value})}
                          placeholder="Mobile"
                          disabled={mode === 'view'}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                        />
                        <input
                          type="email"
                          value={newContact.email}
                          onChange={(e) => setNewContact({...newContact, email: e.target.value})}
                          placeholder="Email"
                          disabled={mode === 'view'}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                        />
                        {mode !== 'view' && (
                          <button
                            type="button"
                            onClick={addContact}
                            className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {formData.additional_contacts.map((contact) => (
                        <div key={contact.id} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded">
                          <div className="grid grid-cols-4 gap-4 flex-1">
                            <span className="text-sm">{contact.contact_name}</span>
                            <span className="text-sm text-gray-600">{contact.designation}</span>
                            <span className="text-sm">{contact.mobile_number}</span>
                            <span className="text-sm">{contact.email}</span>
                          </div>
                          {mode !== 'view' && (
                            <button
                              type="button"
                              onClick={() => removeContact(contact.id)}
                              className="text-red-600 hover:text-red-700 ml-2"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Compliance Section */}
              {activeSection === 'compliance' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                    <Shield className="w-5 h-5 mr-2" />
                    Compliance & Registration
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        GST Number
                      </label>
                      <input
                        type="text"
                        value={formData.gst_number}
                        onChange={(e) => handleInputChange('gst_number', e.target.value.toUpperCase())}
                        disabled={mode === 'view'}
                        placeholder="27AABCU9603R1ZM"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        PAN Number
                      </label>
                      <input
                        type="text"
                        value={formData.pan_number}
                        onChange={(e) => handleInputChange('pan_number', e.target.value.toUpperCase())}
                        disabled={mode === 'view'}
                        placeholder="AABCU9603R"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Drug License Number
                      </label>
                      <input
                        type="text"
                        value={formData.drug_license_number}
                        onChange={(e) => handleInputChange('drug_license_number', e.target.value)}
                        disabled={mode === 'view'}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Drug License Validity
                      </label>
                      <input
                        type="date"
                        value={formData.drug_license_validity}
                        onChange={(e) => handleInputChange('drug_license_validity', e.target.value)}
                        disabled={mode === 'view'}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        FSSAI Number
                      </label>
                      <input
                        type="text"
                        value={formData.fssai_number}
                        onChange={(e) => handleInputChange('fssai_number', e.target.value)}
                        disabled={mode === 'view'}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Credit Management Section */}
              {activeSection === 'credit' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                    <CreditCard className="w-5 h-5 mr-2" />
                    Credit Management
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Credit Limit (₹)
                      </label>
                      <input
                        type="number"
                        value={formData.credit_limit}
                        onChange={(e) => handleInputChange('credit_limit', e.target.value)}
                        disabled={mode === 'view'}
                        min={0}
                        step={1000}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Current Outstanding (₹)
                      </label>
                      <input
                        type="number"
                        value={formData.current_outstanding}
                        onChange={(e) => handleInputChange('current_outstanding', e.target.value)}
                        disabled={mode === 'view'}
                        min={0}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Credit Days
                      </label>
                      <input
                        type="number"
                        value={formData.credit_days}
                        onChange={(e) => handleInputChange('credit_days', e.target.value)}
                        disabled={mode === 'view'}
                        min={0}
                        max={365}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Credit Rating
                      </label>
                      <select
                        value={formData.credit_rating}
                        onChange={(e) => handleInputChange('credit_rating', e.target.value)}
                        disabled={mode === 'view'}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      >
                        {creditRatings.map(rating => (
                          <option key={rating.value} value={rating.value}>
                            {rating.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Payment Terms
                      </label>
                      <select
                        value={formData.payment_terms}
                        onChange={(e) => handleInputChange('payment_terms', e.target.value)}
                        disabled={mode === 'view'}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      >
                        {paymentTerms.map(term => (
                          <option key={term.value} value={term.value}>
                            {term.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Security Deposit (₹)
                      </label>
                      <input
                        type="number"
                        value={formData.security_deposit}
                        onChange={(e) => handleInputChange('security_deposit', e.target.value)}
                        disabled={mode === 'view'}
                        min={0}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Overdue Interest Rate (% p.a.)
                      </label>
                      <input
                        type="number"
                        value={formData.overdue_interest_rate}
                        onChange={(e) => handleInputChange('overdue_interest_rate', e.target.value)}
                        disabled={mode === 'view'}
                        min={0}
                        max={100}
                        step={0.01}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      />
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
                            ₹{(formData.credit_limit - formData.current_outstanding).toLocaleString()}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">Credit Utilization:</span>
                          <span className="ml-2 font-medium">
                            {((formData.current_outstanding / formData.credit_limit) * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">Credit Status:</span>
                          <span className={`ml-2 font-medium ${
                            formData.current_outstanding > formData.credit_limit ? 'text-red-600' :
                            formData.current_outstanding > formData.credit_limit * 0.8 ? 'text-yellow-600' :
                            'text-green-600'
                          }`}>
                            {formData.current_outstanding > formData.credit_limit ? 'Over Limit' :
                             formData.current_outstanding > formData.credit_limit * 0.8 ? 'Near Limit' :
                             'Good'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Other sections would follow the same pattern... */}
              {/* For brevity, showing a simplified version of remaining sections */}

              {/* Preferences Section */}
              {activeSection === 'preferences' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                    <MessageSquare className="w-5 h-5 mr-2" />
                    Preferences
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Preferred Payment Mode
                      </label>
                      <select
                        value={formData.preferred_payment_mode}
                        onChange={(e) => handleInputChange('preferred_payment_mode', e.target.value)}
                        disabled={mode === 'view'}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      >
                        {paymentModes.map(mode => (
                          <option key={mode} value={mode.toLowerCase()}>{mode}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Preferred Delivery Time
                      </label>
                      <input
                        type="text"
                        value={formData.preferred_delivery_time}
                        onChange={(e) => handleInputChange('preferred_delivery_time', e.target.value)}
                        disabled={mode === 'view'}
                        placeholder="e.g., Morning, 9 AM - 12 PM"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-medium text-gray-900">Communication Preferences</h4>
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={formData.prefer_sms}
                        onChange={(e) => handleInputChange('prefer_sms', e.target.checked)}
                        disabled={mode === 'view'}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm text-gray-700">SMS Notifications</span>
                    </label>

                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={formData.prefer_email}
                        onChange={(e) => handleInputChange('prefer_email', e.target.checked)}
                        disabled={mode === 'view'}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm text-gray-700">Email Notifications</span>
                    </label>

                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={formData.prefer_whatsapp}
                        onChange={(e) => handleInputChange('prefer_whatsapp', e.target.checked)}
                        disabled={mode === 'view'}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm text-gray-700">WhatsApp Notifications</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Loyalty Section */}
              {activeSection === 'loyalty' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                    <Award className="w-5 h-5 mr-2" />
                    Loyalty Program
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Loyalty Points
                      </label>
                      <input
                        type="number"
                        value={formData.loyalty_points}
                        onChange={(e) => handleInputChange('loyalty_points', e.target.value)}
                        disabled={mode === 'view'}
                        min={0}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Loyalty Tier
                      </label>
                      <select
                        value={formData.loyalty_tier}
                        onChange={(e) => handleInputChange('loyalty_tier', e.target.value)}
                        disabled={mode === 'view'}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      >
                        {loyaltyTiers.map(tier => (
                          <option key={tier.value} value={tier.value}>
                            {tier.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Notes Section */}
              {activeSection === 'notes' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                    <FileText className="w-5 h-5 mr-2" />
                    Internal Notes
                  </h3>
                  
                  <div>
                    <textarea
                      value={formData.internal_notes}
                      onChange={(e) => handleInputChange('internal_notes', e.target.value)}
                      disabled={mode === 'view'}
                      rows={8}
                      placeholder="Add any internal notes about this customer..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                    />
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
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                {mode === 'view' ? 'Close' : 'Cancel'}
              </button>
              {mode !== 'view' && (
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2 disabled:opacity-50"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>{customer ? 'Update Customer' : 'Create Customer'}</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CustomerMaster;