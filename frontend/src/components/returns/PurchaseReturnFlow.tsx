import React, { useState, useEffect, useRef } from 'react';
import {
  Package, X, AlertCircle, CheckCircle,
  RotateCcw, FileText, Building2
} from 'lucide-react';
import {
  SupplierSearch, ModuleHeader,
  Select, NotesSection, useToast,
  ProceedToReviewComponent, StandardDatePicker, ItemsTable, ProductSearch
} from '../global';
import KeyboardShortcuts, { SHORTCUT_SETS } from '../global/ui/KeyboardShortcuts';
import { returnsApi, purchasesApi, metadataApi } from '../../services/api';
import { calculateReturnPreview } from '../../services/calculations/returnCalculationService';
import PurchaseReturnSelector from './ui/PurchaseReturnSelector';
import DebitNotePreview from './ui/DebitNotePreview';
import { BaseReturnItem } from '../returns/types/returnsSharedTypes';
import { usePurchaseReturnSave } from './hooks/usePurchaseReturnSave';
import {
  manualPurchaseReturnItem,
  purchaseReturnItemsForTable,
  updatePurchaseReturnItem,
} from './utils/purchaseReturnProjection';

interface TransportDetails {
  transport_mode: string;
  vehicle_no: string;
  transporter_name: string;
  lr_no: string;
}

interface PurchaseReturnItem extends Omit<BaseReturnItem, 'product_id'> {
  id: string | number;
  product_id: number | string | undefined;
  invoice_item_id?: string | number;
  restock?: boolean;
  disposition?: string;
  [key: string]: any; // Allow for other props during transition
}

interface PurchaseReturnData {
  return_no: string;
  return_date: string;
  supplier_id: string | number;
  supplier_details: any;
  supplier_invoice_id: string | number;
  invoice_number: string;
  invoice_date: string;
  original_invoice: any;
  items: PurchaseReturnItem[];
  return_reason: string;
  return_reason_notes: string;
  return_method: string;
  subtotal_amount: number;
  tax_amount: number;
  total_amount: number;
  debit_note_no: string;
  status: string;
  include_gst: boolean;
  transport_details: TransportDetails;
}

