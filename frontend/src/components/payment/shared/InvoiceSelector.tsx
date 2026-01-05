import React, { useState } from 'react';
import { FileText, DollarSign, Check, AlertCircle } from 'lucide-react';
import { usePayment } from '../../../contexts/PaymentContext';
import {
  Card,
  StatusBadge
} from '../../global';
import {
  SectionHeader
} from '../../global';

interface Invoice {
  invoice_no: string;
  invoice_date: string;
  total_amount: number;
  amount_due: number;
  remaining_due?: number; // Amount after existing allocations
  existing_allocations?: number; // Total already allocated
}

interface Allocations {
  [invoiceId: string]: number;
}

const InvoiceSelectorV2: React.FC = () => {
  const {
    outstandingInvoices,
    selectedInvoices,
    setSelectedInvoices,
    payment
  } = usePayment();

  const [allocations, setAllocations] = useState<Allocations>({});

  // Calculate totals - use remaining_due if available (accounts for existing allocations)
  const totalOutstanding = outstandingInvoices.reduce((sum: number, inv: Invoice) =>
    sum + (inv.remaining_due !== undefined ? inv.remaining_due : inv.amount_due), 0
  );
  const totalAllocated = Object.values(allocations).reduce((sum: number, amount: number) => sum + (parseFloat(amount.toString()) || 0), 0);
  const remainingPayment = parseFloat(payment.amount || '0') - totalAllocated;

  // Handle allocation change
  const handleAllocationChange = (invoiceId: string, value: string): void => {
    const amount = parseFloat(value) || 0;
    const invoice = outstandingInvoices.find((inv: Invoice) => inv.invoice_no === invoiceId);

    const maxAllocation = invoice?.remaining_due !== undefined ? invoice.remaining_due : invoice?.amount_due || 0;
    if (invoice && amount > maxAllocation) {
      return; // Don't allow allocation more than remaining due amount
    }

    const newAllocations = { ...allocations };
    if (amount > 0) {
      newAllocations[invoiceId] = amount;
    } else {
      delete newAllocations[invoiceId];
    }

    setAllocations(newAllocations);

    // Update selected invoices
    const selected = outstandingInvoices
      .filter((inv: Invoice) => newAllocations[inv.invoice_no] > 0)
      .map((inv: Invoice) => ({
        ...inv,
        allocated_amount: newAllocations[inv.invoice_no]
      }));

    setSelectedInvoices(selected);
  };

  // Auto-allocate payment
  const autoAllocate = (): void => {
    const newAllocations: Allocations = {};
    let remainingAmount = parseFloat(payment.amount || '0');

    // Sort invoices by date (oldest first)
    const sortedInvoices = [...outstandingInvoices].sort(
      (a: Invoice, b: Invoice) => new Date(a.invoice_date).getTime() - new Date(b.invoice_date).getTime()
    );

    for (const invoice of sortedInvoices) {
      if (remainingAmount <= 0) break;

      const dueAmount = invoice.remaining_due !== undefined ? invoice.remaining_due : invoice.amount_due;
      const allocationAmount = Math.min(remainingAmount, dueAmount);
      if (allocationAmount > 0) {
        newAllocations[invoice.invoice_no] = allocationAmount;
        remainingAmount -= allocationAmount;
      }
    }

    setAllocations(newAllocations);

    // Update selected invoices
    const selected = outstandingInvoices
      .filter((inv: Invoice) => newAllocations[inv.invoice_no] > 0)
      .map((inv: Invoice) => ({
        ...inv,
        allocated_amount: newAllocations[inv.invoice_no]
      }));

    setSelectedInvoices(selected);
  };

  // Clear all allocations
  const clearAllocations = (): void => {
    setAllocations({});
    setSelectedInvoices([]);
  };

  if (!outstandingInvoices || outstandingInvoices.length === 0) {
    return (
      <Card>
        <div className="text-center py-8">
          <div className="text-gray-400 mb-4">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-1">No outstanding invoices</h3>
          <p className="text-gray-500">This customer has no pending invoices</p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <SectionHeader
        title="Outstanding Invoices"
        subtitle="Allocate payment to invoices (optional)"
        actions={
          <div className="flex items-center space-x-2">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
              <span className="w-2 h-2 mr-2 bg-red-400 rounded-full"></span>
              Total Outstanding: ₹{(totalOutstanding || 0).toFixed(2)}
            </span>
            {payment.amount && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                Payment: ₹{parseFloat(payment.amount).toFixed(2)}
              </span>
            )}
          </div>
        }
      />

      {/* Auto-allocation buttons */}
      {payment.amount && (
        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            {remainingPayment > 0 ? (
              <span className="text-amber-600">
                <AlertCircle className="w-4 h-4 inline mr-1" />
                ₹{(remainingPayment || 0).toFixed(2)} unallocated
              </span>
            ) : remainingPayment < 0 ? (
              <span className="text-red-600">
                <AlertCircle className="w-4 h-4 inline mr-1" />
                Over-allocated by ₹{Math.abs(remainingPayment || 0).toFixed(2)}
              </span>
            ) : (
              <span className="text-green-600">
                <Check className="w-4 h-4 inline mr-1" />
                Fully allocated
              </span>
            )}
          </div>
          <div className="space-x-2">
            <button
              onClick={autoAllocate}
              className="text-sm px-3 py-1 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors"
            >
              Auto-allocate
            </button>
            <button
              onClick={clearAllocations}
              className="text-sm px-3 py-1 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Invoice table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-600 uppercase">Invoice</th>
              <th className="text-center py-3 px-4 text-xs font-medium text-gray-600 uppercase">Date</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-600 uppercase">Total</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-600 uppercase">Previously Paid</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-600 uppercase">Original Due</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-600 uppercase">Remaining</th>
              <th className="text-center py-3 px-4 text-xs font-medium text-gray-600 uppercase">Status</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-600 uppercase">Allocate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {outstandingInvoices.map((invoice: Invoice) => {
              const allocated = allocations[invoice.invoice_no] || 0;
              const remainingDue = invoice.remaining_due !== undefined ? invoice.remaining_due : invoice.amount_due;
              const previouslyPaid = (invoice.total_amount || 0) - (invoice.amount_due || 0);
              const existingAllocations = invoice.existing_allocations || 0;
              const isFullyAllocated = allocated >= remainingDue;

              return (
                <tr key={invoice.invoice_no} className="hover:bg-gray-50">
                  <td className="py-4 px-4">
                    <p className="text-sm font-medium text-gray-900">{invoice.invoice_no}</p>
                  </td>
                  <td className="py-4 px-4 text-center">
                    <p className="text-sm text-gray-600">
                      {new Date(invoice.invoice_date).toLocaleDateString('en-IN')}
                    </p>
                  </td>
                  <td className="py-4 px-4 text-right">
                    <p className="text-sm text-gray-900">₹{(invoice.total_amount || 0).toFixed(2)}</p>
                  </td>
                  <td className="py-4 px-4 text-right">
                    <p className="text-sm text-gray-600">
                      ₹{(previouslyPaid + existingAllocations).toFixed(2)}
                      {existingAllocations > 0 && (
                        <span className="block text-xs text-blue-600">
                          (incl. ₹{existingAllocations.toFixed(2)} recent)
                        </span>
                      )}
                    </p>
                  </td>
                  <td className="py-4 px-4 text-right">
                    <p className="text-sm text-gray-600">
                      ₹{(invoice.amount_due || 0).toFixed(2)}
                    </p>
                  </td>
                  <td className="py-4 px-4 text-right">
                    <p className="text-sm font-medium text-red-600">
                      ₹{(remainingDue || 0).toFixed(2)}
                    </p>
                  </td>
                  <td className="py-4 px-4 text-center">
                    <StatusBadge
                      status={
                        isFullyAllocated ? 'paid' :
                          allocated > 0 ? 'partial' :
                            'unpaid'
                      }
                    />
                  </td>
                  <td className="py-4 px-4">
                    <input
                      type="number"
                      value={allocated || ''}
                      onChange={(e) => handleAllocationChange(invoice.invoice_no, e.target.value)}
                      placeholder="0.00"
                      className="w-24 px-2 py-1 text-sm text-right border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      min="0"
                      max={remainingDue || 0}
                      step="0.01"
                      disabled={remainingDue <= 0}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
          {totalAllocated > 0 && (
            <tfoot className="bg-gray-50 border-t-2 border-gray-200">
              <tr>
                <td colSpan={7} className="py-3 px-4 text-right text-sm font-medium text-gray-700">
                  Total Allocated:
                </td>
                <td className="py-3 px-4 text-right">
                  <p className="text-sm font-bold text-gray-900">
                    ₹{(totalAllocated || 0).toFixed(2)}
                  </p>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Card>
  );
};

export default InvoiceSelectorV2;