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
import { canonicalReturnsApi } from '../../services/api/modules/returns/canonicalReturns.api';
import { toast } from 'react-toastify';

// Import extracted components
import { ReturnInvoiceSelector } from './components/ReturnInvoiceSelector';
import { ReturnItemsTable } from './components/ReturnItemsTable';
import { ReturnReviewPanel } from './components/ReturnReviewPanel';

// Import hooks and types
import { useSalesReturnState } from './hooks/useSalesReturnState';
import type { SalesReturnFlowProps } from './types/return.types';
import type { Customer, Invoice } from '../../types/api.types';
import type { CanonicalCustomerCreateResponse } from '../../services/api/modules/master/masterCreationContract';

import { getSalesReturnSubmissionBoundary } from './utils/returnSubmissionBoundaries';
import { updateSalesReturnItem } from './utils/salesReturnProjection';
import { prepareCanonicalSalesReturn, type AwaitingIndependentApproval } from './utils/canonicalReturnLifecycle';
import { clientUuid } from '../../utils/clientUuid';
import { requireCanonicalPostingDate } from '../../utils/canonicalPostingDate';
import { formatCalendarDate } from '../../utils/calendarDate';
import { returnFlowOwnsEscape } from './utils/returnKeyboardBoundary';
import { formatCanonicalReasonCode } from './utils/canonicalReturnCommand';
import { addExactDecimals, compareExactDecimals, exactDecimalUnits } from '../../utils/exactDecimal';
import { canonicalBusinessContextApi } from '../../services/api/modules/org/canonicalBusinessContext.api';
import { isCanonicalUuid } from '../../utils/canonicalUuid';
import {
  authoritativeReturnQuantity,
  authoritativeReturnRate,
} from './utils/returnDecimal';

const quantityOptions = { scale: 6, maximumWholeDigits: 14 } as const;
const rateOptions = { scale: 6, maximumWholeDigits: 14 } as const;
const positiveExactQuantity = (value: unknown): boolean => {
  try { return exactDecimalUnits(value, 'Return quantity', quantityOptions) > 0n; } catch { return false; }
};

