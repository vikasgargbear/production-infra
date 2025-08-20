import React, { useState, useEffect, useRef } from 'react';
import { Package, FileText, Save, Printer, ArrowLeft, X, CheckCircle, AlertCircle, Share2, Calendar, Building2, Plus } from 'lucide-react';
import { suppliersApi } from '../../services/api';
import { purchasesApi } from '../../services/api/modules/purchases.api';
import { searchCache } from '../../utils/searchCache';
import { 
  EnhancedGlobalDocumentFlow,
  DocumentSummaryTop,
  SupplierSearch,
  ProductSearchSimple,
  ItemsTable,
  SupplierCreationModal,
  ProductCreationModal,
  GenericSuccessModal,
  ContentCard,
  useToast
} from '../global';
import documentNumberService from '../../services/documentNumberService';
import { PURCHASE_CONFIG } from '../../config/purchase.config';
import PDFUploadModal from '../PDFUploadModal';
import PDFUploadCard from '../global/ui/PDFUploadCard';

/**
 * EnhancedPurchaseEntry - Purchase Entry using the full global document system
 * Maintains exact same functionality as SimplifiedPurchaseEntry but with global UX
 * 
 * Key differences from Purchase Order:
 * - Records RECEIVED invoices (not creating orders)
 * - Updates inventory immediately
 * - Records payment obligations
 * - Uses /purchases/ endpoint (not /purchase-orders/)
 */
