import React, { useState, useEffect } from 'react';
import { User, Phone, Shield, CreditCard, Building } from 'lucide-react';
import { customersApi, metadataApi } from '../../../services/api';
import offlineDB from '../../../services/offline/core/offlineDatabase';
import syncEngine from '../../../services/offline/sync/syncEngine';
import { useToast } from '../../global/ui/feedback/Toast';
import Input from '../../global/ui/forms/Input';
import { FORM_STYLES } from '../../../constants/formStyles';
import ModalShell from './shared/ModalShell';
import SidebarNav from './shared/SidebarNav';
import ModalFooter from './shared/ModalFooter';
import ComplianceSection from './shared/ComplianceSection';
import ContactAddressSection from './shared/ContactAddressSection';

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

  const getInitialFormData = () => ({
    customer_code: customer?.customer_code || '',
    customer_name: customer?.customer_name || '',
    customer_type: customer?.customer_type || 'retail',
    business_type: customer?.business_type || '',
    customer_category: customer?.customer_category || '',
    primary_phone: customer?.primary_phone || '',
    primary_email: customer?.primary_email || '',
    secondary_phone: customer?.secondary_phone || '',
    whatsapp_number: customer?.whatsapp_number || '',
    contact_person: customer?.contact_person || '',
    contact_person_phone: customer?.contact_person_phone || '',
    contact_person_email: customer?.contact_person_email || '',
    address_line_1: customer?.address_line_1 || '',
    address_line_2: customer?.address_line_2 || '',
    city: customer?.city || '',
    state: customer?.state || '',
    pincode: customer?.pincode || '',
    gst_number: customer?.gst_number || '',
    pan_number: customer?.pan_number || '',
    drug_license_number: customer?.drug_license_number || '',
    drug_license_validity: customer?.drug_license_validity || '',
    fssai_number: customer?.fssai_number || '',
    credit_limit: customer?.credit_limit || 0,
    credit_days: customer?.credit_days || 0,
    credit_rating: customer?.credit_rating || 'B',
    payment_terms: customer?.payment_terms || 'NET30',
    current_outstanding: customer?.current_outstanding || 0,
    security_deposit: customer?.security_deposit || 0,
    preferred_payment_mode: customer?.preferred_payment_mode || 'cash',
    preferred_delivery_time: customer?.preferred_delivery_time || '',
    prefer_sms: customer?.prefer_sms !== false,
    prefer_email: customer?.prefer_email !== false,
    prefer_whatsapp: customer?.prefer_whatsapp !== false,
    is_active: customer?.is_active !== false,
    internal_notes: customer?.internal_notes || ''
  });

  const [formData, setFormData] = useState(getInitialFormData());
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState('basic');

  const [metadata, setMetadata] = useState<any>({
    customerTypes: [],
    customerCategories: [],
    creditRatings: [],
    paymentTerms: [],
    paymentModes: [],
    states: []
  });

  useEffect(() => {
    if (isOpen) {
      setFormData(getInitialFormData());
      setActiveSection('basic');
      setError(null);
      loadMetadata();
    }
  }, [isOpen, customer]);

  const loadMetadata = async () => {
    try {
      const [creditRatings, paymentTerms, paymentModes] = await Promise.all([
        metadataApi.getCreditRatings().catch(() => ({ data: [] })),
        metadataApi.getPaymentTerms().catch(() => ({ data: [] })),
        metadataApi.getPaymentModes().catch(() => ({ data: [] }))
      ]);

      setMetadata({
        customerTypes: [
          { value: 'retail', label: 'Retail' },
          { value: 'wholesale', label: 'Wholesale' },
          { value: 'hospital', label: 'Hospital' },
          { value: 'clinic', label: 'Clinic' },
          { value: 'pharmacy', label: 'Pharmacy' }
        ],
        customerCategories: [],
        creditRatings: creditRatings.data?.length > 0 ? creditRatings.data : [],
        paymentTerms: paymentTerms.data?.length > 0 ? paymentTerms.data : [],
        paymentModes: paymentModes.data?.length > 0 ? paymentModes.data : [],
        states: []
      });
    } catch (err) {
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
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
        gst_number: formData.gst_number
      };

      if (customer) {
        await customersApi.update(customer.customer_id, dataToSave);
        toast.success('Customer updated successfully');
      } else {
        if (!dataToSave.customer_code) {
          dataToSave.customer_code = `CUST${Date.now().toString().slice(-6)}`;
        }

        const tempId = `LOCAL_CUST_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const localRecord = {
          id: tempId,
          customer_id: tempId,
          _localId: tempId,
          ...dataToSave,
          name: dataToSave.customer_name,
          phone: dataToSave.primary_phone,
          sync_status: 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          created_offline: true
        };

        const db = await offlineDB.init();
        await db.put('customers', localRecord);
        await offlineDB.addToSyncQueue('customer', tempId, 'create', localRecord);

        toast.success(`Customer created${navigator.onLine ? '' : ' (offline)'}${!navigator.onLine ? ' - will sync when online' : ''}`);

        if (navigator.onLine) {
          syncEngine.startSync().catch(() => {});
        }
      }

      onSave();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save customer');
    } finally {
      setIsSaving(false);
    }
  };

  const sections = [
    { id: 'basic', label: 'Basic Information', icon: User },
    { id: 'contact', label: 'Contact & Address', icon: Phone },
    { id: 'compliance', label: 'Compliance & GST', icon: Shield },
    { id: 'credit', label: 'Credit & Payment', icon: CreditCard },
    { id: 'additional', label: 'Additional Info', icon: Building }
  ];

  return (
    <ModalShell
      isOpen={isOpen}
      title={customer ? 'Edit Customer' : 'Add New Customer'}
      error={error}
      onClose={onClose}
      onSubmit={handleSubmit}
      sidebar={
        <SidebarNav
          sections={sections}
          activeSection={activeSection}
          onSectionChange={setActiveSection}
        />
      }
      footer={
        <ModalFooter
          sections={sections}
          activeSection={activeSection}
          onSectionChange={setActiveSection}
          isSaving={isSaving}
          isEditing={!!customer}
          entityLabel="Customer"
          entityId={customer?.customer_id}
          onClose={onClose}
        />
      }
    >
      {/* Basic Information Section */}
      {activeSection === 'basic' && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
            <User className="w-5 h-5 mr-2" />
            Basic Information
          </h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={FORM_STYLES.labelRequired}>Customer Name</label>
              <Input
                type="text"
                required
                value={formData.customer_name}
                onChange={(e) => handleInputChange('customer_name', e.target.value)}
                placeholder="Enter customer name"
              />
            </div>

            <div>
              <label className={FORM_STYLES.label}>Customer Code</label>
              <Input
                type="text"
                value={formData.customer_code}
                onChange={(e) => handleInputChange('customer_code', e.target.value)}
                placeholder="Auto-generated if empty"
              />
            </div>

            <div>
              <label className={FORM_STYLES.label}>Customer Type</label>
              <select
                value={formData.customer_type}
                onChange={(e) => handleInputChange('customer_type', e.target.value)}
                className={FORM_STYLES.select}
              >
                <option value="retail">Retail</option>
                <option value="wholesale">Wholesale</option>
                <option value="hospital">Hospital</option>
                <option value="clinic">Clinic</option>
                <option value="pharmacy">Pharmacy</option>
              </select>
            </div>

            <div>
              <label className={FORM_STYLES.label}>Business Type</label>
              <Input
                type="text"
                value={formData.business_type}
                onChange={(e) => handleInputChange('business_type', e.target.value)}
                placeholder="e.g., Retail Pharmacy, Hospital"
              />
            </div>

            <div>
              <label className={FORM_STYLES.label}>Category</label>
              <Input
                type="text"
                value={formData.customer_category}
                onChange={(e) => handleInputChange('customer_category', e.target.value)}
                placeholder="e.g., Premium, Regular, VIP"
                list="customer-categories"
              />
              <datalist id="customer-categories">
                <option value="Premium" />
                <option value="Regular" />
                <option value="VIP" />
                <option value="New" />
              </datalist>
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
        <ContactAddressSection
          formData={formData}
          handleInputChange={handleInputChange}
        />
      )}

      {/* Compliance & GST Section */}
      {activeSection === 'compliance' && (
        <ComplianceSection
          formData={formData}
          handleInputChange={handleInputChange}
        />
      )}

      {/* Credit & Payment Section */}
      {activeSection === 'credit' && (
        <div className="space-y-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
            <CreditCard className="w-5 h-5 mr-2" />
            Credit &amp; Payment
          </h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={FORM_STYLES.label}>Credit Limit (&#8377;)</label>
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
              <label className={FORM_STYLES.label}>Credit Days</label>
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
              <label className={FORM_STYLES.label}>Current Outstanding (&#8377;)</label>
              <Input
                type="number"
                value={formData.current_outstanding}
                onChange={(e) => handleInputChange('current_outstanding', e.target.value)}
                min="0"
                placeholder="0"
              />
            </div>

            <div>
              <label className={FORM_STYLES.label}>Security Deposit (&#8377;)</label>
              <Input
                type="number"
                value={formData.security_deposit}
                onChange={(e) => handleInputChange('security_deposit', e.target.value)}
                min="0"
                placeholder="0"
              />
            </div>

            <div>
              <label className={FORM_STYLES.label}>Credit Rating</label>
              {metadata.creditRatings.length > 0 ? (
                <select
                  value={formData.credit_rating}
                  onChange={(e) => handleInputChange('credit_rating', e.target.value)}
                  className={FORM_STYLES.select}
                >
                  <option value="">Select rating</option>
                  {metadata.creditRatings.map((rating: any) => (
                    <option key={rating.value || rating} value={rating.value || rating}>
                      {rating.label || rating}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  type="text"
                  value={formData.credit_rating}
                  onChange={(e) => handleInputChange('credit_rating', e.target.value)}
                  placeholder="e.g., A, B, C or custom rating"
                />
              )}
            </div>

            <div>
              <label className={FORM_STYLES.label}>Payment Terms</label>
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
              <label className={FORM_STYLES.label}>Preferred Payment Mode</label>
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
                  placeholder="e.g., Cash, UPI, Credit"
                />
              )}
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
                    &#8377;{((formData.credit_limit || 0) - (formData.current_outstanding || 0)).toLocaleString()}
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
            <div>
              <label className={FORM_STYLES.label}>Preferred Delivery Time</label>
              <Input
                type="text"
                value={formData.preferred_delivery_time}
                onChange={(e) => handleInputChange('preferred_delivery_time', e.target.value)}
                placeholder="e.g., Morning 9 AM - 12 PM"
              />
            </div>

            <div>
              <label className={FORM_STYLES.label + ' mb-3'}>Communication Preferences</label>
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
              <label className={FORM_STYLES.label}>Internal Notes</label>
              <textarea
                value={formData.internal_notes}
                onChange={(e) => handleInputChange('internal_notes', e.target.value)}
                rows={4}
                placeholder="Add any internal notes about this customer..."
                className={FORM_STYLES.textarea}
              />
            </div>
          </div>
        </div>
      )}
    </ModalShell>
  );
};

export default CustomerEditModal;
