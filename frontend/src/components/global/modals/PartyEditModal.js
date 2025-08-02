import React, { useState, useEffect } from 'react';
import { 
  X, Save, Loader2, Building, Phone, Mail, 
  MapPin, CreditCard, Tag, Percent
} from 'lucide-react';
import { customersApi, suppliersApi } from '../../../services/api';

const PartyEditModal = ({ 
  isOpen, 
  onClose, 
  party = null,
  partyType = 'customer',
  onSave,
  mode = 'edit' // 'edit' | 'create' | 'view'
}) => {
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    type: partyType,
    gstin: '',
    pan: '',
    contact_person: '',
    phone: '',
    alt_phone: '',
    email: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    credit_limit: 0,
    credit_days: 30,
    default_discount: 0,
    place_of_supply: '',
    tags: [],
    notes: ''
  });

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  const states = [
    { code: '01', name: 'Jammu and Kashmir' },
    { code: '02', name: 'Himachal Pradesh' },
    { code: '03', name: 'Punjab' },
    { code: '04', name: 'Chandigarh' },
    { code: '05', name: 'Uttarakhand' },
    { code: '06', name: 'Haryana' },
    { code: '07', name: 'Delhi' },
    { code: '08', name: 'Rajasthan' },
    { code: '09', name: 'Uttar Pradesh' },
    { code: '10', name: 'Bihar' },
    { code: '11', name: 'Sikkim' },
    { code: '12', name: 'Arunachal Pradesh' },
    { code: '13', name: 'Nagaland' },
    { code: '14', name: 'Manipur' },
    { code: '15', name: 'Mizoram' },
    { code: '16', name: 'Tripura' },
    { code: '17', name: 'Meghalaya' },
    { code: '18', name: 'Assam' },
    { code: '19', name: 'West Bengal' },
    { code: '20', name: 'Jharkhand' },
    { code: '21', name: 'Odisha' },
    { code: '22', name: 'Chhattisgarh' },
    { code: '23', name: 'Madhya Pradesh' },
    { code: '24', name: 'Gujarat' },
    { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' },
    { code: '27', name: 'Maharashtra' },
    { code: '28', name: 'Andhra Pradesh' },
    { code: '29', name: 'Karnataka' },
    { code: '30', name: 'Goa' },
    { code: '31', name: 'Lakshadweep' },
    { code: '32', name: 'Kerala' },
    { code: '33', name: 'Tamil Nadu' },
    { code: '34', name: 'Puducherry' },
    { code: '35', name: 'Andaman and Nicobar Islands' },
    { code: '36', name: 'Telangana' },
    { code: '37', name: 'Andhra Pradesh (New)' },
    { code: '38', name: 'Ladakh' }
  ];

  const availableTags = [
    'hospital', 'clinic', 'pharmacy', 'distributor', 
    'manufacturer', 'wholesale', 'retail', 'premium', 
    'regular', 'chain', 'institution'
  ];

  useEffect(() => {
    if (party) {
      setFormData({
        name: party.name || party.party_name || party.customer_name || party.supplier_name || '',
        code: party.code || party.party_code || '',
        type: party.type || partyType,
        gstin: party.gstin || '',
        pan: party.pan || '',
        contact_person: party.contact_person || party.contact || '',
        phone: party.phone || '',
        alt_phone: party.alt_phone || party.altPhone || '',
        email: party.email || '',
        address: party.address || '',
        city: party.city || '',
        state: party.state || '',
        pincode: party.pincode || '',
        credit_limit: party.credit_limit || party.creditLimit || 0,
        credit_days: party.credit_days || party.creditDays || 30,
        default_discount: party.default_discount || party.defaultDiscount || 0,
        place_of_supply: party.place_of_supply || party.placeOfSupply || '',
        tags: party.tags || [],
        notes: party.notes || ''
      });
    }
  }, [party, partyType]);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleTagToggle = (tag) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.includes(tag) 
        ? prev.tags.filter(t => t !== tag)
        : [...prev.tags, tag]
    }));
  };

  const validateForm = () => {
    if (!formData.name.trim()) {
      setError('Party name is required');
      return false;
    }
    if (formData.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(formData.gstin)) {
      setError('Invalid GSTIN format');
      return false;
    }
    if (formData.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(formData.pan)) {
      setError('Invalid PAN format');
      return false;
    }
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
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
      
      const api = formData.type === 'supplier' ? suppliersApi : customersApi;
      
      if (party) {
        // Update existing party
        const partyId = party.id || party.customer_id || party.supplier_id || party.party_id;
        await api.update(partyId, formData);
      } else {
        // Create new party
        await api.create(formData);
      }
      
      if (onSave) {
        onSave();
      }
      
      onClose();
    } catch (err) {
      console.error('Error saving party:', err);
      setError(err.response?.data?.message || 'Failed to save party. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl m-4 max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">
                {mode === 'create' ? 'Add New Party' : mode === 'view' ? 'View Party' : 'Edit Party'}
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

          {/* Body */}
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Basic Details */}
              <div className="md:col-span-2">
                <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                  <Building className="w-5 h-5 mr-2" />
                  Basic Information
                </h3>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Party Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  disabled={mode === 'view'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Party Type
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => handleInputChange('type', e.target.value)}
                  disabled={mode === 'view' || party}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                >
                  <option value="customer">Customer</option>
                  <option value="supplier">Supplier</option>
                  <option value="both">Both</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">GSTIN</label>
                <input
                  type="text"
                  value={formData.gstin}
                  onChange={(e) => handleInputChange('gstin', e.target.value.toUpperCase())}
                  disabled={mode === 'view'}
                  placeholder="29AABCT1332L1ZN"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PAN</label>
                <input
                  type="text"
                  value={formData.pan}
                  onChange={(e) => handleInputChange('pan', e.target.value.toUpperCase())}
                  disabled={mode === 'view'}
                  placeholder="AABCT1332L"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                />
              </div>

              {/* Contact Details */}
              <div className="md:col-span-2">
                <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                  <Phone className="w-5 h-5 mr-2" />
                  Contact Information
                </h3>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contact Person</label>
                <input
                  type="text"
                  value={formData.contact_person}
                  onChange={(e) => handleInputChange('contact_person', e.target.value)}
                  disabled={mode === 'view'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  disabled={mode === 'view'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Alternate Phone</label>
                <input
                  type="tel"
                  value={formData.alt_phone}
                  onChange={(e) => handleInputChange('alt_phone', e.target.value)}
                  disabled={mode === 'view'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  disabled={mode === 'view'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                />
              </div>

              {/* Address */}
              <div className="md:col-span-2">
                <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                  <MapPin className="w-5 h-5 mr-2" />
                  Address Details
                </h3>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <textarea
                  value={formData.address}
                  onChange={(e) => handleInputChange('address', e.target.value)}
                  disabled={mode === 'view'}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => handleInputChange('city', e.target.value)}
                  disabled={mode === 'view'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                <select
                  value={formData.state}
                  onChange={(e) => handleInputChange('state', e.target.value)}
                  disabled={mode === 'view'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                >
                  <option value="">Select State</option>
                  {states.map(state => (
                    <option key={state.code} value={state.name}>
                      {state.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pincode</label>
                <input
                  type="text"
                  value={formData.pincode}
                  onChange={(e) => handleInputChange('pincode', e.target.value)}
                  disabled={mode === 'view'}
                  maxLength={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Place of Supply</label>
                <select
                  value={formData.place_of_supply}
                  onChange={(e) => handleInputChange('place_of_supply', e.target.value)}
                  disabled={mode === 'view'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                >
                  <option value="">Select Place of Supply</option>
                  {states.map(state => (
                    <option key={state.code} value={state.code}>
                      {state.code} - {state.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Commercial Terms */}
              <div className="md:col-span-2">
                <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                  <CreditCard className="w-5 h-5 mr-2" />
                  Commercial Terms
                </h3>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Credit Limit (₹)</label>
                <input
                  type="number"
                  value={formData.credit_limit}
                  onChange={(e) => handleInputChange('credit_limit', parseFloat(e.target.value) || 0)}
                  disabled={mode === 'view'}
                  min={0}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Credit Days</label>
                <input
                  type="number"
                  value={formData.credit_days}
                  onChange={(e) => handleInputChange('credit_days', parseInt(e.target.value) || 0)}
                  disabled={mode === 'view'}
                  min={0}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                  <Percent className="w-4 h-4 mr-1" />
                  Default Discount (%)
                </label>
                <input
                  type="number"
                  value={formData.default_discount}
                  onChange={(e) => handleInputChange('default_discount', parseFloat(e.target.value) || 0)}
                  disabled={mode === 'view'}
                  min={0}
                  max={100}
                  step={0.1}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                />
              </div>

              {/* Tags */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                  <Tag className="w-4 h-4 mr-1" />
                  Tags
                </label>
                <div className="flex flex-wrap gap-2">
                  {availableTags.map(tag => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleTagToggle(tag)}
                      disabled={mode === 'view'}
                      className={`px-3 py-1 rounded-full text-sm ${
                        formData.tags.includes(tag)
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      } disabled:cursor-not-allowed`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => handleInputChange('notes', e.target.value)}
                  disabled={mode === 'view'}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                  placeholder="Any additional notes about this party..."
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end space-x-3">
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
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>{party ? 'Update Party' : 'Add Party'}</span>
                  </>
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default PartyEditModal;