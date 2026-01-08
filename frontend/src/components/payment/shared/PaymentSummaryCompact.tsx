import React from 'react';
import {
  Calendar, CreditCard, Hash, FileText,
  User, Receipt, CheckCircle
} from 'lucide-react';
import { usePayment } from '../../../contexts/PaymentContext';
import { Card } from '../../global';

interface SelectedInvoice {
  invoice_number: string;
  invoice_date: string;
  amount_due: number;
  allocated_amount: number;
}

const PaymentSummaryCompact: React.FC = () => {
  const { payment, selectedCustomer, outstandingInvoices } = usePayment();

  // Get allocations from payment data
  const selectedInvoices = payment.allocations || [];

  const paymentModes: { [key: string]: string } = {
    CASH: '💵 Cash',
    UPI: '📱 UPI',
    CARD: '💳 Card',
    BANK_TRANSFER: '🏦 Bank',
    CHEQUE: '📄 Cheque',
    SPLIT: '➗ Split Payment'
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

  // Calculate allocations correctly
  const allocatedAmount = (selectedInvoices || []).reduce((sum: number, inv: any) => {
    // Handle both allocated_amount and allocatedAmount fields
    const amount = inv.allocated_amount || inv.allocatedAmount || 0;
    return sum + parseFloat(amount.toString());
  }, 0);

  const totalPayment = parseFloat(payment.amount || '0');
  const unallocatedAmount = totalPayment - allocatedAmount;
  const isAdvancePayment = payment.allocation_method === 'advance' ||
    (outstandingInvoices && outstandingInvoices.length === 0) ||
    unallocatedAmount > 0;

  return (
    <div className="space-y-4">
      {/* Payment Header Card */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Payment Summary</h2>
            <p className="text-sm text-gray-600 mt-1">Receipt: {payment.receipt_no || 'PMT-' + new Date().getTime()}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-blue-700">₹{totalPayment.toFixed(2)}</p>
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

        {/* Split Payment Details */}
        {payment.payment_mode === 'SPLIT' && (payment as any).split_payments && (
          <div className="pt-3 space-y-2">
            <div className="text-sm font-medium text-gray-700">Split Payment Breakdown:</div>
            <div className="space-y-1 pl-4">
              {JSON.parse((payment as any).split_payments).map((split: any, index: number) => (
                <div key={index} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">
                    {paymentModes[split.type] || split.type}
                    {split.reference && <span className="text-xs ml-2">(Ref: {split.reference})</span>}
                  </span>
                  <span className="font-medium">₹{parseFloat(split.amount || '0').toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Payment Allocation Details */}
        <div className="pt-3 space-y-3">
          {/* Allocation Summary Header */}
          <div className="border-b pb-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Payment Allocation</span>
              <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded">
                {payment.allocation_method === 'fifo' && 'FIFO'}
                {payment.allocation_method === 'lifo' && 'LIFO'}
                {payment.allocation_method === 'highest' && 'Highest First'}
                {payment.allocation_method === 'advance' && 'Advance'}
                {payment.allocation_method === 'manual' && 'Manual'}
                {!payment.allocation_method && 'FIFO'}
              </span>
            </div>
          </div>

          {/* Allocation Breakdown */}
          <div className="space-y-2">
            {/* Allocated to Invoices */}
            {allocatedAmount > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-green-800">
                    Applied to Invoices ({selectedInvoices?.length || 0})
                  </span>
                  <span className="text-sm font-bold text-green-800">
                    ₹{allocatedAmount.toFixed(2)}
                  </span>
                </div>
                {selectedInvoices && selectedInvoices.length > 0 && (
                  <div className="space-y-1">
                    {selectedInvoices.slice(0, 2).map((invoice: any, index: number) => (
                      <div key={index} className="flex items-center justify-between text-xs text-green-700">
                        <span>{invoice.invoice_number || invoice.invoice_number}</span>
                        <span>₹{(invoice.allocated_amount || invoice.allocatedAmount || 0).toFixed(2)}</span>
                      </div>
                    ))}
                    {selectedInvoices.length > 2 && (
                      <p className="text-xs text-green-600 italic">
                        +{selectedInvoices.length - 2} more
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Advance Payment */}
            {unallocatedAmount > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-amber-800">
                      Customer Advance
                    </span>
                    <p className="text-xs text-amber-600 mt-1">
                      Will be available for future invoices
                    </p>
                  </div>
                  <span className="text-sm font-bold text-amber-800">
                    ₹{unallocatedAmount.toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {/* No Outstanding - Full Advance */}
            {!allocatedAmount && totalPayment > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-blue-800">
                      Full Advance Payment
                    </span>
                    <p className="text-xs text-blue-600 mt-1">
                      No outstanding invoices to allocate
                    </p>
                  </div>
                  <span className="text-sm font-bold text-blue-800">
                    ₹{totalPayment.toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Notes if any */}
        {(payment as any).notes && (
          <div className="pt-3 border-t border-gray-200">
            <p className="text-xs text-gray-600">
              <span className="font-medium">Notes:</span> {(payment as any).notes}
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