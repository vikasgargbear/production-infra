import React from 'react';
import {
  CreditCard, CheckCircle, Printer,
  X, Loader2, AlertCircle, FileText
} from 'lucide-react';
import { PaymentProvider, usePayment } from '../../../contexts/PaymentContext';
import { paymentAllocationApi } from '../../../services/api/modules/finance/paymentAllocation.api';
import PaymentFlowOptimized from '../shared/PaymentFlowOptimized';
import PaymentSummaryCompact from '../shared/PaymentSummaryCompact';
import { projectPaymentOutstandingInvoices } from './paymentOutstandingProjection';
import {
  allocateReceiptByMethod,
  buildCustomerReceiptPreparePayload,
  centsToMoney,
  moneyToCents,
  receiptEscapeAction,
  type CanonicalCustomerReceiptPreparePayload,
  type ReceiptAllocation,
} from './customerReceiptCommand';
import {
  approveCustomerReceipt,
  prepareCustomerReceipt,
  reconcileCustomerReceipt,
} from '../../../services/api/modules/finance/customerReceipts.api';
import { clientUuid } from '../../../utils/clientUuid';
import type { CanonicalCommandPreview } from '../../../services/api/canonicalOperatorActions';
import CustomerReceiptReviewDialog from './CustomerReceiptReviewDialog';


// Import global components
import { ProceedToReviewComponent, ModuleHeader, Card, CustomerCreation } from '../../global';


interface PaymentEntryContentProps {
  onClose: () => void;
}

const isPositiveExactMoney = (value: unknown): boolean => {
  try { return moneyToCents(String(value ?? '')) > 0n; } catch { return false; }
};

const exactMoneySum = (values: readonly (string | number)[]): string => (
  centsToMoney(values.reduce<bigint>((sum, value) => sum + moneyToCents(value), 0n))
);

