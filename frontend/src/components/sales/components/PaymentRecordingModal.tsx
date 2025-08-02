import React, { useState, useEffect } from 'react';
import { X, DollarSign, Calendar, CreditCard, Banknote, Smartphone, FileText } from 'lucide-react';
import { invoicesApi } from '../../../services/api';
import { formatCurrency } from '../../../utils/formatters';

interface Invoice {
  invoice_id: number;
  invoice_number: string;
  customer_name: string;
  total_amount: number;
  amount_paid: number;
}

interface PaymentData {
  payment_date: string;
  payment_mode: string;
  amount: number;
  transaction_id: string;
  bank_name: string;
  cheque_number: string;
  notes: string;
}

interface PaymentRecordingModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice | null;
  onPaymentRecorded?: (data: any) => void;
}

const PaymentRecordingModal: React.FC<PaymentRecordingModalProps> = ({ 
  isOpen, 
  onClose, 
  invoice, 
  onPaymentRecorded 
}) => {
  const [payment, setPayment] = useState<PaymentData>({
    payment_date: new Date().toISOString().split('T')[0],
    payment_mode: 'cash',
    amount: 0,
    transaction_id: '',
    bank_name: '',
    cheque_number: '',
    notes: ''
  });
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (invoice && isOpen) {
      // Calculate remaining amount
      const totalAmount = invoice.total_amount || 0;
      const paidAmount = invoice.amount_paid || 0;
      const remainingAmount = totalAmount - paidAmount;
      
      setPayment(prev => ({
        ...prev,
        amount: remainingAmount > 0 ? remainingAmount : 0
      }));
    }
  }, [invoice, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!invoice) return;
    
    // Validation
    if (!payment.amount || payment.amount <= 0) {
      setError('Please enter a valid payment amount');
      return;
    }
    
    const remainingAmount = (invoice.total_amount || 0) - (invoice.amount_paid || 0);
    if (payment.amount > remainingAmount) {
      setError(`Payment amount cannot exceed remaining amount: ${formatCurrency(remainingAmount)}`);
      return;
    }
    
    if (payment.payment_mode === 'cheque' && !payment.cheque_number) {
      setError('Please enter cheque number');
      return;
    }
    
    if ((payment.payment_mode === 'bank_transfer' || payment.payment_mode === 'upi') && !payment.transaction_id) {
      setError('Please enter transaction ID');
      return;
    }
    
    setSaving(true);
    try {
      // Record payment through API
      const paymentData = {
        invoice_id: invoice.invoice_id,
        payment_date: payment.payment_date,
        payment_mode: payment.payment_mode,
        amount: parseFloat(payment.amount.toString()),
        transaction_id: payment.transaction_id || null,
        bank_name: payment.bank_name || null,
        cheque_number: payment.cheque_number || null,
        notes: payment.notes || null
      };
      
      const response = await invoicesApi.recordPayment(invoice.invoice_id, paymentData);
      
      if (onPaymentRecorded) {
        onPaymentRecorded(response.data);
      }
      
      // Reset form and close
      setPayment({
        payment_date: new Date().toISOString().split('T')[0],
        payment_mode: 'cash',
        amount: 0,
        transaction_id: '',
        bank_name: '',
        cheque_number: '',
        notes: ''
      });
      onClose();
    } catch (error: any) {
      console.error('Error recording payment:', error);
      setError(error.response?.data?.detail || 'Failed to record payment');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !invoice) return null;

  const totalAmount = invoice.total_amount || 0;
  const paidAmount = invoice.amount_paid || 0;
  const remainingAmount = totalAmount - paidAmount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-green-600" />
            Record Payment
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-4">
          {/* Invoice Summary */}
          <div className="bg-gray-50 rounded-lg p-3 mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-600">Invoice #</span>
              <span className="font-medium">{invoice.invoice_number}</span>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-600">Customer</span>
              <span className="font-medium">{invoice.customer_name}</span>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-600">Total Amount</span>
              <span className="font-medium">{formatCurrency(totalAmount)}</span>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-600">Paid Amount</span>
              <span className="font-medium text-green-600">{formatCurrency(paidAmount)}</span>
            </div>
            <div className="border-t pt-2 flex justify-between items-center">
              <span className="text-sm font-semibold text-gray-700">Remaining</span>
              <span className="font-bold text-red-600">{formatCurrency(remainingAmount)}</span>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-100 text-red-800 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Payment Date */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Payment Date
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="date"
                value={payment.payment_date}
                onChange={(e) => setPayment({ ...payment, payment_date: e.target.value })}
                className="pl-10 pr-3 py-2 w-full border rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          {/* Payment Mode */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Payment Mode
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPayment({ ...payment, payment_mode: 'cash' })}
                className={`p-3 rounded-lg border-2 flex flex-col items-center gap-1 transition-all ${
                  payment.payment_mode === 'cash' 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <Banknote className="w-5 h-5" />
                <span className="text-sm">Cash</span>
              </button>
              <button
                type="button"
                onClick={() => setPayment({ ...payment, payment_mode: 'bank_transfer' })}
                className={`p-3 rounded-lg border-2 flex flex-col items-center gap-1 transition-all ${
                  payment.payment_mode === 'bank_transfer' 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <CreditCard className="w-5 h-5" />
                <span className="text-sm">Bank Transfer</span>
              </button>
              <button
                type="button"
                onClick={() => setPayment({ ...payment, payment_mode: 'cheque' })}
                className={`p-3 rounded-lg border-2 flex flex-col items-center gap-1 transition-all ${
                  payment.payment_mode === 'cheque' 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <FileText className="w-5 h-5" />
                <span className="text-sm">Cheque</span>
              </button>
              <button
                type="button"
                onClick={() => setPayment({ ...payment, payment_mode: 'upi' })}
                className={`p-3 rounded-lg border-2 flex flex-col items-center gap-1 transition-all ${
                  payment.payment_mode === 'upi' 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <Smartphone className="w-5 h-5" />
                <span className="text-sm">UPI</span>
              </button>
            </div>
          </div>

          {/* Payment Amount */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Payment Amount
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">₹</span>
              <input
                type="number"
                value={payment.amount}
                onChange={(e) => setPayment({ ...payment, amount: parseFloat(e.target.value) || 0 })}
                className="pl-8 pr-3 py-2 w-full border rounded-lg focus:ring-2 focus:ring-blue-500"
                step="0.01"
                min="0"
                max={remainingAmount}
                required
              />
            </div>
            {payment.amount > 0 && payment.amount < remainingAmount && (
              <p className="text-xs text-gray-500 mt-1">
                Partial payment - Remaining: {formatCurrency(remainingAmount - payment.amount)}
              </p>
            )}
          </div>

          {/* Conditional Fields */}
          {payment.payment_mode === 'bank_transfer' && (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Transaction ID
                </label>
                <input
                  type="text"
                  value={payment.transaction_id}
                  onChange={(e) => setPayment({ ...payment, transaction_id: e.target.value })}
                  className="px-3 py-2 w-full border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter transaction reference"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Bank Name
                </label>
                <input
                  type="text"
                  value={payment.bank_name}
                  onChange={(e) => setPayment({ ...payment, bank_name: e.target.value })}
                  className="px-3 py-2 w-full border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter bank name"
                />
              </div>
            </>
          )}

          {payment.payment_mode === 'cheque' && (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cheque Number
                </label>
                <input
                  type="text"
                  value={payment.cheque_number}
                  onChange={(e) => setPayment({ ...payment, cheque_number: e.target.value })}
                  className="px-3 py-2 w-full border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter cheque number"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Bank Name
                </label>
                <input
                  type="text"
                  value={payment.bank_name}
                  onChange={(e) => setPayment({ ...payment, bank_name: e.target.value })}
                  className="px-3 py-2 w-full border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter bank name"
                />
              </div>
            </>
          )}

          {payment.payment_mode === 'upi' && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Transaction ID
              </label>
              <input
                type="text"
                value={payment.transaction_id}
                onChange={(e) => setPayment({ ...payment, transaction_id: e.target.value })}
                className="px-3 py-2 w-full border rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Enter UPI transaction ID"
                required
              />
            </div>
          )}

          {/* Notes */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes (Optional)
            </label>
            <textarea
              value={payment.notes}
              onChange={(e) => setPayment({ ...payment, notes: e.target.value })}
              className="px-3 py-2 w-full border rounded-lg focus:ring-2 focus:ring-blue-500"
              rows={2}
              placeholder="Add any additional notes..."
            />
          </div>
        </form>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-4 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-white border rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || payment.amount <= 0}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {saving ? 'Recording...' : 'Record Payment'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentRecordingModal;