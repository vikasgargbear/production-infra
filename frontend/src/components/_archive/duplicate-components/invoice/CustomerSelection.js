import React, { useState, useEffect, useCallback, forwardRef, useImperativeHandle, useRef } from 'react';
import { User, Search, Plus, X } from 'lucide-react';
import { smartSearch } from '../../../utils/searchCache';
import { customersApi } from '../../../services/api';

const CustomerSelection = forwardRef(({ 
  selectedCustomer, 
  onCustomerSelect, 
  onCreateCustomer,
  invoice,
  onInvoiceUpdate 
}, ref) => {
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchButtonRef = useRef(null);
  const searchInputRef = useRef(null);

  // Expose click method to parent
  useImperativeHandle(ref, () => ({
    click: () => {
      if (searchButtonRef.current) {
        searchButtonRef.current.click();
      }
    }
  }));

  const searchCustomers = useCallback(async (query) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearchLoading(true);
    try {
      const results = await smartSearch('customers', query, customersApi.search);
      setSearchResults(results || []);
    } catch (error) {
      console.error('Error searching customers:', error);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      searchCustomers(searchQuery);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [searchQuery, searchCustomers]);

  // Focus search input when modal opens
  useEffect(() => {
    if (showCustomerSearch && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [showCustomerSearch]);

  const handleCustomerSelect = (customer) => {
    onCustomerSelect(customer);
    const companyState = localStorage.getItem('companyState') || 'Gujarat';
    const isInterstate = customer.state && customer.state.toLowerCase() !== companyState.toLowerCase();
    
    onInvoiceUpdate({
      customer_id: customer.customer_id,
      customer_code: customer.customer_code || customer.customer_id,
      customer_name: customer.customer_name,
      customer_details: customer,
      billing_address: `${customer.address}, ${customer.city}, ${customer.state}`,
      shipping_address: `${customer.address}, ${customer.city}, ${customer.state}`,
      gst_type: isInterstate ? 'IGST' : 'CGST/SGST'
    });
    
    setShowCustomerSearch(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleRemoveCustomer = () => {
    onCustomerSelect(null);
    onInvoiceUpdate({
      customer_id: '',
      customer_code: '',
      customer_name: '',
      customer_details: null,
      billing_address: '',
      shipping_address: '',
      gst_type: 'CGST/SGST'
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-4">
      <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
        <User className="w-4 h-4 mr-2" />
        Customer Details
      </h3>
      
      {!selectedCustomer ? (
        <div className="space-y-3">
          <button
            ref={searchButtonRef}
            onClick={() => setShowCustomerSearch(true)}
            className="w-full py-3 px-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors flex items-center justify-center space-x-2 text-gray-600 hover:text-blue-600"
            title="Search Customer (Ctrl+N)"
          >
            <Search className="w-5 h-5" />
            <span>Search Customer</span>
          </button>
          
          <button
            onClick={onCreateCustomer}
            className="w-full py-2 px-4 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Customer</span>
          </button>
        </div>
      ) : (
        <div className="bg-gray-50 rounded-lg p-4 relative">
          <button
            onClick={handleRemoveCustomer}
            className="absolute top-2 right-2 p-1 hover:bg-gray-200 rounded"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
          
          <div className="space-y-2">
            <div>
              <p className="font-medium text-gray-900">{selectedCustomer.customer_name}</p>
              {selectedCustomer.customer_code && (
                <p className="text-sm text-gray-500">Code: {selectedCustomer.customer_code}</p>
              )}
            </div>
            
            <div className="text-sm text-gray-600 space-y-1">
              {selectedCustomer.phone && <p>📞 {selectedCustomer.phone}</p>}
              {selectedCustomer.email && <p>✉️ {selectedCustomer.email}</p>}
              {selectedCustomer.address && (
                <p>📍 {selectedCustomer.address}, {selectedCustomer.city}, {selectedCustomer.state}</p>
              )}
              {selectedCustomer.gst_number && <p>GST: {selectedCustomer.gst_number}</p>}
            </div>
          </div>
        </div>
      )}

      {/* Customer Search Modal */}
      {showCustomerSearch && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Search Customer</h3>
              <button
                onClick={() => {
                  setShowCustomerSearch(false);
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
                  placeholder="Search by name, phone, or code..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              {searchLoading ? (
                <div className="text-center py-8 text-gray-500">Searching...</div>
              ) : searchResults.length > 0 ? (
                <div className="space-y-2">
                  {searchResults.map((customer, index) => (
                    <div
                      key={customer.customer_id}
                      onClick={() => handleCustomerSelect(customer)}
                      className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleCustomerSelect(customer);
                        }
                      }}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-gray-900">{customer.customer_name}</p>
                          <div className="text-sm text-gray-600 mt-1 space-y-0.5">
                            {customer.customer_code && <p>Code: {customer.customer_code}</p>}
                            {customer.phone && <p>Phone: {customer.phone}</p>}
                            {customer.address && <p>Address: {customer.address}</p>}
                          </div>
                        </div>
                        {customer.gst_number && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                            GST: {customer.gst_number}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : searchQuery.length >= 2 ? (
                <div className="text-center py-8 text-gray-500">
                  No customers found
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  Type at least 2 characters to search
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

CustomerSelection.displayName = 'CustomerSelection';

export default CustomerSelection;