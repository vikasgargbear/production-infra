import React, { useState, useEffect, useRef } from 'react';
import { Package, FileText, Truck, Calendar, Building2, Plus, Save, Printer } from 'lucide-react';
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
 * EnhancedGRNFlow - Goods Receipt Note using the full global document system
 * Records receipt of goods against purchase orders
 * Updates inventory and validates deliveries
 */
const EnhancedGRNFlow = ({ onClose, prefilledData = null }) => {
  const toast = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdGRNData, setCreatedGRNData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  
  const productSearchRef = useRef(null);
  
  // GRN data state
  const [grn, setGrn] = useState({
    grn_no: '',
    grn_date: new Date().toISOString().split('T')[0],
    po_reference: prefilledData?.po_reference || '',
    supplier_id: prefilledData?.supplier_id || '',
    supplier_name: prefilledData?.supplier_name || '',
    supplier_details: prefilledData?.supplier_details || null,
    supplier_invoice_no: '',
    supplier_invoice_date: new Date().toISOString().split('T')[0],
    items: prefilledData?.items || [],
    transport_details: {
      transporter_name: '',
      vehicle_no: '',
      lr_no: '',
      lr_date: '',
      received_by: '',
      received_date: new Date().toISOString().split('T')[0]
    },
    quality_check: {
      checked_by: '',
      check_date: new Date().toISOString().split('T')[0],
      quality_status: 'Approved',
      remarks: ''
    },
    gross_amount: 0,
    tax_amount: 0,
    net_amount: 0,
    final_amount: 0,
    notes: prefilledData?.notes || '',
    status: 'received'
  });

  const [selectedSupplier, setSelectedSupplier] = useState(prefilledData?.supplier_details || null);

  // Generate GRN number on mount
  useEffect(() => {
    const generateAndSetGRNNumber = async () => {
      try {
        const grnNumber = await documentNumberService.generateGRNNumber();
        setGrn(prev => ({ ...prev, grn_no: grnNumber }));
      } catch (error) {
        console.warn('Failed to generate GRN number:', error);
        const fallbackNumber = `GRN-${Date.now().toString().slice(-8)}`;
        setGrn(prev => ({ ...prev, grn_no: fallbackNumber }));
      }
    };
    
    generateAndSetGRNNumber();
  }, []);

  // Calculate totals whenever items change
  useEffect(() => {
    if (grn.items) {
      calculateTotals();
    }
  }, [grn.items]);

  const calculateTotals = () => {
    if (!grn.items || grn.items.length === 0) {
      setGrn(prev => ({
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

    (grn.items || []).forEach(item => {
      if (item.product_id) {
        const receivedQty = parseFloat(item.received_qty) || 0;
        const unitPrice = parseFloat(item.unit_price) || 0;
        const taxPercent = parseFloat(item.tax_percent) || 0;
        
        const itemTotal = receivedQty * unitPrice;
        const itemTax = (itemTotal * taxPercent) / 100;
        
        grossTotal += itemTotal;
        taxTotal += itemTax;
      }
    });

    const netAmount = grossTotal + taxTotal;

    setGrn(prev => ({
      ...prev,
      gross_amount: grossTotal,
      tax_amount: taxTotal,
      net_amount: netAmount,
      final_amount: netAmount
    }));
  };

  const handleSupplierSelect = (supplier) => {
    setSelectedSupplier(supplier);
    setGrn(prev => ({
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
      batch_number: '',
      expiry_date: '',
      ordered_qty: 0,
      received_qty: 1,
      unit_price: product.purchase_price || 0,
      tax_percent: product.tax_percent || 12,
      quality_status: 'Approved',
      total: product.purchase_price || 0
    };
    
    setGrn(prev => ({
      ...prev,
      items: [...(prev.items || []), newItem]
    }));
    
    if (productSearchRef.current) {
      setTimeout(() => productSearchRef.current.focus(), 100);
    }
  };

  const handleUpdateItem = (index, field, value) => {
    setGrn(prev => ({
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
    setGrn(prev => ({
      ...prev,
      items: (prev.items || []).filter((_, i) => i !== index)
    }));
  };

  const handleSaveGRN = async () => {
    if (!validateGRN()) {
      toast.error('Please fix validation errors');
      return;
    }

    setSaving(true);
    try {
      const grnData = {
        grn_no: grn.grn_no,
        grn_date: grn.grn_date,
        po_reference: grn.po_reference,
        supplier_id: parseInt(grn.supplier_id),
        supplier_invoice_no: grn.supplier_invoice_no,
        supplier_invoice_date: grn.supplier_invoice_date,
        items: grn.items.map(item => ({
          product_id: parseInt(item.product_id),
          batch_number: item.batch_number,
          expiry_date: item.expiry_date,
          ordered_qty: parseFloat(item.ordered_qty) || 0,
          received_qty: parseFloat(item.received_qty) || 0,
          unit_price: parseFloat(item.unit_price) || 0,
          tax_percent: parseFloat(item.tax_percent) || 12,
          quality_status: item.quality_status || 'Approved'
        })),
        transport_details: grn.transport_details,
        quality_check: grn.quality_check,
        notes: grn.notes
      };

      console.log('Saving GRN with data:', grnData);
      const response = await purchaseApi.createGRN(grnData);
      
      if (response && response.data) {
        const grnNumber = response.data.grn_no || grn.grn_no;
        
        setCreatedGRNData({
          grnNumber: grnNumber,
          grnId: response.data.grn_id || response.data.id,
          supplierName: selectedSupplier?.supplier_name || grn.supplier_name,
          totalAmount: grn.final_amount
        });
        
        setShowSuccessModal(true);
        toast.success(`GRN ${grnNumber} created successfully!`);
        
        searchCache.clear();
      }
    } catch (error) {
      console.error('Error creating GRN:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to create GRN';
      toast.error(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const validateGRN = () => {
    const errors = {};
    
    if (!selectedSupplier) {
      errors.supplier = 'Supplier is required';
    }
    
    if (!grn.supplier_invoice_no) {
      errors.invoice_no = 'Supplier invoice number is required';
    }
    
    if (!grn.items || grn.items.length === 0) {
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
      {/* GRN Details */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-5 h-5 text-gray-600" />
          <h3 className="text-sm font-semibold text-gray-700">GRN DETAILS</h3>
        </div>
        <ContentCard title={null} subtitle={null} actions={null}>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">GRN Number</label>
              <input
                type="text"
                value={grn.grn_no}
                readOnly
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">GRN Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="date"
                  value={grn.grn_date}
                  onChange={(e) => setGrn(prev => ({ ...prev, grn_date: e.target.value }))}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">PO Reference</label>
              <input
                type="text"
                value={grn.po_reference}
                onChange={(e) => setGrn(prev => ({ ...prev, po_reference: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                placeholder="Purchase order number"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Supplier Invoice No <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={grn.supplier_invoice_no}
                onChange={(e) => setGrn(prev => ({ ...prev, supplier_invoice_no: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                placeholder="Supplier's invoice number"
                required
              />
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
            <h3 className="text-sm font-semibold text-gray-700">PRODUCTS RECEIVED</h3>
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
          placeholder="Search products received..."
        />
      </div>

      {/* Items Table */}
      {grn.items && grn.items.length > 0 && (
        <ContentCard title="Goods Received" subtitle={null} actions={null} className="mb-6">
          <ItemsTable
            items={grn.items}
            onUpdateItem={handleUpdateItem}
            onRemoveItem={handleRemoveItem}
            module="grn"
            showTotals={false}
            columns={[
              { key: 'product_name', label: 'Product', width: 'w-80' },
              { key: 'batch_number', label: 'Batch', type: 'text', editable: true },
              { key: 'expiry_date', label: 'Expiry', type: 'date', editable: true },
              { key: 'ordered_qty', label: 'Ordered', type: 'number', editable: true },
              { key: 'received_qty', label: 'Received', type: 'number', editable: true },
              { key: 'unit_price', label: 'Rate', type: 'number', editable: true },
              { key: 'tax_percent', label: 'GST%', type: 'select', editable: true, options: PURCHASE_CONFIG.TAX_OPTIONS },
              { key: 'quality_status', label: 'Quality', type: 'select', editable: true, options: [
                { value: 'Approved', label: 'Approved' },
                { value: 'Rejected', label: 'Rejected' },
                { value: 'Pending', label: 'Pending' }
              ]},
              { key: 'total', label: 'Total', type: 'currency', calculated: true }
            ]}
          />
        </ContentCard>
      )}
      {errors.items && (
        <p className="text-red-500 text-xs mt-1">{errors.items}</p>
      )}

      {/* Transport Details */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Truck className="w-5 h-5 text-gray-600" />
          <h3 className="text-sm font-semibold text-gray-700">TRANSPORT DETAILS</h3>
        </div>
        <ContentCard title={null} subtitle={null} actions={null}>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Transporter Name</label>
              <input
                type="text"
                value={grn.transport_details.transporter_name}
                onChange={(e) => setGrn(prev => ({ 
                  ...prev, 
                  transport_details: { ...prev.transport_details, transporter_name: e.target.value }
                }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                placeholder="Transporter company name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Vehicle Number</label>
              <input
                type="text"
                value={grn.transport_details.vehicle_no}
                onChange={(e) => setGrn(prev => ({ 
                  ...prev, 
                  transport_details: { ...prev.transport_details, vehicle_no: e.target.value }
                }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                placeholder="Vehicle registration number"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">LR Number</label>
              <input
                type="text"
                value={grn.transport_details.lr_no}
                onChange={(e) => setGrn(prev => ({ 
                  ...prev, 
                  transport_details: { ...prev.transport_details, lr_no: e.target.value }
                }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                placeholder="Lorry receipt number"
              />
            </div>
          </div>
        </ContentCard>
      </div>
    </>
  );

  // Review content for step 2
  const reviewContent = (
    <>
      {/* GRN Summary */}
      <DocumentSummaryTop
        document={grn}
        onDocumentUpdate={(updates) => setGrn(prev => ({ ...prev, ...updates }))}
        documentType="grn"
        showDelivery={false}
        showPayment={false}
        showReference={true}
        customFields={[
          {
            key: 'quality_check.checked_by',
            label: 'Quality Checked By',
            type: 'text',
            placeholder: 'QC Inspector name'
          },
          {
            key: 'quality_check.remarks',
            label: 'Quality Remarks',
            type: 'text',
            placeholder: 'Quality inspection notes'
          }
        ]}
      />

      {/* GRN Preview */}
      <ContentCard title="Goods Receipt Note" subtitle={null} actions={null}>
        <div className="bg-white rounded-lg p-6">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold">GOODS RECEIPT NOTE</h2>
            <p className="text-gray-600">GRN No: {grn.grn_no}</p>
            <p className="text-gray-600">Date: {new Date(grn.grn_date).toLocaleDateString('en-IN')}</p>
            <p className="text-gray-600">PO Reference: {grn.po_reference}</p>
            <p className="text-gray-600">Supplier Invoice: {grn.supplier_invoice_no}</p>
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
                <th className="text-center py-2">Ordered</th>
                <th className="text-center py-2">Received</th>
                <th className="text-right py-2">Rate</th>
                <th className="text-center py-2">Quality</th>
                <th className="text-right py-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(grn.items || []).map((item, index) => {
                const receivedQty = parseFloat(item.received_qty) || 0;
                const unitPrice = parseFloat(item.unit_price) || 0;
                const taxPercent = parseFloat(item.tax_percent) || 0;
                const itemTotal = receivedQty * unitPrice;
                const itemTax = (itemTotal * taxPercent) / 100;
                const totalWithTax = itemTotal + itemTax;
                
                return (
                  <tr key={index} className="border-b border-gray-200">
                    <td className="py-2">{item.product_name}</td>
                    <td className="text-center py-2">{item.batch_number || '-'}</td>
                    <td className="text-center py-2">{item.expiry_date || '-'}</td>
                    <td className="text-center py-2">{item.ordered_qty || '-'}</td>
                    <td className="text-center py-2">{receivedQty}</td>
                    <td className="text-right py-2">{formatCurrency(unitPrice)}</td>
                    <td className="text-center py-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        item.quality_status === 'Approved' ? 'bg-green-100 text-green-800' :
                        item.quality_status === 'Rejected' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {item.quality_status || 'Pending'}
                      </span>
                    </td>
                    <td className="text-right py-2">{formatCurrency(totalWithTax)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-300">
                <td colSpan="7" className="text-right py-2 font-medium">Subtotal:</td>
                <td className="text-right py-2 font-medium">{formatCurrency(grn.gross_amount)}</td>
              </tr>
              <tr>
                <td colSpan="7" className="text-right py-2">Tax:</td>
                <td className="text-right py-2">{formatCurrency(grn.tax_amount)}</td>
              </tr>
              <tr className="border-t border-gray-300">
                <td colSpan="7" className="text-right py-2 text-lg font-bold">Total:</td>
                <td className="text-right py-2 text-lg font-bold">{formatCurrency(grn.final_amount)}</td>
              </tr>
            </tfoot>
          </table>

          {grn.transport_details.transporter_name && (
            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <h4 className="font-medium text-blue-900 mb-2">Transport Details:</h4>
              <div className="grid grid-cols-3 gap-4 text-sm text-blue-800">
                <div>Transporter: {grn.transport_details.transporter_name}</div>
                <div>Vehicle: {grn.transport_details.vehicle_no}</div>
                <div>LR No: {grn.transport_details.lr_no}</div>
              </div>
            </div>
          )}

          {grn.notes && (
            <div className="mt-4 p-4 bg-yellow-50 rounded-lg">
              <h4 className="font-medium text-yellow-900 mb-2">Notes:</h4>
              <p className="text-sm text-yellow-800">{grn.notes}</p>
            </div>
          )}
        </div>
      </ContentCard>
    </>
  );

  return (
    <>
      <EnhancedGlobalDocumentFlow
        documentType="grn"
        documentData={grn}
        onDocumentUpdate={setGrn}
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
                 !!grn.supplier_invoice_no &&
                 grn.items && 
                 grn.items.length > 0;
        }}
        onSave={handleSaveGRN}
        onPrint={handlePrint}
        isSaving={saving}
        
        // Footer totals
        footerTotals={{
          itemCount: grn.items?.length || 0,
          totalAmount: grn.final_amount,
          subtotal: grn.gross_amount,
          tax: grn.tax_amount,
          grandTotal: grn.final_amount
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
            { key: 'Ctrl+S', action: 'Save GRN' },
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
            if (product) {
              handleAddItem(product);
            }
          }}
        />
      )}

      {/* Success Modal */}
      {showSuccessModal && createdGRNData && (
        <GenericSuccessModal
          isOpen={showSuccessModal}
          onClose={() => {
            setShowSuccessModal(false);
            onClose();
          }}
          title="GRN Created!"
          documentNumber={createdGRNData.grnNumber}
          documentId={createdGRNData.grnId}
          documentType="grn"
          customerName={createdGRNData.supplierName}
          totalAmount={createdGRNData.totalAmount}
          onPrint={handlePrint}
          showCopy={true}
        />
      )}
    </>
  );
};

export default EnhancedGRNFlow;