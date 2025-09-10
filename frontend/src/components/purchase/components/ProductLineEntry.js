import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Trash2, AlertCircle, CheckCircle, Info } from 'lucide-react';
import { purchasesApi } from '../../../services/api/modules/purchases.api';
import { debounce } from 'lodash';

/**
 * ProductLineEntry - Single row for product entry with inline search and validation
 */
const ProductLineEntry = ({ item, index, onUpdate, onRemove }) => {
  const [searchTerm, setSearchTerm] = useState(item.product_name || '');
  const [searchResults, setSearchResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef(null);

  // Calculate line total
  const lineTotal = (item.quantity || 0) * (item.cost_price || 0) * (1 + (item.tax_percent || 12) / 100);

  // Debounced search function
  const searchProducts = useCallback(
    debounce(async (term) => {
      if (!term || term.length < 2) {
        setSearchResults([]);
        return;
      }

      setSearching(true);
      try {
        const response = await purchasesApi.searchProducts({ product_name: term });
        if (response && response.data) {
          setSearchResults(response.data.products || []);
          setShowDropdown(true);
        }
      } catch (error) {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300),
    []
  );

  // Handle product name change
  const handleProductNameChange = (value) => {
    setSearchTerm(value);
    onUpdate({ product_name: value, product_id: null, is_new_product: true });
    searchProducts(value);
  };

  // Select existing product
  const selectProduct = (product) => {
    setSearchTerm(product.product_name);
    setShowDropdown(false);
    
    // Update with existing product data
    onUpdate({
      product_id: product.product_id,
      product_name: product.product_name,
      hsn_code: product.hsn_code || item.hsn_code,
      is_new_product: false,
      // Suggest last pricing but allow override
      cost_price: product.last_cost || item.cost_price,
      mrp: product.last_mrp || item.mrp,
      validation: { 
        errors: [], 
        warnings: [],
        info: `Using existing product (ID: ${product.product_id})`
      }
    });
  };

  // Auto-calculate selling price when MRP changes
  useEffect(() => {
    if (item.mrp && !item.selling_price) {
      // Default selling price = 90% of MRP
      onUpdate({ selling_price: (item.mrp * 0.9).toFixed(2) });
    }
  }, [item.mrp]);

  // Auto-calculate MRP when cost changes
  useEffect(() => {
    if (item.cost_price && !item.mrp) {
      // Default MRP = 1.5x cost
      onUpdate({ mrp: (item.cost_price * 1.5).toFixed(2) });
    }
  }, [item.cost_price]);

  // Validate expiry date
  const validateExpiry = (date) => {
    const expiry = new Date(date);
    const today = new Date();
    const monthsUntilExpiry = (expiry - today) / (1000 * 60 * 60 * 24 * 30);
    
    if (monthsUntilExpiry < 3) {
      onUpdate({ 
        expiry_date: date,
        validation: { 
          ...item.validation, 
          warnings: ['Product expires in less than 3 months'] 
        }
      });
    } else {
      onUpdate({ 
        expiry_date: date,
        validation: { 
          ...item.validation, 
          warnings: [] 
        }
      });
    }
  };

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <tr className="hover:bg-gray-50">
      {/* Product Name with Search */}
      <td className="px-3 py-2 relative" ref={searchRef}>
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => handleProductNameChange(e.target.value)}
            placeholder="Search or enter new..."
            className={`w-full px-2 py-1 border rounded ${
              item.validation?.errors?.length > 0 ? 'border-red-500' : 'border-gray-300'
            } focus:ring-2 focus:ring-indigo-500`}
          />
          
          {/* Search indicator */}
          {searching && (
            <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600"></div>
            </div>
          )}
          
          {/* Product status indicator */}
          {item.product_id && (
            <CheckCircle className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-green-500" />
          )}
        </div>
        
        {/* Search dropdown */}
        {showDropdown && searchResults.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-auto">
            {searchResults.map((product) => (
              <div
                key={product.product_id}
                onClick={() => selectProduct(product)}
                className="px-3 py-2 hover:bg-indigo-50 cursor-pointer border-b last:border-b-0"
              >
                <div className="font-medium">{product.product_name}</div>
                <div className="text-xs text-gray-500">
                  {product.last_batch && `Last: Batch ${product.last_batch}`}
                  {product.last_mrp && ` • MRP ₹${product.last_mrp}`}
                  {product.match_score === 100 && (
                    <span className="ml-2 text-green-600 font-medium">Exact Match</span>
                  )}
                </div>
              </div>
            ))}
            {!item.product_id && (
              <div className="px-3 py-2 bg-yellow-50 text-sm text-yellow-800">
                <Info className="inline w-3 h-3 mr-1" />
                New product will be created
              </div>
            )}
          </div>
        )}
      </td>

      {/* Batch Number */}
      <td className="px-3 py-2">
        <input
          type="text"
          value={item.batch_number || ''}
          onChange={(e) => onUpdate({ batch_number: e.target.value })}
          placeholder="Batch"
          className="w-full px-2 py-1 border rounded focus:ring-2 focus:ring-indigo-500"
        />
      </td>

      {/* Expiry Date */}
      <td className="px-3 py-2">
        <input
          type="date"
          value={item.expiry_date || ''}
          onChange={(e) => validateExpiry(e.target.value)}
          min={new Date().toISOString().split('T')[0]}
          className="w-full px-2 py-1 border rounded focus:ring-2 focus:ring-indigo-500"
        />
        {item.validation?.warnings?.length > 0 && (
          <div className="text-xs text-yellow-600 mt-1">
            {item.validation.warnings[0]}
          </div>
        )}
      </td>

      {/* Quantity */}
      <td className="px-3 py-2">
        <input
          type="text"
          inputMode="decimal"
          value={item.quantity || ''}
          onChange={(e) => onUpdate({ quantity: e.target.value === '' ? '' : parseFloat(e.target.value) || 0 })}
          placeholder="0"
          className="w-20 px-2 py-1 border rounded text-center focus:ring-2 focus:ring-indigo-500"
        />
      </td>

      {/* Cost Price */}
      <td className="px-3 py-2">
        <input
          type="text"
          inputMode="decimal"
          value={item.cost_price || ''}
          onChange={(e) => onUpdate({ cost_price: e.target.value === '' ? '' : parseFloat(e.target.value) || 0 })}
          placeholder="0.00"
          className="w-24 px-2 py-1 border rounded text-right focus:ring-2 focus:ring-indigo-500"
        />
      </td>

      {/* MRP */}
      <td className="px-3 py-2">
        <input
          type="text"
          inputMode="decimal"
          value={item.mrp || ''}
          onChange={(e) => onUpdate({ mrp: e.target.value === '' ? '' : parseFloat(e.target.value) || 0 })}
          placeholder="0.00"
          className="w-24 px-2 py-1 border rounded text-right focus:ring-2 focus:ring-indigo-500"
        />
      </td>

      {/* Selling Price */}
      <td className="px-3 py-2">
        <input
          type="text"
          inputMode="decimal"
          value={item.selling_price || ''}
          onChange={(e) => onUpdate({ selling_price: e.target.value === '' ? '' : parseFloat(e.target.value) || 0 })}
          placeholder="0.00"
          className="w-24 px-2 py-1 border rounded text-right focus:ring-2 focus:ring-indigo-500"
        />
      </td>

      {/* Tax Percent */}
      <td className="px-3 py-2">
        <select
          value={item.tax_percent || 12}
          onChange={(e) => onUpdate({ tax_percent: e.target.value })}
          className="w-20 px-2 py-1 border rounded focus:ring-2 focus:ring-indigo-500"
        >
          <option value="0">0%</option>
          <option value="5">5%</option>
          <option value="12">12%</option>
          <option value="18">18%</option>
          <option value="28">28%</option>
        </select>
      </td>

      {/* Line Total */}
      <td className="px-3 py-2 text-right font-medium">
        ₹{lineTotal.toFixed(2)}
      </td>

      {/* Remove Button */}
      <td className="px-3 py-2 text-center">
        <button
          onClick={onRemove}
          className="text-red-500 hover:text-red-700"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
};

export default ProductLineEntry;