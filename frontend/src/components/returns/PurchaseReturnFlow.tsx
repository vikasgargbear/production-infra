import React, { useState, useEffect, useRef } from 'react';
import {
  Package, X, AlertCircle, CheckCircle,
  RotateCcw, FileText, Building2
} from 'lucide-react';
import {
  SupplierSearch, ModuleHeader,
  Select, NotesSection, useToast,
  ProceedToReviewComponent, StandardDatePicker
} from '../global';
import KeyboardShortcuts, { SHORTCUT_SETS } from '../global/ui/KeyboardShortcuts';
import { purchasesApi, metadataApi } from '../../services/api';
import { canonicalReturnsApi } from '../../services/api/modules/returns/canonicalReturns.api';
import { calculateReturnPreview } from '../../services/calculations/returnCalculationService';
import PurchaseReturnSelector from './ui/PurchaseReturnSelector';
import DebitNotePreview from './ui/DebitNotePreview';
import { BaseReturnItem } from '../returns/types/returnsSharedTypes';
import { usePurchaseReturnSave } from './hooks/usePurchaseReturnSave';
import { updatePurchaseReturnItem } from './utils/purchaseReturnProjection';
import { prepareCanonicalPurchaseReturn, type AwaitingIndependentApproval } from './utils/canonicalReturnLifecycle';
import { clientUuid } from '../../utils/clientUuid';
import { returnFlowOwnsEscape } from './utils/returnKeyboardBoundary';
import { CANONICAL_PURCHASE_RETURN_REASON_VALUES } from './utils/canonicalReturnCommand';
import { addExactDecimals, compareExactDecimals, exactDecimalUnits } from '../../utils/exactDecimal';
import { canonicalBusinessContextApi } from '../../services/api/modules/org/canonicalBusinessContext.api';
import {
  authoritativeReturnQuantity,
  authoritativeReturnRate,
  formatReturnMoney,
  hasExactReturnPreview,
  sameReturnMoney,
} from './utils/returnDecimal';

const purchaseQuantityOptions = { scale: 6, maximumWholeDigits: 14 } as const;
const purchaseRateOptions = { scale: 6, maximumWholeDigits: 14 } as const;

interface TransportDetails {
  transport_mode: string;
  distance_km: string;
  vehicle_number?: string;
  vehicle_type?: string;
  transporter_party_id?: string;
  transport_document_number?: string;
  transport_document_date?: string;
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
  subtotal_amount: string;
  tax_amount: string;
  total_amount: string;
  debit_note_no: string;
  status: string;
  include_gst: boolean;
  branch_id: string;
  gst_tax_treatment: '' | 'commercial_only' | 'statutory';
  supported_gst_treatments: Array<'commercial_only' | 'statutory'>;
  supplier_destinations: any[];
  supplier_destination_address_id: string;
  statutory_gstr2b_credit_notes: any[];
  supplier_credit_note_portal_line_id: string;
  transport_details: TransportDetails;
}

const isPositiveDecimalText = (value: unknown) => {
  try { return exactDecimalUnits(value, 'Purchase return quantity', purchaseQuantityOptions) > 0n; }
  catch { return false; }
};

