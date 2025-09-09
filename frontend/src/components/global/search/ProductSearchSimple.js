import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Search, Package, Plus, X, Loader2 } from 'lucide-react';
import { productAPI } from '../../../services/api';
import { AddNewButton } from '../ui';
import BatchSelectionModalV2 from '../../invoice/modals/BatchSelectionModalV2';
import DataTransformer from '../../../services/dataTransformer';
import searchCache, { smartSearch } from '../../../utils/searchCache';
import { debounce } from '../../../utils/debounce';

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

  // Preload products on mount for ultra-fast search
  useEffect(() => {
    const preloadProducts = async () => {
      try {
        // Check if we already have products in cache
        const cached = searchCache.get('products', 'all');
        if (cached && cached.length > 0) {
          return; // Already cached
        }

        // Load recent products for quick access
        const response = await productAPI.list({ limit: 100 });
        const products = response?.data || response || [];
        
        if (products.length > 0) {
          searchCache.setItems('products', products);
          searchCache.set('products', 'all', products);
        }
      } catch (error) {
      }
    };

    preloadProducts();
  }, []);

  // Debounced search function with smart cache integration
  const searchProducts = useCallback(
    debounce(async (query) => {
      if (!query || query.length < 2) {
        setSearchResults([]);
        return;
      }

      setLoading(true);
      try {
        // Use smartSearch with the product API search function
        const results = await smartSearch(
          'products', 
          query, 
          productAPI.search.bind(productAPI),
          { limit: 20 }
        );
        
        // Transform results to consistent format
        const transformedResults = results.map(product => 
          DataTransformer.transformProduct(product, 'search')
        );
        setSearchResults(transformedResults);
      } catch (error) {
        
        // Fallback to direct API search if smartSearch fails
        try {
          const response = await productAPI.search(query);
          const results = response?.data || response || [];
          
          // Transform results to consistent format
          const transformedResults = results.map(product => 
            DataTransformer.transformProduct(product, 'search')
          );
          setSearchResults(transformedResults);
          
          // Cache the results for next time
          if (results.length > 0) {
            searchCache.setItems('products', results);
          }
        } catch (apiError) {
          setSearchResults([]);
        }
      } finally {
        setLoading(false);
      }
    }, 200), // 200ms to reduce request bursts and timeouts
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
      e.stopPropagation(); // Stop ESC from bubbling up to parent
      setShowDropdown(false);
      setSearchQuery(''); // Clear search term
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
                  <>
                    {searchResults.map((product) => (
                      <div
                        key={product.product_id || product.id}
                        onClick={() => handleProductSelect(product)}
                        className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100"
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
                            <div className="text-xs text-gray-500">+GST {product.gst_percent || product.tax_rate || 0}%</div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {/* Always show "Create Product" option when onCreateProduct is available */}
                    {onCreateProduct && searchQuery.length >= 2 && (
                      <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
                        <AddNewButton
                          label={`Create Product "${searchQuery}"`}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setShowDropdown(false);
                            if (typeof onCreateProduct === 'function') {
                              onCreateProduct(searchQuery);
                            }
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
                      <Package className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">No products found for "{searchQuery}"</p>
                    </div>
                    {onCreateProduct && (
                      <AddNewButton
                        label={`Create Product "${searchQuery}"`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setShowDropdown(false);
                          // Pass the search query to pre-fill product name
                          if (typeof onCreateProduct === 'function') {
                            onCreateProduct(searchQuery);
                          } else {
                          }
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