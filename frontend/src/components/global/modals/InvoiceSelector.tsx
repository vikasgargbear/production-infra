import React, { useState, useEffect } from 'react';
import {
  Search, FileText, X, Check, ChevronDown, Calendar, Filter,
  Eye, Printer, MessageCircle, RefreshCw
} from 'lucide-react';
import Button from '../ui/Button';
import { StatusBadge, DataTable } from '../ui';
import InvoiceApiService from '../../../services/invoiceApiService';
// Debug logger removed for production

interface InvoiceSelectorProps {
  customerId?: string;
  invoiceType?: 'SALES' | 'PURCHASE';
  onSelect: (invoice: any) => void;
  onClose: () => void;
  filters?: {
    status?: string[];
    returnable?: boolean;
  };
  title?: string;
}

interface Invoice {
  id: string;
  invoice_id?: string;
  invoice_number: string;
  customer_name: string;
  invoice_date: string;
  final_amount: number;
  invoice_status?: string;
  payment_status: string;
  order_number?: string;
  order_date?: string;
}

const InvoiceSelector: React.FC<InvoiceSelectorProps> = ({
  customerId,
  invoiceType = 'SALES',
  onSelect,
  onClose,
  filters = {},
  title = 'Select Invoice'
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [filterStatus, setFilterStatus] = useState('all');
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    per_page: 10,
    total_pages: 0
  });

  // Fetch invoices from backend
  const fetchInvoices = async (page = 1, searchParams: any = {}) => {
    setLoading(true);
    setError(null);
    
    try {
      // Prepare search parameters
      const params: any = {
        limit: pagination.per_page,
        offset: (page - 1) * pagination.per_page,
        customer_id: customerId, // Filter by customer if provided
        ...searchParams
      };
      
      // Add search query if provided
      if (searchParams.search && searchParams.search.trim()) {
        params.search = searchParams.search.trim();
      }

      // Add filters
      if (filters.status?.length) {
        params.status = filters.status;
      }
      
      if (filters.returnable) {
        params.returnable = true;
      }
      
      // debugLogger.api('Fetching invoices with params:', params);
      
      const response = await InvoiceApiService.getInvoices(params);
      
      if (response.success) {
        // Transform backend data to match our interface
        const transformedInvoices = response.data.invoices.map((invoice: any) => ({
          id: invoice.invoice_id?.toString() || invoice.invoice_number,
          invoice_id: invoice.invoice_id,
          invoice_number: invoice.invoice_number,
          customer_name: invoice.customer_name,
          invoice_date: invoice.invoice_date,
          final_amount: invoice.final_amount,
          invoice_status: invoice.invoice_status,
          payment_status: invoice.payment_status,
          order_number: invoice.order_number,
          order_date: invoice.order_date
        }));

        // debugLogger.api('Transformed invoices:', transformedInvoices);
        setInvoices(transformedInvoices);
        setPagination({
          total: response.data.total || 0,
          page: page,
          per_page: pagination.per_page,
          total_pages: Math.ceil((response.data.total || 0) / pagination.per_page)
        });
      } else {
        setError(response.error?.message || 'Failed to fetch invoices');
      }
    } catch (error) {
      setError('Failed to fetch invoices. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Load invoices on component mount
  useEffect(() => {
    fetchInvoices();
  }, [customerId]); // Re-fetch when customer changes

  // Handle search with debouncing
  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    
    const timeoutId = setTimeout(() => {
      const searchParams = {
        search: query,
        payment_status: filterStatus === 'all' ? undefined : filterStatus
      };
      fetchInvoices(1, searchParams);
    }, 500);
    
    return () => clearTimeout(timeoutId);
  };

  // Handle status filter changes
  const handleStatusChange = (status: string) => {
    setFilterStatus(status);
    const searchParams = {
      search: searchQuery,
      payment_status: status === 'all' ? undefined : status
    };
    fetchInvoices(1, searchParams);
  };

  // Handle refresh
  const handleRefresh = () => {
    fetchInvoices(pagination.page);
  };

  // Handle invoice selection
  const handleInvoiceSelect = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
  };

  // Handle confirm selection
  const handleConfirmSelection = () => {
    if (selectedInvoice) {
      onSelect(selectedInvoice);
    }
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Format date
  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-IN');
  };

  // Get status badge color
  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'paid': return 'success';
      case 'partial': return 'warning';
      case 'pending': return 'info';
      case 'overdue': return 'danger';
      default: return 'secondary';
    }
  };

  // Define columns for DataTable
  const columns = [
    {
      key: 'select',
      header: '',
      render: (value: any, invoice: Invoice) => (
        <input
          type="radio"
          name="selectedInvoice"
          checked={selectedInvoice?.id === invoice.id}
          onChange={() => handleInvoiceSelect(invoice)}
          className="w-4 h-4 text-blue-600"
        />
      ),
      width: '50px',
    },
    {
      key: 'invoice_date',
      header: 'Date',
      sortable: true,
      render: (value: string) => formatDate(value),
    },
    {
      key: 'invoice_number',
      header: 'Invoice #',
      sortable: true,
      render: (value: string) => (
        <div className="font-medium text-blue-600">{value}</div>
      ),
    },
    {
      key: 'customer_name',
      header: 'Customer',
      sortable: true,
    },
    {
      key: 'final_amount',
      header: 'Amount',
      align: 'right' as const,
      sortable: true,
      render: (value: number) => formatCurrency(value),
    },
    {
      key: 'payment_status',
      header: 'Status',
      align: 'center' as const,
      render: (value: string) => (
        <StatusBadge
          status={getStatusColor(value)}
          label={value?.charAt(0).toUpperCase() + value?.slice(1) || 'Unknown'}
        />
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'center' as const,
      sortable: false,
      render: (_, invoice: Invoice) => (
        <div className="flex items-center space-x-1">
          <button
            onClick={() => console.log('View invoice:', invoice.id)}
            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="View Details"
          >
            <Eye className="w-4 h-4" />
          </button>
        </div>
      ),
      width: '80px',
    }
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center space-x-3">
            <FileText className="w-6 h-6 text-blue-600" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
              {customerId && (
                <p className="text-sm text-gray-500">Showing invoices for selected customer</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters */}
        <div className="p-6 bg-gray-50 border-b">
          <div className="flex items-center space-x-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by invoice number, customer, or product..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Status Filter */}
            <div className="relative">
              <select
                value={filterStatus}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="appearance-none pl-3 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                <option value="all">All Status</option>
                <option value="paid">Paid</option>
                <option value="partial">Partial</option>
                <option value="pending">Pending</option>
                <option value="overdue">Overdue</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>

            {/* Refresh Button */}
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 max-h-96 overflow-y-auto">
          {error ? (
            <div className="text-center py-8">
              <div className="text-red-600 mb-4">
                <FileText className="w-12 h-12 mx-auto" />
              </div>
              <p className="text-red-600 mb-4">{error}</p>
              <button
                onClick={handleRefresh}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Retry
              </button>
            </div>
          ) : (
            <DataTable
              data={invoices}
              columns={columns}
              keyField="id"
              loading={loading}
              emptyMessage="No invoices found"
              emptyIcon={<FileText className="w-12 h-12 text-gray-400" />}
              hoverable={true}
              striped={true}
              paginated={false} // We'll handle pagination separately if needed
              searchable={false}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t bg-gray-50">
          <div className="text-sm text-gray-600">
            {selectedInvoice ? (
              <span>Selected: {selectedInvoice.invoice_number} - {formatCurrency(selectedInvoice.final_amount)}</span>
            ) : (
              <span>Please select an invoice</span>
            )}
          </div>
          <div className="flex items-center space-x-3">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmSelection}
              disabled={!selectedInvoice}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Check className="w-4 h-4 mr-2" />
              Select Invoice
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoiceSelector;