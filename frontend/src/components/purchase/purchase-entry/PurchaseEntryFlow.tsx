import React, { useRef } from 'react';
import { Package, FileText, Building2 } from 'lucide-react';
import {
  GlobalDocumentFlow,
  SupplierSearch,
  ProductSearch,
  SupplierCreationModal,
  ProductCreationModal,
  GenericSuccessModal,
  ContentCard,
  StandardFormInput,
  StandardDatePicker,
  NumberInput,
  useToast
} from '../../global';
import PDFUploadModal from '../../global/modals/PDFUploadModal';
import PDFVerificationFlow from '../PDFVerificationFlow';
import PurchaseItemEditModal from '../ui/PurchaseItemEditModal';
import { usePurchaseEntryLogic, PurchaseItem, PurchaseData } from './hooks';
import { PURCHASE_ENTRY_SUBMIT_UNAVAILABLE_REASON } from './hooks/usePurchaseEntrySave';
import CanonicalWriteNotice from '../../global/ui/CanonicalWriteNotice';
import {
  addExactDecimals,
  compareExactDecimals,
  formatExactDecimal,
  normalizeExactDecimal,
} from '../../../utils/exactDecimal';
import { formatCalendarDate } from '../../../utils/calendarDate';

const formatPurchaseExpiry = (value: unknown): string => {
  if (typeof value !== 'string') return 'Unavailable';
  const match = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(value);
  if (match) return `${match[2]}/${match[1]}`;
  if (/^\d{2}\/\d{4}$/.test(value)) return value;
  return 'Unavailable';
};

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

