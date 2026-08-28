import React, { useState, useRef } from 'react';
import { Building2, MapPin, CreditCard, Save, User } from 'lucide-react';
import { suppliersApi } from '../../../services/api';
import { apiErrorMessage } from '../../../services/api/utils/apiError';
import GSTJurisdictionSelect from '../../global/ui/forms/GSTJurisdictionSelect';
import { toast } from 'react-toastify';
import { newMasterCreateIdempotencyKey } from '../../../services/api/modules/master/masterCreationContract';
import type { CanonicalSupplierCreateResponse } from '../../../services/api/modules/master/masterCreationContract';

interface CanonicalSupplierFormData {
  supplier_name: string;
  contact_person: string;
  phone: string;
  email: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state_code: string;
  pincode: string;
  gst_number: string;
  pan_number: string;
  payment_days: number | '';
}

interface SupplierCreationFormProps {
  initialData?: Partial<CanonicalSupplierFormData>;
  onSupplierCreated?: (supplier: CanonicalSupplierCreateResponse) => void;
  onCancel?: () => void;
  embedded?: boolean;
}

// ==================== INLINE TRANSFORMER ====================

/**
 * Transform supplier data for API submission
 */
const transformSupplierForAPI = (formData: CanonicalSupplierFormData) => ({
  supplier_name: formData.supplier_name,
  contact_person: formData.contact_person || null,
  primary_phone: formData.phone || null,
  primary_email: formData.email || null,
  address_line1: formData.address_line1 || null,
  address_line2: formData.address_line2 || null,
  city: formData.city || null,
  state_code: formData.state_code || null,
  pincode: formData.pincode || null,
  gst_number: formData.gst_number || null,
  pan_number: formData.pan_number || null,
  payment_days: parseInt(String(formData.payment_days), 10),
});

/**
 * Supplier Creation Form - Extracted from global component for inline use
 * Clean layout matching the global component design
 */
