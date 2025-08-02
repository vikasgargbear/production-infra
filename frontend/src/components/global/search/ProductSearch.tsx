import React, { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { Package, Search, Plus, X, Box, AlertCircle, TrendingUp } from 'lucide-react';
import { Product, ProductBatch } from '../../../types/models/product';
import { useProductSearch } from '../../../hooks/products/useProducts';
import { debounce } from 'lodash';

/**
 * Stock level configuration
 */
const STOCK_LEVELS = {
  HIGH: { threshold: 50, label: 'High Stock', color: 'emerald' },
  MEDIUM: { threshold: 20, label: 'Medium Stock', color: 'amber' },
  LOW: { threshold: 10, label: 'Low Stock', color: 'orange' },
  CRITICAL: { threshold: 0, label: 'Out of Stock', color: 'red' },
};

/**
 * Get stock level info based on quantity
 */
const getStockLevelInfo = (quantity: number) => {
  if (quantity > STOCK_LEVELS.HIGH.threshold) return STOCK_LEVELS.HIGH;
  if (quantity > STOCK_LEVELS.MEDIUM.threshold) return STOCK_LEVELS.MEDIUM;
  if (quantity > STOCK_LEVELS.LOW.threshold) return STOCK_LEVELS.LOW;
  return STOCK_LEVELS.CRITICAL;
};

/**
 * ProductSearch Component Props
 */
interface ProductSearchProps {
  value: Product | null;
  onChange: (product: Product | null) => void;
  onBatchSelect?: (product: Product, batch: ProductBatch) => void;
  onCreateNew?: () => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  showCreateButton?: boolean;
  displayMode?: 'inline' | 'modal' | 'dropdown';
  className?: string;
  renderProductInfo?: (product: Product) => React.ReactNode;
  autoFocus?: boolean;
  clearable?: boolean;
  enableBatchSelection?: boolean;
  showStockInfo?: boolean;
  showPricing?: boolean;
  filterOutOfStock?: boolean;
  showLabel?: boolean;
  label?: string;
  minSearchLength?: number;
  searchParams?: {
    category?: string;
    has_stock?: boolean;
    limit?: number;
  };
}

export interface ProductSearchRef {
  focus: () => void;
  clear: () => void;
}

/**
 * Global Product Search Component v2
 * TypeScript version with enhanced type safety
 */
export const ProductSearch = forwardRef<ProductSearchRef, ProductSearchProps>(({
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
  renderProductInfo,
  autoFocus = false,
  clearable = true,
  enableBatchSelection = false,
  showStockInfo = true,
  showPricing = true,
  filterOutOfStock = false,
  showLabel = false,
  label = 'Product Selection',
  minSearchLength = 2,
  searchParams = {},
}, ref) => {
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Use the typed React Query hook
  const { data, isLoading, error } = useProductSearch(searchQuery, {
    ...searchParams,
    limit: searchParams.limit || 20,
  }, {
    enabled: searchQuery.length >= minSearchLength,
  });

  const searchResults = data?.data || [];

  // Filter results if needed
  const filteredResults = filterOutOfStock 
    ? searchResults.filter(p => (p.total_quantity || 0) > 0)
    : searchResults;

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    focus: () => {
      searchInputRef.current?.focus();
    },
    clear: () => {
      setSearchQuery('');
    }
  }));

  // Handle click outside for dropdown mode
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    if (displayMode === 'dropdown' && showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [displayMode, showDropdown]);

  // Handle product selection
  const handleProductSelect = (product: Product) => {
    if (enableBatchSelection && onBatchSelect) {
      // TODO: Implement batch selection modal
      console.log('Batch selection not yet implemented in v2');
      onChange(product);
    } else {
      onChange(product);
      setShowSearch(false);
      setShowDropdown(false);
      setSearchQuery('');
    }
  };

  // Handle remove product
  const handleRemoveProduct = () => {
    onChange(null);
  };

  // Get stock level styling with proper TypeScript
  const getStockLevelStyle = (quantity: number) => {
    const stockInfo = getStockLevelInfo(quantity);
    const colorMap = {
      emerald: {
        text: 'text-emerald-700',
        bg: 'bg-emerald-50',
        border: 'border-emerald-200'
      },
      amber: {
        text: 'text-amber-700',
        bg: 'bg-amber-50',
        border: 'border-amber-200'
      },
      orange: {
        text: 'text-orange-700',
        bg: 'bg-orange-50',
        border: 'border-orange-200'
      },
      red: {
        text: 'text-red-700',
        bg: 'bg-red-50',
        border: 'border-red-200'
      },
    };
    
    return colorMap[stockInfo.color as keyof typeof colorMap];
  };

  // Default product info renderer
  const defaultRenderProductInfo = (product: Product) => (
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
          <span className={`text-xs px-2 py-1 rounded ${getStockLevelStyle(product.total_quantity).bg} ${getStockLevelStyle(product.total_quantity).text}`}>
            Stock: {product.total_quantity} units
          </span>
          {product.batch_count !== undefined && product.batch_count > 0 && (
            <span className="text-xs text-gray-500">
              {product.batch_count} batch{product.batch_count > 1 ? 'es' : ''}
            </span>
          )}
        </div>
      )}
    </div>
  );

  // Get GST badge color
  const getGSTBadgeColor = (gstPercent: number) => {
    switch (gstPercent) {
      case 5: return 'bg-yellow-100 text-yellow-700';
      case 12: return 'bg-blue-100 text-blue-700';
      case 18: return 'bg-green-100 text-green-700';
      case 28: return 'bg-purple-100 text-purple-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  // Render search results
  const renderSearchResults = () => (
    <>
      {isLoading ? (
        <div className="text-center py-8 text-gray-500">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          <p className="mt-2">Searching products...</p>
        </div>
      ) : error ? (
        <div className="text-center py-8 text-red-500">
          <AlertCircle className="w-12 h-12 mx-auto mb-3" />
          <p>Error searching products</p>
        </div>
      ) : filteredResults.length > 0 ? (
        <div className="space-y-2">
          {filteredResults.map((product) => {
            const stockInfo = getStockLevelInfo(product.total_quantity || 0);
            const isOutOfStock = (product.total_quantity || 0) === 0;
            const styles = getStockLevelStyle(product.total_quantity || 0);
            
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
                    <span className={`inline-block text-xs px-2 py-1 rounded ${getGSTBadgeColor(product.gst_percent)}`}>
                      GST: {product.gst_percent}%
                    </span>
                  </div>
                </div>
                
                {showStockInfo && (
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-1 rounded border ${styles.bg} ${styles.text} ${styles.border}`}>
                        <Box className="w-3 h-3 inline mr-1" />
                        {stockInfo.label}: {product.total_quantity || 0} units
                      </span>
                      {product.batch_count !== undefined && product.batch_count > 0 && (
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
      ) : searchQuery.length >= minSearchLength ? (
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
          Type at least {minSearchLength} characters to search
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
              <div className="absolute z-50 mt-1 w-full bg-white rounded-lg shadow-lg border border-gray-200 max-h-96 overflow-y-auto">
                <div className="p-2">
                  {renderSearchResults()}
                </div>
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
      {!value ? (
        <button
          type="button"
          onClick={() => setShowSearch(true)}
          disabled={disabled}
          className={`w-full p-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-gray-400 transition-colors flex items-center justify-center gap-2 ${
            disabled ? 'opacity-50 cursor-not-allowed' : ''
          } ${className}`}
        >
          <Package className="w-5 h-5 text-gray-400" />
          <span className="text-gray-600">Select Product</span>
        </button>
      ) : (
        <div className={`bg-gray-50 rounded-lg p-4 ${className}`}>
          <div className="flex justify-between items-start">
            <div className="flex-1">
              {renderProductInfo ? renderProductInfo(value) : defaultRenderProductInfo(value)}
            </div>
            {clearable && !disabled && (
              <button
                onClick={handleRemoveProduct}
                className="ml-3 p-1 hover:bg-gray-200 rounded"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            )}
          </div>
        </div>
      )}

      {showSearch && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-hidden">
            <div className="p-4 border-b">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold">Select Product</h2>
                <button
                  onClick={() => setShowSearch(false)}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="p-4">
              <div className="relative mb-4">
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
              
              <div className="max-h-[60vh] overflow-y-auto">
                {renderSearchResults()}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

ProductSearch.displayName = 'ProductSearch';