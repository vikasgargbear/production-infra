import React, { useState } from 'react';
import { Calendar, Receipt, Plus, X, Check } from 'lucide-react';
import { usePayment } from '../../../contexts/PaymentContext';
import { Card } from '../../global';

interface PaymentMethod {
  type: string;
  amount: string;
  reference?: string;
}

const PaymentDetailsOptimized: React.FC = () => {
  const { 
    payment, 
    setPaymentField, 
    errors,
    clearError,
    setError
  } = usePayment();

  const [enableSplit, setEnableSplit] = useState(false);
  const [splitMethods, setSplitMethods] = useState<PaymentMethod[]>([
    { type: 'CASH', amount: '' }
  ]);

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

  // Payment mode buttons with keyboard shortcuts
  const paymentModes = [
    { value: 'CASH', label: 'Cash', icon: '💵', shortcut: 'C' },
    { value: 'UPI', label: 'UPI', icon: '📱', shortcut: 'U' },
    { value: 'CARD', label: 'Card', icon: '💳', shortcut: 'D' },
    { value: 'BANK_TRANSFER', label: 'Bank', icon: '🏦', shortcut: 'B' },
    { value: 'CHEQUE', label: 'Cheque', icon: '📄', shortcut: 'Q' }
  ];

  const needsReference = ['UPI', 'BANK_TRANSFER', 'CHEQUE'].includes(payment.payment_mode);

  // Keyboard shortcuts
  React.useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Alt + key for payment modes
      if (e.altKey && !enableSplit) {
        const mode = paymentModes.find(m => m.shortcut === e.key.toUpperCase());
        if (mode) {
          e.preventDefault();
          setPaymentField('payment_mode', mode.value);
        }
      }
      // Alt + S for split toggle
      if (e.altKey && e.key === 's') {
        e.preventDefault();
        setEnableSplit(!enableSplit);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [enableSplit, payment.payment_mode]);

  const addSplitMethod = () => {
    setSplitMethods([...splitMethods, { type: 'CASH', amount: '' }]);
  };

  const removeSplitMethod = (index: number) => {
    setSplitMethods(splitMethods.filter((_, i) => i !== index));
  };

  const updateSplitMethod = (index: number, field: string, value: string) => {
    const updated = [...splitMethods];
    updated[index] = { ...updated[index], [field]: value };
    setSplitMethods(updated);
  };

  const totalSplitAmount = splitMethods.reduce((sum, m) => sum + parseFloat(m.amount || '0'), 0);

  return (
    <Card className="p-5">
      <div className="space-y-4">
        {/* Amount Input - Prominent but not too big */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Payment Amount <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xl text-green-600 font-bold">₹</span>
            <input
              type="number"
              value={payment.amount}
              onChange={(e) => handleFieldChange('amount', e.target.value)}
              className={`w-full pl-10 pr-3 py-2.5 text-xl font-semibold border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${
                errors.amount ? 'border-red-500 bg-red-50' : 'border-gray-300'
              }`}
              placeholder="0"
              step="1"
              autoFocus
              tabIndex={1}
            />
          </div>
          {errors.amount && (
            <p className="text-xs text-red-500 mt-1">{errors.amount}</p>
          )}
        </div>

        {/* Split Payment Toggle - Compact */}
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={enableSplit}
              onChange={(e) => setEnableSplit(e.target.checked)}
              className="mr-2"
              tabIndex={2}
            />
            <span className="text-sm font-medium text-gray-700">Split Payment</span>
            <span className="ml-2 text-xs text-gray-500">(Alt+S)</span>
          </label>
          {enableSplit && (
            <span className="text-sm text-blue-600">
              Total: ₹{totalSplitAmount.toFixed(2)} / ₹{payment.amount || '0'}
            </span>
          )}
        </div>

        {/* Payment Mode Selection */}
        {!enableSplit ? (
          <>
            {/* Single Payment Mode - Compact Grid */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Payment Method
              </label>
              <div className="grid grid-cols-5 gap-2">
                {paymentModes.map((mode, index) => (
                  <button
                    key={mode.value}
                    type="button"
                    onClick={() => setPaymentField('payment_mode', mode.value)}
                    className={`p-3 rounded-lg border-2 transition-all text-center ${
                      payment.payment_mode === mode.value
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    tabIndex={3 + index}
                  >
                    <div className="text-xl mb-1">{mode.icon}</div>
                    <div className="text-xs font-medium">{mode.label}</div>
                    <div className="text-xs text-gray-400">Alt+{mode.shortcut}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Reference Number - Inline when needed */}
            {needsReference && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {payment.payment_mode === 'UPI' ? 'UPI ID' : 
                   payment.payment_mode === 'CHEQUE' ? 'Cheque No.' : 
                   'Reference'} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={payment.reference_number || ''}
                  onChange={(e) => handleFieldChange('reference_number', e.target.value)}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter reference"
                  required={needsReference}
                  tabIndex={8}
                />
              </div>
            )}
          </>
        ) : (
          /* Split Payment Methods - Compact List */
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Split Methods
            </label>
            <div className="space-y-2">
              {splitMethods.map((method, index) => (
                <div key={index} className="flex items-center gap-2">
                  <select
                    value={method.type}
                    onChange={(e) => updateSplitMethod(index, 'type', e.target.value)}
                    className="px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    tabIndex={10 + index * 3}
                  >
                    {paymentModes.map(mode => (
                      <option key={mode.value} value={mode.value}>
                        {mode.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={method.amount}
                    onChange={(e) => updateSplitMethod(index, 'amount', e.target.value)}
                    placeholder="Amount"
                    className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    tabIndex={11 + index * 3}
                  />
                  {['UPI', 'BANK_TRANSFER', 'CHEQUE'].includes(method.type) && (
                    <input
                      type="text"
                      value={method.reference || ''}
                      onChange={(e) => updateSplitMethod(index, 'reference', e.target.value)}
                      placeholder="Ref"
                      className="w-24 px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      tabIndex={12 + index * 3}
                    />
                  )}
                  {splitMethods.length > 1 && (
                    <button
                      onClick={() => removeSplitMethod(index)}
                      className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                      tabIndex={-1}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={addSplitMethod}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg"
                tabIndex={50}
              >
                <Plus className="w-4 h-4" />
                Add Method
              </button>
            </div>
          </div>
        )}

        {/* Date, Type and Receipt - Single Row */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Date
            </label>
            <div className="relative">
              <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="date"
                value={payment.payment_date || new Date().toISOString().split('T')[0]}
                onChange={(e) => handleFieldChange('payment_date', e.target.value)}
                className="w-full pl-8 pr-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                tabIndex={60}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Type
            </label>
            <select
              value={payment.payment_type || 'order_payment'}
              onChange={(e) => handleFieldChange('payment_type', e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              tabIndex={61}
            >
              <option value="order_payment">Order</option>
              <option value="advance">Advance</option>
              <option value="adjustment">Adjustment</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Receipt
            </label>
            <div className="relative">
              <Receipt className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={payment.receipt_no || 'AUTO'}
                className="w-full pl-8 pr-2 py-1.5 text-sm border border-gray-200 rounded bg-gray-50"
                readOnly
                tabIndex={-1}
              />
            </div>
          </div>
        </div>

        {/* Notes - Expandable */}
        <details className="group">
          <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-900">
            + Add Notes
          </summary>
          <textarea
            value={payment.notes || ''}
            onChange={(e) => handleFieldChange('notes', e.target.value)}
            className="mt-2 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter notes..."
            rows={2}
            tabIndex={70}
          />
        </details>
      </div>

      {/* Keyboard Shortcuts Help */}
      <div className="mt-4 pt-3 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          Keyboard: Tab to navigate • Alt+C/U/D/B/Q for payment modes • Alt+S for split • Enter to proceed
        </p>
      </div>
    </Card>
  );
};

export default PaymentDetailsOptimized;