const SupplierCreationForm = ({
  initialData = {},
  onSupplierCreated,
  onCancel,
  embedded = false
}: SupplierCreationFormProps) => {
  const submissionInFlightRef = useRef(false);
  const idempotencyKeyRef = useRef(newMasterCreateIdempotencyKey('supplier'));
  const [saving, setSaving] = useState(false);

  // PDF extraction is advisory. Admit only fields owned by the reviewed
  // canonical supplier-create contract into editable state.
  const [formData, setFormData] = useState<CanonicalSupplierFormData>(() => ({
    supplier_name: initialData.supplier_name || '',
    contact_person: initialData.contact_person || '',
    phone: initialData.phone || '',
    email: initialData.email || '',
    address_line1: initialData.address_line1 || '',
    address_line2: initialData.address_line2 || '',
    city: initialData.city || '',
    state_code: initialData.state_code || '',
    pincode: initialData.pincode || '',
    gst_number: initialData.gst_number || '',
    pan_number: initialData.pan_number || '',
    payment_days: initialData.payment_days ?? '',
  }));

  const [errors, setErrors] = useState<Record<string, string | null>>({});

  const handleInputChange = (
    field: keyof CanonicalSupplierFormData,
    value: string | number,
  ) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error for this field when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.supplier_name) {
      newErrors.supplier_name = 'Supplier name is required';
    }
    if (!formData.phone) {
      newErrors.phone = 'Phone number is required';
    }

    if (!formData.address_line1 || !formData.city || !/^\d{2}$/.test(formData.state_code) || !/^\d{6}$/.test(formData.pincode)) {
      newErrors.address = 'Complete address, city, 2-digit GST state code, and 6-digit pincode are required';
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
    }

    if (formData.gst_number && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(formData.gst_number)) {
      newErrors.gst_number = 'Invalid GSTIN format';
    }
    if (formData.gst_number && /^\d{2}$/.test(formData.state_code)
      && formData.gst_number.slice(0, 2) !== formData.state_code) {
      newErrors.gst_number = 'GSTIN state code must match the address GST state code';
    }
    if (formData.payment_days === ''
      || !Number.isInteger(Number(formData.payment_days))
      || Number(formData.payment_days) < 0
      || Number(formData.payment_days) > 180) {
      newErrors.payment_days = 'Payment days must be a whole number from 0 to 180';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e?: React.FormEvent<HTMLFormElement>) => {
    e?.preventDefault();

    if (!validateForm()) {
      return;
    }
    if (submissionInFlightRef.current) return;

    submissionInFlightRef.current = true;
    setSaving(true);

    try {
      // Transform data for API
      const dataToSend = transformSupplierForAPI(formData);

      const response = await suppliersApi.create(dataToSend, idempotencyKeyRef.current);

      if (response) {
        toast.success(`Supplier ${response.data.supplier_code} created successfully.`);
        idempotencyKeyRef.current = newMasterCreateIdempotencyKey('supplier');
        if (onSupplierCreated) {
          onSupplierCreated(response.data);
        }
      } else {
        throw new Error('Failed to create supplier');
      }
    } catch (error: unknown) {
      setErrors({ submit: apiErrorMessage(error, 'Failed to create supplier') });
    } finally {
      submissionInFlightRef.current = false;
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Basic Information Section */}
      <div>
        <h3 className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-blue-600" />
          Basic Information
        </h3>
        <p className="mb-3 text-xs text-gray-500">
          Internal supplier code is generated automatically after saving.
        </p>
        <div className="space-y-3">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="lg:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Supplier Name *
              </label>
              <input
                type="text"
                value={formData.supplier_name}
                onChange={(e) => handleInputChange('supplier_name', e.target.value)}
                className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${errors.supplier_name ? 'border-red-300' : 'border-gray-300'
                  }`}
                placeholder="e.g., ABC Pharmaceuticals"
              />
              {errors.supplier_name && (
                <p className="mt-1 text-xs text-red-600">{errors.supplier_name}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Payment days *
              </label>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={180}
                step={1}
                value={formData.payment_days}
                onChange={(e) => handleInputChange('payment_days', e.target.value === '' ? '' : Number(e.target.value))}
                className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 ${errors.payment_days ? 'border-red-300' : 'border-gray-300'
                  }`}
                placeholder="Enter payment days"
              />
              {errors.payment_days && (
                <p className="mt-1 text-xs text-red-600">{errors.payment_days}</p>
              )}
            </div>
          </div>

          {/* Business Contact - Single Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Phone *
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${errors.phone ? 'border-red-300' : 'border-gray-300'
                  }`}
                placeholder="Business phone"
              />
              {errors.phone && (
                <p className="mt-1 text-xs text-red-600">{errors.phone}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${errors.email ? 'border-red-300' : 'border-gray-300'
                  }`}
                placeholder="Business email"
              />
            </div>

          </div>

          {/* Contact Person - Optional compact section */}
          <details className="border rounded-lg p-3 bg-gray-50">
            <summary className="text-sm font-semibold text-gray-800 cursor-pointer flex items-center gap-2">
              <User className="w-4 h-4 text-indigo-600" />
              Contact Person (Optional)
            </summary>
            <div className="grid grid-cols-1 gap-3 mt-3">
              <div>
                <input
                  type="text"
                  value={formData.contact_person}
                  onChange={(e) => handleInputChange('contact_person', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500"
                  placeholder="Contact person name"
                />
              </div>
            </div>
          </details>
        </div>
      </div>

      {/* Address Section */}
      <div>
        <h3 className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-green-600" />
          Address Information
        </h3>
        <div className="space-y-2">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Address Line 1
              </label>
              <input
                type="text"
                value={formData.address_line1}
                onChange={(e) => handleInputChange('address_line1', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                placeholder="Street address"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Address Line 2
              </label>
              <input
                type="text"
                value={formData.address_line2}
                onChange={(e) => handleInputChange('address_line2', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                placeholder="Apartment, suite, etc."
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                City
              </label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => handleInputChange('city', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                placeholder="City"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                GST state code (2 digits)
              </label>
              <GSTJurisdictionSelect
                value={formData.state_code}
                onChange={(stateCode) => handleInputChange('state_code', stateCode)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Pincode
              </label>
              <input
                type="text"
                value={formData.pincode}
                onChange={(e) => handleInputChange('pincode', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                placeholder="000000"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Tax & Compliance Section */}
      <details className="border rounded-lg p-3 bg-gray-50">
        <summary className="text-sm font-semibold text-gray-800 cursor-pointer flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-purple-600" />
          Tax & Compliance
        </summary>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              GSTIN
            </label>
            <input
              type="text"
              value={formData.gst_number}
              onChange={(e) => handleInputChange('gst_number', e.target.value.toUpperCase())}
              className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-purple-500 ${errors.gst_number ? 'border-red-300' : 'border-gray-300'
                }`}
              placeholder="00AAAAA0000A0Z0"
            />
            {errors.gst_number && (
              <p className="mt-1 text-xs text-red-600">{errors.gst_number}</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              PAN Number
            </label>
            <input
              type="text"
              value={formData.pan_number}
              onChange={(e) => handleInputChange('pan_number', e.target.value.toUpperCase())}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
              placeholder="AAAAA0000A"
            />
          </div>
        </div>
      </details>

      {/* Error Message */}
      {(errors.submit || errors.address) && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <p className="text-xs text-red-600">{errors.submit || errors.address}</p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-end space-x-3 pt-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 text-sm"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? 'Creating...' : 'Create Supplier'}</span>
        </button>
      </div>
    </form>
  );
};

export default SupplierCreationForm;
