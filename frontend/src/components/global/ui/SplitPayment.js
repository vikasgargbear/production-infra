import React, { useState, useEffect, useCallback } from 'react';
import { Plus, X, CreditCard, Banknote, Smartphone, Building2, FileText, AlertCircle, Check, Coins } from 'lucide-react';

/**
 * Compact SplitPayment Component
 * - Inline layout to save vertical space
 * - Minimal redundant information
 * - Clean, space-efficient design
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
    { value: 'bank', label: 'Bank', icon: Building2, color: 'indigo' },
    { value: 'check', label: 'Check', icon: FileText, color: 'gray' },
    { value: 'credit', label: 'Credit', icon: AlertCircle, color: 'orange' }
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

  const getReferenceLabel = (method) => {
    switch(method) {
      case 'upi': return 'UPI ID';
      case 'card': return 'Last 4';
      case 'bank': return 'Ref#';
      case 'check': return 'Check#';
      default: return 'Ref';
    }
  };

  const getReferencePlaceholder = (method) => {
    switch(method) {
      case 'upi': return '412345678900';
      case 'card': return '1234';
      case 'bank': return 'NEFT/RTGS';
      case 'check': return '123456';
      default: return 'Reference';
    }
  };

  return (
    <div className={`${className}`}>
      {/* Compact Header with Split Payment Toggle */}
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-medium text-gray-600">Payment</div>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={isSplitMode}
            onChange={handleSplitToggle}
            disabled={readOnly}
            className="w-3.5 h-3.5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
          />
          <span className="text-xs text-gray-600 flex items-center gap-1">
            <Coins className="w-3.5 h-3.5" />
            Split
          </span>
        </label>
      </div>

      {/* Main Payment Interface */}
      {!isSplitMode ? (
        // Single Payment Mode - Compact inline layout
        <div className="space-y-2">
          {selectedMethod === 'credit' ? (
            // Credit Mode - Special handling
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <span className="text-sm font-medium text-amber-900">
                  Full Credit - ₹{totalAmount.toFixed(2)} unpaid
                </span>
              </div>
            </div>
          ) : (
            // Regular Payment - Inline layout
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {/* Payment Method Dropdown - Compact width */}
                <select
                  value={selectedMethod}
                  onChange={handleMethodChange}
                  disabled={readOnly}
                  className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  style={{ minWidth: '100px' }}
                >
                  {paymentMethods.map(method => (
                    <option key={method.value} value={method.value}>
                      {method.label}
                    </option>
                  ))}
                </select>

                {/* Amount Input - Inline */}
                <div className="flex items-center gap-1 flex-1">
                  <span className="text-gray-500 text-sm">₹</span>
                  <input
                    type="number"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                    disabled={readOnly}
                    className="w-24 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                  />
                </div>

                {/* Reference Input - Only for non-cash */}
                {selectedMethod !== 'cash' && (
                  <input
                    type="text"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    disabled={readOnly}
                    className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder={`${getReferenceLabel(selectedMethod)}: ${getReferencePlaceholder(selectedMethod)}`}
                  />
                )}

                {/* Quick full amount button if partial */}
                {paymentAmount < totalAmount && selectedMethod !== 'credit' && (
                  <button
                    onClick={() => setPaymentAmount(totalAmount)}
                    disabled={readOnly}
                    className="text-xs bg-blue-100 text-blue-700 px-2 py-1.5 rounded hover:bg-blue-200 whitespace-nowrap"
                  >
                    Full
                  </button>
                )}
              </div>

              {/* Compact status - only show if not fully paid */}
              {!isFullyPaid && remaining > 0 && (
                <div className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                  ₹{remaining.toFixed(2)} will go to credit
                </div>
              )}
            </div>
          )}

          {/* Payment Status Badge - More subtle colors */}
          {selectedMethod === 'credit' ? (
            <div className="bg-amber-100 text-amber-800 px-2.5 py-1.5 rounded text-xs font-medium">
              Credit Sale - Payment pending
            </div>
          ) : isFullyPaid ? (
            <div className="bg-emerald-100 text-emerald-800 px-2.5 py-1.5 rounded text-xs font-medium flex items-center gap-1">
              <Check className="w-3.5 h-3.5" />
              Paid in full
            </div>
          ) : totalPaid > 0 ? (
            <div className="bg-amber-100 text-amber-800 px-2.5 py-1.5 rounded text-xs">
              Partial: ₹{totalPaid.toFixed(2)} paid, ₹{remaining.toFixed(2)} credit
            </div>
          ) : (
            <div className="bg-slate-100 text-slate-700 px-2.5 py-1.5 rounded text-xs">
              No payment - Full credit
            </div>
          )}
        </div>
      ) : (
        // Split Payment Mode - Compact
        <div className="space-y-2">
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-indigo-900">Split Methods</span>
              <button
                onClick={addSplitPayment}
                disabled={readOnly || splitPayments.length >= 5}
                className="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded hover:bg-indigo-700 disabled:opacity-50"
              >
                + Add
              </button>
            </div>

            {splitPayments.map((payment) => {
              const Icon = getPaymentIcon(payment.method);
              return (
                <div key={payment.id} className="flex items-center gap-1.5 mb-1.5">
                  <Icon className="w-3.5 h-3.5 text-gray-500" />
                  <select
                    value={payment.method}
                    onChange={(e) => updateSplitPayment(payment.id, 'method', e.target.value)}
                    disabled={readOnly}
                    className="text-xs border border-gray-300 rounded px-1 py-0.5"
                    style={{ width: '70px' }}
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
                    placeholder="₹"
                    className="w-16 text-xs border border-gray-300 rounded px-1 py-0.5"
                  />
                  {payment.method !== 'cash' && (
                    <input
                      type="text"
                      value={payment.reference}
                      onChange={(e) => updateSplitPayment(payment.id, 'reference', e.target.value)}
                      disabled={readOnly}
                      placeholder="Ref"
                      className="flex-1 text-xs border border-gray-300 rounded px-1 py-0.5"
                    />
                  )}
                  {splitPayments.length > 2 && (
                    <button
                      onClick={() => removeSplitPayment(payment.id)}
                      disabled={readOnly}
                      className="text-red-500 hover:text-red-700"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}

            {/* Compact totals for split payment */}
            <div className="text-xs text-gray-600 mt-2 pt-1.5 border-t flex items-center justify-between">
              <span>Total: ₹{totalAmount.toFixed(2)}</span>
              <span className={totalPaid >= totalAmount ? 'text-green-600 font-medium' : ''}>
                Paid: ₹{totalPaid.toFixed(2)}
              </span>
              {remaining > 0 && (
                <span className="text-amber-600">Credit: ₹{remaining.toFixed(2)}</span>
              )}
            </div>
          </div>

          {/* Status Badge */}
          {isFullyPaid ? (
            <div className="bg-emerald-100 text-emerald-800 px-2.5 py-1.5 rounded text-xs font-medium flex items-center gap-1">
              <Check className="w-3.5 h-3.5" />
              Paid in full
            </div>
          ) : totalPaid > 0 ? (
            <div className="bg-amber-100 text-amber-800 px-2.5 py-1.5 rounded text-xs">
              Partial: ₹{remaining.toFixed(2)} credit
            </div>
          ) : (
            <div className="bg-slate-100 text-slate-700 px-2.5 py-1.5 rounded text-xs">
              No payment - Full credit
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SplitPayment;