import React, { useState } from 'react';
import { X, Save, Upload, Calculator, History, CheckCircle, AlertCircle, FileInput, ArrowLeft, Printer } from 'lucide-react';
import { usePurchase } from '../../contexts/PurchaseContext';
import PurchaseErrorBoundary from './PurchaseErrorBoundary';
import SupplierSelector from './components/SupplierSelector';
import PurchaseHeader from './components/PurchaseHeader';
import PurchaseItemsTable from './components/PurchaseItemsTable';
import PurchaseSummary from './components/PurchaseSummary';
import PharmaItemsTable from '../global/PharmaItemsTable';
import GSTCalculator from '../global/calculators/GSTCalculator';
import { 
  ViewHistoryButton, 
  ItemsTable, 
  SupplierSearch, 
  SupplierCreationModal,
  Button
} from '../global';
import PDFUploadModal from '../PDFUploadModal';
import { purchasesApi } from '../../services/api';
import { PURCHASE_CONFIG } from '../../config/purchase.config';
import { validatePurchaseForm } from '../../utils/purchaseValidation';
import PurchaseSummaryTop from './components/PurchaseSummaryTop';

// Inner component that uses the context
const PurchaseEntryContent = ({ onClose, initialShowPDFUpload = false }) => {
  const {
    purchase,
    saving,
    setSaving,
    message,
    messageType,
    setMessage,
    clearMessage,
    currentStep,
    setCurrentStep,
    showPDFUpload,
    togglePDFUpload,
    showGSTCalculator,
    toggleGSTCalculator,
    setErrors,
    resetPurchase,
    setPurchaseData,
    setPurchaseField,
    calculateTotals
  } = usePurchase();
  
  // Open PDF upload modal if requested
  React.useEffect(() => {
    if (initialShowPDFUpload && !showPDFUpload) {
      togglePDFUpload();
    }
  }, [initialShowPDFUpload]);
  
  // Keyboard shortcuts
  React.useEffect(() => {
    const handleKeyPress = (e) => {
      // Ctrl+U for PDF upload
      if (e.ctrlKey && e.key === 'u') {
        e.preventDefault();
        togglePDFUpload();
      }
      // Ctrl+G for GST Calculator
      if (e.ctrlKey && e.key === 'g') {
        e.preventDefault();
        toggleGSTCalculator();
      }
      // Ctrl+S to save
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        if (currentStep === 1) {
          handleSavePurchase();
        }
      }
      // Ctrl+E to edit (go back to step 0)
      if (e.ctrlKey && e.key === 'e' && currentStep === 1) {
        e.preventDefault();
        setCurrentStep(0);
      }
      // Esc to close
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentStep]);
  
  const handleSavePurchase = async () => {
    setSaving(true);
    clearMessage();
    
    try {
      // Calculate totals before validation
      calculateTotals();
      
      // Wait a moment for state to update
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Validate form
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
      
      // Prepare purchase data - let the API transformer handle it
      const purchaseData = {
        supplier_id: parseInt(purchase.supplier_id),
        invoice_number: purchase.invoice_number,
        invoice_date: purchase.invoice_date,
        items: purchase.items.map(item => ({
          product_id: parseInt(item.product_id),
          product_name: item.product_name,
          batch_number: item.batch_number || '',
          expiry_date: item.expiry_date || '',
          quantity: parseFloat(item.quantity) || 0,
          free_quantity: parseFloat(item.free_quantity) || 0,
          purchase_price: parseFloat(item.purchase_price) || 0,
          selling_price: parseFloat(item.selling_price || item.mrp) || 0,
          mrp: parseFloat(item.mrp) || 0,
          tax_percent: parseFloat(item.tax_percent) || 0,
          discount_percent: parseFloat(item.discount_percent) || 0,
          pack_size: item.pack_size || '',
          hsn_code: item.hsn_code || ''
        })),
        subtotal_amount: parseFloat(purchase.subtotal_amount) || 0,
        tax_amount: parseFloat(purchase.tax_amount) || 0,
        discount_amount: parseFloat(purchase.discount_amount) || 0,
        other_charges: parseFloat(purchase.delivery_charges) || 0,
        final_amount: parseFloat(purchase.final_amount) || 0,
        payment_mode: purchase.payment_mode || 'cash',
        payment_status: purchase.payment_status || 'pending',
        notes: purchase.notes || ''
      };
      
      // Create purchase
      const response = await purchasesApi.create(purchaseData);
      console.log('Purchase created:', response.data);
      
      // Success
      setMessage(PURCHASE_CONFIG.MESSAGES.SUCCESS.PURCHASE_CREATED, 'success');
      setCurrentStep(2);
      
    } catch (error) {
      console.error('Error creating purchase:', error);
      const errorMessage = error.response?.data?.detail || error.message || PURCHASE_CONFIG.MESSAGES.ERROR.PURCHASE_CREATE_FAILED;
      setMessage(errorMessage, 'error');
    } finally {
      setSaving(false);
    }
  };
  
  
  const handlePDFData = async (extractedData) => {
    try {
      setMessage('Processing PDF data...', 'info');
      
      // Map PDF data to purchase format
      setPurchaseData({
        supplier_id: extractedData.supplier_id || '',
        supplier_name: extractedData.supplier_name || '',
        invoice_number: extractedData.invoice_number || '',
        invoice_date: extractedData.invoice_date || new Date().toISOString().split('T')[0],
        items: extractedData.items || [],
        discount_amount: extractedData.discount_amount || 0
      });
      
      // Calculate totals
      setTimeout(() => calculateTotals(), 100);
      
      setMessage(PURCHASE_CONFIG.MESSAGES.SUCCESS.PDF_PARSED, 'success');
      togglePDFUpload();
      
    } catch (error) {
      console.error('Error processing PDF:', error);
      setMessage(PURCHASE_CONFIG.MESSAGES.ERROR.PDF_PARSE_FAILED, 'error');
    }
  };
  
  // Review Step
  if (currentStep === 1.5) {
    return (
      <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-white border-b border-gray-200">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <h1 className="text-xl font-semibold text-gray-900">{purchase.invoice_number || 'New Purchase'}</h1>
                <span className="px-3 py-1 bg-orange-100 text-orange-800 text-sm font-medium rounded">REVIEW</span>
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setCurrentStep(1)}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors flex items-center"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Edit
                </button>
                <button
                  onClick={handleSavePurchase}
                  disabled={saving}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center"
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Save Purchase
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
        
        {/* Keyboard Shortcuts Help */}
        <div className="bg-indigo-50 px-4 py-2 text-xs text-indigo-700 border-b border-indigo-200">
          Keyboard shortcuts: <strong>Ctrl+S</strong> - Save Purchase | <strong>Ctrl+E</strong> - Back to Edit | <strong>Esc</strong> - Close
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-6 py-6">
            {/* Purchase Summary Top */}
            <PurchaseSummaryTop purchase={purchase} />
            
            {/* Delivery Details */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">DELIVERY DETAILS</h3>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-sm text-gray-600 mb-1 block">Payment Status</label>
                  <select
                    value={purchase.payment_status || 'pending'}
                    onChange={(e) => setPurchaseField('payment_status', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                    <option value="partial">Partial</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-gray-600 mb-1 block">Delivery Charges</label>
                  <input
                    type="number"
                    value={purchase.delivery_charges || 0}
                    onChange={(e) => {
                      setPurchaseField('delivery_charges', parseFloat(e.target.value) || 0);
                      calculateTotals();
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="0"
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>
            </div>
            
            {/* Supplier Info */}
            <div className="grid grid-cols-2 gap-6 mb-6">
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">SUPPLIER DETAILS</h3>
                <div className="space-y-3">
                  <div>
                    <h4 className="font-medium text-gray-900">{purchase.supplier_name}</h4>
                    <p className="text-sm text-gray-600 mt-1">ID: {purchase.supplier_id}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Invoice: {purchase.invoice_number}</p>
                    <p className="text-sm text-gray-600">Date: {new Date(purchase.invoice_date).toLocaleDateString()}</p>
                    {purchase.payment_mode === 'credit' && (
                      <p className="text-sm text-gray-600">
                        Due Date: {new Date(new Date(purchase.invoice_date).setDate(new Date(purchase.invoice_date).getDate() + 30)).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">PURCHASE INFO</h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-gray-600">Total Items: {purchase.items.length}</p>
                    <p className="text-sm text-gray-600">Total Quantity: {purchase.items.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Purchase Date: {new Date().toLocaleDateString()}</p>
                    <p className="text-sm text-gray-600">Payment Mode: {PURCHASE_CONFIG.PAYMENT_MODES.find(m => m.value === purchase.payment_mode)?.label || 'Cash'}</p>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Items Summary */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Items Summary ({purchase.items.length} items)</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr className="border-b border-gray-200">
                      <th className="text-left px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                      <th className="text-left px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">HSN</th>
                      <th className="text-left px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Pack</th>
                      <th className="text-left px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Batch</th>
                      <th className="text-left px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Expiry</th>
                      <th className="text-center px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Qty</th>
                      <th className="text-center px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Free</th>
                      <th className="text-right px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">MRP</th>
                      <th className="text-right px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Cost</th>
                      <th className="text-center px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Disc%</th>
                      <th className="text-center px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">GST%</th>
                      <th className="text-right px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {purchase.items.map((item) => {
                      const quantity = parseFloat(item.quantity) || 0;
                      const rate = parseFloat(item.purchase_price) || 0;
                      const discountPercent = parseFloat(item.discount_percent) || 0;
                      const subtotal = quantity * rate;
                      const discountAmount = (subtotal * discountPercent) / 100;
                      const taxableAmount = subtotal - discountAmount;
                      const taxAmount = (taxableAmount * (parseFloat(item.tax_percent) || 0)) / 100;
                      const lineTotal = taxableAmount + taxAmount;
                      
                      return (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="px-3 py-3 text-sm text-gray-900">
                            <div className="font-medium">{item.product_name}</div>
                          </td>
                          <td className="px-3 py-3 text-sm text-gray-600">{item.hsn_code || '-'}</td>
                          <td className="px-3 py-3 text-sm text-gray-600">{item.pack_size || '-'}</td>
                          <td className="px-3 py-3 text-sm text-gray-600">{item.batch_number || '-'}</td>
                          <td className="px-3 py-3 text-sm text-gray-600">
                            {item.expiry_date ? new Date(item.expiry_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '-'}
                          </td>
                          <td className="px-3 py-3 text-center text-sm text-gray-900 font-medium">{quantity}</td>
                          <td className="px-3 py-3 text-center text-sm text-gray-600">{item.free_quantity || 0}</td>
                          <td className="px-3 py-3 text-right text-sm text-gray-600">₹{(parseFloat(item.mrp) || 0).toFixed(2)}</td>
                          <td className="px-3 py-3 text-right text-sm text-gray-900 font-medium">₹{rate.toFixed(2)}</td>
                          <td className="px-3 py-3 text-center text-sm text-gray-600">{discountPercent}%</td>
                          <td className="px-3 py-3 text-center text-sm text-gray-600">{item.tax_percent || 0}%</td>
                          <td className="px-3 py-3 text-right text-sm font-medium text-gray-900">₹{lineTotal.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            
            
            {/* Financial Summary with compact layout */}
            <div className="grid grid-cols-3 gap-6 mb-6">
              <div className="col-span-2">
                {/* Notes */}
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">NOTES</h3>
                  <textarea
                    value={purchase.notes}
                    onChange={(e) => setPurchaseField('notes', e.target.value)}
                    placeholder="Add any additional notes or comments..."
                    rows={4}
                    className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                  />
                </div>
              </div>
              
              <div className="col-span-1">
                {/* Compact Financial Summary */}
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <table className="w-full text-sm">
                    <tbody>
                      <tr className="border-b border-gray-100">
                        <td className="py-2 text-gray-600">Subtotal</td>
                        <td className="py-2 text-right font-medium">₹{(purchase.subtotal_amount || 0).toFixed(2)}</td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <td className="py-2 text-gray-600">Tax</td>
                        <td className="py-2 text-right">₹{(purchase.tax_amount || 0).toFixed(2)}</td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <td className="py-2 text-gray-600">Discount</td>
                        <td className="py-2 text-right">
                          <input
                            type="number"
                            value={purchase.discount_amount || 0}
                            onChange={(e) => {
                              setPurchaseField('discount_amount', parseFloat(e.target.value) || 0);
                              const final = purchase.subtotal_amount + purchase.tax_amount - (parseFloat(e.target.value) || 0) + (purchase.delivery_charges || 0);
                              setPurchaseField('final_amount', final);
                            }}
                            className="w-20 text-right px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            min="0"
                            step="0.01"
                          />
                        </td>
                      </tr>
                      <tr className="border-b border-gray-100">
                        <td className="py-2 text-gray-600">Delivery</td>
                        <td className="py-2 text-right">₹{(purchase.delivery_charges || 0).toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td className="pt-3 pb-1 font-medium text-gray-900">Net Amount</td>
                        <td className="pt-3 pb-1 text-right text-lg font-bold text-indigo-600">
                          ₹{((purchase.subtotal_amount || 0) + (purchase.tax_amount || 0) - (purchase.discount_amount || 0) + (purchase.delivery_charges || 0)).toFixed(2)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Bottom Bar */}
        <div className="bg-white border-t border-gray-200">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <span className="text-sm text-gray-600">Total Amount:</span>
                <span className="text-2xl font-bold text-gray-900">
                  ₹{((purchase.subtotal_amount || 0) + (purchase.tax_amount || 0) - (purchase.discount_amount || 0) + (purchase.delivery_charges || 0)).toFixed(2)}
                </span>
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setCurrentStep(1)}
                  className="px-6 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
                >
                  Back to Edit
                </button>
                <button
                  onClick={handleSavePurchase}
                  disabled={saving}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center"
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Save Purchase
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  if (currentStep === 2) {
    // Success Step
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Purchase Created!</h2>
          <p className="text-gray-600 mb-6">
            Your purchase entry has been saved successfully.
          </p>
          
          <div className="space-y-3">
            <button
              onClick={resetPurchase}
              className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
            >
              Create Another Purchase
            </button>
            <button
              onClick={onClose}
              className="w-full px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="fixed inset-0 bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Purchase Entry</h1>
              <p className="text-sm text-gray-500 mt-1">{purchase.invoice_number || 'New Entry'}</p>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={togglePDFUpload}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors flex items-center"
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload PDF
              </button>
              
              <button
                onClick={toggleGSTCalculator}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors flex items-center"
              >
                <Calculator className="w-4 h-4 mr-2" />
                GST Calculator
              </button>
              
              <ViewHistoryButton
                historyType="purchase"
                buttonText="History"
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors flex items-center"
              />
              
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-md transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Keyboard Shortcuts Help */}
      <div className="bg-indigo-50 px-4 py-2 text-xs text-indigo-700 border-b border-indigo-200">
        Keyboard shortcuts: <strong>Ctrl+N</strong> - Add Supplier | <strong>Ctrl+F</strong> - Search Products | <strong>Ctrl+U</strong> - Upload PDF | <strong>Ctrl+G</strong> - GST Calculator | <strong>Ctrl+S</strong> - Save | <strong>Esc</strong> - Close
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
          <div className="px-8 py-6">
            {/* Message Display */}
            {message && (
              <div className={`mb-6 p-4 rounded-lg flex items-start ${
                messageType === 'success' ? 'bg-green-100 text-green-800' : 
                messageType === 'error' ? 'bg-red-100 text-red-800' : 
                'bg-indigo-100 text-indigo-800'
              }`}>
                {messageType === 'success' && <CheckCircle className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" />}
                {messageType === 'error' && <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" />}
                <div className="flex-1">{message}</div>
                <button onClick={clearMessage} className="ml-2 hover:opacity-70">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            
            {/* Supplier Selection */}
            <SupplierSelector />
            
            {/* Purchase Details */}
            <PurchaseHeader />
            
            {/* Items Table */}
            <PurchaseItemsTable />
          </div>
        </div>
        
        {/* Footer */}
        <div className="px-8 py-4 border-t border-gray-200 bg-white">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Total Items: {purchase.items.length} | 
              Total Amount: ₹{purchase.final_amount.toFixed(2)}
            </div>
            
            <div className="flex items-center space-x-3">
              <button
                onClick={resetPurchase}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
              >
                Reset
              </button>
              
              <button
                onClick={() => {
                  calculateTotals();
                  setCurrentStep(1.5);
                }}
                disabled={purchase.items.length === 0 || !purchase.supplier_id || !purchase.invoice_number}
                className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center"
              >
                Review & Save
              </button>
            </div>
          </div>
        </div>
        
        {/* Modals */}
        {showPDFUpload && (
          <PDFUploadModal
              isOpen={showPDFUpload}
              onClose={togglePDFUpload}
              onDataExtracted={handlePDFData}
          />
        )}
        
        {showGSTCalculator && (
          <GSTCalculator
              isOpen={showGSTCalculator}
              onClose={toggleGSTCalculator}
              mode="modal"
          />
        )}
    </div>
  );
};

// Main component with providers
const ModularPurchaseEntry = ({ open = true, onClose, initialShowPDFUpload = false }) => {
  if (!open) return null;
  
  return (
    <PurchaseErrorBoundary onClose={onClose}>
      <PurchaseEntryContent onClose={onClose} initialShowPDFUpload={initialShowPDFUpload} />
    </PurchaseErrorBoundary>
  );
};

export default ModularPurchaseEntry;