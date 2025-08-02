import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Search, Building2, Phone, MapPin, CreditCard } from 'lucide-react';
import { supplierAPI } from '../../services/api';
import { debounce } from '../../utils/debounce';
import DataTransformer from '../../services/dataTransformer';

const SupplierSearch = forwardRef(({ 
  onSupplierSelect = () => {}, 
  placeholder = "Search supplier by name, code, or contact...",
  autoFocus = true,
  showDetails = true,
  className = ""
}, ref) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  
  const searchInputRef = useRef(null);
  const dropdownRef = useRef(null);
  
  // Expose focus method to parent
  useImperativeHandle(ref, () => ({
    focus: () => {
      if (searchInputRef.current) {
        searchInputRef.current.focus();
      }
    }
  }));

  // Debounced search function
  const searchSuppliers = React.useCallback(
    debounce(async (query) => {
      if (!query || query.length < 2) {
        setSearchResults([]);
        return;
      }

      setLoading(true);
      try {
        const response = await supplierAPI.search(query);
        const results = response.data || [];
        // Transform results to consistent format
        const transformedResults = results.map(supplier => 
          DataTransformer.transformSupplier(supplier, 'search')
        );
        setSearchResults(transformedResults);
        setSelectedIndex(-1);
      } catch (error) {
        console.error('Error searching suppliers:', error);
        setSearchResults([]);
      } finally {
        setLoading(false);
      }
    }, 300),
    []
  );

  useEffect(() => {
    searchSuppliers(searchQuery);
  }, [searchQuery, searchSuppliers]);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (!showDropdown || searchResults.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < searchResults.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev > 0 ? prev - 1 : searchResults.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < searchResults.length) {
          handleSelectSupplier(searchResults[selectedIndex]);
        }
        break;
      case 'Escape':
        setShowDropdown(false);
        setSelectedIndex(-1);
        break;
    }
  };

  const handleSelectSupplier = (supplier) => {
    onSupplierSelect(supplier);
    setSearchQuery('');
    setShowDropdown(false);
    setSearchResults([]);
    setSelectedIndex(-1);
    
    // Clear the input field
    if (searchInputRef.current) {
      searchInputRef.current.value = '';
      searchInputRef.current.blur();
    }
  };

  useEffect(() => {
    if (autoFocus && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [autoFocus]);

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          ref={searchInputRef}
          type="text"
          placeholder={placeholder}
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          onKeyDown={handleKeyDown}
          className="w-full pl-10 pr-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {/* Search Results Dropdown */}
      {showDropdown && searchQuery && searchQuery.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-96 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-gray-500">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto"></div>
              <p className="mt-2 text-sm">Searching suppliers...</p>
            </div>
          ) : searchResults.length > 0 ? (
            searchResults.map((supplier, index) => (
              <div
                key={supplier.supplier_id}
                onClick={() => handleSelectSupplier(supplier)}
                className={`px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0 ${
                  index === selectedIndex ? 'bg-blue-50' : ''
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-gray-400" />
                      <span className="font-medium text-gray-900">{supplier.supplier_name}</span>
                      {supplier.supplier_code && (
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                          {supplier.supplier_code}
                        </span>
                      )}
                    </div>
                    
                    {showDetails && (
                      <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-gray-600">
                        {supplier.contact_person && (
                          <div className="flex items-center gap-1">
                            <span className="text-gray-400">Contact:</span>
                            <span>{supplier.contact_person}</span>
                          </div>
                        )}
                        {supplier.phone && (
                          <div className="flex items-center gap-1">
                            <Phone className="w-3 h-3 text-gray-400" />
                            <span>{supplier.phone}</span>
                          </div>
                        )}
                        {supplier.city && (
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-gray-400" />
                            <span>{supplier.city}</span>
                          </div>
                        )}
                        {supplier.payment_terms && (
                          <div className="flex items-center gap-1">
                            <CreditCard className="w-3 h-3 text-gray-400" />
                            <span>{supplier.payment_terms}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {supplier.drug_license_number && (
                      <div className="mt-1 text-xs text-gray-500">
                        DL No: {supplier.drug_license_number}
                      </div>
                    )}
                  </div>
                  
                  {supplier.gst_number && (
                    <div className="text-right">
                      <div className="text-xs text-gray-500">GSTIN</div>
                      <div className="text-xs font-medium text-gray-700">{supplier.gst_number}</div>
                    </div>
                  )}
                </div>
              </div>
            ))
          ) : searchQuery.length >= 2 ? (
            <div className="p-4 text-center text-gray-500">
              <Building2 className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-sm">No suppliers found</p>
              <p className="text-xs mt-1">Try a different search term</p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
});

SupplierSearch.displayName = 'SupplierSearch';

export default SupplierSearch;