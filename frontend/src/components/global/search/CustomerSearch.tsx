import React, { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { User, Search, Plus, Trash2, MapPin, Phone, Mail, Building, X } from 'lucide-react';
import { Customer } from '../../../types/models/customer';
import { useCustomerSearch } from '../../../hooks/customers/useCustomers';
import { debounce } from 'lodash';
import { AddNewButton } from '../ui';

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
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const resultRefs = useRef<(HTMLDivElement | null)[]>([]);

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
    setHighlightedIndex(-1);
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev =>
        prev < searchResults.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev =>
        prev > 0 ? prev - 1 : searchResults.length - 1
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < searchResults.length) {
        handleCustomerSelect(searchResults[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      setSearchQuery('');
      setShowSearch(false);
      setShowDropdown(false);
      setHighlightedIndex(-1);
    }
  };

  // Auto-scroll to highlighted item
  useEffect(() => {
    if (highlightedIndex >= 0 && resultRefs.current[highlightedIndex]) {
      resultRefs.current[highlightedIndex]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }
  }, [highlightedIndex]);

  // Reset highlight when results change
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [searchResults]);

  // Handle remove customer
  const handleRemoveCustomer = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    onChange(null);
  };

  // Default customer info renderer - Enhanced for B2B with contact person
  const defaultRenderCustomerInfo = (customer: Customer) => (
    <div className="flex items-center justify-between">
      <div className="flex-1">
        {/* Business/Party Name */}
        <div className="flex items-center gap-2 mb-1">
          <Building className="w-4 h-4 text-blue-600" />
          <p className="font-medium text-gray-900">{customer.customer_name}</p>
          {customer.customer_type === 'B2B' && (
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">B2B</span>
          )}
        </div>
        
        <div className="text-sm text-gray-600 space-y-0.5 ml-6">
          {/* Contact Person - for B2B customers */}
          {(customer as any).contact_person_name && (
            <p className="flex items-center gap-1">
              <User className="w-3 h-3" /> 
              <span className="font-medium">Contact:</span> {(customer as any).contact_person_name}
            </p>
          )}
          
          {/* Mobile Number - prioritize contact person phone for B2B */}
          {(() => {
            const phoneNumber = (customer as any).contact_person_phone || 
                               customer.phone || 
                               customer.contact_info?.primary_phone ||
                               (customer as any).primary_phone;
            if (phoneNumber) {
              return (
                <p className="flex items-center gap-1">
                  <Phone className="w-3 h-3" /> {phoneNumber}
                </p>
              );
            }
            return null;
          })()}
          
          {/* Email */}
          {(() => {
            const email = (customer as any).contact_person_email || 
                         customer.email || 
                         (customer as any).primary_email;
            if (email) {
              return (
                <p className="flex items-center gap-1">
                  <Mail className="w-3 h-3" /> {email}
                </p>
              );
            }
            return null;
          })()}
          
          {/* Compact Address - City, State only */}
          {(() => {
            // Try to get city and state from multiple possible sources
            const city = customer.billing_address?.city || 
                        customer.address_info?.billing_city || 
                        (customer as any).city || '';
            const state = customer.billing_address?.state || 
                         customer.address_info?.billing_state || 
                         (customer as any).state || '';
            
            if (city || state) {
              return (
                <p className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> 
                  {city}{state ? `, ${state}` : ''}
                </p>
              );
            }
            return null;
          })()}
        </div>
      </div>
      
      {/* GST Status Badge */}
      <div className="ml-3">
        {(customer.gstin || customer.gst_number || (customer as any).gst_number) ? (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
            ✓ GST Verified
          </span>
        ) : (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
            No GST
          </span>
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
          {searchResults.map((customer, index) => (
            <div
              key={customer.customer_id}
              ref={(el) => (resultRefs.current[index] = el)}
              onClick={() => handleCustomerSelect(customer)}
              className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                index === highlightedIndex
                  ? 'bg-blue-50 border-blue-500 border-2'
                  : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  {/* Business/Party Name */}
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium text-gray-900">{customer.customer_name}</p>
                    {customer.customer_type === 'B2B' && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">B2B</span>
                    )}
                  </div>
                  
                  <div className="text-sm text-gray-600 mt-1 space-y-0.5">
                    {/* Contact Person for B2B */}
                    {(customer as any).contact_person_name && (
                      <p className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        <span className="font-medium">Contact:</span> {(customer as any).contact_person_name}
                      </p>
                    )}
                    
                    {/* Phone */}
                    {(() => {
                      const phone = (customer as any).contact_person_phone || 
                                   customer.phone || 
                                   (customer as any).primary_phone;
                      if (phone) {
                        return (
                          <p className="flex items-center gap-1">
                            <Phone className="w-3 h-3" /> {phone}
                          </p>
                        );
                      }
                      return null;
                    })()}
                    
                    {customer.customer_code && <p>Code: {customer.customer_code}</p>}
                    {(customer.billing_address?.city || customer.address_info?.billing_city) && (
                      <p>City: {customer.billing_address?.city || customer.address_info?.billing_city}</p>
                    )}
                  </div>
                </div>
                {(customer.gstin || (customer as any).gst_number) && (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
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
            <AddNewButton
              label="Create New Customer"
              onClick={() => {
                setShowSearch(false);
                setShowDropdown(false);
                onCreateNew();
              }}
              variant="primary"
              size="sm"
              disabled={false}
              className="mt-4"
              showIcon={true}
            />
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
        {!value ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={disabled}
                autoFocus={autoFocus}
              />
            </div>
            {searchQuery && renderSearchResults()}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-lg p-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Building className="w-4 h-4 text-blue-600" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900 truncate">{value.customer_name}</p>
                    {value.customer_type === 'B2B' && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded shrink-0">B2B</span>
                    )}
                    {/* GST Status Badge */}
                    {(value.gstin || value.gst_number || (value as any).gst_number) ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 shrink-0">
                        GST
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 shrink-0">
                        No GST
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-600 mt-0.5">
                    {/* Phone Number */}
                    {(() => {
                      const phoneNumber = (value as any).contact_person_phone || 
                                         value.phone || 
                                         value.contact_info?.primary_phone ||
                                         (value as any).primary_phone;
                      if (phoneNumber) {
                        return (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" /> {phoneNumber}
                          </span>
                        );
                      }
                      return null;
                    })()}
                    
                    {/* Compact Address - City, State only */}
                    {(() => {
                      const city = value.billing_address?.city || 
                                  value.address_info?.billing_city || 
                                  (value as any).city || '';
                      const state = value.billing_address?.state || 
                                   value.address_info?.billing_state || 
                                   (value as any).state || '';
                      
                      if (city || state) {
                        return (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> 
                            {city}{state ? `, ${state}` : ''}
                          </span>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </div>
              </div>
              
              {/* Delete Icon - Vertically Centered Right */}
              {clearable && !disabled && (
                <div className="flex items-center justify-center min-h-[3rem]">
                  <button
                    type="button"
                    onClick={handleRemoveCustomer}
                    className="p-3 hover:bg-red-50 rounded-full text-red-500 hover:text-red-600 transition-colors shrink-0"
                    title="Remove customer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
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
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation(); // Stop ESC from bubbling up to parent
                  setSearchQuery('');
                  setShowDropdown(false);
                }
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
                  {/* Customer code hidden for cleaner UI */}
                </div>
              </div>
              {clearable && !disabled && (
                <button
                  type="button"
                  onClick={handleRemoveCustomer}
                  className="p-1 hover:bg-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50"
                  title="Remove customer"
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
        <div className={`flex justify-between items-start ${className}`}>
          <div className="flex-1">
            {renderCustomerInfo ? renderCustomerInfo(value) : defaultRenderCustomerInfo(value)}
          </div>
          {clearable && !disabled && (
            <button
              type="button"
              onClick={handleRemoveCustomer}
              className="ml-3 p-1 hover:bg-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50"
              title="Remove customer"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          )}
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
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.stopPropagation(); // Stop ESC from bubbling up to parent
                      setSearchQuery('');
                      setShowSearch(false);
                    }
                  }}
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