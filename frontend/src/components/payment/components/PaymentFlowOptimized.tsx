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
    { value: 'CASH', label: 'Cash', icon: '💵' },
    { value: 'UPI', label: 'UPI', icon: '📱' },
    { value: 'CARD', label: 'Card', icon: '💳' },
    { value: 'BANK_TRANSFER', label: 'Bank', icon: '🏦' },
    { value: 'CHEQUE', label: 'Cheque', icon: '📄' },
    { value: 'SPLIT', label: 'Split', icon: '➗' }
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
    <div className="space-y-3">
      {/* Customer Selection */}
      {!selectedCustomer ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">SELECT CUSTOMER</h3>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('openCustomerModal'))}
              className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded transition-colors"
            >
              + New Customer
            </button>
          </div>
          <Card className="p-3">
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
          <Card className="p-2 bg-green-50 border border-green-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Check className="w-4 h-4 text-green-600" />
                <p className="text-sm font-medium text-gray-900">{selectedCustomer.customer_name}</p>
              </div>
              <button
                onClick={() => setCustomer(null)}
                className="text-xs text-blue-600 hover:text-blue-700"
              >
                Change
              </button>
            </div>
          </Card>
        </div>
      )}

      {/* Payment Details - Only show after customer selection */}
      {selectedCustomer && (
        <div className="space-y-3">
          {/* Date and Type - Compact */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
              <div className="relative">
                <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="date"
                  value={payment.payment_date || new Date().toISOString().split('T')[0]}
                  onChange={(e) => handleFieldChange('payment_date', e.target.value)}
                  className="w-full pl-7 pr-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
              <select
                value={payment.payment_type || 'order_payment'}
                onChange={(e) => handleFieldChange('payment_type', e.target.value)}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="order_payment">Order Payment</option>
                <option value="advance">Advance</option>
                <option value="adjustment">Adjustment</option>
              </select>
            </div>
          </div>

          {/* Amount Input - Compact */}
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">AMOUNT</h3>
            <div className="flex gap-2 items-center">
              <div className="relative flex-1">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-base text-green-600 font-bold">₹</span>
                <input
                  ref={amountRef}
                  type="number"
                  value={payment.amount}
                  onChange={(e) => handleFieldChange('amount', e.target.value)}
                  className={`w-full pl-7 pr-2 py-1.5 text-base font-semibold border rounded focus:outline-none focus:ring-2 focus:ring-green-500 ${
                    errors.amount ? 'border-red-500 bg-red-50' : 'border-gray-300'
                  }`}
                  placeholder="0"
                  step="1"
                />
              </div>
              {errors.amount && (
                <span className="text-xs text-red-500">{errors.amount}</span>
              )}
            </div>
          </div>

          {/* Payment Mode with Reference - Single Line */}
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">PAYMENT METHOD</h3>
            <div className="flex gap-2 items-center">
              <div className="flex gap-1">
                {paymentModes.map((mode) => (
                  <button
                    key={mode.value}
                    type="button"
                    onClick={() => handlePaymentModeSelect(mode.value)}
                    className={`py-1.5 px-2 rounded border transition-all ${
                      payment.payment_mode === mode.value
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                    }`}
                  >
                    <div className="text-sm">{mode.icon}</div>
                    <div className="text-xs text-gray-600">{mode.label}</div>
                  </button>
                ))}
              </div>
              
              {/* Reference field inline */}
              {needsReference && (
                <input
                  type="text"
                  value={payment.reference_number || ''}
                  onChange={(e) => handleFieldChange('reference_number', e.target.value)}
                  className="flex-1 max-w-xs px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={payment.payment_mode === 'UPI' ? 'UPI ID (optional)' : 
                              payment.payment_mode === 'CHEQUE' ? 'Cheque # (optional)' : 
                              'Reference (optional)'}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Split Payment Details - Outside, Compact */}
      {selectedCustomer && showSplitModal && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">SPLIT DETAILS</h3>
          {splitPayments.map((split, index) => (
            <div key={index} className="flex items-center gap-2">
              <select
                value={split.type}
                onChange={(e) => updateSplitPayment(index, 'type', e.target.value)}
                className="px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="CASH">💵 Cash</option>
                <option value="UPI">📱 UPI</option>
                <option value="CARD">💳 Card</option>
                <option value="BANK_TRANSFER">🏦 Bank</option>
              </select>
              <div className="relative flex-1 max-w-[120px]">
                <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-xs text-gray-600">₹</span>
                <input
                  type="number"
                  value={split.amount}
                  onChange={(e) => updateSplitPayment(index, 'amount', e.target.value)}
                  placeholder="0"
                  className="w-full pl-5 pr-1 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              {['UPI', 'BANK_TRANSFER'].includes(split.type) && (
                <input
                  type="text"
                  value={split.reference || ''}
                  onChange={(e) => updateSplitPayment(index, 'reference', e.target.value)}
                  placeholder="Ref"
                  className="w-24 px-1.5 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              )}
              {index > 0 && (
                <button
                  onClick={() => setSplitPayments(splitPayments.filter((_, i) => i !== index))}
                  className="text-red-500 hover:text-red-700 text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <button
            onClick={() => setSplitPayments([...splitPayments, { type: 'CASH', amount: '' }])}
            className="text-xs text-blue-600 hover:text-blue-700"
          >
            + Add method
          </button>
        </div>
      )}
    </div>
  );
};

export default PaymentFlowOptimized;