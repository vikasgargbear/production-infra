import React from 'react';
import {
  Hash, User, CheckCircle
} from 'lucide-react';
import { usePayment } from '../../../contexts/PaymentContext';
import { Card } from '../../global';
import {
  exactDecimalString,
  exactDecimalUnits,
  formatExactCurrency,
} from '../../../utils/exactDecimal';

const moneyOptions = { scale: 2, maximumWholeDigits: 18 } as const;

const moneyUnits = (value: unknown, label: string): bigint => (
  exactDecimalUnits(value, label, moneyOptions)
);

const moneyString = (units: bigint): string => exactDecimalString(units, 2);

const PaymentSummaryCompact: React.FC = () => {
  const { payment, selectedCustomer } = usePayment();

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
  const allocatedUnits = selectedInvoices.reduce<bigint>((sum, invoice, index) => (
    sum + moneyUnits(invoice.amount, `Allocation ${index + 1}`)
  ), 0n);
  const totalUnits = moneyUnits(payment.amount || '0', 'Receipt amount');
  const unallocatedUnits = totalUnits - allocatedUnits;
  return (
    <div className="space-y-4">
      {/* Payment Header Card */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Payment Summary</h2>
            <p className="text-sm text-gray-600 mt-1">Receipt: {payment.receipt_no || 'Assigned after posting'}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-blue-700">{formatExactCurrency(moneyString(totalUnits), 'Receipt amount')}</p>
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
                  <span className="font-medium">{formatExactCurrency(split.amount || '0', `Split payment ${index + 1}`)}</span>
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
            {allocatedUnits > 0n && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-green-800">
                    Applied to Invoices ({selectedInvoices?.length || 0})
                  </span>
                  <span className="text-sm font-bold text-green-800">
                    {formatExactCurrency(moneyString(allocatedUnits), 'Allocated amount')}
                  </span>
                </div>
                {selectedInvoices && selectedInvoices.length > 0 && (
                  <div className="space-y-1">
                    {selectedInvoices.slice(0, 2).map((invoice: any, index: number) => (
                      <div key={index} className="flex items-center justify-between text-xs text-green-700">
                        <span>{invoice.invoice_number || invoice.invoice_number}</span>
                        <span>{formatExactCurrency(invoice.amount, `Allocation ${index + 1}`)}</span>
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
            {unallocatedUnits > 0n && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-amber-800">
                      Customer Advance
                    </span>
                    <p className="text-xs text-amber-600 mt-1">
                      Posting unavailable until the canonical customer-advance command is connected
                    </p>
                  </div>
                  <span className="text-sm font-bold text-amber-800">
                    {formatExactCurrency(moneyString(unallocatedUnits), 'Unallocated amount')}
                  </span>
                </div>
              </div>
            )}

            {/* No Outstanding - Full Advance */}
            {allocatedUnits === 0n && totalUnits > 0n && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-blue-800">
                      Full Advance Payment
                    </span>
                    <p className="text-xs text-blue-600 mt-1">
                      Customer-advance posting is not yet available
                    </p>
                  </div>
                  <span className="text-sm font-bold text-blue-800">
                    {formatExactCurrency(moneyString(totalUnits), 'Receipt amount')}
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
          <span className="text-xs text-gray-500">Final receipt identity is assigned by the server.</span>
        </div>
      </Card>
    </div>
  );
};

export default PaymentSummaryCompact;
