import React, { useState, useEffect, useRef } from 'react';
import { Package, User, FileText, Save, Printer, ArrowLeft, X, CheckCircle, AlertCircle, Share2 } from 'lucide-react';
import { purchasesApi, suppliersApi } from '../../services/api';
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
  useToast
} from '../global';
import EnterpriseCalculator from '../../services/enterpriseCalculator'; // Use unified calculator

/**
 * MigratedPurchaseFlow - Purchase Entry using the new global document system
 * Demonstrates how to use EnhancedGlobalDocumentFlow for consistent UX
 */
const MigratedPurchaseFlow = ({ onClose, prefilledData = null }) => {
  const toast = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdPurchaseData, setCreatedPurchaseData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  
  // Purchase data state
  const [purchase, setPurchase] = useState({
    purchase_no: '',
    invoice_number: '',
    invoice_date: new Date().toISOString().split('T')[0],
    supplier_id: prefilledData?.supplier_id || '',
    supplier_name: prefilledData?.supplier_name || '',
    supplier_details: prefilledData?.supplier_details || null,
    items: prefilledData?.items || [],
    payment_mode: 'Credit',
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
    notes: prefilledData?.notes || ''
  });

  const [selectedSupplier, setSelectedSupplier] = useState(prefilledData?.supplier_details || null);

  // Calculate totals whenever items change
  useEffect(() => {
    calculateTotals();
  }, [purchase.items, purchase.discount_amount, purchase.other_charges]);

  const calculateTotals = async () => {
    if (!purchase.items || purchase.items.length === 0) {
      setPurchase(prev => ({
        ...prev,
        gross_amount: 0,
        tax_amount: 0,
        round_off: 0,
        net_amount: 0
      }));
      return;
    }

    try {
      const result = await EnterpriseCalculator.calculateTotals(purchase.items || [], purchase);
      
      if (result.success && result.totals) {
        const formattedTotals = result.totals; // Use totals directly
        
        setPurchase(prev => ({
          ...prev,
          ...formattedTotals,
          calculatedLineItems: result.line_items
        }));
      }
    } catch (error) {
      console.error('Error calculating purchase totals:', error);
    }
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
    const existingItem = purchase.items.find(item => 
      item.product_id === product.product_id && 
      item.batch_id === product.batch_id
    );
    
    if (existingItem) {
      handleUpdateItem(
        purchase.items.findIndex(item => 
          item.product_id === product.product_id && 
          item.batch_id === product.batch_id
        ),
        'quantity',
        existingItem.quantity + 1
      );
    } else {
      const newItem = {
        item_id: Date.now(),
        product_id: product.product_id,
        product_name: product.product_name,
        product_code: product.product_code,
        hsn_code: product.hsn_code || '',
        batch_id: product.batch_id,
        batch_no: product.batch_number || product.batch_no || '',
        expiry_date: product.expiry_date || '',
        quantity: 1,
        free_quantity: 0,
        mrp: product.mrp || 0,
        purchase_price: product.purchase_price || (product.mrp || 0) * 0.7,
        selling_price: product.sale_price || product.mrp || 0,
        discount_percent: 0,
        tax_percent: product.gst_percent || 0,  // No default GST
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

  const handleSavePurchase = async () => {
    if (!validatePurchase()) return;

    setSaving(true);
    try {
      const purchaseData = {
        ...purchase,
        supplier_id: parseInt(purchase.supplier_id),
        items: purchase.items.map(item => ({
          product_id: parseInt(item.product_id),
          batch_number: item.batch_no,
          expiry_date: item.expiry_date,
          quantity: parseInt(item.quantity) || 1,
          free_quantity: parseInt(item.free_quantity) || 0,
          purchase_price: parseFloat(item.purchase_price) || 0,
          mrp: parseFloat(item.mrp) || 0,
          selling_price: parseFloat(item.selling_price) || 0,
          discount_percent: parseFloat(item.discount_percent) || 0,
          tax_percent: parseFloat(item.tax_percent) || 0  // No default GST
        }))
      };

      const response = await purchasesApi.create(purchaseData);
      
      if (response && response.data) {
        const purchaseNumber = response.data.purchase_number || 'PUR-' + Date.now();
        
        setCreatedPurchaseData({
          purchaseNumber: purchaseNumber,
          purchaseId: response.data.purchase_id || response.data.id,
          supplierName: selectedSupplier?.supplier_name || purchase.supplier_name,
          totalAmount: purchase.net_amount
        });
        
        setShowSuccessModal(true);
        toast.success(`Purchase ${purchaseNumber} created successfully!`);
      }
    } catch (error) {
      console.error('Error creating purchase:', error);
      toast.error('Failed to create purchase');
    } finally {
      setSaving(false);
    }
  };

  const validatePurchase = () => {
    if (!selectedSupplier) {
      toast.error('Please select a supplier');
      return false;
    }

    if (!purchase.items || purchase.items.length === 0) {
      toast.error('Please add at least one item');
      return false;
    }

    if (!purchase.invoice_number) {
      toast.error('Please enter supplier invoice number');
      return false;
    }

    return true;
  };

  const handlePrint = () => {
    window.print();
  };

  // Create content for step 1
  const createContent = (
    <>
      {/* Date and Invoice Details */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">Invoice Date</label>
            <input
              type="date"
              value={purchase.invoice_date}
              onChange={(e) => setPurchase(prev => ({ ...prev, invoice_date: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">Supplier Invoice No</label>
            <input
              type="text"
              value={purchase.invoice_number}
              onChange={(e) => setPurchase(prev => ({ ...prev, invoice_number: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
              placeholder="Enter supplier invoice number"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">Delivery Date</label>
            <input
              type="date"
              value={purchase.delivery_date}
              onChange={(e) => setPurchase(prev => ({ ...prev, delivery_date: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
            />
          </div>
        </div>
      </div>

      {/* Supplier Section */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-green-700 uppercase tracking-wider mb-3 flex items-center">
          <User className="w-4 h-4 mr-2" />
          SUPPLIER
        </h3>
        <SupplierSearch
          value={purchase?.supplier_details || null}
          onChange={handleSupplierSelect}
          onCreateNew={() => setShowSupplierModal(true)}
          displayMode="inline"
          placeholder="Search supplier by name, phone, or code..."
          required
          clearable={true}
          buttonLabel="Create Supplier"  // Consistent label
        />
      </div>

      {/* Products Section */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-green-700 uppercase tracking-wider mb-3 flex items-center">
          <Package className="w-4 h-4 mr-2" />
          PRODUCTS
        </h3>
        <ProductSearchSimple
          onAddItem={handleAddItem}
          onCreateProduct={() => setShowProductModal(true)}
          showBatchSelection={false}  // No batch selection for purchase
          buttonLabel="Create Product"  // Consistent label
        />
      </div>

      {/* Items Table */}
      {purchase.items.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-green-700 uppercase tracking-wider mb-3">
            PURCHASE ITEMS
          </h3>
          <ItemsTable
            items={purchase.items}
            onUpdateItem={handleUpdateItem}
            onRemoveItem={handleRemoveItem}
            module="purchase"
            showTotals={false}
          />
        </div>
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
      />

      {/* Purchase Preview */}
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold">PURCHASE ENTRY</h2>
          <p className="text-gray-600">Purchase No: {purchase.purchase_no}</p>
          <p className="text-gray-600">Invoice No: {purchase.invoice_number}</p>
          <p className="text-gray-600">Date: {new Date(purchase.invoice_date).toLocaleDateString('en-IN')}</p>
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
                <td className="text-center py-2">{item.quantity}</td>
                <td className="text-center py-2">{item.free_quantity || 0}</td>
                <td className="text-right py-2">₹{(item.purchase_price || 0).toFixed(2)}</td>
                <td className="text-right py-2">₹{(item.mrp || 0).toFixed(2)}</td>
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
        
        // Validation & Actions
        canProceedToReview={() => selectedSupplier && purchase.items.length > 0 && purchase.invoice_number}
        onSave={handleSavePurchase}
        onPrint={handlePrint}
        isSaving={saving}
        
        // Footer totals
        footerTotals={{
          itemCount: purchase.items.length,
          totalAmount: purchase.net_amount,
          subtotal: purchase.gross_amount,
          tax: purchase.tax_amount,
          roundOff: purchase.round_off,
          grandTotal: purchase.net_amount
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

      {/* Success Modal */}
      {showSuccessModal && createdPurchaseData && (
        <GenericSuccessModal
          isOpen={showSuccessModal}
          onClose={() => {
            setShowSuccessModal(false);
            onClose();
          }}
          title="Purchase Created!"
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

export default MigratedPurchaseFlow;