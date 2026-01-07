import React, { useState, useEffect, useRef } from 'react';
import { Package, FileText, Truck, Calendar, Building2, Plus, Save, Printer, CheckCircle, CreditCard } from 'lucide-react';
import { suppliersApi, productsApi, purchasesApi } from '../../../services/api';
import { searchCache } from '../../../utils/searchCache';
import {
  EnhancedGlobalDocumentFlow,
  DocumentSummaryTop,
  SupplierSearch,
  ProductSearchSimple,

  SupplierCreationModal,
  ProductCreationModal,
  GenericSuccessModal,
  ContentCard,
  useToast,
  NumberInput,
  MonthYearPicker,
  StandardDatePicker
} from '../../global';
import documentNumberGenerator from '../../../services/offline/documents/documentNumberGenerator';
import GRNItemsTable from '../ui/GRNItemsTable';
import { PURCHASE_CONFIG } from '../../../config/purchase.config';

/**
 * EnhancedGRNFlow - Goods Receipt Note using the full global document system
 * Records receipt of goods against purchase orders
 * Updates inventory and validates deliveries
 */
const GRNFlow = ({ onClose, prefilledData = null }: { onClose: any, prefilledData?: any }) => {
  const toast = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdGRNData, setCreatedGRNData] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<any>({});

  const productSearchRef = useRef<any>(null);

  // GRN data state
  const [grn, setGrn] = useState<any>({
    grn_no: '',
    grn_date: new Date().toISOString().split('T')[0],
    po_reference: prefilledData?.po_reference || '',
    supplier_id: prefilledData?.supplier_id || '',
    supplier_name: prefilledData?.supplier_name || '',
    supplier_details: prefilledData?.supplier_details || null,
    supplier_invoice_no: '',
    supplier_invoice_date: new Date().toISOString().split('T')[0],
    items: prefilledData?.items || [],
    quality_check: {
      checked_by: '',
      check_date: new Date().toISOString().split('T')[0],
      quality_status: 'Approved',
      remarks: ''
    },
    gross_amount: 0,
    tax_amount: 0,
    net_amount: 0,
    total_amount: 0,
    notes: prefilledData?.notes || '',
    status: 'received'
  });

  const [selectedSupplier, setSelectedSupplier] = useState<any>(prefilledData?.supplier_details || null);

  // Generate GRN number on mount
  useEffect(() => {
    const generateAndSetGRNNumber = async () => {
      try {
        const grnNumber = await documentNumberGenerator.generateGRNNumber();
        setGrn(prev => ({ ...prev, grn_no: grnNumber }));
      } catch (error) {
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
        total_amount: 0
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
      total_amount: netAmount
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
      manufacturer: product.manufacturer || '',
      ordered_qty: 0,
      received_qty: 1,
      unit: product.unit || product.uom || '',  // No default unit
      unit_price: product.unit_price || (product.mrp || 0) * 0.7,
      mrp: product.mrp || 0,
      selling_price: product.sale_price || product.selling_price || product.mrp || 0,
      tax_percent: product.tax_percent || 12,
      discount_percent: 0,
      free_quantity: 0,
      pack_type: 'STRIP',
      pack_size: 10,
      packages_per_box: 10,
      quality_status: 'Approved',
      total: product.unit_price || 0
    };

    setGrn(prev => ({
      ...prev,
      items: [...(prev.items || []), newItem]
    }));

    if (productSearchRef.current) {
      setTimeout(() => productSearchRef.current?.focus(), 100);
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
        quality_check: grn.quality_check,
        notes: grn.notes
      };

      const response = await purchasesApi.createGRN(grnData);

      if (response && response.data) {
        const grnNumber = response.data.grn_no || grn.grn_no;

        setCreatedGRNData({
          grnNumber: grnNumber,
          grnId: response.data.grn_id || response.data.id,
          supplierName: selectedSupplier?.supplier_name || grn.supplier_name,
          totalAmount: grn.total_amount
        });

        setShowSuccessModal(true);
        toast.success(`GRN ${grnNumber} created successfully!`);

        searchCache.clear();
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to create GRN';
      toast.error(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const validateGRN = () => {
    const errors: any = {};

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
          <h3 className="text-sm font-semibold text-gray-700">RECEIPT INFORMATION</h3>
        </div>
        <ContentCard title={undefined} subtitle={undefined} actions={undefined}>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <StandardDatePicker
                label="GRN Date"
                value={grn.grn_date}
                onChange={(value) => setGrn(prev => ({ ...prev, grn_date: value }))}
                required
              />
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
          onCreateNew={() => {
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
            setShowProductModal(true);
          }}
          showBatchSelection={false}
          ref={productSearchRef}
          placeholder="Search products received..."
        />
      </div>

      {/* Items Table - Enhanced */}
      {grn.items && grn.items.length > 0 && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <Package className="w-5 h-5 text-gray-600" />
            <h3 className="text-sm font-semibold text-gray-700">RECEIVED ITEMS</h3>
          </div>
          <GRNItemsTable
            items={grn.items.map(item => ({
              ...item,
              quantity: item.received_qty || item.quantity,
              unit_price: item.unit_price,
              tax: item.tax_percent,
              discount_percent: item.discount_percent || 0,
              free_quantity: item.free_quantity || 0,
              mrp: item.mrp || 0,
              batch_number: item.batch_number || '',
              expiry_date: item.expiry_date || '',
            }))}
            onUpdateItem={(index, field, value) => {
              const mappedField = field === 'unit_price' ? 'unit_price' :
                field === 'tax' ? 'tax_percent' :
                  field === 'quantity' ? 'received_qty' :
                    field;
              handleUpdateItem(index, mappedField, value);
            }}
            onRemoveItem={handleRemoveItem}
          />
        </>
      )}
      {errors.items && (
        <p className="text-red-500 text-xs mt-1">{errors.items}</p>
      )}

    </>
  );

  // Review content for step 2
  const reviewContent = (
    <>
      {/* Quality Check & Transport Details */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle className="w-5 h-5 text-gray-600" />
          <h3 className="text-sm font-semibold text-gray-700">QUALITY CHECK & VERIFICATION</h3>
        </div>
        <ContentCard title={undefined} subtitle={undefined} actions={undefined}>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Checked By</label>
              <input
                type="text"
                value={grn.quality_check?.checked_by || ''}
                onChange={(e) => setGrn(prev => ({
                  ...prev,
                  quality_check: { ...prev.quality_check, checked_by: e.target.value }
                }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                placeholder="QC Inspector name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Quality Status</label>
              <select
                value={grn.quality_check?.quality_status || 'Approved'}
                onChange={(e) => setGrn(prev => ({
                  ...prev,
                  quality_check: { ...prev.quality_check, quality_status: e.target.value }
                }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
              >
                <option value="Approved">Approved</option>
                <option value="Partial">Partial Approval</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>
            <div>
              <StandardDatePicker
                label="Check Date"
                value={grn.quality_check?.check_date || new Date().toISOString().split('T')[0]}
                onChange={(value) => setGrn(prev => ({
                  ...prev,
                  quality_check: { ...prev.quality_check, check_date: value }
                }))}
              />
            </div>
            <div className="col-span-3">
              <label className="block text-sm font-medium text-gray-600 mb-1">Quality Remarks</label>
              <textarea
                value={grn.quality_check?.remarks || ''}
                onChange={(e) => setGrn(prev => ({
                  ...prev,
                  quality_check: { ...prev.quality_check, remarks: e.target.value }
                }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                placeholder="Quality inspection notes..."
                rows={2}
              />
            </div>
          </div>
        </ContentCard>
      </div>

      {/* GRN Preview with Actions */}
      <ContentCard
        title="Goods Receipt Note Preview"
        subtitle={undefined}
        actions={
          <div className="flex gap-2">
            <button
              onClick={handleSaveGRN}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save GRN'}
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
            >
              <Printer className="w-4 h-4" />
              Print
            </button>
          </div>
        }
      >
        <div className="bg-white rounded-lg p-6">
          {/* Company Branding Header */}
          <div className="text-center mb-6 pb-4 border-b-2 border-gray-300">
            <h1 className="text-3xl font-bold text-green-600 mb-2">PHARMA SOLUTIONS PVT. LTD.</h1>
            <p className="text-sm text-gray-600">Wholesale Pharmaceutical Distributor</p>
            <p className="text-sm text-gray-600">GST: {localStorage.getItem('company_gst_number') || ''} | Drug License: {localStorage.getItem('drug_license') || ''}</p>
            <p className="text-sm text-gray-600">{localStorage.getItem('company_address') || ''}</p>
          </div>

          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold">GOODS RECEIPT NOTE</h2>
            <p className="text-gray-600">GRN No: <span className="font-semibold">{grn.grn_no}</span></p>
            <p className="text-gray-600">Date: {new Date(grn.grn_date).toLocaleDateString('en-IN')}</p>
            <p className="text-gray-600">PO Reference: {grn.po_reference}</p>
            <p className="text-gray-600">Supplier Invoice: {grn.supplier_invoice_no}</p>
          </div>

          <div className="grid grid-cols-2 gap-6 mb-6">
            {/* From (Company) */}
            <div className="p-4 bg-green-50 rounded-lg">
              <h3 className="font-semibold mb-2 text-green-900">Receiver:</h3>
              <p className="text-green-900 font-medium">Pharma Solutions Pvt. Ltd.</p>
              <p className="text-green-800 text-sm">{localStorage.getItem('company_address_line1') || ''}</p>
              <p className="text-green-800 text-sm">{localStorage.getItem('company_address_line2') || ''}</p>
              <p className="text-green-800 text-sm">Warehouse: Main Branch</p>
            </div>

            {/* From (Supplier) */}
            <div className="p-4 bg-gray-50 rounded-lg">
              <h3 className="font-semibold mb-2 text-gray-700">Supplier:</h3>
              <p className="text-gray-900 font-medium">{selectedSupplier?.supplier_name}</p>
              {selectedSupplier?.phone && <p className="text-gray-600 text-sm">Phone: {selectedSupplier.phone}</p>}
              {selectedSupplier?.gst_number && <p className="text-gray-600 text-sm">GST: {selectedSupplier.gst_number}</p>}
              {selectedSupplier?.address && <p className="text-gray-600 text-sm">{selectedSupplier.address}</p>}
            </div>
          </div>

          <table className="w-full mb-6">
            <thead>
              <tr className="border-b-2 border-gray-300">
                <th className="text-left py-2">Item</th>
                <th className="text-center py-2">Pack</th>
                <th className="text-center py-2">Batch</th>
                <th className="text-center py-2">Expiry</th>
                <th className="text-center py-2">Ordered</th>
                <th className="text-center py-2">Received</th>
                <th className="text-center py-2">Free</th>
                <th className="text-right py-2">MRP</th>
                <th className="text-right py-2">Rate</th>
                <th className="text-right py-2">Tax</th>
                <th className="text-center py-2">Status</th>
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
                    <td className="text-center py-2 text-sm">
                      {item.pack_type || 'STRIP'} {item.pack_size || 10}×{item.packages_per_box || 10}
                    </td>
                    <td className="text-center py-2">{item.batch_number || '-'}</td>
                    <td className="text-center py-2">
                      {item.expiry_date ? new Date(item.expiry_date).toLocaleDateString('en-IN', { month: '2-digit', year: '2-digit' }) : '-'}
                    </td>
                    <td className="text-center py-2">{item.ordered_qty || '-'}</td>
                    <td className="text-center py-2 font-medium">{receivedQty}</td>
                    <td className="text-center py-2">{item.free_quantity || 0}</td>
                    <td className="text-right py-2">{formatCurrency(item.mrp)}</td>
                    <td className="text-right py-2">{formatCurrency(unitPrice)}</td>
                    <td className="text-right py-2">{taxPercent}%</td>
                    <td className="text-center py-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${item.quality_status === 'Approved' ? 'bg-green-100 text-green-800' :
                        item.quality_status === 'Rejected' ? 'bg-red-100 text-red-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                        {item.quality_status || 'Pending'}
                      </span>
                    </td>
                    <td className="text-right py-2 font-medium">{formatCurrency(totalWithTax)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-300">
                <td colSpan={11} className="text-right py-2 font-medium">Subtotal:</td>
                <td className="text-right py-2 font-medium">{formatCurrency(grn.gross_amount)}</td>
              </tr>
              <tr>
                <td colSpan={11} className="text-right py-2">Tax:</td>
                <td className="text-right py-2">{formatCurrency(grn.tax_amount)}</td>
              </tr>
              <tr className="border-t border-gray-300">
                <td colSpan={11} className="text-right py-2 text-lg font-bold">Total Amount:</td>
                <td className="text-right py-2 text-lg font-bold">{formatCurrency(grn.total_amount)}</td>
              </tr>
            </tfoot>
          </table>

          {grn.quality_check?.checked_by && (
            <div className="mt-6 p-4 bg-green-50 rounded-lg">
              <h4 className="font-medium text-green-900 mb-2">Quality Verification:</h4>
              <div className="grid grid-cols-3 gap-4 text-sm text-green-800">
                <div>Checked By: {grn.quality_check.checked_by}</div>
                <div>Status: {grn.quality_check.quality_status || 'Approved'}</div>
                <div>Date: {new Date(grn.quality_check.check_date || grn.grn_date).toLocaleDateString('en-IN')}</div>
              </div>
              {grn.quality_check.remarks && (
                <p className="mt-2 text-sm text-green-700">Remarks: {grn.quality_check.remarks}</p>
              )}
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
          totalAmount: grn.total_amount,
          subtotal: grn.gross_amount,
          tax: grn.tax_amount,
          grandTotal: grn.total_amount
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

export default GRNFlow;