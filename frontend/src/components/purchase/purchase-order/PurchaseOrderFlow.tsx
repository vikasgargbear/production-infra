import React, { useRef } from 'react';
import { Package, FileText, Building2, ShieldCheck } from 'lucide-react';
import {
  GlobalDocumentFlow,
  SupplierSearch,
  ProductSearch,
  ItemsTable,
  SupplierCreationModal,
  ProductCreationModal,
  GenericSuccessModal,
  ContentCard,
  StandardDatePicker
} from '../../global';
import { usePurchaseOrderLogic } from './hooks';
import { toast } from 'react-toastify';
import { useCompany } from '../../../contexts/CompanyContext';
import { exactDecimalUnits } from '../../../utils/exactDecimal';

const hasPositiveExactQuantity = (value: unknown, label: string): boolean => {
  try {
    return exactDecimalUnits(value, label, { scale: 6, maximumWholeDigits: 14 }) > 0n;
  } catch {
    return false;
  }
};

/**
 * PurchaseOrderFlow - Purchase Order using the full global document system
 * 
 * REFACTORED: Now uses usePurchaseOrderLogic hook for all state and handlers.
 * This component handles only the UI/JSX rendering.
 * 
 * Key features:
 * - Creates purchase orders to request goods from suppliers
 * - Uses /purchase-orders/ endpoint
 */

