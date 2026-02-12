import React, { useState, useEffect } from 'react';
import { Truck, Phone, Shield, CreditCard, Building, Banknote } from 'lucide-react';
import { suppliersApi, metadataApi } from '../../../services/api';
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

  const getInitialFormData = () => ({
    supplier_code: supplier?.supplier_code || '',
    supplier_name: supplier?.supplier_name || '',
    supplier_type: supplier?.supplier_type || 'distributor',
    supplier_category: supplier?.supplier_category || '',
    primary_phone: supplier?.primary_phone || '',
    primary_email: supplier?.primary_email || '',
    secondary_phone: supplier?.secondary_phone || '',
    whatsapp_number: supplier?.whatsapp_number || '',
    contact_person: supplier?.contact_person || '',
    contact_person_phone: supplier?.contact_person_phone || '',
    contact_person_designation: supplier?.contact_person_designation || '',
    address_line_1: supplier?.address_line_1 || '',
    address_line_2: supplier?.address_line_2 || '',
    city: supplier?.city || '',
    state: supplier?.state || '',
    pincode: supplier?.pincode || '',
    gst_number: supplier?.gst_number || '',
    pan_number: supplier?.pan_number || '',
    drug_license_number: supplier?.drug_license_number || '',
    drug_license_validity: supplier?.drug_license_validity || '',
    fssai_number: supplier?.fssai_number || '',
    payment_days: supplier?.payment_days || 30,
    payment_terms: supplier?.payment_terms || '',
    credit_limit: supplier?.credit_limit || 0,
    current_outstanding: supplier?.current_outstanding || 0,
    bank_name: supplier?.bank_name || '',
    bank_branch: supplier?.bank_branch || '',
    account_number: supplier?.account_number || '',
    account_holder_name: supplier?.account_holder_name || '',
    ifsc_code: supplier?.ifsc_code || '',
    upi_id: supplier?.upi_id || '',
    preferred_payment_mode: supplier?.preferred_payment_mode || '',
    preferred_delivery_time: supplier?.preferred_delivery_time || '',
    minimum_order_value: supplier?.minimum_order_value || 0,
    delivery_lead_time: supplier?.delivery_lead_time || '',
    is_active: supplier?.is_active !== false,
    is_verified: supplier?.is_verified || false,
    internal_notes: supplier?.internal_notes || ''
  });

  const [formData, setFormData] = useState(getInitialFormData());
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState('basic');

  const [metadata, setMetadata] = useState<any>({
    supplierTypes: [],
    supplierCategories: [],
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
  }, [isOpen, supplier]);

  const loadMetadata = async () => {
    try {
      const [paymentTerms, paymentModes] = await Promise.all([
        metadataApi.getPaymentTerms().catch(() => ({ data: [] })),
        metadataApi.getPaymentModes().catch(() => ({ data: [] }))
      ]);

      setMetadata({
        supplierTypes: [
          { value: 'manufacturer', label: 'Manufacturer' },
          { value: 'distributor', label: 'Distributor' },
          { value: 'wholesaler', label: 'Wholesaler' },
          { value: 'stockist', label: 'Stockist' },
          { value: 'cnf', label: 'C&F Agent' }
        ],
        supplierCategories: [],
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
        gst_number: formData.gst_number
      };

      if (supplier) {
        const response = await suppliersApi.update(supplier.supplier_id, dataToSave);
        toast.success('Supplier updated successfully');
        onSave(response.data || dataToSave);
      } else {
        if (!dataToSave.supplier_code) {
          dataToSave.supplier_code = `SUPP${Date.now().toString().slice(-6)}`;
        }

        const tempId = `LOCAL_SUPP_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const localRecord = {
          id: tempId,
          supplier_id: tempId,
          _localId: tempId,
          ...dataToSave,
          name: dataToSave.supplier_name,
          phone: dataToSave.primary_phone,
          sync_status: 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          created_offline: true
        };

        const db = await offlineDB.init();
        await db.put('suppliers', localRecord);
        await offlineDB.addToSyncQueue('supplier', tempId, 'create', localRecord);

        toast.success(`Supplier created${navigator.onLine ? '' : ' (offline)'}${!navigator.onLine ? ' - will sync when online' : ''}`);

        if (navigator.onLine) {
          syncEngine.startSync().catch(() => {});
        }

        onSave(localRecord);
      }

      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save supplier');
    } finally {
      setIsSaving(false);
    }
  };

  const sections = [
    { id: 'basic', label: 'Basic Information', icon: Truck },
    { id: 'contact', label: 'Contact & Address', icon: Phone },
    { id: 'compliance', label: 'Compliance & GST', icon: Shield },
    { id: 'banking', label: 'Banking Details', icon: Banknote },
    { id: 'payment', label: 'Payment Terms', icon: CreditCard },
    { id: 'additional', label: 'Additional Info', icon: Building }
  ];

  return (
    <ModalShell
      isOpen={isOpen}
      title={supplier ? 'Edit Supplier' : 'Add New Supplier'}
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
          isEditing={!!supplier}
          entityLabel="Supplier"
          entityId={supplier?.supplier_id}
          onClose={onClose}
        />
      }
    >
      {/* Basic Information Section */}
      {activeSection === 'basic' && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
            <Truck className="w-5 h-5 mr-2" />
            Basic Information
          </h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={FORM_STYLES.labelRequired}>Supplier Name</label>
              <Input
                type="text"
                required
                value={formData.supplier_name}
                onChange={(e) => handleInputChange('supplier_name', e.target.value)}
                placeholder="Enter supplier name"
              />
            </div>

            <div>
              <label className={FORM_STYLES.label}>Supplier Code</label>
              <Input
                type="text"
                value={formData.supplier_code}
                onChange={(e) => handleInputChange('supplier_code', e.target.value)}
                placeholder="Auto-generated if empty"
              />
            </div>

            <div>
              <label className={FORM_STYLES.label}>Supplier Type</label>
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
              <label className={FORM_STYLES.label}>Category</label>
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
        <ContactAddressSection
          formData={formData}
          handleInputChange={handleInputChange}
          extraContactPersonFields={
            <div>
              <label className={FORM_STYLES.label}>Designation</label>
              <Input
                type="text"
                value={formData.contact_person_designation}
                onChange={(e) => handleInputChange('contact_person_designation', e.target.value)}
                placeholder="Sales Manager"
              />
            </div>
          }
        />
      )}

      {/* Compliance & GST Section */}
      {activeSection === 'compliance' && (
        <ComplianceSection
          formData={formData}
          handleInputChange={handleInputChange}
        />
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
              <label className={FORM_STYLES.label}>Bank Name</label>
              <Input
                type="text"
                value={formData.bank_name}
                onChange={(e) => handleInputChange('bank_name', e.target.value)}
                placeholder="State Bank of India"
              />
            </div>

            <div>
              <label className={FORM_STYLES.label}>Bank Branch</label>
              <Input
                type="text"
                value={formData.bank_branch}
                onChange={(e) => handleInputChange('bank_branch', e.target.value)}
                placeholder="Fort Branch, Mumbai"
              />
            </div>

            <div>
              <label className={FORM_STYLES.label}>Account Number</label>
              <Input
                type="text"
                value={formData.account_number}
                onChange={(e) => handleInputChange('account_number', e.target.value)}
                placeholder="1234567890"
              />
            </div>

            <div>
              <label className={FORM_STYLES.label}>Account Holder Name</label>
              <Input
                type="text"
                value={formData.account_holder_name}
                onChange={(e) => handleInputChange('account_holder_name', e.target.value)}
                placeholder="Company Name"
              />
            </div>

            <div>
              <label className={FORM_STYLES.label}>IFSC Code</label>
              <Input
                type="text"
                value={formData.ifsc_code}
                onChange={(e) => handleInputChange('ifsc_code', e.target.value.toUpperCase())}
                placeholder="SBIN0000123"
              />
            </div>

            <div>
              <label className={FORM_STYLES.label}>UPI ID</label>
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
              <label className={FORM_STYLES.label}>Payment Days</label>
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
              <label className={FORM_STYLES.label}>Credit Limit (&#8377;)</label>
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
                  placeholder="e.g., NEFT, Cheque, Cash"
                />
              )}
            </div>

            <div>
              <label className={FORM_STYLES.label}>Minimum Order Value (&#8377;)</label>
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
                <label className={FORM_STYLES.label}>Preferred Delivery Time</label>
                <Input
                  type="text"
                  value={formData.preferred_delivery_time}
                  onChange={(e) => handleInputChange('preferred_delivery_time', e.target.value)}
                  placeholder="e.g., Morning 9 AM - 12 PM"
                />
              </div>

              <div>
                <label className={FORM_STYLES.label}>Delivery Lead Time</label>
                <Input
                  type="text"
                  value={formData.delivery_lead_time}
                  onChange={(e) => handleInputChange('delivery_lead_time', e.target.value)}
                  placeholder="e.g., 2-3 days"
                />
              </div>
            </div>

            <div>
              <label className={FORM_STYLES.label}>Internal Notes</label>
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
    </ModalShell>
  );
};

export default SupplierEditModal;
