import React, { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { User, Search, Plus, X, MapPin, Phone, Mail, Building } from 'lucide-react';
import { searchCache, smartSearch } from '../../../utils/searchCache';
import { customerAPI } from '../../../services/api';
import DataTransformer from '../../../services/dataTransformer';
import { INVOICE_CONFIG } from '../../../config/invoice.config';
import { APP_CONFIG } from '../../../config/app.config';
import { debounce } from '../../../utils/debounce';

/**
 * Global Customer Search Component
 * 
 * Props:
 * - value: Selected customer object
 * - onChange: Function called when customer is selected/removed
 * - onCreateNew: Function called when "Add New Customer" is clicked
 * - placeholder: Placeholder text for search
 * - disabled: Disable the component
 * - required: Make selection required
 * - showCreateButton: Show/hide the create new customer button
 * - displayMode: 'inline' | 'modal' | 'dropdown' (default: 'modal')
 * - className: Additional CSS classes
 * - searchFields: Array of fields to search in (default: ['customer_name', 'phone', 'customer_code'])
 * - renderCustomerInfo: Custom render function for customer display
 * - autoFocus: Auto-focus search input
 * - clearable: Allow clearing selection (default: true)
 */

const CustomerSearch = forwardRef(({
  value,
  onChange,
  onCreateNew,
  placeholder = "Search customer by name, phone, or code...",
  disabled = false,
  required = false,
  showCreateButton = true,
  displayMode = 'modal',
  className = '',
  searchFields = ['customer_name', 'phone', 'customer_code'],
  renderCustomerInfo,
  autoFocus = false,
  clearable = true
}, ref) => {
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchInputRef = useRef(null);
  const dropdownRef = useRef(null);

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    focus: () => {
      searchInputRef.current?.focus();
    },
    clear: () => {
      setSearchQuery('');
      setSearchResults([]);
    }
  }));

  // Debounced search function
  const debouncedSearch = useCallback(
    debounce(async (query) => {
      if (!query || query.length < INVOICE_CONFIG.SEARCH.MIN_QUERY_LENGTH) {
        setSearchResults([]);
        return;
      }

      setSearchLoading(true);
      try {
        const results = await smartSearch('customers', query, 
          (q) => customerAPI.search(q),
          { 
            useLocalSearch: true, 
            limit: INVOICE_CONFIG.SEARCH.MAX_RESULTS.API,
            searchFields 
          }
        );
        
        // Transform results for consistent data structure
        const transformedResults = results ? 
          results.map(customer => DataTransformer.transformCustomer(customer, 'search')) : [];
        
        setSearchResults(transformedResults);
      } catch (error) {
        console.error('Error searching customers:', error);
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, INVOICE_CONFIG.SEARCH.DEBOUNCE_DELAY.CUSTOMER),
    [searchFields]
  );

  // Handle search query change
  useEffect(() => {
    debouncedSearch(searchQuery);
  }, [searchQuery, debouncedSearch]);

  // Handle click outside for dropdown mode
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };

    if (displayMode === 'dropdown' && showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [displayMode, showDropdown]);

  // Handle customer selection
  const handleCustomerSelect = (customer) => {
    onChange(customer);
    setShowSearch(false);
    setShowDropdown(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  // Handle remove customer
  const handleRemoveCustomer = () => {
    onChange(null);
  };

  // Default customer info renderer
  const defaultRenderCustomerInfo = (customer) => (
    <div className="space-y-2">
      <div>
        <p className="font-medium text-gray-900">{customer.customer_name}</p>
        {customer.customer_code && (
          <p className="text-sm text-gray-500">Code: {customer.customer_code}</p>
        )}
      </div>
      
      <div className="text-sm text-gray-600 space-y-1">
        {customer.phone && (
          <p className="flex items-center gap-1">
            <Phone className="w-3 h-3" /> {customer.phone}
          </p>
        )}
        {customer.email && (
          <p className="flex items-center gap-1">
            <Mail className="w-3 h-3" /> {customer.email}
          </p>
        )}
        {customer.address && (
          <p className="flex items-center gap-1">
            <MapPin className="w-3 h-3" /> 
            {customer.address}
            {customer.city && `, ${customer.city}`}
            {customer.state && `, ${customer.state}`}
          </p>
        )}
        {customer.gst_number && (
          <p className="flex items-center gap-1">
            <Building className="w-3 h-3" /> GST: {customer.gst_number}
          </p>
        )}
      </div>
    </div>
  );

  // Render search results
  const renderSearchResults = () => (
    <>
      {searchLoading ? (
        <div className="text-center py-8 text-gray-500">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          <p className="mt-2">Searching...</p>
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
                    {customer.city && <p>City: {customer.city}</p>}
                  </div>
                </div>
                {customer.gst_number && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                    GST Registered
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : searchQuery.length >= INVOICE_CONFIG.SEARCH.MIN_QUERY_LENGTH ? (
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
          Type at least {INVOICE_CONFIG.SEARCH.MIN_QUERY_LENGTH} characters to search
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
            
            {searchQuery && (
              <div className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto">
                {renderSearchResults()}
              </div>
            )}
            
            {showCreateButton && onCreateNew && (
              <button
                onClick={onCreateNew}
                className="w-full py-2 px-4 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center space-x-2"
                disabled={disabled}
              >
                <Plus className="w-4 h-4" />
                <span>Add New Customer</span>
              </button>
            )}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-lg p-4 relative">
            {clearable && (
              <button
                onClick={handleRemoveCustomer}
                className="absolute top-2 right-2 p-1 hover:bg-gray-200 rounded"
                disabled={disabled}
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            )}
            
            {renderCustomerInfo ? renderCustomerInfo(value) : defaultRenderCustomerInfo(value)}
          </div>
        )}
      </div>
    );
  }

  if (displayMode === 'dropdown') {
    return (
      <div className={`relative ${className}`} ref={dropdownRef}>
        {!value ? (
          <div>
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
                required={required}
                autoFocus={autoFocus}
              />
            </div>
            
            {showDropdown && searchQuery && (
              <div className="absolute z-10 mt-1 w-full bg-white rounded-lg shadow-lg border border-gray-200 max-h-64 overflow-y-auto">
                {renderSearchResults()}
              </div>
            )}
          </div>
        ) : (
          <div className="relative">
            <div className="bg-gray-50 rounded-lg p-3 pr-10">
              {renderCustomerInfo ? renderCustomerInfo(value) : (
                <div>
                  <p className="font-medium text-gray-900">{value.customer_name}</p>
                  {value.city && <p className="text-sm text-gray-600">{value.city}</p>}
                </div>
              )}
            </div>
            {clearable && (
              <button
                onClick={handleRemoveCustomer}
                className="absolute top-3 right-3 p-1 hover:bg-gray-200 rounded"
                disabled={disabled}
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // Default modal mode
  return (
    <div className={`bg-white rounded-lg shadow-sm p-4 ${className}`}>
      <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
        <User className="w-4 h-4 mr-2" />
        Customer Details
      </h3>
      
      {!value ? (
        <div className="space-y-3">
          <button
            onClick={() => setShowSearch(true)}
            className="w-full py-3 px-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors flex items-center justify-center space-x-2 text-gray-600 hover:text-blue-600"
            disabled={disabled}
          >
            <Search className="w-5 h-5" />
            <span>Search Customer</span>
          </button>
          
          {showCreateButton && onCreateNew && (
            <button
              onClick={onCreateNew}
              className="w-full py-2 px-4 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center space-x-2"
              disabled={disabled}
            >
              <Plus className="w-4 h-4" />
              <span>Add New Customer</span>
            </button>
          )}
        </div>
      ) : (
        <div className="bg-gray-50 rounded-lg p-4 relative">
          {clearable && (
            <button
              onClick={handleRemoveCustomer}
              className="absolute top-2 right-2 p-1 hover:bg-gray-200 rounded"
              disabled={disabled}
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          )}
          
          {renderCustomerInfo ? renderCustomerInfo(value) : defaultRenderCustomerInfo(value)}
        </div>
      )}

      {/* Customer Search Modal */}
      {showSearch && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Search Customer</h3>
              <button
                onClick={() => {
                  setShowSearch(false);
                  setSearchQuery('');
                  setSearchResults([]);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4">
              <div className="relative">
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
            </div>
            
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              {renderSearchResults()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

CustomerSearch.displayName = 'CustomerSearch';

export default CustomerSearch;