import React from 'react';
import { Calendar, Receipt, CreditCard, Hash } from 'lucide-react';
import { usePayment } from '../../../contexts/PaymentContext';

const PaymentDetailsCompact: React.FC = () => {
  const { 
    payment, 
    setPaymentField, 
    errors,
    clearError,
    setError
  } = usePayment();

  const handleFieldChange = (field: string, value: string): void => {
    setPaymentField(field, value);
    if (errors[field]) {
      clearError(field);
    }

    // Basic validation for amount
    if (field === 'amount') {
      const amount = parseFloat(value);
      if (value && (isNaN(amount) || amount <= 0)) {
        setError(field, 'Invalid amount');
      }
    }
  };

  const paymentModes = [
    { value: 'CASH', label: '💵 Cash' },
    { value: 'UPI', label: '📱 UPI' },
    { value: 'CARD', label: '💳 Card' },
    { value: 'BANK_TRANSFER', label: '🏦 Bank' },
    { value: 'CHEQUE', label: '📄 Cheque' }
  ];

  const needsReference = ['UPI', 'BANK_TRANSFER', 'CHEQUE'].includes(payment.payment_mode);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      {/* Single row for all payment details */}
      <div className="flex items-center gap-4 flex-wrap">
        {/* Amount - Most prominent */}
        <div className="flex-none">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-green-600 font-bold">₹</span>
            <input
              type="number"
              value={payment.amount}
              onChange={(e) => handleFieldChange('amount', e.target.value)}
              className={`w-36 pl-8 pr-2 py-2 text-lg font-bold border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${
                errors.amount ? 'border-red-500 bg-red-50' : 'border-gray-300'
              }`}
              placeholder="0.00"
              step="0.01"
              autoFocus
            />
          </div>
          {errors.amount && (
            <p className="text-xs text-red-500 mt-1">{errors.amount}</p>
          )}
        </div>

        {/* Date */}
        <div className="flex-none">
          <div className="relative">
            <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="date"
              value={payment.payment_date || new Date().toISOString().split('T')[0]}
              onChange={(e) => handleFieldChange('payment_date', e.target.value)}
              className="pl-8 pr-2 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Payment Mode */}
        <div className="flex-none">
          <select
            value={payment.payment_mode || 'CASH'}
            onChange={(e) => handleFieldChange('payment_mode', e.target.value)}
            className="px-3 py-2 text-sm font-medium border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {paymentModes.map(mode => (
              <option key={mode.value} value={mode.value}>
                {mode.label}
              </option>
            ))}
          </select>
        </div>

        {/* Reference Number - Only show when needed */}
        {needsReference && (
          <div className="flex-none">
            <div className="relative">
              <Hash className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={payment.reference_number || ''}
                onChange={(e) => handleFieldChange('reference_number', e.target.value)}
                className="w-32 pl-8 pr-2 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Reference"
                required={needsReference}
              />
            </div>
          </div>
        )}

        {/* Payment Type */}
        <div className="flex-none">
          <select
            value={payment.payment_type || 'order_payment'}
            onChange={(e) => handleFieldChange('payment_type', e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="order_payment">Order Payment</option>
            <option value="advance">Advance</option>
            <option value="adjustment">Adjustment</option>
          </select>
        </div>

        {/* Receipt Number - Auto-generated, smaller */}
        <div className="flex-none ml-auto">
          <div className="flex items-center space-x-2 text-sm text-gray-500">
            <Receipt className="w-4 h-4" />
            <span className="font-mono">{payment.receipt_no || 'AUTO'}</span>
          </div>
        </div>
      </div>

      {/* Optional Notes - Only if needed, as a second row */}
      <div className="mt-3 pt-3 border-t border-gray-100">
        <input
          type="text"
          value={payment.notes || ''}
          onChange={(e) => handleFieldChange('notes', e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Add notes or remarks (optional)"
        />
      </div>
    </div>
  );
};

export default PaymentDetailsCompact;