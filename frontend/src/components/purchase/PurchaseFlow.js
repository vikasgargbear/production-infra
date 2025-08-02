import React, { useState, useEffect, useRef } from 'react';
import { 
  Package, User, Search, Calendar, X, Trash2, 
  ChevronRight, AlertCircle, CheckCircle, Printer, Share2, Plus,
  Save, ArrowLeft, ArrowRight, FileText, Truck, Hash, CreditCard
} from 'lucide-react';
import { purchasesApi, suppliersApi, productsApi } from '../../services/api';
import { searchCache } from '../../utils/searchCache';
import { ProductCreationModal, MonthYearPicker } from '../global';
import { ViewHistoryButton } from '../global';
import PurchaseItemsTableFlow from './components/PurchaseItemsTableFlow';
import PurchaseSummaryTop from './components/PurchaseSummaryTop';
import AddNewSupplierModal from '../modals/AddNewSupplierModal';

// Default org ID for development
const DEFAULT_ORG_ID = 'ad808530-1ddb-4377-ab20-67bef145d80d';

const PurchaseFlow = ({ onClose }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  // Refs for keyboard navigation
  const supplierSearchRef = useRef(null);
  const firstInputRef = useRef(null);

  // Generate purchase number
  const generatePurchaseNumber = () => {
    const timestamp = new Date().getTime();
    return `PUR-${timestamp}`;
  };

  // Purchase data state
  const [purchase, setPurchase] = useState({
    purchase_no: generatePurchaseNumber(),
    invoice_number: '',
    invoice_date: new Date().toISOString().split('T')[0],
    supplier_id: '',
    supplier_name: '',
    supplier_details: null,
    items: [],
    payment_mode: 'credit',
    payment_status: 'pending',
    delivery_date: new Date().toISOString().split('T')[0],
    transport_details: '',
    lr_number: '',
    gross_amount: 0,
    discount_amount: 0,
    tax_amount: 0,
    other_charges: 0,
    round_off: 0,
    net_amount: 0,
    notes: ''
  });

  const [selectedSupplier, setSelectedSupplier] = useState(null);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 's':
            e.preventDefault();
            if (currentStep === 2) {
              handleSavePurchase();
            } else {
              handleProceedToReview();
            }
            break;
          case 'p':
            e.preventDefault();
            if (currentStep === 2) {
              handlePrint();
            }
            break;
        }
      }
      
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentStep]);

  // Calculate totals whenever items change
  useEffect(() => {
    calculateTotals();
  }, [purchase.items, purchase.discount_amount, purchase.other_charges]);

  const calculateTotals = () => {
    let gross = 0;
    let tax = 0;

    purchase.items.forEach(item => {
      const quantity = parseFloat(item.quantity) || 0;
      const rate = parseFloat(item.purchase_price) || 0;
      const discountPercent = parseFloat(item.discount_percent) || 0;
      const taxPercent = parseFloat(item.tax_percent) || 12;
      
      const subtotal = quantity * rate;
      const discountAmount = (subtotal * discountPercent) / 100;
      const taxableAmount = subtotal - discountAmount;
      const taxAmount = (taxableAmount * taxPercent) / 100;
      
      gross += taxableAmount;
      tax += taxAmount;
    });

    const total = gross + tax - (purchase.discount_amount || 0) + (purchase.other_charges || 0);
    const roundOff = Math.round(total) - total;
    const net = total + roundOff;

    setPurchase(prev => ({
      ...prev,
      gross_amount: gross,
      tax_amount: tax,
      round_off: roundOff,
      net_amount: net
    }));
  };

  const handleSupplierSelect = (supplier) => {
    setSelectedSupplier(supplier);
    setPurchase(prev => ({
      ...prev,
      supplier_id: supplier.supplier_id,
      supplier_name: supplier.supplier_name,
      supplier_details: supplier
    }));
  };

  const handleAddItem = (product) => {
    const existingItem = purchase.items.find(item => item.product_id === product.product_id);
    
    if (existingItem) {
      handleUpdateItem(
        purchase.items.findIndex(item => item.product_id === product.product_id),
        'quantity',
        existingItem.quantity + 1
      );
    } else {
      const newItem = {
        item_id: Date.now(),
        product_id: product.product_id,
        product_name: product.product_name,
        hsn_code: product.hsn_code || '',
        batch_no: '',
        expiry_date: '',
        quantity: 1,
        free_quantity: 0,
        mrp: product.mrp || 0,
        purchase_price: (product.mrp || 0) * 0.7, // Default 30% discount
        selling_price: product.sale_price || product.mrp || 0,
        discount_percent: 0,
        tax_percent: product.gst_percent || 12,
        tax_amount: 0
      };
      
      setPurchase(prev => ({
        ...prev,
        items: [...prev.items, newItem]
      }));
    }
  };

  const handleUpdateItem = (index, field, value) => {
    setPurchase(prev => ({
      ...prev,
      items: prev.items.map((item, i) => {
        if (i === index) {
          return { ...item, [field]: value };
        }
        return item;
      })
    }));
  };

  const handleRemoveItem = (index) => {
    setPurchase(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const validatePurchase = () => {
    if (!selectedSupplier) {
      setMessage('Please select a supplier');
      setMessageType('error');
      return false;
    }

    if (!purchase.invoice_number) {
      setMessage('Please enter supplier invoice number');
      setMessageType('error');
      return false;
    }

    if (!purchase.items || purchase.items.length === 0) {
      setMessage('Please add at least one item');
      setMessageType('error');
      return false;
    }

    // Validate each item has batch and expiry
    for (let i = 0; i < purchase.items.length; i++) {
      const item = purchase.items[i];
      if (!item.batch_no) {
        setMessage(`Please enter batch number for ${item.product_name}`);
        setMessageType('error');
        return false;
      }
      if (!item.expiry_date) {
        setMessage(`Please enter expiry date for ${item.product_name}`);
        setMessageType('error');
        return false;
      }
    }

    return true;
  };

  const handleProceedToReview = () => {
    if (validatePurchase()) {
      setCurrentStep(2);
      setMessage('');
    }
  };

  const handleSavePurchase = async () => {
    if (!validatePurchase()) return;

    setSaving(true);
    try {
      const purchasePayload = {
        org_id: localStorage.getItem('orgId') || DEFAULT_ORG_ID,
        supplier_id: parseInt(purchase.supplier_id),
        invoice_number: purchase.invoice_number,
        invoice_date: purchase.invoice_date,
        payment_mode: purchase.payment_mode,
        payment_status: purchase.payment_status,
        items: purchase.items.map(item => ({
          product_id: parseInt(item.product_id),
          batch_number: item.batch_no,
          expiry_date: item.expiry_date,
          quantity: parseInt(item.quantity) || 0,
          free_quantity: parseInt(item.free_quantity) || 0,
          mrp: parseFloat(item.mrp) || 0,
          purchase_price: parseFloat(item.purchase_price) || 0,
          selling_price: parseFloat(item.selling_price) || 0,
          discount_percent: parseFloat(item.discount_percent) || 0,
          tax_percent: parseFloat(item.tax_percent) || 12,
          tax_amount: parseFloat(item.tax_amount) || 0
        })),
        gross_amount: purchase.gross_amount,
        discount_amount: purchase.discount_amount || 0,
        tax_amount: purchase.tax_amount,
        other_charges: purchase.other_charges || 0,
        round_off: purchase.round_off || 0,
        net_amount: purchase.net_amount,
        notes: purchase.notes || ''
      };

      console.log('Saving purchase with payload:', purchasePayload);

      const response = await purchasesApi.create(purchasePayload);
      
      console.log('Purchase created successfully:', response.data);
      
      setMessage('Purchase entry created successfully!');
      setMessageType('success');
      
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (error) {
      console.error('Error creating purchase:', error);
      let errorMessage = 'Failed to create purchase entry';
      
      if (error.response?.data?.detail) {
        if (typeof error.response.data.detail === 'string') {
          errorMessage = error.response.data.detail;
        } else if (Array.isArray(error.response.data.detail)) {
          errorMessage = error.response.data.detail
            .map(err => err.msg || err.message || JSON.stringify(err))
            .join(', ');
        }
      }
      
      setMessage(errorMessage);
      setMessageType('error');
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleWhatsAppShare = () => {
    if (!selectedSupplier?.phone) {
      setMessage('Supplier phone number not available');
      setMessageType('error');
      return;
    }

    let phoneNumber = selectedSupplier.phone.replace(/\s+/g, '');
    if (!phoneNumber.startsWith('+')) {
      phoneNumber = '+91' + phoneNumber;
    }

    const message = encodeURIComponent(
      `Dear ${selectedSupplier.supplier_name},\n\n` +
      `Purchase order for invoice ${purchase.invoice_number} dated ${new Date(purchase.invoice_date).toLocaleDateString('en-IN')} ` +
      `for amount ₹${purchase.net_amount.toFixed(2)} has been recorded.\n\n` +
      `Thank you for your supply!\n\n` +
      `Regards,\nAASO Pharma`
    );

    window.open(`https://wa.me/${phoneNumber}?text=${message}`, '_blank');
  };

  const clearMessage = () => setMessage('');

  // Step 1: Input Form
  if (currentStep === 1) {
    return (
      <div className="h-full bg-gray-50">
        <div className="h-full flex flex-col">
          
          {/* Header */}
          <div className="bg-white border-b border-gray-200">
            <div className="flex items-center justify-between px-6 py-4">
              <div className="flex items-start gap-3">
                <Package className="w-5 h-5 text-gray-600 mt-1" />
                <div>
                  <h1 className="text-xl font-semibold text-gray-900">Purchase Entry</h1>
                  <p className="text-sm text-gray-500 mt-1">Step 1: Enter purchase details</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <ViewHistoryButton type="purchase" />
                <button 
                  onClick={onClose} 
                  className="p-2 hover:bg-gray-100 rounded-lg"
                  title="Close (Esc)"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>
          </div>

          {/* Keyboard Shortcuts */}
          <div className="bg-blue-50 px-4 py-2 text-xs text-blue-700 border-b border-blue-200">
            Keyboard shortcuts: <strong>Ctrl+S</strong> - Proceed | <strong>Esc</strong> - Close
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            
            {/* Message Display */}
            {message && (
              <div className={`
                mb-4 p-3 rounded flex items-start text-sm
                ${messageType === 'success' ? 'bg-green-100 text-green-800' : 
                  messageType === 'error' ? 'bg-red-100 text-red-800' : 
                  'bg-blue-100 text-blue-800'
                }
              `}>
                {messageType === 'success' && <CheckCircle className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" />}
                {messageType === 'error' && <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" />}
                <div className="flex-1">{message}</div>
                <button onClick={clearMessage} className="ml-2 hover:opacity-70">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Purchase Header */}
            <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Supplier Invoice No *</label>
                  <input
                    type="text"
                    value={purchase.invoice_number}
                    onChange={(e) => setPurchase(prev => ({ ...prev, invoice_number: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="SUP-INV-001"
                    ref={firstInputRef}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Date *</label>
                  <input
                    type="date"
                    value={purchase.invoice_date}
                    onChange={(e) => setPurchase(prev => ({ ...prev, invoice_date: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Purchase No</label>
                  <input
                    type="text"
                    value={purchase.purchase_no}
                    readOnly
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
                  />
                </div>
              </div>
            </div>

            {/* Supplier Selection */}
            <SupplierSearchWrapper
              onSupplierSelect={handleSupplierSelect}
              onCreateSupplier={() => setShowSupplierModal(true)}
              ref={supplierSearchRef}
            />

            {/* Product Search */}
            <ProductSearchWrapper
              onAddItem={handleAddItem}
              onCreateProduct={() => setShowProductModal(true)}
            />

            {/* Items Table */}
            <PurchaseItemsTableFlow
              items={purchase.items}
              onUpdateItem={handleUpdateItem}
              onRemoveItem={handleRemoveItem}
            />

            {/* Notes */}
            <div className="bg-white rounded-lg shadow-sm p-4 mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
              <textarea
                value={purchase.notes}
                onChange={(e) => setPurchase(prev => ({ ...prev, notes: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
                rows={3}
                placeholder="Add any notes..."
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-between items-center p-4 border-t border-gray-200 bg-gray-50">
            <div className="flex items-center gap-4 text-sm">
              <span className="text-gray-600">Items: <strong>{purchase.items.length}</strong></span>
              <span className="text-gray-600">Total: <strong>₹{purchase.gross_amount.toFixed(2)}</strong></span>
              <span className="text-gray-600">Tax: <strong>₹{purchase.tax_amount.toFixed(2)}</strong></span>
              <span className="text-lg font-semibold text-blue-600">
                Net: ₹{purchase.net_amount.toFixed(2)}
              </span>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleProceedToReview}
                disabled={!selectedSupplier || purchase.items.length === 0}
                className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
                title="Proceed to Review (Ctrl+S)"
              >
                Proceed to Review
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Modals */}
        {showSupplierModal && (
          <AddNewSupplierModal
            open={showSupplierModal}
            onClose={() => setShowSupplierModal(false)}
            onSupplierCreated={(supplier) => {
              handleSupplierSelect(supplier);
              setShowSupplierModal(false);
              setMessage('Supplier created successfully', 'success');
              searchCache.clearCache('suppliers');
            }}
          />
        )}

        {showProductModal && (
          <ProductCreationModal
            open={showProductModal}
            onClose={() => setShowProductModal(false)}
            onProductCreated={(product) => {
              setShowProductModal(false);
              setMessage('Product created successfully', 'success');
              searchCache.clearCache('products');
            }}
          />
        )}
      </div>
    );
  }

  // Step 2: Review and Confirm
  return (
    <div className="h-full bg-gray-50">
      <div className="h-full flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-gray-600" />
            <h1 className="text-lg font-semibold text-gray-900">Purchase Entry - Step 2: Review & Confirm</h1>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCurrentStep(1)}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Edit
            </button>
            <button
              onClick={handlePrint}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-2"
              title="Print (Ctrl+P)"
            >
              <Printer className="w-4 h-4" />
              Print
            </button>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Purchase Summary Top */}
          <PurchaseSummaryTop
            purchase={purchase}
            onPurchaseUpdate={(updates) => setPurchase(prev => ({ ...prev, ...updates }))}
          />

          {message && (
            <div className={`
              mb-4 p-3 rounded flex items-start text-sm
              ${messageType === 'success' ? 'bg-green-100 text-green-800' : 
                messageType === 'error' ? 'bg-red-100 text-red-800' : 
                'bg-blue-100 text-blue-800'
              }
            `}>
              {messageType === 'success' && <CheckCircle className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" />}
              {messageType === 'error' && <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" />}
              <div className="flex-1">{message}</div>
              <button onClick={clearMessage} className="ml-2 hover:opacity-70">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Purchase Preview */}
          <div className="bg-white rounded-lg shadow-sm p-8">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold">PURCHASE ENTRY</h2>
              <p className="text-gray-600">Invoice No: {purchase.invoice_number}</p>
              <p className="text-gray-600">Date: {new Date(purchase.invoice_date).toLocaleDateString()}</p>
            </div>

            <div className="mb-8">
              <h3 className="font-semibold mb-2">Supplier:</h3>
              <p className="text-gray-700">{selectedSupplier?.supplier_name}</p>
              {selectedSupplier?.address && <p className="text-gray-600">{selectedSupplier.address}</p>}
              {selectedSupplier?.gst_number && <p className="text-gray-600">GST: {selectedSupplier.gst_number}</p>}
            </div>

            <table className="w-full mb-8">
              <thead>
                <tr className="border-b-2 border-gray-300">
                  <th className="text-left py-2">Item</th>
                  <th className="text-center py-2">Batch</th>
                  <th className="text-center py-2">Expiry</th>
                  <th className="text-center py-2">Qty</th>
                  <th className="text-center py-2">Free</th>
                  <th className="text-right py-2">Purchase Price</th>
                  <th className="text-right py-2">MRP</th>
                  <th className="text-right py-2">Tax</th>
                  <th className="text-right py-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {purchase.items.map((item, index) => (
                  <tr key={index} className="border-b border-gray-200">
                    <td className="py-2">{item.product_name}</td>
                    <td className="text-center py-2">{item.batch_no}</td>
                    <td className="text-center py-2">{item.expiry_date}</td>
                    <td className="text-center py-2">
                      {item.quantity}
                      {item.free_quantity > 0 && (
                        <span className="text-green-600 text-xs"> (+{item.free_quantity})</span>
                      )}
                    </td>
                    <td className="text-center py-2">{item.free_quantity || 0}</td>
                    <td className="text-right py-2">₹{item.purchase_price.toFixed(2)}</td>
                    <td className="text-right py-2">₹{item.mrp.toFixed(2)}</td>
                    <td className="text-right py-2">{item.tax_percent}%</td>
                    <td className="text-right py-2">
                      ₹{((item.quantity * item.purchase_price) * (1 + item.tax_percent/100)).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-semibold">
                  <td colSpan="8" className="text-right py-2">Total:</td>
                  <td className="text-right py-2">₹{purchase.net_amount.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>

            {/* WhatsApp Share */}
            <div className="mt-6 flex justify-center">
              <button
                onClick={handleWhatsAppShare}
                className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center gap-2"
              >
                <Share2 className="w-5 h-5" />
                Share on WhatsApp
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center p-4 border-t border-gray-200 bg-gray-50">
          <div className="text-lg font-semibold text-gray-900">
            Total Amount: ₹{purchase.net_amount.toFixed(2)}
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCurrentStep(1)}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors"
            >
              Back to Edit
            </button>
            <button
              onClick={handleSavePurchase}
              disabled={saving}
              className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
              title="Save Purchase (Ctrl+S)"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Purchase
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Supplier Search Wrapper Component
const SupplierSearchWrapper = React.forwardRef(({ onSupplierSelect, onCreateSupplier }, ref) => {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState(null);

  const searchSuppliers = async (query) => {
    if (query.length >= 2) {
      try {
        const response = await suppliersApi.search(query);
        setResults(response.data || []);
        setShowDropdown(true);
      } catch (error) {
        console.error('Error searching suppliers:', error);
        setResults([]);
      }
    } else {
      setResults([]);
      setShowDropdown(false);
    }
  };

  const handleSelect = (supplier) => {
    setSelectedSupplier(supplier);
    onSupplierSelect(supplier);
    setSearch('');
    setShowDropdown(false);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-700 flex items-center">
          <User className="w-4 h-4 mr-2" />
          Supplier Details
        </h3>
        <button
          onClick={onCreateSupplier}
          className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
          ref={ref}
        >
          <Plus className="w-4 h-4" />
          Add New Supplier
        </button>
      </div>

      {!selectedSupplier ? (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              searchSuppliers(e.target.value);
            }}
            onFocus={() => search.length >= 2 && setShowDropdown(true)}
            placeholder="Search supplier by name..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
          
          {showDropdown && results.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto">
              {results.map((supplier) => (
                <button
                  key={supplier.supplier_id}
                  onClick={() => handleSelect(supplier)}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                >
                  <div className="font-medium">{supplier.supplier_name}</div>
                  {supplier.phone && <div className="text-sm text-gray-500">{supplier.phone}</div>}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex justify-between items-start">
            <div>
              <p className="font-medium text-blue-900">{selectedSupplier.supplier_name}</p>
              {selectedSupplier.phone && <p className="text-sm text-blue-700">{selectedSupplier.phone}</p>}
              {selectedSupplier.gst_number && <p className="text-sm text-blue-700">GST: {selectedSupplier.gst_number}</p>}
            </div>
            <button
              onClick={() => {
                setSelectedSupplier(null);
                onSupplierSelect(null);
              }}
              className="text-blue-600 hover:text-blue-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

// Product Search Wrapper Component
const ProductSearchWrapper = ({ onAddItem, onCreateProduct }) => {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);

  const searchProducts = async (query) => {
    if (query.length >= 2) {
      try {
        const response = await productsApi.search(query);
        setResults(response.data || []);
        setShowDropdown(true);
      } catch (error) {
        console.error('Error searching products:', error);
        setResults([]);
      }
    } else {
      setResults([]);
      setShowDropdown(false);
    }
  };

  const handleSelect = (product) => {
    onAddItem(product);
    setSearch('');
    setShowDropdown(false);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-700 flex items-center">
          <Package className="w-4 h-4 mr-2" />
          Add Products
        </h3>
        <button
          onClick={onCreateProduct}
          className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
        >
          <Plus className="w-4 h-4" />
          Add New Product
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            searchProducts(e.target.value);
          }}
          onFocus={() => search.length >= 2 && setShowDropdown(true)}
          placeholder="Search products by name or code..."
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        />
        
        {showDropdown && results.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto">
            {results.map((product) => (
              <button
                key={product.product_id}
                onClick={() => handleSelect(product)}
                className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
              >
                <div className="flex justify-between">
                  <div>
                    <div className="font-medium">{product.product_name}</div>
                    <div className="text-sm text-gray-500">HSN: {product.hsn_code} | MRP: ₹{product.mrp}</div>
                  </div>
                  <div className="text-sm text-gray-500">
                    Stock: {product.current_stock || 0}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PurchaseFlow;