const PurchaseReturnFlowV2 = ({ onClose }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  // Refs for keyboard navigation
  const supplierSearchRef = useRef<any>(null);
  const invoiceSearchRef = useRef<any>(null);
  const calculationRequestRef = useRef(0);

  // Return data state - matching sales return structure
  const [returnData, setReturnData] = useState<PurchaseReturnData>({
    return_no: '',
    return_date: new Date().toISOString().split('T')[0],
    supplier_id: '',
    supplier_details: null,
    supplier_invoice_id: '',
    invoice_number: '',
    invoice_date: '',
    original_invoice: null,
    items: [],
    return_reason: '',
    return_reason_notes: '',
    return_method: 'debit_note', // Default to debit note
    subtotal_amount: 0,
    tax_amount: 0,
    total_amount: 0,
    debit_note_no: '',
    status: 'PENDING',
    include_gst: true,
    transport_details: {
      transport_mode: '',
      vehicle_no: '',
      transporter_name: '',
      lr_no: ''
    }
  });

  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [returnReasons, setReturnReasons] = useState<{ value: string; label: string; }[]>([]);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [showInvoiceSection, setShowInvoiceSection] = useState(true);
  const [returnableInvoices, setReturnableInvoices] = useState<any[]>([]);

  const returnDataRef = useRef(returnData);
  returnDataRef.current = returnData;

  // Load return reasons from system settings
  useEffect(() => {
    const loadReturnReasons = async () => {
      try {
        const response = await metadataApi.getReturnReasons();
        const fetchedReasons = response.data?.purchase_return_reasons || [];

        if (Array.isArray(fetchedReasons) && fetchedReasons.length > 0) {
          setReturnReasons(fetchedReasons);
        } else {
          setReturnReasons([]);
          toast.error('The canonical API returned no purchase return reasons.');
        }
      } catch (error) {
        setReturnReasons([]);
        toast.error('Unable to load purchase return reasons from the canonical API.');
      }
    };

    loadReturnReasons();
  }, [toast]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'r':
            e.preventDefault();
            if (supplierSearchRef.current) {
              supplierSearchRef.current.focus();
            }
            break;
          case 'i':
            e.preventDefault();
            if (invoiceSearchRef.current) {
              invoiceSearchRef.current.focus();
            }
            break;
          case 's':
            e.preventDefault();
            if (currentStep === 1) {
              handleProceedToReview();
            }
            break;
          case 'p':
            // Print only available after generation (in success modal)
            e.preventDefault();
            break;
        }
      }

      if (e.key === 'Escape') {
        if (currentStep === 2) setCurrentStep(1);
        else onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentStep]);

  // Handle invoice selection
  const handleInvoiceSelect = async (invoice) => {
    if (!invoice) return;

    setSelectedInvoice(invoice);
    setReturnData(prev => ({
      ...prev,
      supplier_invoice_id: invoice.supplier_invoice_id || invoice.invoice_id,
      invoice_number: invoice.supplier_invoice_number || invoice.invoice_number,
      invoice_date: invoice.invoice_date,
      original_invoice: invoice
    }));

    // Load invoice items if not already loaded
    try {
      setLoading(true);
      const response = await returnsApi.getSupplierInvoiceReturnableItems(
        invoice.supplier_invoice_id || invoice.invoice_id
      );

      if (response.data.items) {

        const mappedItems = response.data.items.map(item => {
          return {
            ...item,
            id: item.invoice_item_id || item.id,
            invoice_item_id: item.invoice_item_id,
            return_quantity: parseFloat(item.returnable_quantity || 0), // Pre-fill with max returnable
            selected: true, // Pre-select all
            unit_price: parseFloat(item.unit_price || 0),
            tax_percent: item.tax_percent || 18,
            discount_percent: item.discount_percent || 0,
            max_returnable_qty: parseFloat(item.returnable_quantity || 0),
            batch_id: item.batch_id,
            batch_number: item.batch_number,
            disposition: 'RESTOCK',
            restock: true
          };
        });

        setReturnData(prev => ({
          ...prev,
          items: mappedItems
        }));
      }
    } catch (error) {
      toast.error('Failed to load invoice items');
    } finally {
      setLoading(false);
    }
  };

  // Handle supplier selection
  const handleSupplierSelect = async (supplier) => {
    if (!supplier) {
      setSelectedSupplier(null);
      setSelectedInvoice(null);
      setShowInvoiceSection(true);
      setShowManualEntry(false);
      setReturnData(prev => ({
        ...prev,
        supplier_id: '',
        supplier_details: null,
        supplier_invoice_id: '',
        items: []
      }));
      return;
    }

    const fullSupplier = {
      ...supplier,
      supplier_name: supplier.supplier_name || supplier.name,
      address: supplier.address || supplier.billing_address || '',
      phone: supplier.phone || supplier.mobile || '',
      gst_number: supplier.gst_number || supplier.gst_number || ''
    };

    setSelectedSupplier(fullSupplier);
    setSelectedInvoice(null);
    setShowInvoiceSection(true);
    setShowManualEntry(false);

    const supplierId = supplier.supplier_id || supplier.id || supplier.party_id;

    setReturnData(prev => ({
      ...prev,
      supplier_id: supplierId,
      supplier_details: fullSupplier,
      supplier_invoice_id: '',
      items: []
    }));

    // Fetch returnable invoices
    try {
      setLoading(true);
      const response = await purchasesApi.getReturnableInvoices({
        supplier_id: supplierId
      });
      setReturnableInvoices(response.data?.invoices || []);
    } catch (error) {
      toast.error('Failed to fetch supplier invoices');
    } finally {
      setLoading(false);
    }
  };

  // Skip invoice selection for manual entry
  const handleSkipInvoiceSelection = () => {
    setShowInvoiceSection(false);
    setShowManualEntry(true);
    setSelectedInvoice(null);
    setReturnData(prev => ({
      ...prev,
      supplier_invoice_id: '',
      invoice_number: '',
      items: []
    }));
  };

  // Manual purchase returns must resolve a real product and stock batch before
  // an editable row exists. A blank "No Batch" row cannot represent canonical
  // return lineage and previously made quantity validation disagree with the UI.
  const handleAddManualProduct = (product: any) => {
    const productId = product?.product_id;
    const batchId = product?.batch_id;
    if (!productId || !batchId) {
      toast.error('Select a product and an available batch to add this return item.');
      return;
    }
    if (returnData.items.some(item => item.product_id === productId && item.batch_id === batchId)) {
      toast.error('That product batch is already in this return. Update its quantity instead.');
      return;
    }

    try {
      const item = manualPurchaseReturnItem(product);
      setReturnData(prev => ({ ...prev, items: [...prev.items, item as PurchaseReturnItem] }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to add that product batch.');
    }
  };

  // Update return item
  const updateReturnItem = (itemIndex, field, value) => {
    setReturnData(prev => ({
      ...prev,
      items: updatePurchaseReturnItem(prev.items, itemIndex, field, value) as PurchaseReturnItem[]
    }));
  };

  // Use effect to recalculate totals when items change
  React.useEffect(() => {
    const requestId = ++calculationRequestRef.current;
    if (!returnData.items.some(item => item.selected && item.return_quantity > 0)) {
      setReturnData(prev => prev.subtotal_amount === 0 && prev.tax_amount === 0 && prev.total_amount === 0
        ? prev
        : { ...prev, subtotal_amount: 0, tax_amount: 0, total_amount: 0 });
      return;
    }

    const calculate = async () => {
      try {
        const calculation = await calculateReturnPreview(returnDataRef.current, 'purchase');
        if (requestId !== calculationRequestRef.current) return;
        const totals = calculation.totals;
        setReturnData(prev => {
          let calculatedIndex = 0;
          let itemValuesChanged = false;
          const items = prev.items.map(item => {
            if (!item.selected || item.return_quantity <= 0) return item;
            const calculated = calculation.items[calculatedIndex++] || {};
            const totalAmount = Number(calculated.total_amount || 0);
            const taxableAmount = Number(calculated.taxable_amount || 0);
            const taxAmount = Number(calculated.tax_amount || 0);
            if (
              Number(item.total_amount || 0) === totalAmount &&
              Number(item.taxable_amount || 0) === taxableAmount &&
              Number(item.tax_amount || 0) === taxAmount
            ) return item;
            itemValuesChanged = true;
            return { ...item, ...calculated, total_amount: totalAmount, taxable_amount: taxableAmount, tax_amount: taxAmount };
          });
          return {
            ...prev,
            items: itemValuesChanged ? items : prev.items,
            subtotal_amount: totals.subtotal_amount || totals.subtotal || 0,
            tax_amount: totals.tax_amount || totals.total_tax_amount || 0,
            total_amount: totals.total_amount || totals.final_amount || 0
          };
        });
      } catch (error) {
        if (requestId === calculationRequestRef.current) {
          toast.error(error instanceof Error ? error.message : 'Unable to calculate return totals.');
        }
      }
    };
    void calculate();
  }, [returnData.items, returnData.include_gst, returnData.supplier_id, toast]);

  // Remove manual item
  const removeManualItem = (itemIndex) => {
    setReturnData(prev => ({
      ...prev,
      items: prev.items.filter((_, index) => index !== itemIndex)
    }));
  };

  // Validate return
  const validateReturn = () => {
    if (!returnData.supplier_id) {
      toast.error('Please select a supplier');
      return false;
    }

    const hasSelectedItems = returnData.items.some(item =>
      item.selected && item.return_quantity > 0
    );

    if (!hasSelectedItems) {
      toast.error('Please select items to return');
      return false;
    }

    const overLimitItem = returnData.items.find(item => item.selected
      && Number(item.return_quantity) > Number(item.max_returnable_qty ?? item.original_quantity ?? 0));
    if (overLimitItem) {
      toast.error(`${overLimitItem.product_name || 'Return item'} exceeds the available return quantity.`);
      return false;
    }

    if (!returnData.return_reason) {
      toast.error('Please select a return reason');
      return false;
    }

    return true;
  };

  // Proceed to review
  const handleProceedToReview = () => {
    if (validateReturn()) {
      setCurrentStep(2);
      window.scrollTo(0, 0);
    }
  };

  // Offline-first save hook
  const { saving, handleSaveReturn, unavailableReason } = usePurchaseReturnSave();

  // Step 1: Create Return - Sales Return Style
  if (currentStep === 1) {
    return (
      <div className="h-full bg-gray-50">
        <div className="h-full flex flex-col">
          <ModuleHeader
            title="Purchase Return"
            documentNumber={returnData.return_no}
            status="draft"
            icon={RotateCcw}
            iconColor="text-orange-600"
            onClose={onClose}
          />

          {/* Keyboard Shortcuts Bar */}
          <KeyboardShortcuts shortcuts={SHORTCUT_SETS.RETURNS} />

          {/* Content */}
          <div className="flex-1 overflow-y-auto bg-gray-50 p-4 sm:p-6">
            <div className="max-w-6xl mx-auto space-y-6">
              {/* Top Section - Date, Reason, Method - 3-column grid with consistent h-10 heights */}
              <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
                <StandardDatePicker
                  label="Return Date"
                  value={returnData.return_date}
                  onChange={(dateStr) => setReturnData(prev => ({
                    ...prev,
                    return_date: dateStr || new Date().toISOString().split('T')[0]
                  }))}
                  required
                />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Return Reason <span className="text-red-500">*</span>
                  </label>
                  <Select
                    value={returnData.return_reason}
                    onChange={(value) => setReturnData(prev => ({ ...prev, return_reason: value as string }))}
                    options={returnReasons}
                    placeholder="Select reason..."
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Return Method <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={returnData.return_method || 'debit_note'}
                    onChange={(e) => setReturnData(prev => ({ ...prev, return_method: e.target.value }))}
                    className="w-full h-10 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                  >
                    <option value="debit_note">Debit Note (Recommended)</option>
                    <option value="replacement">Replacement</option>
                    <option value="refund">Refund (Requires Approval)</option>
                  </select>
                </div>
              </div>

              {/* Supplier Section - Using global SupplierSearch like Invoice */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wider flex items-center">
                    <Building2 className="w-4 h-4 mr-2" />
                    SUPPLIER
                  </h3>
                </div>
                <SupplierSearch
                  value={selectedSupplier || null}
                  onChange={handleSupplierSelect}
                  displayMode="inline"
                  placeholder="Search supplier by name, phone, or code..."
                  required
                  clearable={true}
                />
              </div>

              {/* Show option to select invoice if skipped */}
              {selectedSupplier && !showInvoiceSection && showManualEntry && (
                <div className="mb-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowInvoiceSection(true);
                      setShowManualEntry(false);
                      setReturnData(prev => ({ ...prev, items: [] }));
                    }}
                    className="min-h-11 rounded-md px-3 text-sm font-medium text-blue-700 hover:bg-blue-50"
                  >
                    ← Back to Invoice Selection
                  </button>
                </div>
              )}

              {/* Invoice Section */}
              {selectedSupplier && showInvoiceSection && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wider flex items-center">
                      <FileText className="w-4 h-4 mr-2" />
                      SELECT SUPPLIER INVOICE
                    </h3>
                    <button
                      type="button"
                      onClick={handleSkipInvoiceSelection}
                      className="min-h-11 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Skip Invoice Selection
                    </button>
                  </div>

                  {/* Show selected invoice if any */}
                  {selectedInvoice && (
                    <div className="bg-blue-50 rounded-lg p-4 flex justify-between items-center mb-4">
                      <div>
                        <h4 className="font-semibold text-gray-900">
                          Invoice #{selectedInvoice.supplier_invoice_number || selectedInvoice.invoice_number}
                        </h4>
                        <p className="text-sm text-gray-600">
                          Date: {new Date(selectedInvoice.invoice_date).toLocaleDateString()}
                        </p>
                        <p className="text-sm text-gray-600">
                          Amount: ₹{(selectedInvoice.total_amount || selectedInvoice.invoice_amount || 0).toLocaleString()}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedInvoice(null);
                          setReturnData(prev => ({
                            ...prev,
                            supplier_invoice_id: '',
                            items: []
                          }));
                        }}
                        className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-red-700 hover:bg-red-50"
                        aria-label="Remove selected invoice"
                        title="Remove selected invoice"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  )}

                  {/* Invoice Selector */}
                  {!selectedInvoice && (
                    <PurchaseReturnSelector
                      invoices={returnableInvoices}
                      onInvoiceSelect={handleInvoiceSelect}
                      loading={loading}
                    />
                  )}
                </div>
              )}

              {/* Return Items */}
              {(selectedInvoice || showManualEntry) && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                      <Package className="w-5 h-5 mr-2 text-blue-600" />
                      Return Items
                    </h3>
                  </div>

                  {showManualEntry && (
                    <div className="mb-4">
                      <label className="mb-1.5 block text-sm font-medium text-gray-700">
                        Add product batch <span className="text-red-500">*</span>
                      </label>
                      <ProductSearch onAddItem={handleAddManualProduct} showBatchSelection />
                      <p className="mt-2 text-xs text-gray-500">
                        A product and available batch are required. The return quantity is edited in the row below.
                      </p>
                    </div>
                  )}

                  {returnData.items.length > 0 ? (
                    <ItemsTable
                      items={purchaseReturnItemsForTable(returnData.items)}
                      onUpdateItem={updateReturnItem}
                      onRemoveItem={showManualEntry ? removeManualItem : undefined}
                    />
                  ) : (
                    <div className="border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-600">
                      Search for a product above, then select its exact batch.
                    </div>
                  )}
                </div>
              )}

              {/* Additional Notes */}
              {(selectedInvoice || showManualEntry) && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <NotesSection
                    value={returnData.return_reason_notes}
                    onChange={(value) => setReturnData(prev => ({ ...prev, return_reason_notes: value }))}
                    placeholder="Add any additional notes about this return..."
                  />
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="bg-white border-t border-gray-200 px-6 py-4">
            <div className="max-w-7xl mx-auto flex justify-between items-center">
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-600">
                  {returnData.items.filter(item => item.selected).length} items selected
                </span>
                <span className="text-lg font-semibold">
                  Total: ₹{returnData.total_amount.toLocaleString()}
                </span>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-11 rounded-md border border-gray-300 px-6 py-2 text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleProceedToReview}
                  disabled={!returnData.items.some(item => item.selected && item.return_quantity > 0)}
                  className="min-h-11 rounded-md bg-blue-600 px-6 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                  Proceed to Review
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Step 2: Review and Confirm
  return (
    <div className="h-full bg-blue-50">
      <div className="h-full flex flex-col">
        <ModuleHeader
          title="Review Purchase Return"
          documentNumber={returnData.return_no}
          status="review"
          icon={CheckCircle}
          iconColor="text-green-600"
          onClose={onClose}
        />

        {/* Content - Following Global UI Pattern (no sidebar) */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto p-6">
            {/* Main Debit Note Preview */}
            <DebitNotePreview
              returnData={returnData}
              supplier={selectedSupplier}
              purchase={selectedInvoice}
            />

            {/* Return Notes Section - Below preview */}
            <div className="mt-6 bg-white rounded-lg shadow-sm border border-blue-200 p-6">
              <NotesSection
                value={returnData.return_reason_notes}
                onChange={(value) => setReturnData(prev => ({
                  ...prev,
                  return_reason_notes: value
                }))}
                placeholder="Add any additional notes about this return..."
                rows={4}
              />
            </div>

            {/* Important Notice - Below notes */}
            <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-yellow-900 mb-1">Canonical submission unavailable</p>
                  <p className="text-yellow-700">
                    {unavailableReason}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer - Using Global Component */}
        <ProceedToReviewComponent
          currentStep={2}
          canProceed={false}
          onBack={() => setCurrentStep(1)}
          onProceed={handleSaveReturn}
          onReset={undefined}
          totalItems={returnData.items.filter(item => item.selected).length}
          totalAmount={returnData.total_amount}
          proceedText="Canonical submission unavailable"
          backText="Back"
          saving={saving}
        />
      </div>
    </div>
  );
};

export default PurchaseReturnFlowV2;
