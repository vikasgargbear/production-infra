import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Package, Search, Plus, X, Box, AlertCircle, TrendingUp } from 'lucide-react';
import { searchCache, smartSearch } from '../../../utils/searchCache';
import { productAPI, batchAPI } from '../../../services/api';
import DataTransformer from '../../../services/dataTransformer';
import { INVOICE_CONFIG, getStockLevelInfo } from '../../../config/invoice.config';
import { APP_CONFIG } from '../../../config/app.config';
import { debounce } from '../../../utils/debounce';

/**
 * Global Product Search Component
 * 
 * Props:
 * - value: Selected product object
 * - onChange: Function called when product is selected/removed
 * - onBatchSelect: Function called after batch selection (if enableBatchSelection is true)
 * - onCreateNew: Function called when "Add New Product" is clicked
 * - placeholder: Placeholder text for search
 * - disabled: Disable the component
 * - required: Make selection required
 * - showCreateButton: Show/hide the create new product button
 * - displayMode: 'inline' | 'modal' | 'dropdown' (default: 'modal')
 * - className: Additional CSS classes
 * - searchFields: Array of fields to search in
 * - renderProductInfo: Custom render function for product display
 * - autoFocus: Auto-focus search input
 * - clearable: Allow clearing selection
 * - enableBatchSelection: Enable batch selection after product selection
 * - showStockInfo: Show stock availability info
 * - showPricing: Show pricing information
 * - enrichWithBatchInfo: Fetch and show batch count
 * - filterOutOfStock: Filter out products with no stock
 */