const PurchaseOrderFlow = ({ onClose, prefilledData = null }: { onClose: any, prefilledData?: any }) => {
  const productSearchRef = useRef<any>(null);
  const { companyInfo } = useCompany();

  // Use the extracted hook for all state and handlers
  const {
    // State
    purchaseOrder,
    setPurchaseOrder,
    documentPolicy,
    branches,
    branchId,
    setBranchId,
    branchLoadError,
    selectedSupplier,
    currentStep,
    setCurrentStep,
    saving,
    preparingReview,
    errors,
    purchaseOrderValidationError,
    canonicalReview,
    executedResourceId,

    // Modal states
    showSupplierModal,
    setShowSupplierModal,
    showProductModal,
    setShowProductModal,
    showSuccessModal,
    setShowSuccessModal,

    // Data
    createdPOData,

    // Handlers
    handleSupplierSelect,
    handleAddItem,
    handleUpdateItem,
    handleRemoveItem,
    prepareForReview,
    handleSavePurchaseOrder,
    handlePrint
  } = usePurchaseOrderLogic({ prefilledData, onClose });

  // ==================== JSX RENDERING ====================


  // Create content for step 1
  const createContent = (
    <>
      {/* PO Details - Date tiles */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-5 h-5 text-gray-600" />
          <h3 className="text-sm font-semibold text-gray-700">ORDER INFORMATION</h3>
        </div>
        <ContentCard title={undefined} subtitle={undefined} actions={undefined}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <label className="text-sm font-medium text-gray-700">
              Branch
              <select
                value={branchId}
                onChange={(event) => setBranchId(event.target.value)}
                className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3"
              >
                <option value="">Select branch</option>
                {branches.map(branch => (
                  <option key={branch.branch_id} value={branch.branch_id}>
                    {branch.branch_code} — {branch.branch_name}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <StandardDatePicker
                label="PO Date"
                value={purchaseOrder.po_date}
                onChange={(value) => setPurchaseOrder(prev => ({ ...prev, po_date: value }))}
                required
              />
            </div>
            <div>
              <StandardDatePicker
                label="Expected Delivery"
                value={purchaseOrder.expected_delivery_date}
                onChange={(value) => setPurchaseOrder(prev => ({ ...prev, expected_delivery_date: value }))}
              />
            </div>
          </div>
          {branchLoadError && (
            <p role="alert" className="mt-3 text-sm text-red-700">{branchLoadError}</p>
          )}
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
            <h3 className="text-sm font-semibold text-gray-700">PRODUCTS</h3>
          </div>
          <button
            onClick={() => setShowProductModal(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
          >
            Create Product
          </button>
        </div>
        <ProductSearch
          onAddItem={handleAddItem}
          onCreateProduct={(searchQuery) => {
            setShowProductModal(true);
          }}
          showBatchSelection={false}
          ref={productSearchRef}
          placeholder="Search products by name, code, or scan barcode..."
        />
      </div>

      {/* Items Table - Enhanced like Purchase Entry */}
      {purchaseOrder.items && purchaseOrder.items.length > 0 && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <Package className="w-5 h-5 text-gray-600" />
            <h3 className="text-sm font-semibold text-gray-700">ORDER ITEMS</h3>
          </div>
          <ItemsTable
            items={purchaseOrder.items.map(item => ({
              ...item,
              unit_price: item.unit_price,
              gst_percent: item.tax_percent,
              discount_percent: item.discount_percent ?? '',
              free_quantity: item.free_quantity ?? ''
            }))}
            onUpdateItem={(index, field, value) => {
              const mappedField = field === 'unit_price' ? 'unit_price' :
                field === 'tax' ? 'tax_percent' :
                  field;
              handleUpdateItem(index, mappedField, value);
            }}
            onRemoveItem={handleRemoveItem}
            showTotals={false}
            title=""
            preserveExactDecimals
          />

          {purchaseOrder.items.map((item, index) => item.free_quantity !== ''
            && item.free_quantity !== null
            && item.free_quantity !== undefined
            && hasPositiveExactQuantity(item.free_quantity, `Item ${index + 1} free quantity`) && (
            <label key={String(item.id)} className="mt-3 block border border-gray-200 bg-white p-3 text-sm">
              <span className="mb-2 block font-medium text-gray-800">
                Free-supply tax treatment for {item.product_name}
              </span>
              <select
                value={item.free_supply_tax_treatment || ''}
                onChange={(event) => handleUpdateItem(index, 'free_supply_tax_treatment', event.target.value)}
                className="min-h-11 w-full border border-gray-300 bg-white px-3"
              >
                <option value="">Select canonical treatment</option>
                <option value="excluded_from_taxable_value">Exclude free quantity from taxable value</option>
                <option value="included_at_unit_rate">Include free quantity at unit rate</option>
              </select>
            </label>
          ))}

          <div className="mt-4 grid gap-3 border border-gray-200 bg-gray-50 p-4 sm:grid-cols-3">
            <label className="text-sm font-medium text-gray-700">
              Document discount
              <input
                value={purchaseOrder.discount_amount}
                onChange={(event) => setPurchaseOrder(prev => ({ ...prev, discount_amount: event.target.value }))}
                inputMode="decimal"
                placeholder="0.00"
                className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3"
              />
            </label>
            <label className="text-sm font-medium text-gray-700">
              Freight charge
              <input
                value={purchaseOrder.freight_charges}
                onChange={(event) => setPurchaseOrder(prev => ({ ...prev, freight_charges: event.target.value }))}
                inputMode="decimal"
                placeholder="Enter 0.00 when none"
                className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3"
              />
            </label>
            <div className="border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
              Exact subtotal, GST and supplier commitment are calculated by the canonical backend when you select Continue.
            </div>
          </div>
        </>
      )}
      {errors.items && (
        <p className="text-red-500 text-xs mt-1">{errors.items}</p>
      )}
      {(errors.submission || purchaseOrderValidationError) && (
        <div role="alert" className="mt-4 border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {errors.submission || purchaseOrderValidationError}
        </div>
      )}
    </>
  );

  // The active review is derived only from the immutable canonical prepare.
  const reviewContent = canonicalReview ? (
    <div className="space-y-5" data-testid="canonical-immutable-preview">
      <div className="border border-blue-200 bg-blue-50 px-4 py-3">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
          <div>
            <h3 className="font-semibold text-blue-950">Authoritative backend review</h3>
            <p className="mt-1 text-sm text-blue-900">
              GST classification, tax amounts and supplier commitment below came from the immutable canonical prepare. The PO number is assigned only after approval.
            </p>
            <p aria-label="Canonical command ID" className="mt-2 break-all font-mono text-xs text-blue-800">
              Command: {canonicalReview.commandRequestId}
            </p>
            {documentPolicy && <p className="mt-2 text-xs text-blue-800">
              Server policy: {documentPolicy.default_price_basis.replace('_', ' ')} pricing · {documentPolicy.default_tax_charge_mechanism.replace('_', ' ')} tax mechanism · {documentPolicy.default_rounding_policy} rounding
            </p>}
          </div>
        </div>
      </div>

      <ContentCard title="Purchase order parties" subtitle={undefined} actions={undefined}>
        <div className="grid gap-4 md:grid-cols-2">
          <section className="border border-gray-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Buyer</p>
            <p className="mt-2 font-medium text-gray-900">{companyInfo?.name}</p>
            <p className="mt-1 text-sm text-gray-600">{companyInfo?.address}</p>
            <p className="text-sm text-gray-600">GSTIN: {companyInfo?.gst_number || 'Not configured'}</p>
            <p className="mt-2 break-all font-mono text-xs text-gray-500">Branch: {canonicalReview.branchId}</p>
          </section>
          <section className="border border-gray-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Supplier</p>
            <p className="mt-2 font-medium text-gray-900">{selectedSupplier?.supplier_name}</p>
            {selectedSupplier?.primary_phone && <p className="mt-1 text-sm text-gray-600">Phone: {selectedSupplier.primary_phone}</p>}
            <p className="text-sm text-gray-600">GSTIN: {selectedSupplier?.gst_number || 'Unregistered'}</p>
            <p className="mt-2 break-all font-mono text-xs text-gray-500">Supplier: {canonicalReview.supplierId}</p>
          </section>
        </div>
      </ContentCard>

      <ContentCard title="Reviewed line facts" subtitle="Rates and quantities are the exact facts submitted for backend calculation." actions={undefined}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-300 text-left text-xs uppercase tracking-wide text-gray-600">
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">UOM identity</th>
                <th className="px-3 py-2 text-right">Billed</th>
                <th className="px-3 py-2 text-right">Free</th>
                <th className="px-3 py-2 text-right">Quoted rate</th>
              </tr>
            </thead>
            <tbody>
              {purchaseOrder.items.map(item => (
                <tr key={String(item.id)} className="border-b border-gray-200">
                  <td className="px-3 py-3 font-medium text-gray-900">{item.product_name}</td>
                  <td className="px-3 py-3 font-mono text-xs text-gray-600">{item.uom_conversion_id}</td>
                  <td className="px-3 py-3 text-right">{item.quantity}</td>
                  <td className="px-3 py-3 text-right">{item.free_quantity}</td>
                  <td className="px-3 py-3 text-right">₹{String(item.unit_price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ContentCard>

      <ContentCard title="Backend totals" subtitle="These values—not browser arithmetic—are bound to the approval hash." actions={undefined}>
        <dl className="ml-auto grid max-w-md grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <dt className="text-gray-600">CGST</dt><dd className="text-right">₹{canonicalReview.cgstTotal}</dd>
          <dt className="text-gray-600">SGST</dt><dd className="text-right">₹{canonicalReview.sgstTotal}</dd>
          <dt className="text-gray-600">IGST</dt><dd className="text-right">₹{canonicalReview.igstTotal}</dd>
          <dt className="text-gray-600">Cess</dt><dd className="text-right">₹{canonicalReview.cessTotal}</dd>
          <dt className="border-t border-gray-300 pt-3 font-semibold text-gray-900">Supplier commitment</dt>
          <dd className="border-t border-gray-300 pt-3 text-right text-lg font-bold text-blue-700">₹{canonicalReview.supplierCommitment}</dd>
        </dl>
      </ContentCard>
    </div>
  ) : (
    <div role="alert" className="border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
      The authoritative backend preview is unavailable. Return to edit and prepare the purchase order again.
    </div>
  );

  return (
    <>
      <GlobalDocumentFlow
        documentType="purchase-order"
        documentData={purchaseOrder as any}
        onDocumentUpdate={setPurchaseOrder as any}
        onClose={onClose}

        // Two-step flow
        currentStep={currentStep}
        onStepChange={setCurrentStep}

        // Step content
        createContent={createContent}
        reviewContent={reviewContent}

        // Validation & Actions
        canProceedToReview={() => {
          return purchaseOrderValidationError === null && !preparingReview;
        }}
        onProceedToReview={prepareForReview}
        onSave={handleSavePurchaseOrder}
        saveLabel={executedResourceId ? 'Reconcile Purchase Order' : 'Approve & Create PO'}
        isSaving={saving}

        // Footer totals
        footerTotals={{
          itemCount: purchaseOrder.items?.length || 0,
          totalAmount: purchaseOrder.total_amount,
          subtotal: purchaseOrder.gross_amount,
          tax: purchaseOrder.tax_amount,
          // freightCharges not supported in global footer interface
          grandTotal: purchaseOrder.total_amount
        }}

        // Keyboard shortcuts
        keyboardShortcuts={{
          1: [
            { key: 'Esc', action: 'Close' }
          ],
          2: [
            { key: 'Ctrl+S', action: 'Save PO' },
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
          }}
        />
      )}

      {showProductModal && (
        <ProductCreationModal
          show={showProductModal}
          onClose={() => setShowProductModal(false)}
          onProductCreated={(product) => {
            setShowProductModal(false);
            toast.info(`Product ${product.product_code} is a draft and was not added. Complete classification and activation before purchasing it.`);
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

export default PurchaseOrderFlow;
