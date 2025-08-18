import React, { useState, useEffect } from 'react';
import {
  Download, Eye, Edit, Printer, Send,
  FileText, MoreHorizontal,
  X, Check, AlertCircle, RefreshCw
} from 'lucide-react';
import { Button, StatusBadge, DataTable, InlineFilterPanel } from '../global';
import InvoiceApiService from '../../services/invoiceApiService';
import debugLogger from '../../utils/debugLogger';

interface InvoiceListProps {
  onClose?: () => void;
}

interface Invoice {
  id: string;
  invoice_id?: string;
  invoice_number: string;
  invoiceNo?: string; // For backward compatibility
  customer_name: string;
  customerName?: string; // For backward compatibility
  invoice_date: string;
  date?: string; // For backward compatibility
  dueDate?: string;
  final_amount: number;
  amount?: number; // For backward compatibility
  invoice_status?: string;
  status?: string; // For backward compatibility
  payment_status: string;
  paymentStatus?: string; // For backward compatibility
  items?: number;
  order_number?: string;
  order_date?: string;
}

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
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    per_page: 25,
    total_pages: 0
  });

  // State for real data
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  // Filter configuration for the global component
  const filterOptions = [
    {
      key: 'status',
      label: 'Status',
      type: 'select' as const,
      options: [
        { value: 'Draft', label: 'Draft' },
        { value: 'Sent', label: 'Sent' },
        { value: 'Paid', label: 'Paid' },
        { value: 'Overdue', label: 'Overdue' },
        { value: 'Cancelled', label: 'Cancelled' }
      ]
    },
    {
      key: 'payment_status',
      label: 'Payment',
      type: 'select' as const,
      options: [
        { value: 'Pending', label: 'Pending' },
        { value: 'Partial', label: 'Partial' },
        { value: 'Paid', label: 'Paid' }
      ]
    },
    {
      key: 'dateFrom',
      label: 'From Date',
      type: 'date' as const
    },
    {
      key: 'dateTo',
      label: 'To Date',
      type: 'date' as const
    }
  ];

  // Fetch invoices from backend
  const fetchInvoices = async (page = 1, filters: any = {}) => {
    setLoading(true);
    setError(null);
    
    try {
      // Prepare search parameters
      const searchParams: any = {
        limit: pagination.per_page,
        offset: (page - 1) * pagination.per_page,
        ...filters
      };
      
      // If there's a search query, add it to the filters
      if (filters.search && filters.search.trim()) {
        searchParams.search = filters.search.trim();
      }
      
      debugLogger.api('Fetching invoices with params:', searchParams);
      
      const response = await InvoiceApiService.getInvoices(searchParams);
      
      if (response.success) {
        // Transform backend data to match our interface
        const transformedInvoices = response.data.invoices.map((invoice: any) => {
          // Log raw backend data for debugging
          debugLogger.api('Raw invoice from backend:', {
            invoice_id: invoice.invoice_id,
            invoice_number: invoice.invoice_number,
            customer_name: invoice.customer_name,
            invoice_date: invoice.invoice_date,
            final_amount: invoice.final_amount,
            invoice_status: invoice.invoice_status,
            payment_status: invoice.payment_status,
            order_number: invoice.order_number,
            order_date: invoice.order_date
          });
          
          return {
            id: invoice.invoice_id?.toString() || invoice.invoice_number,
            invoice_id: invoice.invoice_id,
            invoice_number: invoice.invoice_number,
            invoiceNo: invoice.invoice_number, // For backward compatibility
            customer_name: invoice.customer_name,
            customerName: invoice.customer_name, // For backward compatibility
            invoice_date: invoice.invoice_date,
            date: invoice.invoice_date, // For backward compatibility
            final_amount: invoice.final_amount,
            amount: invoice.final_amount, // For backward compatibility
            invoice_status: invoice.invoice_status,
            status: invoice.invoice_status, // For backward compatibility
            payment_status: invoice.payment_status,
            paymentStatus: invoice.payment_status, // For backward compatibility
            order_number: invoice.order_number,
            order_date: invoice.order_date,
            items: 0 // Will be updated when we fetch invoice details
          };
        });

        debugLogger.api('Transformed invoices:', transformedInvoices);
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
      console.error('Error fetching invoices:', error);
      setError('Failed to fetch invoices. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Load invoices on component mount
  useEffect(() => {
    fetchInvoices();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh invoices
  const handleRefresh = () => {
    fetchInvoices(pagination.page);
  };

  // Handle filter changes with auto-search
  const handleFilterChange = (filters: any) => {
    debugLogger.debug('Filters changed:', filters);
    // Reset to first page when filters change
    fetchInvoices(1, { ...filters, search: searchQuery });
  };

  // Handle search changes with auto-search
  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    // Auto-search after a short delay to avoid too many API calls
    const timeoutId = setTimeout(() => {
      fetchInvoices(1, { search: query });
    }, 300);
    
    return () => clearTimeout(timeoutId);
  };

  // Action handlers
  const handleViewInvoice = (invoice: Invoice) => {
    // TODO: Navigate to invoice view page or open modal
    alert(`Viewing invoice: ${invoice.invoice_number}`);
  };

  const handleEditInvoice = (invoice: Invoice) => {
    // TODO: Navigate to invoice edit page or open modal
    alert(`Editing invoice: ${invoice.invoice_number}`);
  };

  const handlePrintInvoice = (invoice: Invoice) => {
    // TODO: Open print dialog or generate PDF
    alert(`Printing invoice: ${invoice.invoice_number}`);
  };

  const handleMoreOptions = (invoice: Invoice) => {
    // TODO: Show dropdown menu with more options
    alert(`More options for invoice: ${invoice.invoice_number}`);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (value: string) => {
    if (!value) return 'N/A';
    return new Date(value).toLocaleDateString('en-IN');
  };

  // Helper function to get proper status text
  const getStatusText = (status: string | undefined) => {
    if (!status) return 'Unknown';
    
    debugLogger.debug('Raw status from backend:', status, 'Type:', typeof status);
    
    // Map backend statuses to display text - handle various formats
    const statusMap: Record<string, string> = {
      // Common lowercase variations
      'draft': 'Draft',
      'sent': 'Sent',
      'paid': 'Paid',
      'overdue': 'Overdue',
      'cancelled': 'Cancelled',
      'canceled': 'Cancelled', // Handle US spelling
      'pending': 'Pending',
      'partial': 'Partial',
      
      // Common uppercase variations
      'DRAFT': 'Draft',
      'SENT': 'Sent',
      'PAID': 'Paid',
      'OVERDUE': 'Overdue',
      'CANCELLED': 'Cancelled',
      'CANCELED': 'Cancelled',
      'PENDING': 'Pending',
      'PARTIAL': 'Partial',
      
      // Handle null/undefined cases
      'null': 'Unknown',
      'undefined': 'Unknown',
      '': 'Unknown',
      
      // Handle numeric statuses if backend uses them
      '0': 'Draft',
      '1': 'Sent',
      '2': 'Paid',
      '3': 'Overdue',
      '4': 'Cancelled',
      '5': 'Pending',
      '6': 'Partial'
    };
    
    const normalizedStatus = status.toString().toLowerCase().trim();
    const mappedStatus = statusMap[normalizedStatus];
    
    if (mappedStatus) {
      return mappedStatus;
    }
    
    // If no mapping found, log it and return the original value
    debugLogger.warn('No status mapping found for:', status, 'Returning original value');
    return status;
  };

  const columns = [
    {
      key: 'invoice_number',
      header: 'Invoice #',
      render: (value: string, invoice: Invoice) => (
        <div className="font-medium text-gray-900">
          {invoice.invoice_number}
        </div>
      ),
      width: '120px',
    },
    {
      key: 'customer_name',
      header: 'Customer',
      render: (value: string, invoice: Invoice) => (
        <div className="text-gray-900">{invoice.customer_name}</div>
      ),
      width: '200px',
    },
    {
      key: 'invoice_date',
      header: 'Date',
      render: (value: string, invoice: Invoice) => (
        <div className="text-gray-600">{formatDate(invoice.invoice_date)}</div>
      ),
      width: '100px',
    },
    {
      key: 'final_amount',
      header: 'Amount',
      render: (value: number, invoice: Invoice) => (
        <div className="font-medium text-gray-900">
          {formatCurrency(invoice.final_amount)}
        </div>
      ),
      width: '120px',
    },
    {
      key: 'invoice_status',
      header: 'Status',
      render: (value: string, invoice: Invoice) => {
        const statusText = getStatusText(invoice.invoice_status);
        debugLogger.render('Status column render:', {
          original: invoice.invoice_status,
          processed: statusText,
          invoice_id: invoice.invoice_id
        });
        return (
          <StatusBadge 
            status={statusText} 
            variant="light"
          />
        );
      },
      width: '100px',
    },
    {
      key: 'payment_status',
      header: 'Payment',
      render: (value: string, invoice: Invoice) => {
        const paymentText = getStatusText(invoice.payment_status);
        debugLogger.render('Payment column render:', {
          original: invoice.payment_status,
          processed: paymentText,
          invoice_id: invoice.invoice_id
        });
        return (
          <StatusBadge 
            status={paymentText} 
            variant="light"
          />
        );
      },
      width: '100px',
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (value: any, invoice: Invoice) => (
        <div className="flex items-center space-x-2">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => handleViewInvoice(invoice)}
            title="View Invoice"
            className="h-10 w-10 p-0 hover:bg-blue-50"
          >
            <Eye className="w-5 h-5 text-blue-600" />
          </Button>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => handleEditInvoice(invoice)}
            title="Edit Invoice"
            className="h-10 w-10 p-0 hover:bg-green-50"
          >
            <Edit className="w-5 h-5 text-green-600" />
          </Button>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => handlePrintInvoice(invoice)}
            title="Print Invoice"
            className="h-10 w-10 p-0 hover:bg-purple-50"
          >
            <Printer className="w-5 h-5 text-purple-600" />
          </Button>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => handleMoreOptions(invoice)}
            title="More Options"
            className="h-10 w-10 p-0 hover:bg-gray-50"
          >
            <MoreHorizontal className="w-5 h-5 text-gray-600" />
          </Button>
        </div>
      ),
      width: '180px',
    },
  ];

  return (
    <div className="h-full bg-white">
      <div className="h-full flex flex-col">
        
        {/* Header - Simplified */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <FileText className="w-6 h-6 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Invoice History
                </h1>
                <p className="text-sm text-gray-600">
                  View and manage all your invoices
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                disabled={loading}
                title="Refresh data"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                variant="outline"
                onClick={() => {/* TODO: Export all invoices */}}
                icon={<Download className="w-4 h-4" />}
                iconPosition="left"
              >
                Export All
              </Button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-6 py-6">
            
            {/* Global Inline Filter Panel */}
            <div className="mb-6">
              <InlineFilterPanel
                filters={filterOptions}
                onFilterChange={handleFilterChange}
                searchQuery={searchQuery}
                onSearchChange={handleSearchChange}
                showFilters={showFilters}
                onToggleFilters={setShowFilters}
              />
            </div>

            {/* Error Display */}
            {error && (
              <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center">
                  <AlertCircle className="w-5 h-5 text-red-600 mr-3" />
                  <span className="text-red-800">{error}</span>
                </div>
              </div>
            )}

            {/* Bulk Actions */}
            <BulkActionBar
              selectedCount={selectedInvoices.length}
              onMarkPaid={() => {/* TODO: Mark as paid */}}
              onSendReminder={() => {/* TODO: Send reminder */}}
              onExport={() => {/* TODO: Export selected */}}
              onClear={() => setSelectedInvoices([])}
            />

            {/* Loading State */}
            {loading ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
                  <p className="text-gray-600">Loading invoices...</p>
                </div>
              </div>
            ) : invoices.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
                <div className="text-center">
                  <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p className="text-lg font-medium text-gray-500">
                    {searchQuery ? `No invoices found matching "${searchQuery}"` : 'No invoices found'}
                  </p>
                  <p className="text-sm text-gray-400">
                    {error ? 'There was an error loading invoices' : 
                     searchQuery ? 'Try adjusting your search terms or filters' : 'No invoices match your criteria'}
                  </p>
                  {searchQuery && (
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        setSearchQuery('');
                        fetchInvoices(1);
                      }} 
                      className="mt-4"
                    >
                      Clear Search
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              /* Invoice Table */
              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <DataTable
                  data={invoices}
                  columns={columns}
                  keyField="id"
                  searchable={false}
                  paginated={false}
                  pageSize={pagination.per_page}
                />
                
                {/* Pagination Controls */}
                {pagination.total_pages > 1 && (
                  <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200">
                    <div className="text-sm text-gray-600">
                      Showing {invoices.length} of {pagination.total} invoices
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fetchInvoices(pagination.page - 1)}
                        disabled={pagination.page <= 1 || loading}
                      >
                        Previous
                      </Button>
                      <span className="text-sm text-gray-600">
                        Page {pagination.page} of {pagination.total_pages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fetchInvoices(pagination.page + 1)}
                        disabled={pagination.page >= pagination.total_pages || loading}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoiceListV2;