import React, { useState, useEffect, useCallback } from 'react';
import { Plus, X, CreditCard, Banknote, Smartphone, Building2, FileText, AlertCircle, Check, Coins } from 'lucide-react';

/**
 * Properly Compact SplitPayment Component
 * - Better width distribution (not cramped)
 * - Consistent heights matching bank selector
 * - Clean, professional layout
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
      p.id === id ? { 
        ...p, 
        [field]: field === 'amount' 
          ? (value === '' ? '' : parseFloat(value) || 0)
          : value 
      } : p
    ));
  };

  const removeSplitPayment = (id) => {
    if (splitPayments.length > 2) {
      setSplitPayments(splitPayments.filter(p => p.id !== id));
    }
  };

  const totalPaid = isSplitMode 
    ? splitPayments.reduce((sum, p) => sum + (p.amount === '' ? 0 : parseFloat(p.amount) || 0), 0)
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

  // Consistent input styling
  const inputClass = "px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500";
  const selectClass = "px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white";

  return (
    <div className={`${className}`}>
      {/* Header with Split Payment Toggle */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-medium text-gray-700">Payment Method</div>
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
        // Single Payment Mode - Properly distributed
        <div className="space-y-3">
          {selectedMethod === 'credit' ? (
            // Credit Mode - Special handling
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600" />
                <div>
                  <span className="text-sm font-medium text-amber-900">
                    Full Credit Sale
                  </span>
                  <div className="text-xs text-amber-700 mt-0.5">
                    ₹{totalAmount.toFixed(2)} will be marked as unpaid
                  </div>
                </div>
              </div>
            </div>
          ) : (
            // Regular Payment - Better distribution
            <div className="space-y-3">
              {/* Cash payment - 50/50 split */}
              {selectedMethod === 'cash' && (
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={selectedMethod}
                    onChange={handleMethodChange}
                    disabled={readOnly}
                    className={selectClass}
                  >
                    {paymentMethods.map(method => (
                      <option key={method.value} value={method.value}>
                        {method.label}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 text-sm">₹</span>
                    <input
                      type="number"
                      value={paymentAmount === 0 ? '' : paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                      disabled={readOnly}
                      className={`${inputClass} flex-1`}
                      placeholder="0.00"
                    />
                    {paymentAmount < totalAmount && (
                      <button
                        onClick={() => setPaymentAmount(totalAmount)}
                        disabled={readOnly}
                        className="text-xs bg-blue-100 text-blue-700 px-3 py-2 rounded-lg hover:bg-blue-200 whitespace-nowrap"
                      >
                        Full
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Other payments - 33/33/33 split */}
              {selectedMethod !== 'cash' && selectedMethod !== 'credit' && (
                <div className="grid grid-cols-3 gap-3">
                  <select
                    value={selectedMethod}
                    onChange={handleMethodChange}
                    disabled={readOnly}
                    className={selectClass}
                  >
                    {paymentMethods.map(method => (
                      <option key={method.value} value={method.value}>
                        {method.label}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 text-sm">₹</span>
                    <input
                      type="number"
                      value={paymentAmount === 0 ? '' : paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                      disabled={readOnly}
                      className={`${inputClass} flex-1`}
                      placeholder="0.00"
                    />
                  </div>
                  <input
                    type="text"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    disabled={readOnly}
                    className={inputClass}
                    placeholder={`${getReferenceLabel(selectedMethod)}: ${getReferencePlaceholder(selectedMethod)}`}
                  />
                </div>
              )}

              {/* Compact status - only show if not fully paid */}
              {!isFullyPaid && remaining > 0 && (
                <div className="text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                  ₹{remaining.toFixed(2)} will go to credit
                </div>
              )}
            </div>
          )}

          {/* Payment Status Badge */}
          {selectedMethod === 'credit' ? (
            <div className="bg-amber-100 text-amber-800 px-3 py-2 rounded-lg text-sm font-medium">
              Credit Sale - Payment pending
            </div>
          ) : isFullyPaid ? (
            <div className="bg-emerald-100 text-emerald-800 px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
              <Check className="w-4 h-4" />
              Paid in full
            </div>
          ) : totalPaid > 0 ? (
            <div className="bg-amber-100 text-amber-800 px-3 py-2 rounded-lg text-sm">
              Partial: ₹{totalPaid.toFixed(2)} paid, ₹{remaining.toFixed(2)} credit
            </div>
          ) : (
            <div className="bg-gray-100 text-gray-700 px-3 py-2 rounded-lg text-sm">
              No payment received - Full credit
            </div>
          )}
        </div>
      ) : (
        // Split Payment Mode - Compact inline layout
        <div className="space-y-3">
          {/* Split payment rows */}
          {splitPayments.map((payment, index) => {
            const Icon = getPaymentIcon(payment.method);
            const showReference = payment.method !== 'cash';
            
            return (
              <div key={payment.id} className="flex items-center gap-3">
                <Icon className="w-4 h-4 text-gray-500 flex-shrink-0" />
                
                {/* For cash - 50/50 split */}
                {!showReference && (
                  <>
                    <select
                      value={payment.method}
                      onChange={(e) => updateSplitPayment(payment.id, 'method', e.target.value)}
                      disabled={readOnly}
                      className={`${selectClass} flex-1`}
                    >
                      {paymentMethods.filter(m => m.value !== 'credit').map(method => (
                        <option key={method.value} value={method.value}>{method.label}</option>
                      ))}
                    </select>
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-gray-500 text-sm">₹</span>
                      <input
                        type="number"
                        value={payment.amount === '' ? '' : payment.amount}
                        onChange={(e) => updateSplitPayment(payment.id, 'amount', e.target.value)}
                        disabled={readOnly}
                        placeholder="0.00"
                        className={`${inputClass} flex-1`}
                      />
                    </div>
                  </>
                )}
                
                {/* For other methods - 35/35/30 split */}
                {showReference && (
                  <>
                    <select
                      value={payment.method}
                      onChange={(e) => updateSplitPayment(payment.id, 'method', e.target.value)}
                      disabled={readOnly}
                      className={selectClass}
                      style={{ width: '35%', minWidth: '120px' }}
                    >
                      {paymentMethods.filter(m => m.value !== 'credit').map(method => (
                        <option key={method.value} value={method.value}>{method.label}</option>
                      ))}
                    </select>
                    <div className="flex items-center gap-2" style={{ width: '35%' }}>
                      <span className="text-gray-500 text-sm">₹</span>
                      <input
                        type="number"
                        value={payment.amount === '' ? '' : payment.amount}
                        onChange={(e) => updateSplitPayment(payment.id, 'amount', e.target.value)}
                        disabled={readOnly}
                        placeholder="0.00"
                        className={`${inputClass} w-full`}
                      />
                    </div>
                    <input
                      type="text"
                      value={payment.reference}
                      onChange={(e) => updateSplitPayment(payment.id, 'reference', e.target.value)}
                      disabled={readOnly}
                      placeholder={`${getReferenceLabel(payment.method)}`}
                      className={inputClass}
                      style={{ width: '30%' }}
                    />
                  </>
                )}
                
                {/* Remove button */}
                {splitPayments.length > 2 && (
                  <button
                    onClick={() => removeSplitPayment(payment.id)}
                    disabled={readOnly}
                    className="text-red-500 hover:text-red-700 p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                
                {/* Add button on first row */}
                {index === 0 && splitPayments.length < 5 && (
                  <button
                    onClick={addSplitPayment}
                    disabled={readOnly}
                    className="text-xs bg-indigo-600 text-white px-3 py-2 rounded-lg hover:bg-indigo-700"
                  >
                    + Add
                  </button>
                )}
              </div>
            );
          })}

          {/* Status Badge */}
          {isFullyPaid ? (
            <div className="bg-emerald-100 text-emerald-800 px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
              <Check className="w-4 h-4" />
              Paid in full
            </div>
          ) : totalPaid > 0 ? (
            <div className="bg-amber-100 text-amber-800 px-3 py-2 rounded-lg text-sm font-medium">
              Partial: ₹{totalPaid.toFixed(2)} paid, ₹{remaining.toFixed(2)} credit
            </div>
          ) : (
            <div className="bg-gray-100 text-gray-700 px-3 py-2 rounded-lg text-sm">
              No payment received - Full credit
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SplitPayment;