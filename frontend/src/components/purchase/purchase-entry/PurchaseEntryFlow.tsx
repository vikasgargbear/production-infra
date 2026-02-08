import React, { useRef } from 'react';
import { Package, FileText, Building2 } from 'lucide-react';
import {
  GlobalDocumentFlow,
  DocumentSummaryTop,
  SupplierSearch,
  ProductSearch,
  SupplierCreationModal,
  ProductCreationModal,
  GenericSuccessModal,
  ContentCard,
  StandardFormInput,
  StandardDatePicker,
  SplitPayment,
  NumberInput,
  useToast
} from '../../global';
import { PURCHASE_CONFIG } from '../../../config/purchase.config';
import PDFUploadModal from '../../global/modals/PDFUploadModal';
import BulkUploadInline from '../BulkUploadInline';
import PDFVerificationFlow from '../PDFVerificationFlow';
import PurchaseItemEditModal from '../ui/PurchaseItemEditModal';
import { usePurchaseEntryLogic, PurchaseItem, PurchaseData } from './hooks';

/**
 * PurchaseEntryFlow - Purchase Entry using the full global document system
 * 
 * REFACTORED: Now uses usePurchaseEntryLogic hook for all state and handlers.
 * This component handles only the UI/JSX rendering.
 * 
 * Key features:
 * - Records RECEIVED invoices (not creating orders)
 * - Updates inventory immediately
 * - Records payment obligations
 * - Uses /purchases/ endpoint
 */

interface PurchaseEntryFlowProps {
  onClose: () => void;
  prefilledData?: Partial<PurchaseData> | null;
}

