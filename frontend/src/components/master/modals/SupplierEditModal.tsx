import React, { useState, useEffect } from 'react';
import {
  X, Save, Loader2, Truck, Phone, Building, CreditCard, Shield, Banknote
} from 'lucide-react';
import { suppliersApi, metadataApi } from '../../../services/api';
import { useToast } from '../../global/ui/feedback/Toast';
import Input from '../../global/ui/forms/Input';
import Button from '../../global/ui/Button';
import { FORM_STYLES } from '../../../constants/formStyles';

interface SupplierEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (supplier?: any) => void;
  supplier?: any;
}

const SupplierEditModal: React.FC<SupplierEditModalProps> = ({
  isOpen,
  onClose,
  onSave,
  supplier = null
}) => {
  const toast = useToast();

  // Initialize form data with default values to prevent null warnings
  const getInitialFormData = () => ({
    // Basic Information
    supplier_code: supplier?.supplier_code || '',
    supplier_name: supplier?.supplier_name || '',
    supplier_type: supplier?.supplier_type || 'distributor',
    supplier_category: supplier?.supplier_category || '',

    // Contact Information
    primary_phone: supplier?.primary_phone || '',
    primary_email: supplier?.primary_email || '',
    secondary_phone: supplier?.secondary_phone || '',
    whatsapp_number: supplier?.whatsapp_number || '',
    contact_person: supplier?.contact_person || '',
    contact_person_phone: supplier?.contact_person_phone || '',
    contact_person_designation: supplier?.contact_person_designation || '',

    // Address
    address_line_1: supplier?.address_line_1 || '',
    address_line_2: supplier?.address_line_2 || '',
    city: supplier?.city || '',
    state: supplier?.state || '',
    pincode: supplier?.pincode || '',

    // Compliance & GST
    gst_number: supplier?.gst_number || supplier?.gst_number || '',
    pan_number: supplier?.pan_number || '',
    drug_license_number: supplier?.drug_license_number || '',
    drug_license_validity: supplier?.drug_license_validity || '',
    fssai_number: supplier?.fssai_number || '',

    // Payment Terms
    payment_days: supplier?.payment_days || 30,
    payment_terms: supplier?.payment_terms || '',
    credit_limit: supplier?.credit_limit || 0,
    current_outstanding: supplier?.current_outstanding || 0,

    // Banking Details
    bank_name: supplier?.bank_name || '',
    bank_branch: supplier?.bank_branch || '',
    account_number: supplier?.account_number || '',
    account_holder_name: supplier?.account_holder_name || '',
    ifsc_code: supplier?.ifsc_code || '',
    upi_id: supplier?.upi_id || '',

    // Preferences
    preferred_payment_mode: supplier?.preferred_payment_mode || '',
    preferred_delivery_time: supplier?.preferred_delivery_time || '',
    minimum_order_value: supplier?.minimum_order_value || 0,
    delivery_lead_time: supplier?.delivery_lead_time || '',

    // Status
    is_active: supplier?.is_active !== false,
    is_verified: supplier?.is_verified || false,

    // Notes
    internal_notes: supplier?.internal_notes || ''
  });

  const [formData, setFormData] = useState(getInitialFormData());
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState('basic');

  // Metadata for dropdowns - loaded from backend
  const [metadata, setMetadata] = useState<any>({
    supplierTypes: [],
    supplierCategories: [],
    paymentTerms: [],
    paymentModes: [],
    states: []
  });

  // Reset form when modal opens/closes or supplier changes
  useEffect(() => {
    if (isOpen) {
      setFormData(getInitialFormData());
      setActiveSection('basic');
      setError(null);
      loadMetadata();
    }
  }, [isOpen, supplier]);

  // Load metadata for dropdowns
  const loadMetadata = async () => {
    try {
      // Try to load from backend, fallback to sensible defaults if API fails
      const [paymentTerms, paymentModes] = await Promise.all([
        metadataApi.getPaymentTerms().catch(() => ({ data: [] })),
        metadataApi.getPaymentModes().catch(() => ({ data: [] }))
      ]);

      setMetadata({
        // If backend doesn't provide, use minimal defaults
        supplierTypes: [
          { value: 'manufacturer', label: 'Manufacturer' },
          { value: 'distributor', label: 'Distributor' },
          { value: 'wholesaler', label: 'Wholesaler' },
          { value: 'stockist', label: 'Stockist' },
          { value: 'cnf', label: 'C&F Agent' }
        ],
        supplierCategories: [], // Let user type their own
        paymentTerms: paymentTerms.data?.length > 0 ? paymentTerms.data : [],
        paymentModes: paymentModes.data?.length > 0 ? paymentModes.data : [],
        states: [] // Could load from backend or let user type
      });
    } catch (err) {
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const validateForm = () => {
    if (!formData.supplier_name.trim()) {
      setError('Supplier name is required');
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
    if (formData.ifsc_code && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(formData.ifsc_code)) {
      setError('Invalid IFSC code format');
      setActiveSection('banking');
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
        payment_days: parseInt(String(formData.payment_days)) || 30,
        credit_limit: parseFloat(String(formData.credit_limit)) || 0,
        current_outstanding: parseFloat(String(formData.current_outstanding)) || 0,
        minimum_order_value: parseFloat(String(formData.minimum_order_value)) || 0,
        // Map GST field properly
        gst_number: formData.gst_number,
        gst_number: formData.gst_number
      };

      if (supplier) {
        const response = await suppliersApi.update(supplier.supplier_id, dataToSave);
        toast.success('Supplier updated successfully');
        onSave(response.data || dataToSave);
      } else {
        // Generate supplier code if not provided
        if (!dataToSave.supplier_code) {
          dataToSave.supplier_code = `SUPP${Date.now().toString().slice(-6)}`;
        }
        const response = await suppliersApi.create(dataToSave);
        toast.success('Supplier created successfully');
        onSave(response.data || dataToSave);
      }

      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save supplier');
    } finally {
      setIsSaving(false);
    }
  };

  // Simplified sections - matching Customer/Product Master pattern
  const sections = [
    { id: 'basic', label: 'Basic Information', icon: Truck },
    { id: 'contact', label: 'Contact & Address', icon: Phone },
    { id: 'compliance', label: 'Compliance & GST', icon: Shield },
    { id: 'banking', label: 'Banking Details', icon: Banknote },
    { id: 'payment', label: 'Payment Terms', icon: CreditCard },
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
                {supplier ? 'Edit Supplier' : 'Add New Supplier'}
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
                      className={`w-full text-left px-3 py-2 rounded-lg flex items-center space-x-2 transition-colors text-sm ${activeSection === section.id
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
                    <Truck className="w-5 h-5 mr-2" />
                    Basic Information
                  </h3>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={FORM_STYLES.labelRequired}>
                        Supplier Name
                      </label>
                      <Input
                        type="text"
                        required
                        value={formData.supplier_name}
                        onChange={(e) => handleInputChange('supplier_name', e.target.value)}
                        placeholder="Enter supplier name"
                      />
                    </div>

                    <div>
                      <label className={FORM_STYLES.label}>
                        Supplier Code
                      </label>
                      <Input
                        type="text"
                        value={formData.supplier_code}
                        onChange={(e) => handleInputChange('supplier_code', e.target.value)}
                        placeholder="Auto-generated if empty"
                      />
                    </div>

                    <div>
                      <label className={FORM_STYLES.label}>
                        Supplier Type
                      </label>
                      <select
                        value={formData.supplier_type}
                        onChange={(e) => handleInputChange('supplier_type', e.target.value)}
                        className={FORM_STYLES.select}
                      >
                        {metadata.supplierTypes.map((type: any) => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className={FORM_STYLES.label}>
                        Category
                      </label>
                      <Input
                        type="text"
                        value={formData.supplier_category}
                        onChange={(e) => handleInputChange('supplier_category', e.target.value)}
                        placeholder="e.g., Authorized, Preferred"
                        list="supplier-categories"
                      />
                      <datalist id="supplier-categories">
                        <option value="Authorized" />
                        <option value="Preferred" />
                        <option value="Regular" />
                        <option value="New" />
                      </datalist>
                    </div>

                    <div className="col-span-2 flex items-center space-x-6">
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={formData.is_active}
                          onChange={(e) => handleInputChange('is_active', e.target.checked)}
                          className={FORM_STYLES.checkbox}
                        />
                        <span className="text-sm text-gray-700">Active Supplier</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={formData.is_verified}
                          onChange={(e) => handleInputChange('is_verified', e.target.checked)}
                          className={FORM_STYLES.checkbox}
                        />
                        <span className="text-sm text-gray-700">Verified Supplier</span>
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
                        <label className={FORM_STYLES.labelRequired}>
                          Primary Phone
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
                        <label className={FORM_STYLES.label}>
                          Primary Email
                        </label>
                        <Input
                          type="email"
                          value={formData.primary_email}
                          onChange={(e) => handleInputChange('primary_email', e.target.value)}
                          placeholder="supplier@example.com"
                        />
                      </div>

                      <div>
                        <label className={FORM_STYLES.label}>
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
                        <label className={FORM_STYLES.label}>
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
                        <label className={FORM_STYLES.label}>
                          Contact Person Name
                        </label>
                        <Input
                          type="text"
                          value={formData.contact_person}
                          onChange={(e) => handleInputChange('contact_person', e.target.value)}
                          placeholder="John Doe"
                        />
                      </div>

                      <div>
                        <label className={FORM_STYLES.label}>
                          Contact Person Phone
                        </label>
                        <Input
                          type="tel"
                          value={formData.contact_person_phone}
                          onChange={(e) => handleInputChange('contact_person_phone', e.target.value)}
                          placeholder="+91-9876543210"
                        />
                      </div>

                      <div>
                        <label className={FORM_STYLES.label}>
                          Designation
                        </label>
                        <Input
                          type="text"
                          value={formData.contact_person_designation}
                          onChange={(e) => handleInputChange('contact_person_designation', e.target.value)}
                          placeholder="Sales Manager"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Address */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-3">Address</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <label className={FORM_STYLES.label}>
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
                        <label className={FORM_STYLES.label}>
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
                        <label className={FORM_STYLES.label}>
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
                        <label className={FORM_STYLES.label}>
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
                        <label className={FORM_STYLES.label}>
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
                      <label className={FORM_STYLES.label}>
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
                      <label className={FORM_STYLES.label}>
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
                      <label className={FORM_STYLES.label}>
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
                      <label className={FORM_STYLES.label}>
                        Drug License Validity
                      </label>
                      <Input
                        type="date"
                        value={formData.drug_license_validity}
                        onChange={(e) => handleInputChange('drug_license_validity', e.target.value)}
                      />
                    </div>

                    <div>
                      <label className={FORM_STYLES.label}>
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

              {/* Banking Details Section */}
              {activeSection === 'banking' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                    <Banknote className="w-5 h-5 mr-2" />
                    Banking Details
                  </h3>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={FORM_STYLES.label}>
                        Bank Name
                      </label>
                      <Input
                        type="text"
                        value={formData.bank_name}
                        onChange={(e) => handleInputChange('bank_name', e.target.value)}
                        placeholder="State Bank of India"
                      />
                    </div>

                    <div>
                      <label className={FORM_STYLES.label}>
                        Bank Branch
                      </label>
                      <Input
                        type="text"
                        value={formData.bank_branch}
                        onChange={(e) => handleInputChange('bank_branch', e.target.value)}
                        placeholder="Fort Branch, Mumbai"
                      />
                    </div>

                    <div>
                      <label className={FORM_STYLES.label}>
                        Account Number
                      </label>
                      <Input
                        type="text"
                        value={formData.account_number}
                        onChange={(e) => handleInputChange('account_number', e.target.value)}
                        placeholder="1234567890"
                      />
                    </div>

                    <div>
                      <label className={FORM_STYLES.label}>
                        Account Holder Name
                      </label>
                      <Input
                        type="text"
                        value={formData.account_holder_name}
                        onChange={(e) => handleInputChange('account_holder_name', e.target.value)}
                        placeholder="Company Name"
                      />
                    </div>

                    <div>
                      <label className={FORM_STYLES.label}>
                        IFSC Code
                      </label>
                      <Input
                        type="text"
                        value={formData.ifsc_code}
                        onChange={(e) => handleInputChange('ifsc_code', e.target.value.toUpperCase())}
                        placeholder="SBIN0000123"
                      />
                    </div>

                    <div>
                      <label className={FORM_STYLES.label}>
                        UPI ID
                      </label>
                      <Input
                        type="text"
                        value={formData.upi_id}
                        onChange={(e) => handleInputChange('upi_id', e.target.value)}
                        placeholder="supplier@upi"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Payment Terms Section */}
              {activeSection === 'payment' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                    <CreditCard className="w-5 h-5 mr-2" />
                    Payment Terms
                  </h3>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={FORM_STYLES.label}>
                        Payment Days
                      </label>
                      <Input
                        type="number"
                        value={formData.payment_days}
                        onChange={(e) => handleInputChange('payment_days', e.target.value)}
                        min="0"
                        max="365"
                        placeholder="30"
                      />
                    </div>

                    <div>
                      <label className={FORM_STYLES.label}>
                        Payment Terms
                      </label>
                      {metadata.paymentTerms.length > 0 ? (
                        <select
                          value={formData.payment_terms}
                          onChange={(e) => handleInputChange('payment_terms', e.target.value)}
                          className={FORM_STYLES.select}
                        >
                          <option value="">Select terms</option>
                          {metadata.paymentTerms.map((term: any) => (
                            <option key={term.value || term} value={term.value || term}>
                              {term.label || term}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Input
                          type="text"
                          value={formData.payment_terms}
                          onChange={(e) => handleInputChange('payment_terms', e.target.value)}
                          placeholder="e.g., NET30, COD, Advance"
                        />
                      )}
                    </div>

                    <div>
                      <label className={FORM_STYLES.label}>
                        Credit Limit (₹)
                      </label>
                      <Input
                        type="number"
                        value={formData.credit_limit}
                        onChange={(e) => handleInputChange('credit_limit', e.target.value)}
                        min="0"
                        step="1000"
                        placeholder="100000"
                      />
                    </div>

                    <div>
                      <label className={FORM_STYLES.label}>
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
                      <label className={FORM_STYLES.label}>
                        Preferred Payment Mode
                      </label>
                      {metadata.paymentModes.length > 0 ? (
                        <select
                          value={formData.preferred_payment_mode}
                          onChange={(e) => handleInputChange('preferred_payment_mode', e.target.value)}
                          className={FORM_STYLES.select}
                        >
                          <option value="">Select mode</option>
                          {metadata.paymentModes.map((mode: any) => (
                            <option key={mode.value || mode} value={mode.value || mode}>
                              {mode.label || mode}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Input
                          type="text"
                          value={formData.preferred_payment_mode}
                          onChange={(e) => handleInputChange('preferred_payment_mode', e.target.value)}
                          placeholder="e.g., NEFT, Cheque, Cash"
                        />
                      )}
                    </div>

                    <div>
                      <label className={FORM_STYLES.label}>
                        Minimum Order Value (₹)
                      </label>
                      <Input
                        type="number"
                        value={formData.minimum_order_value}
                        onChange={(e) => handleInputChange('minimum_order_value', e.target.value)}
                        min="0"
                        placeholder="5000"
                      />
                    </div>
                  </div>

                  {/* Payment Analysis */}
                  {formData.credit_limit > 0 && (
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Payment Analysis</h4>
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
                          <span className="text-gray-500">Payment Status:</span>
                          <span className={`ml-2 font-medium ${(formData.current_outstanding || 0) > formData.credit_limit ? 'text-red-600' :
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
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={FORM_STYLES.label}>
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
                        <label className={FORM_STYLES.label}>
                          Delivery Lead Time
                        </label>
                        <Input
                          type="text"
                          value={formData.delivery_lead_time}
                          onChange={(e) => handleInputChange('delivery_lead_time', e.target.value)}
                          placeholder="e.g., 2-3 days"
                        />
                      </div>
                    </div>

                    <div>
                      <label className={FORM_STYLES.label}>
                        Internal Notes
                      </label>
                      <textarea
                        value={formData.internal_notes}
                        onChange={(e) => handleInputChange('internal_notes', e.target.value)}
                        rows={4}
                        placeholder="Add any internal notes about this supplier..."
                        className={FORM_STYLES.textarea}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-500">
                {supplier ? `Supplier ID: ${supplier.supplier_id}` : 'New Supplier'}
              </div>

              {/* Section Navigation */}
              <div className="flex items-center space-x-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    const currentIndex = sections.findIndex(s => s.id === activeSection);
                    if (currentIndex > 0) {
                      setActiveSection(sections[currentIndex - 1].id);
                    }
                  }}
                  disabled={sections.findIndex(s => s.id === activeSection) === 0}
                  className="px-3 py-1.5 text-sm"
                >
                  ← Previous
                </Button>

                <span className="text-sm text-gray-500 px-2">
                  {sections.findIndex(s => s.id === activeSection) + 1} / {sections.length}
                </span>

                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    const currentIndex = sections.findIndex(s => s.id === activeSection);
                    if (currentIndex < sections.length - 1) {
                      setActiveSection(sections[currentIndex + 1].id);
                    }
                  }}
                  disabled={sections.findIndex(s => s.id === activeSection) === sections.length - 1}
                  className="px-3 py-1.5 text-sm"
                >
                  Next →
                </Button>
              </div>

              {/* Action Buttons */}
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
                      {supplier ? 'Update' : 'Create'}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SupplierEditModal;