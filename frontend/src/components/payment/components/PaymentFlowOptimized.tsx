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
      {/* Step 1: Customer Selection - Most Prominent */}
      {!selectedCustomer ? (
        <Card className="p-6 border-2 border-blue-200 bg-blue-50/30">
          <div className="space-y-4">
            <div className="flex items-center space-x-2 mb-4">
              <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-bold">1</div>
              <h3 className="text-lg font-semibold text-gray-800">Select Customer</h3>
            </div>
            <CustomerSearch
              ref={customerSearchRef}
              value={selectedCustomer}
              onChange={handleCustomerSelect}
              displayMode="inline"
              placeholder="Search customer by name, phone, or code..."
              required
              autoFocus
            />
          </div>
        </Card>
      ) : (
        <Card className="p-4 bg-green-50 border border-green-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Check className="w-5 h-5 text-green-600" />
              <div>
                <p className="text-sm text-gray-600">Customer</p>
                <p className="font-semibold text-gray-900">{selectedCustomer.customer_name}</p>
              </div>
            </div>
            <button
              onClick={() => setCustomer(null)}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              Change
            </button>
          </div>
        </Card>
      )}

      {/* Step 2: Payment Details - Only show after customer selection */}
      {selectedCustomer && (
        <Card className="p-5">
          <div className="space-y-4">
            {/* Amount Input */}
            <div>
              <div className="flex items-center space-x-2 mb-2">
                <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-bold">2</div>
                <label className="text-lg font-semibold text-gray-800">Enter Amount</label>
              </div>
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

            {/* Payment Mode Selection */}
            <div>
              <div className="flex items-center space-x-2 mb-3">
                <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-bold">3</div>
                <label className="text-lg font-semibold text-gray-800">Payment Method</label>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {paymentModes.map((mode) => (
                  <button
                    key={mode.value}
                    type="button"
                    onClick={() => handlePaymentModeSelect(mode.value)}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      payment.payment_mode === mode.value
                        ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="text-2xl mb-1">{mode.icon}</div>
                    <div className="text-sm font-medium text-gray-700">{mode.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Reference Number - Only when needed */}
            {needsReference && (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {payment.payment_mode === 'UPI' ? 'UPI Transaction ID' : 
                   payment.payment_mode === 'CHEQUE' ? 'Cheque Number' : 
                   'Reference Number'} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={payment.reference_number || ''}
                  onChange={(e) => handleFieldChange('reference_number', e.target.value)}
                  className="w-full px-4 py-2.5 border-2 border-yellow-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400"
                  placeholder="Enter reference number"
                  required
                />
              </div>
            )}

            {/* Split Payment Modal - Inline */}
            {showSplitModal && (
              <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                <h4 className="font-medium text-gray-800 mb-3">Split Payment Details</h4>
                <div className="space-y-2">
                  {splitPayments.map((split, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <select
                        value={split.type}
                        onChange={(e) => updateSplitPayment(index, 'type', e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
                      >
                        <option value="CASH">Cash</option>
                        <option value="UPI">UPI</option>
                        <option value="CARD">Card</option>
                        <option value="BANK_TRANSFER">Bank</option>
                      </select>
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-orange-600 font-bold">₹</span>
                        <input
                          type="number"
                          value={split.amount}
                          onChange={(e) => updateSplitPayment(index, 'amount', e.target.value)}
                          placeholder="Amount"
                          className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
                        />
                      </div>
                      {['UPI', 'BANK_TRANSFER'].includes(split.type) && (
                        <input
                          type="text"
                          value={split.reference || ''}
                          onChange={(e) => updateSplitPayment(index, 'reference', e.target.value)}
                          placeholder="Ref"
                          className="w-24 px-2 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
                        />
                      )}
                    </div>
                  ))}
                  <div className="flex justify-between items-center pt-2 border-t">
                    <span className="text-sm font-medium">
                      Total: ₹{totalSplitAmount.toFixed(2)} / ₹{payment.amount || '0'}
                    </span>
                    {totalSplitAmount !== parseFloat(payment.amount || '0') && (
                      <span className="text-sm text-red-600">
                        Difference: ₹{Math.abs(totalSplitAmount - parseFloat(payment.amount || '0')).toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Date and Type - Minimal bottom row */}
            <div className="flex gap-3 pt-3 border-t">
              <div className="flex-1">
                <label className="block text-xs text-gray-600 mb-1">Date</label>
                <div className="relative">
                  <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="date"
                    value={payment.payment_date || new Date().toISOString().split('T')[0]}
                    onChange={(e) => handleFieldChange('payment_date', e.target.value)}
                    className="w-full pl-8 pr-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex-1">
                <label className="block text-xs text-gray-600 mb-1">Type</label>
                <select
                  value={payment.payment_type || 'order_payment'}
                  onChange={(e) => handleFieldChange('payment_type', e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="order_payment">Order Payment</option>
                  <option value="advance">Advance</option>
                  <option value="adjustment">Adjustment</option>
                </select>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

export default PaymentFlowOptimized;