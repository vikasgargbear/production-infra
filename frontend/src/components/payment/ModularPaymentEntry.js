import React from 'react';
import { 
  CreditCard, Calendar, Calculator, CheckCircle, Printer, ArrowLeft, 
  X, Save, History, Plus
} from 'lucide-react';
import { PaymentProvider, usePayment } from '../../contexts/PaymentContext';
import { customersApi, salesApi } from '../../services/api';
import { paymentDataTransformer } from '../../services/api/utils/paymentDataTransformer';
import InvoiceSelector from './components/InvoiceSelector';
import PaymentDetails from './components/PaymentDetails';
import PaymentSummary from './components/PaymentSummary';

// Import global components
import { CustomerSearch, ProductSearch, GSTCalculator, ProductCreationModal, CustomerCreationModal, ProceedToReviewComponent, ViewHistoryButton } from '../global';

// Inner component that uses the context
const PaymentEntryContent = ({ onClose }) => {
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

  const [showGSTCalculator, setShowGSTCalculator] = React.useState(false);

  // Keyboard shortcuts
  const shortcuts = currentStep === 1 ? [
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
    const handleKeyPress = (e) => {
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

  const validatePayment = () => {
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

  const goToSummary = () => {
    if (validatePayment()) {
      setCurrentStep(2);
    }
  };

  const savePayment = async () => {
    setSaving(true);
    try {
      // Prepare payment data
      const paymentData = {
        customer_id: selectedCustomer.id || selectedCustomer.customer_id,
        party_type: 'customer',
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

      // TODO: Implement payment API
      const response = { data: { receipt_no: 'RCT-' + Date.now() } };
      
      if (response.data) {
        setPaymentField('receipt_no', response.data.receipt_no);
        setMessage('Payment saved successfully!', 'success');
        setCurrentStep(3);
      }
    } catch (error) {
      console.error('Error saving payment:', error);
      setMessage(error.response?.data?.message || 'Failed to save payment. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const generateReceipt = () => {
    window.print();
  };

  const handleNewPayment = () => {
    resetPayment();
    setCurrentStep(1);
    clearMessage();
  };

  const handleCustomerSelect = async (customer) => {
    setCustomer(customer);
    
    // Fetch outstanding invoices
    try {
      // TODO: Implement payment API
      const response = { data: { invoices: [] } };
      
      if (response.data?.invoices) {
        setOutstandingInvoices(response.data.invoices);
      } else {
        // Fallback to empty array
        setOutstandingInvoices([]);
      }
    } catch (error) {
      console.error('Error fetching outstanding invoices:', error);
      // Show error but don't block payment entry
      setMessage('Could not fetch outstanding invoices', 'warning');
      setOutstandingInvoices([]);
    }
  };

  // Success Step
  if (currentStep === 3) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-2xl mx-auto px-8 py-16">
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <div className="py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
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
    <div className="h-full bg-gray-50">
      <div className="h-full flex flex-col">
        {/* Header - Match Invoice Style */}
        <div className="bg-white border-b border-gray-200">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <CreditCard className="w-5 h-5 text-gray-600" />
              <h1 className="text-xl font-semibold text-gray-900">
                {currentStep === 2 ? 'Payment Receipt' : 'New Payment Entry'}
              </h1>
              <div className="px-3 py-1 bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-lg">
                <span className="text-sm font-medium text-amber-700">
                  {currentStep === 1 ? 'Enter Details' : 'Review & Confirm'}
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowGSTCalculator(true)}
                className="text-gray-600 hover:text-gray-800 transition-colors text-sm flex items-center gap-1"
              >
                <Calculator className="w-4 h-4" />
                GST Calculator
              </button>
              <button
                onClick={() => {/* Open history */}}
                className="text-gray-600 hover:text-gray-800 transition-colors text-sm"
              >
                View History
              </button>
              <button
                onClick={goToSummary}
                disabled={!selectedCustomer || !payment.amount || currentStep === 2}
                className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed text-sm font-medium"
              >
                {currentStep === 2 ? 'Processing...' : 'Review Payment'}
              </button>
              <button 
                onClick={onClose} 
                className="p-1.5 hover:bg-gray-100 rounded-lg ml-2"
                title="Close (Esc)"
              >
                <X className="w-5 h-5 text-gray-400 hover:text-gray-600" />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-gray-50">
          <div className="max-w-6xl mx-auto px-6 py-8">
          {/* Message Display */}
          {message && (
            <div className={`mb-4 px-4 py-3 rounded-lg flex items-start text-sm ${
              messageType === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 
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
                {/* Date Section */}
                <div className="grid grid-cols-3 gap-4 mb-8">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">Payment Date</label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="date"
                        value={payment.payment_date || new Date().toISOString().split('T')[0]}
                        onChange={(e) => setPaymentField('payment_date', e.target.value)}
                        className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Customer Section */}
                <div className="mb-8">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">CUSTOMER</h3>
                  <CustomerSearch
                    value={selectedCustomer}
                    onChange={handleCustomerSelect}
                    onCreateNew={() => {/* Handle create new */}}
                    displayMode="inline"
                    placeholder="Search customer by name, phone, or code..."
                    required
                  />
                </div>
                
                {/* Payment Details */}
                <div className="mb-8">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">PAYMENT DETAILS</h3>
                  <PaymentDetails />
                </div>
                
                {/* Outstanding Invoices - Only show if customer selected */}
                {selectedCustomer && (
                  <div className="mb-8">
                    <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">OUTSTANDING INVOICES</h3>
                    <InvoiceSelector />
                  </div>
                )}
              </>
            ) : (
              // Step 2: Payment Summary
              <div className="mb-8">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">PAYMENT SUMMARY</h3>
                <PaymentSummary />
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
          open={showGSTCalculator}
          onClose={() => setShowGSTCalculator(false)}
        />
      )}
    </div>
  );
};

// Main component with providers
const ModularPaymentEntryV3 = ({ open = true, onClose }) => {
  if (!open) return null;
  
  return (
    <PaymentProvider>
      <PaymentEntryContent onClose={onClose} />
    </PaymentProvider>
  );
};

export default ModularPaymentEntryV3;