const numberInputValue = (value: unknown): number | null => {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

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
    purchaseDraftReadinessError,

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
    handleUpdateItem,
    handleRemoveItem,
    handleSavePurchase,
    handlePrint,
    handleVerificationComplete,
    formatCurrency
  } = usePurchaseEntryLogic({ prefilledData, onClose });

  // ==================== JSX RENDERING ====================


  // Create content for step 1
  const createContent = (
    <>
      {/* PO Linking Banner */}
      {purchase.purchase_order_id && (
        <div className="mb-6 bg-white border border-gray-200 rounded-lg p-4">
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
      <div className="mb-6 bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-gray-600" />
            <div>
              <p className="text-sm font-medium text-gray-800">Quick Import from PDF</p>
              <p className="text-xs text-gray-600">Upload supplier invoice to auto-fill details</p>
            </div>
          </div>
          <div>
            <button
              onClick={() => setShowPDFUpload(true)}
              className="min-h-11 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
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
          placeholder="Enter supplier invoice number"
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

      <div className="mb-6 grid grid-cols-3 gap-4 border border-gray-200 bg-gray-50 p-4">
        {([
          ['freight_charges', 'Freight charges'],
          ['insurance_charges', 'Insurance charges'],
          ['other_charges', 'Other charges'],
        ] as const).map(([field, label]) => (
          <label key={field} className="text-sm font-medium text-gray-700">
            {label}
            <input
              value={purchase[field]}
              onChange={(event) => setPurchase(prev => ({
                ...prev,
                [field]: event.target.value,
                gross_amount: '', discount_amount: '', tax_amount: '', round_off: '', net_amount: '', total_amount: '',
              }))}
              inputMode="decimal"
              placeholder="Enter 0.00 when none"
              className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3"
            />
          </label>
        ))}
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
                  const totalAmount = item.total_amount || '0.00';

                  // Format expiry date if exists
                  const expiryDisplay = formatPurchaseExpiry(item.expiry_date);

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
                          value={numberInputValue(item.quantity)}
                          onChange={(val) => handleUpdateItem(index, 'quantity', val)}
                          className="w-16 px-1 py-1 text-xs text-center border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </td>
                      <td className="text-center py-2 px-2">
                        <NumberInput
                          value={numberInputValue(item.free_quantity)}
                          onChange={(val) => handleUpdateItem(index, 'free_quantity', val)}
                          className="w-14 px-1 py-1 text-xs text-center border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          min={0}
                        />
                      </td>
                      <td className="text-right py-2 px-2">
                        <NumberInput
                          value={numberInputValue(item.unit_price)}
                          onChange={(val) => handleUpdateItem(index, 'unit_price', val)}
                          className="w-20 px-1 py-1 text-xs text-right border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          min={0}
                          step={0.01}
                        />
                      </td>
                      <td className="text-right py-2 px-2">
                        <NumberInput
                          value={numberInputValue(item.mrp)}
                          onChange={(val) => handleUpdateItem(index, 'mrp', val)}
                          className="w-20 px-1 py-1 text-xs text-right border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          min={0}
                          step={0.01}
                        />
                      </td>
                      <td className="text-right py-2 px-2">
                        <NumberInput
                          value={numberInputValue(item.selling_price)}
                          onChange={(val) => handleUpdateItem(index, 'selling_price', val)}
                          className="w-20 px-1 py-1 text-xs text-right border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          min={0}
                          step={0.01}
                        />
                      </td>
                      <td className="text-center py-2 px-2">
                        <NumberInput
                          value={numberInputValue(item.discount_percent)}
                          onChange={(val) => handleUpdateItem(index, 'discount_percent', val)}
                          className="w-14 px-1 py-1 text-xs text-center border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          min={0}
                          max={100}
                          step={0.01}
                        />
                      </td>
                      <td className="text-center py-2 px-2">
                        <span className="text-xs font-medium text-gray-800" title="Canonical product or verified invoice GST rate">
                          {item.tax_percent === '' || item.tax_percent === null || item.tax_percent === undefined
                            ? 'Unavailable'
                            : `${item.tax_percent}%`}
                        </span>
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
      {purchaseDraftReadinessError && (
        <div role="alert" className="mt-4 border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {purchaseDraftReadinessError}
        </div>
      )}
    </>
  );

  // Review content for step 2 - Simplified like Sales Order
  const reviewContent = (
    <>
      <CanonicalWriteNotice
        title="Purchase posting is not available yet"
        description={PURCHASE_ENTRY_SUBMIT_UNAVAILABLE_REASON}
        className="mb-4"
      />
      {/* Clean Purchase Preview - Matching Sales Order Style */}
      <div id="purchase-print-area" className="bg-white rounded-lg border border-gray-200 p-6">
        {/* Compact Header Section */}
        <div className="mb-4 pb-3 border-b border-gray-200">
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
              <div className="bg-gray-50 px-4 py-3 rounded-lg border border-gray-200">
                <p className="text-sm font-semibold text-gray-900">
                  Supplier Invoice: {purchase.supplier_invoice_number}
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  Date: {formatCalendarDate(purchase.invoice_date)}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-6 border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          Supplier-invoice settlement is not inferred in this receipt draft. Post payment separately through the reviewed canonical supplier-payment flow.
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
                const displayFact = (value: unknown): string => (
                  value === '' || value === null || value === undefined ? 'Unavailable' : String(value)
                );

                // Format expiry date if exists
                const expiryDisplay = formatPurchaseExpiry(item.expiry_date);

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
                    <td className="text-center py-2 px-2 text-xs font-medium">{displayFact(item.quantity)}</td>
                    <td className="text-center py-2 px-2 text-xs text-gray-600">{displayFact(item.free_quantity)}</td>
                    <td className="text-right py-2 px-2 text-xs font-medium">{item.unit_price === '' ? 'Unavailable' : formatCurrency(item.unit_price)}</td>
                    <td className="text-right py-2 px-2 text-xs">{item.mrp === '' || item.mrp === undefined ? 'Unavailable' : formatCurrency(item.mrp)}</td>
                    <td className="text-right py-2 px-2 text-xs">{item.selling_price === '' || item.selling_price === undefined ? 'Unavailable' : formatCurrency(item.selling_price)}</td>
                    <td className="text-center py-2 px-2 text-xs text-gray-600">{item.discount_percent === '' || item.discount_percent === undefined ? 'Unavailable' : `${item.discount_percent}%`}</td>
                    <td className="text-center py-2 px-2 text-xs text-gray-600">{item.tax_percent === '' || item.tax_percent === undefined ? 'Unavailable' : `${item.tax_percent}%`}</td>
                    <td className="text-right py-2 px-2 text-xs">{item.tax_amount === '' || item.tax_amount === undefined ? 'Pending API' : formatCurrency(item.tax_amount)}</td>
                    <td className="text-right py-2 px-2 text-xs font-bold text-green-600">{item.total_amount === '' || item.total_amount === undefined ? 'Pending API' : formatCurrency(item.total_amount)}</td>
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
                  const gstBreakdown: Record<string, { taxable: string; tax: string }> = {};
                  (purchase.items || []).forEach(item => {
                    let taxPercent: string;
                    try {
                      if (item.tax_percent === '' || item.tax_percent === null || item.tax_percent === undefined) return;
                      taxPercent = normalizeExactDecimal(item.tax_percent, 'Purchase GST rate', { scale: 6, maximumWholeDigits: 3 });
                    } catch {
                      return;
                    }
                    if (compareExactDecimals(taxPercent, '0', 'Purchase GST rate', { scale: 6, maximumWholeDigits: 3 }) > 0) {
                      if (!gstBreakdown[taxPercent]) {
                        gstBreakdown[taxPercent] = { taxable: '0.00', tax: '0.00' };
                      }
                      if (item.taxable_amount === '' || item.taxable_amount === undefined || item.tax_amount === '' || item.tax_amount === undefined) return;
                      gstBreakdown[taxPercent].taxable = addExactDecimals([gstBreakdown[taxPercent].taxable, item.taxable_amount], 'Purchase GST taxable total', { scale: 2, maximumWholeDigits: 20 });
                      gstBreakdown[taxPercent].tax = addExactDecimals([gstBreakdown[taxPercent].tax, item.tax_amount], 'Purchase GST tax total', { scale: 2, maximumWholeDigits: 20 });
                    }
                  });

                  const gstBands = Object.keys(gstBreakdown).sort((a, b) => compareExactDecimals(a, b, 'Purchase GST band', { scale: 6, maximumWholeDigits: 3 }));

                  if (gstBands.length === 0) {
                    return <p className="text-xs text-gray-500">No GST applicable</p>;
                  }

                  return gstBands.map(band => (
                    <div key={band} className="flex justify-between text-xs">
                      <span className="text-gray-600">
                        GST @ {formatExactDecimal(band, 'Purchase GST band', { scale: 6, maximumWholeDigits: 3 })}%
                        <span className="text-[10px] ml-1 text-gray-400">
                          ({formatCurrency(gstBreakdown[band].taxable)})
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
              {compareExactDecimals(purchase.discount_amount, '0.00', 'Purchase discount', { scale: 2, maximumWholeDigits: 20 }) > 0 && (
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
          return purchaseDraftReadinessError === null;
        }}
        onSave={handleSavePurchase}
        isSaving={saving}

        // Footer totals
        footerTotals={{
          itemCount: purchase.items?.length || 0,
          totalAmount: purchase.total_amount === '' ? undefined : purchase.total_amount,
          subtotal: purchase.gross_amount === '' ? undefined : purchase.gross_amount,
          tax: purchase.tax_amount === '' ? undefined : purchase.tax_amount,
          roundOff: purchase.round_off === '' ? undefined : purchase.round_off,
          grandTotal: purchase.total_amount === '' ? undefined : purchase.total_amount
        }}

        // Keyboard shortcuts
        keyboardShortcuts={{
          1: [
            { key: 'Esc', action: 'Close' }
          ],
          2: [
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
              supplier_name: data.supplier_name || '',
              supplier_gst_number: data.supplier_gst_number || '',
              supplier_address: data.supplier_address || '',
              supplier_id: data.supplier_id || null,
              invoice_number: data.invoice_number || '',
              invoice_date: data.invoice_date || '',
              items: (data.items || []).map(item => ({
                product_id: item.product_id || null,
                uom_conversion_id: item.uom_conversion_id || '',
                product_name: item.product_name || '',
                hsn_code: item.hsn_code || '',
                batch_number: item.batch_number || '',
                expiry_date: item.expiry_date || '',
                manufacturing_date: item.manufacturing_date || '',
                quantity: item.quantity ?? '',
                free_quantity: item.free_quantity ?? '',
                unit_price: item.unit_price ?? '',
                mrp: item.mrp ?? '',
                selling_price: item.selling_price ?? item.sale_price ?? '',
                discount_percent: item.discount_percent ?? '',
                tax_percent: item.tax_percent ?? '',
                pack_type: item.pack_type ?? '',
                pack_size: item.pack_size ?? ''
              })),
              gross_amount: data.subtotal ?? data.gross_amount ?? '',
              tax_amount: data.tax_amount ?? '',
              total_amount: data.total_amount ?? ''
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
                ),
                gross_amount: '', discount_amount: '', tax_amount: '', round_off: '', net_amount: '', total_amount: '',
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
