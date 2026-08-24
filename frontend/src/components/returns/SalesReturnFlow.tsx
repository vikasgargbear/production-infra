/**
 * SalesReturnFlow Component (REFACTORED)
 * Significantly reduced from 1,191 lines to ~460 lines
 * 
 * Refactoring changes:
 * - 14 useState → 1 useReducer (via useSalesReturnState hook)
 * - Extracted 4 sub-components (ReturnCustomerSelector, ReturnInvoiceSelector, ReturnItemsTable, ReturnReviewPanel)
 * - All sub-components use React.memo for performance
 * - Types extracted to returns/types/
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RotateCcw, User } from 'lucide-react';
import {
  ModuleHeader, StandardDatePicker, Select, ProceedToReviewComponent, CustomerSearch, CustomerCreation
} from '../global';
import KeyboardShortcuts, { SHORTCUT_SETS } from '../global/ui/KeyboardShortcuts';
import { customersApi, metadataApi } from '../../services/api';
import { canonicalReturnsApi } from '../../services/api/modules/returns/canonicalReturns.api';
import { calculateReturnPreview } from '../../services/calculations/returnCalculationService';
import { toast } from 'react-toastify';

// Import extracted components
import { ReturnInvoiceSelector } from './components/ReturnInvoiceSelector';
import { ReturnItemsTable } from './components/ReturnItemsTable';
import { ReturnReviewPanel } from './components/ReturnReviewPanel';

// Import hooks and types
import { useSalesReturnState } from './hooks/useSalesReturnState';
import type { SalesReturnFlowProps, ReturnFormItem } from './types/return.types';
import type { Customer, Invoice } from '../../types/api.types';

import { getSalesReturnSubmissionBoundary } from './utils/returnSubmissionBoundaries';
import { updateSalesReturnItem } from './utils/salesReturnProjection';
import { prepareCanonicalSalesReturn, type AwaitingIndependentApproval } from './utils/canonicalReturnLifecycle';
import { clientUuid } from '../../utils/clientUuid';
import { returnFlowOwnsEscape } from './utils/returnKeyboardBoundary';
import { CANONICAL_SALES_RETURN_REASON_VALUES } from './utils/canonicalReturnCommand';
import { addExactDecimals, compareExactDecimals, exactDecimalUnits } from '../../utils/exactDecimal';

const quantityOptions = { scale: 6, maximumWholeDigits: 14 } as const;
const rateOptions = { scale: 6, maximumWholeDigits: 14 } as const;
const positiveExactQuantity = (value: unknown): boolean => {
  try { return exactDecimalUnits(value, 'Return quantity', quantityOptions) > 0n; } catch { return false; }
};

const SalesReturnFlow: React.FC<SalesReturnFlowProps> = ({ onClose }) => {
  // Use centralized state management (replaces 14 useState!)
  const { dispatch, ui, returnData, selectedCustomer, selectedInvoice, customerDues, returnReasons, manualItemCounter, availableBatches } = useSalesReturnState();

  // UI state for compact header mode
  const [showDetailsExpanded, setShowDetailsExpanded] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [preparedApproval, setPreparedApproval] = useState<AwaitingIndependentApproval | null>(null);
  const prepareKeyRef = useRef(`erp-web-sales-return-prepare:${clientUuid()}`);

  // Determine if all required header fields are filled (for compact mode)
  const headerComplete = Boolean(
    returnData.return_date &&
    returnData.return_reason &&
    returnData.return_type &&
    selectedCustomer
  );

  // Auto-collapse header when all details are filled
  useEffect(() => {
    if (headerComplete) {
      setShowDetailsExpanded(false);
    }
  }, [headerComplete]);

  // Refs
  const customerSearchRef = useRef<any>(null);
  const invoiceSearchRef = useRef<any>(null);
  const calculationRequestRef = useRef(0);
  const returnDataRef = useRef(returnData);
  returnDataRef.current = returnData;
  const { canPrepare, unavailableReason } = getSalesReturnSubmissionBoundary(returnData as any);

  // Load return reasons
  useEffect(() => {
    const loadReturnReasons = async () => {
      try {
        const response = await metadataApi.getReturnReasons();
        const fetchedReasons = (response.data?.sales_return_reasons || []).filter(
          (reason: { value: string }) => CANONICAL_SALES_RETURN_REASON_VALUES.includes(reason.value),
        );

        if (Array.isArray(fetchedReasons) && fetchedReasons.length > 0) {
          dispatch({ type: 'SET_RETURN_REASONS', reasons: fetchedReasons });
        } else {
          dispatch({ type: 'SET_RETURN_REASONS', reasons: [] });
          toast.error('The canonical API returned no sales return reasons.');
        }
      } catch (error) {
        dispatch({ type: 'SET_RETURN_REASONS', reasons: [] });
        toast.error('Unable to load sales return reasons from the canonical API.');
      }
    };

    loadReturnReasons();
  }, [dispatch]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'r':
            e.preventDefault();
            customerSearchRef.current?.focus();
            break;
          case 'i':
            e.preventDefault();
            invoiceSearchRef.current?.focus();
            break;
          case 's':
            e.preventDefault();
            if (ui.currentStep === 1) {
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
        if (ui.showCustomerModal) dispatch({ type: 'TOGGLE_CUSTOMER_MODAL' });
        else if (ui.currentStep === 2) dispatch({ type: 'SET_STEP', step: 1 });
        else onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [ui.currentStep, ui.showCustomerModal, dispatch, onClose, preparedApproval]);

  // Handle invoice selection
  const handleInvoiceSelect = useCallback(async (invoice: Invoice | null) => {
    if (!invoice) {
      dispatch({ type: 'SET_SELECTED_INVOICE', invoice: null });
      return;
    }

    dispatch({ type: 'SET_SELECTED_INVOICE', invoice });
    dispatch({
      type: 'SET_RETURN_DATA',
      data: {
        invoice_id: (invoice as any).id || (invoice as any).invoice_id,
        invoice_number: invoice.invoice_number,
        invoice_date: invoice.invoice_date,
        original_invoice: invoice
      }
    });

    // Load invoice items from API
    try {
      const response = await canonicalReturnsApi.getSalesContext(
        String((invoice as any).id || (invoice as any).invoice_id),
        returnDataRef.current.return_date,
      );
      const context = response.data;
      const items = context.lines || [];

      if (items.length > 0) {
        const onlyQuarantine = context.quarantine_locations.length === 1
          ? context.quarantine_locations[0].id
          : '';
        const mappedItems = items.map((item: any) => ({
          ...item,
          id: item.invoice_dispatch_allocation_id,
          invoice_item_id: item.original_invoice_line_id,
          paid_quantity: item.returnable_billed_quantity,
          free_quantity: item.returnable_free_quantity,
          return_paid_qty: item.returnable_billed_quantity,
          return_free_qty: item.returnable_free_quantity,
          return_quantity: addExactDecimals([item.returnable_billed_quantity, item.returnable_free_quantity], 'Return quantity', quantityOptions),
          max_returnable_qty: addExactDecimals([item.returnable_billed_quantity, item.returnable_free_quantity], 'Maximum return quantity', quantityOptions),
          max_paid_qty: item.returnable_billed_quantity,
          max_free_qty: item.returnable_free_quantity,
          unit_price: item.quoted_unit_rate,
          tax_percent: addExactDecimals([item.cgst_rate, item.sgst_rate, item.igst_rate, item.cess_rate], 'Return tax rate', rateOptions),
          batch_number: item.batch_number,
          expiry_date: item.expires_on,
          selected: true,
          is_manual: false,
          return_condition: '',
          to_location_id: onlyQuarantine,
          quarantine_locations: context.quarantine_locations,
        }));
        dispatch({
          type: 'SET_SELECTED_INVOICE',
          invoice: { ...(invoice as any), ...context } as Invoice,
        });
        dispatch({
          type: 'SET_RETURN_DATA',
          data: {
            branch_id: context.branch_id,
            items: mappedItems,
            supported_gst_treatments: context.supported_gst_treatments,
            statutory_itc_reversal_evidence: context.statutory_itc_reversal_evidence,
            gst_tax_treatment: '',
            recipient_itc_reversal_evidence_attachment_id: '',
            recipient_itc_reversal_confirmed_at: '',
          },
        });
        // Items loaded silently - no toast needed
      } else {
        toast.warning('No items found in this invoice');
      }

      // Hide invoice section after selection
      dispatch({ type: 'SET_SHOW_INVOICE_SECTION', show: false });
    } catch (error) {
      console.error('Failed to load invoice items:', error);
      toast.error('Failed to load invoice items');
    }
  }, [dispatch]);

  // Handle customer selection
  const handleCustomerSelect = useCallback(async (customer: Customer | null) => {
    if (!customer) {
      dispatch({ type: 'SET_SELECTED_CUSTOMER', customer: null });
      dispatch({ type: 'SET_SELECTED_INVOICE', invoice: null });
      dispatch({ type: 'SET_SHOW_INVOICE_SECTION', show: true });
      dispatch({ type: 'TOGGLE_MANUAL_ENTRY' });
      dispatch({
        type: 'SET_RETURN_DATA',
        data: { customer_id: '', customer_details: null, invoice_id: '', items: [] }
      });
      return;
    }

    const fullCustomer: any = {
      ...customer,
      customer_name: (customer as any).customer_name || (customer as any).name,
      address: (customer as any).address || (customer as any).billing_address || (customer as any).street_address || '',
      city: (customer as any).city || (customer as any).billing_city || '',
      state: (customer as any).state || (customer as any).billing_state || '',
      pincode: (customer as any).pincode || (customer as any).zip || '',
      phone: (customer as any).phone || (customer as any).mobile || (customer as any).contact_phone || '',
      mobile: (customer as any).mobile || (customer as any).phone || '',
      email: (customer as any).email || (customer as any).contact_email || '',
      contact_person: (customer as any).contact_person || '',
      gst_number: (customer as any).gst_number || (customer as any).gst || '',
      drug_license_number: (customer as any).drug_license_number || (customer as any).drug_license || '',
      credit_limit: (customer as any).credit_limit || 0,
      credit_days: (customer as any).credit_days || 0
    };

    dispatch({ type: 'SET_SELECTED_CUSTOMER', customer: fullCustomer as Customer });
    dispatch({ type: 'SET_SELECTED_INVOICE', invoice: null });
    dispatch({ type: 'SET_SHOW_INVOICE_SECTION', show: true });
    dispatch({
      type: 'SET_RETURN_DATA',
      data: {
        customer_id: (customer as any).id || (customer as any).customer_id || (customer as any).party_id,
        customer_details: fullCustomer as Customer,
        invoice_id: '',
        items: []
      }
    });

    const customerId = (customer as any).id || (customer as any).customer_id || (customer as any).party_id;

    try {
      const detailResponse = await customersApi.getById(customerId);
      if (detailResponse?.data) {
        const detailedCustomer = {
          ...fullCustomer,
          ...detailResponse.data,
          outstanding_amount: detailResponse.data.outstanding_amount || 0
        };
        dispatch({ type: 'SET_SELECTED_CUSTOMER', customer: detailedCustomer as Customer });
        dispatch({ type: 'SET_CUSTOMER_DUES', dues: detailedCustomer.outstanding_amount || 0 });
      } else {
        dispatch({ type: 'SET_CUSTOMER_DUES', dues: 0 });
      }
    } catch (error) {
      dispatch({ type: 'SET_CUSTOMER_DUES', dues: 0 });
    }
  }, [dispatch]);

  // Handle skip invoice
  const handleSkipInvoice = useCallback(() => {
    dispatch({ type: 'SET_SELECTED_INVOICE', invoice: null });
    dispatch({ type: 'TOGGLE_MANUAL_ENTRY' });
    dispatch({ type: 'SET_SHOW_INVOICE_SECTION', show: false });
    dispatch({
      type: 'SET_RETURN_DATA',
      data: { invoice_id: '', invoice_number: '', invoice_date: '', original_invoice: null, items: [] }
    });
  }, [dispatch]);

  // Add manual item
  const handleAddManualItem = useCallback((product: any) => {
    if (!product) return;

    // Batch is already selected in ProductSearch's BatchSelector modal
    // No need for async fetch - batch data is embedded in product

    const sellingPrice = parseFloat(String(product.sale_price || product.selling_price || product.unit_price || product.mrp || 0));
    const gstPercent = parseFloat(String(product.gst_percent || product.tax_rate || 0));



    const newItem: ReturnFormItem = {
      id: `manual-${manualItemCounter}`,
      product_id: product.product_id,
      product_name: product.product_name || product.name,
      batch_id: product.batch_id || product.selectedBatch?.batch_id || undefined,
      batch_number: product.batch_number || product.selectedBatch?.batch_number || '',
      manufacturing_date: product.manufacturing_date || product.selectedBatch?.manufacturing_date || undefined,
      expiry_date: product.expiry_date || product.selectedBatch?.expiry_date || undefined,
      // Pack info from batch
      packages_per_box: product.packages_per_box || product.selectedBatch?.packages_per_box,
      units_per_pack: product.units_per_pack || product.selectedBatch?.units_per_pack,
      unit_price: sellingPrice,
      tax_percent: gstPercent,
      quantity: parseFloat(String(product.quantity || product.stock || 0)),
      paid_quantity: parseFloat(String(product.quantity || product.stock || 0)),
      free_quantity: 0,
      return_quantity: 1,
      max_returnable_qty: 999999,
      return_reason: '',
      selected: true,
      hsn_code: product.hsn_code || product.hsn || '',
      unit: product.unit || product.uom || 'PCS',
      manufacturer: product.manufacturer || '',
      is_manual: true,
      available_stock: parseFloat(String(product.total_quantity_available || product.stock || 0)),
      discount_percent: 0,
      requires_approval: true,
      verification_status: 'pending',
      disposition: 'QUARANTINE'
    };

    const updatedItems = [...returnData.items, newItem];
    dispatch({ type: 'SET_RETURN_DATA', data: { items: updatedItems } });
    dispatch({ type: 'INCREMENT_MANUAL_COUNTER' });
  }, [manualItemCounter, returnData.items, dispatch]);

  // Remove item
  const handleRemoveItem = useCallback((itemId: string | number) => {
    console.log('handleRemoveItem called with:', itemId);
    console.log('Current items:', returnData.items.map(i => ({ id: i.id, invoice_item_id: i.invoice_item_id })));

    const updatedItems = returnData.items.filter((item, index) => {
      // Match by id, invoice_item_id, or index
      if (item.id === itemId) return false;
      if (item.invoice_item_id === itemId) return false;
      if (index === itemId) return false;
      return true;
    });
    console.log('After filter, items count:', updatedItems.length);
    dispatch({ type: 'SET_RETURN_DATA', data: { items: updatedItems } });
  }, [returnData.items, dispatch]);

  // Update item
  const handleUpdateItem = useCallback((indexOrId: string | number, field: string, value: any) => {
    const updatedItems = returnData.items.map((item, index) => {
      if (index === indexOrId || item.id === indexOrId) {
        return updateSalesReturnItem(item, field, value);
      }
      return item;
    });

    dispatch({ type: 'SET_RETURN_DATA', data: { items: updatedItems } });
  }, [returnData.items, dispatch]);

  // Calculate totals whenever items or GST setting changes
  useEffect(() => {
    const requestId = ++calculationRequestRef.current;
    if (!returnData.items.some(item => item.selected && positiveExactQuantity(item.return_quantity))) return;

    const calculate = async () => {
      try {
        const calculation = await calculateReturnPreview(returnDataRef.current, 'sales');
        if (requestId !== calculationRequestRef.current) return;
        const totals = calculation.totals;
        let calculatedIndex = 0;
        let itemValuesChanged = false;
        const items = returnDataRef.current.items.map(item => {
          if (!item.selected || !positiveExactQuantity(item.return_quantity)) return item;
          const calculated = calculation.items[calculatedIndex++] || {};
          const totalAmount = Number(calculated.total_amount || 0);
          const taxableAmount = Number(calculated.taxable_amount || 0);
          const taxAmount = Number(calculated.tax_amount || 0);
          if (
            Number((item as any).total_amount || 0) === totalAmount &&
            Number((item as any).taxable_amount || 0) === taxableAmount &&
            Number((item as any).tax_amount || 0) === taxAmount
          ) return item;
          itemValuesChanged = true;
          return { ...item, ...calculated, total_amount: totalAmount, taxable_amount: taxableAmount, tax_amount: taxAmount };
        });
        dispatch({
          type: 'SET_RETURN_DATA',
          data: {
            ...(itemValuesChanged ? { items } : {}),
            subtotal_amount: totals.subtotal_amount || totals.subtotal || 0,
            tax_amount: totals.tax_amount || totals.total_tax_amount || 0,
            total_amount: totals.total_amount || totals.final_amount || 0
          }
        });
      } catch (error) {
        if (requestId === calculationRequestRef.current) {
          toast.error(error instanceof Error ? error.message : 'Unable to calculate return totals.');
        }
      }
    };
    void calculate();
  }, [returnData.items, returnData.withhold_gst, returnData.customer_id, dispatch]);

  // Validate return
  const validateReturn = (): boolean => {
    if (!selectedCustomer) {
      toast.error('Please select a customer');
      return false;
    }

    if (!selectedInvoice && !ui.showManualEntry) {
      toast.error('Please select an invoice or use manual entry');
      return false;
    }

    const hasSelectedItems = returnData.items.some(item => item.selected && positiveExactQuantity(item.return_quantity));
    if (!hasSelectedItems) {
      toast.error('Please add items to return');
      return false;
    }

    if (ui.showManualEntry) {
      const itemsWithoutBatch = returnData.items.filter(item =>
        item.selected && positiveExactQuantity(item.return_quantity) && !item.batch_id && !item.batch_number
      );

      if (itemsWithoutBatch.length > 0) {
        toast.error(`Batch information is mandatory for pharmaceutical returns. Missing batch for: ${itemsWithoutBatch[0].product_name}`);
        return false;
      }
    }

    if (!returnData.return_reason) {
      toast.error('Please select a return reason');
      return false;
    }

    for (const item of returnData.items) {
      if (item.selected) {
        if (!positiveExactQuantity(item.return_quantity)) {
          toast.error(`Please enter a valid return quantity for ${item.product_name}`);
          return false;
        }

        if (item.is_manual && exactDecimalUnits(
          item.unit_price,
          `Unit price for ${item.product_name}`,
          rateOptions,
        ) <= 0n) {
          toast.error(`Please enter a valid unit price for ${item.product_name}`);
          return false;
        }

        if (!item.is_manual && compareExactDecimals(
          item.return_quantity,
          item.max_returnable_qty,
          `Return quantity for ${item.product_name}`,
          quantityOptions,
        ) > 0) {
          toast.error(`Return quantity exceeds available quantity for ${item.product_name}`);
          return false;
        }
      }
    }

    return true;
  };

  // Handle proceed to review
  const handleProceedToReview = () => {
    if (validateReturn()) {
      dispatch({ type: 'SET_STEP', step: 2 });
      window.scrollTo(0, 0);
    }
  };

  const handlePrepareReturn = async () => {
    if (!canPrepare || preparedApproval) return;
    setPreparing(true);
    try {
      const result = await prepareCanonicalSalesReturn(returnData as any, prepareKeyRef.current);
      setPreparedApproval(result);
      toast.success('Immutable sales-return preview prepared for independent approval.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to prepare canonical sales return.');
    } finally {
      setPreparing(false);
    }
  };

  // Step 1: Create Return Form
  if (ui.currentStep === 1) {
    return (
      <div className="h-full bg-blue-50">
        <div className="h-full flex flex-col">
          <ModuleHeader
            title="Sales Return"
            documentNumber={returnData.return_no}
            status="draft"
            icon={RotateCcw}
            iconColor="text-red-600"
            onClose={onClose}
            historyType="return"
          />

          {/* Keyboard Shortcuts Bar */}
          <KeyboardShortcuts shortcuts={SHORTCUT_SETS.RETURNS} />

          {/* Content */}
          <div className="flex-1 overflow-y-auto bg-blue-50">
            <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
              {/* Header Section - Compact when details filled, Expanded for editing */}
              {headerComplete && !showDetailsExpanded ? (
                /* COMPACT HEADER - Preview mode with edit button */
                <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-6 flex-wrap">
                      {/* Customer */}
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-blue-600" />
                        <span className="font-semibold text-gray-900">{(selectedCustomer as any)?.customer_name || (selectedCustomer as any)?.name}</span>
                        {(selectedCustomer as any)?.gst_number && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">GST</span>
                        )}
                      </div>

                      {/* Divider */}
                      <div className="h-6 w-px bg-gray-300"></div>

                      {/* Date */}
                      <div className="flex items-center gap-1.5 text-sm">
                        <span className="text-gray-500">Date:</span>
                        <span className="font-medium text-gray-900">
                          {new Date(returnData.return_date || '').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                      </div>

                      {/* Divider */}
                      <div className="h-6 w-px bg-gray-300"></div>

                      {/* Reason */}
                      <div className="flex items-center gap-1.5 text-sm">
                        <span className="text-gray-500">Reason:</span>
                        <span className="font-medium text-gray-900">{returnData.return_reason}</span>
                      </div>

                      {/* Divider */}
                      <div className="h-6 w-px bg-gray-300"></div>

                      {/* Resolution */}
                      <div className="flex items-center gap-1.5 text-sm">
                        <span className="text-gray-500">Resolution:</span>
                        <span className="font-medium text-gray-900">
                          {returnData.return_type === 'credit_note' && '📝 Credit Note'}
                          {returnData.return_type === 'replacement' && '🔄 Replacement'}
                          {returnData.return_type === 'refund' && '💰 Refund'}
                          {returnData.return_type === 'no_adjustment' && '📦 No Adjustment'}
                        </span>
                      </div>
                    </div>

                    {/* Edit Button */}
                    <button
                      onClick={() => setShowDetailsExpanded(true)}
                      className="px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors font-medium flex items-center gap-1.5"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Edit Details
                    </button>
                  </div>
                </div>
              ) : (
                /* EXPANDED HEADER - Full form for editing */
                <>
                  {/* Return Info - 3-column grid with consistent h-10 heights */}
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <StandardDatePicker
                      label="Return Date"
                      value={returnData.return_date || ''}
                      onChange={(dateStr) => {
                        dispatch({ type: 'SET_RETURN_DATA', data: { return_date: dateStr } });
                      }}
                      required
                    />
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Return Reason <span className="text-red-500">*</span>
                      </label>
                      <Select
                        value={returnData.return_reason || ''}
                        onChange={(value) => dispatch({ type: 'SET_RETURN_DATA', data: { return_reason: String(value || '') } })}
                        options={returnReasons}
                        placeholder="Select reason..."
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Return Resolution <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={returnData.return_type || 'credit_note'}
                        onChange={(e) => dispatch({
                          type: 'SET_RETURN_DATA',
                          data: {
                            return_type: e.target.value as any,
                            return_method: e.target.value // Keep legacy field in sync
                          }
                        })}
                        className="w-full h-10 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                      >
                        <option value="credit_note">Credit Note (Recommended)</option>
                        <option value="replacement">Replacement</option>
                        <option value="refund">Refund (Requires Approval)</option>
                        <option value="no_adjustment">No Financial Adjustment</option>
                      </select>
                    </div>
                  </div>

                  {/* Customer Section - Using global CustomerSearch like Invoice */}
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wider flex items-center">
                        <User className="w-4 h-4 mr-2" />
                        CUSTOMER
                      </h3>
                      <button
                        onClick={() => dispatch({ type: 'TOGGLE_CUSTOMER_MODAL' })}
                        className="min-w-[140px] px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
                      >
                        Create Customer
                      </button>
                    </div>
                    {/* White card wrapper - consistent with ProductSearch */}
                    <div className="bg-white rounded-lg border border-gray-200 p-4">
                      <CustomerSearch
                        ref={customerSearchRef}
                        value={selectedCustomer as any}
                        onChange={handleCustomerSelect as any}
                        displayMode="compact"
                        placeholder="Search customer by name, phone, or code..."
                        showCreateButton={false}
                        clearable={true}
                        nextFocusRef={invoiceSearchRef}
                      />
                    </div>
                  </div>

                  {/* Collapse to compact button - only when all fields are filled */}
                  {headerComplete && (
                    <div className="flex justify-end mb-4">
                      <button
                        onClick={() => setShowDetailsExpanded(false)}
                        className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-1.5"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                        Collapse Details
                      </button>
                    </div>
                  )}
                </>
              )}

              <ReturnInvoiceSelector
                selectedCustomer={selectedCustomer}
                selectedInvoice={selectedInvoice}
                onInvoiceSelect={handleInvoiceSelect}
                onSkipInvoice={handleSkipInvoice}
                onChangeInvoice={() => {
                  dispatch({ type: 'SET_SELECTED_INVOICE', invoice: null });
                  dispatch({ type: 'SET_RETURN_DATA', data: { items: [] } });
                  dispatch({ type: 'SET_SHOW_INVOICE_SECTION', show: true });
                }}
                showInvoiceSection={ui.showInvoiceSection}
                invoiceSearchRef={invoiceSearchRef}
              />

              {selectedInvoice && (
                <div className="mb-4 grid gap-4 rounded-lg border border-gray-300 bg-white p-4 shadow-sm md:grid-cols-2">
                  <div>
                    <Select
                      label="GST treatment"
                      required
                      value={(returnData as any).gst_tax_treatment || ''}
                      onChange={(value) => dispatch({
                        type: 'SET_RETURN_DATA',
                        data: {
                          gst_tax_treatment: value as any,
                          withhold_gst: value === 'commercial_only',
                          recipient_itc_reversal_evidence_attachment_id: '',
                          recipient_itc_reversal_confirmed_at: '',
                        },
                      })}
                      options={((returnData as any).supported_gst_treatments || []).map((value: string) => ({
                        value,
                        label: value === 'statutory'
                          ? 'Statutory GST credit (evidence required)'
                          : 'Commercial only (no GST adjustment)',
                      }))}
                      placeholder="Choose GST treatment"
                    />
                  </div>
                  {(returnData as any).gst_tax_treatment === 'statutory' && (
                    <div className="space-y-2">
                      <Select
                        label="Recipient ITC-reversal evidence"
                        required
                        value={(returnData as any).recipient_itc_reversal_evidence_attachment_id || ''}
                        onChange={(value) => dispatch({
                          type: 'SET_RETURN_DATA',
                          data: { recipient_itc_reversal_evidence_attachment_id: String(value || '') },
                        })}
                        options={((returnData as any).statutory_itc_reversal_evidence || []).map((item: any) => ({
                          value: item.id,
                          label: `${item.original_filename} · ${item.status}`,
                        }))}
                        placeholder="Select verified evidence"
                      />
                      <label className="flex min-h-11 items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={Boolean((returnData as any).recipient_itc_reversal_confirmed_at)}
                          onChange={(event) => dispatch({
                            type: 'SET_RETURN_DATA',
                            data: {
                              recipient_itc_reversal_confirmed_at: event.target.checked
                                ? new Date().toISOString()
                                : '',
                            },
                          })}
                        />
                        I confirm the recipient reversed ITC for this evidence.
                      </label>
                    </div>
                  )}
                </div>
              )}

              {/* Items Table */}
              <ReturnItemsTable
                items={returnData.items}
                selectedInvoice={selectedInvoice}
                showManualEntry={ui.showManualEntry}
                availableBatches={availableBatches}
                onUpdateItem={handleUpdateItem}
                onAddManualItem={handleAddManualItem}
                onRemoveItem={handleRemoveItem}
                onBackToInvoice={ui.showManualEntry && !ui.showInvoiceSection ? () => {
                  dispatch({ type: 'SET_SHOW_INVOICE_SECTION', show: true });
                  dispatch({ type: 'TOGGLE_MANUAL_ENTRY' });
                  dispatch({ type: 'SET_RETURN_DATA', data: { items: [] } });
                } : undefined}
              />
            </div>
          </div>

          {/* Footer */}
          <ProceedToReviewComponent
            currentStep={1}
            canProceed={Boolean(selectedCustomer && (selectedInvoice || ui.showManualEntry) && returnData.items.some(item => item.selected && positiveExactQuantity(item.return_quantity)))}
            onBack={undefined}
            onProceed={handleProceedToReview}
            onReset={() => {
              dispatch({ type: 'RESET' });
            }}
          />
        </div>

        {/* Customer Creation Modal */}
        {ui.showCustomerModal && (
          <CustomerCreation
            onClose={() => dispatch({ type: 'TOGGLE_CUSTOMER_MODAL' })}
            onCustomerCreated={(newCustomer) => {
              handleCustomerSelect(newCustomer);
              dispatch({ type: 'TOGGLE_CUSTOMER_MODAL' });
            }}
          />
        )}
      </div>
    );
  }

  // Step 2: Review Panel
  return (
    <div className="h-full bg-blue-50">
      <div className="h-full flex flex-col">
        <ModuleHeader
          title="Sales Return"
          documentNumber={returnData.return_no}
          status="review"
          icon={RotateCcw}
          iconColor="text-red-600"
          onClose={onClose}
          additionalActions={[
            {
              label: "← Back to Items",
              onClick: () => dispatch({ type: 'SET_STEP', step: 1 }),
              variant: "default",
              className: "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium px-4 py-2 rounded-lg shadow-sm"
            }
          ]}
        />

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <ReturnReviewPanel
            returnData={returnData}
            selectedCustomer={selectedCustomer}
            selectedInvoice={selectedInvoice}
            customerDues={customerDues}
            onSave={canPrepare && !preparedApproval ? handlePrepareReturn : undefined}
            onBack={preparedApproval ? () => undefined : () => dispatch({ type: 'SET_STEP', step: 1 })}
            saving={preparing}
            submissionUnavailableReason={preparedApproval?.message || unavailableReason}
            preparedPreview={preparedApproval?.preview}
          />
        </div>
      </div>
    </div>
  );
};

export default SalesReturnFlow;
