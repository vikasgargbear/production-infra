import React, { useState, useEffect, useRef } from 'react';
import { Package, FileText, Save, Printer, ArrowLeft, X, CheckCircle, AlertCircle, Share2, Calendar, Building2, Plus } from 'lucide-react';
import { suppliersApi, productsApi, purchaseApi } from '../../services/api';
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

/**
 * EnhancedPurchaseOrderFlow - Purchase Order using the full global document system
 * Creates purchase orders to request goods from suppliers
 * Uses /purchase-orders/ endpoint
 */
const EnhancedPurchaseOrderFlow = ({ onClose, prefilledData = null }) => {
  const toast = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdPOData, setCreatedPOData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  
  const productSearchRef = useRef(null);
  
  // Purchase Order data state
  const [purchaseOrder, setPurchaseOrder] = useState({
    po_no: '',
    po_date: new Date().toISOString().split('T')[0],
    expected_delivery_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    supplier_id: prefilledData?.supplier_id || '',
    supplier_name: prefilledData?.supplier_name || '',
    supplier_details: prefilledData?.supplier_details || null,
    items: prefilledData?.items || [],
    payment_terms: '30 days',
    delivery_terms: 'F.O.R. Destination',
    delivery_location: 'Main Warehouse',
    transport_mode: 'By Road',
    gross_amount: 0,
    discount_amount: 0,
    tax_amount: 0,
    freight_charges: 0,
    net_amount: 0,
    final_amount: 0,
    notes: prefilledData?.notes || '',
    status: 'draft'
  });

  const [selectedSupplier, setSelectedSupplier] = useState(prefilledData?.supplier_details || null);

  // Generate PO number on mount
  useEffect(() => {
    const generateAndSetPONumber = async () => {
      try {
        const poNumber = await documentNumberService.generatePONumber();
        setPurchaseOrder(prev => ({ ...prev, po_no: poNumber }));
      } catch (error) {
        console.warn('Failed to generate PO number:', error);
        const fallbackNumber = `PO-${Date.now().toString().slice(-8)}`;
        setPurchaseOrder(prev => ({ ...prev, po_no: fallbackNumber }));
      }
    };
    
    generateAndSetPONumber();
  }, []);

  // Calculate totals whenever items change
  useEffect(() => {
    if (purchaseOrder.items) {
      calculateTotals();
    }
  }, [purchaseOrder.items, purchaseOrder.discount_amount, purchaseOrder.freight_charges]);

  const calculateTotals = () => {
    if (!purchaseOrder.items || purchaseOrder.items.length === 0) {
      setPurchaseOrder(prev => ({
        ...prev,
        gross_amount: 0,
        tax_amount: 0,
        net_amount: 0,
        final_amount: 0
      }));
      return;
    }

    let grossTotal = 0;
    let taxTotal = 0;

    (purchaseOrder.items || []).forEach(item => {
      if (item.product_id) {
        const quantity = parseFloat(item.quantity) || 0;
        const unitPrice = parseFloat(item.unit_price) || 0;
        const taxPercent = parseFloat(item.tax_percent) || 0;
        
        const itemTotal = quantity * unitPrice;
        const itemTax = (itemTotal * taxPercent) / 100;
        
        grossTotal += itemTotal;
        taxTotal += itemTax;
      }
    });

    const discountAmount = parseFloat(purchaseOrder.discount_amount) || 0;
    const freightCharges = parseFloat(purchaseOrder.freight_charges) || 0;
    const netAmount = grossTotal + taxTotal - discountAmount + freightCharges;

    setPurchaseOrder(prev => ({
      ...prev,
      gross_amount: grossTotal,
      tax_amount: taxTotal,
      net_amount: netAmount,
      final_amount: netAmount
    }));
  };

  const handleSupplierSelect = (supplier) => {
    setSelectedSupplier(supplier);
    setPurchaseOrder(prev => ({
      ...prev,
      supplier_id: supplier.supplier_id,
      supplier_name: supplier.supplier_name,
      supplier_details: supplier
    }));
  };

  const handleAddItem = (product) => {
    const newItem = {
      id: Date.now() + Math.random(),
      product_id: product.product_id,
      product_name: product.product_name,
      product_code: product.product_code,
      hsn_code: product.hsn_code || '',
      quantity: 1,
      unit_price: product.purchase_price || 0,
      tax_percent: product.tax_percent || 12,
      total: product.purchase_price || 0
    };
    
    setPurchaseOrder(prev => ({
      ...prev,
      items: [...(prev.items || []), newItem]
    }));
    
    if (productSearchRef.current) {
      setTimeout(() => productSearchRef.current.focus(), 100);
    }
  };

  const handleUpdateItem = (index, field, value) => {
    setPurchaseOrder(prev => ({
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
    setPurchaseOrder(prev => ({
      ...prev,
      items: (prev.items || []).filter((_, i) => i !== index)
    }));
  };

  const handleSavePurchaseOrder = async () => {
    if (!validatePurchaseOrder()) {
      toast.error('Please fix validation errors');
      return;
    }

    setSaving(true);
    try {
      const poData = {
        po_no: purchaseOrder.po_no,
        po_date: purchaseOrder.po_date,
        expected_delivery_date: purchaseOrder.expected_delivery_date,
        supplier_id: parseInt(purchaseOrder.supplier_id),
        items: purchaseOrder.items.map(item => ({
          product_id: parseInt(item.product_id),
          quantity: parseFloat(item.quantity) || 1,
          unit_price: parseFloat(item.unit_price) || 0,
          tax_percent: parseFloat(item.tax_percent) || 12
        })),
        payment_terms: purchaseOrder.payment_terms,
        delivery_terms: purchaseOrder.delivery_terms,
        delivery_location: purchaseOrder.delivery_location,
        discount_amount: parseFloat(purchaseOrder.discount_amount) || 0,
        freight_charges: parseFloat(purchaseOrder.freight_charges) || 0,
        notes: purchaseOrder.notes
      };

      console.log('Saving purchase order with data:', poData);
      const response = await purchaseApi.createPurchaseOrder(poData);
      
      if (response && response.data) {
        const poNumber = response.data.po_no || purchaseOrder.po_no;
        
        setCreatedPOData({
          poNumber: poNumber,
          poId: response.data.po_id || response.data.id,
          supplierName: selectedSupplier?.supplier_name || purchaseOrder.supplier_name,
          totalAmount: purchaseOrder.final_amount
        });
        
        setShowSuccessModal(true);
        toast.success(`Purchase Order ${poNumber} created successfully!`);
        
        searchCache.clear();
      }
    } catch (error) {
      console.error('Error creating purchase order:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to create purchase order';
      toast.error(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const validatePurchaseOrder = () => {
    const errors = {};
    
    if (!selectedSupplier) {
      errors.supplier = 'Supplier is required';
    }
    
    if (!purchaseOrder.items || purchaseOrder.items.length === 0) {
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

  // Create content for step 1
  const createContent = (
    <>
      {/* PO Details */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-5 h-5 text-gray-600" />
          <h3 className="text-sm font-semibold text-gray-700">PURCHASE ORDER DETAILS</h3>
        </div>
        <ContentCard title={null} subtitle={null} actions={null}>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">PO Number</label>
              <input
                type="text"
                value={purchaseOrder.po_no}
                readOnly
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">PO Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="date"
                  value={purchaseOrder.po_date}
                  onChange={(e) => setPurchaseOrder(prev => ({ ...prev, po_date: e.target.value }))}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Expected Delivery</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="date"
                  value={purchaseOrder.expected_delivery_date}
                  onChange={(e) => setPurchaseOrder(prev => ({ ...prev, expected_delivery_date: e.target.value }))}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </ContentCard>
      </div>

      {/* Supplier Section */}
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
          onCreateNew={(searchQuery) => {
            console.log('Creating supplier with name:', searchQuery);
            setShowSupplierModal(true);
          }}
          displayMode="compact"
          placeholder="Search supplier by name, phone, or code..."
          clearable={true}
        />
        {errors.supplier && (
          <p className="text-red-500 text-xs mt-1">{errors.supplier}</p>
        )}
      </div>

      {/* Products Section */}
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
          }}
          showBatchSelection={false}
          ref={productSearchRef}
          placeholder="Search products by name, code, or scan barcode..."
        />
      </div>

      {/* Items Table */}
      {purchaseOrder.items && purchaseOrder.items.length > 0 && (
        <ContentCard title="Purchase Order Items" subtitle={null} actions={null} className="mb-6">
          <ItemsTable
            items={purchaseOrder.items}
            onUpdateItem={handleUpdateItem}
            onRemoveItem={handleRemoveItem}
            module="purchase-order"
            showTotals={false}
            columns={[
              { key: 'product_name', label: 'Product', width: 'w-96' },
              { key: 'quantity', label: 'Qty', type: 'number', editable: true },
              { key: 'unit_price', label: 'Unit Price', type: 'number', editable: true },
              { key: 'tax_percent', label: 'GST%', type: 'select', editable: true, options: PURCHASE_CONFIG.TAX_OPTIONS },
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
      {/* PO Summary */}
      <DocumentSummaryTop
        document={purchaseOrder}
        onDocumentUpdate={(updates) => setPurchaseOrder(prev => ({ ...prev, ...updates }))}
        documentType="purchase-order"
        showDelivery={true}
        showPayment={true}
        showReference={false}
        customFields={[
          {
            key: 'payment_terms',
            label: 'Payment Terms',
            type: 'text',
            placeholder: 'e.g., 30 days'
          },
          {
            key: 'delivery_terms',
            label: 'Delivery Terms',
            type: 'text',
            placeholder: 'e.g., F.O.R. Destination'
          },
          {
            key: 'freight_charges',
            label: 'Freight Charges',
            type: 'number',
            placeholder: '0.00'
          }
        ]}
      />

      {/* PO Preview */}
      <ContentCard title="Purchase Order Preview" subtitle={null} actions={null}>
        <div className="bg-white rounded-lg p-6">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold">PURCHASE ORDER</h2>
            <p className="text-gray-600">PO No: {purchaseOrder.po_no}</p>
            <p className="text-gray-600">Date: {new Date(purchaseOrder.po_date).toLocaleDateString('en-IN')}</p>
            <p className="text-gray-600">Expected Delivery: {new Date(purchaseOrder.expected_delivery_date).toLocaleDateString('en-IN')}</p>
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
                <th className="text-center py-2">Qty</th>
                <th className="text-right py-2">Unit Price</th>
                <th className="text-right py-2">Tax</th>
                <th className="text-right py-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(purchaseOrder.items || []).map((item, index) => {
                const quantity = parseFloat(item.quantity) || 0;
                const unitPrice = parseFloat(item.unit_price) || 0;
                const taxPercent = parseFloat(item.tax_percent) || 0;
                const itemTotal = quantity * unitPrice;
                const itemTax = (itemTotal * taxPercent) / 100;
                const totalWithTax = itemTotal + itemTax;
                
                return (
                  <tr key={index} className="border-b border-gray-200">
                    <td className="py-2">{item.product_name}</td>
                    <td className="text-center py-2">{quantity}</td>
                    <td className="text-right py-2">{formatCurrency(unitPrice)}</td>
                    <td className="text-right py-2">{taxPercent}%</td>
                    <td className="text-right py-2">{formatCurrency(totalWithTax)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-300">
                <td colSpan="4" className="text-right py-2 font-medium">Subtotal:</td>
                <td className="text-right py-2 font-medium">{formatCurrency(purchaseOrder.gross_amount)}</td>
              </tr>
              <tr>
                <td colSpan="4" className="text-right py-2">Tax:</td>
                <td className="text-right py-2">{formatCurrency(purchaseOrder.tax_amount)}</td>
              </tr>
              {purchaseOrder.freight_charges > 0 && (
                <tr>
                  <td colSpan="4" className="text-right py-2">Freight:</td>
                  <td className="text-right py-2">{formatCurrency(purchaseOrder.freight_charges)}</td>
                </tr>
              )}
              <tr className="border-t border-gray-300">
                <td colSpan="4" className="text-right py-2 text-lg font-bold">Total:</td>
                <td className="text-right py-2 text-lg font-bold">{formatCurrency(purchaseOrder.final_amount)}</td>
              </tr>
            </tfoot>
          </table>

          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <h4 className="font-medium text-blue-900 mb-2">Terms & Conditions:</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Payment Terms: {purchaseOrder.payment_terms}</li>
              <li>• Delivery Terms: {purchaseOrder.delivery_terms}</li>
              <li>• Delivery Location: {purchaseOrder.delivery_location}</li>
            </ul>
          </div>

          {purchaseOrder.notes && (
            <div className="mt-4 p-4 bg-yellow-50 rounded-lg">
              <h4 className="font-medium text-yellow-900 mb-2">Notes:</h4>
              <p className="text-sm text-yellow-800">{purchaseOrder.notes}</p>
            </div>
          )}
        </div>
      </ContentCard>
    </>
  );

  return (
    <>
      <EnhancedGlobalDocumentFlow
        documentType="purchase-order"
        documentData={purchaseOrder}
        onDocumentUpdate={setPurchaseOrder}
        onClose={onClose}
        
        // Two-step flow
        currentStep={currentStep}
        onStepChange={setCurrentStep}
        
        // Step content
        createContent={createContent}
        reviewContent={reviewContent}
        
        // Validation & Actions
        canProceedToReview={() => {
          return !!selectedSupplier && 
                 purchaseOrder.items && 
                 purchaseOrder.items.length > 0;
        }}
        onSave={handleSavePurchaseOrder}
        onPrint={handlePrint}
        isSaving={saving}
        
        // Footer totals
        footerTotals={{
          itemCount: purchaseOrder.items?.length || 0,
          totalAmount: purchaseOrder.final_amount,
          subtotal: purchaseOrder.gross_amount,
          tax: purchaseOrder.tax_amount,
          freight: purchaseOrder.freight_charges,
          grandTotal: purchaseOrder.final_amount
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
            { key: 'Ctrl+S', action: 'Save PO' },
            { key: 'Ctrl+P', action: 'Print' },
            { key: 'Esc', action: 'Back to Edit' }
          ]
        }}
      />

      {/* Modals */}
      {showSupplierModal && (
        <SupplierCreationModal
          isOpen={showSupplierModal}
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
          show={showProductModal}
          onClose={() => setShowProductModal(false)}
          onProductCreated={(product) => {
            setShowProductModal(false);
            toast.success('Product created successfully');
            searchCache.clear();
            if (product) {
              handleAddItem(product);
            }
          }}
        />
      )}

      {/* Success Modal */}
      {showSuccessModal && createdPOData && (
        <GenericSuccessModal
          isOpen={showSuccessModal}
          onClose={() => {
            setShowSuccessModal(false);
            onClose();
          }}
          title="Purchase Order Created!"
          documentNumber={createdPOData.poNumber}
          documentId={createdPOData.poId}
          documentType="purchase-order"
          customerName={createdPOData.supplierName}
          totalAmount={createdPOData.totalAmount}
          onPrint={handlePrint}
          showCopy={true}
        />
      )}
    </>
  );
};

export default EnhancedPurchaseOrderFlow;