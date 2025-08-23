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
      {/* Header with Status Only */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700">Payment Details</h3>
        
        {/* Payment Status Badge */}
        <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
          paymentStatus === 'Paid' ? 'bg-green-100 text-green-700' :
          paymentStatus === 'Partial' ? 'bg-yellow-100 text-yellow-700' :
          paymentStatus === 'Overpaid' ? 'bg-red-100 text-red-700' :
          'bg-gray-100 text-gray-700'
        }`}>
          {paymentStatus}
        </div>
      </div>

      {/* Payment Methods List */}
      <div className="space-y-3">
        {paymentMethods.map((payment, index) => {
          const Icon = getPaymentIcon(payment.method);
          const color = getPaymentColor(payment.method);
          
          return (
            <div key={payment.id} className={`border rounded-lg p-3 ${
              readOnly ? 'bg-gray-50' : 'bg-white hover:shadow-sm transition-shadow'
            }`}>
              <div className="flex items-start gap-3">
                {/* Payment Method Icon */}
                <div className={`p-2 rounded-lg bg-${color}-50 text-${color}-600`}>
                  <Icon className="w-4 h-4" />
                </div>

                {/* Payment Details */}
                <div className="flex-1">
                  <div className="grid grid-cols-2 gap-3">
                    {/* Payment Method Dropdown */}
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Method</label>
                      <select
                        value={payment.method}
                        onChange={(e) => updatePaymentMethod(payment.id, 'method', e.target.value)}
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

                    {/* Amount Input - Simple text input for better UX */}
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">
                        Amount
                        {!readOnly && remaining > 0 && (
                          <button
                            onClick={() => autoFillRemaining(payment.id)}
                            className="ml-2 text-blue-600 hover:text-blue-700 text-xs"
                          >
                            (Fill ₹{remaining.toFixed(2)})
                          </button>
                        )}
                      </label>
                      <input
                        type="text"
                        value={payment.amount || ''}
                        onChange={(e) => {
                          const value = e.target.value.replace(/[^0-9.]/g, '');
                          updatePaymentMethod(payment.id, 'amount', value);
                        }}
                        disabled={readOnly}
                        placeholder="0.00"
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                      />
                    </div>
                  </div>
                </div>

                {/* Remove Button */}
                {!readOnly && paymentMethods.length > 1 && (
                  <button
                    onClick={() => removePaymentMethod(payment.id)}
                    className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* Add Payment Method Button */}
        {!readOnly && (
          <button
            onClick={addPaymentMethod}
            className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span className="text-sm">Add Payment Method</span>
          </button>
        )}
      </div>

      {/* Payment Summary - Simplified */}
      {(remaining !== 0 || paymentMethods.length > 1) && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="space-y-2">
            {paymentMethods.length > 1 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Total Paid</span>
                <span className={`font-medium ${totalPaid > 0 ? 'text-green-600' : ''}`}>
                  ₹{totalPaid.toFixed(2)}
                </span>
              </div>
            )}
            {remaining !== 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{remaining > 0 ? 'Remaining' : 'Excess'}</span>
                <span className={`font-semibold ${
                  remaining > 0 ? 'text-orange-600' : 'text-red-600'
                }`}>
                  ₹{Math.abs(remaining).toFixed(2)}
                </span>
              </div>
            )}
          </div>

        {/* Warning Messages */}
        {isOverPaid && (
          <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5" />
            <div className="text-xs text-red-700">
              <p className="font-semibold">Overpayment Detected</p>
              <p>The total payment exceeds the bill amount by ₹{Math.abs(remaining).toFixed(2)}</p>
            </div>
          </div>
        )}

        {!allowPartial && remaining > 0 && totalPaid > 0 && (
          <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-yellow-500 mt-0.5" />
            <div className="text-xs text-yellow-700">
              <p className="font-semibold">Partial Payment</p>
              <p>Please complete the full payment of ₹{remaining.toFixed(2)}</p>
            </div>
          </div>
        )}
        </div>
      )}
    </div>
  );
};

export default SplitPayment;