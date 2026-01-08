import React from 'react';
import { 
  CheckCircle, Calendar, CreditCard, Hash, FileText, 
  User, DollarSign, Receipt, Building, MessageSquare
} from 'lucide-react';
import { usePayment } from '../../../contexts/PaymentContext';
import { 
  Card, 
  StatusBadge
} from '../../global';

interface PaymentModeLabel {
  label: string;
  icon: string;
}

interface PaymentModeLabels {
  [key: string]: PaymentModeLabel;
}

interface PaymentTypeLabels {
  [key: string]: string;
}

interface SelectedInvoice {
  invoice_number: string;
  invoice_date: string;
  amount_due: number;
  allocated_amount: number;
}

const PaymentSummaryV2: React.FC = () => {
  const { payment, selectedCustomer, selectedInvoices, setPaymentField } = usePayment();

  const paymentModeLabels: PaymentModeLabels = {
    CASH: { label: 'Cash', icon: '💵' },
    UPI: { label: 'UPI', icon: '📱' },
    CARD: { label: 'Card', icon: '💳' },
    BANK_TRANSFER: { label: 'Bank Transfer', icon: '🏦' },
    CHEQUE: { label: 'Cheque', icon: '📄' }
  };

  const paymentTypeLabels: PaymentTypeLabels = {
    order_payment: 'Order Payment',
    advance: 'Advance Payment',
    adjustment: 'Adjustment'
  };

  // Format date
  const formatDate = (date: string): string => {
    return new Date(date).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  // Calculate allocated amount
  const allocatedAmount = selectedInvoices.reduce((sum: number, inv: SelectedInvoice) => sum + inv.allocated_amount, 0);
  const unallocatedAmount = parseFloat(payment.amount || '0') - allocatedAmount;

  return (
    <div className="space-y-6">
      {/* Payment Receipt Header */}
      <Card className="bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200">
        <div className="text-center">
          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-md">
            <Receipt className="w-8 h-8 text-amber-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Payment Receipt</h2>
          <p className="text-sm text-gray-600 mt-2">
            Receipt No: <span className="font-medium">PMT-{new Date().getTime()}</span>
          </p>
        </div>
      </Card>

      {/* Customer Information */}
      <Card>
        <h3 className="text-lg font-medium text-gray-900 mb-4">Customer Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex items-start space-x-3">
            <User className="w-5 h-5 text-gray-400 mt-0.5" />
            <div>
              <p className="text-sm text-gray-600">Customer Name</p>
              <p className="font-medium text-gray-900">{selectedCustomer?.customer_name || 'N/A'}</p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <Building className="w-5 h-5 text-gray-400 mt-0.5" />
            <div>
              <p className="text-sm text-gray-600">Customer Code</p>
              <p className="font-medium text-gray-900">{selectedCustomer?.customer_code || 'N/A'}</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Payment Information */}
      <Card>
        <h3 className="text-lg font-medium text-gray-900 mb-4">Payment Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="flex items-start space-x-3">
            <Calendar className="w-5 h-5 text-gray-400 mt-0.5" />
            <div>
              <p className="text-sm text-gray-600">Payment Date</p>
              <p className="font-medium text-gray-900">{formatDate(payment.payment_date)}</p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <CreditCard className="w-5 h-5 text-gray-400 mt-0.5" />
            <div>
              <p className="text-sm text-gray-600">Payment Mode</p>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                {paymentModeLabels[payment.payment_mode]?.icon} {paymentModeLabels[payment.payment_mode]?.label}
              </span>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <FileText className="w-5 h-5 text-gray-400 mt-0.5" />
            <div>
              <p className="text-sm text-gray-600">Payment Type</p>
              <p className="font-medium text-gray-900">{paymentTypeLabels[payment.payment_type]}</p>
            </div>
          </div>
          {payment.reference_number && (
            <div className="flex items-start space-x-3">
              <Hash className="w-5 h-5 text-gray-400 mt-0.5" />
              <div>
                <p className="text-sm text-gray-600">Reference Number</p>
                <p className="font-medium text-gray-900">{payment.reference_number}</p>
              </div>
            </div>
          )}
        </div>

        {/* Amount Summary */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex justify-between items-center">
            <span className="text-lg font-medium text-gray-900">Payment Amount</span>
            <span className="text-2xl font-bold text-amber-900">₹{parseFloat(payment.amount || '0').toFixed(2)}</span>
          </div>
        </div>
      </Card>

      {/* Invoice Allocation (if any) */}
      {selectedInvoices.length > 0 && (
        <Card>
          <h3 className="text-lg font-medium text-gray-900 mb-4">Invoice Allocation</h3>
          <div className="space-y-3">
            {selectedInvoices.map((invoice: SelectedInvoice, index: number) => (
              <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">{invoice.invoice_number}</p>
                  <p className="text-sm text-gray-600">
                    Due: ₹{invoice.amount_due.toFixed(2)} • {formatDate(invoice.invoice_date)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-medium text-gray-900">₹{invoice.allocated_amount.toFixed(2)}</p>
                  <StatusBadge 
                    status={invoice.allocated_amount >= invoice.amount_due ? 'paid' : 'partial'} 
                  />
                </div>
              </div>
            ))}
            
            {/* Allocation Summary */}
            <div className="mt-4 pt-4 border-t border-gray-200 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Total Payment</span>
                <span className="font-medium">₹{parseFloat(payment.amount || '0').toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Allocated Amount</span>
                <span className="font-medium">₹{allocatedAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t">
                <span className="font-medium text-gray-900">Unallocated Amount</span>
                <span className={`font-bold ${unallocatedAmount > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
                  ₹{unallocatedAmount.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Remarks - Editable */}
      <Card>
        <div className="flex items-center space-x-2 mb-4">
          <MessageSquare className="w-5 h-5 text-gray-400" />
          <h3 className="text-lg font-medium text-gray-900">Remarks</h3>
          <span className="text-sm text-gray-500">(Optional)</span>
        </div>
        <textarea
          value={payment.remarks || ''}
          onChange={(e) => setPaymentField('remarks', e.target.value)}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors resize-none"
          placeholder="Add any notes or remarks for this payment..."
          rows={3}
        />
        <p className="mt-2 text-xs text-gray-500">
          These remarks will be included in the payment receipt and records.
        </p>
      </Card>

      {/* Receipt Footer */}
      <Card className="bg-gray-50 border-gray-300">
        <div className="text-center text-sm text-gray-600">
          <p>This is a computer generated receipt</p>
          <p className="mt-1">Generated on: {new Date().toLocaleString('en-IN')}</p>
        </div>
      </Card>
    </div>
  );
};

export default PaymentSummaryV2;