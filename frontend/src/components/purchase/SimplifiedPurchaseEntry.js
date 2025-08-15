import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, FileText } from 'lucide-react';
import { PurchaseProvider, usePurchase } from '../../contexts/PurchaseContext';
import PurchaseErrorBoundary from './PurchaseErrorBoundary';
import { purchasesApi } from '../../services/api';
import { PURCHASE_CONFIG } from '../../config/purchase.config';
import { validatePurchaseForm } from '../../utils/purchaseValidation';
import { ProductCreationModal, MonthYearPicker, SupplierCreationModal, ViewHistoryButton, GlobalLayout, ContentCard, ModuleHeader } from '../global';
import PDFUploadModal from '../PDFUploadModal';
import PurchaseSummary from './components/PurchaseSummary';
import { searchCache } from '../../utils/searchCache';
import { debounce } from '../../utils/debounce';
import documentNumberService from '../../services/documentNumberService';

// Inner component that uses the context
const SimplifiedPurchaseContent = ({ onClose }) => {
  const {
    purchase,
    saving,
    setSaving,
    setMessage,
    clearMessage,
    showPDFUpload,
    togglePDFUpload,
    setErrors,
    setPurchaseField,
    setSupplier,
    addItem,
    updateItem,
    removeItem,
    calculateTotals
  } = usePurchase();
  
  const [showReview, setShowReview] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierResults, setSupplierResults] = useState([]);
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [productSearches, setProductSearches] = useState({});
  const [productResults, setProductResults] = useState({});
  const [showProductDropdowns, setShowProductDropdowns] = useState({});
  
  // Generate purchase number on mount - like invoice module
  useEffect(() => {
    const generateAndSetPurchaseNumber = async () => {
      try {
        const purchaseNumber = await documentNumberService.generatePurchaseNumber();
        setPurchaseField('invoice_number', purchaseNumber);
      } catch (error) {
        console.warn('Failed to generate purchase number:', error);
        // Fallback to timestamp-based number
        const fallbackNumber = `PUR-${Date.now().toString().slice(-8)}`;
        setPurchaseField('invoice_number', fallbackNumber);
      }
    };
    
    // Only generate if no invoice number exists
    if (!purchase.invoice_number || purchase.invoice_number === '') {
      generateAndSetPurchaseNumber();
    }
  }, []);
  
  // Debounced supplier search
  const searchSuppliers = debounce((query) => {
    if (query.length >= 1) {
      const results = searchCache.searchLocal('suppliers', query, 10);
      setSupplierResults(results || []);
    } else {
      setSupplierResults([]);
    }
  }, 300);
  
  // Debounced product search
  const searchProducts = debounce((itemId, query) => {
    if (query.length >= 1) {
      const results = searchCache.searchLocal('products', query, 10);
      setProductResults(prev => ({ ...prev, [itemId]: results || [] }));
    } else {
      setProductResults(prev => ({ ...prev, [itemId]: [] }));
    }
  }, 300);
  
  const handleSupplierSelect = (supplier) => {
    setSupplier({
      supplier_id: supplier.supplier_id,
      supplier_name: supplier.supplier_name
    });
    setSupplierSearch('');
    setShowSupplierDropdown(false);
  };
  
  const handleProductSelect = (itemId, product) => {
    updateItem(itemId, 'product_id', product.product_id);
    updateItem(itemId, 'product_name', product.product_name);
    updateItem(itemId, 'hsn_code', product.hsn_code || '');
    updateItem(itemId, 'mrp', product.mrp || 0);
    updateItem(itemId, 'tax_percent', product.gst_percent || PURCHASE_CONFIG.DEFAULTS.TAX_RATE);
    updateItem(itemId, 'purchase_price', (product.mrp || 0) * 0.8);
    updateItem(itemId, 'selling_price', product.sale_price || product.mrp || 0);
    
    setProductSearches(prev => ({ ...prev, [itemId]: '' }));
    setShowProductDropdowns(prev => ({ ...prev, [itemId]: false }));
    
    // Calculate totals after a delay
    setTimeout(() => calculateTotals(), 100);
  };
  
  const handleAddItem = () => {
    addItem();
  };
  
  const handleSave = async () => {
    // Validate and save logic here
    setSaving(true);
    clearMessage();
    
    try {
      const validationResult = validatePurchaseForm({
        invoiceNumber: purchase.invoice_number,
        selectedSupplier: purchase.supplier_id,
        invoiceDate: purchase.invoice_date,
        items: purchase.items,
        paymentMode: purchase.payment_mode,
        subtotal: purchase.subtotal_amount
      });
      
      if (!validationResult.isValid) {
        setErrors(validationResult.errors);
        const firstError = Object.values(validationResult.errors)[0];
        throw new Error(Array.isArray(firstError) ? firstError[0] : firstError);
      }
      
      const purchaseData = {
        supplier_id: parseInt(purchase.supplier_id),
        invoice_number: purchase.invoice_number,
        invoice_date: purchase.invoice_date,
        items: purchase.items.map(item => ({
          product_id: parseInt(item.product_id),
          batch_number: item.batch_number,
          expiry_date: item.expiry_date,
          quantity: parseFloat(item.quantity),
          purchase_price: parseFloat(item.purchase_price),
          selling_price: parseFloat(item.selling_price),
          mrp: parseFloat(item.mrp),
          tax_percent: parseFloat(item.tax_percent),
          line_total: parseFloat(item.line_total)
        })),
        subtotal_amount: purchase.subtotal_amount,
        tax_amount: purchase.tax_amount,
        discount_amount: purchase.discount_amount,
        final_amount: purchase.final_amount,
        payment_mode: purchase.payment_mode,
        payment_status: purchase.payment_status,
        notes: purchase.notes || ''
      };
      
      await purchasesApi.create(purchaseData);
      setMessage(PURCHASE_CONFIG.MESSAGES.SUCCESS.PURCHASE_CREATED, 'success');
      onClose();
      
    } catch (error) {
      console.error('Error creating purchase:', error);
      const errorMessage = error.response?.data?.detail || error.message || PURCHASE_CONFIG.MESSAGES.ERROR.PURCHASE_CREATE_FAILED;
      setMessage(errorMessage, 'error');
    } finally {
      setSaving(false);
    }
  };
  
  const formatCurrency = (amount) => {
    return `₹${(amount || 0).toFixed(2)}`;
  };
  
  // Header actions for ModuleHeader - matching invoice pattern
  const headerActions = [
    {
      label: "Upload PDF",
      onClick: togglePDFUpload,
      variant: "default"
    },
    {
      label: "Review & Save",
      onClick: () => setShowReview(true),
      disabled: purchase.items.length === 0 || !purchase.supplier_id || !purchase.invoice_number,
      variant: "primary"
    }
  ];

  return (
    <div className="h-full bg-gray-50">
      <div className="h-full flex flex-col">
        
        {/* Header - Using Global ModuleHeader like invoice */}
        <ModuleHeader
          title="Purchase Entry"
          documentNumber={purchase.invoice_number || 'Generating...'}
          status="draft"
          icon={FileText}
          iconColor="text-green-600"
          onClose={onClose}
          historyType="purchase"
          additionalActions={headerActions}
        />

        {/* Keyboard Shortcuts Help */}
        <div className="bg-gray-50 px-4 py-2 text-xs text-gray-700 border-b border-gray-200">
          Keyboard shortcuts: <strong>Ctrl+S</strong> - Review & Save | <strong>Esc</strong> - Close
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-gray-50">
          <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Invoice Details */}
        <ContentCard title="Invoice Details" subtitle={null} actions={null}>
          <div className="grid grid-cols-4 gap-8">
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Invoice Number</label>
              <input
                type="text"
                value={purchase.invoice_number}
                onChange={(e) => setPurchaseField('invoice_number', e.target.value)}
                placeholder="INV-000000"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Invoice Date</label>
              <input
                type="date"
                value={purchase.invoice_date}
                onChange={(e) => setPurchaseField('invoice_date', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Payment Mode</label>
              <select
                value={purchase.payment_mode}
                onChange={(e) => setPurchaseField('payment_mode', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                {PURCHASE_CONFIG.PAYMENT_MODES.map(mode => (
                  <option key={mode.value} value={mode.value}>{mode.label}</option>
                ))}
              </select>
            </div>
          </div>
        </ContentCard>
            
        {/* Supplier Section */}
        <ContentCard title="Supplier" subtitle={null} actions={
          <button
            onClick={() => setShowAddSupplier(true)}
            className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            New
          </button>
        }>
          <div className="relative">
            {purchase.supplier_id ? (
              <div className="p-3 bg-gray-50 rounded-md border border-gray-200">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium">{purchase.supplier_name}</p>
                    <p className="text-sm text-gray-600">ID: {purchase.supplier_id}</p>
                  </div>
                  <button
                    onClick={() => {
                      setPurchaseField('supplier_id', '');
                      setPurchaseField('supplier_name', '');
                    }}
                    className="text-sm text-indigo-600 hover:text-indigo-700"
                  >
                    Change
                  </button>
                </div>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  value={supplierSearch}
                  onChange={(e) => {
                    setSupplierSearch(e.target.value);
                    searchSuppliers(e.target.value);
                    setShowSupplierDropdown(true);
                  }}
                  onFocus={() => setShowSupplierDropdown(true)}
                  placeholder="Search suppliers..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                />
                {showSupplierDropdown && supplierResults.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {supplierResults.map(supplier => (
                      <div
                        key={supplier.supplier_id}
                        onClick={() => handleSupplierSelect(supplier)}
                        className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b last:border-0"
                      >
                        <p className="font-medium">{supplier.supplier_name}</p>
                        <p className="text-sm text-gray-600">{supplier.phone} • {supplier.city}</p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </ContentCard>
            
        {/* Products Section */}
        <ContentCard title="Products" subtitle={null} actions={
          <button
            onClick={() => setShowAddProduct(true)}
            className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            Add New Product
          </button>
        }>
          {/* Product Search */}
          <div className="relative mb-4">
            <input
              type="text"
              placeholder="Search products..."
              className="w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
              onFocus={handleAddItem}
            />
          </div>
        </ContentCard>

        {/* Items Table */}
        {purchase.items.length > 0 && (
          <ContentCard title="Purchase Items" subtitle={null} actions={null}>
            <div className="border border-gray-200 rounded-md overflow-hidden">
              <table className="w-full min-w-[1200px]">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left py-3 px-6 text-xs font-medium text-gray-600 w-96">PRODUCT</th>
                    <th className="text-center py-3 px-4 text-xs font-medium text-gray-600">QTY</th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-gray-600">MRP</th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-gray-600">RATE</th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-gray-600">GST%</th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-gray-600">EXPIRY</th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-gray-600">TOTAL</th>
                    <th className="text-center py-3 px-4 text-xs font-medium text-gray-600"></th>
                  </tr>
                </thead>
                <tbody>
                  {purchase.items.map((item) => (
                    <tr key={item.id} className="border-b border-gray-100">
                      <td className="py-4 px-6">
                        {item.product_id ? (
                          <div>
                            <p className="font-medium text-sm">{item.product_name}</p>
                            <p className="text-xs text-gray-500">{item.batch_number}</p>
                          </div>
                        ) : (
                          <div className="relative">
                            <input
                              type="text"
                              value={productSearches[item.id] || ''}
                              onChange={(e) => {
                                setProductSearches(prev => ({ ...prev, [item.id]: e.target.value }));
                                searchProducts(item.id, e.target.value);
                                setShowProductDropdowns(prev => ({ ...prev, [item.id]: true }));
                              }}
                              onFocus={() => setShowProductDropdowns(prev => ({ ...prev, [item.id]: true }))}
                              placeholder="Search product..."
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 text-sm"
                            />
                            {showProductDropdowns[item.id] && productResults[item.id]?.length > 0 && (
                              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                                {productResults[item.id].map(product => (
                                  <div
                                    key={product.product_id}
                                    onClick={() => handleProductSelect(item.id, product)}
                                    className="px-3 py-2 hover:bg-gray-50 cursor-pointer border-b last:border-0"
                                  >
                                    <p className="text-sm font-medium">{product.product_name}</p>
                                    <p className="text-xs text-gray-600">MRP: ₹{product.mrp}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                          className="w-full text-center px-2 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 text-sm"
                          min="1"
                        />
                      </td>
                      <td className="py-4 px-4 text-right text-sm">
                        {formatCurrency(item.mrp)}
                      </td>
                      <td className="py-4 px-4">
                        <input
                          type="number"
                          value={item.purchase_price}
                          onChange={(e) => updateItem(item.id, 'purchase_price', parseFloat(e.target.value) || 0)}
                          className="w-full text-right px-2 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 text-sm"
                          min="0"
                          step="0.01"
                        />
                      </td>
                      <td className="py-4 px-4">
                        <select
                          value={item.tax_percent}
                          onChange={(e) => updateItem(item.id, 'tax_percent', parseFloat(e.target.value))}
                          className="w-full px-2 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 text-sm"
                        >
                          {PURCHASE_CONFIG.GST_RATES.map(rate => (
                            <option key={rate.value} value={rate.value}>{rate.value}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-4 px-4">
                        <div className="w-32">
                          <MonthYearPicker
                            value={item.expiry_date}
                            onChange={(date) => updateItem(item.id, 'expiry_date', date ? `${date}-01` : '')}
                            placeholder="MM/YYYY"
                            className="text-sm py-2"
                          />
                        </div>
                      </td>
                      <td className="py-4 px-4 text-right font-medium text-sm">
                        {formatCurrency(item.line_total)}
                      </td>
                      <td className="py-4 px-4 text-center">
                        <button
                          onClick={() => removeItem(item.id)}
                          className="p-1 text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ContentCard>
        )}
        
        {/* Footer with Total */}
        <ContentCard title={null} subtitle={null} actions={null} className="mt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">TOTAL AMOUNT</p>
              <p className="text-3xl font-bold text-gray-900">{formatCurrency(purchase.final_amount)}</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-6 py-2.5 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowReview(true)}
                disabled={purchase.items.length === 0 || !purchase.supplier_id || !purchase.invoice_number}
                className="px-8 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-lg font-medium"
              >
                Continue →
              </button>
            </div>
          </div>
        </ContentCard>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 bg-white px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              Total Items: {purchase.items.length}
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-6 py-2.5 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowReview(true)}
                disabled={purchase.items.length === 0 || !purchase.supplier_id || !purchase.invoice_number}
                className="px-8 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
              >
                Continue →
              </button>
            </div>
          </div>
        </div>

      </div>
        
      {/* Review Modal - Full Screen */}
      {showReview && (
        <div className="fixed inset-0 bg-white z-50 flex flex-col">
          {/* Review Header */}
          <div className="bg-white border-b px-8 py-4 flex-shrink-0">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Review Purchase Entry</h2>
              <button onClick={() => setShowReview(false)} className="p-2 hover:bg-gray-100 rounded-md transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
          </div>
          
          {/* Review Content */}
          <div className="flex-1 overflow-y-auto bg-gray-50 px-8 py-6">
            {/* Supplier Info */}
            <div className="bg-white rounded-md p-6 mb-6">
              <h3 className="text-lg font-semibold mb-4">Supplier Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Supplier Name</p>
                  <p className="font-medium">{purchase.supplier_name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Invoice Number</p>
                  <p className="font-medium">{purchase.invoice_number}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Invoice Date</p>
                  <p className="font-medium">{new Date(purchase.invoice_date).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Payment Mode</p>
                  <p className="font-medium capitalize">{purchase.payment_mode}</p>
                </div>
              </div>
            </div>
            
            {/* Items Review */}
            <div className="bg-white rounded-md p-6 mb-6">
              <h3 className="text-lg font-semibold mb-4">Purchase Items ({purchase.items.length})</h3>
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left py-2 px-4 text-sm">Product</th>
                    <th className="text-center py-2 px-4 text-sm">Qty</th>
                    <th className="text-right py-2 px-4 text-sm">Rate</th>
                    <th className="text-right py-2 px-4 text-sm">GST</th>
                    <th className="text-right py-2 px-4 text-sm">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {purchase.items.map(item => (
                    <tr key={item.id} className="border-t">
                      <td className="py-3 px-4">
                        <p className="font-medium">{item.product_name}</p>
                        <p className="text-sm text-gray-600">Batch: {item.batch_number}</p>
                      </td>
                      <td className="py-3 px-4 text-center">{item.quantity}</td>
                      <td className="py-3 px-4 text-right">₹{item.purchase_price}</td>
                      <td className="py-3 px-4 text-right">{item.tax_percent}%</td>
                      <td className="py-3 px-4 text-right font-medium">₹{item.line_total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Summary */}
            <PurchaseSummary />
            
            {/* Notes */}
            <div className="bg-white rounded-md p-6">
              <h3 className="text-lg font-semibold mb-4">Notes</h3>
              <textarea
                value={purchase.notes}
                onChange={(e) => setPurchaseField('notes', e.target.value)}
                placeholder="Add any notes about this purchase..."
                rows={4}
                className="w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          
          {/* Review Footer */}
          <div className="bg-white border-t px-8 py-4 flex-shrink-0">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setShowReview(false)}
                className="px-6 py-3 text-gray-600 hover:bg-gray-100 rounded-md text-lg"
              >
                ← Back to Edit
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-8 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 text-lg font-medium"
              >
                {saving ? 'Saving...' : 'Confirm & Save'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* PDF Upload Modal */}
      {showPDFUpload && (
        <PDFUploadModal
          isOpen={showPDFUpload}
          onClose={togglePDFUpload}
          onDataExtracted={(extractedData) => {
            // Map extracted data to purchase
            if (extractedData.supplier_id) {
              setSupplier({
                supplier_id: extractedData.supplier_id,
                supplier_name: extractedData.supplier_name || ''
              });
            }
            setPurchaseField('invoice_number', extractedData.invoice_number || '');
            setPurchaseField('invoice_date', extractedData.invoice_date || new Date().toISOString().split('T')[0]);
            
            // Clear existing items and add new ones
            purchase.items.forEach(item => removeItem(item.id));
            
            if (extractedData.items && extractedData.items.length > 0) {
              extractedData.items.forEach(item => {
                addItem({
                  product_name: item.product_name || '',
                  hsn_code: item.hsn_code || '',
                  batch_number: item.batch_number || '',
                  expiry_date: item.expiry_date || '',
                  quantity: item.quantity || 1,
                  purchase_price: item.purchase_price || item.cost_price || 0,
                  mrp: item.mrp || 0,
                  tax_percent: item.tax_percent || 18,
                  selling_price: item.selling_price || item.mrp || 0
                });
              });
            }
            
            setPurchaseField('discount_amount', extractedData.discount_amount || 0);
            calculateTotals();
            togglePDFUpload();
          }}
        />
      )}
      
      {/* Add New Product Modal */}
      {showAddProduct && (
        <ProductCreationModal
          show={showAddProduct}
          onClose={() => setShowAddProduct(false)}
          onProductCreated={(newProduct) => {
            // Refresh product cache
            searchCache.clearType('products');
            setShowAddProduct(false);
          }}
        />
      )}
      
      {/* Add New Supplier Modal */}
      {showAddSupplier && (
        <SupplierCreationModal
          isOpen={showAddSupplier}
          onClose={() => setShowAddSupplier(false)}
          onSupplierCreated={(newSupplier) => {
            // Refresh supplier cache and select the new supplier
            searchCache.clearType('suppliers');
            handleSupplierSelect(newSupplier);
            setShowAddSupplier(false);
          }}
        />
      )}
    </div>
  );
};

// Main component with providers
const SimplifiedPurchaseEntry = ({ open, onClose }) => {
  if (!open) return null;
  
  return (
    <PurchaseProvider>
      <PurchaseErrorBoundary onClose={onClose}>
        <SimplifiedPurchaseContent onClose={onClose} />
      </PurchaseErrorBoundary>
    </PurchaseProvider>
  );
};

export default SimplifiedPurchaseEntry;