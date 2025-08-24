import React, { useState, useEffect } from 'react';
import { Plus, X, CreditCard, Banknote, Smartphone, Building2, FileText, AlertCircle } from 'lucide-react';

/**
 * SplitPayment Component
 * Allows users to split payments across multiple payment methods
 * Tracks each payment method with amount and reference details
 */
const SplitPayment = ({ 
  totalAmount = 0, 
  payments = [], 
  onChange, 
  onPaymentStatusChange,
  allowPartial = true,
  className = '',
  readOnly = false 
}) => {
  const [paymentMethods, setPaymentMethods] = useState(payments.length > 0 ? payments : [
    { id: 1, method: 'Cash', amount: 0, reference: '' }
  ]);
  const [paymentStatus, setPaymentStatus] = useState('Pending');

  // Payment method options with icons
  const paymentOptions = [
    { value: 'Cash', label: 'Cash', icon: Banknote, color: 'green' },
    { value: 'Card', label: 'Card', icon: CreditCard, color: 'blue' },
    { value: 'UPI', label: 'UPI', icon: Smartphone, color: 'purple' },
    { value: 'Bank Transfer', label: 'Bank Transfer', icon: Building2, color: 'indigo' },
    { value: 'Cheque', label: 'Cheque', icon: FileText, color: 'gray' },
    { value: 'Credit', label: 'Credit', icon: FileText, color: 'orange' }
  ];

  // Calculate total paid and remaining
  const totalPaid = paymentMethods.reduce((sum, payment) => sum + (parseFloat(payment.amount) || 0), 0);
  const remaining = totalAmount - totalPaid;
  const isFullyPaid = Math.abs(remaining) < 0.01; // Account for floating point precision
  const isOverPaid = remaining < -0.01;

  // Update payment status based on amounts
  useEffect(() => {
    let newStatus = 'Pending';
    if (totalPaid > 0) {
      if (isFullyPaid) {
        newStatus = 'Paid';
      } else if (totalPaid < totalAmount) {
        newStatus = 'Partial';
      } else if (isOverPaid) {
        newStatus = 'Overpaid';
      }
    }
    setPaymentStatus(newStatus);
    
    // Notify parent of status change
    if (onPaymentStatusChange) {
      onPaymentStatusChange(newStatus);
    }
  }, [totalPaid, totalAmount, isFullyPaid, isOverPaid, onPaymentStatusChange]);

  // Update parent whenever payments change
  useEffect(() => {
    if (onChange) {
      const validPayments = paymentMethods.filter(p => p.amount > 0);
      onChange(validPayments, {
        totalPaid,
        remaining,
        status: paymentStatus,
        isFullyPaid,
        isPartial: !isFullyPaid && totalPaid > 0
      });
    }
  }, [paymentMethods, totalPaid, remaining, paymentStatus, isFullyPaid]);

  // Add new payment method
  const addPaymentMethod = () => {
    if (readOnly) return;
    
    const newId = Math.max(...paymentMethods.map(p => p.id), 0) + 1;
    const defaultMethod = paymentMethods.length === 0 ? 'Cash' : 'Card';
    
    setPaymentMethods([...paymentMethods, {
      id: newId,
      method: defaultMethod,
      amount: remaining > 0 ? remaining : 0,
      reference: ''
    }]);
  };

  // Remove payment method
  const removePaymentMethod = (id) => {
    if (readOnly || paymentMethods.length === 1) return;
    setPaymentMethods(paymentMethods.filter(p => p.id !== id));
  };

  // Update payment method details
  const updatePaymentMethod = (id, field, value) => {
    if (readOnly) return;
    
    setPaymentMethods(paymentMethods.map(payment => 
      payment.id === id 
        ? { ...payment, [field]: field === 'amount' ? parseFloat(value) || 0 : value }
        : payment
    ));
  };

  // Auto-fill remaining amount
  const autoFillRemaining = (id) => {
    if (readOnly || remaining <= 0) return;
    updatePaymentMethod(id, 'amount', remaining);
  };

  // Get icon for payment method
  const getPaymentIcon = (method) => {
    const option = paymentOptions.find(opt => opt.value === method);
    return option ? option.icon : Banknote;
  };

  // Get color for payment method
  const getPaymentColor = (method) => {
    const option = paymentOptions.find(opt => opt.value === method);
    return option ? option.color : 'gray';
  };

  return (
    <div className={`${className}`}>
      {/* Single payment method - default view */}
      {paymentMethods.length === 1 && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Method</label>
              <select
                value={paymentMethods[0].method}
                onChange={(e) => updatePaymentMethod(paymentMethods[0].id, 'method', e.target.value)}
                disabled={readOnly}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
              >
                {paymentOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Amount</label>
              <input
                type="text"
                value={paymentMethods[0].amount || ''}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^0-9.]/g, '');
                  updatePaymentMethod(paymentMethods[0].id, 'amount', value);
                }}
                disabled={readOnly}
                placeholder="0.00"
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
              />
            </div>
          </div>
          
          {/* Split payment button and remaining amount on same line */}
          <div className="flex items-center justify-between">
            {!readOnly && (
              <button
                onClick={addPaymentMethod}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                Split Payment
              </button>
            )}
            {remaining !== 0 && (
              <span className={`text-xs font-medium ${
                remaining > 0 ? 'text-orange-600' : 'text-red-600'
              }`}>
                {remaining > 0 ? `Remaining: ₹${remaining.toFixed(2)}` : `Excess: ₹${Math.abs(remaining).toFixed(2)}`}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Multiple payment methods - split view */}
      {paymentMethods.length > 1 && (
        <div className="space-y-2">
          {paymentMethods.map((payment, index) => (
            <div key={payment.id} className="flex items-center gap-2">
              <select
                value={payment.method}
                onChange={(e) => updatePaymentMethod(payment.id, 'method', e.target.value)}
                disabled={readOnly}
                className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              >
                {paymentOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={payment.amount || ''}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^0-9.]/g, '');
                  updatePaymentMethod(payment.id, 'amount', value);
                }}
                disabled={readOnly}
                placeholder="Amount"
                className="w-28 px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              />
              {!readOnly && (
                <button
                  onClick={() => removePaymentMethod(payment.id)}
                  className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
          
          {/* Add more button */}
          {!readOnly && (
            <button
              onClick={addPaymentMethod}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium mt-1"
            >
              + Add Method
            </button>
          )}
          
          {/* Summary for multiple payments */}
          {paymentMethods.length > 1 && (
            <div className="pt-2 mt-2 border-t border-gray-200 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Paid:</span>
                <span className="font-medium">₹{totalPaid.toFixed(2)}</span>
              </div>
              {remaining !== 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">{remaining > 0 ? 'Remaining:' : 'Excess:'}</span>
                  <span className={`font-medium ${
                    remaining > 0 ? 'text-orange-600' : 'text-red-600'
                  }`}>
                    ₹{Math.abs(remaining).toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SplitPayment;