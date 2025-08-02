import React from 'react';
import { CreditCard, Calendar, DollarSign, FileText, CheckCircle } from 'lucide-react';
import { Select, DatePicker, CurrencyInput, StatusBadge } from '../../global';

interface PaymentData {
  payment_mode?: string;
  payment_status?: string;
  amount_paid?: number;
  credit_terms?: string;
  due_date?: string;
  transaction_ref?: string;
  cheque_date?: string;
  payment_notes?: string;
}

interface PaymentMode {
  value: string;
  label: string;
}

interface PaymentStatus {
  value: string;
  label: string;
  variant: string;
}

interface CreditTerm {
  value: string;
  label: string;
}

interface PaymentDetailsProps {
  paymentData?: PaymentData;
  onChange?: (data: PaymentData) => void;
  totalAmount?: number;
  readOnly?: boolean;
  showAdvancedOptions?: boolean;
}

/**
 * PaymentDetails Component
 * Handles payment information including mode, status, amounts, and terms
 */
const PaymentDetails: React.FC<PaymentDetailsProps> = ({ 
  paymentData = {},
  onChange,
  totalAmount = 0,
  readOnly = false,
  showAdvancedOptions = true
}) => {
  const paymentModes: PaymentMode[] = [
    { value: 'cash', label: 'Cash' },
    { value: 'credit', label: 'Credit' },
    { value: 'card', label: 'Card' },
    { value: 'upi', label: 'UPI' },
    { value: 'bank_transfer', label: 'Bank Transfer' },
    { value: 'cheque', label: 'Cheque' },
    { value: 'advance', label: 'Advance' }
  ];

  const paymentStatuses: PaymentStatus[] = [
    { value: 'pending', label: 'Pending', variant: 'warning' },
    { value: 'partial', label: 'Partial', variant: 'info' },
    { value: 'paid', label: 'Paid', variant: 'success' },
    { value: 'overdue', label: 'Overdue', variant: 'error' }
  ];

  const creditTerms: CreditTerm[] = [
    { value: '0', label: 'Due on Receipt' },
    { value: '7', label: 'Net 7 Days' },
    { value: '15', label: 'Net 15 Days' },
    { value: '30', label: 'Net 30 Days' },
    { value: '45', label: 'Net 45 Days' },
    { value: '60', label: 'Net 60 Days' },
    { value: '90', label: 'Net 90 Days' }
  ];

  const handleChange = (field: keyof PaymentData, value: string | number) => {
    if (onChange) {
      const updatedData = { ...paymentData, [field]: value };
      
      // Auto-calculate payment status based on amount paid
      if (field === 'amount_paid') {
        const paid = parseFloat(value as string) || 0;
        const total = parseFloat(totalAmount.toString()) || 0;
        
        if (paid === 0) {
          updatedData.payment_status = 'pending';
        } else if (paid < total) {
          updatedData.payment_status = 'partial';
        } else {
          updatedData.payment_status = 'paid';
        }
      }
      
      // Auto-calculate due date based on credit terms
      if (field === 'credit_terms') {
        const days = parseInt(value as string) || 0;
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + days);
        updatedData.due_date = dueDate.toISOString().split('T')[0];
      }
      
      onChange(updatedData);
    }
  };

  const balanceAmount = (parseFloat(totalAmount.toString()) || 0) - (parseFloat(paymentData.amount_paid?.toString() || '0') || 0);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">
        PAYMENT DETAILS
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Payment Mode */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-600 mb-2">
            <CreditCard className="w-4 h-4" />
            Payment Mode
          </label>
          {readOnly ? (
            <input
              type="text"
              value={paymentModes.find(m => m.value === paymentData.payment_mode)?.label || paymentData.payment_mode || 'Cash'}
              readOnly
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 cursor-not-allowed"
            />
          ) : (
            <Select
              value={paymentData.payment_mode || 'cash'}
              onChange={(value) => handleChange('payment_mode', value)}
              options={paymentModes}
              size="sm"
              required
            />
          )}
        </div>

        {/* Payment Status */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-600 mb-2">
            <CheckCircle className="w-4 h-4" />
            Payment Status
          </label>
          {readOnly ? (
            <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50">
              <StatusBadge
                status={paymentData.payment_status || 'pending'}
                variant={paymentStatuses.find(s => s.value === paymentData.payment_status)?.variant || 'default'}
                label={paymentStatuses.find(s => s.value === paymentData.payment_status)?.label || 'Pending'}
              />
            </div>
          ) : (
            <Select
              value={paymentData.payment_status || 'pending'}
              onChange={(value) => handleChange('payment_status', value)}
              options={paymentStatuses}
              size="sm"
            />
          )}
        </div>

        {/* Total Amount */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-600 mb-2">
            <DollarSign className="w-4 h-4" />
            Total Amount
          </label>
          <div className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 font-semibold text-gray-900">
            ₹{(parseFloat(totalAmount.toString()) || 0).toFixed(2)}
          </div>
        </div>

        {/* Amount Paid */}
        {(paymentData.payment_mode !== 'credit' || (paymentData.amount_paid || 0) > 0) && (
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-600 mb-2">
              <DollarSign className="w-4 h-4" />
              Amount Paid
            </label>
            {readOnly ? (
              <div className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 font-medium text-green-700">
                ₹{(parseFloat(paymentData.amount_paid?.toString() || '0') || 0).toFixed(2)}
              </div>
            ) : (
              <CurrencyInput
                value={paymentData.amount_paid || 0}
                onChange={(value) => handleChange('amount_paid', value)}
                max={totalAmount}
                size="sm"
                className="text-green-700 font-medium"
              />
            )}
          </div>
        )}

        {/* Balance Amount */}
        {balanceAmount > 0 && (
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-600 mb-2">
              <DollarSign className="w-4 h-4" />
              Balance Amount
            </label>
            <div className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-red-50 font-medium text-red-700">
              ₹{balanceAmount.toFixed(2)}
            </div>
          </div>
        )}

        {/* Credit Terms */}
        {(paymentData.payment_mode === 'credit' || showAdvancedOptions) && (
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-600 mb-2">
              <Calendar className="w-4 h-4" />
              Credit Terms
            </label>
            {readOnly ? (
              <input
                type="text"
                value={creditTerms.find(t => t.value === paymentData.credit_terms)?.label || 'Due on Receipt'}
                readOnly
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 cursor-not-allowed"
              />
            ) : (
              <Select
                value={paymentData.credit_terms || '0'}
                onChange={(value) => handleChange('credit_terms', value)}
                options={creditTerms}
                size="sm"
              />
            )}
          </div>
        )}

        {/* Due Date */}
        {(paymentData.payment_mode === 'credit' || paymentData.due_date) && (
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-600 mb-2">
              <Calendar className="w-4 h-4" />
              Due Date
            </label>
            {readOnly ? (
              <input
                type="text"
                value={paymentData.due_date ? new Date(paymentData.due_date).toLocaleDateString('en-IN') : ''}
                readOnly
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 cursor-not-allowed"
              />
            ) : (
              <DatePicker
                value={paymentData.due_date ? new Date(paymentData.due_date) : null}
                onChange={(date) => handleChange('due_date', date ? date.toISOString().split('T')[0] : '')}
                minDate={new Date()}
                placeholder="Select due date"
                size="sm"
              />
            )}
          </div>
        )}
      </div>

      {/* Transaction Reference */}
      {showAdvancedOptions && (paymentData.payment_mode === 'bank_transfer' || paymentData.payment_mode === 'cheque' || paymentData.payment_mode === 'upi') && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-600 mb-2">
              <FileText className="w-4 h-4" />
              Transaction Reference
            </label>
            <input
              type="text"
              value={paymentData.transaction_ref || ''}
              onChange={(e) => handleChange('transaction_ref', e.target.value)}
              readOnly={readOnly}
              disabled={readOnly}
              className={`
                w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                ${readOnly ? 'bg-gray-50 cursor-not-allowed' : 'focus:ring-2 focus:ring-blue-500 focus:border-blue-500'}
              `}
              placeholder={
                paymentData.payment_mode === 'cheque' ? 'Cheque number' :
                paymentData.payment_mode === 'upi' ? 'UPI transaction ID' :
                'Transaction reference number'
              }
            />
          </div>
          
          {paymentData.payment_mode === 'cheque' && (
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-600 mb-2">
                <Calendar className="w-4 h-4" />
                Cheque Date
              </label>
              {readOnly ? (
                <input
                  type="text"
                  value={paymentData.cheque_date ? new Date(paymentData.cheque_date).toLocaleDateString('en-IN') : ''}
                  readOnly
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 cursor-not-allowed"
                />
              ) : (
                <DatePicker
                  value={paymentData.cheque_date ? new Date(paymentData.cheque_date) : null}
                  onChange={(date) => handleChange('cheque_date', date ? date.toISOString().split('T')[0] : '')}
                  placeholder="Select cheque date"
                  size="sm"
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* Payment Notes */}
      {showAdvancedOptions && (
        <div className="mt-4">
          <label className="text-sm font-medium text-gray-600 mb-2 block">
            Payment Notes
          </label>
          <textarea
            value={paymentData.payment_notes || ''}
            onChange={(e) => handleChange('payment_notes', e.target.value)}
            readOnly={readOnly}
            disabled={readOnly}
            rows={2}
            className={`
              w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none
              ${readOnly ? 'bg-gray-50 cursor-not-allowed' : 'focus:ring-2 focus:ring-blue-500 focus:border-blue-500'}
            `}
            placeholder="Any additional payment information..."
          />
        </div>
      )}
    </div>
  );
};

export default PaymentDetails;