import React from 'react';
import { 
  CheckCircle, Calendar, CreditCard, Hash, FileText, 
  User, DollarSign, Receipt, Building
} from 'lucide-react';
import { usePayment } from '../../../contexts/PaymentContext';
import { 
  Card, 
  Badge, 
  StatusBadge
} from '../../global';
import { 
  SummaryDisplay,
  SectionHeader
} from '../../common';

const PaymentSummaryV2 = () => {
  const { payment, selectedCustomer, selectedInvoices } = usePayment();

  const paymentModeLabels = {
    CASH: { label: 'Cash', icon: '💵' },
    UPI: { label: 'UPI', icon: '📱' },
    CARD: { label: 'Card', icon: '💳' },
    BANK_TRANSFER: { label: 'Bank Transfer', icon: '🏦' },
    CHEQUE: { label: 'Cheque', icon: '📄' }
  };

  const paymentTypeLabels = {
    order_payment: 'Order Payment',
    advance: 'Advance Payment',
    adjustment: 'Adjustment'
  };

  // Format date
  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  // Calculate allocated amount
  const allocatedAmount = selectedInvoices.reduce((sum, inv) => sum + inv.allocated_amount, 0);
  const unallocatedAmount = parseFloat(payment.amount || 0) - allocatedAmount;

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
        <SectionHeader title="Customer Information" />
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
        <SectionHeader title="Payment Details" />
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
              <Badge variant="primary">
                {paymentModeLabels[payment.payment_mode]?.icon} {paymentModeLabels[payment.payment_mode]?.label}
              </Badge>
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
        <SummaryDisplay
          items={[
            { label: 'Payment Amount', value: parseFloat(payment.amount || 0), isTotal: true }
          ]}
          className="bg-amber-50 border border-amber-200"
        />
      </Card>

      {/* Invoice Allocation (if any) */}
      {selectedInvoices.length > 0 && (
        <Card>
          <SectionHeader title="Invoice Allocation" />
          <div className="space-y-3">
            {selectedInvoices.map((invoice, index) => (
              <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">{invoice.invoice_no}</p>
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
            <div className="mt-4 pt-4 border-t border-gray-200">
              <SummaryDisplay
                items={[
                  { label: 'Total Payment', value: parseFloat(payment.amount || 0) },
                  { label: 'Allocated Amount', value: allocatedAmount },
                  { 
                    label: 'Unallocated Amount', 
                    value: unallocatedAmount, 
                    isTotal: true,
                    className: unallocatedAmount > 0 ? 'text-amber-600' : ''
                  }
                ]}
              />
            </div>
          </div>
        </Card>
      )}

      {/* Remarks */}
      {payment.remarks && (
        <Card>
          <SectionHeader title="Remarks" />
          <p className="text-gray-700">{payment.remarks}</p>
        </Card>
      )}

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