const ProductSearch = ({
  value,
  onChange,
  onBatchSelect,
  onCreateNew,
  placeholder = "Search by product name, code, or manufacturer...",
  disabled = false,
  required = false,
  showCreateButton = true,
  displayMode = 'modal',
  className = '',
  searchFields = ['product_name', 'product_code', 'manufacturer', 'category'],
  renderProductInfo,
  autoFocus = false,
  clearable = true,
  enableBatchSelection = false,
  showStockInfo = true,
  showPricing = true,
  enrichWithBatchInfo = true,
  filterOutOfStock = false,
  showLabel = false,
  label = 'Product Selection'
}) => {
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedProductForBatch, setSelectedProductForBatch] = useState(null);
  const searchInputRef = useRef(null);
  const dropdownRef = useRef(null);

  // Debounced search function
  const debouncedSearch = useCallback(
    debounce(async (query) => {
      if (!query || query.length < INVOICE_CONFIG.SEARCH.MIN_QUERY_LENGTH) {
        setSearchResults([]);
        return;
      }

      setSearchLoading(true);
      try {
        const results = await smartSearch('products', query, 
          (q) => productAPI.search(q),
          { 
            useLocalSearch: true, 
            limit: INVOICE_CONFIG.SEARCH.MAX_RESULTS.API,
            searchFields 
          }
        );
        
        // Transform results for consistent data structure
        let transformedResults = results ? 
          results.map(product => DataTransformer.transformProduct(product, 'search')) : [];
        
        // Enrich with batch information if enabled
        if (enrichWithBatchInfo && transformedResults.length > 0) {
          transformedResults = await Promise.all(
            transformedResults.map(async (product) => {
              try {
                const batchResponse = await batchAPI.getByProduct(product.product_id);
                const batches = batchResponse.data?.batches || batchResponse.data || [];
                const availableBatches = batches.filter(b => b.quantity_available > 0);
                const totalQuantity = availableBatches.reduce((sum, batch) => 
                  sum + (batch.quantity_available || 0), 0
                );
                
                return {
                  ...product,
                  total_quantity: totalQuantity,
                  batch_count: availableBatches.length,
                  has_stock: totalQuantity > 0
                };
              } catch (error) {
                console.error(`Error fetching batches for product ${product.product_id}:`, error);
                return { 
                  ...product, 
                  total_quantity: product.quantity_available || 0, 
                  batch_count: 0,
                  has_stock: (product.quantity_available || 0) > 0
                };
              }
            })
          );
        }
        
        // Filter out of stock if enabled
        if (filterOutOfStock) {
          transformedResults = transformedResults.filter(p => p.has_stock);
        }
        
        // Sort by stock availability and relevance
        transformedResults.sort((a, b) => {
          const aStock = a.total_quantity || 0;
          const bStock = b.total_quantity || 0;
          if (aStock === 0 && bStock > 0) return 1;
          if (aStock > 0 && bStock === 0) return -1;
          return bStock - aStock;
        });
        
        setSearchResults(transformedResults);
      } catch (error) {
        console.error('Error searching products:', error);
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, INVOICE_CONFIG.SEARCH.DEBOUNCE_DELAY.PRODUCT),
    [searchFields, enrichWithBatchInfo, filterOutOfStock]
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

  // Handle product selection
  const handleProductSelect = (product) => {
    if (enableBatchSelection && onBatchSelect) {
      setSelectedProductForBatch(product);
    } else {
      onChange(product);
      setShowSearch(false);
      setShowDropdown(false);
      setSearchQuery('');
      setSearchResults([]);
    }
  };

  // Handle remove product
  const handleRemoveProduct = () => {
    onChange(null);
  };

  // Get stock level styling
  const getStockLevelStyle = (quantity) => {
    const stockInfo = getStockLevelInfo(quantity);
    return {
      color: `text-${stockInfo.color}-600`,
      bg: `bg-${stockInfo.color}-50`,
      border: `border-${stockInfo.color}-200`
    };
  };

  // Default product info renderer
  const defaultRenderProductInfo = (product) => (
    <div className="space-y-2">
      <div className="flex justify-between items-start">
        <div>
          <p className="font-medium text-gray-900">{product.product_name}</p>
          {product.product_code && (
            <p className="text-sm text-gray-500">Code: {product.product_code}</p>
          )}
        </div>
        {showPricing && (
          <div className="text-right">
            <p className="font-bold text-gray-900">₹{product.sale_price}</p>
            {product.mrp && product.mrp !== product.sale_price && (
              <p className="text-sm text-gray-500 line-through">₹{product.mrp}</p>
            )}
          </div>
        )}
      </div>
      
      <div className="text-sm text-gray-600 grid grid-cols-2 gap-1">
        {product.manufacturer && <p>MFR: {product.manufacturer}</p>}
        {product.category && <p>Category: {product.category}</p>}
        {product.hsn_code && <p>HSN: {product.hsn_code}</p>}
        {product.gst_percent && <p>GST: {product.gst_percent}%</p>}
      </div>
      
      {showStockInfo && product.total_quantity !== undefined && (
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-1 rounded ${getStockLevelStyle(product.total_quantity).bg} ${getStockLevelStyle(product.total_quantity).color}`}>
            Stock: {product.total_quantity} units
          </span>
          {product.batch_count > 0 && (
            <span className="text-xs text-gray-500">
              {product.batch_count} batch{product.batch_count > 1 ? 'es' : ''}
            </span>
          )}
        </div>
      )}
    </div>
  );

  // Render search results
  const renderSearchResults = () => (
    <>
      {searchLoading ? (
        <div className="text-center py-8 text-gray-500">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          <p className="mt-2">Searching products...</p>
        </div>
      ) : searchResults.length > 0 ? (
        <div className="space-y-2">
          {searchResults.map((product) => {
            const stockInfo = getStockLevelInfo(product.total_quantity || 0);
            const isOutOfStock = !product.has_stock;
            
            return (
              <div
                key={product.product_id}
                onClick={() => !isOutOfStock && handleProductSelect(product)}
                className={`p-4 border rounded-lg transition-colors ${
                  isOutOfStock 
                    ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60' 
                    : 'border-gray-200 hover:bg-gray-50 cursor-pointer'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">
                      {product.product_name}
                      {isOutOfStock && (
                        <span className="ml-2 text-xs text-red-600 font-normal">
                          (Out of Stock)
                        </span>
                      )}
                    </p>
                    <div className="text-sm text-gray-600 mt-1 grid grid-cols-2 gap-x-4 gap-y-1">
                      {product.product_code && <p>Code: {product.product_code}</p>}
                      {product.manufacturer && <p>MFR: {product.manufacturer}</p>}
                      {product.category && <p>Category: {product.category}</p>}
                      {product.hsn_code && <p>HSN: {product.hsn_code}</p>}
                    </div>
                  </div>
                  
                  <div className="ml-4 text-right space-y-1">
                    {showPricing && (
                      <>
                        <p className="text-lg font-bold text-gray-900">₹{product.sale_price}</p>
                        {product.mrp && product.mrp !== product.sale_price && (
                          <p className="text-sm text-gray-500 line-through">₹{product.mrp}</p>
                        )}
                      </>
                    )}
                    <span className={`inline-block text-xs px-2 py-1 rounded ${
                      product.gst_percent === 12 ? 'bg-blue-100 text-blue-700' :
                      product.gst_percent === 18 ? 'bg-green-100 text-green-700' :
                      product.gst_percent === 5 ? 'bg-yellow-100 text-yellow-700' :
                      product.gst_percent === 28 ? 'bg-purple-100 text-purple-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      GST: {product.gst_percent}%
                    </span>
                  </div>
                </div>
                
                {showStockInfo && (
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-1 rounded border ${stockInfo.color === 'emerald' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : ''} ${stockInfo.color === 'amber' ? 'bg-amber-50 text-amber-700 border-amber-200' : ''} ${stockInfo.color === 'orange' ? 'bg-orange-50 text-orange-700 border-orange-200' : ''} ${stockInfo.color === 'red' ? 'bg-red-50 text-red-700 border-red-200' : ''}`}>
                        <Box className="w-3 h-3 inline mr-1" />
                        {stockInfo.label}: {product.total_quantity || 0} units
                      </span>
                      {product.batch_count > 0 && (
                        <span className="text-xs text-gray-500">
                          {product.batch_count} batch{product.batch_count > 1 ? 'es' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : searchQuery.length >= INVOICE_CONFIG.SEARCH.MIN_QUERY_LENGTH ? (
        <div className="text-center py-8">
          <Package className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-500">No products found</p>
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
              Create New Product
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
      <div className={`${showLabel ? 'bg-white rounded-lg shadow-sm p-4' : ''} ${className}`}>
        {showLabel && (
          <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3 flex items-center">
            <Package className="w-4 h-4 mr-2" />
            {label}
          </h3>
        )}
        
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
              <div className="border border-gray-200 rounded-lg max-h-96 overflow-y-auto">
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
                <span>Add New Product</span>
              </button>
            )}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-lg p-4 relative">
            {clearable && (
              <button
                onClick={handleRemoveProduct}
                className="absolute top-2 right-2 p-1 hover:bg-gray-200 rounded"
                disabled={disabled}
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            )}
            
            {renderProductInfo ? renderProductInfo(value) : defaultRenderProductInfo(value)}
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
              <div className="absolute z-10 mt-1 w-full bg-white rounded-lg shadow-lg border border-gray-200 max-h-96 overflow-y-auto">
                {renderSearchResults()}
              </div>
            )}
          </div>
        ) : (
          <div className="relative">
            <div className="bg-gray-50 rounded-lg p-3 pr-10">
              {renderProductInfo ? renderProductInfo(value) : (
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium text-gray-900">{value.product_name}</p>
                    <p className="text-sm text-gray-600">
                      {value.product_code} • ₹{value.sale_price}
                    </p>
                  </div>
                </div>
              )}
            </div>
            {clearable && (
              <button
                onClick={handleRemoveProduct}
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
    <>
      <div className={`bg-white rounded-lg shadow-sm p-4 ${className}`}>
        <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
          <Package className="w-4 h-4 mr-2" />
          Add Products
        </h3>
        
        {!value ? (
          <div className="space-y-3">
            <button
              onClick={() => setShowSearch(true)}
              className="w-full py-3 px-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors flex items-center justify-center space-x-2 text-gray-600 hover:text-blue-600"
              disabled={disabled}
            >
              <Search className="w-5 h-5" />
              <span>Search Product</span>
            </button>
            
            {showCreateButton && onCreateNew && (
              <button
                onClick={onCreateNew}
                className="w-full py-2 px-4 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center space-x-2"
                disabled={disabled}
              >
                <Plus className="w-4 h-4" />
                <span>Add New Product</span>
              </button>
            )}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-lg p-4 relative">
            {clearable && (
              <button
                onClick={handleRemoveProduct}
                className="absolute top-2 right-2 p-1 hover:bg-gray-200 rounded"
                disabled={disabled}
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            )}
            
            {renderProductInfo ? renderProductInfo(value) : defaultRenderProductInfo(value)}
          </div>
        )}
      </div>

      {/* Product Search Modal */}
      {showSearch && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4 max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Search Product</h3>
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
    </>
  );
};

export default ProductSearch;