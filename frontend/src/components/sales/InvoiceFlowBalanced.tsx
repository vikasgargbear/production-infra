import React, { useState, useEffect } from 'react';
import { 
  Search, X, Plus, Minus, ArrowRight, Check, 
  Calendar, User, Package, Receipt, ArrowLeft,
  Loader2, AlertCircle, RefreshCw
} from 'lucide-react';
import { customersApi } from '../../services/api/modules/customers.api';
import { productsApi } from '../../services/api/modules/products.api';
import { invoicesApi } from '../../services/api/modules/invoices.api';
import offlineStorage from '../../services/offlineStorage';

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
  
  // API data states
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Load data on component mount
  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Load customers and products concurrently
      const [customersResponse, productsResponse] = await Promise.all([
        customersApi.getAll(),
        productsApi.getAll()
      ]);

      if (customersResponse.data) {
        setCustomers(customersResponse.data);
      }

      if (productsResponse.data) {
        setProducts(productsResponse.data);
      }
    } catch (err) {
      console.error('Error loading data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
      
      // Try to load from offline storage instead of using mock data
      try {
        const [offlineCustomers, offlineProducts] = await Promise.all([
          offlineStorage.getOffline('customers', { persistent: true }),
          offlineStorage.getOffline('products', { persistent: true })
        ]);
        
        if (offlineCustomers && offlineCustomers.data) {
          setCustomers(offlineCustomers.data);
        }
        if (offlineProducts && offlineProducts.data) {
          setProducts(offlineProducts.data);
        }
      } catch (offlineError) {
        console.error('Error loading from offline storage:', offlineError);
        // No offline data available - show proper error instead of mock data
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

  const filteredCustomers = customers.filter(c => 
    c.name?.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.customer_name?.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.phone?.includes(customerSearch)
  );

  const filteredProducts = products.filter(p => 
    p.name?.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.product_name?.toLowerCase().includes(productSearch.toLowerCase())
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
        rate: product.price || product.sale_price || product.mrp || 0,
        discount: 0,
        tax: 18,
        amount: calculateItemAmount(1, product.price || product.sale_price || product.mrp || 0, 0, 18),
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

  const createInvoice = async () => {
    try {
      setIsLoading(true);
      
      if (!selectedCustomer) {
        throw new Error('No customer selected');
      }

      const invoiceData = {
        customer_id: selectedCustomer.id || selectedCustomer.customer_id,
        invoice_date: invoiceDate,
        due_date: dueDate || invoiceDate,
        items: items.map(item => ({
          product_id: item.product.id || item.product.product_id,
          quantity: item.quantity,
          rate: item.rate,
          discount_percent: item.discount,
          tax_percent: item.tax
        })),
        payment_terms: '30 days',
        notes: 'Invoice created via balanced flow'
      };

      const response = await invoicesApi.create(invoiceData);
      
      if (response.data) {
        setStep('done');
      }
    } catch (err) {
      console.error('Failed to create invoice:', err);
      alert(`Failed to create invoice: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
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

  // Loading state
  if (isLoading && customers.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Loading invoice data...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && customers.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
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
                {filteredCustomers.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <p>No customers found</p>
                    <p className="text-sm">Try adjusting your search</p>
                  </div>
                ) : (
                  filteredCustomers.map((customer) => (
                    <button
                      key={customer.id || customer.customer_id}
                      className={`w-full p-3 text-left border rounded-lg transition-colors ${
                        selectedCustomer?.id === customer.id 
                          ? 'border-blue-500 bg-blue-50' 
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                      onClick={() => setSelectedCustomer(customer)}
                    >
                      <div className="font-medium text-gray-900">{customer.name || customer.customer_name}</div>
                      <div className="text-sm text-gray-500">{customer.phone}</div>
                      {customer.gstin && <div className="text-xs text-gray-400">GSTIN: {customer.gstin}</div>}
                    </button>
                  ))
                )}
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
              <p className="text-sm text-gray-500">{selectedCustomer?.name || selectedCustomer?.customer_name}</p>
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
            {/* Product Search */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center mb-4">
                <Package className="w-5 h-5 text-gray-400 mr-2" />
                <h2 className="text-base font-semibold text-gray-900">Add Products</h2>
              </div>
              
              <div className="relative mb-4">
                <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search products..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  autoFocus
                />
              </div>
              
              {productSearch && (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {filteredProducts.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <p>No products found</p>
                      <p className="text-sm">Try adjusting your search</p>
                    </div>
                  ) : (
                    filteredProducts.map((product) => (
                      <button
                        key={product.id || product.product_id}
                        className="w-full p-3 text-left border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                        onClick={() => addItem(product)}
                      >
                        <div className="font-medium text-gray-900">{product.name || product.product_name}</div>
                        <div className="text-sm text-gray-500">₹{product.price || product.sale_price || product.mrp}</div>
                        {product.hsn && <div className="text-xs text-gray-400">HSN: {product.hsn}</div>}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Selected Items */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center mb-4">
                <Receipt className="w-5 h-5 text-gray-400 mr-2" />
                <h2 className="text-base font-semibold text-gray-900">Selected Items</h2>
              </div>
              
              <div className="space-y-3">
                {items.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <p>No items added yet</p>
                    <p className="text-sm">Search and add products from the left panel</p>
                  </div>
                ) : (
                  items.map((item) => (
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
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Summary */}
          {items.length > 0 && (
            <div className="mt-6 bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Invoice Summary</h3>
              <div className="grid md:grid-cols-4 gap-4 text-center">
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-blue-600">{items.length}</div>
                  <div className="text-sm text-blue-600">Items</div>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-green-600">₹{subtotal.toFixed(2)}</div>
                  <div className="text-sm text-green-600">Subtotal</div>
                </div>
                <div className="bg-yellow-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-yellow-600">₹{totalTax.toFixed(2)}</div>
                  <div className="text-sm text-yellow-600">Tax</div>
                </div>
                <div className="bg-purple-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-purple-600">₹{grandTotal.toFixed(2)}</div>
                  <div className="text-sm text-purple-600">Total</div>
                </div>
              </div>
            </div>
          )}

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
              Continue
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
            <p className="text-sm text-gray-500">{selectedCustomer?.name || selectedCustomer?.customer_name}</p>
          </div>
        </div>

        <div className="max-w-4xl mx-auto p-6">
          <ProgressBar />
          
          <div className="bg-white rounded-lg border border-gray-200">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Customer Details</h3>
                  <p className="text-gray-600">{selectedCustomer?.name || selectedCustomer?.customer_name}</p>
                  <p className="text-gray-600">{selectedCustomer?.phone}</p>
                  {selectedCustomer?.gstin && <p className="text-gray-600">GSTIN: {selectedCustomer.gstin}</p>}
                </div>
                <div className="text-right">
                  <h3 className="text-lg font-semibold text-gray-900">Invoice Details</h3>
                  <p className="text-gray-600">Date: {invoiceDate}</p>
                  {dueDate && <p className="text-gray-600">Due: {dueDate}</p>}
                  <p className="text-gray-600">#INV-2025-001</p>
                </div>
              </div>
            </div>

            {/* Items Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Qty</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Rate</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-6 py-3">
                        <div className="text-gray-900">{item.product.name || item.product.product_name}</div>
                        {item.product.hsn && <div className="text-sm text-gray-500">HSN: {item.product.hsn}</div>}
                      </td>
                      <td className="px-6 py-3 text-center">{item.quantity}</td>
                      <td className="px-6 py-3 text-right">₹{item.rate}</td>
                      <td className="px-6 py-3 text-right">₹{(item.quantity * item.rate).toFixed(2)}</td>
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
                onClick={createInvoice}
                disabled={isLoading}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Invoice'
                )}
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