const PurchaseReturnFlowV2 = ({ onClose }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [preparedApproval, setPreparedApproval] = useState<AwaitingIndependentApproval | null>(null);
  const prepareKeyRef = useRef(`erp-web-purchase-return-prepare:${clientUuid()}`);
  const toast = useToast();

  // Refs for keyboard navigation
  const supplierSearchRef = useRef<any>(null);
  const invoiceSearchRef = useRef<any>(null);
  const calculationRequestRef = useRef(0);

  // Return data state - matching sales return structure
  const [returnData, setReturnData] = useState<PurchaseReturnData>({
    return_no: '',
    return_date: '',
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
    subtotal_amount: '0.00',
    tax_amount: '0.00',
    total_amount: '0.00',
    debit_note_no: '',
    status: 'PENDING',
    include_gst: true,
    branch_id: '',
    gst_tax_treatment: '',
    supported_gst_treatments: [],
    supplier_destinations: [],
    supplier_destination_address_id: '',
    statutory_gstr2b_credit_notes: [],
    supplier_credit_note_portal_line_id: '',
    transport_details: {
      transport_mode: 'in_person',
      distance_km: '0'
    }
  });

  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [returnReasons, setReturnReasons] = useState<{ value: string; label: string; }[]>([]);
  const [showInvoiceSection, setShowInvoiceSection] = useState(true);
  const [returnableInvoices, setReturnableInvoices] = useState<any[]>([]);

  const returnDataRef = useRef(returnData);
  returnDataRef.current = returnData;
  const hasPositiveReturnLine = returnData.items.some(item => item.selected && (
    isPositiveDecimalText(item.return_paid_qty)
    || isPositiveDecimalText(item.return_free_qty)
  ));

  useEffect(() => {
    let active = true;
    if (returnData.return_date) return undefined;
    void canonicalBusinessContextApi.get().then(context => {
      if (active) setReturnData(previous => ({
        ...previous,
        return_date: context.business_date,
      }));
    }).catch(error => {
      if (active) toast.error(
        error instanceof Error ? error.message : 'Unable to load the organization business date.',
      );
    });
    return () => { active = false; };
  }, [returnData.return_date, toast]);

  // Load return reasons from system settings
  useEffect(() => {
    const loadReturnReasons = async () => {
      try {
        const response = await metadataApi.getReturnReasons();
        const fetchedReasons = (response.data?.purchase_return_reasons || []).filter(
          (reason: { value: string }) => CANONICAL_PURCHASE_RETURN_REASON_VALUES.includes(reason.value),
        );

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
      if (e.defaultPrevented) return;
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

      if (returnFlowOwnsEscape(e)) {
        if (preparedApproval) return;
        if (currentStep === 2) setCurrentStep(1);
        else onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentStep, preparedApproval, onClose]);

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
      const response = await canonicalReturnsApi.getPurchaseContext(
        String(invoice.supplier_invoice_id || invoice.invoice_id),
        returnDataRef.current.return_date,
      );
      const context = response.data;

      if (context.lines.length) {
        const mappedItems: PurchaseReturnItem[] = context.lines.map((item, index) => {
          const label = `Purchase return context lines[${index}]`;
          const billed = authoritativeReturnQuantity(
            item.returnable_billed_quantity,
            `${label}.returnable_billed_quantity`,
          );
          const free = authoritativeReturnQuantity(
            item.returnable_free_quantity,
            `${label}.returnable_free_quantity`,
          );
          const total = addExactDecimals([billed, free], `${label}.return_quantity`, purchaseQuantityOptions);
          const taxRates = [item.cgst_rate, item.sgst_rate, item.igst_rate, item.cess_rate]
            .map((value, componentIndex) => authoritativeReturnRate(
              value,
              `${label}.tax_component[${componentIndex}]`,
            ));
          return {
            ...item,
            id: item.supplier_invoice_receipt_allocation_id,
            invoice_item_id: item.supplier_invoice_line_id,
            return_paid_qty: billed,
            return_free_qty: free,
            return_quantity: total,
            original_quantity: total,
            selected: true,
            unit_price: authoritativeReturnRate(item.quoted_unit_rate, `${label}.quoted_unit_rate`),
            tax_percent: addExactDecimals(taxRates, `${label}.tax_rate`, purchaseRateOptions),
            discount_percent: '0.000000',
            max_returnable_qty: total,
            disposition: 'RESTOCK',
            restock: true
          } as any;
        });

        setReturnData(prev => ({
          ...prev,
          branch_id: context.branch_id,
          supplier_invoice_id: context.supplier_invoice_id,
          invoice_number: context.supplier_invoice_number,
          invoice_date: context.supplier_invoice_date,
          items: mappedItems,
          supported_gst_treatments: context.supported_gst_treatments,
          supplier_destinations: context.supplier_destinations,
          supplier_destination_address_id: context.supplier_destinations.length === 1
            ? context.supplier_destinations[0].id
            : '',
          statutory_gstr2b_credit_notes: context.statutory_gstr2b_credit_notes,
          supplier_credit_note_portal_line_id: '',
          gst_tax_treatment: '',
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
    if (!hasPositiveReturnLine) {
      setReturnData(prev => prev.subtotal_amount === '0.00' && prev.tax_amount === '0.00' && prev.total_amount === '0.00'
        ? prev
        : { ...prev, subtotal_amount: '0.00', tax_amount: '0.00', total_amount: '0.00' });
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
            if (!item.selected || !isPositiveDecimalText(item.return_quantity)) return item;
            const calculated = calculation.items[calculatedIndex++] || {};
            const totalAmount = calculated.total_amount as string;
            const taxableAmount = calculated.taxable_amount as string;
            const taxAmount = calculated.tax_amount as string;
            if (
              sameReturnMoney(item.total_amount, totalAmount, 'Purchase return line total') &&
              sameReturnMoney(item.taxable_amount, taxableAmount, 'Purchase return taxable amount') &&
              sameReturnMoney(item.tax_amount, taxAmount, 'Purchase return tax amount')
            ) return item;
            itemValuesChanged = true;
            return { ...item, ...calculated, total_amount: totalAmount, taxable_amount: taxableAmount, tax_amount: taxAmount };
          });
          return {
            ...prev,
            items: itemValuesChanged ? items : prev.items,
            subtotal_amount: totals.subtotal_amount,
            tax_amount: totals.tax_amount,
            total_amount: totals.total_amount,
          };
        });
      } catch (error) {
        if (requestId === calculationRequestRef.current) {
          toast.error(error instanceof Error ? error.message : 'Unable to calculate return totals.');
        }
      }
    };
    void calculate();
  }, [returnData.items, returnData.include_gst, returnData.supplier_id, toast, hasPositiveReturnLine]);

  // Validate return
  const validateReturn = () => {
    if (!returnData.supplier_id) {
      toast.error('Please select a supplier');
      return false;
    }

    if (!hasPositiveReturnLine) {
      toast.error('Please select items to return');
      return false;
    }

    if (!hasExactReturnPreview(returnData.items, returnData)) {
      toast.error('Wait for the authoritative return calculation before reviewing this return.');
      return false;
    }

    const overLimitItem = returnData.items.find(item => item.selected
      && isPositiveDecimalText(item.return_quantity)
      && compareExactDecimals(
        item.return_quantity,
        item.max_returnable_qty ?? item.original_quantity ?? '0',
        `Purchase return quantity for ${item.product_name || 'item'}`,
        purchaseQuantityOptions,
      ) > 0);
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

  const { canPrepare, unavailableReason } = usePurchaseReturnSave(returnData as any);

  const handlePrepareReturn = async () => {
    if (!canPrepare || preparedApproval) return;
    setPreparing(true);
    try {
      const result = await prepareCanonicalPurchaseReturn(returnData as any, prepareKeyRef.current);
      setPreparedApproval(result);
      toast.success('Immutable purchase-return preview prepared for independent approval.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to prepare canonical purchase return.');
    } finally {
      setPreparing(false);
    }
  };

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
                    return_date: dateStr
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

              {/* Invoice Section */}
              {selectedSupplier && showInvoiceSection && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wider flex items-center">
                      <FileText className="w-4 h-4 mr-2" />
                      SELECT SUPPLIER INVOICE
                    </h3>
                    <span className="text-xs text-gray-600">Invoice lineage is required for a canonical purchase return.</span>
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
              {selectedInvoice && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                      <Package className="w-5 h-5 mr-2 text-blue-600" />
                      Return Items
                    </h3>
                  </div>

                  {returnData.items.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-sm">
                        <thead><tr className="border-b border-gray-200 text-left text-gray-600">
                          <th className="p-2">Return</th><th className="p-2">Product / batch</th>
                          <th className="p-2">Billed quantity</th><th className="p-2">Free quantity</th><th className="p-2">Location</th>
                        </tr></thead>
                        <tbody>{returnData.items.map((item, index) => (
                          <tr key={String(item.id)} className="border-b border-gray-100">
                            <td className="p-2"><input aria-label={`Return ${item.product_name}`} type="checkbox" checked={item.selected} onChange={(event) => updateReturnItem(index, 'selected', event.target.checked)} /></td>
                            <td className="p-2"><p className="font-medium">{item.product_name}</p><p className="text-xs text-gray-600">{item.batch_number}</p></td>
                            <td className="p-2"><input aria-label={`Billed quantity for ${item.product_name}`} inputMode="decimal" value={String(item.return_paid_qty || '')} onChange={(event) => updateReturnItem(index, 'return_paid_qty', event.target.value)} className="min-h-11 w-28 rounded border border-gray-300 px-2" /><p className="text-xs text-gray-500">Max {item.returnable_billed_quantity}</p></td>
                            <td className="p-2"><input aria-label={`Free quantity for ${item.product_name}`} inputMode="decimal" value={String(item.return_free_qty || '')} onChange={(event) => updateReturnItem(index, 'return_free_qty', event.target.value)} className="min-h-11 w-28 rounded border border-gray-300 px-2" /><p className="text-xs text-gray-500">Max {item.returnable_free_quantity}</p></td>
                            <td className="p-2 text-xs">{item.from_location_code} · {item.from_location_name}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-600">
                      This invoice has no exact receipt allocation remaining to return.
                    </div>
                  )}
                </div>
              )}

              {selectedInvoice && (
                <div className="grid gap-4 rounded-lg border border-gray-200 bg-white p-6 md:grid-cols-3">
                  <Select
                    label="GST treatment"
                    required
                    value={returnData.gst_tax_treatment}
                    onChange={(value) => setReturnData(prev => ({ ...prev, gst_tax_treatment: value as any, supplier_credit_note_portal_line_id: '' }))}
                    options={returnData.supported_gst_treatments.map(value => ({ value, label: value === 'statutory' ? 'Statutory GST debit note' : 'Commercial only (no GST adjustment)' }))}
                    placeholder="Choose GST treatment"
                  />
                  <Select
                    label="Supplier destination"
                    required
                    value={returnData.supplier_destination_address_id}
                    onChange={(value) => setReturnData(prev => ({ ...prev, supplier_destination_address_id: String(value || '') }))}
                    options={returnData.supplier_destinations.map(address => ({ value: address.id, label: `${address.address_kind}: ${address.line1}, ${address.city}` }))}
                    placeholder="Choose verified address"
                  />
                  <Select
                    label="Transport mode"
                    required
                    value={returnData.transport_details.transport_mode}
                    onChange={(value) => setReturnData(prev => ({ ...prev, transport_details: { transport_mode: String(value), distance_km: '0' } }))}
                    options={[{ value: 'in_person', label: 'In person / hand carried' }]}
                  />
                  {returnData.gst_tax_treatment === 'statutory' && (
                    <Select
                      label="GSTR-2B supplier credit-note evidence"
                      required
                      value={returnData.supplier_credit_note_portal_line_id}
                      onChange={(value) => setReturnData(prev => ({ ...prev, supplier_credit_note_portal_line_id: String(value || '') }))}
                      options={returnData.statutory_gstr2b_credit_notes.map(item => ({ value: item.id, label: `${item.invoice_number} · ${item.invoice_date} · ₹${item.total_amount}` }))}
                      placeholder="Select portal evidence"
                    />
                  )}
                </div>
              )}

              {/* Additional Notes */}
              {selectedInvoice && (
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
                  Total: {formatReturnMoney(returnData.total_amount, 'Purchase return total')}
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
                  disabled={!hasPositiveReturnLine}
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
            <div className={`mt-6 rounded-lg border p-4 ${preparedApproval ? 'border-blue-300 bg-blue-50' : 'border-yellow-200 bg-yellow-50'}`}>
              <div className="flex items-start gap-3">
                <AlertCircle className={`w-5 h-5 mt-0.5 ${preparedApproval ? 'text-blue-700' : 'text-yellow-600'}`} />
                <div className="text-sm">
                  <p className={`font-medium mb-1 ${preparedApproval ? 'text-blue-950' : 'text-yellow-900'}`}>
                    {preparedApproval ? 'Awaiting independent approval' : 'Canonical preparation check'}
                  </p>
                  <p className={preparedApproval ? 'text-blue-900' : 'text-yellow-700'}>
                    {preparedApproval?.message || unavailableReason || 'The immutable preview is ready to prepare.'}
                  </p>
                  {preparedApproval && (
                    <div className="mt-3">
                      <p className="break-all">Command: {preparedApproval.preview.command_request_id}</p>
                      <p className="break-all">Preview hash: {preparedApproval.preview.preview_hash}</p>
                      <div className="mt-3 grid gap-3 md:grid-cols-3">
                        <pre className="overflow-auto rounded border border-blue-200 bg-white p-2 text-xs">{JSON.stringify(preparedApproval.preview.inventory_impact || [], null, 2)}</pre>
                        <pre className="overflow-auto rounded border border-blue-200 bg-white p-2 text-xs">{JSON.stringify(preparedApproval.preview.financial_impact || [], null, 2)}</pre>
                        <pre className="overflow-auto rounded border border-blue-200 bg-white p-2 text-xs">{JSON.stringify(preparedApproval.preview.tax_impact || [], null, 2)}</pre>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer - Using Global Component */}
        <ProceedToReviewComponent
          currentStep={2}
          canProceed={canPrepare && !preparedApproval}
          onBack={preparedApproval ? () => undefined : () => setCurrentStep(1)}
          onProceed={handlePrepareReturn}
          onReset={undefined}
          totalItems={returnData.items.filter(item => item.selected).length}
          totalAmount={returnData.total_amount}
          proceedText={preparedApproval ? 'Awaiting independent approval' : 'Prepare Immutable Return'}
          backText="Back"
          saving={preparing}
        />
      </div>
    </div>
  );
};

export default PurchaseReturnFlowV2;
