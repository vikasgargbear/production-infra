import React, { useState, useEffect } from 'react';
import { 
  X, 
  Save, 
  FileText, 
  User, 
  CreditCard, 
  Calendar, 
  Hash, 
  MessageCircle,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Plus,
  Eye,
  History,
  MapPin
} from 'lucide-react';

// Import global components
import { CustomerSearch, OutstandingInvoicesTable } from '../global';
import { paymentsApi } from '../../services/api/modules/payments.api';

interface EnterprisePaymentEntryProps {
  open: boolean;
  onClose: () => void;
}

interface Customer {
  customer_id: string | number;
  customer_name?: string;
  name?: string;
  phone?: string;
  type?: string;
  balance?: number;
}

interface PaymentMethod {
  id: number;
  mode: string;
  amount: string;
}

interface FormData {
  party: Customer | null;
  paymentType: string;
  paymentMethods: PaymentMethod[];
  paymentDate: string;
  totalAmount: string;
  remarks: string;
  collectorName: string;
  route: string;
}

interface Invoice {
  id: string | number;
  invoiceNo: string;
  invoiceDate: string;
  dueDate: string;
  totalAmount: number;
  pendingAmount: number;
  daysOverdue: number;
  type: string;
}

interface SelectedInvoice extends Invoice {
  payingAmount: number;
}

