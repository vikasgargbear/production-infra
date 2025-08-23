import React, { useState, useEffect } from 'react';
import { MapPin, Edit2, Check, X } from 'lucide-react';

/**
 * Multi-field Address Form Component
 * Proper address input with separate fields like professional ERPs
 */
const AddressForm = ({
  customer,
  addressData,
  addressType = 'billing',
  onChange,
  onSave,
  sameAsBilling = false,
  onSameAsBillingChange,
  billingAddressData = null, // For shipping address when same as billing
  className = ''
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    pincode: '',
    country: 'India',
    mobile: '' // Add mobile field
  });

  // Initialize form data from customer or addressData - PREVENT INFINITE LOOP
  useEffect(() => {
    if (customer || addressData) {
      const source = addressData || customer;
      setFormData({
        address_line1: source.address || source.address_line1 || '',
        address_line2: source.address2 || source.address_line2 || '',
        city: source.city || '',
        state: source.state || source.state_name || '',
        pincode: source.pincode || source.pin_code || source.postal_code || '',
        country: source.country || 'India',
        mobile: source.mobile || source.phone || source.primary_phone || '' // Include mobile
      });
      
      // DON'T automatically call onChange to prevent infinite loops
      // Only call onChange when user explicitly edits
    }
  }, [customer]);  // Remove addressData from deps to prevent loops

  const buildAddressString = (data) => {
    const parts = [];
    if (data.address_line1) parts.push(data.address_line1);
    if (data.address_line2) parts.push(data.address_line2);
    if (data.city) parts.push(data.city);
    if (data.state) parts.push(data.state);
    if (data.pincode) parts.push(data.pincode);
    return parts.filter(Boolean).join(', ');
  };

  const handleFieldChange = (field, value) => {
    const newData = { ...formData, [field]: value };
    setFormData(newData);
    
    // Send updated address string
    const addressString = buildAddressString(newData);
    if (onChange) {
      onChange(addressString);
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSave = () => {
    setIsEditing(false);
    const addressString = buildAddressString(formData);
    
    if (onChange) {
      onChange(addressString);
    }
    
    if (onSave) {
      onSave(formData);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    // Reset to original data
    if (customer) {
      setFormData({
        address_line1: customer.address || '',
        address_line2: customer.address2 || '',
        city: customer.city || '',
        state: customer.state || '',
        pincode: customer.pincode || '',
        country: customer.country || 'India'
      });
    }
  };

  // If shipping and same as billing, show the actual billing address
  if (addressType === 'shipping' && sameAsBilling) {
    const displayData = billingAddressData || formData;
    return (
      <div className={`p-4 ${className}`}>
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-medium text-gray-700 flex items-center">
            <MapPin className="w-4 h-4 mr-1" />
            Shipping Address
          </label>
          <label className="flex items-center text-sm no-print">
            <input
              type="checkbox"
              checked={sameAsBilling}
              onChange={(e) => onSameAsBillingChange && onSameAsBillingChange(e.target.checked)}
              className="mr-2 rounded border-gray-300"
            />
            <span className="no-print">Same as billing</span>
          </label>
        </div>
        <div className="space-y-1">
          {displayData.address_line1 || displayData.address_line2 || displayData.city ? (
            <>
              {displayData.address_line1 && (
                <div className="text-sm text-gray-700">{displayData.address_line1}</div>
              )}
              {displayData.address_line2 && (
                <div className="text-sm text-gray-600">{displayData.address_line2}</div>
              )}
              <div className="text-sm text-gray-700">
                {[displayData.city, displayData.state, displayData.pincode].filter(Boolean).join(', ')}
              </div>
              {displayData.mobile && addressType === 'billing' && (
                <div className="text-sm text-gray-600">Mobile: {displayData.mobile}</div>
              )}
            </>
          ) : (
            <div className="text-sm text-gray-400 italic">
              Using billing address
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <label className="text-sm font-medium text-gray-700 flex items-center">
          <MapPin className="w-4 h-4 mr-1" />
          {addressType === 'billing' ? 'Billing Address' : 'Shipping Address'}
        </label>
        <div className="flex items-center gap-2">
          {addressType === 'shipping' && onSameAsBillingChange && (
            <label className="flex items-center text-sm no-print">
              <input
                type="checkbox"
                checked={sameAsBilling}
                onChange={(e) => onSameAsBillingChange(e.target.checked)}
                className="mr-2 rounded border-gray-300"
              />
              <span className="no-print">Same as billing</span>
            </label>
          )}
          {!isEditing && (
            <button
              onClick={handleEdit}
              className="text-blue-600 hover:text-blue-700 p-1 no-print"
              title="Edit address"
            >
              <Edit2 className="w-4 h-4 no-print" />
            </button>
          )}
        </div>
      </div>

      {isEditing ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Address Line 1
              </label>
              <input
                type="text"
                value={formData.address_line1}
                onChange={(e) => handleFieldChange('address_line1', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                placeholder="Street address, building, floor"
                autoFocus
              />
            </div>
            
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Address Line 2 (Optional)
              </label>
              <input
                type="text"
                value={formData.address_line2}
                onChange={(e) => handleFieldChange('address_line2', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                placeholder="Landmark, area"
              />
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                City
              </label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => handleFieldChange('city', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                placeholder="City"
              />
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                State
              </label>
              <input
                type="text"
                value={formData.state}
                onChange={(e) => handleFieldChange('state', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                placeholder="State"
              />
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Pincode
              </label>
              <input
                type="text"
                value={formData.pincode}
                onChange={(e) => handleFieldChange('pincode', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                placeholder="Pincode"
                pattern="[0-9]{6}"
                maxLength="6"
              />
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Country
              </label>
              <input
                type="text"
                value={formData.country}
                disabled
                className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-md text-sm text-gray-500"
              />
            </div>
            
            {addressType === 'billing' && (
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Mobile Number
                </label>
                <input
                  type="tel"
                  value={formData.mobile}
                  onChange={(e) => handleFieldChange('mobile', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="Mobile number"
                  pattern="[0-9]{10}"
                  maxLength="10"
                />
              </div>
            )}
          </div>
          
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-md text-sm"
            >
              <X className="w-4 h-4 inline mr-1" />
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-3 py-1.5 bg-blue-600 text-white hover:bg-blue-700 rounded-md text-sm"
            >
              <Check className="w-4 h-4 inline mr-1" />
              Save
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          {formData.address_line1 || formData.address_line2 || formData.city ? (
            <>
              {formData.address_line1 && (
                <div className="text-sm text-gray-700">{formData.address_line1}</div>
              )}
              {formData.address_line2 && (
                <div className="text-sm text-gray-600">{formData.address_line2}</div>
              )}
              <div className="text-sm text-gray-700">
                {[formData.city, formData.state, formData.pincode].filter(Boolean).join(', ')}
              </div>
              {formData.mobile && addressType === 'billing' && (
                <div className="text-sm text-gray-600">Mobile: {formData.mobile}</div>
              )}
            </>
          ) : (
            <div className="text-sm text-gray-400 italic">
              No address available. Click edit to add address.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AddressForm;