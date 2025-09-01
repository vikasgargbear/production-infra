import React, { useEffect } from 'react';
import { Calendar, FileText, Hash, Receipt } from 'lucide-react';
import { usePayment } from '../../../contexts/PaymentContext';
import { Card } from '../../global';
import EnhancedPaymentMethod from './EnhancedPaymentMethod';

interface PaymentType {
  value: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
}

interface QuickPaymentEvent extends CustomEvent {
  detail: number;
}

const PaymentDetailsEnhanced: React.FC = () => {
  const { 
    payment, 
    setPaymentField, 
    errors, 
    clearError,
    setError 
  } = usePayment();

  // Quick payment amount handler
  useEffect(() => {
    const handleQuickPayment = (event: QuickPaymentEvent) => {
      setPaymentField('amount', event.detail.toString());
    };

    window.addEventListener('quickPayment', handleQuickPayment as EventListener);
    return () => window.removeEventListener('quickPayment', handleQuickPayment as EventListener);
  }, [setPaymentField]);

  const handleFieldChange = (field: string, value: string): void => {
    setPaymentField(field, value);
    
    // Clear error when user starts typing
    if (errors[field]) {
      clearError(field);
    }

    // Basic validation
    if (field === 'amount') {
      const amount = parseFloat(value);
      if (value && (isNaN(amount) || amount <= 0)) {
        setError(field, 'Please enter a valid amount');
      }
    }
  };

  const handlePaymentMethodsChange = (methods: any[]) => {
    // If single payment
    if (methods.length === 1) {
      setPaymentField('payment_mode', methods[0].type.toUpperCase());
      setPaymentField('reference_number', methods[0].reference || '');
      setPaymentField('bank_name', methods[0].bankName || '');
      setPaymentField('cheque_number', methods[0].chequeNumber || '');
      setPaymentField('cheque_date', methods[0].chequeDate || '');
    } else {
      // For split payments, store as JSON
      setPaymentField('payment_methods', methods);
      setPaymentField('payment_mode', 'SPLIT');
    }
  };

  const paymentTypes: PaymentType[] = [
    { value: 'order_payment', label: 'Order Payment', icon: Receipt },
    { value: 'advance', label: 'Advance Payment', icon: FileText },
    { value: 'adjustment', label: 'Adjustment', icon: FileText }
  ];

  return (
    <div className="space-y-6">
      {/* Basic Payment Info Card */}
      <Card>
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
          <Receipt className="w-5 h-5 mr-2 text-indigo-600" />
          Payment Information
        </h3>
        
        <div className="space-y-4">
          {/* Row 1: Amount, Date, and Type */}
          <div className="grid grid-cols-3 gap-4">
            {/* Payment Amount - More prominent */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Payment Amount <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-indigo-600 font-bold text-lg">₹</span>
                <input
                  type="number"
                  value={payment.amount}
                  onChange={(e) => handleFieldChange('amount', e.target.value)}
                  className={`w-full pl-10 pr-3 py-3 text-lg font-semibold border-2 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all ${
                    errors.amount ? 'border-red-500 bg-red-50' : 'border-gray-300 hover:border-gray-400'
                  }`}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  required
                  autoFocus
                />
                {errors.amount && (
                  <p className="mt-1 text-sm text-red-600">{errors.amount}</p>
                )}
              </div>
              
              {/* Quick Amount Buttons */}
              <div className="flex gap-2 mt-2">
                {[100, 500, 1000, 5000].map(amt => (
                  <button
                    key={amt}
                    onClick={() => handleFieldChange('amount', amt.toString())}
                    className="px-3 py-1 text-xs font-medium bg-gray-100 hover:bg-indigo-100 text-gray-700 hover:text-indigo-700 rounded-md transition-colors"
                  >
                    ₹{amt}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Payment Date */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Payment Date <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="date"
                  value={payment.payment_date || new Date().toISOString().split('T')[0]}
                  onChange={(e) => handleFieldChange('payment_date', e.target.value)}
                  className="w-full pl-11 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors hover:border-gray-400"
                />
              </div>
            </div>

            {/* Payment Type */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Payment Type
              </label>
              <div className="relative">
                <FileText className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <select
                  value={payment.payment_type || 'order_payment'}
                  onChange={(e) => handleFieldChange('payment_type', e.target.value)}
                  className="w-full pl-11 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors hover:border-gray-400"
                >
                  {paymentTypes.map((type: PaymentType) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Row 2: Receipt Number and Notes */}
          <div className="grid grid-cols-2 gap-4">
            {/* Receipt/Reference Number */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Receipt Number
              </label>
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={payment.receipt_no || ''}
                  onChange={(e) => handleFieldChange('receipt_no', e.target.value)}
                  className="w-full pl-11 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors hover:border-gray-400"
                  placeholder="Auto-generated"
                  readOnly
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Notes / Remarks
              </label>
              <input
                type="text"
                value={payment.notes || ''}
                onChange={(e) => handleFieldChange('notes', e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors hover:border-gray-400"
                placeholder="Optional notes"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Enhanced Payment Method Selection */}
      <Card>
        <EnhancedPaymentMethod
          totalAmount={parseFloat(payment.amount) || 0}
          onPaymentMethodsChange={handlePaymentMethodsChange}
          defaultMethod={payment.default_payment_method || 'cash'}
        />
      </Card>
    </div>
  );
};

export default PaymentDetailsEnhanced;