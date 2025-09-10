import React, { useState, useEffect } from 'react';
import { MapPin, Edit2, Check, X, ChevronDown, Plus, Phone, Building2, Home } from 'lucide-react';
import { apiClient } from '../../../services/api';

/**
 * Enhanced Multi-field Address Form Component with Address Selection
 * Features:
 * - Dropdown selection for multiple saved addresses
 * - Add new address capability
 * - Mobile number field included
 * - Professional address management
 */
const AddressForm = ({
  customer,
  addressData,
  addressType = 'billing',
  onChange,
  onSave,
  sameAsBilling = false,
  onSameAsBillingChange,
  billingAddressData = null,
  className = ''
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [loadingAddresses, setLoadingAddresses] = useState(false);
  
  const [formData, setFormData] = useState({
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    pincode: '',
    country: 'India',
    mobile: '',
    landmark: ''
  });

  // Fetch customer addresses when customer changes
  useEffect(() => {
    if (customer?.customer_id) {
      fetchCustomerAddresses(customer.customer_id);
    } else if (customer) {
      // If customer exists but no saved addresses, use customer data
      const mobileNumber = customer.mobile || customer.phone || 
                          customer.primary_phone || customer.contact_number || 
                          addressData?.mobile || '';
      
      setFormData({
        address_line1: customer.address || addressData?.address_line1 || '',
        address_line2: customer.address2 || addressData?.address_line2 || '',
        city: customer.city || addressData?.city || '',
        state: customer.state || customer.state_name || addressData?.state || '',
        pincode: customer.pincode || customer.pin_code || addressData?.pincode || '',
        country: customer.country || addressData?.country || 'India',
        mobile: mobileNumber,
        landmark: customer.landmark || addressData?.landmark || ''
      });
    }
  }, [customer]);

  // Fetch saved addresses from backend
  const fetchCustomerAddresses = async (customerId) => {
    setLoadingAddresses(true);
    try {
      const response = await apiClient.get(`/customers/${customerId}/addresses`);
      
      if (response.data?.success && response.data.data) {
        const addresses = response.data.data;
        // Filter addresses by type - only show relevant addresses
        const filteredAddresses = addresses.filter(addr => 
          !addr.address_type || addr.address_type === addressType || addr.is_default
        );
        setSavedAddresses(filteredAddresses.length > 0 ? filteredAddresses : addresses);
        
        // Auto-select the appropriate default address
        const defaultAddr = filteredAddresses.find(addr => 
          addr.address_type === addressType && addr.is_default
        ) || filteredAddresses.find(addr => addr.is_default) || filteredAddresses[0];
        
        if (defaultAddr) {
          selectAddress(defaultAddr);
        }
      }
    } catch (error) {
      // Fallback to customer data if fetch fails
      const fallbackAddress = {
        id: 'default',
        label: addressType === 'billing' ? 'Billing Address' : 'Shipping Address',
        address_line1: customer.address || '',
        address_line2: customer.address2 || '',
        city: customer.city || '',
        state: customer.state || customer.state_name || '',
        pincode: customer.pincode || customer.pin_code || '',
        mobile: customer.mobile || customer.phone || customer.primary_phone || '',
        country: 'India'
      };
      setSavedAddresses([fallbackAddress]);
      selectAddress(fallbackAddress);
    } finally {
      setLoadingAddresses(false);
    }
  };

  // Select an address from dropdown
  const selectAddress = (address) => {
    setSelectedAddressId(address.id || address.address_id);
    // Ensure mobile is always filled from customer if not in address
    const mobileNumber = address.mobile || address.phone || 
                        customer?.mobile || customer?.phone || 
                        customer?.primary_phone || customer?.contact_number || '';
    
    setFormData({
      address_line1: address.address_line1 || address.address || '',
      address_line2: address.address_line2 || address.address2 || '',
      city: address.city || '',
      state: address.state || address.state_name || '',
      pincode: address.pincode || address.pin_code || address.postal_code || '',
      country: address.country || 'India',
      mobile: mobileNumber,
      landmark: address.landmark || ''
    });
    
    // Notify parent of change
    const addressString = buildAddressString(address);
    if (onChange) {
      onChange(addressString);
    }
    if (onSave) {
      onSave({
        ...address,
        mobile: address.mobile || customer?.phone || customer?.mobile
      });
    }
    
    setShowDropdown(false);
    setIsEditing(false);
    setIsAddingNew(false);
  };

  const buildAddressString = (data) => {
    const parts = [];
    if (data.address_line1) parts.push(data.address_line1);
    if (data.address_line2) parts.push(data.address_line2);
    if (data.landmark) parts.push(`Near ${data.landmark}`);
    if (data.city) parts.push(data.city);
    if (data.state) parts.push(data.state);
    if (data.pincode) parts.push(data.pincode);
    if (data.mobile) parts.push(`Ph: ${data.mobile}`);
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
    setShowDropdown(true);
  };

  const handleAddNew = () => {
    setIsAddingNew(true);
    setIsEditing(true);
    setShowDropdown(false);
    setSelectedAddressId(null);
    
    // Clear form for new address
    // Pre-fill mobile from customer when adding new address
    const mobileNumber = customer?.mobile || customer?.phone || 
                        customer?.primary_phone || customer?.contact_number || '';
    
    setFormData({
      address_line1: '',
      address_line2: '',
      city: '',
      state: '',
      pincode: '',
      country: 'India',
      mobile: mobileNumber,
      landmark: ''
    });
  };

  const handleSave = async () => {
    const addressString = buildAddressString(formData);
    
    // Save to backend if adding new
    if (isAddingNew && customer?.customer_id) {
      try {
        const response = await apiClient.post(`/customers/${customer.customer_id}/addresses`, {
          ...formData,
          address_type: addressType,
          is_default: savedAddresses.length === 0
        });
        
        if (response.data?.success) {
          // Refresh addresses list
          await fetchCustomerAddresses(customer.customer_id);
        }
      } catch (error) {
      }
    }
    
    setIsEditing(false);
    setIsAddingNew(false);
    
    if (onChange) {
      onChange(addressString);
    }
    
    if (onSave) {
      onSave(formData);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setIsAddingNew(false);
    setShowDropdown(false);
    
    // Reset to selected address or customer data
    if (selectedAddressId && savedAddresses.length > 0) {
      const selected = savedAddresses.find(a => a.id === selectedAddressId || a.address_id === selectedAddressId);
      if (selected) selectAddress(selected);
    } else if (customer) {
      setFormData({
        address_line1: customer.address || '',
        address_line2: customer.address2 || '',
        city: customer.city || '',
        state: customer.state || '',
        pincode: customer.pincode || '',
        country: customer.country || 'India',
        mobile: customer.mobile || customer.phone || '',
        landmark: customer.landmark || ''
      });
    }
  };

  // Get icon for address type
  const getAddressIcon = (type) => {
    switch(type) {
      case 'home': return Home;
      case 'office': return Building2;
      default: return MapPin;
    }
  };

  // For shipping address - handle same as billing
  if (addressType === 'shipping' && sameAsBilling && billingAddressData) {
    // Get mobile from billingAddressData or fallback to customer phone
    const mobileNumber = billingAddressData?.mobile || customer?.phone || customer?.mobile;
    return (
      <div className={`bg-gray-50 border border-gray-200 rounded-lg p-4 ${className}`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center">
            <MapPin className="w-4 h-4 mr-2 text-gray-500" />
            Shipping Address
          </h3>
          {onSameAsBillingChange && (
            <label className="flex items-center text-sm">
              <input
                type="checkbox"
                checked={sameAsBilling}
                onChange={(e) => onSameAsBillingChange(e.target.checked)}
                className="mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Same as billing
            </label>
          )}
        </div>
        
        {/* Display the billing address exactly as billing address displays */}
        <div className="text-sm text-gray-600">
          <div className="space-y-1">
            {billingAddressData?.address_line1 && <p>{billingAddressData.address_line1}</p>}
            {billingAddressData?.address_line2 && <p>{billingAddressData.address_line2}</p>}
            {billingAddressData?.landmark && <p className="text-xs text-gray-500">Near {billingAddressData.landmark}</p>}
            <p>
              {[billingAddressData?.city, billingAddressData?.state, billingAddressData?.pincode].filter(Boolean).join(', ')}
            </p>
            {mobileNumber && (
              <p className="flex items-center gap-1 text-xs text-gray-700 font-medium">
                <Phone className="w-3 h-3" />
                {mobileNumber}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-gray-50 border border-gray-200 rounded-lg p-4 relative ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center">
          <MapPin className="w-4 h-4 mr-2 text-gray-500" />
          {addressType === 'billing' ? 'Billing Address' : 'Shipping Address'}
        </h3>
        
        <div className="flex items-center gap-2">
          {addressType === 'shipping' && onSameAsBillingChange && (
            <label className="flex items-center text-sm mr-3">
              <input
                type="checkbox"
                checked={sameAsBilling}
                onChange={(e) => onSameAsBillingChange(e.target.checked)}
                className="mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Same as billing
            </label>
          )}
          
          {!isEditing && !isAddingNew && (
            <button
              onClick={handleEdit}
              className="text-blue-600 hover:text-blue-700 p-1"
              title="Select or edit address"
            >
              <Edit2 className="w-4 h-4" />
            </button>
          )}
          
          {(isEditing || isAddingNew) && (
            <div className="flex gap-1">
              <button
                onClick={handleSave}
                className="text-green-600 hover:text-green-700 p-1"
                title="Save address"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={handleCancel}
                className="text-red-600 hover:text-red-700 p-1"
                title="Cancel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Address Dropdown */}
      {showDropdown && !isEditing && !isAddingNew && (
        <div className="absolute top-14 left-0 right-0 z-20 bg-white border border-gray-300 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {loadingAddresses ? (
            <div className="p-4 text-center text-gray-500">Loading addresses...</div>
          ) : (
            <>
              {savedAddresses.length > 0 && (
                <div className="p-2">
                  <div className="text-xs text-gray-500 uppercase px-2 py-1">Saved Addresses</div>
                  {savedAddresses.map((addr) => {
                    const Icon = getAddressIcon(addr.address_type || addressType);
                    const displayLabel = addr.label || 
                                       (addr.address_type === 'billing' ? 'Billing Address' : 
                                        addr.address_type === 'shipping' ? 'Shipping Address' : 
                                        addressType === 'billing' ? 'Billing Address' : 'Shipping Address');
                    
                    return (
                      <button
                        key={addr.id || addr.address_id}
                        onClick={() => selectAddress(addr)}
                        className={`w-full text-left p-3 hover:bg-gray-50 rounded-lg transition-colors ${
                          selectedAddressId === (addr.id || addr.address_id) ? 'bg-blue-50 border-l-2 border-blue-500' : ''
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <Icon className="w-4 h-4 text-gray-400 mt-0.5" />
                          <div className="flex-1">
                            <div className="font-medium text-sm text-gray-900">
                              {displayLabel}
                              {addr.is_default && (
                                <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Default</span>
                              )}
                            </div>
                            <div className="text-xs text-gray-600 mt-1">
                              {buildAddressString(addr)}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              
              {/* Add New Address Button */}
              <div className="border-t border-gray-200 p-2">
                <button
                  onClick={handleAddNew}
                  className="w-full p-3 hover:bg-blue-50 rounded-lg transition-colors flex items-center justify-center gap-2 text-blue-600 font-medium text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Add New Address
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Address Form Fields */}
      {(isEditing || isAddingNew) ? (
        <div className="space-y-3">
          {isAddingNew && (
            <div className="bg-blue-50 text-blue-700 text-xs p-2 rounded">
              Adding new {addressType} address
            </div>
          )}
          
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <input
                type="text"
                value={formData.address_line1}
                onChange={(e) => handleFieldChange('address_line1', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                placeholder="Address Line 1 *"
              />
            </div>
            
            <div className="col-span-2">
              <input
                type="text"
                value={formData.address_line2}
                onChange={(e) => handleFieldChange('address_line2', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                placeholder="Address Line 2 (Optional)"
              />
            </div>
            
            <div>
              <input
                type="text"
                value={formData.landmark}
                onChange={(e) => handleFieldChange('landmark', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                placeholder="Landmark"
              />
            </div>
            
            <div>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => handleFieldChange('city', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                placeholder="City *"
              />
            </div>
            
            <div>
              <input
                type="text"
                value={formData.state}
                onChange={(e) => handleFieldChange('state', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                placeholder="State *"
              />
            </div>
            
            <div>
              <input
                type="text"
                value={formData.pincode}
                onChange={(e) => handleFieldChange('pincode', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                placeholder="Pincode *"
                maxLength="6"
              />
            </div>
            
            <div className="col-span-2">
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="tel"
                  value={formData.mobile}
                  onChange={(e) => handleFieldChange('mobile', e.target.value)}
                  className="w-full pl-10 pr-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                  placeholder="Mobile Number *"
                  maxLength="10"
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-sm text-gray-600">
          <div className="space-y-1">
            {formData.address_line1 && <p>{formData.address_line1}</p>}
            {formData.address_line2 && <p>{formData.address_line2}</p>}
            {formData.landmark && <p className="text-xs text-gray-500">Near {formData.landmark}</p>}
            <p>
              {[formData.city, formData.state, formData.pincode].filter(Boolean).join(', ')}
            </p>
            {formData.mobile && (
              <p className="flex items-center gap-1 text-xs text-gray-700 font-medium">
                <Phone className="w-3 h-3" />
                {formData.mobile}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AddressForm;