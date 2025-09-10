import React, { useState, useEffect } from 'react';
import { Plus, X, CreditCard, Banknote, Smartphone, Building2, FileText, AlertCircle, Check, Coins, ChevronRight } from 'lucide-react';

/**
 * Modern SplitPayment Component
 * Side-by-side layout with payment options on left, details on right
 * Similar to Stripe, Square, and modern payment UIs
 */
const SplitPayment = ({ 
  totalAmount = 0, 
  payments = [], 
  onChange, 
  onPaymentStatusChange,
  allowPartial = true,
  className = '',
  readOnly = false,
  defaultPaymentMethod = null
}) => {
  const [selectedMethod, setSelectedMethod] = useState('cash');
  const [paymentDetails, setPaymentDetails] = useState({
    amount: totalAmount,
    reference: ''
  });
  const [splitPayments, setSplitPayments] = useState([]);
  const [isSplitMode, setIsSplitMode] = useState(false);

  // Payment method options with modern icons and colors
  const paymentOptions = [
    { 
      value: 'cash', 
      label: 'Full Cash', 
      icon: Banknote, 
      color: 'green',
      bgColor: 'bg-green-50 hover:bg-green-100 border-green-200',
      selectedBg: 'bg-green-100 border-green-400',
      textColor: 'text-green-700',
      description: 'Immediate payment'
    },
    { 
      value: 'upi', 
      label: 'Full UPI', 
      icon: Smartphone, 
      color: 'purple',
      bgColor: 'bg-purple-50 hover:bg-purple-100 border-purple-200',
      selectedBg: 'bg-purple-100 border-purple-400',
      textColor: 'text-purple-700',
      description: 'Digital payment'
    },
    { 
      value: 'card', 
      label: 'Full Card', 
      icon: CreditCard, 
      color: 'blue',
      bgColor: 'bg-blue-50 hover:bg-blue-100 border-blue-200',
      selectedBg: 'bg-blue-100 border-blue-400',
      textColor: 'text-blue-700',
      description: 'Debit/Credit card'
    },
    { 
      value: 'bank', 
      label: 'Full Bank', 
      icon: Building2, 
      color: 'indigo',
      bgColor: 'bg-indigo-50 hover:bg-indigo-100 border-indigo-200',
      selectedBg: 'bg-indigo-100 border-indigo-400',
      textColor: 'text-indigo-700',
      description: 'Bank transfer'
    },
    { 
      value: 'check', 
      label: 'Full Check', 
      icon: FileText, 
      color: 'gray',
      bgColor: 'bg-gray-50 hover:bg-gray-100 border-gray-200',
      selectedBg: 'bg-gray-100 border-gray-400',
      textColor: 'text-gray-700',
      description: 'Check payment'
    }
  ];

  // Special options
  const specialOptions = [
    {
      value: 'split',
      label: 'Split Payment',
      icon: Coins,
      color: 'indigo',
      bgColor: 'bg-indigo-50 hover:bg-indigo-100 border-indigo-200',
      selectedBg: 'bg-indigo-100 border-indigo-400',
      textColor: 'text-indigo-700',
      description: 'Multiple methods'
    },
    {
      value: 'credit',
      label: 'Full Credit',
      icon: AlertCircle,
      color: 'orange',
      bgColor: 'bg-orange-50 hover:bg-orange-100 border-orange-200',
      selectedBg: 'bg-orange-100 border-orange-400',
      textColor: 'text-orange-700',
      description: 'Pay later'
    }
  ];

  // Initialize from props
  useEffect(() => {
    if (payments && payments.length > 0) {
      if (payments.length === 1) {
        setSelectedMethod(payments[0].method);
        setPaymentDetails({
          amount: payments[0].amount,
          reference: payments[0].reference || ''
        });
      } else {
        setIsSplitMode(true);
        setSplitPayments(payments);
      }
    } else if (defaultPaymentMethod) {
      setSelectedMethod(defaultPaymentMethod === 'credit' ? 'credit' : defaultPaymentMethod);
    }
  }, [payments, defaultPaymentMethod]);

  // Update parent when payment changes
  useEffect(() => {
    if (!readOnly && onChange) {
      if (isSplitMode) {
        onChange(splitPayments);
        const totalPaid = splitPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
        onPaymentStatusChange?.(totalPaid >= totalAmount ? 'paid' : totalPaid > 0 ? 'partial' : 'pending');
      } else {
        const paymentAmount = selectedMethod === 'credit' ? 0 : paymentDetails.amount;
        onChange([{
          id: '1',
          method: selectedMethod,
          amount: paymentAmount,
          reference: paymentDetails.reference
        }]);
        onPaymentStatusChange?.(
          selectedMethod === 'credit' ? 'pending' : 
          paymentAmount >= totalAmount ? 'paid' : 
          paymentAmount > 0 ? 'partial' : 'pending'
        );
      }
    }
  }, [selectedMethod, paymentDetails, splitPayments, isSplitMode, totalAmount, onChange, onPaymentStatusChange, readOnly]);

  const handleMethodSelect = (method) => {
    if (readOnly) return;
    
    if (method === 'split') {
      setIsSplitMode(true);
      setSplitPayments([
        { id: '1', method: 'cash', amount: 0, reference: '' },
        { id: '2', method: 'upi', amount: 0, reference: '' }
      ]);
    } else {
      setIsSplitMode(false);
      setSelectedMethod(method);
      setPaymentDetails({
        amount: method === 'credit' ? 0 : totalAmount,
        reference: ''
      });
    }
  };

  const addSplitPayment = () => {
    const totalPaid = splitPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const remaining = totalAmount - totalPaid;
    const newId = (splitPayments.length + 1).toString();
    setSplitPayments([...splitPayments, {
      id: newId,
      method: 'card',
      amount: remaining > 0 ? remaining : 0,
      reference: ''
    }]);
  };

  const updateSplitPayment = (id, field, value) => {
    setSplitPayments(splitPayments.map(p => 
      p.id === id ? { ...p, [field]: field === 'amount' ? parseFloat(value) || 0 : value } : p
    ));
  };

  const removeSplitPayment = (id) => {
    if (splitPayments.length > 2) {
      setSplitPayments(splitPayments.filter(p => p.id !== id));
    }
  };

  const totalPaid = isSplitMode 
    ? splitPayments.reduce((sum, p) => sum + (p.amount || 0), 0)
    : selectedMethod === 'credit' ? 0 : paymentDetails.amount;
  const remaining = totalAmount - totalPaid;
  const isFullyPaid = totalPaid >= totalAmount;

  return (
    <div className={`${className}`}>
      {/* Modern Side-by-Side Layout */}
      <div className="flex gap-4">
        {/* Left Side - Payment Method Selection */}
        <div className="w-1/3 space-y-2">
          <div className="text-xs font-medium text-gray-600 mb-2">Select Payment Method</div>
          
          {/* Regular Payment Methods */}
          <div className="space-y-1.5">
            {paymentOptions.map(option => {
              const Icon = option.icon;
              const isSelected = !isSplitMode && selectedMethod === option.value;
              return (
                <button
                  key={option.value}
                  onClick={() => handleMethodSelect(option.value)}
                  disabled={readOnly}
                  className={`w-full text-left p-2.5 rounded-lg border transition-all ${
                    isSelected 
                      ? `${option.selectedBg} border-2` 
                      : `${option.bgColor} border`
                  } ${readOnly ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className={`w-4 h-4 ${option.textColor}`} />
                      <div>
                        <div className={`text-sm font-medium ${option.textColor}`}>
                          {option.label}
                        </div>
                        <div className="text-xs text-gray-500">{option.description}</div>
                      </div>
                    </div>
                    {isSelected && (
                      <Check className={`w-4 h-4 ${option.textColor}`} />
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Divider */}
          <div className="border-t border-gray-200 my-2"></div>

          {/* Special Options */}
          <div className="space-y-1.5">
            {specialOptions.map(option => {
              const Icon = option.icon;
              const isSelected = (option.value === 'split' && isSplitMode) || 
                               (!isSplitMode && selectedMethod === option.value);
              return (
                <button
                  key={option.value}
                  onClick={() => handleMethodSelect(option.value)}
                  disabled={readOnly}
                  className={`w-full text-left p-2.5 rounded-lg border transition-all ${
                    isSelected 
                      ? `${option.selectedBg} border-2` 
                      : `${option.bgColor} border`
                  } ${readOnly ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className={`w-4 h-4 ${option.textColor}`} />
                      <div>
                        <div className={`text-sm font-medium ${option.textColor}`}>
                          {option.label}
                        </div>
                        <div className="text-xs text-gray-500">{option.description}</div>
                      </div>
                    </div>
                    {isSelected && (
                      <Check className={`w-4 h-4 ${option.textColor}`} />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Side - Payment Details Entry */}
        <div className="flex-1">
          <div className="text-xs font-medium text-gray-600 mb-2">Payment Details</div>
          
          {/* Show different UI based on mode */}
          {isSplitMode ? (
            // Split Payment Mode
            <div className="bg-gray-50 rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Split Payment Methods</span>
                <button
                  onClick={addSplitPayment}
                  disabled={readOnly || splitPayments.length >= 5}
                  className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700 disabled:opacity-50"
                >
                  <Plus className="w-3 h-3 inline mr-1" />
                  Add Method
                </button>
              </div>

              {splitPayments.map((payment, index) => {
                const Icon = getPaymentIcon(payment.method);
                return (
                  <div key={payment.id} className="bg-white rounded border border-gray-200 p-2">
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4 text-gray-500" />
                      <select
                        value={payment.method}
                        onChange={(e) => updateSplitPayment(payment.id, 'method', e.target.value)}
                        disabled={readOnly}
                        className="flex-1 text-sm border border-gray-300 rounded px-2 py-1"
                      >
                        {paymentOptions.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label.replace('Full ', '')}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        value={payment.amount}
                        onChange={(e) => updateSplitPayment(payment.id, 'amount', e.target.value)}
                        disabled={readOnly}
                        placeholder="Amount"
                        className="w-24 text-sm border border-gray-300 rounded px-2 py-1"
                      />
                      {payment.method !== 'cash' && (
                        <input
                          type="text"
                          value={payment.reference}
                          onChange={(e) => updateSplitPayment(payment.id, 'reference', e.target.value)}
                          disabled={readOnly}
                          placeholder="Ref#"
                          className="w-20 text-sm border border-gray-300 rounded px-2 py-1"
                        />
                      )}
                      {splitPayments.length > 2 && (
                        <button
                          onClick={() => removeSplitPayment(payment.id)}
                          disabled={readOnly}
                          className="text-red-500 hover:text-red-700"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : selectedMethod === 'credit' ? (
            // Credit Mode
            <div className="bg-orange-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="w-5 h-5 text-orange-600" />
                <span className="text-sm font-medium text-orange-900">Full Amount on Credit</span>
              </div>
              <div className="space-y-2">
                <div className="text-2xl font-bold text-orange-700">₹{totalAmount.toFixed(2)}</div>
                <div className="text-sm text-orange-600">
                  This invoice will be marked as unpaid. The customer owes the full amount.
                </div>
                <div className="bg-orange-100 rounded p-2 text-xs text-orange-700">
                  💡 Payment can be recorded later when received
                </div>
              </div>
            </div>
          ) : (
            // Regular Payment Mode
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Amount</label>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">₹</span>
                    <input
                      type="number"
                      value={paymentDetails.amount}
                      onChange={(e) => setPaymentDetails({ ...paymentDetails, amount: parseFloat(e.target.value) || 0 })}
                      disabled={readOnly}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="0.00"
                    />
                    {paymentDetails.amount < totalAmount && (
                      <button
                        onClick={() => setPaymentDetails({ ...paymentDetails, amount: totalAmount })}
                        className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200"
                      >
                        Full Amount
                      </button>
                    )}
                  </div>
                </div>

                {selectedMethod !== 'cash' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      {selectedMethod === 'upi' ? 'Transaction ID' : 
                       selectedMethod === 'card' ? 'Last 4 Digits' :
                       selectedMethod === 'bank' ? 'Reference Number' :
                       selectedMethod === 'check' ? 'Check Number' : 'Reference'}
                    </label>
                    <input
                      type="text"
                      value={paymentDetails.reference}
                      onChange={(e) => setPaymentDetails({ ...paymentDetails, reference: e.target.value })}
                      disabled={readOnly}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder={
                        selectedMethod === 'upi' ? 'UPI transaction ID' :
                        selectedMethod === 'card' ? '1234' :
                        selectedMethod === 'bank' ? 'NEFT/RTGS/IMPS ref' :
                        selectedMethod === 'check' ? 'Check number' : 'Reference'
                      }
                    />
                  </div>
                )}

                {/* Payment Status */}
                <div className="border-t pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-600">Invoice Total</span>
                    <span className="text-sm font-medium">₹{totalAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-gray-600">Amount Paid</span>
                    <span className={`text-sm font-medium ${isFullyPaid ? 'text-green-600' : 'text-gray-900'}`}>
                      ₹{paymentDetails.amount.toFixed(2)}
                    </span>
                  </div>
                  {remaining > 0 && (
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-gray-600">Remaining (Credit)</span>
                      <span className="text-sm font-medium text-orange-600">₹{remaining.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Summary Status Badge */}
          <div className="mt-3">
            {isFullyPaid ? (
              <div className="bg-green-100 text-green-700 px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
                <Check className="w-4 h-4" />
                Fully Paid
              </div>
            ) : totalPaid > 0 ? (
              <div className="bg-yellow-100 text-yellow-700 px-3 py-2 rounded-lg text-sm font-medium">
                Partial Payment - ₹{remaining.toFixed(2)} goes to credit
              </div>
            ) : (
              <div className="bg-orange-100 text-orange-700 px-3 py-2 rounded-lg text-sm font-medium">
                Unpaid - Full amount on credit
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Helper function to get icon
const getPaymentIcon = (method) => {
  const icons = {
    cash: Banknote,
    card: CreditCard,
    upi: Smartphone,
    bank: Building2,
    check: FileText
  };
  return icons[method] || Banknote;
};

export default SplitPayment;