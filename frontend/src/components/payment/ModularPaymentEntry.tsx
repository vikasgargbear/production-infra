import React from 'react';
import { 
  CreditCard, Calculator, CheckCircle, Printer, ArrowLeft, 
  X, History, Plus, Loader2, AlertCircle, User, FileText
} from 'lucide-react';
import { PaymentProvider, usePayment } from '../../contexts/PaymentContext';
import { customersApi, salesApi, paymentsApi } from '../../services/api';
import { paymentDataTransformer } from '../../services/api/utils/paymentDataTransformer';
import InvoiceSelector from './components/InvoiceSelector';
import PaymentDetails from './components/PaymentDetails';
import PaymentDetailsEnhanced from './components/PaymentDetailsEnhanced';
import PaymentDetailsCompact from './components/PaymentDetailsCompact';
import PaymentSummary from './components/PaymentSummary';
import PaymentSummaryCompact from './components/PaymentSummaryCompact';

// Import global components
import { CustomerSearch, ProductSearchSimple, GSTCalculator, ProductCreationModal, ProceedToReviewComponent, ViewHistoryButton, ModuleHeader } from '../global';
import CustomerCreationB2B from '../global/ui/forms/CustomerCreationB2B';

interface PaymentEntryContentProps {
  onClose: () => void;
}

interface KeyboardShortcut {
  key: string;
  label: string;
}

// Generate sequential receipt number
const generateReceiptNumber = async () => {
  try {
    const response = await paymentsApi.generateReceiptNumber('receipt');
    return response.receipt_number;
  } catch (error) {
    console.error('Error generating receipt number:', error);
    // Fallback to local generation
    const timestamp = Date.now();
    return `RCT-${timestamp.toString().slice(-8)}`;
  }
};