const SalesReturnFlow: React.FC<SalesReturnFlowProps> = ({ onClose }) => {
  // Use centralized state management (replaces 14 useState!)
  const { dispatch, ui, returnData, selectedCustomer, selectedInvoice, returnReasons } = useSalesReturnState();

  // UI state for compact header mode
  const [showDetailsExpanded, setShowDetailsExpanded] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [preparedApproval, setPreparedApproval] = useState<AwaitingIndependentApproval | null>(null);
  const [authoritativeBusinessDate, setAuthoritativeBusinessDate] = useState('');
  const prepareKeyRef = useRef(`erp-web-sales-return-prepare:${clientUuid()}`);

  // Determine if all required header fields are filled (for compact mode)
  const headerComplete = Boolean(
    returnData.return_date &&
    returnData.return_reason &&
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
  const returnDataRef = useRef(returnData);
  returnDataRef.current = returnData;
  const invoiceContextRequestSequence = useRef(0);
  const { canPrepare, unavailableReason } = getSalesReturnSubmissionBoundary(returnData as any);

  useEffect(() => {
    let active = true;
    void canonicalBusinessContextApi.get().then(context => {
      if (!active) return;
      setAuthoritativeBusinessDate(context.business_date);
      if (!returnDataRef.current.return_date) dispatch({
          type: 'SET_RETURN_DATA',
          data: { return_date: context.business_date },
        });
    }).catch(error => {
      if (active) toast.error(
        error instanceof Error ? error.message : 'Unable to load the organization business date.',
      );
    });
    return () => { active = false; };
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
    const requestSequence = ++invoiceContextRequestSequence.current;
    if (!invoice) {
      dispatch({ type: 'SET_SELECTED_INVOICE', invoice: null });
      return;
    }
    try {
      requireCanonicalPostingDate(
        returnDataRef.current.return_date,
        authoritativeBusinessDate,
        'Sales return date',
        invoice.invoice_date,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Sales return date is invalid.');
      return;
    }

    const invoiceId = String((invoice as any).id ?? (invoice as any).invoice_id ?? '');
    if (!isCanonicalUuid(invoiceId)) {
      toast.error('This invoice is missing its canonical UUID and cannot be returned.');
      return;
    }

    dispatch({ type: 'SET_SELECTED_INVOICE', invoice });
    dispatch({ type: 'SET_RETURN_REASONS', reasons: [] });
    dispatch({
      type: 'SET_RETURN_DATA',
      data: {
        invoice_id: invoiceId,
        invoice_number: invoice.invoice_number,
        invoice_date: invoice.invoice_date,
        original_invoice: invoice,
        items: [],
        subtotal_amount: '',
        tax_amount: '',
        total_amount: '',
        return_reason: '',
        return_reason_choices: [],
        gst_tax_treatment: '',
        statutory_itc_reversal_evidence: [],
        recipient_itc_reversal_evidence_attachment_id: '',
        recipient_itc_reversal_confirmed_at: '',
      }
    });

    // Load invoice items from API
    try {
      const response = await canonicalReturnsApi.getSalesContext(
        invoiceId,
        returnDataRef.current.return_date,
      );
      if (requestSequence !== invoiceContextRequestSequence.current) return;
      const context = response.data;
      const items = context.lines || [];

      if (items.length > 0) {
        const mappedItems = items.map((item: any, index: number) => {
          const label = `Sales return context lines[${index}]`;
          const billed = authoritativeReturnQuantity(
            item.returnable_billed_quantity,
            `${label}.returnable_billed_quantity`,
          );
          const free = authoritativeReturnQuantity(
            item.returnable_free_quantity,
            `${label}.returnable_free_quantity`,
          );
          const rate = authoritativeReturnRate(item.quoted_unit_rate, `${label}.quoted_unit_rate`);
          const taxRates = [item.cgst_rate, item.sgst_rate, item.igst_rate, item.cess_rate]
            .map((value, componentIndex) => authoritativeReturnRate(
              value,
              `${label}.tax_component[${componentIndex}]`,
            ));
          return {
            ...item,
            id: item.invoice_dispatch_allocation_id,
            invoice_item_id: item.original_invoice_line_id,
            paid_quantity: billed,
            free_quantity: free,
            return_paid_qty: '',
            return_free_qty: '',
            return_quantity: '',
            max_returnable_qty: addExactDecimals([billed, free], `${label}.return_quantity`, quantityOptions),
            max_paid_qty: billed,
            max_free_qty: free,
            unit_price: rate,
            tax_percent: addExactDecimals(taxRates, `${label}.tax_rate`, rateOptions),
            discount_percent: '',
            batch_number: item.batch_number,
            expiry_date: item.expires_on,
            selected: false,
            return_condition: '',
            to_location_id: '',
            quarantine_locations: context.quarantine_locations,
          };
        });
        dispatch({
          type: 'SET_SELECTED_INVOICE',
          invoice: { ...(invoice as any), ...context } as Invoice,
        });
        dispatch({
          type: 'SET_RETURN_REASONS',
          reasons: context.return_reason_choices.map(choice => ({
            value: choice.reason_code,
            label: formatCanonicalReasonCode(choice.reason_code),
          })),
        });
        dispatch({
          type: 'SET_RETURN_DATA',
          data: {
            branch_id: context.branch_id,
            items: mappedItems,
            subtotal_amount: '',
            tax_amount: '',
            total_amount: '',
            return_reason: '',
            return_reason_choices: context.return_reason_choices,
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
      if (requestSequence !== invoiceContextRequestSequence.current) return;
      console.error('Failed to load invoice items:', error);
      toast.error('Failed to load invoice items');
      dispatch({ type: 'SET_SELECTED_INVOICE', invoice: null });
      dispatch({ type: 'SET_SHOW_INVOICE_SECTION', show: true });
      dispatch({ type: 'SET_RETURN_REASONS', reasons: [] });
      dispatch({
        type: 'SET_RETURN_DATA',
        data: {
          invoice_id: '', invoice_number: '', invoice_date: '', original_invoice: null,
          items: [], subtotal_amount: '', tax_amount: '', total_amount: '',
          return_reason: '', return_reason_choices: [], branch_id: '', gst_tax_treatment: '',
          statutory_itc_reversal_evidence: [],
          recipient_itc_reversal_evidence_attachment_id: '',
          recipient_itc_reversal_confirmed_at: '',
        },
      });
    }
  }, [authoritativeBusinessDate, dispatch]);

  // Handle customer selection
  const handleCustomerSelect = useCallback(async (
    customer: Customer | CanonicalCustomerCreateResponse | null,
  ) => {
    invoiceContextRequestSequence.current += 1;
    if (!customer) {
      dispatch({ type: 'SET_SELECTED_CUSTOMER', customer: null });
      dispatch({ type: 'SET_SELECTED_INVOICE', invoice: null });
      dispatch({ type: 'SET_SHOW_INVOICE_SECTION', show: true });
      dispatch({ type: 'SET_RETURN_REASONS', reasons: [] });
      dispatch({
        type: 'SET_RETURN_DATA',
        data: {
          customer_id: '', customer_details: null,
          invoice_id: '', invoice_number: '', invoice_date: '', original_invoice: null,
          items: [], return_reason: '', return_reason_choices: [], branch_id: '', gst_tax_treatment: '',
          subtotal_amount: '', tax_amount: '', total_amount: '',
          statutory_itc_reversal_evidence: [],
          recipient_itc_reversal_evidence_attachment_id: '',
          recipient_itc_reversal_confirmed_at: '',
        }
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
      gst_number: (customer as any).gst_number ?? '',
      drug_license_number: (customer as any).drug_license_number || (customer as any).drug_license || '',
      credit_limit: (customer as any).credit_limit,
      credit_days: (customer as any).credit_days
    };

    dispatch({ type: 'SET_SELECTED_CUSTOMER', customer: fullCustomer as Customer });
    dispatch({ type: 'SET_SELECTED_INVOICE', invoice: null });
    dispatch({ type: 'SET_SHOW_INVOICE_SECTION', show: true });
    dispatch({ type: 'SET_RETURN_REASONS', reasons: [] });
    dispatch({
      type: 'SET_RETURN_DATA',
      data: {
        customer_id: (customer as any).customer_id,
        customer_details: fullCustomer as Customer,
        invoice_id: '', invoice_number: '', invoice_date: '', original_invoice: null,
        items: [],
        return_reason: '', return_reason_choices: [], branch_id: '', gst_tax_treatment: '',
        subtotal_amount: '',
        tax_amount: '',
        total_amount: '',
        statutory_itc_reversal_evidence: [],
        recipient_itc_reversal_evidence_attachment_id: '',
        recipient_itc_reversal_confirmed_at: '',
      }
    });

  }, [dispatch]);

  // Remove item
  const handleRemoveItem = useCallback((itemId: string | number) => {
    const updatedItems = returnData.items.filter((item, index) => {
      // Match by id, invoice_item_id, or index
      if (item.id === itemId) return false;
      if (item.invoice_item_id === itemId) return false;
      if (index === itemId) return false;
      return true;
    });
    dispatch({
      type: 'SET_RETURN_DATA',
      data: { items: updatedItems, subtotal_amount: '', tax_amount: '', total_amount: '' },
    });
  }, [returnData.items, dispatch]);

  // Update item
  const handleUpdateItem = useCallback((indexOrId: string | number, field: string, value: any) => {
    const updatedItems = returnData.items.map((item, index) => {
      if (index === indexOrId || item.id === indexOrId) {
        return updateSalesReturnItem(item, field, value);
      }
      return item;
    });

    dispatch({
      type: 'SET_RETURN_DATA',
      data: { items: updatedItems, subtotal_amount: '', tax_amount: '', total_amount: '' },
    });
  }, [returnData.items, dispatch]);

  // Validate return
  const validateReturn = (): boolean => {
    if (!selectedCustomer) {
      toast.error('Please select a customer');
      return false;
    }

    if (!selectedInvoice) {
      toast.error('Select a posted dispatch-allocated invoice. Manual returns are not canonical.');
      return false;
    }

    const hasSelectedItems = returnData.items.some(item => item.selected && positiveExactQuantity(item.return_quantity));
    if (!hasSelectedItems) {
      toast.error('Please add items to return');
      return false;
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

        if (compareExactDecimals(
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

    if (!canPrepare) {
      toast.error(unavailableReason);
      return false;
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
      requireCanonicalPostingDate(
        returnData.return_date,
        authoritativeBusinessDate,
        'Sales return date',
        returnData.invoice_date,
      );
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
              <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                Required: select an exact posted invoice, return line and quantities, condition, quarantine destination, reason, and GST treatment.
              </p>
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
                          {returnData.return_date ? formatCalendarDate(returnData.return_date) : 'Unavailable'}
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
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <StandardDatePicker
                      label="Return Date"
                      value={returnData.return_date || ''}
                      max={authoritativeBusinessDate || undefined}
                      onChange={(dateStr) => {
                        dispatch({ type: 'SET_SELECTED_INVOICE', invoice: null });
                        dispatch({ type: 'SET_RETURN_REASONS', reasons: [] });
                        dispatch({
                          type: 'SET_RETURN_DATA',
                          data: {
                            return_date: dateStr,
                            invoice_id: '',
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
                            statutory_itc_reversal_evidence: [],
                            recipient_itc_reversal_evidence_attachment_id: '',
                            recipient_itc_reversal_confirmed_at: '',
                          },
                        });
                        dispatch({ type: 'SET_SHOW_INVOICE_SECTION', show: true });
                      }}
                      required
                    />
                    <div>
                      <Select
                        label="Return Reason"
                        required
                        value={returnData.return_reason || ''}
                        onChange={(value) => dispatch({
                          type: 'SET_RETURN_DATA',
                          data: {
                            return_reason: String(value || ''),
                            gst_tax_treatment: '',
                            recipient_itc_reversal_evidence_attachment_id: '',
                            recipient_itc_reversal_confirmed_at: '',
                          },
                        })}
                        options={returnReasons}
                        placeholder="Select reason..."
                        className="w-full"
                      />
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

              {authoritativeBusinessDate && returnData.return_date ? <ReturnInvoiceSelector
                selectedCustomer={selectedCustomer}
                selectedInvoice={selectedInvoice}
                onInvoiceSelect={handleInvoiceSelect}
                onChangeInvoice={() => {
                  dispatch({ type: 'SET_SELECTED_INVOICE', invoice: null });
                  dispatch({ type: 'SET_RETURN_REASONS', reasons: [] });
                  dispatch({
                    type: 'SET_RETURN_DATA',
                    data: {
                      invoice_id: '', invoice_number: '', invoice_date: '', original_invoice: null,
                      items: [], subtotal_amount: '', tax_amount: '', total_amount: '',
                      return_reason: '', return_reason_choices: [], branch_id: '', gst_tax_treatment: '',
                      statutory_itc_reversal_evidence: [],
                      recipient_itc_reversal_evidence_attachment_id: '',
                      recipient_itc_reversal_confirmed_at: '',
                    },
                  });
                  dispatch({ type: 'SET_SHOW_INVOICE_SECTION', show: true });
                }}
                showInvoiceSection={ui.showInvoiceSection}
                invoiceSearchRef={invoiceSearchRef}
              /> : (
                <p role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                  Loading the authoritative organization date before invoice selection…
                </p>
              )}

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
                          recipient_itc_reversal_evidence_attachment_id: '',
                          recipient_itc_reversal_confirmed_at: '',
                        },
                      })}
                      options={((returnData.return_reason_choices || []).find(
                        choice => choice.reason_code === returnData.return_reason,
                      )?.supported_gst_treatments || []).map((value: string) => ({
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
                      <label className="block text-sm text-gray-700">
                        Recipient ITC-reversal confirmation timestamp
                        <input
                          type="text"
                          value={String((returnData as any).recipient_itc_reversal_confirmed_at || '')}
                          onChange={(event) => dispatch({
                            type: 'SET_RETURN_DATA',
                            data: { recipient_itc_reversal_confirmed_at: event.target.value },
                          })}
                          placeholder="RFC 3339 with offset, e.g. 2026-08-25T17:30:00+05:30"
                          className="mt-1 min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 py-2"
                        />
                        <span className="mt-1 block text-xs text-gray-500">
                          Enter the timestamp from the retained evidence. The browser does not invent a confirmation time.
                        </span>
                      </label>
                    </div>
                  )}
                </div>
              )}

              {/* Items Table */}
              <ReturnItemsTable
                items={returnData.items}
                selectedInvoice={selectedInvoice}
                onUpdateItem={handleUpdateItem}
                onRemoveItem={handleRemoveItem}
              />
            </div>
          </div>

          {/* Footer */}
          <ProceedToReviewComponent
            currentStep={1}
            canProceed={Boolean(selectedCustomer && selectedInvoice && returnData.items.some(item => item.selected && positiveExactQuantity(item.return_quantity)))}
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