interface PaymentType {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface PaymentMode {
  mode: string;
  amount: number;
}

interface InvoiceAllocation {
  invoice_id: string | number;
  amount: number;
}

interface PaymentData {
  customer_id: string | number;
  customer_name: string;
  payment_type: string;
  payment_date: string;
  total_amount: number;
  payment_modes: PaymentMode[];
  remarks: string | null;
  collector_name: string | null;
  route: string | null;
  invoice_allocations: InvoiceAllocation[];
  outstanding_invoices: Invoice[];
}

interface LocalPayment {
  amount: number;
  payment_date: string;
  remarks?: string;
}

const EnterprisePaymentEntry: React.FC<EnterprisePaymentEntryProps> = ({ open, onClose }) => {
  const [formData, setFormData] = useState<FormData>({
    party: null,
    paymentType: 'order_payment',
    paymentMethods: [
      {
        id: 1,
        mode: '',
        amount: ''
      }
    ],
    paymentDate: new Date().toISOString().split('T')[0],
    totalAmount: '',
    remarks: '',
    collectorName: '',
    route: ''
  });
  
  const [outstandingInvoices, setOutstandingInvoices] = useState<Invoice[]>([]);
  const [selectedInvoices, setSelectedInvoices] = useState<SelectedInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [allocationMethod, setAllocationMethod] = useState<'fifo' | 'manual'>('fifo');
  const [showPaymentHistory, setShowPaymentHistory] = useState(false);

  // Check for locally stored payments
  const checkLocalPayments = () => {
    const localPayments: LocalPayment[] = JSON.parse(localStorage.getItem('localPayments') || '[]');
    if (localPayments.length > 0) {
      console.log('📋 Locally stored payments:', localPayments);
      alert(`Found ${localPayments.length} payments stored locally:\n\n${localPayments.map(p => 
        `₹${p.amount} - ${p.payment_date} - ${p.remarks || 'Advance Payment'}`
      ).join('\n')}\n\nThese will be synced once backend is fixed.`);
    } else {
      alert('No local payments found.');
    }
  };

  // Fetch outstanding invoices from API
  const fetchOutstandingInvoices = async (customerId: string | number) => {
    try {
      setLoading(true);
      const response = await paymentsApi.getOutstandingInvoices(customerId, 'customer');
      
      if (response.data?.invoices) {
        // Transform backend data to component format
        const transformedInvoices: Invoice[] = response.data.invoices.map((invoice: any) => ({
          id: invoice.invoice_id,
          invoiceNo: invoice.invoice_number,
          invoiceDate: invoice.invoice_date,
          dueDate: invoice.due_date,
          totalAmount: parseFloat(invoice.total_amount || 0),
          pendingAmount: parseFloat(invoice.pending_amount || 0),
          daysOverdue: invoice.days_overdue || 0,
          type: invoice.type || 'Sales Invoice'
        }));
        
        setOutstandingInvoices(transformedInvoices);
      } else {
        setOutstandingInvoices([]);
      }
    } catch (error: any) {
      console.error('Error fetching outstanding invoices:', error);
      console.error('Error details:', error.response?.data);
      
      // Set empty array but don't show error to user since payments can still be recorded as advance
      setOutstandingInvoices([]);
      
      // Only log the error for debugging
      if (error.response?.status === 500) {
        console.warn('Outstanding invoices endpoint has server error, continuing with advance payment option');
      }
    } finally {
      setLoading(false);
    }
  };

  const paymentTypes: PaymentType[] = [
    {
      id: 'regular_payment',
      label: 'Regular Payment',
      description: 'Auto-allocate payment to invoices (FIFO)',
      icon: CheckCircle
    },
    {
      id: 'order_payment',
      label: 'Order Payment',
      description: 'Payment against specific invoices',
      icon: FileText
    },
    {
      id: 'advance_payment',
      label: 'Advance Payment',
      description: 'Payment received in advance',
      icon: CreditCard
    },
    {
      id: 'adjustment_entry',
      label: 'Adjustment Entry',
      description: 'Manual entries or ledger cleanups',
      icon: RefreshCw
    }
  ];

  useEffect(() => {
    if (formData.party && (formData.paymentType === 'order_payment' || formData.paymentType === 'regular_payment')) {
      fetchOutstandingInvoices(formData.party.customer_id);
    } else {
      setOutstandingInvoices([]);
      setSelectedInvoices([]);
    }
  }, [formData.party, formData.paymentType]);

  // Auto-allocate payment using FIFO
  useEffect(() => {
    if ((allocationMethod === 'fifo' || formData.paymentType === 'regular_payment') && formData.totalAmount && outstandingInvoices.length > 0) {
      autoAllocatePayment();
    }
  }, [formData.totalAmount, outstandingInvoices, allocationMethod, formData.paymentType]);

  const autoAllocatePayment = () => {
    if (!formData.totalAmount) return;
    
    let remainingAmount = parseFloat(formData.totalAmount);
    const newSelectedInvoices: SelectedInvoice[] = [];
    
    // Sort by due date (FIFO)
    const sortedInvoices = [...outstandingInvoices].sort((a, b) => 
      new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    );
    
    for (const invoice of sortedInvoices) {
      if (remainingAmount <= 0) break;
      
      const payingAmount = Math.min(remainingAmount, invoice.pendingAmount);
      newSelectedInvoices.push({
        ...invoice,
        payingAmount
      });
      remainingAmount -= payingAmount;
    }
    
    setSelectedInvoices(newSelectedInvoices);
  };

  const handlePartySelect = (customer: Customer) => {
    setFormData(prev => ({ ...prev, party: customer }));
    setErrors(prev => ({ ...prev, party: '' }));
    // Clear previous invoice selections when party changes
    setSelectedInvoices([]);
  };

  const handlePaymentTypeChange = (type: string) => {
    setFormData(prev => ({ ...prev, paymentType: type }));
    setSelectedInvoices([]);
  };

  const handleInvoiceSelect = (invoice: Invoice, isSelected: boolean) => {
    if (isSelected) {
      const payingAmount = Math.min(
        parseFloat(formData.totalAmount) || invoice.pendingAmount,
        invoice.pendingAmount
      );
      setSelectedInvoices(prev => [...prev, { ...invoice, payingAmount }]);
    } else {
      setSelectedInvoices(prev => prev.filter(si => si.id !== invoice.id));
    }
  };

  const handleAmountChange = (invoiceId: string | number, amount: number) => {
    setSelectedInvoices(prev =>
      prev.map(invoice =>
        invoice.id === invoiceId
          ? { ...invoice, payingAmount: Math.min(amount, invoice.pendingAmount) }
          : invoice
      )
    );
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.party) newErrors.party = 'Please select a party';
    
    // Validate payment methods
    const hasValidPaymentMethods = formData.paymentMethods.some(mode => mode.mode && mode.amount);
    if (!hasValidPaymentMethods) {
      newErrors.paymentMethods = 'Please add at least one payment method with amount';
    }
    
    const totalAmount = formData.paymentMethods.reduce((sum, mode) => sum + (parseFloat(mode.amount) || 0), 0);
    if (totalAmount <= 0) {
      newErrors.totalAmount = 'Total payment amount must be greater than 0';
    }
    
    if (formData.paymentType === 'order_payment' && selectedInvoices.length === 0) {
      newErrors.invoices = 'Please select at least one invoice for order payment';
    }
    
    // For regular payment, auto-allocation should work, but we need outstanding invoices
    if (formData.paymentType === 'regular_payment' && outstandingInvoices.length === 0) {
      newErrors.invoices = 'No outstanding invoices found for regular payment. Use advance payment instead.';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    
    setLoading(true);
    
    // Calculate total from payment methods
    const totalAmount = formData.paymentMethods.reduce((sum, mode) => 
      sum + (parseFloat(mode.amount) || 0), 0
    );
    
    // Prepare payment data for backend
    const paymentData: PaymentData = {
      customer_id: formData.party!.customer_id,
      customer_name: formData.party!.customer_name || formData.party!.name || '',
      payment_type: formData.paymentType,
      payment_date: formData.paymentDate,
      total_amount: totalAmount,
      payment_modes: formData.paymentMethods
        .filter(mode => mode.mode && mode.amount)
        .map(mode => ({
          mode: mode.mode,
          amount: parseFloat(mode.amount)
        })),
      remarks: formData.remarks || null,
      collector_name: formData.collectorName || null,
      route: formData.route || null,
      invoice_allocations: (formData.paymentType === 'order_payment' || formData.paymentType === 'regular_payment')
        ? selectedInvoices.map(inv => ({
            invoice_id: inv.id,
            amount: inv.payingAmount
          }))
        : [],
      outstanding_invoices: outstandingInvoices // Pass all outstanding invoices for FIFO allocation
    };
    
    try {
      console.log('🔍 FRONTEND: Raw form data before sending:');
      console.log('- Party:', formData.party);
      console.log('- Payment Type:', formData.paymentType);
      console.log('- Payment Methods:', formData.paymentMethods);
      console.log('- Total Amount:', totalAmount);
      console.log('- Selected Invoices:', selectedInvoices);
      console.log('- Outstanding Invoices:', outstandingInvoices.length);
      
      console.log('🚀 FRONTEND: Final payload to API:', JSON.stringify(paymentData, null, 2));
      const response = await paymentsApi.create(paymentData);
      console.log('Payment saved successfully:', response.data);
      
      // Show success message with backend status
      if (response.data?.message === 'Payment recorded locally (backend unavailable)') {
        alert('⚠️ Payment saved locally (Backend issues detected)\n\nYour payment data is safely stored in the browser and will be synced once the backend is fixed.');
      } else {
        alert('✅ Payment saved successfully to backend!');
      }
      
      // Reset form and close
      onClose();
    } catch (error: any) {
      console.error('Error saving payment:', error);
      console.error('Error response:', error.response);
      
      // Show error message with more details
      let errorMessage = 'Failed to save payment';
      
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      alert(`Error: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const renderContent = () => (
    <div className="space-y-6">
      {/* Payment Date and Collection Info */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Payment Date *
            </label>
            <input
              type="date"
              value={formData.paymentDate}
              onChange={(e) => setFormData(prev => ({ ...prev, paymentDate: e.target.value }))}
              className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Collector Name
            </label>
            <div className="relative">
              <User className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={formData.collectorName}
                onChange={(e) => setFormData(prev => ({ ...prev, collectorName: e.target.value }))}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Field representative..."
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Route/Area
            </label>
            <div className="relative">
              <MapPin className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={formData.route}
                onChange={(e) => setFormData(prev => ({ ...prev, route: e.target.value }))}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Collection route..."
              />
            </div>
          </div>
        </div>
      </div>

      {/* Customer Selection */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <CustomerSearch
          value={formData.party}
          onChange={handlePartySelect}
          displayMethod="dropdown"
          placeholder="Search customer by name, phone, or code..."
          required
        />
        {errors.party && (
          <p className="mt-1 text-sm text-red-600">{errors.party}</p>
        )}
      </div>

      {/* Payment Information */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Information</h3>
        
        {/* Payment Type */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Payment Type *
          </label>
          <select
            value={formData.paymentType}
            onChange={(e) => handlePaymentTypeChange(e.target.value)}
            className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Select payment type</option>
            {paymentTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.label} - {type.description}
              </option>
            ))}
          </select>
        </div>

        {/* Multi-Payment Methods */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-medium text-gray-700">
              Payment Methods *
            </label>
            <button
              type="button"
              onClick={() => {
                setFormData(prev => ({
                  ...prev,
                  paymentMethods: [
                    ...prev.paymentMethods,
                    {
                      id: Date.now(),
                      mode: '',
                      amount: ''
                    }
                  ]
                }));
              }}
              className="text-sm text-blue-600 hover:text-blue-700 flex items-center space-x-1"
            >
              <Plus className="w-4 h-4" />
              <span>Add Payment Method</span>
            </button>
          </div>
          
          <div className="space-y-3">
            {formData.paymentMethods.map((payment, index) => {
              return (
                <div key={payment.id} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Method {index + 1} *
                      </label>
                      <select
                        value={payment.mode}
                        onChange={(e) => {
                          const newMethods = [...formData.paymentMethods];
                          newMethods[index].mode = e.target.value;
                          setFormData(prev => ({ ...prev, paymentMethods: newMethods }));
                        }}
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">Select method</option>
                        <option value="cash">Cash</option>
                        <option value="cheque">Cheque</option>
                        <option value="upi">UPI</option>
                        <option value="bank_transfer">Bank Transfer</option>
                        <option value="credit_adjustment">Credit Adjustment</option>
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Amount *
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">₹</span>
                        <input
                          type="number"
                          value={payment.amount}
                          onChange={(e) => {
                            const newMethods = [...formData.paymentMethods];
                            newMethods[index].amount = e.target.value;
                            setFormData(prev => ({ ...prev, paymentMethods: newMethods }));
                            
                            // Update total amount
                            const total = newMethods.reduce((sum, mode) => sum + (parseFloat(mode.amount) || 0), 0);
                            setFormData(prev => ({ ...prev, totalAmount: total.toString() }));
                          }}
                          className="w-full pl-8 pr-4 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="0.00"
                          min="0"
                          step="0.01"
                        />
                      </div>
                      {formData.paymentMethods.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const newMethods = formData.paymentMethods.filter((_, i) => i !== index);
                            setFormData(prev => ({ ...prev, paymentMethods: newMethods }));
                            
                            // Update total amount
                            const total = newMethods.reduce((sum, mode) => sum + (parseFloat(mode.amount) || 0), 0);
                            setFormData(prev => ({ ...prev, totalAmount: total.toString() }));
                          }}
                          className="ml-2 p-2 text-red-600 hover:bg-red-50 rounded self-end"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* Invoice Allocation Section */}
      {(formData.paymentType === 'order_payment' || formData.paymentType === 'regular_payment') && formData.party && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              {formData.paymentType === 'regular_payment' ? 'Automatic Invoice Allocation' : 'Invoice Allocation (Optional)'}
            </h3>
            {formData.paymentType === 'order_payment' && (
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-500">Allocation Method:</span>
                <select
                  value={allocationMethod}
                  onChange={(e) => setAllocationMethod(e.target.value as 'fifo' | 'manual')}
                  className="text-sm border border-gray-300 rounded px-3 py-1"
                >
                  <option value="fifo">FIFO (Auto)</option>
                  <option value="manual">Manual</option>
                </select>
              </div>
            )}
          </div>
          
          {loading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-gray-500">Loading outstanding invoices...</p>
            </div>
          ) : outstandingInvoices.length > 0 ? (
            <>
              {formData.paymentType === 'regular_payment' ? (
                <>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                    <p className="text-sm text-blue-800">
                      Payment will be automatically allocated to the oldest invoices first (FIFO method).
                    </p>
                  </div>
                  {selectedInvoices.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-gray-700">Auto-allocated to:</h4>
                      {selectedInvoices.map((invoice) => (
                        <div key={invoice.id} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                          <span className="text-sm text-gray-600">
                            Invoice #{invoice.invoiceNo} ({new Date(invoice.invoiceDate).toLocaleDateString()})
                          </span>
                          <span className="text-sm font-medium text-gray-900">
                            ₹{invoice.payingAmount.toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-600 mb-4">
                    Select invoices to allocate this payment against, or leave unselected to record as advance payment.
                  </p>
                  <OutstandingInvoicesTable
                    invoices={outstandingInvoices}
                    selectedInvoices={selectedInvoices}
                    onInvoiceSelect={handleInvoiceSelect}
                    onAmountChange={handleAmountChange}
                    paymentMethod={allocationMethod}
                    totalPayment={parseFloat(formData.totalAmount) || 0}
                    showSummary={allocationMethod === 'manual'}
                  />
                </>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>No outstanding invoices found for this customer.</p>
              <p className="text-sm mt-1">This payment will be recorded as an advance payment.</p>
            </div>
          )}
          
          {errors.invoices && (
            <p className="mt-2 text-sm text-red-600">{errors.invoices}</p>
          )}
        </div>
      )}

      {/* Remarks */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Remarks (Optional)
        </label>
        <div className="relative">
          <MessageCircle className="w-5 h-5 absolute left-3 top-3 text-gray-400" />
          <textarea
            value={formData.remarks}
            onChange={(e) => setFormData(prev => ({ ...prev, remarks: e.target.value }))}
            rows={2}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Add any remarks or notes..."
          />
        </div>
      </div>
    </div>
  );


  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-gray-50 z-40 flex flex-col">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <CreditCard className="w-6 h-6 text-blue-600" />
            <h1 className="text-xl font-bold text-gray-900">Payment Entry</h1>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={checkLocalPayments}
              className="text-sm text-amber-600 hover:text-amber-800 flex items-center space-x-1 px-3 py-1 hover:bg-amber-50 rounded-lg transition-colors"
              title="Check locally stored payments"
            >
              <AlertCircle className="w-4 h-4" />
              <span>Local</span>
            </button>
            {formData.party && (
              <button
                onClick={() => setShowPaymentHistory(true)}
                className="text-sm text-gray-600 hover:text-gray-900 flex items-center space-x-1 px-3 py-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <History className="w-4 h-4" />
                <span>History</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className="px-6 py-6">
          <div className="max-w-4xl mx-auto">
            {renderContent()}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-white border-t border-gray-200 p-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          {/* Total Amount Display */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
            <p className="text-xs text-blue-600 font-medium">Total Payment Amount</p>
            <p className="text-xl font-bold text-blue-700">
              ₹{formData.paymentMethods.reduce((sum, mode) => sum + (parseFloat(mode.amount) || 0), 0).toLocaleString()}
            </p>
          </div>
          
          <div className="flex items-center space-x-4">
            <button
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            
            <button
              onClick={handleSave}
              disabled={loading || !formData.party || !formData.paymentType || formData.paymentMethods.every(m => !m.mode || !m.amount)}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Save Payment</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EnterprisePaymentEntry;