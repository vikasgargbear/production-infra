import React, { useState, useRef, useEffect } from 'react';
import { Search } from 'lucide-react';
import { searchCache } from '../../utils/searchCache';
import { debounce } from '../../utils/debounce';

const ProductSearchInput = ({ 
  value, 
  onChange, 
  placeholder = "Search products...",
  className = "",
  onProductSelect
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearch, setShowSearch] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  
  const searchRef = useRef(null);
  
  // Find selected product on mount or value change
  useEffect(() => {
    if (value) {
      const product = searchCache.getPreloadedData('products')
        .find(p => p.product_id === value);
      if (product) {
        setSelectedProduct(product);
      }
    } else {
      setSelectedProduct(null);
    }
  }, [value]);
  
  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowSearch(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  // Debounced search
  const debouncedSearch = debounce(async (query) => {
    if (query && query.length >= 1) {
      const localResults = searchCache.searchLocal('products', query, 20);
      if (localResults && localResults.length > 0) {
        setSearchResults(Array.isArray(localResults) ? localResults : []);
        setLoading(false);
      }
    } else {
      setSearchResults([]);
    }
  }, 150);
  
  const handleSelect = (product) => {
    setSelectedProduct(product);
    onChange(product.product_id);
    if (onProductSelect) {
      onProductSelect(product);
    }
    setShowSearch(false);
    setSearchQuery('');
  };
  
  const handleClear = () => {
    setSelectedProduct(null);
    onChange('');
    setSearchQuery('');
  };
  
  return (
    <div className="relative" ref={searchRef}>
      {selectedProduct ? (
        <div className={`p-2 border border-gray-300 rounded bg-gray-50 ${className}`}>
          <div className="flex justify-between items-center">
            <div className="text-sm">
              <p className="font-medium truncate">{selectedProduct.product_name}</p>
              <p className="text-xs text-gray-600">{selectedProduct.product_code}</p>
            </div>
            <button
              onClick={handleClear}
              className="text-xs text-blue-600 hover:text-blue-700 ml-2"
            >
              Change
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder={placeholder}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                debouncedSearch(e.target.value);
                setShowSearch(true);
              }}
              onFocus={() => setShowSearch(true)}
              className={`w-full pl-8 pr-2 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${className}`}
            />
          </div>
          
          {showSearch && searchResults.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {Array.isArray(searchResults) && searchResults.map(product => (
                <div
                  key={product.product_id}
                  onClick={() => handleSelect(product)}
                  className="px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="text-sm font-medium">{product.product_name}</div>
                      <div className="text-xs text-gray-600">
                        {product.product_code} • MRP: ₹{product.mrp}
                      </div>
                    </div>
                    <div className="text-right ml-2">
                      <div className="text-sm font-semibold text-gray-700">
                        {product.total_quantity || product.quantity || 0}
                      </div>
                      <div className="text-xs text-gray-500">in stock</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ProductSearchInput;