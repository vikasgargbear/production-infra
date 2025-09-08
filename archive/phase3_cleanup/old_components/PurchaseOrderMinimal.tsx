import React, { useState, useEffect } from 'react';
import { Search, Plus, Minus, X, ArrowRight, Check, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { suppliersApi } from '../../services/api/modules/suppliers.api';
import { productsApi } from '../../services/api/modules/products.api';
import { purchasesApi } from '../../services/api/modules/purchases.api';
import offlineStorage from '../../services/offlineStorage';

interface PurchaseOrderMinimalProps {
  open?: boolean;
  onClose?: () => void;
}

interface Supplier {
  id?: number;
  supplier_id?: number;
  name?: string;
  supplier_name?: string;
  phone?: string;
  gstin?: string;
  [key: string]: any;
}

interface Product {
  id?: number;
  product_id?: number;
  name?: string;
  product_name?: string;
  price?: number;
  purchase_price?: number;
  mrp?: number;
  stock?: number;
  [key: string]: any;
}

interface OrderItem {
  id: string;
  product: Product;
  quantity: number;
  rate: number;
  amount: number;
}

const PurchaseOrderMinimal: React.FC<PurchaseOrderMinimalProps> = ({ onClose }) => {
  const [step, setStep] = useState<'supplier' | 'items' | 'review' | 'done'>('supplier');
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  
  // API data states
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Load data on component mount
  useEffect(() => {
    loadAllData();
  }, []);

  // Clear old offline data periodically
  useEffect(() => {
    const interval = setInterval(() => {
      offlineStorage.clearOldData(24); // Clear data older than 24 hours
    }, 60 * 60 * 1000); // Check every hour

    return () => clearInterval(interval);
  }, []);

  const loadAllData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Load suppliers and products concurrently
      const [suppliersResponse, productsResponse] = await Promise.all([
        suppliersApi.getAll(),
        productsApi.getAll()
      ]);

      if (suppliersResponse.data) {
        setSuppliers(suppliersResponse.data);
        
        // Store data offline for future use
        await offlineStorage.storeOffline('suppliers', suppliersResponse.data, { 
          persistent: true 
        });
      }

      if (productsResponse.data) {
        setProducts(productsResponse.data);
        
        // Store data offline for future use
        await offlineStorage.storeOffline('products', productsResponse.data, { 
          persistent: true 
        });
      }
    } catch (err) {
      console.error('Error loading data:', err);
      
      // Try to load from offline storage instead of using mock data
      const [offlineSuppliers, offlineProducts] = await Promise.all([
        offlineStorage.getOffline('suppliers', { persistent: true }),
        offlineStorage.getOffline('products', { persistent: true })
      ]);
      
      let hasOfflineData = false;
      
      if (offlineSuppliers && !offlineStorage.isDataStale(offlineSuppliers, 60)) { // 1 hour max for supplier data
        console.log('📱 Using offline suppliers data');
        setSuppliers(offlineSuppliers.data);
        hasOfflineData = true;
      } else {
        setSuppliers([]);
      }
      
      if (offlineProducts && !offlineStorage.isDataStale(offlineProducts, 120)) { // 2 hours max for product data
        console.log('📱 Using offline products data');
        setProducts(offlineProducts.data);
        hasOfflineData = true;
      } else {
        setProducts([]);
      }
      
      if (hasOfflineData) {
        setError('Currently using offline data. Some information may be outdated.');
      } else {
        setError('Unable to load data. Please check your connection and try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAllData();
    setRefreshing(false);
  };

  const filteredSuppliers = suppliers.filter(s => 
    (s.name || s.supplier_name)?.toLowerCase().includes(supplierSearch.toLowerCase()) ||
    s.phone?.includes(supplierSearch)
  );

  const filteredProducts = products.filter(p => 
    (p.name || p.product_name)?.toLowerCase().includes(productSearch.toLowerCase())
  );

  const addItem = (product: Product) => {
    const existingItem = items.find(item => item.product.id === product.id);
    if (existingItem) {
      setItems(items.map(item => 
        item.id === existingItem.id 
          ? { ...item, quantity: item.quantity + 1, amount: (item.quantity + 1) * item.rate }
          : item
      ));
    } else {
      const newItem: OrderItem = {
        id: Date.now().toString(),
        product,
        quantity: 1,
        rate: product.price || product.purchase_price || product.mrp || 0,
        amount: product.price || product.purchase_price || product.mrp || 0,
      };
      setItems([...items, newItem]);
    }
    setProductSearch('');
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setItems(items.map(item => {
      if (item.id === itemId) {
        const newQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQty, amount: newQty * item.rate };
      }
      return item;
    }));
  };

  const removeItem = (itemId: string) => {
    setItems(items.filter(item => item.id !== itemId));
  };

  const createPurchaseOrder = async () => {
    try {
      setIsLoading(true);
      
      if (!selectedSupplier) {
        throw new Error('No supplier selected');
      }

      const poData = {
        supplier_id: selectedSupplier.id || selectedSupplier.supplier_id,
        items: items.map(item => ({
          product_id: item.product.id || item.product.product_id,
          quantity: item.quantity,
          rate: item.rate
        })),
        total_amount: totalAmount,
        gst_amount: gst,
        grand_total: grandTotal,
        notes: 'Purchase order created via minimal flow'
      };

      const response = await purchasesApi.create(poData);
      
      if (response.data) {
        setStep('done');
      }
    } catch (err) {
      console.error('Failed to create purchase order:', err);
      alert(`Failed to create purchase order: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
  const gst = totalAmount * 0.18;
  const grandTotal = totalAmount + gst;

  // Loading state
  if (isLoading && suppliers.length === 0) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-gray-600" />
          <p className="text-gray-600">Loading purchase order data...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && suppliers.length === 0) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center max-w-md mx-auto">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-red-800 mb-2">Error Loading Data</h3>
          <p className="text-red-700 mb-4">{error}</p>
          <button
            onClick={handleRefresh}
            className="px-4 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200 text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Step 1: Select Supplier
  if (step === 'supplier') {
    return (
      <div className="min-h-screen bg-white">
        <div className="border-b border-gray-100">
          <div className="px-6 py-4 flex items-center justify-between">
            <h1 className="text-lg font-medium text-gray-900">Purchase Order</h1>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50"
              >
                {refreshing ? (
                  <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                ) : (
                  <RefreshCw className="w-4 h-4 text-gray-500" />
                )}
              </button>
              {onClose && (
                <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="max-w-lg mx-auto p-6">
          <div className="mb-6">
            <p className="text-sm text-gray-500 mb-4">Select supplier</p>
            <div className="relative">
              <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search supplier..."
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400"
                value={supplierSearch}
                onChange={(e) => setSupplierSearch(e.target.value)}
                autoFocus
              />
            </div>
          </div>

          <div className="space-y-2">
            {filteredSuppliers.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No suppliers found</p>
                <p className="text-sm">Try adjusting your search</p>
              </div>
            ) : (
              filteredSuppliers.map((supplier) => (
                <button
                  key={supplier.id || supplier.supplier_id}
                  className="w-full p-4 text-left border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  onClick={() => {
                    setSelectedSupplier(supplier);
                    setStep('items');
                  }}
                >
                  <div className="font-medium text-gray-900">{supplier.name || supplier.supplier_name}</div>
                  <div className="text-sm text-gray-500">{supplier.phone}</div>
                  {supplier.gstin && <div className="text-xs text-gray-400">GSTIN: {supplier.gstin}</div>}
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  // Step 2: Add Items
  if (step === 'items') {
    return (
      <div className="min-h-screen bg-white">
        <div className="border-b border-gray-100">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between mb-2">
              <h1 className="text-lg font-medium text-gray-900">Add Products</h1>
              {onClose && (
                <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              )}
            </div>
            <p className="text-sm text-gray-500">{selectedSupplier?.name || selectedSupplier?.supplier_name}</p>
          </div>
        </div>

        <div className="max-w-lg mx-auto p-6">
          {/* Product Search */}
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search products..."
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                autoFocus
              />
            </div>
            
            {productSearch && (
              <div className="mt-2 border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
                {filteredProducts.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <p>No products found</p>
                    <p className="text-sm">Try adjusting your search</p>
                  </div>
                ) : (
                  filteredProducts.map((product) => (
                    <button
                      key={product.id || product.product_id}
                      className="w-full p-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                      onClick={() => addItem(product)}
                    >
                      <div className="font-medium text-gray-900">{product.name || product.product_name}</div>
                      <div className="flex justify-between text-sm text-gray-500">
                        <span>₹{product.price || product.purchase_price || product.mrp}</span>
                        <span>Stock: {product.stock || 0}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Selected Items */}
          {items.length > 0 && (
            <div className="mb-6">
              <p className="text-sm text-gray-500 mb-3">Selected Products</p>
              <div className="space-y-2">
                {items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{item.product.name || item.product.product_name}</div>
                      <div className="text-sm text-gray-500">₹{item.rate} each</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => updateQuantity(item.id, -1)}
                        className="p-1 hover:bg-gray-200 rounded"
                      >
                        <Minus className="w-4 h-4 text-gray-600" />
                      </button>
                      <span className="w-8 text-center font-medium">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.id, 1)}
                        className="p-1 hover:bg-gray-200 rounded"
                      >
                        <Plus className="w-4 h-4 text-gray-600" />
                      </button>
                      <button
                        onClick={() => removeItem(item.id)}
                        className="ml-2 p-1 hover:bg-gray-200 rounded"
                      >
                        <X className="w-4 h-4 text-gray-600" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Summary */}
          {items.length > 0 && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>Subtotal</span>
                <span>₹{totalAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>GST (18%)</span>
                <span>₹{gst.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-medium text-gray-900 pt-2 border-t">
                <span>Total</span>
                <span>₹{grandTotal.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="space-y-3">
            <button
              onClick={() => setStep('review')}
              disabled={items.length === 0}
              className={`w-full py-3 rounded-lg font-medium transition-colors ${
                items.length > 0 
                  ? 'bg-gray-900 text-white hover:bg-gray-800' 
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              Continue
              <ArrowRight className="w-4 h-4 ml-2 inline" />
            </button>
            <button
              onClick={() => setStep('supplier')}
              className="w-full py-3 text-gray-600 hover:text-gray-900 transition-colors"
            >
              Back to supplier
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step 3: Review
  if (step === 'review') {
    return (
      <div className="min-h-screen bg-white">
        <div className="border-b border-gray-100">
          <div className="px-6 py-4">
            <h1 className="text-lg font-medium text-gray-900">Review Order</h1>
          </div>
        </div>

        <div className="max-w-lg mx-auto p-6">
          {/* Supplier */}
          <div className="mb-6">
            <p className="text-sm text-gray-500 mb-2">Supplier</p>
            <p className="font-medium text-gray-900">{selectedSupplier?.name || selectedSupplier?.supplier_name}</p>
          </div>

          {/* Items */}
          <div className="mb-6">
            <p className="text-sm text-gray-500 mb-3">Products</p>
            <div className="space-y-2">
              {items.map((item) => (
                <div key={item.id} className="flex justify-between py-2">
                  <div>
                    <div className="text-gray-900">{item.product.name || item.product.product_name}</div>
                    <div className="text-sm text-gray-500">{item.quantity} × ₹{item.rate}</div>
                  </div>
                  <div className="font-medium text-gray-900">₹{item.amount}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="pt-4 border-t border-gray-200 space-y-2">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span>₹{totalAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>GST (18%)</span>
              <span>₹{gst.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-lg font-medium text-gray-900 pt-2 border-t">
              <span>Total</span>
              <span>₹{grandTotal.toFixed(2)}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 space-y-3">
            <button
              onClick={createPurchaseOrder}
              disabled={isLoading}
              className={`w-full py-3 rounded-lg font-medium transition-colors flex items-center justify-center ${
                isLoading 
                  ? 'bg-gray-400 text-gray-600 cursor-not-allowed' 
                  : 'bg-gray-900 text-white hover:bg-gray-800'
              }`}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Order'
              )}
            </button>
            <button
              onClick={() => setStep('items')}
              className="w-full py-3 text-gray-600 hover:text-gray-900 transition-colors"
            >
              Back to items
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step 4: Done
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-lg mx-auto p-6 pt-24">
        <div className="text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-lg font-medium text-gray-900 mb-2">Order Created</h2>
          <p className="text-sm text-gray-500 mb-6">PO-2025-001</p>
          <button
            onClick={() => {
              setStep('supplier');
              setSelectedSupplier(null);
              setItems([]);
            }}
            className="px-6 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            Create Another
          </button>
        </div>
      </div>
    </div>
  );
};

export default PurchaseOrderMinimal;