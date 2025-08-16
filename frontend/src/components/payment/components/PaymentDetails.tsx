import React, { useEffect } from 'react';
import { DollarSign, CreditCard, Hash, Calendar } from 'lucide-react';
import { usePayment } from '../../../contexts/PaymentContext';
import { 
  Card
} from '../../global';
import { 
  FormRow
} from '../../common';

interface PaymentMode {
  value: string;
  label: string;
  icon: string;
}

interface PaymentType {
  value: string;
  label: string;
}

interface QuickPaymentEvent extends CustomEvent {
  detail: number;
}

const PaymentDetailsV3: React.FC = () => {
  const { 
    payment, 
    setPaymentField, 
    errors, 
    clearError,
    setError 
  } = usePayment();

  // Quick payment amount handler
  useEffect(() => {
    const handleQuickPayment = (event: QuickPaymentEvent) => {
      setPaymentField('amount', event.detail.toString());
    };

    window.addEventListener('quickPayment', handleQuickPayment as EventListener);
    return () => window.removeEventListener('quickPayment', handleQuickPayment as EventListener);
  }, [setPaymentField]);

  const handleFieldChange = (field: string, value: string): void => {
    setPaymentField(field, value);
    
    // Clear error when user starts typing
    if (errors[field]) {
      clearError(field);
    }

    // Basic validation
    if (field === 'amount') {
      const amount = parseFloat(value);
      if (value && (isNaN(amount) || amount <= 0)) {
        setError(field, 'Please enter a valid amount');
      }
    }
  };

  const paymentModes: PaymentMode[] = [
    { value: 'CASH', label: 'Cash', icon: '💵' },
    { value: 'UPI', label: 'UPI', icon: '📱' },
    { value: 'CARD', label: 'Card', icon: '💳' },
    { value: 'BANK_TRANSFER', label: 'Bank Transfer', icon: '🏦' },
    { value: 'CHEQUE', label: 'Cheque', icon: '📄' }
  ];

  const paymentTypes: PaymentType[] = [
    { value: 'order_payment', label: 'Order Payment' },
    { value: 'advance', label: 'Advance Payment' },
    { value: 'adjustment', label: 'Adjustment' }
  ];

  return (
    <Card>
      <h3 className="text-sm font-medium text-gray-700 mb-4">Payment Information</h3>
      
      <div className="space-y-4">
        {/* Reference Number, Payment Date & Payment Mode - Top Row */}
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Reference Number</label>
            <div className="relative">
              <Hash className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={payment.reference_number || ''}
                onChange={(e) => handleFieldChange('reference_number', e.target.value)}
                className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                placeholder="Transaction ID"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Payment Date</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="date"
                value={payment.payment_date || new Date().toISOString().split('T')[0]}
                onChange={(e) => handleFieldChange('payment_date', e.target.value)}
                className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Payment Mode <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <CreditCard className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <select
                value={payment.payment_mode}
                onChange={(e) => handleFieldChange('payment_mode', e.target.value)}
                className={`w-full pl-10 pr-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
                  errors.payment_mode ? 'border-red-500' : 'border-gray-300'
                }`}
              >
                <option value="">Select mode</option>
                {paymentModes.map((mode: PaymentMode) => (
                  <option key={mode.value} value={mode.value}>
                    {mode.icon} {mode.label}
                  </option>
                ))}
              </select>
              {errors.payment_mode && (
                <p className="text-xs text-red-600 mt-1">{errors.payment_mode}</p>
              )}
            </div>
          </div>
        </div>

        {/* Payment Amount - Single field below */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Amount <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="number"
              value={payment.amount}
              onChange={(e) => handleFieldChange('amount', e.target.value)}
              className={`w-full pl-10 pr-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
                errors.amount ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="0.00"
              min="0"
              step="0.01"
              required
            />
            {errors.amount && (
              <p className="mt-1 text-sm text-red-600">{errors.amount}</p>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
};

export default PaymentDetailsV3;