import React from 'react';
import { Calendar, Receipt } from 'lucide-react';
import { usePayment } from '../../../contexts/PaymentContext';
import { Card } from '../../global';

const PaymentDetailsSimple: React.FC = () => {
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

    if (field === 'amount') {
      const amount = parseFloat(value);
      if (value && (isNaN(amount) || amount <= 0)) {
        setError(field, 'Enter valid amount');
      }
    }
  };

  // Big, clear payment mode buttons - like phone apps
  const paymentModes = [
    { value: 'CASH', label: 'Cash', icon: '💵', color: 'green' },
    { value: 'UPI', label: 'UPI', icon: '📱', color: 'purple' },
    { value: 'CARD', label: 'Card', icon: '💳', color: 'blue' },
    { value: 'BANK_TRANSFER', label: 'Bank', icon: '🏦', color: 'indigo' },
    { value: 'CHEQUE', label: 'Cheque', icon: '📄', color: 'gray' }
  ];

  const needsReference = ['UPI', 'BANK_TRANSFER', 'CHEQUE'].includes(payment.payment_mode);

  return (
    <Card className="p-6">
      {/* Amount - Big and Clear */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Enter Payment Amount
        </label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-3xl text-green-600 font-bold">₹</span>
          <input
            type="number"
            value={payment.amount}
            onChange={(e) => handleFieldChange('amount', e.target.value)}
            className={`w-full pl-14 pr-4 py-4 text-3xl font-bold border-2 rounded-xl focus:outline-none focus:ring-4 focus:ring-green-100 focus:border-green-500 ${
              errors.amount ? 'border-red-500 bg-red-50' : 'border-gray-300'
            }`}
            placeholder="0"
            step="1"
            autoFocus
          />
        </div>
        {errors.amount && (
          <p className="text-sm text-red-500 mt-2 flex items-center">
            <span className="mr-1">⚠️</span> {errors.amount}
          </p>
        )}
      </div>

      {/* Payment Mode - Big Touch-Friendly Buttons */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Select Payment Method
        </label>
        <div className="grid grid-cols-3 gap-3">
          {paymentModes.map(mode => (
            <button
              key={mode.value}
              type="button"
              onClick={() => setPaymentField('payment_mode', mode.value)}
              className={`p-4 rounded-xl border-2 transition-all ${
                payment.payment_mode === mode.value
                  ? `border-${mode.color}-500 bg-${mode.color}-50 ring-2 ring-${mode.color}-200`
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className="text-2xl mb-1">{mode.icon}</div>
              <div className={`text-sm font-medium ${
                payment.payment_mode === mode.value ? `text-${mode.color}-700` : 'text-gray-700'
              }`}>
                {mode.label}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Reference Number - Only when needed */}
      {needsReference && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
          <label className="block text-sm font-medium text-blue-900 mb-2">
            Enter {payment.payment_mode === 'UPI' ? 'UPI Transaction ID' : 
                   payment.payment_mode === 'CHEQUE' ? 'Cheque Number' : 
                   'Reference Number'} <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={payment.reference_number || ''}
            onChange={(e) => handleFieldChange('reference_number', e.target.value)}
            className="w-full px-4 py-3 text-lg border-2 border-blue-300 rounded-lg focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-500"
            placeholder={payment.payment_mode === 'UPI' ? 'Enter UPI ID' : 'Enter reference'}
            required={needsReference}
          />
        </div>
      )}

      {/* Date and Receipt - Side by side */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Payment Date
          </label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="date"
              value={payment.payment_date || new Date().toISOString().split('T')[0]}
              onChange={(e) => handleFieldChange('payment_date', e.target.value)}
              className="w-full pl-10 pr-3 py-3 text-base border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Receipt Number
          </label>
          <div className="relative">
            <Receipt className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={payment.receipt_no || 'AUTO'}
              className="w-full pl-10 pr-3 py-3 text-base border-2 border-gray-200 rounded-lg bg-gray-50"
              readOnly
            />
          </div>
        </div>
      </div>

      {/* Payment Type - Clear Radio Buttons */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Payment For
        </label>
        <div className="space-y-2">
          {[
            { value: 'order_payment', label: 'Order Payment', desc: 'Payment against invoices' },
            { value: 'advance', label: 'Advance Payment', desc: 'Advance for future orders' },
            { value: 'adjustment', label: 'Adjustment', desc: 'Adjustment entry' }
          ].map(type => (
            <label
              key={type.value}
              className={`flex items-start p-3 rounded-lg border-2 cursor-pointer transition-all ${
                payment.payment_type === type.value
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                name="payment_type"
                value={type.value}
                checked={payment.payment_type === type.value}
                onChange={(e) => handleFieldChange('payment_type', e.target.value)}
                className="mt-1 mr-3"
              />
              <div>
                <div className="font-medium text-gray-900">{type.label}</div>
                <div className="text-sm text-gray-600">{type.desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Notes - Optional */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Notes (Optional)
        </label>
        <textarea
          value={payment.notes || ''}
          onChange={(e) => handleFieldChange('notes', e.target.value)}
          className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-500"
          placeholder="Add any notes or remarks..."
          rows={2}
        />
      </div>
    </Card>
  );
};

export default PaymentDetailsSimple;