const PurchaseEntryFlow: React.FC<PurchaseEntryFlowProps> = ({ onClose, prefilledData = null }) => {
  const productSearchRef = useRef(null);
  const toast = useToast();

  // Use the extracted hook for all state and handlers
  const {
    // State
    purchase,
    setPurchase,
    selectedSupplier,
    currentStep,
    setCurrentStep,
    saving,
    errors,

    // Modal states
    showSupplierModal,
    setShowSupplierModal,
    showProductModal,
    setShowProductModal,
    showSuccessModal,
    setShowSuccessModal,
    showPDFUpload,
    setShowPDFUpload,
    showVerificationFlow,
    setShowVerificationFlow,
    showItemEditModal,
    setShowItemEditModal,

    // Data
    extractedPDFData,
    setExtractedPDFData,
    newProductToAdd,
    setNewProductToAdd,
    currentEditItem,
    setCurrentEditItem,
    createdPurchaseData,

    // Handlers
    handleSupplierSelect,
    handleAddItem,
    handleSaveItemFromModal,
    handleBulkUpload,
    handleUpdateItem,
    handleRemoveItem,
    handleSavePurchase,
    handlePrint,
    handlePDFUpload,
    handleVerificationComplete,
    formatCurrency
  } = usePurchaseEntryLogic({ prefilledData, onClose });

  // ==================== JSX RENDERING ====================


  // Create content for step 1
  const createContent = (
    <>
      {/* PO Linking Banner */}
      {purchase.purchase_order_id && (
        <div className="mb-6 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <Package className="w-5 h-5 text-green-600" />
            <div>
              <p className="text-sm font-medium text-green-800">
                Recording receipt for PO #{purchase.po_number}
              </p>
              <p className="text-xs text-green-600">
                Items are pre-filled from the purchase order. Adjust quantities as received.
              </p>
            </div>
          </div>
        </div>
      )}

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
            <button
              onClick={() => setShowPDFUpload(true)}
              className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors"
            >
              Upload PDF
            </button>
          </div>
        </div>
      </div>

      {/* Invoice Details - Standardized Components */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StandardFormInput
          label="Supplier Invoice Number"
          value={purchase.supplier_invoice_number}
          onChange={(e) => setPurchase(prev => ({ ...prev, supplier_invoice_number: e.target.value }))}
          placeholder="Auto-generates if empty"
          error={errors.invoice_number}
        />
        <StandardDatePicker
          label="Invoice Date"
          value={purchase.invoice_date}
          onChange={(value) => setPurchase(prev => ({ ...prev, invoice_date: value }))}
        />
        <StandardDatePicker
          label="Delivery Date"
          value={purchase.delivery_date}
          onChange={(value) => setPurchase(prev => ({ ...prev, delivery_date: value }))}
        />
      </div>

      {/* Supplier Section - Clean and Separate */}
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
        <ContentCard title={undefined} subtitle={undefined} actions={undefined}>
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
        </ContentCard>
      </div>

      {/* Products Section - With Label and Create Button Outside */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-gray-600" />
            <h3 className="text-sm font-semibold text-gray-700">PRODUCTS</h3>
          </div>
          <div className="flex gap-2">
            <BulkUploadInline
              onProductsUploaded={handleBulkUpload}
            />
            <button
              onClick={() => setShowProductModal(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
            >
              Create Product
            </button>
          </div>
        </div>
        <ProductSearch
          onAddItem={handleAddItem}
          onCreateProduct={(searchQuery) => {
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
        <div className="overflow-visible relative" style={{ minHeight: '300px', zIndex: 50 }}>
          <div className="flex items-center gap-2 mb-3">
            <Package className="w-5 h-5 text-gray-600" />
            <h3 className="text-sm font-semibold text-gray-700">PURCHASE ITEMS</h3>
            <span className="ml-auto text-sm text-gray-500">{purchase.items.length} items</span>
          </div>

          {/* Simple Purchase Items Table - Standard Layout */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-200 bg-gray-50">
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-700">Product</th>
                  <th className="text-center py-2 px-2 text-xs font-medium text-gray-700">Expiry</th>
                  <th className="text-center py-2 px-2 text-xs font-medium text-gray-700">Qty</th>
                  <th className="text-center py-2 px-2 text-xs font-medium text-gray-700">Free</th>
                  <th className="text-right py-2 px-2 text-xs font-medium text-gray-700">Cost</th>
                  <th className="text-right py-2 px-2 text-xs font-medium text-gray-700">MRP</th>
                  <th className="text-right py-2 px-2 text-xs font-medium text-gray-700">S.Price</th>
                  <th className="text-center py-2 px-2 text-xs font-medium text-gray-700">Disc%</th>
                  <th className="text-center py-2 px-2 text-xs font-medium text-gray-700">Tax%</th>
                  <th className="text-right py-2 px-2 text-xs font-medium text-gray-700">Amount</th>
                  <th className="text-center py-2 px-2 text-xs font-medium text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {purchase.items.map((item, index) => {
                  const quantity = parseFloat(String(item.quantity)) || 0;
                  const freeQty = parseFloat(String(item.free_quantity)) || 0;
                  const cost = parseFloat(String(item.unit_price)) || parseFloat(String(item.unit_price)) || 0;
                  const mrp = parseFloat(String(item.mrp)) || 0;
                  const sellingPrice = parseFloat(String(item.selling_price)) || 0;
                  const discountPercent = parseFloat(String(item.discount_percent)) || 0;
                  const taxPercent = parseFloat(String(item.tax_percent)) || 0;

                  // Calculate amounts
                  const baseAmount = quantity * cost;
                  const discountAmount = (baseAmount * discountPercent) / 100;
                  const discountedAmount = baseAmount - discountAmount;
                  const taxAmount = (discountedAmount * taxPercent) / 100;
                  const totalAmount = discountedAmount + taxAmount;

                  // Format expiry date if exists
                  const expiryDisplay = (() => {
                    if (!item.expiry_date) return '-';

                    // Handle YYYY-MM format from MonthYearPicker
                    if (typeof item.expiry_date === 'string' && item.expiry_date.includes('-')) {
                      const parts = item.expiry_date.split('-');
                      if (parts.length === 2) {
                        return `${parts[1]}/${parts[0]}`; // Convert YYYY-MM to MM/YYYY
                      }
                    }

                    // Handle MM/YYYY format
                    if (typeof item.expiry_date === 'string' && item.expiry_date.includes('/')) {
                      return item.expiry_date;
                    }

                    // Try to parse as date
                    try {
                      const date = new Date(item.expiry_date);
                      if (!isNaN(date.getTime())) {
                        return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
                      }
                    } catch (e) { }

                    return item.expiry_date || '-';
                  })();

                  return (
                    <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-3">
                        <div>
                          <p className="text-xs font-medium">{item.product_name}</p>
                          {item.hsn_code && (
                            <p className="text-[10px] text-gray-500">HSN: {item.hsn_code}</p>
                          )}
                        </div>
                      </td>
                      <td className="text-center py-2 px-2 text-xs">{expiryDisplay}</td>
                      <td className="text-center py-2 px-2">
                        <NumberInput
                          value={item.quantity ?? null}
                          onChange={(val) => handleUpdateItem(index, 'quantity', val)}
                          className="w-16 px-1 py-1 text-xs text-center border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </td>
                      <td className="text-center py-2 px-2">
                        <NumberInput
                          value={item.free_quantity ?? null}
                          onChange={(val) => handleUpdateItem(index, 'free_quantity', val)}
                          className="w-14 px-1 py-1 text-xs text-center border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          min={0}
                        />
                      </td>
                      <td className="text-right py-2 px-2">
                        <NumberInput
                          value={item.unit_price || item.unit_price || null}
                          onChange={(val) => handleUpdateItem(index, 'unit_price', val)}
                          className="w-20 px-1 py-1 text-xs text-right border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          min={0}
                          step={0.01}
                        />
                      </td>
                      <td className="text-right py-2 px-2">
                        <NumberInput
                          value={item.mrp ?? null}
                          onChange={(val) => handleUpdateItem(index, 'mrp', val)}
                          className="w-20 px-1 py-1 text-xs text-right border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          min={0}
                          step={0.01}
                        />
                      </td>
                      <td className="text-right py-2 px-2">
                        <NumberInput
                          value={item.selling_price ?? null}
                          onChange={(val) => handleUpdateItem(index, 'selling_price', val)}
                          className="w-20 px-1 py-1 text-xs text-right border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          min={0}
                          step={0.01}
                        />
                      </td>
                      <td className="text-center py-2 px-2">
                        <NumberInput
                          value={item.discount_percent ?? null}
                          onChange={(val) => handleUpdateItem(index, 'discount_percent', val)}
                          className="w-14 px-1 py-1 text-xs text-center border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          min={0}
                          max={100}
                          step={0.01}
                        />
                      </td>
                      <td className="text-center py-2 px-2">
                        <input
                          type="number"
                          value={item.tax_percent || ''}
                          onChange={(e) => handleUpdateItem(index, 'tax_percent', e.target.value)}
                          className="w-14 px-1 py-1 text-xs text-center border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          min="0"
                          max="100"
                          step="0.01"
                        />
                      </td>
                      <td className="text-right py-2 px-2 text-xs font-bold text-green-600">{formatCurrency(totalAmount)}</td>
                      <td className="text-center py-2 px-2">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => {
                              setCurrentEditItem({ ...item, index });
                              setShowItemEditModal(true);
                            }}
                            className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                            title="Edit"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleRemoveItem(index)}
                            className="p-1 text-red-600 hover:bg-red-50 rounded"
                            title="Delete"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {errors.items && (
        <p className="text-red-500 text-xs mt-1">{errors.items}</p>
      )}
    </>
  );

  // Review content for step 2 - Simplified like Sales Order
  const reviewContent = (
    <>
      {/* Clean Purchase Preview - Matching Sales Order Style */}
      <div id="purchase-print-area" className="bg-white rounded-lg shadow-sm border border-green-200 p-6">
        {/* Compact Header Section */}
        <div className="mb-4 pb-3 border-b-2 border-green-300">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Purchase Entry</h2>
              <div className="text-sm">
                <span className="text-gray-600">Purchase No:</span>
                <span className="ml-2 font-semibold text-gray-900">{purchase.purchase_number}</span>
              </div>
            </div>

            {/* Supplier Invoice Info with Date - Right Side */}
            <div className="text-right">
              <div className="bg-green-50 px-4 py-3 rounded-lg border border-green-200">
                <p className="text-sm font-semibold text-gray-900">
                  Supplier Invoice: {purchase.supplier_invoice_number}
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  Date: {new Date(purchase.invoice_date).toLocaleDateString('en-IN')}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Payment Information - Properly Contained */}
        <div className="mb-6 bg-gray-50 px-4 py-3 rounded-lg border border-gray-200">
          <SplitPayment
            totalAmount={purchase.total_amount || 0}
            payments={purchase.payment_methods?.length > 0 ? purchase.payment_methods : [{ id: '1', method: 'cash', amount: purchase.total_amount || 0 }]}
            onChange={(payments) => {
              setPurchase(prev => ({
                ...prev,
                payment_methods: payments
              }));
            }}
            onPaymentStatusChange={(status) => {
              setPurchase(prev => ({ ...prev, payment_status: status }));
            }}
            allowPartial={true}
            className=""
          />
        </div>

        {/* Simplified Supplier Section with GST and DL */}
        <div className="mb-6">
          <div className="bg-gray-50 px-4 py-3 rounded-lg border border-gray-200">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-sm font-medium text-gray-600 mb-1">Supplier</h3>
                <p className="text-base font-semibold text-gray-900">{selectedSupplier?.supplier_name}</p>
                <div className="mt-1 space-y-0.5">
                  {selectedSupplier?.gst_number && (
                    <p className="text-sm text-gray-600">GST: {selectedSupplier.gst_number}</p>
                  )}
                  {selectedSupplier?.drug_license_number && (
                    <p className="text-sm text-gray-600">D.L. No: {selectedSupplier.drug_license_number}</p>
                  )}
                </div>
              </div>
              {selectedSupplier?.phone && (
                <div className="text-right">
                  <p className="text-sm text-gray-600">{selectedSupplier.phone}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Clean Items Table */}
        <div className="mb-6">
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-gray-200 bg-gray-50">
                <th className="text-left py-2 px-2 text-xs font-medium text-gray-700">Item</th>
                <th className="text-center py-2 px-2 text-xs font-medium text-gray-700">Expiry</th>
                <th className="text-center py-2 px-2 text-xs font-medium text-gray-700">Qty</th>
                <th className="text-center py-2 px-2 text-xs font-medium text-gray-700">Free</th>
                <th className="text-right py-2 px-2 text-xs font-medium text-gray-700">Cost</th>
                <th className="text-right py-2 px-2 text-xs font-medium text-gray-700">MRP</th>
                <th className="text-right py-2 px-2 text-xs font-medium text-gray-700">Rate</th>
                <th className="text-center py-2 px-2 text-xs font-medium text-gray-700">Disc%</th>
                <th className="text-center py-2 px-2 text-xs font-medium text-gray-700">Tax%</th>
                <th className="text-right py-2 px-2 text-xs font-medium text-gray-700">Tax Amt</th>
                <th className="text-right py-2 px-2 text-xs font-medium text-gray-700">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(purchase.items || []).map((item, index) => {
                const quantity = parseFloat(String(item.quantity)) || 0;
                const freeQty = parseFloat(String(item.free_quantity)) || 0;
                const cost = parseFloat(String(item.unit_price)) || parseFloat(String(item.unit_price)) || 0;
                const mrp = parseFloat(String(item.mrp)) || 0;
                const sellingPrice = parseFloat(String(item.selling_price)) || 0;
                const discountPercent = parseFloat(String(item.discount_percent)) || 0;
                const taxPercent = parseFloat(String(item.tax_percent)) || 0;

                // Calculate amounts
                const baseAmount = quantity * cost;
                const discountAmount = (baseAmount * discountPercent) / 100;
                const discountedAmount = baseAmount - discountAmount;
                const taxAmount = (discountedAmount * taxPercent) / 100;
                const totalWithTax = discountedAmount + taxAmount;

                // Format expiry date if exists
                const expiryDisplay = (() => {
                  if (!item.expiry_date) return '-';

                  // Handle YYYY-MM format from MonthYearPicker
                  if (typeof item.expiry_date === 'string' && item.expiry_date.includes('-')) {
                    const parts = item.expiry_date.split('-');
                    if (parts.length === 2) {
                      return `${parts[1]}/${parts[0]}`; // Convert YYYY-MM to MM/YYYY
                    }
                  }

                  // Handle MM/YYYY format
                  if (typeof item.expiry_date === 'string' && item.expiry_date.includes('/')) {
                    return item.expiry_date;
                  }

                  // Try to parse as date
                  try {
                    const date = new Date(item.expiry_date);
                    if (!isNaN(date.getTime())) {
                      return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
                    }
                  } catch (e) { }

                  return item.expiry_date || '-';
                })();

                return (
                  <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-2">
                      <div>
                        <p className="text-xs font-medium">{item.product_name}</p>
                        {item.hsn_code && (
                          <p className="text-[10px] text-gray-500">HSN: {item.hsn_code}</p>
                        )}
                      </div>
                    </td>
                    <td className="text-center py-2 px-2 text-xs text-gray-600">{expiryDisplay}</td>
                    <td className="text-center py-2 px-2 text-xs font-medium">{quantity}</td>
                    <td className="text-center py-2 px-2 text-xs text-gray-600">{freeQty > 0 ? freeQty : '-'}</td>
                    <td className="text-right py-2 px-2 text-xs font-medium">{formatCurrency(cost)}</td>
                    <td className="text-right py-2 px-2 text-xs">{formatCurrency(mrp)}</td>
                    <td className="text-right py-2 px-2 text-xs">{formatCurrency(sellingPrice)}</td>
                    <td className="text-center py-2 px-2 text-xs text-gray-600">{discountPercent}%</td>
                    <td className="text-center py-2 px-2 text-xs text-gray-600">{taxPercent}%</td>
                    <td className="text-right py-2 px-2 text-xs">{formatCurrency(taxAmount)}</td>
                    <td className="text-right py-2 px-2 text-xs font-bold text-green-600">{formatCurrency(totalWithTax)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Clean Summary Section */}
        <div className="border-t-2 border-gray-200 pt-4">
          <div className="flex justify-between">
            {/* GST Breakdown - Left Side */}
            <div className="w-64">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">GST Breakdown</h4>
              <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                {(() => {
                  const gstBreakdown = {};
                  (purchase.items || []).forEach(item => {
                    const taxPercent = parseFloat(String(item.tax_percent)) || 0;
                    const quantity = parseFloat(String(item.quantity)) || 0;
                    const cost = parseFloat(String(item.unit_price)) || parseFloat(String(item.unit_price)) || 0;
                    const discountPercent = parseFloat(String(item.discount_percent)) || 0;

                    const baseAmount = quantity * cost;
                    const discountAmount = (baseAmount * discountPercent) / 100;
                    const discountedAmount = baseAmount - discountAmount;
                    const taxAmount = (discountedAmount * taxPercent) / 100;

                    if (taxPercent > 0) {
                      if (!gstBreakdown[taxPercent]) {
                        gstBreakdown[taxPercent] = { taxable: 0, tax: 0 };
                      }
                      gstBreakdown[taxPercent].taxable += discountedAmount;
                      gstBreakdown[taxPercent].tax += taxAmount;
                    }
                  });

                  const gstBands = Object.keys(gstBreakdown).sort((a, b) => parseFloat(a) - parseFloat(b));

                  if (gstBands.length === 0) {
                    return <p className="text-xs text-gray-500">No GST applicable</p>;
                  }

                  return gstBands.map(band => (
                    <div key={band} className="flex justify-between text-xs">
                      <span className="text-gray-600">
                        GST @ {band}%
                        <span className="text-[10px] ml-1 text-gray-400">
                          (₹{gstBreakdown[band].taxable.toFixed(2)})
                        </span>
                      </span>
                      <span className="font-medium text-gray-800">
                        {formatCurrency(gstBreakdown[band].tax)}
                      </span>
                    </div>
                  ));
                })()}
                <div className="pt-2 mt-2 border-t border-gray-200">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-gray-700">Total GST</span>
                    <span className="font-bold text-gray-900">{formatCurrency(purchase.tax_amount)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Total Summary - Right Side */}
            <div className="w-64">
              <div className="flex justify-between py-2">
                <span className="text-sm text-gray-600">Subtotal</span>
                <span className="text-sm font-medium">{formatCurrency(purchase.gross_amount)}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-sm text-gray-600">Tax</span>
                <span className="text-sm">{formatCurrency(purchase.tax_amount)}</span>
              </div>
              {purchase.discount_amount > 0 && (
                <div className="flex justify-between py-2">
                  <span className="text-sm text-gray-600">Discount</span>
                  <span className="text-sm text-red-600">-{formatCurrency(purchase.discount_amount)}</span>
                </div>
              )}
              <div className="flex justify-between py-3 border-t border-gray-200 mt-2">
                <span className="text-base font-semibold text-gray-900">Total Amount</span>
                <span className="text-base font-bold text-green-600">{formatCurrency(purchase.total_amount)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      <GlobalDocumentFlow
        documentType="purchase"
        documentData={purchase}
        onDocumentUpdate={setPurchase as any}
        onClose={onClose}

        // Two-step flow
        currentStep={currentStep}
        onStepChange={setCurrentStep}

        // Step content
        createContent={createContent}
        reviewContent={reviewContent}

        // Additional actions for header
        additionalActions={[]}

        // Validation & Actions
        canProceedToReview={() => {
          return !!selectedSupplier &&
            purchase.items &&
            purchase.items.length > 0;
        }}
        onSave={handleSavePurchase}
        onPrint={handlePrint}
        isSaving={saving}
        saveLabel="Save Purchase"

        // Footer totals
        footerTotals={{
          itemCount: purchase.items?.length || 0,
          totalAmount: purchase.total_amount || 0,
          subtotal: purchase.gross_amount || 0,
          tax: purchase.tax_amount || 0,
          roundOff: purchase.round_off || 0,
          grandTotal: purchase.total_amount || 0
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
          isOpen={showSupplierModal}
          onClose={() => setShowSupplierModal(false)}
          onSupplierCreated={(supplier) => {
            handleSupplierSelect(supplier);
            setShowSupplierModal(false);
            toast.success('Supplier created successfully');
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
            // Optionally auto-add the product
            if (product) {
              handleAddItem(product);
            }
          }}
        />
      )}

      {showPDFUpload && (
        <PDFUploadModal
          isOpen={showPDFUpload}
          onClose={() => setShowPDFUpload(false)}
          onDataExtracted={(data) => {

            // Store extracted data and show verification flow
            const extractedPDFData = {
              supplier_name: data.supplier_name || data.vendor_name || '',
              supplier_gst_number: data.supplier_gst_number || data.vendor_gst_number || '',
              supplier_address: data.supplier_address || data.vendor_address || '',
              supplier_id: data.supplier_id || null,
              invoice_number: data.invoice_number || '',
              invoice_date: data.invoice_date || '',
              items: (data.items || []).map(item => ({
                product_id: item.product_id || null,
                product_name: item.product_name || item.name || '',
                hsn_code: item.hsn_code || '',
                batch_number: item.batch_number || item.batch_number || '',
                expiry_date: item.expiry_date || '',
                manufacturing_date: item.manufacturing_date || '',
                quantity: Number(item.quantity) || 0,
                free_quantity: Number(item.free_quantity) || 0,
                unit_price: Number(item.unit_price) || 0,
                mrp: Number(item.mrp) || 0,
                selling_price: Number(item.selling_price || item.sale_price || item.mrp) || 0,
                discount_percent: Number(item.discount_percent) || 0,
                tax_percent: Number(item.tax_percent || item.gst_percent) || 0,
                pack_type: item.pack_type || 'STRIP',
                pack_size: item.pack_size || 10
              })),
              gross_amount: data.subtotal || data.gross_amount || 0,
              tax_amount: data.tax_amount || 0,
              total_amount: data.total_amount || data.total_amount || 0
            };

            setExtractedPDFData(extractedPDFData);
            setShowPDFUpload(false); // Close PDF upload modal
            setShowVerificationFlow(true); // Show verification flow

            toast.success('PDF parsed! Please verify the extracted information.');
          }}
        />
      )}

      {/* PDF Verification Flow Modal */}
      {showVerificationFlow && extractedPDFData && (
        <PDFVerificationFlow
          extractedData={extractedPDFData}
          onComplete={handleVerificationComplete}
          onCancel={() => {
            setShowVerificationFlow(false);
            setExtractedPDFData(null);
          }}
        />
      )}

      {/* Success Modal with ShareDocument */}
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
          enableShare={true}
          partyDetails={{
            name: selectedSupplier?.supplier_name,
            phone: selectedSupplier?.phone,
            email: selectedSupplier?.email,
            supplier_id: selectedSupplier?.supplier_id
          }}
          documentData={{
            supplierInvoiceNumber: purchase.supplier_invoice_number,
            paymentStatus: purchase.payment_status,
            itemCount: purchase.items?.length || 0,
            date: purchase.invoice_date
          }}
        />
      )}

      {/* Purchase Item Edit Modal - Opens when product is selected or edit clicked */}
      {showItemEditModal && (
        <PurchaseItemEditModal
          isOpen={showItemEditModal}
          onClose={() => {
            setShowItemEditModal(false);
            setNewProductToAdd(null);
            setCurrentEditItem(null);
          }}
          item={currentEditItem || newProductToAdd}
          onSave={(updatedItem) => {
            if (currentEditItem && currentEditItem.index !== undefined) {
              // Editing existing item - replace the entire item
              setPurchase(prev => ({
                ...prev,
                items: (prev.items || []).map((item, i) =>
                  i === currentEditItem.index ? (updatedItem as PurchaseItem) : item
                )
              }));
              setCurrentEditItem(null);
            } else {
              // Adding new item
              handleSaveItemFromModal(updatedItem);
            }
            setShowItemEditModal(false);
          }}
          title={currentEditItem ? "Edit Purchase Item" : "Add Purchase Item - Enter Batch Details"}
          isNewItem={!currentEditItem}
        />
      )}
    </>
  );
};

export default PurchaseEntryFlow;