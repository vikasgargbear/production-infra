import React from 'react';
import { 
  Calendar, CreditCard, Hash, FileText, 
  User, Receipt, CheckCircle
} from 'lucide-react';
import { usePayment } from '../../../contexts/PaymentContext';
import { Card } from '../../global';

interface SelectedInvoice {
  invoice_no: string;
  invoice_date: string;
  amount_due: number;
  allocated_amount: number;
}

const PaymentSummaryCompact: React.FC = () => {
  const { payment, selectedCustomer, selectedInvoices } = usePayment();

  const paymentModes: { [key: string]: string } = {
    CASH: '💵 Cash',
    UPI: '📱 UPI',
    CARD: '💳 Card',
    BANK_TRANSFER: '🏦 Bank',
    CHEQUE: '📄 Cheque'
  };

  const paymentTypes: { [key: string]: string } = {
    order_payment: 'Order Payment',
    advance: 'Advance',
    adjustment: 'Adjustment'
  };

  const formatDate = (date: string): string => {
    return new Date(date).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const allocatedAmount = (selectedInvoices || []).reduce((sum: number, inv: SelectedInvoice) => 
    sum + inv.allocated_amount, 0
  );
  const unallocatedAmount = parseFloat(payment.amount || '0') - allocatedAmount;

  return (
    <div className="space-y-4">
      {/* Compact Header with Receipt Number */}
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Receipt className="w-6 h-6 text-green-600" />
            <div>
              <h2 className="text-lg font-bold text-gray-900">Payment Receipt</h2>
              <p className="text-sm text-gray-600">#{payment.receipt_no || 'PMT-' + new Date().getTime()}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-green-700">₹{parseFloat(payment.amount || '0').toFixed(2)}</p>
            <p className="text-xs text-gray-600">{formatDate(payment.payment_date)}</p>
          </div>
        </div>
      </div>

      {/* Single Compact Card with All Info */}
      <Card className="p-4">
        {/* Customer & Payment Info in One Line */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-gray-200">
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-2">
              <User className="w-4 h-4 text-gray-400" />
              <span className="text-sm">
                <span className="text-gray-600">Customer:</span>{' '}
                <span className="font-medium text-gray-900">{selectedCustomer?.customer_name || 'N/A'}</span>
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-sm px-2 py-1 bg-blue-100 text-blue-800 rounded-full">
                {paymentModes[payment.payment_mode]}
              </span>
            </div>
            {payment.reference_number && (
              <div className="flex items-center space-x-2">
                <Hash className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-600">Ref: {payment.reference_number}</span>
              </div>
            )}
          </div>
          <div className="text-sm text-gray-600">
            {paymentTypes[payment.payment_type]}
          </div>
        </div>

        {/* Invoice Allocation Summary */}
        {selectedInvoices && selectedInvoices.length > 0 && (
          <div className="pt-3 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Invoices Allocated ({selectedInvoices?.length || 0})</span>
              <span className="font-medium">₹{allocatedAmount.toFixed(2)}</span>
            </div>
            
            {/* Compact Invoice List */}
            <div className="space-y-1 pl-4">
              {(selectedInvoices || []).slice(0, 3).map((invoice: SelectedInvoice, index: number) => (
                <div key={index} className="flex items-center justify-between text-xs">
                  <span className="text-gray-600">
                    {invoice.invoice_no} • {formatDate(invoice.invoice_date)}
                  </span>
                  <span className="font-medium text-gray-900">₹{invoice.allocated_amount.toFixed(2)}</span>
                </div>
              ))}
              {selectedInvoices && selectedInvoices.length > 3 && (
                <p className="text-xs text-gray-500 italic">
                  +{selectedInvoices.length - 3} more invoices
                </p>
              )}
            </div>

            {/* Unallocated Amount Alert */}
            {unallocatedAmount > 0 && (
              <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                <span className="text-sm text-amber-600 font-medium">
                  Advance/Unallocated
                </span>
                <span className="text-sm font-bold text-amber-600">
                  ₹{unallocatedAmount.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Notes if any */}
        {payment.notes && (
          <div className="pt-3 border-t border-gray-200">
            <p className="text-xs text-gray-600">
              <span className="font-medium">Notes:</span> {payment.notes}
            </p>
          </div>
        )}

        {/* Status Badge */}
        <div className="flex items-center justify-between pt-3 mt-3 border-t border-gray-200">
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-4 h-4 text-green-600" />
            <span className="text-sm text-green-600 font-medium">Ready to Save</span>
          </div>
          <div className="flex items-center space-x-4 text-xs text-gray-500">
            <span>Created by: {selectedCustomer?.created_by || 'System'}</span>
            <span>{new Date().toLocaleTimeString('en-IN')}</span>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default PaymentSummaryCompact;