// Inner component that uses the context
const PaymentEntryContent: React.FC<PaymentEntryContentProps> = ({ onClose }) => {
  const {
    payment,
    selectedCustomer,
    setCustomer,
    currentStep,
    saving,
    setSaving,
    setCurrentStep,
    resetPayment,
    message,
    messageType,
    clearMessage,
    setMessage,
    setPaymentField,
    errors,
    setOutstandingInvoices
  } = usePayment();

  const [showGSTCalculator, setShowGSTCalculator] = React.useState<boolean>(false);
  const [showCustomerModal, setShowCustomerModal] = React.useState<boolean>(false);
  
  // API data states
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Generate receipt number on component mount
  React.useEffect(() => {
    if (!payment.receipt_no || payment.receipt_no === 'RCT-TEMP') {
      generateReceiptNumber().then(receiptNo => {
        setPaymentField('receipt_no', receiptNo);
      });
    }
  }, [payment.receipt_no, setPaymentField]);


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
        savePayment();
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
    
    const requiresReference = ['UPI', 'BANK_TRANSFER', 'CHEQUE'];
    if (requiresReference.includes(payment.payment_mode) && !payment.reference_number) {
      setMessage(`Reference number is required for ${payment.payment_mode} payments`, 'error');
      return false;
    }
    
    return true;
  };

  const goToSummary = (): void => {
    if (validatePayment()) {
      setCurrentStep(2);
    }
  };

  const savePayment = async (): Promise<void> => {
    setSaving(true);
    try {
      // Prepare payment data
      const paymentData = {
        customer_id: selectedCustomer.id || selectedCustomer.customer_id,
        party_type: 'customer' as const,
        payment_date: payment.date || new Date().toISOString().split('T')[0],
        amount: payment.amount,
        payment_mode: payment.payment_mode,
        reference_number: payment.reference_number,
        bank_name: payment.bank_name,
        transaction_id: payment.transaction_id,
        notes: payment.notes,
        allocations: payment.allocations || [],
        attachment: payment.attachment,
        attachment_name: payment.attachment_name
      };

      // Validate payment data
      const validation = paymentDataTransformer.validatePaymentData(
        paymentDataTransformer.transformPaymentToBackend(paymentData)
      );
      
      if (!validation.isValid) {
        setMessage(validation.errors.join(', '), 'error');
        setSaving(false);
        return;
      }

      // Create payment using the real API
      const response = await paymentsApi.create(paymentDataTransformer.transformPaymentToBackend(paymentData));
      
      if (response.data) {
        setPaymentField('receipt_no', response.data.receipt_no);
        setMessage('Payment saved successfully!', 'success');
        setCurrentStep(3);
      }
    } catch (error: any) {
      console.error('Error saving payment:', error);
      setMessage(error.response?.data?.message || 'Failed to save payment. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const generateReceipt = (): void => {
    window.print();
  };

  const handleNewPayment = (): void => {
    resetPayment();
    setCurrentStep(1);
    clearMessage();
  };

  const handleCustomerSelect = async (customer: any): Promise<void> => {
    setCustomer(customer);
    
    // Fetch outstanding invoices using invoicesApi
    try {
      // Import invoicesApi at the top of the file if not already imported
      const { invoicesApi } = await import('../../services/api');
      
      // Get customer's invoices with outstanding amounts
      const response = await invoicesApi.getByCustomer(
        customer.customer_id || customer.id,
        {
          payment_status: 'pending,partial', // Get unpaid and partially paid invoices
          sort: 'invoice_date',
          order: 'asc',
          limit: 50
        }
      );
      
      // Transform invoices to outstanding format
      const invoices = response.data || [];
      const outstandingInvoices = invoices
        .filter((inv: any) => {
          // Only include invoices with outstanding amounts
          const outstanding = (inv.final_amount || inv.total_amount || 0) - (inv.paid_amount || 0);
          return outstanding > 0;
        })
        .map((inv: any) => ({
          invoice_no: inv.invoice_number || inv.invoice_id,
          invoice_date: inv.invoice_date || inv.created_at,
          total_amount: inv.final_amount || inv.total_amount || 0,
          paid_amount: inv.paid_amount || 0,
          amount_due: (inv.final_amount || inv.total_amount || 0) - (inv.paid_amount || 0),
          status: inv.payment_status || 'pending',
          invoice_id: inv.invoice_id || inv.id
        }));
      
      setOutstandingInvoices(outstandingInvoices);
      console.log(`Found ${outstandingInvoices.length} outstanding invoices for customer`);
      
    } catch (error) {
      console.error('Error fetching outstanding invoices:', error);
      // Try alternative API if available
      try {
        // Try using the customer API's getOutstanding method
        const response = await customersApi.getOutstanding(customer.customer_id || customer.id);
        if (response.data) {
          setOutstandingInvoices(response.data);
        } else {
          setOutstandingInvoices([]);
        }
      } catch (fallbackError) {
        console.error('Fallback API also failed:', fallbackError);
        setOutstandingInvoices([]);
      }
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
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
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
    <div className="h-full bg-blue-50">
      <div className="h-full flex flex-col">
        {/* Header - Using Global ModuleHeader */}
        <ModuleHeader
          title="Payment Entry"
          documentNumber={payment.receipt_no || 'RCT-' + Date.now().toString().slice(-6)}
          status={currentStep === 1 ? 'draft' : 'review'}
          icon={CreditCard}
          iconColor="text-blue-600"
          onClose={onClose}
          historyType="payment"
          showSaveDraft={currentStep === 1}
          onSaveDraft={() => {
            console.log('Save draft clicked');
            // TODO: Implement save draft
          }}
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
        <div className="bg-blue-50 px-4 py-2 text-xs text-blue-700 border-b border-blue-200">
          Keyboard shortcuts: <strong>Ctrl+N</strong> - Add Customer | <strong>Ctrl+G</strong> - GST Calculator | <strong>Ctrl+S</strong> - Save | <strong>Esc</strong> - Close
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-blue-50">
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
            <div className={`mb-4 px-4 py-3 rounded-lg flex items-start text-sm ${
              messageType === 'success' ? 'bg-blue-50 text-blue-800 border border-blue-200' : 
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
                {/* Payment Details - Compact single-line version */}
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3 flex items-center">
                    <CreditCard className="w-4 h-4 mr-2" />
                    PAYMENT DETAILS
                  </h3>
                  <PaymentDetailsCompact />
                </div>

                {/* Customer Section */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center">
                      <User className="w-4 h-4 mr-2" />
                      CUSTOMER
                    </h3>
                    <button
                      onClick={() => setShowCustomerModal(true)}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
                    >
                      Create Customer
                    </button>
                  </div>
                  <CustomerSearch
                    value={selectedCustomer}
                    onChange={handleCustomerSelect}
                    onCreateNew={() => setShowCustomerModal(true)}
                    displayMode="inline"
                    placeholder="Search customer by name, phone, or code..."
                    required
                  />
                </div>
                
                {/* Outstanding Invoices - Only show if customer selected */}
                {selectedCustomer && (
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3 flex items-center">
                      <FileText className="w-4 h-4 mr-2" />
                      OUTSTANDING INVOICES
                    </h3>
                    <InvoiceSelector />
                  </div>
                )}
              </>
            ) : (
              // Step 2: Payment Summary
              <div className="mb-8">
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
          canProceed={
            (currentStep === 1 && selectedCustomer && payment.amount && payment.payment_mode) ||
            (currentStep === 2)
          }
          onBack={currentStep === 2 ? () => setCurrentStep(1) : null}
          onProceed={() => {
            if (currentStep === 1) {
              goToSummary();
            } else if (currentStep === 2) {
              savePayment();
            }
          }}
          onReset={currentStep === 1 ? resetPayment : null}
          totalItems={payment.allocations ? payment.allocations.length : 0}
          totalAmount={parseFloat(payment.amount) || 0}
          proceedText={currentStep === 2 ? 'Save Payment' : 'Continue'}
          saving={saving}
        />
      </div>
      
      {/* GST Calculator Modal */}
      {showGSTCalculator && (
        <GSTCalculator
          orderData={null}
          onCalculationComplete={() => setShowGSTCalculator(false)}
          showDetails={true}
        />
      )}

      {/* Customer Creation Modal */}
      {showCustomerModal && (
        <CustomerCreationB2B
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