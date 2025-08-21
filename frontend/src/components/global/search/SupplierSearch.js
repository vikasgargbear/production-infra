import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Search, Building2, Plus, X, Loader2 } from 'lucide-react';
import { supplierAPI } from '../../../services/api';
import { AddNewButton } from '../ui';
import DataTransformer from '../../../services/dataTransformer';
import searchCache, { smartSearch } from '../../../utils/searchCache';
import { debounce } from '../../../utils/debounce';

/**
 * SupplierSearch - Global supplier search component
 * Similar to CustomerSearch but for suppliers
 * Provides consistent search experience across all purchase-related modules
 */
const SupplierSearch = forwardRef(({ 
  value,
  onChange,
  onCreateNew,
  displayMode = 'inline', // 'inline' or 'compact'
  placeholder = 'Search supplier by name, phone, or code...',
  required = false,
  clearable = true,
  buttonLabel = 'Create Supplier', // Consistent label
  className = ''
}, ref) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState(value || null);
  const searchInputRef = useRef(null);
  const dropdownRef = useRef(null);

  // Expose focus method to parent
  useImperativeHandle(ref, () => ({
    focus: () => {
      if (searchInputRef.current) {
        searchInputRef.current.focus();
      }
    },
    clear: () => {
      setSelectedSupplier(null);
      setSearchQuery('');
      onChange?.(null);
    }
  }));

  // Update selected supplier when value prop changes
  useEffect(() => {
    setSelectedSupplier(value);
  }, [value]);

  // Preload suppliers on mount for ultra-fast search
  useEffect(() => {
    const preloadSuppliers = async () => {
      try {
        // Check if we already have suppliers in cache
        const cached = searchCache.get('suppliers', 'all');
        if (cached && cached.length > 0) {
          return; // Already cached
        }

        // Load recent suppliers for quick access
        const response = await supplierAPI.list({ limit: 100 });
        const suppliers = response?.data || response || [];
        
        if (suppliers.length > 0) {
          searchCache.setItems('suppliers', suppliers);
          searchCache.set('suppliers', 'all', suppliers);
        }
      } catch (error) {
        console.error('Error preloading suppliers:', error);
      }
    };

    preloadSuppliers();
  }, []);

  // Debounced search function with smart cache integration
  const searchSuppliers = useCallback(
    debounce(async (query) => {
      if (!query || query.length < 2) {
        setSearchResults([]);
        return;
      }

      setLoading(true);
      try {
        // Use smartSearch with the supplier API search function
        const results = await smartSearch(
          'suppliers', 
          query, 
          supplierAPI.search.bind(supplierAPI),
          { limit: 20 }
        );
        
        setSearchResults(results);
      } catch (error) {
        console.error('Error searching suppliers:', error);
        
        // Fallback to direct API search if smartSearch fails
        try {
          const response = await supplierAPI.search(query);
          const results = response?.data || response || [];
          setSearchResults(results);
          
          // Cache the results for next time
          if (results.length > 0) {
            searchCache.setItems('suppliers', results);
          }
        } catch (apiError) {
          console.error('API search also failed:', apiError);
          setSearchResults([]);
        }
      } finally {
        setLoading(false);
      }
    }, 200),
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

  const handleSupplierSelect = (supplier) => {
    setSelectedSupplier(supplier);
    onChange?.(supplier);
    setSearchQuery('');
    setShowDropdown(false);
    setSearchResults([]);
  };

  const handleClearSupplier = () => {
    setSelectedSupplier(null);
    onChange?.(null);
    setSearchQuery('');
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      setShowDropdown(false);
      setSearchQuery('');
    }
  };

  if (displayMode === 'compact') {
    return (
      <div className={`relative ${className}`} ref={dropdownRef} onKeyDown={handleKeyDown}>
        {!selectedSupplier ? (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
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
              className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
            />
          </div>
        ) : (
          <div className="flex items-center justify-between p-2 bg-green-50 rounded-lg border border-green-200">
            <span className="text-sm font-medium text-green-900">{selectedSupplier.supplier_name}</span>
            {clearable && (
              <button onClick={handleClearSupplier} className="text-green-600 hover:text-green-700">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Dropdown Results */}
        {showDropdown && searchQuery && (
          <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-gray-500">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                <p className="text-sm">Searching...</p>
              </div>
            ) : searchResults.length > 0 ? (
              <>
                {searchResults.map((supplier) => (
                  <div
                    key={supplier.supplier_id || supplier.id}
                    onClick={() => handleSupplierSelect(supplier)}
                    className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100"
                  >
                    <div className="font-medium text-gray-900">{supplier.supplier_name || supplier.name}</div>
                    <div className="text-sm text-gray-600 mt-1">
                      {supplier.phone && `Phone: ${supplier.phone}`}
                      {supplier.gst_number && ` | GST: ${supplier.gst_number}`}
                    </div>
                  </div>
                ))}
                {onCreateNew && (
                  <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
                    <AddNewButton
                      label={`${buttonLabel} "${searchQuery}"`}
                      onClick={() => {
                        setShowDropdown(false);
                        onCreateNew(searchQuery);
                      }}
                      variant="ghost"
                      size="sm"
                      className="w-full"
                    />
                  </div>
                )}
              </>
            ) : searchQuery.length >= 2 ? (
              <div className="p-4">
                <div className="text-center mb-3">
                  <Building2 className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No suppliers found for "{searchQuery}"</p>
                </div>
                {onCreateNew && (
                  <AddNewButton
                    label={`${buttonLabel} "${searchQuery}"`}
                    onClick={() => {
                      setShowDropdown(false);
                      onCreateNew(searchQuery);
                    }}
                    variant="primary"
                    size="md"
                    className="w-full"
                  />
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>
    );
  }

  // Inline display mode (default)
  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-4 ${className}`} ref={dropdownRef} onKeyDown={handleKeyDown}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-gray-700 flex items-center">
            <Building2 className="w-4 h-4 mr-2" />
            Supplier {required && <span className="text-red-500 ml-1">*</span>}
          </h4>
          {onCreateNew && (
            <AddNewButton
              label={buttonLabel}
              onClick={() => onCreateNew()}
              variant="secondary"
              size="sm"
            />
          )}
        </div>

        {!selectedSupplier ? (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
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
              className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
            />
          </div>
        ) : (
          <div className="p-3 bg-green-50 rounded-lg border border-green-200">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium text-green-900">{selectedSupplier.supplier_name}</p>
                {selectedSupplier.phone && <p className="text-sm text-green-700">Phone: {selectedSupplier.phone}</p>}
                {selectedSupplier.gst_number && <p className="text-sm text-green-700">GST: {selectedSupplier.gst_number}</p>}
                {selectedSupplier.address && <p className="text-sm text-green-700">{selectedSupplier.address}</p>}
              </div>
              {clearable && (
                <button
                  onClick={handleClearSupplier}
                  className="text-green-600 hover:text-green-700"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Search Results Dropdown */}
        {showDropdown && searchQuery && !selectedSupplier && (
          <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-gray-500">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                <p className="text-sm">Searching...</p>
              </div>
            ) : searchResults.length > 0 ? (
              <>
                {searchResults.map((supplier) => (
                  <div
                    key={supplier.supplier_id || supplier.id}
                    onClick={() => handleSupplierSelect(supplier)}
                    className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium text-gray-900">{supplier.supplier_name || supplier.name}</div>
                        <div className="text-sm text-gray-600 mt-1">
                          {supplier.phone && `Phone: ${supplier.phone}`}
                          {supplier.gst_number && ` | GST: ${supplier.gst_number}`}
                        </div>
                        {supplier.address && (
                          <div className="text-xs text-gray-500 mt-1">{supplier.address}</div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {onCreateNew && searchQuery.length >= 2 && (
                  <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
                    <AddNewButton
                      label={`${buttonLabel} "${searchQuery}"`}
                      onClick={() => {
                        setShowDropdown(false);
                        onCreateNew(searchQuery);
                      }}
                      variant="ghost"
                      size="sm"
                      className="w-full"
                    />
                  </div>
                )}
              </>
            ) : searchQuery.length >= 2 ? (
              <div className="p-4">
                <div className="text-center mb-3">
                  <Building2 className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No suppliers found for "{searchQuery}"</p>
                </div>
                {onCreateNew && (
                  <AddNewButton
                    label={`${buttonLabel} "${searchQuery}"`}
                    onClick={() => {
                      setShowDropdown(false);
                      onCreateNew(searchQuery);
                    }}
                    variant="primary"
                    size="md"
                    className="w-full"
                  />
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
});

SupplierSearch.displayName = 'SupplierSearch';

export default SupplierSearch;