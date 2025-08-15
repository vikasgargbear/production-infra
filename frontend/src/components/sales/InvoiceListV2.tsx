import React, { useState, useEffect } from 'react';
import {
  Search, Filter, Download, Eye, Edit, Printer, Send,
  Plus, Calendar, IndianRupee, FileText, MoreHorizontal,
  ChevronDown, X, Check, Clock, AlertCircle, RefreshCw
} from 'lucide-react';
import { Button, StatusBadge, DataTable, DatePicker, ModuleHeader } from '../global';

interface InvoiceListProps {
  open?: boolean;
  onClose?: () => void;
}

interface Invoice {
  id: string;
  invoiceNo: string;
  customerName: string;
  date: string;
  dueDate: string;
  amount: number;
  status: 'Draft' | 'Sent' | 'Paid' | 'Overdue' | 'Cancelled';
  paymentStatus: 'Pending' | 'Partial' | 'Paid';
  items: number;
}

// Enhanced filter component
const FilterPanel: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onApply: (filters: any) => void;
}> = ({ isOpen, onClose, onApply }) => {
  const [filters, setFilters] = useState({
    status: '',
    paymentStatus: '',
    dateRange: { from: '', to: '' },
    minAmount: '',
    maxAmount: '',
    customer: '',
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-start justify-end">
      <div className="bg-white w-96 h-full shadow-xl overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Filter Invoices</h3>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
        
        <div className="p-6 space-y-6">
          {/* Status Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
            <select 
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filters.status}
              onChange={(e) => setFilters({...filters, status: e.target.value})}
            >
              <option value="">All Status</option>
              <option value="Draft">Draft</option>
              <option value="Sent">Sent</option>
              <option value="Paid">Paid</option>
              <option value="Overdue">Overdue</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>

          {/* Payment Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Payment Status</label>
            <select 
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filters.paymentStatus}
              onChange={(e) => setFilters({...filters, paymentStatus: e.target.value})}
            >
              <option value="">All Payments</option>
              <option value="Pending">Pending</option>
              <option value="Partial">Partial</option>
              <option value="Paid">Paid</option>
            </select>
          </div>

          {/* Date Range */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Date Range</label>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="date"
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="From"
                value={filters.dateRange.from}
                onChange={(e) => setFilters({...filters, dateRange: {...filters.dateRange, from: e.target.value}})}
              />
              <input
                type="date"
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="To"
                value={filters.dateRange.to}
                onChange={(e) => setFilters({...filters, dateRange: {...filters.dateRange, to: e.target.value}})}
              />
            </div>
          </div>

          {/* Amount Range */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Amount Range</label>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Min Amount"
                value={filters.minAmount}
                onChange={(e) => setFilters({...filters, minAmount: e.target.value})}
              />
              <input
                type="number"
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Max Amount"
                value={filters.maxAmount}
                onChange={(e) => setFilters({...filters, maxAmount: e.target.value})}
              />
            </div>
          </div>

          {/* Customer Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Customer</label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Search customer..."
              value={filters.customer}
              onChange={(e) => setFilters({...filters, customer: e.target.value})}
            />
          </div>
        </div>

        <div className="p-6 border-t border-gray-200">
          <div className="flex space-x-3">
            <Button variant="outline" onClick={() => setFilters({
              status: '', paymentStatus: '', dateRange: { from: '', to: '' },
              minAmount: '', maxAmount: '', customer: ''
            })}>
              Clear All
            </Button>
            <Button onClick={() => onApply(filters)} className="flex-1">
              Apply Filters
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Bulk action bar
const BulkActionBar: React.FC<{
  selectedCount: number;
  onMarkPaid: () => void;
  onSendReminder: () => void;
  onExport: () => void;
  onClear: () => void;
}> = ({ selectedCount, onMarkPaid, onSendReminder, onExport, onClear }) => {
  if (selectedCount === 0) return null;

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <span className="text-sm font-medium text-blue-900">
            {selectedCount} invoice{selectedCount > 1 ? 's' : ''} selected
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={onMarkPaid}>
            <Check className="w-4 h-4 mr-2" />
            Mark as Paid
          </Button>
          <Button variant="outline" size="sm" onClick={onSendReminder}>
            <Send className="w-4 h-4 mr-2" />
            Send Reminder
          </Button>
          <Button variant="outline" size="sm" onClick={onExport}>
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          <Button variant="ghost" size="sm" onClick={onClear}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

const InvoiceListV2: React.FC<InvoiceListProps> = ({ onClose }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Mock data - replace with API calls
  const [invoices] = useState<Invoice[]>([
    {
      id: '1',
      invoiceNo: 'INV-2025-001',
      customerName: 'Apollo Pharmacy',
      date: '2025-01-06',
      dueDate: '2025-02-05',
      amount: 45000,
      status: 'Sent',
      paymentStatus: 'Pending',
      items: 12,
    },
    {
      id: '2',
      invoiceNo: 'INV-2025-002',
      customerName: 'MedPlus Healthcare',
      date: '2025-01-05',
      dueDate: '2025-02-04',
      amount: 32000,
      status: 'Paid',
      paymentStatus: 'Paid',
      items: 8,
    },
    {
      id: '3',
      invoiceNo: 'INV-2025-003',
      customerName: 'City Hospital',
      date: '2024-12-28',
      dueDate: '2025-01-27',
      amount: 67000,
      status: 'Overdue',
      paymentStatus: 'Pending',
      items: 15,
    },
    // Add more mock data...
  ]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getStatusVariant = (status: string): 'solid' | 'light' | 'outline' => {
    return 'light'; // Using light variant for all statuses
  };

  const getPaymentStatusVariant = (status: string): 'solid' | 'light' | 'outline' => {
    return 'light'; // Using light variant for all statuses
  };

  const columns = [
    {
      key: 'select',
      header: '',
      render: (value: any, invoice: Invoice) => (
        <input
          type="checkbox"
          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          checked={selectedInvoices.includes(invoice.id)}
          onChange={(e) => {
            if (e.target.checked) {
              setSelectedInvoices([...selectedInvoices, invoice.id]);
            } else {
              setSelectedInvoices(selectedInvoices.filter(id => id !== invoice.id));
            }
          }}
        />
      ),
      width: '50px',
    },
    {
      key: 'invoiceNo',
      header: 'Invoice No.',
      render: (value: string, invoice: Invoice) => (
        <div>
          <p className="font-medium text-gray-900">{value}</p>
          <p className="text-sm text-gray-500">{invoice.items} items</p>
        </div>
      ),
    },
    {
      key: 'customerName',
      header: 'Customer',
      render: (value: string) => (
        <div className="font-medium text-gray-900">{value}</div>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      render: (value: string, invoice: Invoice) => (
        <div>
          <p className="text-sm text-gray-900">{new Date(value).toLocaleDateString('en-IN')}</p>
          <p className="text-xs text-gray-500">Due: {new Date(invoice.dueDate).toLocaleDateString('en-IN')}</p>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (value: number) => (
        <div className="font-medium text-gray-900">{formatCurrency(value)}</div>
      ),
      align: 'right' as const,
    },
    {
      key: 'status',
      header: 'Status',
      render: (value: string) => (
        <StatusBadge status={value} variant={getStatusVariant(value)} />
      ),
    },
    {
      key: 'paymentStatus',
      header: 'Payment',
      render: (value: string) => (
        <StatusBadge status={value} variant={getPaymentStatusVariant(value)} />
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (value: any, invoice: Invoice) => (
        <div className="flex items-center space-x-2">
          <Button variant="ghost" size="sm">
            <Eye className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm">
            <Edit className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm">
            <Printer className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm">
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </div>
      ),
      width: '150px',
    },
  ];

  return (
    <div className="h-full bg-blue-50">
      <div className="h-full flex flex-col">
        
        {/* Header - Using Global ModuleHeader */}
        <ModuleHeader
          title="Invoice History"
          documentNumber=""
          status=""
          icon={FileText}
          iconColor="text-blue-600"
          onClose={onClose}
          historyType="invoice"
          onSaveDraft={() => {}}
          additionalActions={[
            {
              label: "Export All",
              onClick: () => console.log('Export all'),
              variant: "default"
            },
            {
              label: "New Invoice",
              onClick: () => console.log('New invoice'),
              variant: "primary"
            }
          ] as any}
        />

        {/* Keyboard Shortcuts Help */}
        <div className="bg-blue-50 px-4 py-2 text-xs text-blue-700 border-b border-blue-200">
          Keyboard shortcuts: <strong>Ctrl+F</strong> - Search | <strong>Ctrl+N</strong> - New Invoice | <strong>Esc</strong> - Close
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-6 py-6">
            
            {/* Search and Filter Bar */}
            <div className="bg-white rounded-lg shadow-sm border border-blue-200 p-4 mb-6">
              <div className="flex items-center space-x-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search invoices..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={() => setShowFilters(true)}
                  icon={<Filter className="w-4 h-4" />}
                  iconPosition="left"
                >
                  Filters
                </Button>
                <Button variant="outline" size="sm">
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Bulk Actions */}
            <BulkActionBar
              selectedCount={selectedInvoices.length}
              onMarkPaid={() => console.log('Mark as paid')}
              onSendReminder={() => console.log('Send reminder')}
              onExport={() => console.log('Export selected')}
              onClear={() => setSelectedInvoices([])}
            />

            {/* Invoice Table */}
            <div className="bg-white rounded-lg shadow-sm border border-blue-200">
              <DataTable
                data={invoices}
                columns={columns}
                keyField="id"
                searchable={false}
                paginated={true}
                pageSize={25}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Filter Panel */}
      <FilterPanel
        isOpen={showFilters}
        onClose={() => setShowFilters(false)}
        onApply={(filters) => {
          console.log('Apply filters:', filters);
          setShowFilters(false);
        }}
      />
    </div>
  );
};

export default InvoiceListV2;