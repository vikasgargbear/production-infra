import React, { useState, useEffect, useCallback } from 'react';
import { Plus, X, CreditCard, Banknote, Smartphone, Building2, FileText, AlertCircle, Check, Coins } from 'lucide-react';

/**
 * Simplified SplitPayment Component
 * - Dropdown for single payment method selection
 * - Checkbox to enable split payment mode
 * - Clean, intuitive UI
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
  const [paymentAmount, setPaymentAmount] = useState(totalAmount);
  const [reference, setReference] = useState('');
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [splitPayments, setSplitPayments] = useState([
    { id: '1', method: 'cash', amount: 0, reference: '' },
    { id: '2', method: 'upi', amount: 0, reference: '' }
  ]);

  // Payment method options
  const paymentMethods = [
    { value: 'cash', label: 'Cash', icon: Banknote, color: 'green' },
    { value: 'upi', label: 'UPI', icon: Smartphone, color: 'purple' },
    { value: 'card', label: 'Card', icon: CreditCard, color: 'blue' },
    { value: 'bank', label: 'Bank Transfer', icon: Building2, color: 'indigo' },
    { value: 'check', label: 'Check', icon: FileText, color: 'gray' },
    { value: 'credit', label: 'Credit (Pay Later)', icon: AlertCircle, color: 'orange' }
  ];

  // Initialize from props - only run once
  useEffect(() => {
    if (payments && payments.length > 0) {
      if (payments.length === 1) {
        setSelectedMethod(payments[0].method);
        setPaymentAmount(payments[0].amount);
        setReference(payments[0].reference || '');
        setIsSplitMode(false);
      } else {
        setIsSplitMode(true);
        setSplitPayments(payments);
      }
    } else if (defaultPaymentMethod) {
      setSelectedMethod(defaultPaymentMethod);
      if (defaultPaymentMethod !== 'credit') {
        setPaymentAmount(totalAmount);
      } else {
        setPaymentAmount(0);
      }
    }
  }, []); // Empty dependency array - only run on mount

  // Update parent when payment changes - use callback to avoid infinite loops
  const updateParent = useCallback(() => {
    if (!onChange) return;

    if (isSplitMode) {
      onChange(splitPayments);
      const totalPaid = splitPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      onPaymentStatusChange?.(
        totalPaid >= totalAmount ? 'paid' : 
        totalPaid > 0 ? 'partial' : 'pending'
      );
    } else {
      const actualAmount = selectedMethod === 'credit' ? 0 : paymentAmount;
      onChange([{
        id: '1',
        method: selectedMethod,
        amount: actualAmount,
        reference: reference
      }]);
      onPaymentStatusChange?.(
        selectedMethod === 'credit' ? 'pending' :
        actualAmount >= totalAmount ? 'paid' : 
        actualAmount > 0 ? 'partial' : 'pending'
      );
    }
  }, [selectedMethod, paymentAmount, reference, isSplitMode, splitPayments, totalAmount, onChange, onPaymentStatusChange]);

  // Debounced update to avoid too many updates
  useEffect(() => {
    const timer = setTimeout(() => {
      updateParent();
    }, 300);
    return () => clearTimeout(timer);
  }, [updateParent]);

  const handleMethodChange = (e) => {
    const method = e.target.value;
    setSelectedMethod(method);
    if (method === 'credit') {
      setPaymentAmount(0);
      setReference('');
    } else if (method !== selectedMethod) {
      setPaymentAmount(totalAmount);
      setReference('');
    }
  };

  const handleSplitToggle = () => {
    setIsSplitMode(!isSplitMode);
    if (!isSplitMode) {
      // Entering split mode
      setSplitPayments([
        { id: '1', method: 'cash', amount: 0, reference: '' },
        { id: '2', method: 'upi', amount: 0, reference: '' }
      ]);
    } else {
      // Exiting split mode
      setPaymentAmount(totalAmount);
      setReference('');
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
    : selectedMethod === 'credit' ? 0 : paymentAmount;
  const remaining = totalAmount - totalPaid;
  const isFullyPaid = totalPaid >= totalAmount;

  const getPaymentIcon = (method) => {
    const methodInfo = paymentMethods.find(m => m.value === method);
    return methodInfo ? methodInfo.icon : Banknote;
  };

  const getPaymentColor = (method) => {
    const methodInfo = paymentMethods.find(m => m.value === method);
    return methodInfo ? methodInfo.color : 'gray';
  };

  const getReferenceLabel = (method) => {
    switch(method) {
      case 'upi': return 'UPI Transaction ID';
      case 'card': return 'Last 4 Digits';
      case 'bank': return 'Reference Number';
      case 'check': return 'Check Number';
      default: return 'Reference';
    }
  };

  const getReferencePlaceholder = (method) => {
    switch(method) {
      case 'upi': return 'e.g., 412345678900';
      case 'card': return 'e.g., 1234';
      case 'bank': return 'e.g., NEFT/RTGS/IMPS ref';
      case 'check': return 'e.g., 123456';
      default: return 'Reference number';
    }
  };

  return (
    <div className={`${className}`}>
      {/* Header with Split Payment Toggle */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-medium text-gray-700">Payment Details</div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isSplitMode}
            onChange={handleSplitToggle}
            disabled={readOnly}
            className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
          />
          <span className="text-sm text-gray-600 flex items-center gap-1">
            <Coins className="w-4 h-4" />
            Split Payment
          </span>
        </label>
      </div>

      {/* Main Payment Interface */}
      {!isSplitMode ? (
        // Single Payment Mode
        <div className="space-y-3">
          {/* Payment Method Dropdown */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Payment Method</label>
            <select
              value={selectedMethod}
              onChange={handleMethodChange}
              disabled={readOnly}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {paymentMethods.map(method => (
                <option key={method.value} value={method.value}>
                  {method.label}
                </option>
              ))}
            </select>
          </div>

          {/* Credit Warning */}
          {selectedMethod === 'credit' ? (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-orange-600" />
                <div>
                  <div className="text-sm font-medium text-orange-900">Full Amount on Credit</div>
                  <div className="text-xs text-orange-700 mt-1">
                    Invoice Total: ₹{totalAmount.toFixed(2)} will be marked as unpaid
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Amount Input */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Amount</label>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">₹</span>
                  <input
                    type="number"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                    disabled={readOnly}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                  />
                  {paymentAmount < totalAmount && (
                    <button
                      onClick={() => setPaymentAmount(totalAmount)}
                      disabled={readOnly}
                      className="text-xs bg-blue-100 text-blue-700 px-3 py-2 rounded-lg hover:bg-blue-200"
                    >
                      Full Amount
                    </button>
                  )}
                </div>
              </div>

              {/* Reference Input (for non-cash payments) */}
              {selectedMethod !== 'cash' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {getReferenceLabel(selectedMethod)}
                  </label>
                  <input
                    type="text"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    disabled={readOnly}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder={getReferencePlaceholder(selectedMethod)}
                  />
                </div>
              )}
            </>
          )}

          {/* Payment Summary */}
          <div className="bg-gray-50 rounded-lg p-3 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Invoice Total</span>
              <span className="font-medium">₹{totalAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Amount Paid</span>
              <span className={`font-medium ${isFullyPaid ? 'text-green-600' : ''}`}>
                ₹{totalPaid.toFixed(2)}
              </span>
            </div>
            {remaining > 0 && (
              <div className="flex justify-between text-sm pt-1 border-t">
                <span className="text-gray-600">Remaining (Credit)</span>
                <span className="font-medium text-orange-600">₹{remaining.toFixed(2)}</span>
              </div>
            )}
          </div>

          {/* Status Badge */}
          {isFullyPaid ? (
            <div className="bg-green-100 text-green-700 px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
              <Check className="w-4 h-4" />
              Fully Paid
            </div>
          ) : totalPaid > 0 ? (
            <div className="bg-yellow-100 text-yellow-700 px-3 py-2 rounded-lg text-sm">
              Partial Payment - ₹{remaining.toFixed(2)} goes to credit
            </div>
          ) : (
            <div className="bg-orange-100 text-orange-700 px-3 py-2 rounded-lg text-sm">
              Unpaid - Full amount on credit
            </div>
          )}
        </div>
      ) : (
        // Split Payment Mode
        <div className="space-y-3">
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-indigo-900">Split Payment Methods</span>
              <button
                onClick={addSplitPayment}
                disabled={readOnly || splitPayments.length >= 5}
                className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700 disabled:opacity-50"
              >
                <Plus className="w-3 h-3 inline mr-1" />
                Add
              </button>
            </div>

            {splitPayments.map((payment, index) => {
              const Icon = getPaymentIcon(payment.method);
              return (
                <div key={payment.id} className="bg-white rounded-lg border border-gray-200 p-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 text-${getPaymentColor(payment.method)}-500`} />
                    <select
                      value={payment.method}
                      onChange={(e) => updateSplitPayment(payment.id, 'method', e.target.value)}
                      disabled={readOnly}
                      className="flex-1 text-sm border border-gray-300 rounded px-2 py-1"
                    >
                      {paymentMethods.filter(m => m.value !== 'credit').map(method => (
                        <option key={method.value} value={method.value}>{method.label}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={payment.amount}
                      onChange={(e) => updateSplitPayment(payment.id, 'amount', e.target.value)}
                      disabled={readOnly}
                      placeholder="₹0"
                      className="w-24 text-sm border border-gray-300 rounded px-2 py-1"
                    />
                    {payment.method !== 'cash' && (
                      <input
                        type="text"
                        value={payment.reference}
                        onChange={(e) => updateSplitPayment(payment.id, 'reference', e.target.value)}
                        disabled={readOnly}
                        placeholder="Ref"
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

            {/* Split Payment Summary */}
            <div className="bg-gray-50 rounded p-2 mt-2 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-gray-600">Invoice Total</span>
                <span className="font-medium">₹{totalAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-600">Total Paid</span>
                <span className={`font-medium ${isFullyPaid ? 'text-green-600' : ''}`}>
                  ₹{totalPaid.toFixed(2)}
                </span>
              </div>
              {remaining > 0 && (
                <div className="flex justify-between text-xs pt-1 border-t">
                  <span className="text-gray-600">Remaining</span>
                  <span className="font-medium text-orange-600">₹{remaining.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Status Badge */}
          {isFullyPaid ? (
            <div className="bg-green-100 text-green-700 px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
              <Check className="w-4 h-4" />
              Fully Paid
            </div>
          ) : totalPaid > 0 ? (
            <div className="bg-yellow-100 text-yellow-700 px-3 py-2 rounded-lg text-sm">
              Partial Payment - ₹{remaining.toFixed(2)} goes to credit
            </div>
          ) : (
            <div className="bg-orange-100 text-orange-700 px-3 py-2 rounded-lg text-sm">
              No payment received - Full amount on credit
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SplitPayment;