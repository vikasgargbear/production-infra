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
import { purchasesApi } from '../../services/api';
import {
  canonicalReturnsApi,
  type CanonicalPurchaseReturnLogisticsMode,
  type CanonicalPurchaseReturnTransporterChoice,
} from '../../services/api/modules/returns/canonicalReturns.api';
import PurchaseReturnSelector from './ui/PurchaseReturnSelector';
import { BaseReturnItem } from '../returns/types/returnsSharedTypes';
import { usePurchaseReturnSave } from './hooks/usePurchaseReturnSave';
import { updatePurchaseReturnItem } from './utils/purchaseReturnProjection';
import { prepareCanonicalPurchaseReturn, type AwaitingIndependentApproval } from './utils/canonicalReturnLifecycle';
import { clientUuid } from '../../utils/clientUuid';
import { returnFlowOwnsEscape } from './utils/returnKeyboardBoundary';
import { formatCanonicalReasonCode } from './utils/canonicalReturnCommand';
import { addExactDecimals, compareExactDecimals, exactDecimalUnits } from '../../utils/exactDecimal';
import { canonicalBusinessContextApi } from '../../services/api/modules/org/canonicalBusinessContext.api';
import { isCanonicalUuid } from '../../utils/canonicalUuid';
import { formatCalendarDate } from '../../utils/calendarDate';
import {
  authoritativeReturnQuantity,
  authoritativeReturnRate,
  formatReturnMoney,
  hasExactReturnPreview,
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
  subtotal_amount: string;
  tax_amount: string;
  total_amount: string;
  debit_note_no: string;
  branch_id: string;
  gst_tax_treatment: '' | 'commercial_only' | 'statutory';
  return_reason_choices: Array<{
    reason_code: string;
    supported_gst_treatments: Array<'commercial_only' | 'statutory'>;
  }>;
  supplier_destinations: any[];
  supplier_destination_address_id: string;
  statutory_gstr2b_credit_notes: any[];
  supplier_credit_note_portal_line_id: string;
  logistics_modes: CanonicalPurchaseReturnLogisticsMode[];
  transporter_choices: CanonicalPurchaseReturnTransporterChoice[];
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
    subtotal_amount: '',
    tax_amount: '',
    total_amount: '',
    debit_note_no: '',
    branch_id: '',
    gst_tax_treatment: '',
    return_reason_choices: [],
    supplier_destinations: [],
    supplier_destination_address_id: '',
    statutory_gstr2b_credit_notes: [],
    supplier_credit_note_portal_line_id: '',
    logistics_modes: [],
    transporter_choices: [],
    transport_details: {
      transport_mode: '',
      distance_km: ''
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
  const hasMonetaryPreview = hasExactReturnPreview(returnData.items, returnData);
  const displayedTotal = (() => {
    if (!hasMonetaryPreview) return 'Pending backend preview';
    try { return formatReturnMoney(returnData.total_amount, 'Purchase return total'); }
    catch { return 'Invalid amount'; }
  })();
  const selectedLogisticsMode = returnData.logistics_modes.find(
    policy => policy.transport_mode === returnData.transport_details.transport_mode,
  );

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

    const invoiceId = String(invoice.supplier_invoice_id ?? invoice.invoice_id ?? '');
    if (!isCanonicalUuid(invoiceId)) {
      toast.error('This supplier invoice is missing its canonical UUID and cannot be returned.');
      return;
    }

    setSelectedInvoice(invoice);
    setReturnReasons([]);
    setReturnData(prev => ({
      ...prev,
      supplier_invoice_id: invoiceId,
      invoice_number: invoice.supplier_invoice_number ?? invoice.invoice_number,
      invoice_date: invoice.invoice_date,
      original_invoice: invoice,
      items: [],
      subtotal_amount: '',
      tax_amount: '',
      total_amount: '',
      return_reason: '',
      return_reason_choices: [],
      gst_tax_treatment: '',
      statutory_gstr2b_credit_notes: [],
      supplier_credit_note_portal_line_id: '',
      logistics_modes: [],
      transporter_choices: [],
      transport_details: { transport_mode: '', distance_km: '' },
    }));

    // Load invoice items if not already loaded
    try {
      setLoading(true);
      const response = await canonicalReturnsApi.getPurchaseContext(
        invoiceId,
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
            return_paid_qty: '',
            return_free_qty: '',
            return_quantity: '',
            original_quantity: total,
            selected: false,
            unit_price: authoritativeReturnRate(item.quoted_unit_rate, `${label}.quoted_unit_rate`),
            tax_percent: addExactDecimals(taxRates, `${label}.tax_rate`, purchaseRateOptions),
            discount_percent: '',
            max_returnable_qty: total,
          } as any;
        });

        setReturnData(prev => ({
          ...prev,
          branch_id: context.branch_id,
          supplier_invoice_id: context.supplier_invoice_id,
          invoice_number: context.supplier_invoice_number,
          invoice_date: context.supplier_invoice_date,
          items: mappedItems,
          subtotal_amount: '',
          tax_amount: '',
          total_amount: '',
          return_reason: '',
          return_reason_choices: context.return_reason_choices,
          supplier_destinations: context.supplier_destinations,
          supplier_destination_address_id: context.supplier_destinations.length === 1
            ? context.supplier_destinations[0].id
            : '',
          statutory_gstr2b_credit_notes: context.statutory_gstr2b_credit_notes,
          supplier_credit_note_portal_line_id: '',
          gst_tax_treatment: '',
          logistics_modes: context.logistics_modes,
          transporter_choices: context.transporter_choices,
          transport_details: {
            transport_mode: context.logistics_modes.length === 1
              ? context.logistics_modes[0].transport_mode
              : '',
            distance_km: '',
          },
        }));
        setReturnReasons(context.return_reason_choices.map(choice => ({
          value: choice.reason_code,
          label: formatCanonicalReasonCode(choice.reason_code),
        })));
      }
    } catch (error) {
      toast.error('Failed to load invoice items');
      setSelectedInvoice(null);
      setShowInvoiceSection(true);
      setReturnReasons([]);
      setReturnData(prev => ({
        ...prev,
        supplier_invoice_id: '', invoice_number: '', invoice_date: '', original_invoice: null,
        items: [], subtotal_amount: '', tax_amount: '', total_amount: '',
        return_reason: '', return_reason_choices: [], branch_id: '', gst_tax_treatment: '',
        supplier_destinations: [], supplier_destination_address_id: '',
        statutory_gstr2b_credit_notes: [], supplier_credit_note_portal_line_id: '',
        logistics_modes: [], transporter_choices: [],
        transport_details: { transport_mode: '', distance_km: '' },
      }));
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
      setReturnReasons([]);
      setReturnableInvoices([]);
      setReturnData(prev => ({
        ...prev,
        supplier_id: '',
        supplier_details: null,
        supplier_invoice_id: '', invoice_number: '', invoice_date: '', original_invoice: null,
        items: [],
        return_reason: '', return_reason_choices: [], branch_id: '', gst_tax_treatment: '',
        subtotal_amount: '',
        tax_amount: '',
        total_amount: '',
        supplier_destinations: [], supplier_destination_address_id: '',
        statutory_gstr2b_credit_notes: [], supplier_credit_note_portal_line_id: '',
        logistics_modes: [], transporter_choices: [],
        transport_details: { transport_mode: '', distance_km: '' },
      }));
      return;
    }

    const fullSupplier = {
      ...supplier,
      supplier_name: supplier.supplier_name,
      address: supplier.address || supplier.billing_address || '',
      phone: supplier.phone || supplier.mobile || '',
      gst_number: supplier.gst_number ?? ''
    };

    setSelectedSupplier(fullSupplier);
    setSelectedInvoice(null);
    setShowInvoiceSection(true);
    setReturnReasons([]);
    setReturnableInvoices([]);

    const supplierId = supplier.supplier_id;

    setReturnData(prev => ({
      ...prev,
      supplier_id: supplierId,
      supplier_details: fullSupplier,
      supplier_invoice_id: '', invoice_number: '', invoice_date: '', original_invoice: null,
      items: [],
      return_reason: '', return_reason_choices: [], branch_id: '', gst_tax_treatment: '',
      subtotal_amount: '',
      tax_amount: '',
      total_amount: '',
      supplier_destinations: [], supplier_destination_address_id: '',
      statutory_gstr2b_credit_notes: [], supplier_credit_note_portal_line_id: '',
      logistics_modes: [], transporter_choices: [],
      transport_details: { transport_mode: '', distance_km: '' },
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
      items: updatePurchaseReturnItem(prev.items, itemIndex, field, value) as PurchaseReturnItem[],
      subtotal_amount: '', tax_amount: '', total_amount: '',
    }));
  };

  const updateTransportMode = (mode: string) => {
    const policy = returnDataRef.current.logistics_modes.find(
      candidate => candidate.transport_mode === mode,
    );
    setReturnData(prev => ({
      ...prev,
      transport_details: policy ? {
        transport_mode: policy.transport_mode,
        distance_km: '',
        ...(policy.vehicle_requirement !== 'forbidden'
          ? { vehicle_number: '', vehicle_type: '' }
          : {}),
        ...(policy.transporter_requirement !== 'forbidden'
          ? { transporter_party_id: '' }
          : {}),
        ...(policy.transport_document_requirement !== 'forbidden'
          ? { transport_document_number: '', transport_document_date: '' }
          : {}),
      } : { transport_mode: '', distance_km: '' },
    }));
  };

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

    const overLimitItem = returnData.items.find(item => item.selected
      && isPositiveDecimalText(item.return_quantity)
      && compareExactDecimals(
        item.return_quantity,
        item.max_returnable_qty ?? item.original_quantity,
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

    if (!canPrepare) {
      toast.error(unavailableReason);
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
              <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                Required: select an exact supplier invoice, return line and quantities, reason, GST treatment, verified destination, transport mode, and distance.
              </p>
              {/* Top Section - Date, Reason, Method - 3-column grid with consistent h-10 heights */}
              <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                <StandardDatePicker
                  label="Return Date"
                  value={returnData.return_date}
                  onChange={(dateStr) => {
                    setSelectedInvoice(null);
                    setReturnReasons([]);
                    setShowInvoiceSection(true);
                    setReturnData(prev => ({
                      ...prev,
                      return_date: dateStr,
                      supplier_invoice_id: '',
                      invoice_number: '',
                      invoice_date: '',
                      original_invoice: null,
                      items: [],
                      subtotal_amount: '',
                      tax_amount: '',
                      total_amount: '',
                      return_reason: '',
                      return_reason_choices: [],
                      gst_tax_treatment: '',
                      statutory_gstr2b_credit_notes: [],
                      supplier_credit_note_portal_line_id: '',
                      logistics_modes: [],
                      transporter_choices: [],
                      transport_details: { transport_mode: '', distance_km: '' },
                    }));
                  }}
                  required
                />
                <div>
                  <Select
                    label="Return Reason"
                    required
                    value={returnData.return_reason}
                    onChange={(value) => setReturnData(prev => ({
                      ...prev,
                      return_reason: value as string,
                      gst_tax_treatment: '',
                      supplier_credit_note_portal_line_id: '',
                    }))}
                    options={returnReasons}
                    placeholder="Select reason..."
                    className="w-full"
                  />
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
                          Date: {selectedInvoice.invoice_date ? formatCalendarDate(selectedInvoice.invoice_date) : 'Unavailable'}
                        </p>
                        <p className="text-sm text-gray-600">
                          Amount: {(() => {
                            const amount = selectedInvoice.total_amount ?? selectedInvoice.invoice_amount;
                            if (amount === '' || amount === null || amount === undefined) return 'Unavailable';
                            try { return formatReturnMoney(amount, 'Supplier invoice amount'); }
                            catch { return 'Invalid amount'; }
                          })()}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedInvoice(null);
                          setReturnReasons([]);
                          setReturnData(prev => ({
                            ...prev,
                            supplier_invoice_id: '', invoice_number: '', invoice_date: '', original_invoice: null,
                            items: [],
                            return_reason: '', return_reason_choices: [], branch_id: '', gst_tax_treatment: '',
                            subtotal_amount: '',
                            tax_amount: '',
                            total_amount: '',
                            supplier_destinations: [], supplier_destination_address_id: '',
                            statutory_gstr2b_credit_notes: [], supplier_credit_note_portal_line_id: '',
                            logistics_modes: [], transporter_choices: [],
                            transport_details: { transport_mode: '', distance_km: '' },
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
                            <td className="p-2"><input aria-label={`Billed quantity for ${item.product_name}`} inputMode="decimal" value={String(item.return_paid_qty ?? '')} onChange={(event) => updateReturnItem(index, 'return_paid_qty', event.target.value)} className="min-h-11 w-28 rounded border border-gray-300 px-2" /><p className="text-xs text-gray-500">Max {item.returnable_billed_quantity}</p></td>
                            <td className="p-2"><input aria-label={`Free quantity for ${item.product_name}`} inputMode="decimal" value={String(item.return_free_qty ?? '')} onChange={(event) => updateReturnItem(index, 'return_free_qty', event.target.value)} className="min-h-11 w-28 rounded border border-gray-300 px-2" /><p className="text-xs text-gray-500">Max {item.returnable_free_quantity}</p></td>
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
                    options={(returnData.return_reason_choices.find(
                      choice => choice.reason_code === returnData.return_reason,
                    )?.supported_gst_treatments || []).map(value => ({ value, label: value === 'statutory' ? 'Statutory GST debit note' : 'Commercial only (no GST adjustment)' }))}
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
                  {returnData.logistics_modes.length === 1 ? (
                    <label className="text-sm font-medium text-gray-700">
                      Transport mode
                      <input
                        readOnly
                        value={returnData.logistics_modes[0].display_name}
                        className="mt-1 min-h-11 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-gray-700"
                      />
                      <span className="mt-1 block text-xs text-gray-500">
                        Set by the canonical return policy.
                      </span>
                    </label>
                  ) : (
                    <Select
                      label="Transport mode"
                      required
                      value={returnData.transport_details.transport_mode}
                      onChange={(value) => updateTransportMode(String(value))}
                      options={returnData.logistics_modes.map(policy => ({
                        value: policy.transport_mode,
                        label: policy.display_name,
                      }))}
                      placeholder="Choose transport mode"
                    />
                  )}
                  {selectedLogisticsMode?.distance_required && (
                    <label className="text-sm font-medium text-gray-700">
                      Distance (km) <span className="text-red-500">*</span>
                      <input
                        aria-label="Distance (km)"
                        inputMode="decimal"
                        min={selectedLogisticsMode.minimum_distance_km}
                        value={returnData.transport_details.distance_km}
                        onChange={(event) => setReturnData(prev => ({
                          ...prev,
                          transport_details: { ...prev.transport_details, distance_km: event.target.value },
                        }))}
                        placeholder={`Minimum ${selectedLogisticsMode.minimum_distance_km} km`}
                        className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3"
                      />
                    </label>
                  )}
                  {selectedLogisticsMode
                    && selectedLogisticsMode.transporter_requirement !== 'forbidden' && (
                    <Select
                      label="Transporter"
                      required={selectedLogisticsMode.transporter_requirement === 'required'}
                      value={returnData.transport_details.transporter_party_id ?? ''}
                      onChange={(value) => setReturnData(prev => ({
                        ...prev,
                        transport_details: {
                          ...prev.transport_details,
                          transporter_party_id: String(value || ''),
                        },
                      }))}
                      options={returnData.transporter_choices.map(transporter => ({
                        value: transporter.party_id,
                        label: transporter.gstin
                          ? `${transporter.legal_name} · ${transporter.gstin}`
                          : transporter.legal_name,
                      }))}
                      placeholder="Choose canonical transporter"
                    />
                  )}
                  {selectedLogisticsMode?.vehicle_requirement !== 'forbidden' && (
                    <>
                      <label className="text-sm font-medium text-gray-700">
                        Vehicle number {selectedLogisticsMode?.vehicle_requirement === 'required'
                          && <span className="text-red-500">*</span>}
                        <input
                          value={returnData.transport_details.vehicle_number ?? ''}
                          onChange={(event) => setReturnData(prev => ({
                            ...prev,
                            transport_details: { ...prev.transport_details, vehicle_number: event.target.value },
                          }))}
                          className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3"
                        />
                      </label>
                      <Select
                        label="Vehicle type"
                        required={selectedLogisticsMode?.vehicle_requirement === 'required'}
                        value={returnData.transport_details.vehicle_type ?? ''}
                        onChange={(value) => setReturnData(prev => ({
                          ...prev,
                          transport_details: { ...prev.transport_details, vehicle_type: String(value) },
                        }))}
                        options={(selectedLogisticsMode?.vehicle_type_choices || []).map(value => ({
                          value,
                          label: formatCanonicalReasonCode(value),
                        }))}
                        placeholder="Choose vehicle type"
                      />
                    </>
                  )}
                  {selectedLogisticsMode
                    && selectedLogisticsMode.transport_document_requirement !== 'forbidden' && (
                    <>
                      <label className="text-sm font-medium text-gray-700">
                        Transport document number {selectedLogisticsMode.transport_document_requirement === 'required'
                          && <span className="text-red-500">*</span>}
                        <input
                          value={returnData.transport_details.transport_document_number ?? ''}
                          onChange={(event) => setReturnData(prev => ({
                            ...prev,
                            transport_details: { ...prev.transport_details, transport_document_number: event.target.value },
                          }))}
                          className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3"
                        />
                      </label>
                      <StandardDatePicker
                        label="Transport document date"
                        required={selectedLogisticsMode.transport_document_requirement === 'required'}
                        value={returnData.transport_details.transport_document_date ?? ''}
                        onChange={(date) => setReturnData(prev => ({
                          ...prev,
                          transport_details: { ...prev.transport_details, transport_document_date: date },
                        }))}
                      />
                    </>
                  )}
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
                  Total: {displayedTotal}
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
            <div className="border border-gray-200 bg-white p-6">
                <h2 className="text-lg font-semibold text-gray-900">Canonical purchase-return review</h2>
                <p className="mt-2 text-sm text-gray-600">
                  Supplier-invoice, receipt-line, batch and location lineage are ready. Monetary and GST impacts appear only when an authoritative preview supplies them.
                </p>
                <div className="mt-5 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b text-left text-gray-600"><th className="p-2">Product</th><th className="p-2">Batch</th><th className="p-2">Billed</th><th className="p-2">Free</th><th className="p-2">Receipt location</th><th className="p-2">Amount</th></tr></thead>
                    <tbody>{returnData.items.filter(item => item.selected).map((item, index) => (
                      <tr key={String(item.id ?? index)} className="border-b border-gray-100">
                        <td className="p-2">{item.product_name}</td>
                        <td className="p-2">{item.batch_number || 'Unavailable'}</td>
                        <td className="p-2">{item.return_paid_qty === '' || item.return_paid_qty === undefined ? 'Unavailable' : item.return_paid_qty}</td>
                        <td className="p-2">{item.return_free_qty === '' || item.return_free_qty === undefined ? 'Unavailable' : item.return_free_qty}</td>
                        <td className="p-2">{item.from_location_code || 'Unavailable'}</td>
                        <td className="p-2">{(() => {
                          if (!hasMonetaryPreview) return 'Pending backend preview';
                          const amount = item.total_amount ?? item.line_total;
                          if (amount === '' || amount === null || amount === undefined) return 'Unavailable';
                          try { return formatReturnMoney(amount, `Purchase return lines[${index}].total_amount`); }
                          catch { return 'Invalid amount'; }
                        })()}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>

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
          totalAmount={hasMonetaryPreview ? returnData.total_amount : undefined}
          proceedText={preparedApproval ? 'Awaiting independent approval' : 'Prepare Immutable Return'}
          backText="Back"
          saving={preparing}
        />
      </div>
    </div>
  );
};

export default PurchaseReturnFlowV2;
