import React, { useState, useEffect, useRef } from 'react';
import { Building2, Plus, Search } from 'lucide-react';
import { suppliersApi } from '../../../services/api';
import { debounce } from 'lodash';

/**
 * SupplierQuickSelect - Fast supplier selection with search
 */
const SupplierQuickSelect = ({ value, onChange }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [suppliers, setSuppliers] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const dropdownRef = useRef(null);

  // Search suppliers
  const searchSuppliers = React.useCallback(
    debounce(async (term) => {
      if (!term) {
        // Load recent suppliers
        setLoading(true);
        try {
          const response = await suppliersApi.search({ limit: 10 });
          setSuppliers(response.data || []);
        } catch (error) {
          // Silently handle error for recent suppliers
          setSuppliers([]);
        } finally {
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      try {
        const response = await suppliersApi.search({ 
          search: term, 
          limit: 10 
        });
        setSuppliers(response.data || []);
      } catch (error) {
        // Silently handle search error
        setSuppliers([]);
      } finally {
        setLoading(false);
      }
    }, 300),
    []
  );

  useEffect(() => {
    searchSuppliers(searchTerm);
  }, [searchTerm]);

  // Handle supplier selection
  const selectSupplier = (supplier) => {
    setSelectedSupplier(supplier);
    setSearchTerm(supplier.supplier_name);
    setShowDropdown(false);
    onChange({
      id: supplier.supplier_id,
      name: supplier.supplier_name,
      gstin: supplier.gstin,
      address: supplier.address
    });
  };

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Supplier <span className="text-red-500">*</span>
      </label>
      
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Building2 className="h-4 w-4 text-gray-400" />
        </div>
        
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          placeholder="Search supplier..."
          className="w-full pl-10 pr-10 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
        />
        
        {loading && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600"></div>
          </div>
        )}
        
        {selectedSupplier && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
            <div className="h-2 w-2 bg-green-500 rounded-full"></div>
          </div>
        )}
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute z-20 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-auto">
          {suppliers.length > 0 ? (
            <>
              {suppliers.map((supplier) => (
                <div
                  key={supplier.supplier_id}
                  onClick={() => selectSupplier(supplier)}
                  className="px-3 py-2 hover:bg-indigo-50 cursor-pointer border-b last:border-b-0"
                >
                  <div className="font-medium">{supplier.supplier_name}</div>
                  <div className="text-xs text-gray-500">
                    {supplier.gstin && `GSTIN: ${supplier.gstin}`}
                    {supplier.mobile && ` • ${supplier.mobile}`}
                  </div>
                </div>
              ))}
              
              <div
                className="px-3 py-2 bg-gray-50 hover:bg-gray-100 cursor-pointer flex items-center space-x-2 text-sm text-gray-600"
                onClick={() => {
                  setShowDropdown(false);
                  // Open supplier creation modal
                  // This should be handled by parent component
                }}
              >
                <Plus className="w-4 h-4" />
                <span>Add New Supplier</span>
              </div>
            </>
          ) : (
            <div className="px-3 py-4 text-center text-gray-500">
              {loading ? 'Searching...' : 'No suppliers found'}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SupplierQuickSelect;