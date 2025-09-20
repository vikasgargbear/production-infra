/**
 * Payment Allocation Modal
 * Allows users to allocate unallocated payments to outstanding invoices
 */

import React, { useState, useEffect } from 'react';
import { X, IndianRupee, ArrowRight, CheckCircle, AlertCircle } from 'lucide-react';
import { useQuery, useMutation } from 'react-query';
import apiClient from '../../services/api/apiClient';
import { formatCurrency } from '../../utils/formatters';
import { format } from 'date-fns';

interface PaymentAllocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerId: number;
  customerName: string;
  onAllocationComplete?: () => void;
  invoices?: Array<{
    invoice_id: string;
    invoice_number: string;
    invoice_date: string;
    original_amount: number;
    paid_amount: number;
    outstanding_amount: number;
  }>;
}

interface UnallocatedPayment {
  payment_id: number;
  payment_number: string;
  payment_date: string;
  payment_amount: number;
  allocated: number;
  unallocated: number;
}

interface UnpaidInvoice {
  invoice_id: number;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  allocated: number;
  due: number;
  selected?: boolean;
  allocate_amount?: number;
}

const PaymentAllocationModal: React.FC<PaymentAllocationModalProps> = ({
  isOpen,
  onClose,
  customerId,
  customerName,
  onAllocationComplete,
  invoices: propInvoices
}) => {
  const [selectedPayment, setSelectedPayment] = useState<UnallocatedPayment | null>(null);
  const [invoiceAllocations, setInvoiceAllocations] = useState<Map<number, number>>(new Map());
  const [error, setError] = useState<string | null>(null);

  // Fetch unallocated payments
  const { data: paymentsData, isLoading: loadingPayments } = useQuery(
    ['unallocated-payments', customerId],
    async () => {
      const response = await apiClient.get('/payment-allocation/unallocated-payments', {
        params: { party_id: customerId }
      });
      return response.data.payments || [];
    },
    { enabled: isOpen }
  );

  // Use prop invoices if available, otherwise fetch from API
  const { data: invoicesData, isLoading: loadingInvoices } = useQuery(
    ['unpaid-invoices', customerId],
    async () => {
      if (propInvoices && propInvoices.length > 0) {
        // Convert prop invoices to the expected format
        return propInvoices.map(invoice => ({
          invoice_id: parseInt(invoice.invoice_id),
          invoice_number: invoice.invoice_number,
          invoice_date: invoice.invoice_date,
          total_amount: invoice.original_amount,
          allocated: invoice.paid_amount,
          due: invoice.outstanding_amount // Use the correct outstanding amount from props
        }));
      }

      const response = await apiClient.get('/payment-allocation/unpaid-invoices', {
        params: { customer_id: customerId }
      });
      return response.data.invoices || [];
    },
    { enabled: isOpen }
  );

  // Allocation mutation
  const allocationMutation = useMutation(
    async (allocations: Array<{ invoice_id: number; amount: number }>) => {
      if (!selectedPayment) throw new Error('No payment selected');

      const response = await apiClient.post('/payment-allocation/allocate-bulk', {
        payment_id: selectedPayment.payment_id,
        allocations
      });
      return response.data;
    },
    {
      onSuccess: () => {
        setError(null);
        if (onAllocationComplete) onAllocationComplete();
        onClose();
      },
      onError: (err: any) => {
        setError(err.response?.data?.detail || 'Failed to allocate payment');
      }
    }
  );

  // Calculate total allocated amount
  const totalAllocated = Array.from(invoiceAllocations.values()).reduce((sum, amount) => sum + amount, 0);
  const remainingUnallocated = selectedPayment ? selectedPayment.unallocated - totalAllocated : 0;

  // Handle allocation amount change
  const handleAllocationChange = (invoiceId: number, amount: string) => {
    const numAmount = parseFloat(amount) || 0;

    if (numAmount === 0) {
      const newAllocations = new Map(invoiceAllocations);
      newAllocations.delete(invoiceId);
      setInvoiceAllocations(newAllocations);
      return;
    }

    // Find the invoice to get its due amount
    const invoice = invoicesData?.find((inv: any) => inv.invoice_id === invoiceId);
    if (!invoice) return;

    // Enforce maximum allocation = due amount (no over-allocation allowed)
    const maxAllowed = invoice.due;
    const finalAmount = Math.min(numAmount, maxAllowed);

    if (finalAmount !== numAmount) {
      // Show warning if user tried to enter more than due
      setError(`Cannot allocate more than due amount (₹${maxAllowed.toFixed(2)}) for invoice ${invoice.invoice_number}`);
      setTimeout(() => setError(null), 3000); // Clear error after 3 seconds
    }

    setInvoiceAllocations(new Map(invoiceAllocations).set(invoiceId, finalAmount));
  };

  // Auto-allocate using FIFO
  const handleAutoAllocate = () => {
    if (!selectedPayment || !invoicesData) return;

    const newAllocations = new Map<number, number>();
    let remaining = selectedPayment.unallocated;

    for (const invoice of invoicesData) {
      if (remaining <= 0) break;

      const allocateAmount = Math.min(remaining, invoice.due);
      if (allocateAmount > 0) {
        newAllocations.set(invoice.invoice_id, allocateAmount);
        remaining -= allocateAmount;
      }
    }

    setInvoiceAllocations(newAllocations);
  };

  // Handle save
  const handleSave = () => {
    const allocations = Array.from(invoiceAllocations.entries()).map(([invoice_id, amount]) => ({
      invoice_id,
      amount
    }));

    if (allocations.length === 0) {
      setError('Please allocate to at least one invoice');
      return;
    }

    allocationMutation.mutate(allocations);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="text-xl font-semibold">Allocate Payment</h2>
            <p className="text-sm text-gray-500 mt-1">{customerName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(90vh-180px)]">
          {/* Payment Selection */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Select Payment to Allocate</h3>

            {loadingPayments ? (
              <div className="text-center py-4">Loading payments...</div>
            ) : paymentsData?.length === 0 ? (
              <div className="text-center py-4 text-gray-500">
                No unallocated payments found for this customer
              </div>
            ) : (
              <div className="space-y-2">
                {paymentsData?.map((payment: UnallocatedPayment) => (
                  <div
                    key={payment.payment_id}
                    onClick={() => setSelectedPayment(payment)}
                    className={`p-3 border rounded-lg cursor-pointer transition-all ${
                      selectedPayment?.payment_id === payment.payment_id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium">{payment.payment_number}</span>
                        <span className="text-sm text-gray-500 ml-2">
                          {format(new Date(payment.payment_date), 'dd/MM/yyyy')}
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">{formatCurrency(payment.unallocated)}</div>
                        <div className="text-xs text-gray-500">
                          of {formatCurrency(payment.payment_amount)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Invoice Allocation */}
          {selectedPayment && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-700">Allocate to Invoices</h3>
                <button
                  onClick={handleAutoAllocate}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  Auto-allocate (FIFO)
                </button>
              </div>

              {loadingInvoices ? (
                <div className="text-center py-4">Loading invoices...</div>
              ) : invoicesData?.length === 0 ? (
                <div className="text-center py-4 text-gray-500">
                  No unpaid invoices found for this customer
                </div>
              ) : (
                <div className="space-y-2">
                  {invoicesData?.map((invoice: UnpaidInvoice) => {
                    const allocation = invoiceAllocations.get(invoice.invoice_id) || 0;
                    const maxAllocation = Math.min(invoice.due, selectedPayment.unallocated);

                    return (
                      <div
                        key={invoice.invoice_id}
                        className={`p-3 border rounded-lg ${
                          allocation > 0 ? 'border-green-500 bg-green-50' : 'border-gray-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <span className="font-medium">{invoice.invoice_number}</span>
                            <span className="text-sm text-gray-500 ml-2">
                              {format(new Date(invoice.invoice_date), 'dd/MM/yyyy')}
                            </span>
                            <div className="text-sm text-gray-500 mt-1">
                              Due: {formatCurrency(invoice.due)} of {formatCurrency(invoice.total_amount)}
                            </div>
                          </div>

                          <div className="flex items-center space-x-2">
                            <input
                              type="number"
                              value={allocation || ''}
                              onChange={(e) => handleAllocationChange(invoice.invoice_id, e.target.value)}
                              max={maxAllocation}
                              min={0}
                              step={0.01}
                              placeholder="0.00"
                              className="w-32 px-3 py-1 border border-gray-300 rounded-md text-right focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                            <button
                              onClick={() => handleAllocationChange(invoice.invoice_id, String(invoice.due))}
                              className="text-sm text-blue-600 hover:text-blue-700"
                            >
                              Full
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Allocation Summary */}
              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <div className="flex justify-between text-sm">
                  <span>Total Allocated:</span>
                  <span className="font-medium">{formatCurrency(totalAllocated)}</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span>Remaining Unallocated:</span>
                  <span className={`font-medium ${remainingUnallocated < 0 ? 'text-red-600' : ''}`}>
                    {formatCurrency(Math.abs(remainingUnallocated))}
                  </span>
                </div>
                {remainingUnallocated < 0 && (
                  <div className="mt-2 text-xs text-red-600 flex items-center">
                    <AlertCircle className="w-4 h-4 mr-1" />
                    Over-allocated by {formatCurrency(Math.abs(remainingUnallocated))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg flex items-center">
              <AlertCircle className="w-5 h-5 mr-2" />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 p-4 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!selectedPayment || totalAllocated <= 0 || remainingUnallocated < 0 || allocationMutation.isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            {allocationMutation.isLoading ? (
              <>Loading...</>
            ) : (
              <>
                <CheckCircle className="w-4 h-4 mr-2" />
                Allocate Payment
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentAllocationModal;