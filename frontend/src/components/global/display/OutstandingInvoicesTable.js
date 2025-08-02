import React, { useState } from 'react';
import { FileText, Calendar, DollarSign, Edit3, Check, X } from 'lucide-react';

const OutstandingInvoicesTable = ({ 
  invoices = [], 
  selectedInvoices = [],
  onInvoiceSelect,
  onAmountChange,
  paymentMode = 'fifo',
  totalPayment = 0,
  readOnly = false,
  showSummary = true
}) => {
  const [editingAmount, setEditingAmount] = useState(null);
  const [tempAmount, setTempAmount] = useState('');

  const handleAmountEdit = (invoiceId, currentAmount) => {
    setEditingAmount(invoiceId);
    setTempAmount(currentAmount.toString());
  };

  const handleAmountSave = (invoiceId) => {
    const amount = parseFloat(tempAmount) || 0;
    onAmountChange(invoiceId, amount);
    setEditingAmount(null);
    setTempAmount('');
  };

  const handleAmountCancel = () => {
    setEditingAmount(null);
    setTempAmount('');
  };

  const getStatusColor = (daysOverdue) => {
    if (daysOverdue > 60) return 'text-red-600 bg-red-50';
    if (daysOverdue > 30) return 'text-orange-600 bg-orange-50';
    if (daysOverdue > 0) return 'text-yellow-600 bg-yellow-50';
    return 'text-green-600 bg-green-50';
  };

  const getStatusText = (daysOverdue) => {
    if (daysOverdue > 0) return `${daysOverdue}d overdue`;
    if (daysOverdue < 0) return `Due in ${Math.abs(daysOverdue)}d`;
    return 'Due today';
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const getTotalSelectedAmount = () => {
    return selectedInvoices.reduce((sum, invoice) => sum + (invoice.payingAmount || 0), 0);
  };

  const getRemainingAmount = () => {
    return totalPayment - getTotalSelectedAmount();
  };

  if (!invoices || invoices.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
        <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
        <h3 className="text-lg font-medium text-gray-900 mb-1">No Outstanding Invoices</h3>
        <p className="text-gray-500">This party has no pending invoices for payment.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      {showSummary && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-sm text-blue-600 font-medium">Total Outstanding</p>
              <p className="text-xl font-bold text-blue-900">
                ₹{invoices.reduce((sum, inv) => sum + inv.pendingAmount, 0).toLocaleString()}
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-green-600 font-medium">Amount Allocated</p>
              <p className="text-xl font-bold text-green-900">
                ₹{getTotalSelectedAmount().toLocaleString()}
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600 font-medium">Remaining to Allocate</p>
              <p className={`text-xl font-bold ${getRemainingAmount() >= 0 ? 'text-gray-900' : 'text-red-900'}`}>
                ₹{getRemainingAmount().toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Payment Mode Info */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Outstanding Invoices</h3>
        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-500">Payment Mode:</span>
          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
            paymentMode === 'fifo' 
              ? 'bg-blue-100 text-blue-700' 
              : 'bg-purple-100 text-purple-700'
          }`}>
            {paymentMode === 'fifo' ? 'FIFO (Auto)' : 'Manual'}
          </span>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Invoice Details
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Dates
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Paying Amount
                </th>
                {!readOnly && (
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {invoices.map((invoice) => {
                const selectedInvoice = selectedInvoices.find(si => si.id === invoice.id);
                const isSelected = !!selectedInvoice;
                const payingAmount = selectedInvoice?.payingAmount || 0;
                
                return (
                  <tr 
                    key={invoice.id} 
                    className={`hover:bg-gray-50 transition-colors ${
                      isSelected ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                    }`}
                  >
                    <td className="px-4 py-4">
                      <div className="flex items-center space-x-3">
                        {!readOnly && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => onInvoiceSelect(invoice, e.target.checked)}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                        )}
                        <div>
                          <div className="flex items-center space-x-2">
                            <FileText className="w-4 h-4 text-gray-400" />
                            <span className="text-sm font-medium text-gray-900">
                              {invoice.invoiceNo}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            Type: {invoice.type || 'Sales Invoice'}
                          </p>
                        </div>
                      </div>
                    </td>
                    
                    <td className="px-4 py-4">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-1 text-xs text-gray-600">
                          <Calendar className="w-3 h-3" />
                          <span>Invoice: {formatDate(invoice.invoiceDate)}</span>
                        </div>
                        <div className="flex items-center space-x-1 text-xs text-gray-600">
                          <Calendar className="w-3 h-3" />
                          <span>Due: {formatDate(invoice.dueDate)}</span>
                        </div>
                      </div>
                    </td>
                    
                    <td className="px-4 py-4">
                      <div className="space-y-1">
                        <div className="text-sm font-medium text-gray-900">
                          ₹{invoice.totalAmount.toLocaleString()}
                        </div>
                        <div className="text-sm text-red-600 font-medium">
                          ₹{invoice.pendingAmount.toLocaleString()}
                        </div>
                        <div className="text-xs text-gray-500">
                          Paid: ₹{(invoice.totalAmount - invoice.pendingAmount).toLocaleString()}
                        </div>
                      </div>
                    </td>
                    
                    <td className="px-4 py-4">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        getStatusColor(invoice.daysOverdue)
                      }`}>
                        {getStatusText(invoice.daysOverdue)}
                      </span>
                    </td>
                    
                    <td className="px-4 py-4">
                      {editingAmount === invoice.id ? (
                        <div className="flex items-center space-x-2">
                          <input
                            type="number"
                            value={tempAmount}
                            onChange={(e) => setTempAmount(e.target.value)}
                            className="w-24 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            min="0"
                            max={invoice.pendingAmount}
                            step="0.01"
                            autoFocus
                          />
                          <button
                            onClick={() => handleAmountSave(invoice.id)}
                            className="p-1 text-green-600 hover:bg-green-100 rounded"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={handleAmountCancel}
                            className="p-1 text-red-600 hover:bg-red-100 rounded"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-2">
                          <span className={`text-sm font-medium ${
                            payingAmount > 0 ? 'text-green-600' : 'text-gray-400'
                          }`}>
                            {payingAmount > 0 ? `₹${payingAmount.toLocaleString()}` : '-'}
                          </span>
                          {isSelected && payingAmount < invoice.pendingAmount && (
                            <span className="text-xs text-gray-500">
                              (Partial)
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    
                    {!readOnly && (
                      <td className="px-4 py-4">
                        {isSelected && (
                          <button
                            onClick={() => handleAmountEdit(invoice.id, payingAmount)}
                            className="p-1 text-blue-600 hover:bg-blue-100 rounded transition-colors"
                            title="Edit amount"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default OutstandingInvoicesTable;