import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Search, Building2, Plus, Trash2, Loader2, Phone, MapPin, UserPlus } from 'lucide-react';
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
          <div className="bg-gray-50 rounded-lg p-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Building2 className="w-4 h-4 text-blue-600" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900 truncate">{selectedSupplier.supplier_name || selectedSupplier.name}</p>
                    {/* GST Status Badge */}
                    {selectedSupplier.gst_number ? (
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
                    {(selectedSupplier.primary_phone || selectedSupplier.contact_person_phone || selectedSupplier.phone) && (
                      <span className="flex items-center gap-1">
                        <Phone className="w-3 h-3" /> {selectedSupplier.primary_phone || selectedSupplier.contact_person_phone || selectedSupplier.phone}
                      </span>
                    )}
                    
                    {/* Compact Address - City, State only */}
                    {(selectedSupplier.city || selectedSupplier.state) && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> 
                        {selectedSupplier.city}{selectedSupplier.state ? `, ${selectedSupplier.state}` : ''}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Delete Icon - Vertically Centered Right */}
              {clearable && (
                <div className="flex items-center justify-center min-h-[3rem]">
                  <button
                    type="button"
                    onClick={handleClearSupplier}
                    className="p-3 hover:bg-red-50 rounded-full text-red-500 hover:text-red-600 transition-colors shrink-0"
                    title="Remove supplier"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Dropdown Results */}
        {showDropdown && searchQuery && (
          <div className="absolute z-20 w-full max-w-lg mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
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
    <div className={`relative ${className}`} ref={dropdownRef} onKeyDown={handleKeyDown}>
      <div className="bg-white rounded-lg border border-gray-200 p-4">
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
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                {/* Business/Supplier Name */}
                <div className="flex items-center gap-2 mb-1">
                  <Building2 className="w-4 h-4 text-blue-600" />
                  <p className="font-medium text-gray-900">{selectedSupplier.supplier_name || selectedSupplier.name}</p>
                </div>
                
                <div className="text-sm text-gray-600 space-y-0.5 ml-6">
                  {/* Contact Person */}
                  {selectedSupplier.contact_person_name && (
                    <p className="flex items-center gap-1">
                      <UserPlus className="w-3 h-3" /> 
                      <span className="font-medium">Contact:</span> {selectedSupplier.contact_person_name}
                    </p>
                  )}
                  
                  {/* Phone Number */}
                  {(selectedSupplier.primary_phone || selectedSupplier.contact_person_phone || selectedSupplier.phone) && (
                    <p className="flex items-center gap-1">
                      <Phone className="w-3 h-3" /> {selectedSupplier.primary_phone || selectedSupplier.contact_person_phone || selectedSupplier.phone}
                    </p>
                  )}
                  
                  {/* Compact Address - City, State only */}
                  {(selectedSupplier.city || selectedSupplier.state) && (
                    <p className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> 
                      {selectedSupplier.city}{selectedSupplier.state ? `, ${selectedSupplier.state}` : ''}
                    </p>
                  )}
                </div>
              </div>
              
              {/* GST Status Badge */}
              <div className="ml-3">
                {selectedSupplier.gst_number ? (
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
            {clearable && (
              <button
                type="button"
                onClick={handleClearSupplier}
                className="mt-3 text-sm text-red-600 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50 rounded px-2 py-1"
              >
                Remove Supplier
              </button>
            )}
          </div>
        )}

        </div>
      </div>

      {/* Search Results Dropdown - Outside the white box */}
      {showDropdown && searchQuery && !selectedSupplier && (
        <div className="absolute z-20 w-full max-w-lg mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
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
  );
});

SupplierSearch.displayName = 'SupplierSearch';

export default SupplierSearch;