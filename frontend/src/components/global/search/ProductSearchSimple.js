import React, { useState, useEffect, useCallback, forwardRef, useImperativeHandle, useRef } from 'react';
import { Search, Package, Plus } from 'lucide-react';
import { productAPI } from '../../../services/api';
import { debounce } from '../../../utils/debounce';
import BatchSelectionModalV2 from '../../invoice/modals/BatchSelectionModalV2';
import DataTransformer from '../../../services/dataTransformer';

const ProductSearchSimple = forwardRef(({ onAddItem, onCreateProduct, showBatchSelection = true }, ref) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
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
  const searchProducts = useCallback(
    debounce(async (query) => {
      if (!query || query.length < 2) {
        setSearchResults([]);
        return;
      }

      setLoading(true);
      try {
        const response = await productAPI.search(query);
        const results = response.data || [];
        // Transform results to consistent format
        const transformedResults = results.map(product => 
          DataTransformer.transformProduct(product, 'search')
        );
        setSearchResults(transformedResults);
      } catch (error) {
        console.error('Error searching products:', error);
        setSearchResults([]);
      } finally {
        setLoading(false);
      }
    }, 300),
    []
  );

  useEffect(() => {
    searchProducts(searchQuery);
  }, [searchQuery, searchProducts]);

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

  const handleProductSelect = (product) => {
    if (showBatchSelection) {
      // Store selected product and show batch modal
      setSelectedProduct(product);
      setShowBatchModal(true);
    } else {
      // Direct add without batch selection (for Purchase Orders)
      onAddItem(product);
    }
    setSearchQuery('');
    setShowDropdown(false);
    setSearchResults([]);
  };

  const handleBatchSelect = (productWithBatch) => {
    // Pass the complete product with batch info to parent
    // The parent (InvoiceFlow) will handle the item creation
    onAddItem(productWithBatch);
    
    // Reset and close modal
    setShowBatchModal(false);
    setSelectedProduct(null);
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  };


  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4" onKeyDown={handleKeyDown}>
      <div className="space-y-3">
        {/* Product Search */}
        <div className="relative" ref={dropdownRef}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search products by name, code, or HSN..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Search Results Dropdown */}
            {showDropdown && searchQuery && (
              <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                {loading ? (
                  <div className="p-4 text-center text-gray-500">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto"></div>
                    <p className="mt-2 text-sm">Searching...</p>
                  </div>
                ) : searchResults.length > 0 ? (
                  searchResults.map((product) => (
                    <div
                      key={product.product_id || product.id}
                      onClick={() => handleProductSelect(product)}
                      className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium text-gray-900">{product.product_name || product.name}</div>
                          <div className="text-sm text-gray-600 mt-1">
                            Code: {product.product_code || product.code || 'N/A'} | HSN: {product.hsn_code || product.hsn || 'N/A'}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            Stock: {product.current_stock || product.stock || 0} | MRP: ₹{product.mrp || 0}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium text-blue-600">₹{product.sale_price || product.selling_price || product.mrp || 0}</div>
                          <div className="text-xs text-gray-500">+GST {product.gst_percent || product.tax_rate || 18}%</div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : searchQuery.length >= 2 ? (
                  <div className="p-4">
                    <div className="text-center mb-3">
                      <Package className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">No products found for "{searchQuery}"</p>
                    </div>
                    {onCreateProduct && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          console.log('Add new product clicked:', searchQuery);
                          console.log('onCreateProduct type:', typeof onCreateProduct);
                          setShowDropdown(false);
                          // Pass the search query to pre-fill product name
                          if (typeof onCreateProduct === 'function') {
                            onCreateProduct(searchQuery);
                          } else {
                            console.error('onCreateProduct is not a function:', onCreateProduct);
                          }
                        }}
                        className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2 font-medium shadow-sm"
                      >
                        <Plus className="w-5 h-5" />
                        Add "{searchQuery}" as New Product
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            )}
        </div>
      </div>

      {/* Batch Selection Modal - Only show if batch selection is enabled */}
      {showBatchSelection && showBatchModal && selectedProduct && (
        <BatchSelectionModalV2
          show={showBatchModal}
          product={selectedProduct}
          onClose={() => {
            setShowBatchModal(false);
            setSelectedProduct(null);
          }}
          onBatchSelect={handleBatchSelect}
        />
      )}
    </div>
  );
});

ProductSearchSimple.displayName = 'ProductSearchSimple';

export default ProductSearchSimple;