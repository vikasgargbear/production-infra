import React, { useState } from 'react';
import { Search, Plus, Minus, X, ArrowRight, Check } from 'lucide-react';

interface PurchaseOrderMinimalProps {
  open?: boolean;
  onClose?: () => void;
}

interface Supplier {
  id: number;
  name: string;
  phone: string;
  gstin?: string;
}

interface Product {
  id: number;
  name: string;
  price: number;
  stock: number;
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

  // Mock data
  const mockSuppliers: Supplier[] = [
    { id: 1, name: 'Cipla Ltd', phone: '9876543210', gstin: '27AABCC1234B1Z5' },
    { id: 2, name: 'Sun Pharma', phone: '9876543211', gstin: '27AABCC1234B1Z6' },
    { id: 3, name: 'Dr. Reddy\'s', phone: '9876543212', gstin: '27AABCC1234B1Z7' },
  ];

  const mockProducts: Product[] = [
    { id: 1, name: 'Paracetamol 500mg', price: 8, stock: 100 },
    { id: 2, name: 'Amoxicillin 250mg', price: 20, stock: 50 },
    { id: 3, name: 'Vitamin C 100mg', price: 12, stock: 80 },
    { id: 4, name: 'Cetirizine 10mg', price: 15, stock: 60 },
  ];

  const filteredSuppliers = mockSuppliers.filter(s => 
    s.name.toLowerCase().includes(supplierSearch.toLowerCase())
  );

  const filteredProducts = mockProducts.filter(p => 
    p.name.toLowerCase().includes(productSearch.toLowerCase())
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
        rate: product.price,
        amount: product.price,
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

  const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
  const gst = totalAmount * 0.18;
  const grandTotal = totalAmount + gst;

  // Step 1: Select Supplier
  if (step === 'supplier') {
    return (
      <div className="min-h-screen bg-white">
        <div className="border-b border-gray-100">
          <div className="px-6 py-4 flex items-center justify-between">
            <h1 className="text-lg font-medium text-gray-900">Purchase Order</h1>
            {onClose && (
              <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            )}
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
            {filteredSuppliers.map((supplier) => (
              <button
                key={supplier.id}
                className="w-full p-4 text-left border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                onClick={() => {
                  setSelectedSupplier(supplier);
                  setStep('items');
                }}
              >
                <div className="font-medium text-gray-900">{supplier.name}</div>
                <div className="text-sm text-gray-500">{supplier.phone}</div>
              </button>
            ))}
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
            <p className="text-sm text-gray-500">{selectedSupplier?.name}</p>
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
                {filteredProducts.map((product) => (
                  <button
                    key={product.id}
                    className="w-full p-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                    onClick={() => addItem(product)}
                  >
                    <div className="font-medium text-gray-900">{product.name}</div>
                    <div className="flex justify-between text-sm text-gray-500">
                      <span>₹{product.price}</span>
                      <span>Stock: {product.stock}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Selected Items */}
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{item.product.name}</div>
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

          {/* Summary */}
          {items.length > 0 && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="flex justify-between text-lg font-medium text-gray-900">
                <span>Total</span>
                <span>₹{totalAmount.toFixed(2)}</span>
              </div>
              <button
                onClick={() => setStep('review')}
                className="w-full mt-4 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors flex items-center justify-center"
              >
                Continue
                <ArrowRight className="w-4 h-4 ml-2" />
              </button>
            </div>
          )}
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
            <p className="font-medium text-gray-900">{selectedSupplier?.name}</p>
          </div>

          {/* Items */}
          <div className="mb-6">
            <p className="text-sm text-gray-500 mb-3">Products</p>
            <div className="space-y-2">
              {items.map((item) => (
                <div key={item.id} className="flex justify-between py-2">
                  <div>
                    <div className="text-gray-900">{item.product.name}</div>
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
              onClick={() => setStep('done')}
              className="w-full py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
            >
              Create Order
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