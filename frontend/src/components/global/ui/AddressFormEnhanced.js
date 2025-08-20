import React, { useState, useEffect } from 'react';
import { MapPin, Edit2, Check, X, ChevronDown, Plus, Home, Building } from 'lucide-react';
import { apiClient } from '../../../services/api';

/**
 * Enhanced Multi-field Address Form Component with Address Selection
 * - Handles multiple addresses per customer
 * - Allows selecting from existing addresses
 * - Supports adding/editing addresses
 * - Professional UX like SAP/Oracle
 */
const AddressFormEnhanced = ({
  customer,
  addressData,
  addressType = 'billing',
  onChange,
  onSave,
  sameAsBilling = false,
  onSameAsBillingChange,
  className = ''
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [customerAddresses, setCustomerAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [showAddressDropdown, setShowAddressDropdown] = useState(false);
  const [loadingAddresses, setLoadingAddresses] = useState(false);
  const [formData, setFormData] = useState({
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    pincode: '',
    country: 'India'
  });

  // Fetch all customer addresses
  const fetchCustomerAddresses = async (customerId) => {
    if (!customerId) return;
    
    setLoadingAddresses(true);
    try {
      const response = await apiClient.get(`/customers/${customerId}/addresses`);
      
      if (response.data?.success && response.data.data?.length > 0) {
        const addresses = response.data.data;
        
        // Filter by address type - strictly separate billing and shipping
        const filteredAddresses = addresses.filter(addr => 
          addr.address_type === addressType
        );
        
        setCustomerAddresses(filteredAddresses);
        
        // If no addresses of this type exist, allow creation but don't show dropdown
        if (filteredAddresses.length === 0) {
          console.log(`No ${addressType} addresses found for customer`);
          // Keep form empty for new address creation
        } else {
          // Auto-select default address
          const defaultAddr = filteredAddresses.find(addr => addr.is_default) || filteredAddresses[0];
          if (defaultAddr && !selectedAddressId) {
            selectAddress(defaultAddr);
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch customer addresses:', error);
    } finally {
      setLoadingAddresses(false);
    }
  };

  // Initialize form data from customer or addressData
  useEffect(() => {
    if (customer?.customer_id) {
      fetchCustomerAddresses(customer.customer_id);
    } else if (customer || addressData) {
      const source = addressData || customer;
      setFormData({
        address_line1: source.address || source.address_line1 || '',
        address_line2: source.address2 || source.address_line2 || '',
        city: source.city || '',
        state: source.state || source.state_name || '',
        pincode: source.pincode || source.pin_code || source.postal_code || '',
        country: source.country || 'India'
      });
      
      // Build and send complete address string
      const addressString = buildAddressString({
        address_line1: source.address || source.address_line1 || '',
        address_line2: source.address2 || source.address_line2 || '',
        city: source.city || '',
        state: source.state || source.state_name || '',
        pincode: source.pincode || source.pin_code || source.postal_code || ''
      });
      
      if (addressString && onChange) {
        onChange(addressString);
      }
    }
  }, [customer, addressData]);

  const buildAddressString = (data) => {
    const parts = [];
    if (data.address_line1) parts.push(data.address_line1);
    if (data.address_line2) parts.push(data.address_line2);
    if (data.city) parts.push(data.city);
    if (data.state) parts.push(data.state);
    if (data.pincode) parts.push(data.pincode);
    return parts.filter(Boolean).join(', ');
  };

  const selectAddress = (address) => {
    setSelectedAddressId(address.id || address.address_id);
    const newFormData = {
      address_line1: address.address_line1 || '',
      address_line2: address.address_line2 || '',
      city: address.city || '',
      state: address.state || address.state_name || '',
      pincode: address.pincode || address.pin_code || address.postal_code || '',
      country: address.country || 'India'
    };
    setFormData(newFormData);
    setShowAddressDropdown(false);
    
    // Send updated address string
    const addressString = buildAddressString(newFormData);
    if (onChange) {
      onChange(addressString);
    }
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

  const handleSave = async () => {
    setIsEditing(false);
    const addressString = buildAddressString(formData);
    
    if (onChange) {
      onChange(addressString);
    }
    
    // Save to backend if customer exists
    if (customer?.customer_id && onSave) {
      try {
        const addressPayload = {
          customer_id: customer.customer_id,
          address_type: addressType,
          ...formData,
          is_default: true
        };
        
        // If updating existing address
        if (selectedAddressId) {
          await apiClient.put(`/customers/${customer.customer_id}/addresses/${selectedAddressId}`, addressPayload);
        } else {
          // Creating new address
          const response = await apiClient.post(`/customers/${customer.customer_id}/addresses`, addressPayload);
          if (response.data?.success && response.data.data) {
            setSelectedAddressId(response.data.data.address_id);
          }
        }
        
        // Refresh addresses list
        fetchCustomerAddresses(customer.customer_id);
        
        if (onSave) {
          onSave(formData);
        }
      } catch (error) {
        console.error('Failed to save address:', error);
      }
    } else if (onSave) {
      onSave(formData);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    // Reset to original data
    if (selectedAddressId && customerAddresses.length > 0) {
      const selectedAddr = customerAddresses.find(a => a.address_id === selectedAddressId);
      if (selectedAddr) {
        selectAddress(selectedAddr);
      }
    }
  };

  const getAddressIcon = (addr) => {
    if (addr.address_type === 'billing') return <Building className="w-3 h-3" />;
    if (addr.address_type === 'shipping') return <Home className="w-3 h-3" />;
    return <MapPin className="w-3 h-3" />;
  };

  // For shipping address with "same as billing" option
  if (addressType === 'shipping') {
    return (
      <div className={`bg-white border border-gray-200 rounded-lg p-4 ${className}`}>
        <div className="flex items-center justify-between mb-3">
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

        {sameAsBilling ? (
          <p className="text-sm text-gray-600 italic">Using billing address</p>
        ) : (
          <>
            {/* Address selector for multiple addresses */}
            {customerAddresses.length > 1 && !isEditing && (
              <div className="mb-3 relative">
                <button
                  onClick={() => setShowAddressDropdown(!showAddressDropdown)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-left text-sm flex items-center justify-between hover:bg-gray-50"
                >
                  <span className="flex items-center gap-2">
                    {selectedAddressId && customerAddresses.find(a => a.address_id === selectedAddressId) ? (
                      <>
                        {getAddressIcon(customerAddresses.find(a => a.address_id === selectedAddressId))}
                        <span>
                          {customerAddresses.find(a => a.address_id === selectedAddressId).address_line1}
                        </span>
                      </>
                    ) : (
                      'Select an address'
                    )}
                  </span>
                  <ChevronDown className="w-4 h-4" />
                </button>
                
                {showAddressDropdown && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg">
                    {customerAddresses.map((addr) => (
                      <button
                        key={addr.address_id}
                        onClick={() => selectAddress(addr)}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 border-b last:border-b-0"
                      >
                        {getAddressIcon(addr)}
                        <div className="flex-1">
                          <div className="font-medium">{addr.address_line1}</div>
                          <div className="text-xs text-gray-500">
                            {[addr.city, addr.state, addr.pincode].filter(Boolean).join(', ')}
                          </div>
                        </div>
                        {addr.is_default && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Default</span>
                        )}
                      </button>
                    ))}
                    <button
                      onClick={() => {
                        setShowAddressDropdown(false);
                        setSelectedAddressId(null);
                        setFormData({
                          address_line1: '',
                          address_line2: '',
                          city: '',
                          state: '',
                          pincode: '',
                          country: 'India'
                        });
                        setIsEditing(true);
                      }}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-blue-600"
                    >
                      <Plus className="w-4 h-4" />
                      Add new address
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Address display/edit */}
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
                  </>
                ) : (
                  <div className="text-sm text-gray-400 italic">
                    No address available. Click edit to add address.
                  </div>
                )}
                {!isEditing && (
                  <button
                    onClick={handleEdit}
                    className="text-blue-600 hover:text-blue-700 text-sm mt-2"
                  >
                    <Edit2 className="w-3 h-3 inline mr-1" />
                    Edit address
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // For billing address (without "same as billing" option)
  return (
    <div className={`bg-white border border-gray-200 rounded-lg p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <label className="text-sm font-medium text-gray-700 flex items-center">
          <MapPin className="w-4 h-4 mr-1" />
          Billing Address
        </label>
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

      {/* Address selector for multiple addresses */}
      {customerAddresses.length > 1 && !isEditing && (
        <div className="mb-3 relative">
          <button
            onClick={() => setShowAddressDropdown(!showAddressDropdown)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-left text-sm flex items-center justify-between hover:bg-gray-50"
          >
            <span className="flex items-center gap-2">
              {selectedAddressId && customerAddresses.find(a => a.address_id === selectedAddressId) ? (
                <>
                  {getAddressIcon(customerAddresses.find(a => a.address_id === selectedAddressId))}
                  <span>
                    {customerAddresses.find(a => a.address_id === selectedAddressId).address_line1}
                  </span>
                </>
              ) : (
                'Select an address'
              )}
            </span>
            <ChevronDown className="w-4 h-4" />
          </button>
          
          {showAddressDropdown && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg">
              {customerAddresses.map((addr) => (
                <button
                  key={addr.address_id}
                  onClick={() => selectAddress(addr)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 border-b last:border-b-0"
                >
                  {getAddressIcon(addr)}
                  <div className="flex-1">
                    <div className="font-medium">{addr.address_line1}</div>
                    <div className="text-xs text-gray-500">
                      {[addr.city, addr.state, addr.pincode].filter(Boolean).join(', ')}
                    </div>
                  </div>
                  {addr.is_default && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Default</span>
                  )}
                </button>
              ))}
              <button
                onClick={() => {
                  setShowAddressDropdown(false);
                  setSelectedAddressId(null);
                  setFormData({
                    address_line1: '',
                    address_line2: '',
                    city: '',
                    state: '',
                    pincode: '',
                    country: 'India'
                  });
                  setIsEditing(true);
                }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-blue-600"
              >
                <Plus className="w-4 h-4" />
                Add new address
              </button>
            </div>
          )}
        </div>
      )}

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

export default AddressFormEnhanced;