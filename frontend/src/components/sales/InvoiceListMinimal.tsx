import React, { useState } from 'react';
import { Search, Filter, ChevronRight } from 'lucide-react';

interface InvoiceListMinimalProps {
  open?: boolean;
  onClose?: () => void;
}

interface Invoice {
  id: string;
  invoiceNo: string;
  customerName: string;
  date: string;
  amount: number;
  status: 'Paid' | 'Pending' | 'Overdue';
}

const InvoiceListMinimal: React.FC<InvoiceListMinimalProps> = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'pending' | 'paid'>('all');

  const invoices: Invoice[] = [
    {
      id: '1',
      invoiceNo: 'INV-2025-001',
      customerName: 'Apollo Pharmacy',
      date: '6 Jan',
      amount: 45000,
      status: 'Pending',
    },
    {
      id: '2',
      invoiceNo: 'INV-2025-002',
      customerName: 'MedPlus Healthcare',
      date: '5 Jan',
      amount: 32000,
      status: 'Paid',
    },
    {
      id: '3',
      invoiceNo: 'INV-2024-089',
      customerName: 'City Hospital',
      date: '28 Dec',
      amount: 67000,
      status: 'Overdue',
    },
  ];

  const filteredInvoices = invoices.filter(invoice => {
    const matchesSearch = invoice.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         invoice.invoiceNo.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = selectedStatus === 'all' || 
                         (selectedStatus === 'pending' && (invoice.status === 'Pending' || invoice.status === 'Overdue')) ||
                         (selectedStatus === 'paid' && invoice.status === 'Paid');
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Paid': return 'text-green-600';
      case 'Pending': return 'text-amber-600';
      case 'Overdue': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-gray-100">
        <div className="px-6 py-4">
          <h1 className="text-lg font-medium text-gray-900">Invoices</h1>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-6">
        {/* Search and Filter */}
        <div className="mb-6">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search invoices..."
              className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          {/* Simple status filter */}
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedStatus('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedStatus === 'all' 
                  ? 'bg-gray-900 text-white' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setSelectedStatus('pending')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedStatus === 'pending' 
                  ? 'bg-gray-900 text-white' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Pending
            </button>
            <button
              onClick={() => setSelectedStatus('paid')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedStatus === 'paid' 
                  ? 'bg-gray-900 text-white' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Paid
            </button>
          </div>
        </div>

        {/* Invoice List */}
        <div className="space-y-1">
          {filteredInvoices.map((invoice) => (
            <button
              key={invoice.id}
              className="w-full p-4 flex items-center justify-between hover:bg-gray-50 rounded-lg transition-colors"
              onClick={() => console.log('View invoice:', invoice.id)}
            >
              <div className="flex-1 text-left">
                <div className="flex items-center gap-3 mb-1">
                  <span className="font-medium text-gray-900">{invoice.invoiceNo}</span>
                  <span className={`text-sm font-medium ${getStatusColor(invoice.status)}`}>
                    {invoice.status}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-500">
                  <span>{invoice.customerName}</span>
                  <span>•</span>
                  <span>{invoice.date}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-medium text-gray-900">₹{invoice.amount.toLocaleString()}</span>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </div>
            </button>
          ))}
        </div>

        {/* Empty state */}
        {filteredInvoices.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">No invoices found</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default InvoiceListMinimal;