const EnhancedPurchaseEntry = ({ onClose, prefilledData = null }) => {
  const toast = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showPDFUpload, setShowPDFUpload] = useState(false);
  const [createdPurchaseData, setCreatedPurchaseData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  
  const productSearchRef = useRef(null);
  
  // Purchase data state - matching SimplifiedPurchaseEntry structure
  const [purchase, setPurchase] = useState({
    purchase_number: '',
    supplier_invoice_number: '', // Required for purchase entry
    invoice_date: new Date().toISOString().split('T')[0],
    supplier_id: prefilledData?.supplier_id || '',
    supplier_name: prefilledData?.supplier_name || '',
    supplier_details: prefilledData?.supplier_details || null,
    items: prefilledData?.items || [],
    payment_mode: 'Cash',
    payment_status: 'Pending',
    delivery_date: new Date().toISOString().split('T')[0],
    delivery_type: 'DELIVERY',
    transport_company: '',
    vehicle_number: '',
    lr_number: '',
    gross_amount: 0,
    discount_amount: 0,
    tax_amount: 0,
    other_charges: 0,
    round_off: 0,
    net_amount: 0,
    final_amount: 0,
    notes: prefilledData?.notes || ''
  });

  const [selectedSupplier, setSelectedSupplier] = useState(prefilledData?.supplier_details || null);

  // Generate purchase number on mount
  useEffect(() => {
    const generateAndSetPurchaseNumber = async () => {
      try {
        const purchaseNumber = await documentNumberService.generatePurchaseNumber();
        setPurchase(prev => ({ ...prev, purchase_number: purchaseNumber }));
      } catch (error) {
        console.warn('Failed to generate purchase number:', error);
        const fallbackNumber = `PUR-${Date.now().toString().slice(-8)}`;
        setPurchase(prev => ({ ...prev, purchase_number: fallbackNumber }));
      }
    };
    
    generateAndSetPurchaseNumber();
  }, []);

  // Calculate totals whenever items change
  useEffect(() => {
    if (purchase.items) {
      calculateTotals();
    }
  }, [purchase.items, purchase.discount_amount, purchase.other_charges]);

  const calculateTotals = () => {
    if (!purchase.items || purchase.items.length === 0) {
      setPurchase(prev => ({
        ...prev,
        gross_amount: 0,
        tax_amount: 0,
        round_off: 0,
        net_amount: 0,
        final_amount: 0
      }));
      return;
    }

    let grossTotal = 0;
    let taxTotal = 0;

    (purchase.items || []).forEach(item => {
      if (item.product_id) {
        const quantity = parseFloat(item.quantity) || 0;
        const purchasePrice = parseFloat(item.purchase_price) || 0;
        const taxPercent = parseFloat(item.tax_percent) || 0;
        
        const itemTotal = quantity * purchasePrice;
        const itemTax = (itemTotal * taxPercent) / 100;
        
        grossTotal += itemTotal;
        taxTotal += itemTax;
      }
    });

    const discountAmount = parseFloat(purchase.discount_amount) || 0;
    const otherCharges = parseFloat(purchase.other_charges) || 0;
    
    const netAmount = grossTotal + taxTotal - discountAmount + otherCharges;
    const roundOff = Math.round(netAmount) - netAmount;
    const finalAmount = Math.round(netAmount);

    setPurchase(prev => ({
      ...prev,
      gross_amount: grossTotal,
      tax_amount: taxTotal,
      round_off: roundOff,
      net_amount: netAmount,
      final_amount: finalAmount
    }));
  };

  const handleSupplierSelect = (supplier) => {
    setSelectedSupplier(supplier);
    if (supplier) {
      setPurchase(prev => ({
        ...prev,
        supplier_id: supplier.supplier_id || supplier.id,
        supplier_name: supplier.supplier_name || supplier.name,
        supplier_details: supplier
      }));
    } else {
      setPurchase(prev => ({
        ...prev,
        supplier_id: null,
        supplier_name: '',
        supplier_details: null
      }));
    }
  };

  const handleAddItem = (product) => {
    // Create new item with unique ID
    const newItem = {
      id: Date.now() + Math.random(), // Unique ID for tracking
      product_id: product.product_id,
      product_name: product.product_name,
      product_code: product.product_code,
      hsn_code: product.hsn_code || '',
      batch_no: product.batch_number || product.batch_no || '',
      batch_number: product.batch_number || product.batch_no || '',
      expiry_date: product.expiry_date || '',
      quantity: 1,
      free_quantity: 0,
      mrp: product.mrp || 0,
      purchase_price: product.purchase_price || (product.mrp || 0) * 0.7, // Default 30% discount
      selling_price: product.sale_price || product.mrp || 0,
      discount_percent: 0,
      tax_percent: product.gst_percent || product.tax_rate || 12,
      tax_amount: 0
    };
    
    setPurchase(prev => ({
      ...prev,
      items: [...(prev.items || []), newItem]
    }));
  };

  const handleUpdateItem = (index, field, value) => {
    setPurchase(prev => ({
      ...prev,
      items: (prev.items || []).map((item, i) => {
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

  const handleSavePurchase = async () => {
    // Validate before saving
    if (!validatePurchase()) {
      toast.error('Please fix validation errors');
      return;
    }

    setSaving(true);
    try {
      // Prepare data for backend - matching SimplifiedPurchaseEntry format
      const purchaseData = {
        supplier_invoice_number: purchase.supplier_invoice_number,
        invoice_date: purchase.invoice_date,
        supplier_id: parseInt(purchase.supplier_id),
        items: purchase.items.map(item => ({
          product_id: parseInt(item.product_id),
          batch_number: item.batch_no || item.batch_number,
          expiry_date: item.expiry_date,
          quantity: parseFloat(item.quantity) || 1,
          free_quantity: parseFloat(item.free_quantity) || 0,
          purchase_price: parseFloat(item.purchase_price) || 0,
          mrp: parseFloat(item.mrp) || 0,
          selling_price: parseFloat(item.selling_price) || 0,
          discount_percent: parseFloat(item.discount_percent) || 0,
          tax_percent: parseFloat(item.tax_percent) || 12
        })),
        payment_mode: purchase.payment_mode,
        payment_status: purchase.payment_status || 'Pending',
        discount_amount: parseFloat(purchase.discount_amount) || 0,
        other_charges: parseFloat(purchase.other_charges) || 0,
        notes: purchase.notes,
        transport_company: purchase.transport_company,
        vehicle_number: purchase.vehicle_number,
        lr_number: purchase.lr_number
      };

      console.log('Saving purchase with data:', purchaseData);
      const response = await purchasesApi.create(purchaseData);
      
      if (response && response.data) {
        const purchaseNumber = response.data.purchase_number || purchase.purchase_number;
        
        setCreatedPurchaseData({
          purchaseNumber: purchaseNumber,
          purchaseId: response.data.purchase_id || response.data.id,
          supplierName: selectedSupplier?.supplier_name || purchase.supplier_name,
          totalAmount: purchase.final_amount
        });
        
        setShowSuccessModal(true);
        toast.success(`Purchase ${purchaseNumber} created successfully!`);
        
        // Clear search cache after successful save
        searchCache.clear();
      }
    } catch (error) {
      console.error('Error creating purchase:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to create purchase';
      toast.error(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const validatePurchase = () => {
    const errors = {};
    
    if (!selectedSupplier) {
      errors.supplier = 'Supplier is required';
    }
    
    if (!purchase.supplier_invoice_number) {
      errors.invoice_number = 'Supplier invoice number is required';
    }
    
    if (!purchase.items || purchase.items.length === 0) {
      errors.items = 'At least one item is required';
    }
    
    return Object.keys(errors).length === 0;
  };

  const handlePrint = () => {
    window.print();
  };

  const formatCurrency = (amount) => {
    return `₹${(amount || 0).toFixed(2)}`;
  };

  // Handle PDF Upload
  const handlePDFUpload = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const response = await purchasesApi.parseInvoice(formData);
      if (response && response.data) {
        const extractedData = response.data;
        
        // Update purchase with extracted data
        setPurchase(prev => ({
          ...prev,
          supplier_invoice_number: extractedData.invoice_number || prev.supplier_invoice_number,
          invoice_date: extractedData.invoice_date || prev.invoice_date,
          items: extractedData.items || prev.items,
          gross_amount: extractedData.gross_amount || prev.gross_amount,
          tax_amount: extractedData.tax_amount || prev.tax_amount,
          net_amount: extractedData.net_amount || prev.net_amount,
          final_amount: extractedData.final_amount || prev.final_amount
        }));
        
        // Update supplier if extracted
        if (extractedData.supplier_id) {
          setSelectedSupplier(extractedData.supplier_details);
          setPurchase(prev => ({
            ...prev,
            supplier_id: extractedData.supplier_id,
            supplier_name: extractedData.supplier_name
          }));
        }
        
        toast.success('PDF data extracted successfully!');
      }
    } catch (error) {
      console.error('Error extracting PDF:', error);
      toast.error('Failed to extract PDF data. Please enter manually.');
    }
  };

  // Create content for step 1
  const createContent = (
    <>
      {/* Compact PDF Upload Option */}
      <div className="mb-6 bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-purple-600" />
            <div>
              <p className="text-sm font-medium text-gray-800">Quick Import from PDF</p>
              <p className="text-xs text-gray-600">Upload supplier invoice to auto-fill details</p>
            </div>
          </div>
          <div>
            <input
              type="file"
              accept="application/pdf"
              onChange={async (e) => {
                const file = e.target.files[0];
                if (file) {
                  await handlePDFUpload(file);
                }
                e.target.value = ''; // Reset input
              }}
              className="hidden"
              id="pdf-upload-input"
            />
            <label
              htmlFor="pdf-upload-input"
              className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors cursor-pointer inline-block"
            >
              Upload PDF
            </label>
          </div>
        </div>
      </div>

      {/* Supplier Invoice Details - Label Outside */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-5 h-5 text-gray-600" />
          <h3 className="text-sm font-semibold text-gray-700">SUPPLIER INVOICE DETAILS</h3>
        </div>
        <ContentCard title={null} subtitle={null} actions={null}>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Supplier Invoice Number <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={purchase.supplier_invoice_number}
                onChange={(e) => setPurchase(prev => ({ ...prev, supplier_invoice_number: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                placeholder="Supplier's invoice number"
                required
              />
              {errors.invoice_number && (
                <p className="text-red-500 text-xs mt-1">{errors.invoice_number}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Invoice Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="date"
                  value={purchase.invoice_date}
                  onChange={(e) => setPurchase(prev => ({ ...prev, invoice_date: e.target.value }))}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>
            <div>

              <label className="block text-sm font-medium text-gray-600 mb-1">Payment Mode</label>
              <select
                value={purchase.payment_mode}
                onChange={(e) => setPurchase(prev => ({ ...prev, payment_mode: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
              >
                <option value="Cash">Cash</option>
                <option value="Credit">Credit</option>
                <option value="UPI">UPI</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Cheque">Cheque</option>
              </select>
            </div>
          </div>
        </ContentCard>
      </div>

      {/* Supplier Section - With Label and Create Button Outside */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-gray-600" />
            <h3 className="text-sm font-semibold text-gray-700">SUPPLIER</h3>
          </div>
          <button
            onClick={() => setShowSupplierModal(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
          >
            Create Supplier
          </button>
        </div>
        <SupplierSearch
          value={selectedSupplier}
          onChange={handleSupplierSelect}
          displayMode="compact"
          placeholder="Search supplier by name, phone, or code..."
          clearable={true}
        />
        {errors.supplier && (
          <p className="text-red-500 text-xs mt-1">{errors.supplier}</p>
        )}
      </div>

      {/* Products Section - With Label and Create Button Outside */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-gray-600" />
            <h3 className="text-sm font-semibold text-gray-700">PRODUCTS</h3>
          </div>
          <button
            onClick={() => setShowProductModal(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
          >
            Create Product
          </button>
        </div>
        <ProductSearchSimple
          onAddItem={handleAddItem}
          onCreateProduct={(searchQuery) => {
            console.log('Creating product with name:', searchQuery);
            setShowProductModal(true);
            // TODO: Pass searchQuery to pre-fill product name in modal
          }}
          showBatchSelection={false}
          ref={productSearchRef}
          placeholder="Search products by name, code, or scan barcode..."
        />
      </div>

      {/* Items Table */}
      {purchase.items && purchase.items.length > 0 && (
        <ContentCard title="Purchase Items" subtitle={null} actions={null} className="mb-6">
          <ItemsTable
            items={purchase.items}
            onUpdateItem={handleUpdateItem}
            onRemoveItem={handleRemoveItem}
            module="purchase"
            showTotals={false}
            columns={[
              { key: 'product_name', label: 'Product', width: 'w-96' },
              { key: 'quantity', label: 'Qty', type: 'number', editable: true },
              { key: 'mrp', label: 'MRP', type: 'currency' },
              { key: 'purchase_price', label: 'Rate', type: 'number', editable: true },
              { key: 'tax_percent', label: 'GST%', type: 'select', editable: true, options: PURCHASE_CONFIG.TAX_OPTIONS },
              { key: 'batch_no', label: 'Batch', type: 'text', editable: true },
              { key: 'expiry_date', label: 'Expiry', type: 'date', editable: true },
              { key: 'total', label: 'Total', type: 'currency', calculated: true }
            ]}
          />
        </ContentCard>
      )}
      {errors.items && (
        <p className="text-red-500 text-xs mt-1">{errors.items}</p>
      )}
    </>
  );

  // Review content for step 2
  const reviewContent = (
    <>
      {/* Purchase Summary Top - Using global component */}
      <DocumentSummaryTop
        document={purchase}
        onDocumentUpdate={(updates) => setPurchase(prev => ({ ...prev, ...updates }))}
        documentType="purchase"
        showDelivery={true}
        showPayment={true}
        showReference={false}
        customFields={[
          {
            key: 'discount_amount',
            label: 'Discount Amount',
            type: 'number',
            placeholder: '0.00'
          },
          {
            key: 'other_charges',
            label: 'Other Charges',
            type: 'number',
            placeholder: '0.00'
          }
        ]}
      />

      {/* Purchase Preview */}
      <ContentCard title="Purchase Summary" subtitle={null} actions={null}>
        <div className="bg-white rounded-lg p-6">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold">PURCHASE ENTRY</h2>
            <p className="text-gray-600">Purchase No: {purchase.purchase_number}</p>
            <p className="text-gray-600">Supplier Invoice: {purchase.supplier_invoice_number}</p>
            <p className="text-gray-600">Date: {new Date(purchase.invoice_date).toLocaleDateString('en-IN')}</p>
          </div>

          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold mb-2 text-gray-700">Supplier Details:</h3>
            <p className="text-gray-900 font-medium">{selectedSupplier?.supplier_name}</p>
            {selectedSupplier?.phone && <p className="text-gray-600">Phone: {selectedSupplier.phone}</p>}
            {selectedSupplier?.gst_number && <p className="text-gray-600">GST: {selectedSupplier.gst_number}</p>}
            {selectedSupplier?.address && <p className="text-gray-600">Address: {selectedSupplier.address}</p>}
          </div>

          <table className="w-full mb-6">
            <thead>
              <tr className="border-b-2 border-gray-300">
                <th className="text-left py-2">Item</th>
                <th className="text-center py-2">Batch</th>
                <th className="text-center py-2">Expiry</th>
                <th className="text-center py-2">Qty</th>
                <th className="text-center py-2">Free</th>
                <th className="text-right py-2">Rate</th>
                <th className="text-right py-2">MRP</th>
                <th className="text-right py-2">Tax</th>
                <th className="text-right py-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(purchase.items || []).map((item, index) => {
                const quantity = parseFloat(item.quantity) || 0;
                const purchasePrice = parseFloat(item.purchase_price) || 0;
                const taxPercent = parseFloat(item.tax_percent) || 0;
                const itemTotal = quantity * purchasePrice;
                const itemTax = (itemTotal * taxPercent) / 100;
                const totalWithTax = itemTotal + itemTax;
                
                return (
                  <tr key={index} className="border-b border-gray-200">
                    <td className="py-2">{item.product_name}</td>
                    <td className="text-center py-2">{item.batch_no || '-'}</td>
                    <td className="text-center py-2">{item.expiry_date || '-'}</td>
                    <td className="text-center py-2">{quantity}</td>
                    <td className="text-center py-2">{item.free_quantity || 0}</td>
                    <td className="text-right py-2">{formatCurrency(purchasePrice)}</td>
                    <td className="text-right py-2">{formatCurrency(item.mrp)}</td>
                    <td className="text-right py-2">{taxPercent}%</td>
                    <td className="text-right py-2">{formatCurrency(totalWithTax)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-300">
                <td colSpan="8" className="text-right py-2 font-medium">Subtotal:</td>
                <td className="text-right py-2 font-medium">{formatCurrency(purchase.gross_amount)}</td>
              </tr>
              <tr>
                <td colSpan="8" className="text-right py-2">Tax:</td>
                <td className="text-right py-2">{formatCurrency(purchase.tax_amount)}</td>
              </tr>
              {purchase.discount_amount > 0 && (
                <tr>
                  <td colSpan="8" className="text-right py-2">Discount:</td>
                  <td className="text-right py-2 text-red-600">-{formatCurrency(purchase.discount_amount)}</td>
                </tr>
              )}
              {purchase.other_charges > 0 && (
                <tr>
                  <td colSpan="8" className="text-right py-2">Other Charges:</td>
                  <td className="text-right py-2">{formatCurrency(purchase.other_charges)}</td>
                </tr>
              )}
              <tr className="border-t font-semibold text-lg">
                <td colSpan="8" className="text-right py-2">Total:</td>
                <td className="text-right py-2">{formatCurrency(purchase.final_amount)}</td>
              </tr>
            </tfoot>
          </table>

          {/* Notes */}
          <div className="mt-6">
            <label className="block text-sm font-medium text-gray-600 mb-2">Notes</label>
            <textarea
              value={purchase.notes}
              onChange={(e) => setPurchase(prev => ({ ...prev, notes: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 resize-none"
              rows="2"
              placeholder="Add any additional notes..."
            />
          </div>
        </div>
      </ContentCard>
    </>
  );

  return (
    <>
      <EnhancedGlobalDocumentFlow
        documentType="purchase"
        documentData={purchase}
        onDocumentUpdate={setPurchase}
        onClose={onClose}
        
        // Two-step flow
        currentStep={currentStep}
        onStepChange={setCurrentStep}
        
        // Step content
        createContent={createContent}
        reviewContent={reviewContent}
        
        // Additional actions for header
        additionalActions={[
          {
            label: "Upload PDF",
            onClick: () => setShowPDFUpload(true),
            variant: "default"
          }
        ]}
        
        // Validation & Actions
        canProceedToReview={() => {
          return !!selectedSupplier && 
                 !!purchase.supplier_invoice_number && 
                 purchase.items && 
                 purchase.items.length > 0;
        }}
        onSave={handleSavePurchase}
        onPrint={handlePrint}
        isSaving={saving}
        
        // Footer totals
        footerTotals={{
          itemCount: purchase.items?.length || 0,
          totalAmount: purchase.final_amount,
          subtotal: purchase.gross_amount,
          tax: purchase.tax_amount,
          roundOff: purchase.round_off,
          grandTotal: purchase.final_amount
        }}
        
        // Keyboard shortcuts
        keyboardShortcuts={{
          1: [
            { key: 'Ctrl+N', action: 'Add Supplier' },
            { key: 'Ctrl+F', action: 'Search Products' },
            { key: 'Ctrl+S', action: 'Proceed to Review' },
            { key: 'Esc', action: 'Close' }
          ],
          2: [
            { key: 'Ctrl+S', action: 'Save Purchase' },
            { key: 'Ctrl+P', action: 'Print' },
            { key: 'Esc', action: 'Back to Edit' }
          ]
        }}
      />

      {/* Modals */}
      {showSupplierModal && (
        <SupplierCreationModal
          open={showSupplierModal}
          onClose={() => setShowSupplierModal(false)}
          onSupplierCreated={(supplier) => {
            handleSupplierSelect(supplier);
            setShowSupplierModal(false);
            toast.success('Supplier created successfully');
            searchCache.clear();
          }}
        />
      )}

      {showProductModal && (
        <ProductCreationModal
          open={showProductModal}
          onClose={() => setShowProductModal(false)}
          onProductCreated={(product) => {
            setShowProductModal(false);
            toast.success('Product created successfully');
            searchCache.clear();
            // Optionally auto-add the product
            if (product) {
              handleAddItem(product);
            }
          }}
        />
      )}

      {showPDFUpload && (
        <PDFUploadModal
          show={showPDFUpload}
          onClose={() => setShowPDFUpload(false)}
          onUploadSuccess={(data) => {
            // Handle PDF data extraction
            if (data.supplier_invoice_number) {
              setPurchase(prev => ({ ...prev, supplier_invoice_number: data.supplier_invoice_number }));
            }
            if (data.items) {
              setPurchase(prev => ({ ...prev, items: data.items }));
            }
            setShowPDFUpload(false);
            toast.success('PDF data extracted successfully');
          }}
        />
      )}

      {/* Success Modal */}
      {showSuccessModal && createdPurchaseData && (
        <GenericSuccessModal
          isOpen={showSuccessModal}
          onClose={() => {
            setShowSuccessModal(false);
            onClose();
          }}
          title="Purchase Entry Created!"
          documentNumber={createdPurchaseData.purchaseNumber}
          documentId={createdPurchaseData.purchaseId}
          documentType="purchase"
          customerName={createdPurchaseData.supplierName}
          totalAmount={createdPurchaseData.totalAmount}
          onPrint={handlePrint}
          showCopy={true}
        />
      )}
    </>
  );
};

export default EnhancedPurchaseEntry;