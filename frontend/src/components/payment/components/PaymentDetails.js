import React, { useEffect } from 'react';
import { DollarSign, CreditCard, Hash, FileText, MessageSquare } from 'lucide-react';
import { usePayment } from '../../../contexts/PaymentContext';
import { 
  Card, 
  Badge
} from '../../global';
import { 
  FormInput, 
  FormRow
} from '../../common';

const PaymentDetailsV3 = () => {
  const { 
    payment, 
    setPaymentField, 
    errors, 
    clearError,
    setError 
  } = usePayment();

  // Quick payment amount handler
  useEffect(() => {
    const handleQuickPayment = (event) => {
      setPaymentField('amount', event.detail.toString());
    };

    window.addEventListener('quickPayment', handleQuickPayment);
    return () => window.removeEventListener('quickPayment', handleQuickPayment);
  }, [setPaymentField]);

  const handleFieldChange = (field, value) => {
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

  const paymentModes = [
    { value: 'CASH', label: 'Cash', icon: '💵' },
    { value: 'UPI', label: 'UPI', icon: '📱' },
    { value: 'CARD', label: 'Card', icon: '💳' },
    { value: 'BANK_TRANSFER', label: 'Bank Transfer', icon: '🏦' },
    { value: 'CHEQUE', label: 'Cheque', icon: '📄' }
  ];

  const paymentTypes = [
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
          <FormInput
            label="Amount"
            type="number"
            value={payment.amount}
            onChange={(e) => handleFieldChange('amount', e.target.value)}
            error={errors.amount}
            required
            icon={<DollarSign className="w-4 h-4" />}
            placeholder="0.00"
            min="0"
            step="0.01"
          />

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
                {paymentModes.map(mode => (
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
          <FormInput
            label={`Reference Number${isReferenceRequired ? ' *' : ''}`}
            type="text"
            value={payment.reference_number}
            onChange={(e) => handleFieldChange('reference_number', e.target.value)}
            error={errors.reference_number}
            required={isReferenceRequired}
            icon={<Hash className="w-4 h-4" />}
            placeholder={
              payment.payment_mode === 'UPI' ? 'UPI ID' :
              payment.payment_mode === 'BANK_TRANSFER' ? 'Transaction ID' :
              payment.payment_mode === 'CHEQUE' ? 'Cheque No.' :
              'Reference'
            }
          />

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
                {paymentTypes.map(type => (
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
        <FormInput
          label="Remarks"
          type="textarea"
          value={payment.remarks}
          onChange={(e) => handleFieldChange('remarks', e.target.value)}
          placeholder="Add notes (optional)"
          rows={2}
        />

        {/* Quick Summary */}
        {payment.amount && payment.payment_mode && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Badge variant="warning">
                {paymentModes.find(m => m.value === payment.payment_mode)?.label}
              </Badge>
              <span className="text-sm text-gray-600">
                {paymentTypes.find(t => t.value === payment.payment_type)?.label || 'Payment'}
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