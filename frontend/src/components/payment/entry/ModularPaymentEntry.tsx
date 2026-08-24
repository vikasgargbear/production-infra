import React from 'react';
import {
  CreditCard, Calculator, CheckCircle, Printer, ArrowLeft,
  X, History, Plus, Loader2, AlertCircle, User, FileText
} from 'lucide-react';
import { PaymentProvider, usePayment } from '../../../contexts/PaymentContext';
import { paymentAllocationApi } from '../../../services/api/modules/finance/paymentAllocation.api';
import InvoiceSelector from '../shared/InvoiceSelector';
import PaymentFlowOptimized from '../shared/PaymentFlowOptimized';
import PaymentSummary from '../shared/PaymentSummary';
import PaymentSummaryCompact from '../shared/PaymentSummaryCompact';
import { projectPaymentOutstandingInvoices } from './paymentOutstandingProjection';


// Import global components
import { CanonicalWriteNotice, CustomerSearch, GSTCalculator, ProceedToReviewComponent, ModuleHeader, Card, CustomerCreation } from '../../global';


interface PaymentEntryContentProps {
  onClose: () => void;
}

interface KeyboardShortcut {
  key: string;
  label: string;
}


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
    errors,
    outstandingInvoices,
    setOutstandingInvoices
  } = usePayment();

  const [showGSTCalculator, setShowGSTCalculator] = React.useState<boolean>(false);
  const [showCustomerModal, setShowCustomerModal] = React.useState<boolean>(false);

  // API data states
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Manual invoice selection state
  const [selectedInvoiceIds, setSelectedInvoiceIds] = React.useState<Set<string>>(new Set());
  const [manualAllocations, setManualAllocations] = React.useState<Record<string, number>>({});
  const [hasLoadedOutstanding, setHasLoadedOutstanding] = React.useState(false);

  // Auto-apply allocation when amount changes ONLY if user explicitly selected an auto method
  React.useEffect(() => {
    // Only auto-allocate if user explicitly chose a method other than manual
    if (payment.amount && parseFloat(payment.amount) > 0 &&
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

  // Keyboard shortcuts
  const shortcuts: KeyboardShortcut[] = currentStep === 1 ? [
    { key: 'Ctrl+N', label: 'Add Customer' },
    { key: 'Ctrl+S', label: 'Search Products' },
    { key: 'Ctrl+Enter', label: 'Proceed' },
    { key: 'Esc', label: 'Close' }
  ] : [
    { key: 'Ctrl+S', label: 'Save Payment' },
    { key: 'Ctrl+P', label: 'Print' },
    { key: 'Esc', label: 'Back' }
  ];

  React.useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Ctrl+Enter to proceed
      if (e.ctrlKey && e.key === 'Enter' && currentStep === 1) {
        goToSummary();
      }
      // Ctrl+S to save
      if (e.ctrlKey && e.key === 's' && currentStep === 2) {
        e.preventDefault();
        setMessage('Saving a payment is disabled until a canonical API command is available.', 'error');
      }
      // Ctrl+G for GST Calculator
      if (e.ctrlKey && e.key === 'g') {
        e.preventDefault();
        setShowGSTCalculator(true);
      }
      // Esc to close/back
      if (e.key === 'Escape') {
        if (currentStep === 2) {
          setCurrentStep(1);
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentStep, payment]);

  const validatePayment = (): boolean => {
    if (!selectedCustomer) {
      setMessage('Please select a customer', 'error');
      return false;
    }
    if (!payment.amount || parseFloat(payment.amount) <= 0) {
      setMessage('Please enter a valid payment amount', 'error');
      return false;
    }
    if (!payment.payment_mode) {
      setMessage('Please select a payment mode', 'error');
      return false;
    }


    return true;
  };

  const goToSummary = (): void => {
    if (validatePayment()) {
      setCurrentStep(2);
    }
  };

  const savePayment = (): void => {
    setMessage('Saving a payment is disabled until a canonical API command is available.', 'error');
  };

  const generateReceipt = (): void => {
    window.print();
  };

  const handleNewPayment = (): void => {
    resetPayment();
    setCurrentStep(1);
    clearMessage();
  };

  // Apply allocation method to invoices
  const applyAllocationMethod = (method: string) => {
    const invoices = outstandingInvoices || [];
    if (invoices.length === 0) return;

    const paymentAmount = parseFloat(payment.amount || '0');
    if (paymentAmount <= 0) return;

    let sortedInvoices = [...invoices];

    // Sort based on method
    switch (method) {
      case 'fifo':
        // Sort by date ascending (oldest first)
        sortedInvoices.sort((a, b) => new Date(a.invoice_date).getTime() - new Date(b.invoice_date).getTime());
        break;
      case 'lifo':
        // Sort by date descending (newest first)
        sortedInvoices.sort((a, b) => new Date(b.invoice_date).getTime() - new Date(a.invoice_date).getTime());
        break;
      case 'highest':
        // Sort by amount descending (highest first)
        sortedInvoices.sort((a, b) => b.amount_due - a.amount_due);
        break;
    }

    // Auto-allocate payment to sorted invoices
    let remainingAmount = paymentAmount;
    const allocations: any[] = [];

    for (const invoice of sortedInvoices) {
      if (remainingAmount <= 0) break;

      const allocatedAmount = Math.min(remainingAmount, invoice.amount_due);
      if (allocatedAmount > 0) {
        allocations.push({
          invoice_id: invoice.invoice_id,
          invoice_number: invoice.invoice_number,
          allocated_amount: allocatedAmount,
          invoice_date: invoice.invoice_date,
          total_amount: invoice.total_amount,
          amount_due: invoice.amount_due
        });
        remainingAmount -= allocatedAmount;
      }
    }

    // Update payment with allocations
    setPaymentField('allocations', allocations);
    setPaymentField('auto_allocate', true);

  };

  // Handle manual invoice selection with proper allocation amounts
  const handleManualInvoiceSelection = (checked: boolean, invoiceId: string, invoice: any) => {
    const paymentAmount = parseFloat(payment.amount) || 0;
    const newSelected = new Set(selectedInvoiceIds);
    let newManualAllocations = { ...manualAllocations };

    if (checked) {
      newSelected.add(invoiceId);

      // Calculate remaining payment amount after existing allocations
      let totalAllocated = 0;
      Object.entries(newManualAllocations).forEach(([id, amount]) => {
        if (id !== invoiceId) {
          totalAllocated += amount as number;
        }
      });

      const remainingAmount = paymentAmount - totalAllocated;
      // Allocate the minimum of remaining payment or invoice due amount
      const allocateAmount = Math.min(remainingAmount, invoice.amount_due);

      if (allocateAmount > 0) {
        newManualAllocations[invoiceId] = allocateAmount;
      } else {
        // No remaining payment to allocate
        alert('Payment amount fully allocated. Increase payment amount or uncheck other invoices.');
        return;
      }
    } else {
      newSelected.delete(invoiceId);
      delete newManualAllocations[invoiceId];
    }

    setSelectedInvoiceIds(newSelected);
    setManualAllocations(newManualAllocations);

    // Update payment allocations with correct amounts
    const allocations = Array.from(newSelected).map(id => {
      const inv = outstandingInvoices.find((inv: any) => inv.invoice_id === id);
      return {
        invoice_id: id,
        invoice_number: inv?.invoice_number || '',
        allocated_amount: newManualAllocations[id] || 0
      };
    });

    setPaymentField('allocations', allocations);
  };

  const handleCustomerSelect = async (customer: any): Promise<void> => {
    setCustomer(customer);

    // Clear manual selections when customer changes
    setSelectedInvoiceIds(new Set());
    setManualAllocations({});
    setPaymentField('allocations', []);

    // Keep manual as default - more user friendly
    if (!payment.allocation_method) {
      setPaymentField('allocation_method', 'manual');
    }

    // Fetch outstanding invoices - using the same approach as return component
    if (!customer) {
      setOutstandingInvoices([]);
      setHasLoadedOutstanding(false);
      return;
    }

    const customerId = customer.customer_id || customer.id || customer.party_id;

    try {
      setIsLoading(true);
      setError(null);
      setHasLoadedOutstanding(false);
      const response = await paymentAllocationApi.getUnpaidInvoices(customerId);
      setOutstandingInvoices(projectPaymentOutstandingInvoices(response.data));
      setHasLoadedOutstanding(true);
    } catch (error: any) {
      setOutstandingInvoices([]);
      setHasLoadedOutstanding(false);
      setError('Unable to load authoritative outstanding invoices. No advance allocation was assumed.');
    } finally {
      setIsLoading(false);
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
                Payment Recorded Successfully!
              </h2>
              <p className="text-2xl font-bold text-gray-900 mb-8">
                Amount: ₹{parseFloat(payment.amount).toFixed(2)}
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
          onClose={onClose}
          historyType="payment"
          showSaveDraft={false}
          additionalActions={[
            {
              label: "GST Calculator",
              onClick: () => setShowGSTCalculator(true),
              icon: Calculator,
              variant: "default"
            }
          ] as any}
        />

        {/* Keyboard Shortcuts Help */}
        <div className="border-b border-gray-200 bg-white px-4 py-2 text-xs text-gray-600">
          Keyboard shortcuts: <strong>Ctrl+N</strong> - Add Customer | <strong>Ctrl+G</strong> - GST Calculator | <strong>Esc</strong> - Close
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
                          {outstandingInvoices && outstandingInvoices.length > 0 && payment.amount && parseFloat(payment.amount) > 0 && (
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
                            value={payment.allocation_method || 'manual'}
                            onChange={(e) => {
                              setPaymentField('allocation_method', e.target.value);
                              if (e.target.value === 'advance') {
                                setPaymentField('allocations', []);
                              } else if (e.target.value !== 'manual') {
                                applyAllocationMethod(e.target.value);
                              }
                            }}
                            className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="manual">Manual</option>
                            <option value="fifo">FIFO (Oldest First)</option>
                            <option value="lifo">LIFO (Newest First)</option>
                            <option value="highest">Highest First</option>
                            <option value="advance">Keep as Advance</option>
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
                                ({payment.allocations.length} invoices, ₹{payment.allocations.reduce((sum: number, alloc: any) => sum + parseFloat(alloc.allocated_amount || 0), 0).toFixed(2)})
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
                            This payment will be recorded as customer advance for future use.
                          </p>
                        </div>
                      )}

                      {/* No invoices message */}
                      {!isLoading && hasLoadedOutstanding && (!outstandingInvoices || outstandingInvoices.length === 0) && payment.allocation_method !== 'advance' && (
                        <div className="text-center py-8">
                          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                          <p className="text-gray-600 font-medium">No Outstanding Invoices</p>
                          <p className="text-sm text-gray-500 mt-2">
                            This customer has no pending invoices. The payment will be recorded as an advance.
                          </p>
                        </div>
                      )}

                      {/* Show invoices table - Clean and simple */}
                      {!isLoading && outstandingInvoices && outstandingInvoices.length > 0 && payment.allocation_method !== 'advance' && (
                        <div>
                          {/* Summary row */}
                          <div className="mb-3 text-sm text-gray-600">
                            <span>{outstandingInvoices.length} invoices • Outstanding: ₹{outstandingInvoices.reduce((sum: number, inv: any) => sum + (inv.amount_due || 0), 0).toFixed(2)}</span>
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
                                            const paymentAmount = parseFloat(payment.amount) || 0;
                                            const newSelected = new Set<string>();
                                            const newAllocations: Record<string, number> = {};
                                            let remainingPayment = paymentAmount;

                                            outstandingInvoices.forEach((inv: any) => {
                                              if (remainingPayment > 0) {
                                                const id = inv.invoice_id;
                                                newSelected.add(id);
                                                const allocateAmount = Math.min(remainingPayment, inv.amount_due);
                                                newAllocations[id] = allocateAmount;
                                                remainingPayment -= allocateAmount;
                                              }
                                            });

                                            setSelectedInvoiceIds(newSelected);
                                            setManualAllocations(newAllocations);

                                            // Update payment allocations
                                            const allocations = Array.from(newSelected).map(id => {
                                              const inv = outstandingInvoices.find((inv: any) => inv.invoice_id === id);
                                              return {
                                                invoice_id: id,
                                                invoice_number: inv?.invoice_number || '',
                                                allocated_amount: newAllocations[id] || 0
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
                                {outstandingInvoices.map((invoice: any, index: number) => {
                                  const invoiceId = String(invoice.invoice_id || index);
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
                                      <td className="text-right py-2 px-2">₹{(invoice.total_amount || 0).toFixed(2)}</td>
                                      <td className="text-right py-2 px-2 text-gray-600">
                                        ₹{((invoice.total_amount || 0) - (invoice.amount_due || 0)).toFixed(2)}
                                        {invoice.total_allocated > 0 && (
                                          <span className="block text-xs text-blue-600">
                                            (incl. ₹{invoice.total_allocated.toFixed(2)} recent)
                                          </span>
                                        )}
                                      </td>
                                      <td className="text-right py-2 px-2 font-medium text-red-600">₹{invoice.amount_due.toFixed(2)}</td>
                                      <td className="text-right py-2 px-2 font-medium text-green-600">
                                        {payment.allocation_method === 'manual'
                                          ? (isSelected ? `₹${(manualAllocations[invoiceId] || 0).toFixed(2)}` : '-')
                                          : (autoAllocation ? `₹${(autoAllocation.amount || 0).toFixed(2)}` : '-')
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
                <CanonicalWriteNotice action="Saving a payment" className="mb-4" />
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
          onBack={currentStep === 2 ? () => setCurrentStep(1) : undefined}
          onProceed={() => {
            if (currentStep === 1) {
              goToSummary();
            } else if (currentStep === 2) {
              savePayment();
            }
          }}
          onReset={currentStep === 1 ? resetPayment : undefined}
          totalItems={payment.allocations ? payment.allocations.length : 0}
          totalAmount={parseFloat(payment.amount) || 0}
          proceedText={currentStep === 2 ? 'Save unavailable' : 'Continue'}
          saving={saving}
          disabled={false}
        />
      </div>

      {/* GST Calculator Modal */}
      {showGSTCalculator && (
        <GSTCalculator
          orderData={undefined}
          onClose={() => setShowGSTCalculator(false)}
          showDetails={true}
        />
      )}

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
