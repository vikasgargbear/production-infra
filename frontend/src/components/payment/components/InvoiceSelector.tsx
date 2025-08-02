import React, { useState } from 'react';
import { FileText, DollarSign, Check, AlertCircle } from 'lucide-react';
import { usePayment } from '../../../contexts/PaymentContext';
import { 
  Card, 
  Badge,
  StatusBadge
} from '../../global';
import { 
  SectionHeader,
  FormInput,
  EmptyState
} from '../../common';

interface Invoice {
  invoice_no: string;
  invoice_date: string;
  total_amount: number;
  amount_due: number;
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

  // Calculate totals
  const totalOutstanding = outstandingInvoices.reduce((sum: number, inv: Invoice) => sum + inv.amount_due, 0);
  const totalAllocated = Object.values(allocations).reduce((sum: number, amount: number) => sum + (parseFloat(amount.toString()) || 0), 0);
  const remainingPayment = parseFloat(payment.amount || '0') - totalAllocated;

  // Handle allocation change
  const handleAllocationChange = (invoiceId: string, value: string): void => {
    const amount = parseFloat(value) || 0;
    const invoice = outstandingInvoices.find((inv: Invoice) => inv.invoice_no === invoiceId);
    
    if (invoice && amount > invoice.amount_due) {
      return; // Don't allow allocation more than due amount
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
      
      const allocationAmount = Math.min(remainingAmount, invoice.amount_due);
      newAllocations[invoice.invoice_no] = allocationAmount;
      remainingAmount -= allocationAmount;
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
        <EmptyState
          iconType="fileText"
          title="No outstanding invoices"
          description="This customer has no pending invoices"
        />
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
            <Badge variant="danger" dot>
              Total Outstanding: ₹{totalOutstanding.toFixed(2)}
            </Badge>
            {payment.amount && (
              <Badge variant="primary">
                Payment: ₹{parseFloat(payment.amount).toFixed(2)}
              </Badge>
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
                ₹{remainingPayment.toFixed(2)} unallocated
              </span>
            ) : remainingPayment < 0 ? (
              <span className="text-red-600">
                <AlertCircle className="w-4 h-4 inline mr-1" />
                Over-allocated by ₹{Math.abs(remainingPayment).toFixed(2)}
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
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-600 uppercase">Paid</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-600 uppercase">Due</th>
              <th className="text-center py-3 px-4 text-xs font-medium text-gray-600 uppercase">Status</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-600 uppercase">Allocate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {outstandingInvoices.map((invoice: Invoice) => {
              const allocated = allocations[invoice.invoice_no] || 0;
              const isFullyAllocated = allocated >= invoice.amount_due;
              
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
                    <p className="text-sm text-gray-900">₹{invoice.total_amount.toFixed(2)}</p>
                  </td>
                  <td className="py-4 px-4 text-right">
                    <p className="text-sm text-gray-600">
                      ₹{(invoice.total_amount - invoice.amount_due).toFixed(2)}
                    </p>
                  </td>
                  <td className="py-4 px-4 text-right">
                    <p className="text-sm font-medium text-red-600">
                      ₹{invoice.amount_due.toFixed(2)}
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
                    <FormInput
                      type="number"
                      value={allocated || ''}
                      onChange={(e) => handleAllocationChange(invoice.invoice_no, e.target.value)}
                      placeholder="0.00"
                      size="sm"
                      className="w-24"
                      inputClassName="text-right"
                      min="0"
                      max={invoice.amount_due}
                      step="0.01"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
          {totalAllocated > 0 && (
            <tfoot className="bg-gray-50 border-t-2 border-gray-200">
              <tr>
                <td colSpan={6} className="py-3 px-4 text-right text-sm font-medium text-gray-700">
                  Total Allocated:
                </td>
                <td className="py-3 px-4 text-right">
                  <p className="text-sm font-bold text-gray-900">
                    ₹{totalAllocated.toFixed(2)}
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