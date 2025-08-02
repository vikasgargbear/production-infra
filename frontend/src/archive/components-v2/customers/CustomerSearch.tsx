import React, { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { User, Search, Plus, X, MapPin, Phone, Mail, Building } from 'lucide-react';
import { Customer } from '../../types/models/customer';
import { useCustomerSearch } from '../../hooks/customers/useCustomers';
import { debounce } from 'lodash';

/**
 * CustomerSearch Component Props
 */
interface CustomerSearchProps {
  value: Customer | null;
  onChange: (customer: Customer | null) => void;
  onCreateNew?: () => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  showCreateButton?: boolean;
  displayMode?: 'inline' | 'modal' | 'dropdown';
  className?: string;
  renderCustomerInfo?: (customer: Customer) => React.ReactNode;
  autoFocus?: boolean;
  clearable?: boolean;
  minSearchLength?: number;
}

export interface CustomerSearchRef {
  focus: () => void;
  clear: () => void;
}

/**
 * Global Customer Search Component v2
 * TypeScript version with enhanced type safety
 */
export const CustomerSearch = forwardRef<CustomerSearchRef, CustomerSearchProps>(({
  value,
  onChange,
  onCreateNew,
  placeholder = "Search customer by name, phone, or code...",
  disabled = false,
  required = false,
  showCreateButton = true,
  displayMode = 'modal',
  className = '',
  renderCustomerInfo,
  autoFocus = false,
  clearable = true,
  minSearchLength = 2
}, ref) => {
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Use the typed React Query hook
  const { data, isLoading, error } = useCustomerSearch(searchQuery, {
    enabled: searchQuery.length >= minSearchLength,
  });

  const searchResults = data?.data || [];

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    focus: () => {
      searchInputRef.current?.focus();
    },
    clear: () => {
      setSearchQuery('');
    }
  }));

  // Handle click outside for dropdown mode
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    if (displayMode === 'dropdown' && showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [displayMode, showDropdown]);

  // Handle customer selection
  const handleCustomerSelect = (customer: Customer) => {
    onChange(customer);
    setShowSearch(false);
    setShowDropdown(false);
    setSearchQuery('');
  };

  // Handle remove customer
  const handleRemoveCustomer = () => {
    onChange(null);
  };

  // Default customer info renderer
  const defaultRenderCustomerInfo = (customer: Customer) => (
    <div className="space-y-2">
      <div>
        <p className="font-medium text-gray-900">{customer.customer_name}</p>
        {customer.customer_code && (
          <p className="text-sm text-gray-500">Code: {customer.customer_code}</p>
        )}
      </div>
      
      <div className="text-sm text-gray-600 space-y-1">
        {/* Handle phone - could be in contact_info or directly on customer */}
        {(customer.phone || customer.contact_info?.primary_phone) && (
          <p className="flex items-center gap-1">
            <Phone className="w-3 h-3" /> {customer.phone || customer.contact_info?.primary_phone}
          </p>
        )}
        {/* Handle email - could be in contact_info or directly on customer */}
        {(customer.email || customer.contact_info?.email) && (
          <p className="flex items-center gap-1">
            <Mail className="w-3 h-3" /> {customer.email || customer.contact_info?.email}
          </p>
        )}
        {/* Handle address - check both billing_address object and address_info */}
        {(customer.billing_address || customer.address_info?.billing_address) && (
          <p className="flex items-center gap-1">
            <MapPin className="w-3 h-3" /> 
            {customer.billing_address ? 
              `${customer.billing_address.street || ''}${customer.billing_address.city ? `, ${customer.billing_address.city}` : ''}${customer.billing_address.state ? `, ${customer.billing_address.state}` : ''}` :
              `${customer.address_info?.billing_address || ''}${customer.address_info?.billing_city ? `, ${customer.address_info.billing_city}` : ''}${customer.address_info?.billing_state ? `, ${customer.address_info.billing_state}` : ''}`
            }
          </p>
        )}
        {(customer.gstin || customer.gst_number) && (
          <p className="flex items-center gap-1">
            <Building className="w-3 h-3" /> GST: {customer.gstin || customer.gst_number}
          </p>
        )}
      </div>
    </div>
  );

  // Render search results
  const renderSearchResults = () => (
    <>
      {isLoading ? (
        <div className="text-center py-8 text-gray-500">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          <p className="mt-2">Searching...</p>
        </div>
      ) : error ? (
        <div className="text-center py-8 text-red-500">
          <p>Error searching customers</p>
        </div>
      ) : searchResults.length > 0 ? (
        <div className="space-y-2">
          {searchResults.map((customer) => (
            <div
              key={customer.customer_id}
              onClick={() => handleCustomerSelect(customer)}
              className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{customer.customer_name}</p>
                  <div className="text-sm text-gray-600 mt-1 space-y-0.5">
                    {customer.customer_code && <p>Code: {customer.customer_code}</p>}
                    {(customer.billing_address?.city || customer.address_info?.billing_city) && (
                      <p>City: {customer.billing_address?.city || customer.address_info?.billing_city}</p>
                    )}
                  </div>
                </div>
                {customer.gstin && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                    GST Registered
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : searchQuery.length >= minSearchLength ? (
        <div className="text-center py-8">
          <p className="text-gray-500">No customers found</p>
          {showCreateButton && onCreateNew && (
            <button
              onClick={() => {
                setShowSearch(false);
                setShowDropdown(false);
                onCreateNew();
              }}
              className="mt-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Create New Customer
            </button>
          )}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-400">
          Type at least {minSearchLength} characters to search
        </div>
      )}
    </>
  );

  // Render based on display mode
  if (displayMode === 'inline') {
    return (
      <div className={`bg-white rounded-lg shadow-sm p-4 ${className}`}>
        <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
          <User className="w-4 h-4 mr-2" />
          Customer Details
        </h3>
        
        {!value ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={placeholder}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={disabled}
                autoFocus={autoFocus}
              />
            </div>
            {searchQuery && renderSearchResults()}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-lg p-3">
            {renderCustomerInfo ? renderCustomerInfo(value) : defaultRenderCustomerInfo(value)}
            {clearable && !disabled && (
              <button
                onClick={handleRemoveCustomer}
                className="mt-3 text-sm text-red-600 hover:text-red-700"
              >
                Remove Customer
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  if (displayMode === 'dropdown') {
    return (
      <div className={`relative ${className}`} ref={dropdownRef}>
        {!value ? (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowDropdown(true);
              }}
              onFocus={() => setShowDropdown(true)}
              placeholder={placeholder}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={disabled}
              autoFocus={autoFocus}
            />
          </div>
        ) : (
          <div className="relative">
            <div className="flex items-center justify-between p-3 border border-gray-300 rounded-lg bg-gray-50">
              <div className="flex items-center gap-3">
                <User className="w-5 h-5 text-gray-500" />
                <div>
                  <p className="font-medium">{value.customer_name}</p>
                  <p className="text-sm text-gray-500">{value.customer_code}</p>
                </div>
              </div>
              {clearable && !disabled && (
                <button
                  onClick={handleRemoveCustomer}
                  className="p-1 hover:bg-gray-200 rounded"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              )}
            </div>
          </div>
        )}
        
        {showDropdown && searchQuery && !value && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-96 overflow-y-auto">
            <div className="p-3">
              {renderSearchResults()}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Modal display mode
  return (
    <>
      {!value ? (
        <button
          type="button"
          onClick={() => setShowSearch(true)}
          disabled={disabled}
          className={`w-full p-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-gray-400 transition-colors flex items-center justify-center gap-2 ${
            disabled ? 'opacity-50 cursor-not-allowed' : ''
          } ${className}`}
        >
          <User className="w-5 h-5 text-gray-400" />
          <span className="text-gray-600">Select Customer</span>
        </button>
      ) : (
        <div className={`bg-gray-50 rounded-lg p-4 ${className}`}>
          <div className="flex justify-between items-start">
            <div className="flex-1">
              {renderCustomerInfo ? renderCustomerInfo(value) : defaultRenderCustomerInfo(value)}
            </div>
            {clearable && !disabled && (
              <button
                onClick={handleRemoveCustomer}
                className="ml-3 p-1 hover:bg-gray-200 rounded"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            )}
          </div>
        </div>
      )}

      {showSearch && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden">
            <div className="p-4 border-b">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold">Select Customer</h2>
                <button
                  onClick={() => setShowSearch(false)}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="p-4">
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={placeholder}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
              </div>
              
              <div className="max-h-[60vh] overflow-y-auto">
                {renderSearchResults()}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

CustomerSearch.displayName = 'CustomerSearch';