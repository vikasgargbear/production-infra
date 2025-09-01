import React, { useState, useRef, useEffect } from 'react';
import { Calendar, Check } from 'lucide-react';
import { usePayment } from '../../../contexts/PaymentContext';
import { Card } from '../../global';
import { CustomerSearch } from '../../global';

interface SplitPayment {
  type: string;
  amount: string;
  reference?: string;
}

const PaymentFlowOptimized: React.FC = () => {
  const { 
    payment, 
    selectedCustomer,
    setCustomer,
    setPaymentField, 
    errors,
    clearError,
    setError
  } = usePayment();

  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitPayments, setSplitPayments] = useState<SplitPayment[]>([
    { type: 'CASH', amount: '' },
    { type: 'UPI', amount: '' }
  ]);

  const amountRef = useRef<HTMLInputElement>(null);
  const customerSearchRef = useRef<any>(null);

  // Auto-focus amount when customer is selected
  useEffect(() => {
    if (selectedCustomer && amountRef.current) {
      setTimeout(() => {
        amountRef.current?.focus();
        amountRef.current?.select();
      }, 100);
    }
  }, [selectedCustomer]);

  // Auto-focus customer search on mount
  useEffect(() => {
    if (!selectedCustomer) {
      customerSearchRef.current?.focus();
    }
  }, []);

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

  const handleCustomerSelect = (customer: any) => {
    setCustomer(customer);
  };

  // Payment modes including split
  const paymentModes = [
    { value: 'CASH', label: 'Cash', icon: '💵', color: 'green' },
    { value: 'UPI', label: 'UPI', icon: '📱', color: 'purple' },
    { value: 'CARD', label: 'Card', icon: '💳', color: 'blue' },
    { value: 'BANK_TRANSFER', label: 'Bank', icon: '🏦', color: 'indigo' },
    { value: 'CHEQUE', label: 'Cheque', icon: '📄', color: 'gray' },
    { value: 'SPLIT', label: 'Split', icon: '➗', color: 'orange' }
  ];

  const needsReference = ['UPI', 'BANK_TRANSFER', 'CHEQUE'].includes(payment.payment_mode);

  const handlePaymentModeSelect = (mode: string) => {
    if (mode === 'SPLIT') {
      setShowSplitModal(true);
      setPaymentField('payment_mode', 'SPLIT');
    } else {
      setPaymentField('payment_mode', mode);
      setShowSplitModal(false);
    }
  };

  const updateSplitPayment = (index: number, field: string, value: string) => {
    const updated = [...splitPayments];
    updated[index] = { ...updated[index], [field]: value };
    setSplitPayments(updated);
    
    // Update payment field with split details
    setPaymentField('split_payments', JSON.stringify(updated));
  };

  const totalSplitAmount = splitPayments.reduce((sum, p) => sum + parseFloat(p.amount || '0'), 0);

  return (
    <div className="space-y-4">
      {/* Customer Selection */}
      {!selectedCustomer ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">SELECT CUSTOMER</h3>
          <Card className="p-5">
            <CustomerSearch
              ref={customerSearchRef}
              value={selectedCustomer}
              onChange={handleCustomerSelect}
              displayMode="inline"
              placeholder="Search customer by name, phone, or code..."
              required
              autoFocus
            />
          </Card>
        </div>
      ) : (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">CUSTOMER</h3>
          <Card className="p-3 bg-green-50 border border-green-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Check className="w-4 h-4 text-green-600" />
                <p className="font-medium text-gray-900">{selectedCustomer.customer_name}</p>
              </div>
              <button
                onClick={() => setCustomer(null)}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                Change
              </button>
            </div>
          </Card>
        </div>
      )}

      {/* Payment Details - Only show after customer selection */}
      {selectedCustomer && (
        <div className="space-y-4">
          {/* Date and Type - First */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="date"
                  value={payment.payment_date || new Date().toISOString().split('T')[0]}
                  onChange={(e) => handleFieldChange('payment_date', e.target.value)}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Type</label>
              <select
                value={payment.payment_type || 'order_payment'}
                onChange={(e) => handleFieldChange('payment_type', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="order_payment">Order Payment</option>
                <option value="advance">Advance</option>
                <option value="adjustment">Adjustment</option>
              </select>
            </div>
          </div>

          {/* Amount Input */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">PAYMENT AMOUNT</h3>
            <Card className="p-4">
              <div>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl text-green-600 font-bold">₹</span>
                  <input
                    ref={amountRef}
                    type="number"
                    value={payment.amount}
                    onChange={(e) => handleFieldChange('amount', e.target.value)}
                    className={`w-full pl-12 pr-4 py-3 text-2xl font-bold border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 ${
                      errors.amount ? 'border-red-500 bg-red-50' : 'border-gray-300'
                    }`}
                    placeholder="0"
                    step="1"
                  />
                </div>
                {errors.amount && (
                  <p className="text-sm text-red-500 mt-1">{errors.amount}</p>
                )}
              </div>
            </Card>
          </div>

          {/* Payment Mode Selection */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">PAYMENT METHOD</h3>
            <div className="grid grid-cols-3 gap-2">
              {paymentModes.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => handlePaymentModeSelect(mode.value)}
                  className={`p-3 rounded-lg border transition-all ${
                    payment.payment_mode === mode.value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                  }`}
                >
                  <div className="text-xl mb-1">{mode.icon}</div>
                  <div className="text-xs font-medium text-gray-700">{mode.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Reference Number - Optional */}
          {needsReference && (
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <label className="block text-sm font-medium text-gray-600 mb-2">
                {payment.payment_mode === 'UPI' ? 'UPI Transaction ID' : 
                 payment.payment_mode === 'CHEQUE' ? 'Cheque Number' : 
                 'Reference Number'} <span className="text-xs text-gray-500">(Optional)</span>
              </label>
              <input
                type="text"
                value={payment.reference_number || ''}
                onChange={(e) => handleFieldChange('reference_number', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter reference (optional)"
              />
            </div>
          )}

          {/* Split Payment - Inline */}
          {showSplitModal && (
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <h4 className="text-sm font-medium text-gray-700 mb-3">Split Payment Details</h4>
              <div className="space-y-2">
                {splitPayments.map((split, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <select
                      value={split.type}
                      onChange={(e) => updateSplitPayment(index, 'type', e.target.value)}
                      className="px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="CASH">Cash</option>
                      <option value="UPI">UPI</option>
                      <option value="CARD">Card</option>
                      <option value="BANK_TRANSFER">Bank</option>
                    </select>
                    <div className="relative flex-1">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-gray-600 font-bold">₹</span>
                      <input
                        type="number"
                        value={split.amount}
                        onChange={(e) => updateSplitPayment(index, 'amount', e.target.value)}
                        placeholder="Amount"
                        className="w-full pl-6 pr-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    {['UPI', 'BANK_TRANSFER'].includes(split.type) && (
                      <input
                        type="text"
                        value={split.reference || ''}
                        onChange={(e) => updateSplitPayment(index, 'reference', e.target.value)}
                        placeholder="Ref (opt)"
                        className="w-20 px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    )}
                  </div>
                ))}
                <div className="flex justify-between items-center pt-2 border-t">
                  <span className="text-xs font-medium">
                    Total: ₹{totalSplitAmount.toFixed(2)} / ₹{payment.amount || '0'}
                  </span>
                  {totalSplitAmount !== parseFloat(payment.amount || '0') && (
                    <span className="text-xs text-red-600">
                      Difference: ₹{Math.abs(totalSplitAmount - parseFloat(payment.amount || '0')).toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
};

export default PaymentFlowOptimized;