// Inner component that uses the context
const PaymentEntryContent: React.FC<PaymentEntryContentProps> = ({ onClose }) => {
  const {
    payment,
    selectedCustomer,
    setCustomer,
    currentStep,
    saving,
    setCurrentStep,
    resetPayment,
    message,
    messageType,
    clearMessage,
    setMessage,
    setPaymentField,
    setSaving,
    outstandingInvoices,
    setOutstandingInvoices
  } = usePayment();

  const [showCustomerModal, setShowCustomerModal] = React.useState<boolean>(false);

  // API data states
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Manual invoice selection state
  const [selectedInvoiceIds, setSelectedInvoiceIds] = React.useState<Set<string>>(new Set());
  const [manualAllocations, setManualAllocations] = React.useState<Record<string, string>>({});
  const [hasLoadedOutstanding, setHasLoadedOutstanding] = React.useState(false);
  const receiptAttemptRef = React.useRef<{
    fingerprint: string;
    idempotencyKey: string;
    lifecycleId: string;
    preview?: CanonicalCommandPreview;
  } | null>(null);
  const postedReceiptRef = React.useRef<{
    paymentId: string;
    payload: ReturnType<typeof buildCustomerReceiptPreparePayload>;
    invoiceByOpenItem: Map<string, { invoice_id: string; due: string | number }>;
  } | null>(null);
  const [postedPaymentId, setPostedPaymentId] = React.useState('');
  const [receiptConfirmation, setReceiptConfirmation] = React.useState<{
    preview: CanonicalCommandPreview;
    payload: CanonicalCustomerReceiptPreparePayload;
    allocations: ReceiptAllocation[];
    invoiceByOpenItem: Map<string, { invoice_id: string; due: string | number }>;
  } | null>(null);
  const outstandingRequestSequence = React.useRef(0);

  // Auto-apply allocation when amount changes ONLY if user explicitly selected an auto method
  React.useEffect(() => {
    // Only auto-allocate if user explicitly chose a method other than manual
    if (payment.amount && isPositiveExactMoney(payment.amount) &&
      outstandingInvoices && outstandingInvoices.length > 0 &&
      payment.allocation_method && payment.allocation_method !== 'manual' &&
      ['fifo', 'lifo', 'highest'].includes(payment.allocation_method)) {
      const timeoutId = setTimeout(() => {
        applyAllocationMethod(payment.allocation_method);
      }, 500); // Debounce for 500ms

      return () => clearTimeout(timeoutId);
    }
  }, [payment.amount, outstandingInvoices, payment.allocation_method]);

  // Handle customer modal event from PaymentFlowOptimized
  React.useEffect(() => {
    const handleOpenCustomerModal = () => {
      setShowCustomerModal(true);
    };

    const handleCustomerSelectedEvent = (event: any) => {
      if (event.detail) {
        handleCustomerSelect(event.detail);
      }
    };

    window.addEventListener('openCustomerModal', handleOpenCustomerModal);
    window.addEventListener('customerSelected', handleCustomerSelectedEvent);

    return () => {
      window.removeEventListener('openCustomerModal', handleOpenCustomerModal);
      window.removeEventListener('customerSelected', handleCustomerSelectedEvent);
    };
  }, []);

  React.useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Ctrl+Enter to proceed
      if (e.ctrlKey && e.key === 'Enter' && currentStep === 1) {
        goToSummary();
      }
      // Ctrl+S to save
      if (e.ctrlKey && e.key === 's' && currentStep === 2) {
        e.preventDefault();
        void requestPaymentReview();
      }
      // Esc to close/back
      if (e.key === 'Escape') {
        if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
        const action = receiptEscapeAction(currentStep, postedPaymentId);
        if (action === 'block') setMessage(`Receipt ${postedPaymentId} is already posted. Reconcile its readback before editing or leaving.`, 'error');
        if (action === 'back') setCurrentStep(1);
        if (action === 'close') onClose();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentStep, payment, postedPaymentId]);

  const validatePayment = (): boolean => {
    if (!selectedCustomer) {
      setMessage('Please select a customer', 'error');
      return false;
    }
    try {
      buildCustomerReceiptPreparePayload({
        customer_account_id: selectedCustomer.customer_id,
        payment_date: payment.payment_date,
        business_date: payment.business_date,
        payment_mode: payment.payment_mode,
        amount: payment.amount,
        reference_number: payment.reference_number,
        bank_account_id: payment.bank_account_id,
        settlement_account_id: payment.settlement_account_id,
        allocation_method: payment.allocation_method,
        allocations: payment.allocations,
      }, outstandingInvoices, 'erp-web-customer-receipt-prepare:validation-only');
      return true;
    } catch (validationError) {
      setMessage(validationError instanceof Error ? validationError.message : 'Receipt details are invalid.', 'error');
      return false;
    }
  };

  const goToSummary = (): void => {
    if (validatePayment()) {
      setCurrentStep(2);
    }
  };

  const requestPaymentReview = async (): Promise<void> => {
    if (!selectedCustomer || saving) return;
    try {
      setSaving(true);
      clearMessage();
      if (postedReceiptRef.current) {
        const posted = postedReceiptRef.current;
        const readback = await reconcileCustomerReceipt(posted.paymentId, posted.payload, posted.invoiceByOpenItem);
        setPaymentField('receipt_no', readback.payment_number || readback.payment_id);
        setMessage('Receipt posted and reconciled against the authoritative invoice balance.', 'success');
        setCurrentStep(3);
        return;
      }
      const draft = {
        customer_account_id: selectedCustomer.customer_id,
        payment_date: payment.payment_date,
        business_date: payment.business_date,
        payment_mode: payment.payment_mode,
        amount: payment.amount,
        reference_number: payment.reference_number,
        bank_account_id: payment.bank_account_id,
        settlement_account_id: payment.settlement_account_id,
        allocation_method: payment.allocation_method,
        allocations: payment.allocations,
      };
      const fingerprint = JSON.stringify(draft);
      if (receiptAttemptRef.current?.fingerprint !== fingerprint) {
        receiptAttemptRef.current = {
          fingerprint,
          idempotencyKey: `erp-web-customer-receipt-prepare:${clientUuid()}`,
          lifecycleId: clientUuid(),
          preview: undefined,
        };
      }
      const attempt = receiptAttemptRef.current!;
      const payload = buildCustomerReceiptPreparePayload(
        draft,
        outstandingInvoices,
        attempt.idempotencyKey,
      );
      let preview = attempt.preview;
      if (!preview) {
        const prepared = await prepareCustomerReceipt(payload);
        preview = prepared.data;
        attempt.preview = preview;
      }
      const invoiceByOpenItem = new Map(payload.allocations.map(allocation => {
        const invoice = outstandingInvoices.find(candidate => candidate.open_item_id === allocation.open_item_id)!;
        return [allocation.open_item_id, { invoice_id: invoice.invoice_id, due: invoice.amount_due }];
      }));
      setReceiptConfirmation({
        preview,
        payload,
        allocations: payment.allocations.map(allocation => ({ ...allocation })),
        invoiceByOpenItem,
      });
      setMessage('Authoritative receipt preview prepared. Review it before posting.', 'info');
    } catch (saveError: any) {
      const detail = saveError?.response?.data?.detail;
      const reason = typeof detail === 'string' ? detail : detail?.message;
      setMessage(reason || saveError?.message || 'Receipt review failed. Nothing was posted.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const confirmPayment = async (): Promise<void> => {
    if (!receiptConfirmation || saving) return;
    setSaving(true);
    clearMessage();
    try {
      const attempt = receiptAttemptRef.current;
      if (!attempt || attempt.preview?.command_request_id !== receiptConfirmation.preview.command_request_id) {
        throw new Error('Receipt review identity was lost. Close this review and prepare it again.');
      }
      const { preview, payload, invoiceByOpenItem } = receiptConfirmation;
      const executed = await approveCustomerReceipt(preview, attempt.lifecycleId);
      postedReceiptRef.current = { paymentId: executed.payment_id, payload, invoiceByOpenItem };
      setPostedPaymentId(executed.payment_id);
      setReceiptConfirmation(null);
      const readback = await reconcileCustomerReceipt(executed.payment_id, payload, invoiceByOpenItem);
      setPaymentField('receipt_no', readback.payment_number || readback.payment_id);
      setMessage('Receipt posted and reconciled against the authoritative invoice balance.', 'success');
      setCurrentStep(3);
    } catch (saveError: any) {
      const detail = saveError?.response?.data?.detail;
      const reason = typeof detail === 'string' ? detail : detail?.message;
      setMessage(reason || saveError?.message || 'Receipt posting failed. Nothing was reported as successful.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const generateReceipt = (): void => {
    window.print();
  };

  const handleNewPayment = (): void => {
    receiptAttemptRef.current = null;
    postedReceiptRef.current = null;
    setPostedPaymentId('');
    setReceiptConfirmation(null);
    resetPayment();
    setCurrentStep(1);
    clearMessage();
  };

  // Apply allocation method to invoices
  const applyAllocationMethod = (method: string) => {
    const invoices = outstandingInvoices || [];
    if (invoices.length === 0) return;

    if (!['fifo', 'lifo', 'highest'].includes(method)) return;
    let allocations: ReceiptAllocation[];
    try {
      allocations = allocateReceiptByMethod(payment.amount, invoices, method as 'fifo' | 'lifo' | 'highest');
    } catch (allocationError) {
      setMessage(
        allocationError instanceof Error
          ? allocationError.message
          : 'Authoritative outstanding amounts could not be allocated.',
        'error',
      );
      return;
    }

    // Update payment with allocations
    setPaymentField('allocations', allocations);
    setPaymentField('auto_allocate', true);

  };

  // Handle manual invoice selection with proper allocation amounts
  const handleManualInvoiceSelection = (checked: boolean, invoiceId: string, invoice: any) => {
    let paymentCents = 0n;
    try { paymentCents = moneyToCents(payment.amount); } catch { return; }
    const newSelected = new Set(selectedInvoiceIds);
    let newManualAllocations = { ...manualAllocations };

    if (checked) {
      newSelected.add(invoiceId);

      // Calculate remaining payment amount after existing allocations
      let totalAllocated = 0n;
      Object.entries(newManualAllocations).forEach(([id, amount]) => {
        if (id !== invoiceId) {
          totalAllocated += moneyToCents(amount);
        }
      });

      const remainingAmount = paymentCents - totalAllocated;
      // Allocate the minimum of remaining payment or invoice due amount
      const invoiceDue = moneyToCents(invoice.amount_due);
      const allocateAmount = remainingAmount < invoiceDue ? remainingAmount : invoiceDue;

      if (allocateAmount > 0n) {
        newManualAllocations[invoiceId] = centsToMoney(allocateAmount);
      } else {
        // No remaining payment to allocate — surface non-blocking inline message
        setMessage('Payment amount fully allocated. Increase the payment amount or uncheck other invoices.', 'error');
        return;
      }
    } else {
      newSelected.delete(invoiceId);
      delete newManualAllocations[invoiceId];
    }

    setSelectedInvoiceIds(newSelected);
    setManualAllocations(newManualAllocations);

    const missingEvidence = Array.from(newSelected).find(id => (
      !outstandingInvoices.some(candidate => candidate.invoice_id === id)
      || !newManualAllocations[id]
    ));
    if (missingEvidence) {
      setMessage('The selected invoice lost its authoritative allocation evidence. Reload outstanding invoices and select it again.', 'error');
      return;
    }

    // Update payment allocations only from the selected canonical invoice and
    // the explicit amount established above. Never manufacture an empty
    // invoice identity or a zero allocation.
    const allocations = Array.from(newSelected).map(id => {
      const inv = outstandingInvoices.find(candidate => candidate.invoice_id === id)!;
      return {
        invoice_id: id,
        invoice_number: inv.invoice_number,
        amount: newManualAllocations[id]
      };
    });

    setPaymentField('allocations', allocations);
  };

  const handleCustomerSelect = async (customer: any): Promise<void> => {
    const requestSequence = ++outstandingRequestSequence.current;
    setCustomer(customer);

    // Clear manual selections when customer changes
    setSelectedInvoiceIds(new Set());
    setManualAllocations({});
    setPaymentField('allocations', []);

    // FIFO is the reviewed default; Manual and Keep as Advance remain explicit choices.
    if (!payment.allocation_method) {
      setPaymentField('allocation_method', 'fifo');
    }

    // Fetch outstanding invoices - using the same approach as return component
    if (!customer) {
      setOutstandingInvoices([]);
      setHasLoadedOutstanding(false);
      setIsLoading(false);
      return;
    }

    const customerId = customer.customer_id || customer.id || customer.party_id;

    try {
      setIsLoading(true);
      setError(null);
      setHasLoadedOutstanding(false);
      const response = await paymentAllocationApi.getUnpaidInvoices(customerId);
      if (requestSequence !== outstandingRequestSequence.current) return;
      setOutstandingInvoices(projectPaymentOutstandingInvoices(response.data));
      setHasLoadedOutstanding(true);
    } catch (error: any) {
      if (requestSequence !== outstandingRequestSequence.current) return;
      setOutstandingInvoices([]);
      setHasLoadedOutstanding(false);
      setError('Unable to load authoritative outstanding invoices. No advance allocation was assumed.');
    } finally {
      if (requestSequence === outstandingRequestSequence.current) setIsLoading(false);
    }
  };

  // Success Step
  if (currentStep === 3) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-2xl mx-auto px-8 py-16">
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <div className="py-8">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-blue-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Receipt posted and reconciled against the authoritative invoice balance.
              </h2>
              <p data-testid="canonical-posted-resource-id" className="mb-3 break-all font-mono text-sm text-gray-700">
                {postedPaymentId}
              </p>
              <p className="text-2xl font-bold text-gray-900 mb-8">
                Amount: ₹{centsToMoney(moneyToCents(payment.amount))}
              </p>

              <div className="flex justify-center space-x-3">
                <button
                  onClick={generateReceipt}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
                >
                  <Printer className="w-4 h-4" />
                  Print Receipt
                </button>
                <button
                  onClick={handleNewPayment}
                  className="min-h-11 rounded-md bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
                >
                  New Payment
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-gray-50">
      <div className="h-full flex flex-col">
        {/* Header - Using Global ModuleHeader */}
        <ModuleHeader
          title="Payment Entry"
          documentNumber={payment.receipt_no || 'Assigned after posting'}
          status={currentStep === 1 ? 'draft' : 'review'}
          icon={CreditCard}
          iconColor="text-blue-600"
          onClose={postedPaymentId ? () => setMessage('This receipt was posted. Reconcile its readback before leaving this screen.', 'error') : onClose}
          historyType="payment"
          showSaveDraft={false}
        />

        {/* Keyboard Shortcuts Help */}
        <div className="border-b border-gray-200 bg-white px-4 py-2 text-xs text-gray-600">
          Keyboard shortcuts: <strong>Ctrl+N</strong> - Add Customer | <strong>Esc</strong> - Close
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-gray-50">
          <div className="max-w-6xl mx-auto px-6 py-6">

            {/* Loading State */}
            {isLoading && (
              <div className="bg-white rounded-lg shadow-sm border border-blue-200 p-8 mb-6">
                <div className="text-center">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
                  <p className="text-gray-600">Loading payment entry form...</p>
                </div>
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="bg-white rounded-lg shadow-sm border border-red-200 p-6 mb-6">
                <div className="text-center max-w-md mx-auto">
                  <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-red-800 mb-2">Error</h3>
                  <p className="text-red-700 mb-4">{error}</p>
                  <button
                    onClick={() => setError(null)}
                    className="px-4 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200 text-sm"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {/* Message Display */}
            {message && (
              <div className={`mb-4 px-4 py-3 rounded-lg flex items-start text-sm ${messageType === 'success' ? 'bg-blue-50 text-blue-800 border border-blue-200' :
                messageType === 'error' ? 'bg-red-50 text-red-800 border border-red-200' :
                  'bg-blue-50 text-blue-800 border border-blue-200'
                }`}>
                {messageType === 'success' && <CheckCircle className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" />}
                <div className="flex-1">{message}</div>
                <button onClick={clearMessage} className="ml-2 hover:opacity-70">
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {currentStep === 1 ? (
              <>
                {/* New Optimized Payment Flow */}
                <div className="mb-6">
                  <PaymentFlowOptimized />
                </div>

                {/* Outstanding Invoices - Proper tile display */}
                {selectedCustomer && (
                  <div className="mb-6">
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center">
                          <FileText className="w-4 h-4 mr-2" />
                          OUTSTANDING INVOICES
                        </h3>
                        <div className="flex items-center space-x-3">
                          {/* FIFO Quick Allocation Button */}
                          {outstandingInvoices && outstandingInvoices.length > 0 && payment.amount && isPositiveExactMoney(payment.amount) && (
                            <button
                              onClick={() => {
                                setPaymentField('allocation_method', 'fifo');
                                applyAllocationMethod('fifo');
                              }}
                              className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-1"
                            >
                              <span>📅</span>
                              <span>Auto FIFO</span>
                            </button>
                          )}

                          {/* Allocation Method Dropdown (simplified) */}
                          <select
                            aria-label="Customer receipt allocation method"
                            value={payment.allocation_method || 'fifo'}
                            onChange={(e) => {
                              setPaymentField('allocation_method', e.target.value);
                              if (e.target.value !== 'manual') {
                                applyAllocationMethod(e.target.value);
                              }
                            }}
                            className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="manual">Manual</option>
                            <option value="fifo">FIFO (Oldest First)</option>
                            <option value="lifo">LIFO (Newest First)</option>
                            <option value="highest">Highest First</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Invoice Display Tile - Like payment amount tile */}
                    <Card className="p-6 bg-white border border-gray-200">
                      {/* Loading state */}
                      {isLoading && (
                        <div className="flex flex-col items-center justify-center py-8">
                          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-4"></div>
                          <p className="text-gray-600">Loading invoices...</p>
                        </div>
                      )}

                      {/* Show Auto Allocation Status */}
                      {!isLoading && payment.allocation_method && payment.allocation_method !== 'manual' && payment.allocation_method !== 'advance' && payment.allocations && payment.allocations.length > 0 && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <span className="text-sm font-medium text-blue-800">
                                {payment.allocation_method === 'fifo' && '📅 FIFO Applied'}
                                {payment.allocation_method === 'lifo' && '📆 LIFO Applied'}
                                {payment.allocation_method === 'highest' && '💰 Highest First Applied'}
                              </span>
                              <span className="text-sm text-blue-600">
                                ({payment.allocations.length} invoices, ₹{centsToMoney(payment.allocations.reduce<bigint>((sum, allocation) => sum + moneyToCents(allocation.amount), 0n))})
                              </span>
                            </div>
                            <button
                              onClick={() => {
                                setPaymentField('allocation_method', 'manual');
                                setPaymentField('allocations', []);
                              }}
                              className="text-xs text-blue-600 hover:text-blue-800"
                            >
                              Edit manually
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Advance Payment Notice */}
                      {!isLoading && payment.allocation_method === 'advance' && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                          <div className="text-2xl mb-2">💳</div>
                          <h4 className="font-semibold text-green-800 mb-1">Customer Advance Payment</h4>
                          <p className="text-sm text-green-700">
                            Keep as Advance is available for selection, but posting remains disabled until the reviewed customer-advance command is connected.
                          </p>
                        </div>
                      )}

                      {/* No invoices message */}
                      {!isLoading && hasLoadedOutstanding && (!outstandingInvoices || outstandingInvoices.length === 0) && payment.allocation_method !== 'advance' && (
                        <div className="text-center py-8">
                          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                          <p className="text-gray-600 font-medium">No Outstanding Invoices</p>
                          <p className="text-sm text-gray-500 mt-2">
                            This customer has no pending invoices. Select Keep as Advance to see its current posting availability.
                          </p>
                        </div>
                      )}

                      {/* Show invoices table - Clean and simple */}
                      {!isLoading && outstandingInvoices && outstandingInvoices.length > 0 && payment.allocation_method !== 'advance' && (
                        <div>
                          {/* Summary row */}
                          <div className="mb-3 text-sm text-gray-600">
                            <span>{outstandingInvoices.length} invoices • Outstanding: ₹{exactMoneySum(outstandingInvoices.map(inv => inv.amount_due))}</span>
                          </div>

                          {/* Simple table */}
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b bg-gray-50">
                                  <th className="text-left py-2 px-3">
                                    {payment.allocation_method === 'manual' && (
                                      <input
                                        type="checkbox"
                                        checked={selectedInvoiceIds.size === outstandingInvoices.length}
                                        onChange={(e) => {
                                          if (e.target.checked) {
                                            // Select all with FIFO-like allocation up to payment amount
                                            let paymentAmount = 0n;
                                            try { paymentAmount = moneyToCents(payment.amount); } catch { return; }
                                            const newSelected = new Set<string>();
                                            const newAllocations: Record<string, string> = {};
                                            let remainingPayment = paymentAmount;

                                            outstandingInvoices.forEach((inv: any) => {
                                              if (remainingPayment > 0n) {
                                                const id = inv.invoice_id;
                                                newSelected.add(id);
                                                const due = moneyToCents(inv.amount_due);
                                                const allocateAmount = remainingPayment < due ? remainingPayment : due;
                                                newAllocations[id] = centsToMoney(allocateAmount);
                                                remainingPayment -= allocateAmount;
                                              }
                                            });

                                            setSelectedInvoiceIds(newSelected);
                                            setManualAllocations(newAllocations);

                                            // Update payment allocations
                                                const allocations = Array.from(newSelected).map(id => {
                                                  const inv = outstandingInvoices.find((candidate: any) => candidate.invoice_id === id)!;
                                                  return {
                                                    invoice_id: id,
                                                    invoice_number: inv.invoice_number,
                                                    amount: newAllocations[id]
                                                  };
                                                });
                                            setPaymentField('allocations', allocations);
                                          } else {
                                            setSelectedInvoiceIds(new Set());
                                            setManualAllocations({});
                                            setPaymentField('allocations', []);
                                          }
                                        }}
                                        className="rounded border-gray-300"
                                      />
                                    )}
                                  </th>
                                  <th className="text-left py-2 px-2">Invoice No</th>
                                  <th className="text-left py-2 px-2">Date</th>
                                  <th className="text-right py-2 px-2">Total</th>
                                  <th className="text-right py-2 px-2">Already Paid</th>
                                  <th className="text-right py-2 px-2">Outstanding</th>
                                  <th className="text-right py-2 px-2">Allocate Now</th>
                                </tr>
                              </thead>
                              <tbody>
                                    {outstandingInvoices.map((invoice: any) => {
                                      const invoiceId = String(invoice.invoice_id);
                                  const isSelected = selectedInvoiceIds.has(invoiceId);
                                  const autoAllocation = payment.allocations?.find((alloc: any) =>
                                    alloc.invoice_id === invoiceId || alloc.invoice_number === invoice.invoice_number
                                  );

                                  return (
                                    <tr key={invoiceId} className={`border-b hover:bg-gray-50 ${isSelected || autoAllocation ? 'bg-blue-50' : ''}`}>
                                      <td className="py-2 px-3">
                                        {payment.allocation_method === 'manual' && (
                                          <input
                                            type="checkbox"
                                            aria-label={`Select canonical invoice ${invoiceId}`}
                                            checked={isSelected}
                                            onChange={(e) => {
                                              handleManualInvoiceSelection(e.target.checked, invoiceId, invoice);
                                            }}
                                            className="rounded border-gray-300"
                                          />
                                        )}
                                      </td>
                                      <td className="py-2 px-2 font-medium">{invoice.invoice_number}</td>
                                      <td className="py-2 px-2 text-gray-600">{new Date(invoice.invoice_date).toLocaleDateString()}</td>
                                      <td className="text-right py-2 px-2">₹{invoice.total_amount}</td>
                                      <td className="text-right py-2 px-2 text-gray-600">
                                        ₹{centsToMoney(moneyToCents(invoice.total_amount) - moneyToCents(invoice.amount_due))}
                                        {moneyToCents(invoice.total_allocated) > 0n && (
                                          <span className="block text-xs text-blue-600">
                                            (incl. ₹{invoice.total_allocated} recent)
                                          </span>
                                        )}
                                      </td>
                                      <td className="text-right py-2 px-2 font-medium text-red-600">₹{invoice.amount_due}</td>
                                      <td className="text-right py-2 px-2 font-medium text-green-600">
                                        {payment.allocation_method === 'manual'
                                              ? (isSelected ? `₹${manualAllocations[invoiceId] ?? 'Unavailable'}` : '-')
                                          : (autoAllocation ? `₹${autoAllocation.amount}` : '-')
                                        }
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </Card>
                  </div>
                )}
              </>
            ) : (
              // Step 2: Payment Summary
              <div className="mb-8">
                {postedPaymentId && (
                  <div role="status" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                    Receipt <strong>{postedPaymentId}</strong> is already posted. The only available action is authoritative readback reconciliation; posting will not run again.
                  </div>
                )}
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4 flex items-center">
                  <CheckCircle className="w-4 h-4 mr-2" />
                  PAYMENT SUMMARY
                </h3>
                <PaymentSummaryCompact />
              </div>
            )}
          </div>
        </div>

        {/* Footer - Using Global Component */}
        <ProceedToReviewComponent
          currentStep={currentStep}
          canProceed={Boolean(currentStep === 1 && selectedCustomer && payment.amount && payment.payment_mode)}
          onBack={currentStep === 2 && !postedPaymentId ? () => setCurrentStep(1) : undefined}
          onProceed={() => {
            if (currentStep === 1) {
              goToSummary();
            } else if (currentStep === 2) {
              requestPaymentReview();
            }
          }}
          onReset={currentStep === 1 ? resetPayment : undefined}
          totalItems={payment.allocations ? payment.allocations.length : 0}
              totalAmount={payment.amount}
          proceedText={currentStep === 2 ? (postedPaymentId ? 'Reconcile Receipt' : 'Review Posting') : 'Continue'}
          saving={saving}
          disabled={false}
        />
      </div>

      {/* Customer Creation Modal */}
      {showCustomerModal && (
        <CustomerCreation
          onClose={() => setShowCustomerModal(false)}
          onCustomerCreated={(customer) => {
            setCustomer(customer);
            setShowCustomerModal(false);
            // You can add toast notification here if needed
          }}
        />
      )}

      {receiptConfirmation && selectedCustomer && (
        <CustomerReceiptReviewDialog
          preview={receiptConfirmation.preview}
          payload={receiptConfirmation.payload}
          allocations={receiptConfirmation.allocations}
          customerName={selectedCustomer.customer_name}
          busy={saving}
          onCancel={() => {
            setReceiptConfirmation(null);
            setMessage('Receipt remains prepared but unapproved. Nothing was posted.', 'info');
          }}
          onConfirm={() => { void confirmPayment(); }}
        />
      )}
    </div>
  );
};

interface ModularPaymentEntryV3Props {
  open?: boolean;
  onClose: () => void;
}

// Main component with providers
const ModularPaymentEntryV3: React.FC<ModularPaymentEntryV3Props> = ({ open = true, onClose }) => {
  if (!open) return null;

  return (
    <PaymentProvider>
      <PaymentEntryContent onClose={onClose} />
    </PaymentProvider>
  );
};

export default ModularPaymentEntryV3;
