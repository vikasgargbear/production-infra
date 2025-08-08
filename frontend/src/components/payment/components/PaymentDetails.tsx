import React, { useEffect } from 'react';
import { DollarSign, CreditCard, Hash, FileText, MessageSquare } from 'lucide-react';
import { usePayment } from '../../../contexts/PaymentContext';
import { 
  Card
} from '../../global';
import { 
  FormRow
} from '../../common';

interface PaymentMode {
  value: string;
  label: string;
  icon: string;
}

interface PaymentType {
  value: string;
  label: string;
}

interface QuickPaymentEvent extends CustomEvent {
  detail: number;
}

const PaymentDetailsV3: React.FC = () => {
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

  const paymentModes: PaymentMode[] = [
    { value: 'CASH', label: 'Cash', icon: '💵' },
    { value: 'UPI', label: 'UPI', icon: '📱' },
    { value: 'CARD', label: 'Card', icon: '💳' },
    { value: 'BANK_TRANSFER', label: 'Bank Transfer', icon: '🏦' },
    { value: 'CHEQUE', label: 'Cheque', icon: '📄' }
  ];

  const paymentTypes: PaymentType[] = [
    { value: 'order_payment', label: 'Order Payment' },
    { value: 'advance', label: 'Advance Payment' },
    { value: 'adjustment', label: 'Adjustment' }
  ];

  // Determine if reference number is required
  const isReferenceRequired = ['UPI', 'BANK_TRANSFER', 'CHEQUE'].includes(payment.payment_mode);

  return (
    <Card>
      <h3 className="text-sm font-medium text-gray-700 mb-4">Payment Information</h3>
      
      <div className="space-y-4">
        <FormRow>
          {/* Payment Amount */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Amount <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="number"
                value={payment.amount}
                onChange={(e) => handleFieldChange('amount', e.target.value)}
                className={`w-full pl-10 pr-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
                  errors.amount ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="0.00"
                min="0"
                step="0.01"
                required
              />
              {errors.amount && (
                <p className="mt-1 text-sm text-red-600">{errors.amount}</p>
              )}
            </div>
          </div>

          {/* Payment Mode */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Payment Mode <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <CreditCard className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <select
                value={payment.payment_mode}
                onChange={(e) => handleFieldChange('payment_mode', e.target.value)}
                className={`w-full pl-10 pr-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
                  errors.payment_mode ? 'border-red-500' : 'border-gray-300'
                }`}
              >
                <option value="">Select mode</option>
                {paymentModes.map((mode: PaymentMode) => (
                  <option key={mode.value} value={mode.value}>
                    {mode.icon} {mode.label}
                  </option>
                ))}
              </select>
              {errors.payment_mode && (
                <p className="text-xs text-red-600 mt-1">{errors.payment_mode}</p>
              )}
            </div>
          </div>
        </FormRow>

        <FormRow>
          {/* Reference Number */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Reference Number{isReferenceRequired && <span className="text-red-500"> *</span>}
            </label>
            <div className="relative">
              <Hash className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={payment.reference_number}
                onChange={(e) => handleFieldChange('reference_number', e.target.value)}
                className={`w-full pl-10 pr-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
                  errors.reference_number ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder={
                  payment.payment_mode === 'UPI' ? 'UPI ID' :
                  payment.payment_mode === 'BANK_TRANSFER' ? 'Transaction ID' :
                  payment.payment_mode === 'CHEQUE' ? 'Cheque No.' :
                  'Reference'
                }
                required={isReferenceRequired}
              />
              {errors.reference_number && (
                <p className="mt-1 text-sm text-red-600">{errors.reference_number}</p>
              )}
            </div>
          </div>

          {/* Payment Type */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Type <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <FileText className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <select
                value={payment.payment_type}
                onChange={(e) => handleFieldChange('payment_type', e.target.value)}
                className={`w-full pl-10 pr-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
                  errors.payment_type ? 'border-red-500' : 'border-gray-300'
                }`}
              >
                <option value="">Select type</option>
                {paymentTypes.map((type: PaymentType) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              {errors.payment_type && (
                <p className="text-xs text-red-600 mt-1">{errors.payment_type}</p>
              )}
            </div>
          </div>
        </FormRow>

        {/* Remarks - Optional */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">Remarks</label>
          <textarea
            value={payment.remarks}
            onChange={(e) => handleFieldChange('remarks', e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
            placeholder="Add notes (optional)"
            rows={2}
          />
        </div>

        {/* Quick Summary */}
        {payment.amount && payment.payment_mode && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                {paymentModes.find((m: PaymentMode) => m.value === payment.payment_mode)?.label}
              </span>
              <span className="text-sm text-gray-600">
                {paymentTypes.find((t: PaymentType) => t.value === payment.payment_type)?.label || 'Payment'}
              </span>
            </div>
            <span className="text-lg font-bold text-amber-900">
              ₹{parseFloat(payment.amount).toFixed(2)}
            </span>
          </div>
        )}
      </div>
    </Card>
  );
};

export default PaymentDetailsV3;