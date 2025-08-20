import React, { useState, useEffect } from 'react';
import { MapPin, Edit2, Plus, Check, X } from 'lucide-react';

/**
 * Address Selector Component
 * Allows users to select, edit, or add addresses
 */
const AddressSelector = ({
  customer,
  currentAddress,
  addressType = 'billing', // 'billing' or 'shipping'
  onChange,
  onSave,
  sameAsBilling = false,
  onSameAsBillingChange,
  className = ''
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editableAddress, setEditableAddress] = useState('');
  const [addresses, setAddresses] = useState([]);
  const [localAddress, setLocalAddress] = useState(currentAddress || '');

  useEffect(() => {
    if (customer) {
      // Build default address from customer data
      const defaultAddress = buildAddressString(customer);
      
      // Get saved addresses if available
      const savedAddresses = customer.addresses || [];
      
      // Combine default with saved addresses
      const allAddresses = [
        { id: 'default', label: 'Default Address', value: defaultAddress, isDefault: true },
        ...savedAddresses
      ];
      
      setAddresses(allAddresses);
      
      // Set local address if not already set
      if (!localAddress && defaultAddress) {
        setLocalAddress(defaultAddress);
        // Only call onChange if address actually changed
        if (defaultAddress !== currentAddress) {
          onChange(defaultAddress);
        }
      }
    }
  }, [customer]); // Remove onChange from deps to avoid infinite loop
  
  // Update local address when currentAddress prop changes
  useEffect(() => {
    if (currentAddress && currentAddress !== localAddress) {
      setLocalAddress(currentAddress);
    }
  }, [currentAddress]);

  const buildAddressString = (customer) => {
    const parts = [];
    if (customer.address) parts.push(customer.address);
    if (customer.city) parts.push(customer.city);
    if (customer.state) parts.push(customer.state);
    if (customer.pincode) parts.push(customer.pincode);
    return parts.filter(Boolean).join(', ');
  };

  const handleEdit = () => {
    setEditableAddress(currentAddress || '');
    setIsEditing(true);
  };

  const handleSave = () => {
    setLocalAddress(editableAddress);
    onChange(editableAddress);
    setIsEditing(false);
    
    // Optionally save to backend
    if (onSave) {
      onSave(editableAddress);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditableAddress('');
  };

  const handleSelectAddress = (address) => {
    onChange(address.value);
  };

  if (addressType === 'shipping' && sameAsBilling) {
    return (
      <div className={`bg-gray-50 p-3 rounded-lg ${className}`}>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700 flex items-center">
            <MapPin className="w-4 h-4 mr-1" />
            Shipping Address
          </label>
          <label className="flex items-center text-sm">
            <input
              type="checkbox"
              checked={sameAsBilling}
              onChange={(e) => onSameAsBillingChange && onSameAsBillingChange(e.target.checked)}
              className="mr-2 rounded border-gray-300"
            />
            Same as billing
          </label>
        </div>
        <p className="text-sm text-gray-600 italic">Using billing address</p>
      </div>
    );
  }

  return (
    <div className={`bg-white border border-gray-200 rounded-lg p-3 ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium text-gray-700 flex items-center">
          <MapPin className="w-4 h-4 mr-1" />
          {addressType === 'billing' ? 'Billing Address' : 'Shipping Address'}
        </label>
        <div className="flex items-center gap-2">
          {addressType === 'shipping' && onSameAsBillingChange && (
            <label className="flex items-center text-sm">
              <input
                type="checkbox"
                checked={sameAsBilling}
                onChange={(e) => onSameAsBillingChange(e.target.checked)}
                className="mr-2 rounded border-gray-300"
              />
              Same as billing
            </label>
          )}
          {!isEditing && (
            <button
              onClick={handleEdit}
              className="text-blue-600 hover:text-blue-700 p-1"
              title="Edit address"
            >
              <Edit2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {isEditing ? (
        <div className="space-y-2">
          <textarea
            value={editableAddress}
            onChange={(e) => setEditableAddress(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            rows="3"
            placeholder="Enter complete address..."
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={handleCancel}
              className="px-3 py-1 text-gray-600 hover:bg-gray-100 rounded-lg text-sm"
            >
              <X className="w-4 h-4 inline mr-1" />
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-3 py-1 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-sm"
            >
              <Check className="w-4 h-4 inline mr-1" />
              Save
            </button>
          </div>
        </div>
      ) : (
        <>
          {addresses.length > 1 && (
            <div className="mb-2">
              <select
                value={currentAddress}
                onChange={(e) => onChange(e.target.value)}
                className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {addresses.map(addr => (
                  <option key={addr.id} value={addr.value}>
                    {addr.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="text-sm text-gray-700">
            {localAddress || currentAddress || (
              <span className="text-gray-400 italic">No address available</span>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default AddressSelector;