import React, { useState, useEffect } from 'react';
import { 
  Search, X, Plus, Minus, ArrowRight, Check, 
  Calendar, User, Package, Receipt, ArrowLeft 
} from 'lucide-react';
// import { Customer, Product } from '../../types/models';

interface Customer {
  id?: string | number;
  customer_id?: string | number;
  name?: string;
  customer_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  [key: string]: any;
}

interface Product {
  id?: string | number;
  product_id?: string | number;
  name?: string;
  product_name?: string;
  price?: number;
  sale_price?: number;
  mrp?: number;
  [key: string]: any;
}

interface InvoiceFlowBalancedProps {
  open?: boolean;
  onClose?: () => void;
}

interface InvoiceItem {
  id: string;
  product: Product;
  quantity: number;
  rate: number;
  discount: number;
  tax: number;
  amount: number;
}

const InvoiceFlowBalanced: React.FC<InvoiceFlowBalancedProps> = ({ onClose }) => {
  const [step, setStep] = useState<'customer' | 'items' | 'review' | 'done'>('customer');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');

  // Mock data
  const mockCustomers: Customer[] = [
    { id: 1, name: 'Apollo Pharmacy', phone: '9876543210', gstin: '27AABCA1234B1Z5', address: 'Mumbai, Maharashtra' },
    { id: 2, name: 'MedPlus Healthcare', phone: '9876543211', gstin: '27AABCB1234B1Z6', address: 'Pune, Maharashtra' },
    { id: 3, name: 'Wellness Forever', phone: '9876543212', gstin: '27AABCC1234B1Z7', address: 'Nashik, Maharashtra' },
  ];

  const mockProducts: Product[] = [
    { id: 1, name: 'Paracetamol 500mg', price: 10, stock: 1000, hsn: '3004', unit: 'Strip' },
    { id: 2, name: 'Amoxicillin 250mg', price: 25, stock: 500, hsn: '3004', unit: 'Strip' },
    { id: 3, name: 'Vitamin C 100mg', price: 15, stock: 800, hsn: '3004', unit: 'Bottle' },
    { id: 4, name: 'Cetirizine 10mg', price: 18, stock: 600, hsn: '3004', unit: 'Strip' },
  ];

  const filteredCustomers = mockCustomers.filter(c => 
    c.name?.toLowerCase().includes(customerSearch.toLowerCase())
  );

  const filteredProducts = mockProducts.filter(p => 
    p.name?.toLowerCase().includes(productSearch.toLowerCase())
  );

  const addItem = (product: Product) => {
    const existingItem = items.find(item => item.product.id === product.id);
    if (existingItem) {
      setItems(items.map(item => 
        item.id === existingItem.id 
          ? { 
              ...item, 
              quantity: item.quantity + 1, 
              amount: calculateItemAmount(item.quantity + 1, item.rate, item.discount, item.tax)
            }
          : item
      ));
    } else {
      const newItem: InvoiceItem = {
        id: Date.now().toString(),
        product,
        quantity: 1,
        rate: product.price || 0,
        discount: 0,
        tax: 18,
        amount: calculateItemAmount(1, product.price || 0, 0, 18),
      };
      setItems([...items, newItem]);
    }
    setProductSearch('');
  };

  const calculateItemAmount = (qty: number, rate: number, discount: number, tax: number) => {
    const subtotal = qty * rate;
    const discountAmount = (subtotal * discount) / 100;
    const taxableAmount = subtotal - discountAmount;
    const taxAmount = (taxableAmount * tax) / 100;
    return taxableAmount + taxAmount;
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setItems(items.map(item => {
      if (item.id === itemId) {
        const newQty = Math.max(1, item.quantity + delta);
        return { 
          ...item, 
          quantity: newQty, 
          amount: calculateItemAmount(newQty, item.rate, item.discount, item.tax)
        };
      }
      return item;
    }));
  };

  const removeItem = (itemId: string) => {
    setItems(items.filter(item => item.id !== itemId));
  };

  const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.rate), 0);
  const totalDiscount = items.reduce((sum, item) => sum + ((item.quantity * item.rate * item.discount) / 100), 0);
  const taxableAmount = subtotal - totalDiscount;
  const totalTax = items.reduce((sum, item) => {
    const itemSubtotal = item.quantity * item.rate;
    const itemDiscount = (itemSubtotal * item.discount) / 100;
    const itemTaxable = itemSubtotal - itemDiscount;
    return sum + ((itemTaxable * item.tax) / 100);
  }, 0);
  const grandTotal = taxableAmount + totalTax;

  // Progress indicator
  const ProgressBar = () => {
    const steps = ['Customer', 'Items', 'Review'];
    const currentIndex = step === 'customer' ? 0 : step === 'items' ? 1 : 2;
    
    return (
      <div className="flex items-center justify-center mb-6">
        {steps.map((s, i) => (
          <React.Fragment key={s}>
            <div className={`flex items-center ${i < currentIndex ? 'text-blue-600' : i === currentIndex ? 'text-blue-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                i < currentIndex ? 'bg-blue-600 border-blue-600 text-white' : 
                i === currentIndex ? 'border-blue-600 text-blue-600' : 
                'border-gray-300'
              }`}>
                {i < currentIndex ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <span className="ml-2 text-sm font-medium hidden sm:inline">{s}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={`w-20 h-0.5 mx-2 ${i < currentIndex ? 'bg-blue-600' : 'bg-gray-300'}`} />
            )}
          </React.Fragment>
        ))}
      </div>
    );
  };

  // Step 1: Select Customer
  if (step === 'customer') {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200">
          <div className="px-6 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Create Invoice</h1>
              <p className="text-sm text-gray-500">Select customer and invoice details</p>
            </div>
            {onClose && (
              <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            )}
          </div>
        </div>

        <div className="max-w-4xl mx-auto p-6">
          <ProgressBar />
          
          <div className="grid md:grid-cols-2 gap-6">
            {/* Customer Selection */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center mb-4">
                <User className="w-5 h-5 text-gray-400 mr-2" />
                <h2 className="text-base font-semibold text-gray-900">Customer Details</h2>
              </div>
              
              <div className="relative mb-4">
                <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search customer..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {filteredCustomers.map((customer) => (
                  <button
                    key={customer.id}
                    className={`w-full p-3 text-left border rounded-lg transition-colors ${
                      selectedCustomer?.id === customer.id 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                    onClick={() => setSelectedCustomer(customer)}
                  >
                    <div className="font-medium text-gray-900">{customer.name}</div>
                    <div className="text-sm text-gray-500">{customer.phone}</div>
                    {customer.gstin && <div className="text-xs text-gray-400">GSTIN: {customer.gstin}</div>}
                  </button>
                ))}
              </div>
            </div>

            {/* Invoice Details */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center mb-4">
                <Calendar className="w-5 h-5 text-gray-400 mr-2" />
                <h2 className="text-base font-semibold text-gray-900">Invoice Details</h2>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Date</label>
                  <input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Number</label>
                  <input
                    type="text"
                    value="INV-2025-001"
                    disabled
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={() => setStep('items')}
              disabled={!selectedCustomer}
              className={`px-6 py-2 rounded-lg font-medium flex items-center ${
                selectedCustomer 
                  ? 'bg-blue-600 text-white hover:bg-blue-700' 
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              Continue
              <ArrowRight className="w-4 h-4 ml-2" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step 2: Add Items
  if (step === 'items') {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200">
          <div className="px-6 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Add Items</h1>
              <p className="text-sm text-gray-500">{selectedCustomer?.name}</p>
            </div>
            {onClose && (
              <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            )}
          </div>
        </div>

        <div className="max-w-6xl mx-auto p-6">
          <ProgressBar />

          {/* Product Search */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search products to add..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-medium text-gray-900">{product.name}</div>
                        <div className="text-sm text-gray-500">
                          HSN: {product.hsn} | {product.unit} | Stock: {product.stock}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium text-gray-900">₹{product.price}</div>
                        <div className="text-xs text-gray-500">+ 18% GST</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Items Table */}
          {items.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Qty</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Rate</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Disc %</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Tax %</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{item.product.name}</div>
                        <div className="text-sm text-gray-500">HSN: {item.product.hsn}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => updateQuantity(item.id, -1)}
                            className="p-1 hover:bg-gray-100 rounded"
                          >
                            <Minus className="w-4 h-4 text-gray-600" />
                          </button>
                          <span className="w-12 text-center font-medium">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.id, 1)}
                            className="p-1 hover:bg-gray-100 rounded"
                          >
                            <Plus className="w-4 h-4 text-gray-600" />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">₹{item.rate}</td>
                      <td className="px-4 py-3 text-right">{item.discount}%</td>
                      <td className="px-4 py-3 text-right">{item.tax}%</td>
                      <td className="px-4 py-3 text-right font-medium">₹{item.amount.toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => removeItem(item.id)}
                          className="p-1 hover:bg-gray-100 rounded"
                        >
                          <X className="w-4 h-4 text-gray-600" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {/* Summary */}
              <div className="bg-gray-50 px-4 py-3 border-t border-gray-200">
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-500">
                    {items.length} item{items.length > 1 ? 's' : ''}
                  </div>
                  <div className="text-right">
                    <span className="text-sm text-gray-500 mr-2">Total:</span>
                    <span className="text-lg font-semibold text-gray-900">₹{grandTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="mt-6 flex justify-between">
            <button
              onClick={() => setStep('customer')}
              className="px-6 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 flex items-center"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </button>
            <button
              onClick={() => setStep('review')}
              disabled={items.length === 0}
              className={`px-6 py-2 rounded-lg font-medium flex items-center ${
                items.length > 0 
                  ? 'bg-blue-600 text-white hover:bg-blue-700' 
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              Review Invoice
              <ArrowRight className="w-4 h-4 ml-2" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step 3: Review
  if (step === 'review') {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200">
          <div className="px-6 py-4">
            <h1 className="text-xl font-semibold text-gray-900">Review Invoice</h1>
            <p className="text-sm text-gray-500">Review and confirm invoice details</p>
          </div>
        </div>

        <div className="max-w-4xl mx-auto p-6">
          <ProgressBar />

          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            {/* Invoice Header */}
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Invoice #INV-2025-001</h2>
                  <p className="text-sm text-gray-500">Date: {new Date(invoiceDate).toLocaleDateString()}</p>
                  {dueDate && <p className="text-sm text-gray-500">Due: {new Date(dueDate).toLocaleDateString()}</p>}
                </div>
                <div className="text-right">
                  <p className="font-medium text-gray-900">{selectedCustomer?.name}</p>
                  <p className="text-sm text-gray-500">{selectedCustomer?.phone}</p>
                  {selectedCustomer?.gstin && <p className="text-sm text-gray-500">GSTIN: {selectedCustomer.gstin}</p>}
                </div>
              </div>
            </div>

            {/* Items */}
            <div className="px-6 py-4">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="pb-2 text-left text-sm font-medium text-gray-700">Item</th>
                    <th className="pb-2 text-center text-sm font-medium text-gray-700">Qty</th>
                    <th className="pb-2 text-right text-sm font-medium text-gray-700">Rate</th>
                    <th className="pb-2 text-right text-sm font-medium text-gray-700">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td className="py-3">
                        <div className="text-gray-900">{item.product.name}</div>
                        <div className="text-sm text-gray-500">HSN: {item.product.hsn}</div>
                      </td>
                      <td className="py-3 text-center">{item.quantity}</td>
                      <td className="py-3 text-right">₹{item.rate}</td>
                      <td className="py-3 text-right">₹{(item.quantity * item.rate).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="text-gray-900">₹{subtotal.toFixed(2)}</span>
                </div>
                {totalDiscount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Discount</span>
                    <span className="text-gray-900">-₹{totalDiscount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">GST (18%)</span>
                  <span className="text-gray-900">₹{totalTax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-base font-semibold pt-2 border-t">
                  <span className="text-gray-900">Total</span>
                  <span className="text-gray-900">₹{grandTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 flex justify-between">
            <button
              onClick={() => setStep('items')}
              className="px-6 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 flex items-center"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </button>
            <div className="flex gap-3">
              <button className="px-6 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50">
                Save Draft
              </button>
              <button
                onClick={() => setStep('done')}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
              >
                Create Invoice
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Step 4: Done
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto p-6 pt-24">
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Invoice Created Successfully</h2>
          <p className="text-gray-500 mb-6">Invoice #INV-2025-001 has been created</p>
          
          <div className="flex gap-3 justify-center">
            <button className="px-6 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50">
              View Invoice
            </button>
            <button className="px-6 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50">
              Print
            </button>
            <button
              onClick={() => {
                setStep('customer');
                setSelectedCustomer(null);
                setItems([]);
              }}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
            >
              Create Another
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoiceFlowBalanced;