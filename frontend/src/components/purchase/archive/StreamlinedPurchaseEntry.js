import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Package, Save, Plus, Trash2, Search, AlertCircle, 
  CheckCircle, Upload, X, ChevronDown, Info
} from 'lucide-react';
import { purchasesApi } from '../../services/api/modules/purchases.api';
import { 
  ContentCard,
  useToast,
  StandardFormInput,
  StandardDatePicker,
  NumericInput,
  GenericSuccessModal
} from '../global';
import documentNumberService from '../../services/documentNumberService';
import SupplierQuickSelect from './components/SupplierQuickSelect';
import ProductLineEntry from './components/ProductLineEntry';
import PurchaseSummaryCard from './components/PurchaseSummaryCard';
import PDFUploadCard from '../global/ui/PDFUploadCard';

/**
 * StreamlinedPurchaseEntry - Fast, accurate purchase entry for pharma
 * 
 * Key Features:
 * 1. Single-page flow (no steps)
 * 2. Product search with auto-complete
 * 3. Inline validation
 * 4. Automatic batch creation
 * 5. Smart defaults (MRP, selling price)
 * 6. Quick PDF upload
 */
const StreamlinedPurchaseEntry = ({ onClose }) => {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdPurchaseData, setCreatedPurchaseData] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});
  const fileInputRef = useRef(null);
  
  // Purchase data
  const [purchase, setPurchase] = useState({
    invoice_number: '',
    invoice_date: new Date().toISOString().split('T')[0],
    supplier_id: null,
    supplier_name: '',
    items: [],
    subtotal_amount: 0,
    discount_amount: 0,
    tax_amount: 0,
    other_charges: 0,
    final_amount: 0,
    payment_mode: 'cash',
    notes: ''
  });

  // Auto-calculate totals
  useEffect(() => {
    calculateTotals();
  }, [purchase.items, purchase.discount_amount, purchase.other_charges]);

  const calculateTotals = useCallback(() => {
    if (!purchase.items || purchase.items.length === 0) {
      setPurchase(prev => ({
        ...prev,
        subtotal_amount: 0,
        tax_amount: 0,
        final_amount: 0
      }));
      return;
    }

    let subtotal = 0;
    let taxTotal = 0;

    purchase.items.forEach(item => {
      if (item.quantity && item.cost_price) {
        const itemSubtotal = item.quantity * item.cost_price;
        const itemTax = (itemSubtotal * (item.tax_percent || 12)) / 100;
        subtotal += itemSubtotal;
        taxTotal += itemTax;
      }
    });

    const finalAmount = subtotal + taxTotal - (purchase.discount_amount || 0) + (purchase.other_charges || 0);

    setPurchase(prev => ({
      ...prev,
      subtotal_amount: subtotal,
      tax_amount: taxTotal,
      final_amount: finalAmount
    }));
  }, [purchase.items, purchase.discount_amount, purchase.other_charges]);

  // Add new item line
  const addNewItem = () => {
    setPurchase(prev => ({
      ...prev,
      items: [...prev.items, {
        id: Date.now(),
        product_id: null,
        product_name: '',
        quantity: '',
        cost_price: '',
        mrp: '',
        selling_price: '',
        batch_number: '',
        expiry_date: '',
        tax_percent: 12,
        hsn_code: '',
        is_new_product: false,
        validation: { errors: [], warnings: [] }
      }]
    }));
  };

  // Update item
  const updateItem = (index, updates) => {
    setPurchase(prev => ({
      ...prev,
      items: prev.items.map((item, i) => 
        i === index ? { ...item, ...updates } : item
      )
    }));
  };

  // Remove item
  const removeItem = (index) => {
    setPurchase(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  // Validate all items
  const validateItems = async () => {
    if (!purchase.supplier_id) {
      toast.error('Please select a supplier');
      return false;
    }

    if (!purchase.invoice_number) {
      toast.error('Please enter invoice number');
      return false;
    }

    if (purchase.items.length === 0) {
      toast.error('Please add at least one item');
      return false;
    }

    // Validate with backend
    try {
      const response = await purchasesApi.validateItems({
        items: purchase.items
      });

      if (!response.data.all_valid) {
        // Show validation errors
        response.data.items.forEach((item, index) => {
          if (!item.is_valid) {
            updateItem(index, {
              validation: { errors: item.validation_errors }
            });
          }
        });
        toast.error('Please fix validation errors');
        return false;
      }

      return true;
    } catch (error) {
      console.error('Validation error:', error);
      return true; // Proceed anyway if validation endpoint fails
    }
  };

  // Save purchase
  const handleSave = async () => {
    if (!await validateItems()) {
      return;
    }

    setSaving(true);
    try {
      const purchaseData = {
        ...purchase,
        items: purchase.items.map(item => ({
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: parseFloat(item.quantity),
          cost_price: parseFloat(item.cost_price),
          mrp: parseFloat(item.mrp),
          selling_price: parseFloat(item.selling_price),
          batch_number: item.batch_number,
          expiry_date: item.expiry_date,
          tax_percent: parseFloat(item.tax_percent),
          hsn_code: item.hsn_code
        }))
      };

      const response = await purchasesApi.createEntry(purchaseData);
      
      if (response && response.data) {
        setCreatedPurchaseData({
          invoiceNumber: response.data.invoice_number,
          invoiceId: response.data.invoice_id,
          supplierName: purchase.supplier_name,
          totalAmount: purchase.final_amount,
          itemsCreated: response.data.items_created
        });
        
        setShowSuccessModal(true);
        toast.success('Purchase entry created successfully!');
      }
    } catch (error) {
      console.error('Error creating purchase:', error);
      toast.error(error.response?.data?.detail || 'Failed to create purchase');
    } finally {
      setSaving(false);
    }
  };

  // Handle PDF upload
  const handlePDFUpload = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      toast.info('Processing invoice...');
      const response = await purchasesApi.parseInvoice(formData);
      
      if (response && response.data) {
        const data = response.data;
        
        // Update purchase with extracted data
        setPurchase(prev => ({
          ...prev,
          invoice_number: data.invoice_number || prev.invoice_number,
          invoice_date: data.invoice_date || prev.invoice_date,
          supplier_name: data.supplier_name || prev.supplier_name,
          items: data.items?.map(item => ({
            id: Date.now() + Math.random(),
            product_name: item.product_name,
            quantity: item.quantity,
            cost_price: item.cost_price || item.rate,
            mrp: item.mrp,
            batch_number: item.batch_number,
            expiry_date: item.expiry_date,
            tax_percent: item.tax_percent || 12,
            hsn_code: item.hsn_code,
            is_new_product: false,
            validation: { errors: [], warnings: [] }
          })) || prev.items
        }));
        
        toast.success('Invoice data extracted successfully');
      }
    } catch (error) {
      console.error('Error parsing invoice:', error);
      toast.error('Failed to extract invoice data');
    }
  };

  // Success modal actions
  const handleSuccessClose = () => {
    setShowSuccessModal(false);
    // Reset form
    setPurchase({
      invoice_number: '',
      invoice_date: new Date().toISOString().split('T')[0],
      supplier_id: null,
      supplier_name: '',
      items: [],
      subtotal_amount: 0,
      discount_amount: 0,
      tax_amount: 0,
      other_charges: 0,
      final_amount: 0,
      payment_mode: 'cash',
      notes: ''
    });
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Package className="w-6 h-6 text-indigo-600" />
            <h2 className="text-xl font-semibold">Purchase Entry</h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          
          {/* Quick Upload Section */}
          <ContentCard>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium">Quick Start</h3>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={(e) => e.target.files[0] && handlePDFUpload(e.target.files[0])}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center space-x-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100"
              >
                <Upload className="w-4 h-4" />
                <span>Upload Invoice PDF</span>
              </button>
            </div>

            {/* Basic Info */}
            <div className="grid grid-cols-4 gap-4">
              <SupplierQuickSelect
                value={purchase.supplier_id}
                onChange={(supplier) => setPurchase(prev => ({
                  ...prev,
                  supplier_id: supplier.id,
                  supplier_name: supplier.name
                }))}
              />
              
              <StandardFormInput
                label="Invoice Number"
                value={purchase.invoice_number}
                onChange={(value) => setPurchase(prev => ({ ...prev, invoice_number: value }))}
                placeholder="INV-001"
                required
              />
              
              <StandardDatePicker
                label="Invoice Date"
                value={purchase.invoice_date}
                onChange={(value) => setPurchase(prev => ({ ...prev, invoice_date: value }))}
              />
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Payment Mode
                </label>
                <select
                  value={purchase.payment_mode}
                  onChange={(e) => setPurchase(prev => ({ ...prev, payment_mode: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="cash">Cash</option>
                  <option value="credit">Credit</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="bank">Bank Transfer</option>
                </select>
              </div>
            </div>
          </ContentCard>

          {/* Items Section */}
          <ContentCard>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium">Items</h3>
              <button
                onClick={addNewItem}
                className="flex items-center space-x-2 px-4 py-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100"
              >
                <Plus className="w-4 h-4" />
                <span>Add Item</span>
              </button>
            </div>

            {/* Items Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Batch</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Expiry</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Qty</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Cost</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">MRP</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Selling</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Tax%</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {purchase.items.map((item, index) => (
                    <ProductLineEntry
                      key={item.id}
                      item={item}
                      index={index}
                      onUpdate={(updates) => updateItem(index, updates)}
                      onRemove={() => removeItem(index)}
                    />
                  ))}
                  {purchase.items.length === 0 && (
                    <tr>
                      <td colSpan="10" className="px-3 py-8 text-center text-gray-500">
                        No items added. Click "Add Item" to start.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </ContentCard>

          {/* Summary Section */}
          <div className="grid grid-cols-3 gap-6">
            <div className="col-span-2">
              <ContentCard>
                <h3 className="text-lg font-medium mb-4">Additional Charges</h3>
                <div className="grid grid-cols-2 gap-4">
                  <NumericInput
                    label="Discount Amount"
                    value={purchase.discount_amount}
                    onChange={(value) => setPurchase(prev => ({ ...prev, discount_amount: value }))}
                    prefix="₹"
                  />
                  <NumericInput
                    label="Other Charges"
                    value={purchase.other_charges}
                    onChange={(value) => setPurchase(prev => ({ ...prev, other_charges: value }))}
                    prefix="₹"
                  />
                </div>
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea
                    value={purchase.notes}
                    onChange={(e) => setPurchase(prev => ({ ...prev, notes: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                    rows="2"
                    placeholder="Any additional notes..."
                  />
                </div>
              </ContentCard>
            </div>
            
            <PurchaseSummaryCard
              subtotal={purchase.subtotal_amount}
              discount={purchase.discount_amount}
              tax={purchase.tax_amount}
              otherCharges={purchase.other_charges}
              total={purchase.final_amount}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-4 pb-6">
            <button
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || purchase.items.length === 0}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Save Purchase</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Success Modal */}
      {showSuccessModal && (
        <GenericSuccessModal
          isOpen={showSuccessModal}
          onClose={handleSuccessClose}
          title="Purchase Entry Created"
          message={`Invoice ${createdPurchaseData?.invoiceNumber} has been successfully created with ${createdPurchaseData?.itemsCreated} items.`}
          primaryAction={{
            label: "Create Another",
            onClick: handleSuccessClose
          }}
          secondaryAction={{
            label: "View Purchase",
            onClick: () => {
              // Navigate to purchase view
              handleSuccessClose();
            }
          }}
        />
      )}
    </div>
  );
};

export default StreamlinedPurchaseEntry;