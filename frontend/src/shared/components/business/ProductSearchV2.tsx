/**
 * Product Search Component - Using PostgreSQL Functions
 * Searches using api.search_products() through REST wrapper
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useQuery } from 'react-query';
import { debounce } from 'lodash';
import { productAPI } from '../../../services/api/apiClient';
import { Input } from '../ui/Input';
import { Spinner } from '../ui/Spinner';
import { Badge } from '../ui/Badge';

interface Product {
  product_id: number;
  product_name: string;
  product_code: string;
  manufacturer?: string;
  category?: string;
  hsn_code?: string;
  mrp: number;
  sale_price: number;
  gst_percent: number;
  current_stock?: number;
  pack_size?: string;
  is_narcotic?: boolean;
}

interface ProductStock {
  total_available: number;
  reserved_quantity: number;
  batches: Array<{
    batch_id: number;
    batch_number: string;
    expiry_date: string;
    available_quantity: number;
    mrp: number;
    sale_price: number;
  }>;
}

interface ProductSearchProps {
  onSelect: (product: Product, batch?: any) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  showStock?: boolean;
  categoryFilter?: number;
}

export const ProductSearchV2: React.FC<ProductSearchProps> = ({
  onSelect,
  placeholder = "Search product by name, brand, or HSN...",
  className = "",
  autoFocus = false,
  showStock = true,
  categoryFilter,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);

  // Debounced search function
  const debouncedSearch = useCallback(
    debounce((value: string) => {
      setDebouncedSearchTerm(value);
    }, 300),
    []
  );

  // Search products query
  const { data, isLoading, error } = useQuery(
    ['products', 'search', debouncedSearchTerm, categoryFilter],
    () => productAPI.search(debouncedSearchTerm, { categoryId: categoryFilter }),
    {
      enabled: debouncedSearchTerm.length >= 2,
      staleTime: 5 * 60 * 1000,
      cacheTime: 10 * 60 * 1000,
    }
  );

  // Get stock for selected product
  const { data: stockData } = useQuery<ProductStock>(
    ['products', selectedProductId, 'stock'],
    () => productAPI.getStock(selectedProductId!),
    {
      enabled: !!selectedProductId && showStock,
      staleTime: 30 * 1000, // 30 seconds - stock changes frequently
    }
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);
    debouncedSearch(value);
    setIsOpen(true);
  };

  const handleSelectProduct = async (product: Product) => {
    if (showStock) {
      setSelectedProductId(product.product_id);
      // Wait a bit for stock data to load
      setTimeout(() => {
        const batches = stockData?.batches || [];
        if (batches.length > 0) {
          // Auto-select first available batch (FIFO)
          onSelect(product, batches[0]);
        } else {
          onSelect(product);
        }
        setSearchTerm(product.product_name);
        setIsOpen(false);
      }, 100);
    } else {
      onSelect(product);
      setSearchTerm(product.product_name);
      setIsOpen(false);
    }
  };

  const products = data?.products || [];

  return (
    <div className={`relative ${className}`}>
      <Input
        type="text"
        value={searchTerm}
        onChange={handleInputChange}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full"
      />

      {isOpen && searchTerm.length >= 2 && (
        <div className="absolute z-50 w-full mt-1 bg-white rounded-md shadow-lg max-h-96 overflow-auto">
          {isLoading ? (
            <div className="p-4 text-center">
              <Spinner size="sm" />
              <span className="ml-2 text-sm text-gray-600">Searching...</span>
            </div>
          ) : error ? (
            <div className="p-4 text-center text-red-600">
              Error loading products
            </div>
          ) : products.length === 0 ? (
            <div className="p-4 text-center text-gray-600">
              No products found
            </div>
          ) : (
            <ul className="py-1">
              {products.map((product) => (
                <li
                  key={product.product_id}
                  onClick={() => handleSelectProduct(product)}
                  className="px-4 py-3 hover:bg-gray-100 cursor-pointer border-b"
                  onMouseEnter={() => showStock && setSelectedProductId(product.product_id)}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">
                          {product.product_name}
                        </span>
                        {product.is_narcotic && (
                          <Badge variant="danger" size="sm">Narcotic</Badge>
                        )}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        {product.manufacturer} • {product.category}
                        {product.pack_size && ` • ${product.pack_size}`}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        HSN: {product.hsn_code} • Code: {product.product_code}
                      </div>
                    </div>
                    <div className="text-right ml-4">
                      <div className="font-medium text-gray-900">
                        ₹{product.sale_price.toFixed(2)}
                      </div>
                      <div className="text-xs text-gray-500">
                        MRP: ₹{product.mrp.toFixed(2)}
                      </div>
                      <div className="text-xs text-gray-500">
                        GST: {product.gst_percent}%
                      </div>
                    </div>
                  </div>

                  {/* Stock information */}
                  {showStock && selectedProductId === product.product_id && stockData && (
                    <div className="mt-2 pt-2 border-t">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Available Stock:</span>
                        <span className={`font-medium ${
                          stockData.total_available > 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {stockData.total_available} units
                        </span>
                      </div>
                      {stockData.batches.length > 0 && (
                        <div className="mt-1 text-xs text-gray-500">
                          {stockData.batches.length} batch(es) available
                          {stockData.batches[0] && (
                            <span className="ml-2">
                              (Next expiry: {new Date(stockData.batches[0].expiry_date).toLocaleDateString()})
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Click outside to close */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
};