import React, { useState, useEffect } from 'react';
import {
  Download, Eye, Edit, Printer, Send, MessageCircle,
  FileText, MoreHorizontal, Calendar, ChevronDown,
  X, Check, AlertCircle, RefreshCw, Search, Mail,
  Share2, Copy, MoreVertical, CheckCircle, Clock
} from 'lucide-react';
import { Button, StatusBadge, DataTable, InlineFilterPanel, Pagination } from '../global';
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
  const [selectedIds, setSelectedIds] = useState(new Set<string>());
  const [dateFilter, setDateFilter] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    per_page: 25,
    total_pages: 0
  });

  // Enhanced UX states
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [refreshSuccess, setRefreshSuccess] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

  // State for real data
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  // ESC key handler for better UX
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onClose) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Client-side filtering for display purposes only (server-side search is handled in fetchInvoices)
  const filteredInvoices = invoices; // Use server-filtered data directly

  // Multi-select functionality
  const isAllSelected = filteredInvoices.length > 0 && filteredInvoices.every(invoice => selectedIds.has(invoice.id));
  const selectedCount = Array.from(selectedIds).filter(id => filteredInvoices.some(f => f.id === id)).length;

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filteredInvoices.forEach(invoice => next.delete(invoice.id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filteredInvoices.forEach(invoice => next.add(invoice.id));
        return next;
      });
    }
  };

  const exportSelectedPDF = async () => {
    const itemsToExport = filteredInvoices.filter(invoice => selectedIds.has(invoice.id));
    if (itemsToExport.length === 0) return;

    // If single invoice, download the actual invoice PDF
    if (itemsToExport.length === 1) {
      await handleDownloadInvoice(itemsToExport[0]);
      return;
    }

    // For multiple invoices, export as CSV
    const headers = ['Invoice #', 'Date', 'Customer', 'Amount', 'Status'];
    const csvContent = [
      headers.join(','),
      ...itemsToExport.map(invoice => [
        invoice.invoice_number,
        formatDate(invoice.invoice_date),
        `"${invoice.customer_name || 'N/A'}"`,
        invoice.final_amount || 0,
        getStatusText(invoice.payment_status)
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `invoices-${new Date().getTime()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const printSelected = () => {
    const itemsToPrint = filteredInvoices.filter(invoice => selectedIds.has(invoice.id));
    const html = `<!DOCTYPE html><html><head><title>Print Invoices</title>
      <style>body{font-family:Arial,sans-serif;padding:24px;} table{width:100%;border-collapse:collapse;} th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left;} th{background:#f5f5f5;}</style>
      </head><body>
      <h2>Invoices Report</h2>
      <table><thead><tr><th>Invoice #</th><th>Date</th><th>Customer</th><th>Amount</th><th>Status</th></tr></thead>
      <tbody>
      ${itemsToPrint.map(invoice => `<tr><td>${invoice.invoice_number}</td><td>${formatDate(invoice.invoice_date)}</td><td>${invoice.customer_name || 'N/A'}</td><td>${formatCurrency(invoice.final_amount || 0)}</td><td>${getStatusText(invoice.payment_status)}</td></tr>`).join('')}
      </tbody></table>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  };

  const whatsappSelected = () => {
    const itemsToSend = filteredInvoices.filter(invoice => selectedIds.has(invoice.id));
    if (itemsToSend.length === 0) return;
    
    const message = encodeURIComponent(
      `Invoices Report:\n\n${itemsToSend.map(invoice => 
        `${invoice.invoice_number} - ${formatDate(invoice.invoice_date)} - ${invoice.customer_name} - ${formatCurrency(invoice.final_amount || 0)} (${getStatusText(invoice.payment_status)})`
      ).join('\n')}`
    );
    
    window.open(`https://wa.me/?text=${message}`, '_blank');
  };

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

  // Enhanced refresh with better UX
  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshSuccess(false);
    
    try {
      await fetchInvoices(pagination.page);
      
      // Show success feedback
      setRefreshSuccess(true);
      setTimeout(() => setRefreshSuccess(false), 2000);
    } catch (error) {
      debugLogger.error('Failed to refresh invoices:', error);
    } finally {
      setRefreshing(false);
    }
  };

  // Enhanced export with better UX
  const handleExportAll = async () => {
    setExporting(true);
    setExportSuccess(false);
    
    try {
      // Generate CSV data from invoices
      const csvData = generateCSVData(invoices);
      downloadCSV(csvData, `invoices-export-${new Date().toISOString().split('T')[0]}.csv`);
      
      // Show success feedback
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 3000);
    } catch (error) {
      debugLogger.error('Failed to export invoices:', error);
    } finally {
      setExporting(false);
    }
  };

  // Generate CSV data from invoices
  const generateCSVData = (data: Invoice[]) => {
    const headers = [
      'Invoice Number',
      'Customer Name', 
      'Date',
      'Due Date',
      'Amount',
      'Status',
      'Payment Status'
    ];
    
    const rows = data.map(invoice => [
      invoice.invoice_number || invoice.invoiceNo || '',
      invoice.customer_name || invoice.customerName || '',
      invoice.invoice_date || invoice.date || '',
      invoice.dueDate || '',
      invoice.final_amount || invoice.amount || 0,
      invoice.invoice_status || invoice.status || '',
      invoice.payment_status || invoice.paymentStatus || ''
    ]);
    
    return [headers, ...rows];
  };

  // Download CSV file
  const downloadCSV = (data: any[][], filename: string) => {
    const csvContent = data.map(row => 
      row.map(field => 
        typeof field === 'string' && field.includes(',') 
          ? `"${field}"` 
          : field
      ).join(',')
    ).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Handle filter changes with auto-search
  const handleFilterChange = (filters: any) => {
    debugLogger.debug('Filters changed:', filters);
    // Update local state
    if (filters.status) setFilterStatus(filters.status);
    if (filters.dateFilter) setDateFilter(filters.dateFilter);
    
    // Build search params including current search query
    const searchParams = {
      search: searchQuery,
      payment_status: filterStatus === 'all' ? undefined : filterStatus,
      ...filters
    };
    
    // Reset to first page when filters change and fetch with all current filters
    fetchInvoices(1, searchParams);
  };

  // Handle search changes with auto-search and debouncing
  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    
    // Debounce search to avoid too many API calls
    const timeoutId = setTimeout(() => {
      const searchParams = {
        search: query,
        payment_status: filterStatus === 'all' ? undefined : filterStatus
      };
      fetchInvoices(1, searchParams);
    }, 500); // Increased debounce time for better UX
    
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

  // Handle date filter changes  
  const handleDateChange = (dateFilter: string) => {
    setDateFilter(dateFilter);
    const searchParams = {
      search: searchQuery,
      payment_status: filterStatus === 'all' ? undefined : filterStatus,
      dateFilter: dateFilter
    };
    fetchInvoices(1, searchParams);
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

  // Handle print invoice (shows print dialog)
  const handlePrintInvoice = async (invoice: Invoice) => {
    try {
      // Fetch full invoice details
      const response = await InvoiceApiService.getInvoiceById(invoice.invoice_id || invoice.id);
      
      if (response.success && response.data) {
        const fullInvoice = response.data;
        
        // Use the print function for print dialog
        const { printInvoice } = await import('../../utils/invoicePdfGenerator');
        printInvoice(fullInvoice);
      } else {
        alert('Failed to load invoice details. Please try again.');
      }
    } catch (error) {
      console.error('Error printing invoice:', error);
      alert('Failed to print invoice. Please try again.');
    }
  };

  // Handle download invoice (directly saves PDF)
  const handleDownloadInvoice = async (invoice: Invoice) => {
    try {
      // Fetch full invoice details
      const response = await InvoiceApiService.getInvoiceById(invoice.invoice_id || invoice.id);
      
      if (response.success && response.data) {
        const fullInvoice = response.data;
        
        // Use the download function for direct PDF save
        const { downloadInvoicePDF } = await import('../../utils/invoicePdfGenerator');
        downloadInvoicePDF(fullInvoice);
      } else {
        alert('Failed to load invoice details. Please try again.');
      }
    } catch (error) {
      console.error('Error downloading invoice:', error);
      alert('Failed to download invoice. Please try again.');
    }
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
      key: 'select',
      header: '',
      render: (value: any, invoice: Invoice) => (
        <input
          type="checkbox"
          checked={selectedIds.has(invoice.id)}
          onChange={() => toggleSelect(invoice.id)}
          className="w-4 h-4 rounded border-gray-300"
        />
      ),
      width: '50px',
    },
    {
      key: 'invoice_date',
      header: 'Date',
      render: (value: string, invoice: Invoice) => (
        <div className="text-gray-900 font-medium">{formatDate(invoice.invoice_date)}</div>
      ),
      width: '120px',
    },
    {
      key: 'customer_name',
      header: 'Customer',
      render: (value: string, invoice: Invoice) => (
        <div className="text-gray-900 font-medium">{invoice.customer_name}</div>
      ),
      width: '200px',
    },
    {
      key: 'invoice_number',
      header: 'Invoice #',
      render: (value: string, invoice: Invoice) => (
        <div className="text-gray-600 text-sm">
          {invoice.invoice_number}
        </div>
      ),
      width: '120px',
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
        <div className="flex items-center space-x-1">
          <button
            onClick={() => handleViewInvoice(invoice)}
            className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
            title="View Invoice"
          >
            <Eye className="w-4 h-4" />
          </button>
          
          <button
            onClick={() => handlePrintInvoice(invoice)}
            className="p-2 text-green-500 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors"
            title="Print PDF"
          >
            <Printer className="w-4 h-4" />
          </button>

          <button
            onClick={() => handleDownloadInvoice(invoice)}
            className="p-2 text-purple-500 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition-colors"
            title="Download PDF"
          >
            <Download className="w-4 h-4" />
          </button>
          
          <button
            onClick={() => {
              setSelectedIds(new Set([invoice.id]));
              setTimeout(() => whatsappSelected(), 0);
            }}
            className="p-2 text-green-500 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors"
            title="Send WhatsApp"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.149-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
            </svg>
          </button>
          
          <button
            onClick={() => handleMoreOptions(invoice)}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            title="More Options"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>
      ),
      width: '200px',
    },
  ];

  return (
    <div className="h-full bg-white">
      {/* Modern Animations */}
      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        
        .animation-delay-0 { animation-delay: 0ms; }
        .animation-delay-200 { animation-delay: 200ms; }
        .animation-delay-400 { animation-delay: 400ms; }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        
        @keyframes ping {
          75%, 100% {
            transform: scale(2);
            opacity: 0;
          }
        }
        
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        .animate-bounce { animation: bounce 1s infinite; }
        .animate-pulse { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        .animate-ping { animation: ping 1s cubic-bezier(0, 0, 0.2, 1) infinite; }
        .animate-spin { animation: spin 1s linear infinite; }
      `}</style>
      
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
              {/* Modern Refresh Button */}
              <button
                onClick={handleRefresh}
                disabled={refreshing || loading}
                className={`
                  relative p-2.5 rounded-xl transition-all duration-300 ease-out
                  ${refreshSuccess 
                    ? 'bg-gradient-to-r from-green-400 to-emerald-400 shadow-lg shadow-green-200/50' 
                    : refreshing
                      ? 'bg-gradient-to-r from-blue-400 to-indigo-400 shadow-lg shadow-blue-200/50'
                      : 'bg-white hover:bg-gradient-to-r hover:from-gray-50 hover:to-gray-100 border border-gray-200 hover:border-gray-300 hover:shadow-md'
                  }
                  ${refreshing || loading ? 'cursor-not-allowed' : 'cursor-pointer'}
                  group transform hover:scale-105 active:scale-95
                `}
                title={refreshSuccess ? "Successfully refreshed!" : refreshing ? "Refreshing data..." : "Refresh data"}
              >
                <div className="relative">
                  {refreshSuccess ? (
                    <CheckCircle className="w-5 h-5 text-white" />
                  ) : (
                    <RefreshCw className={`w-5 h-5 transition-all duration-500 ${
                      refreshing 
                        ? 'animate-spin text-white' 
                        : 'text-gray-600 group-hover:text-gray-800 group-hover:rotate-180'
                    }`} />
                  )}
                  
                  {/* Modern ripple effect */}
                  {(refreshing || refreshSuccess) && (
                    <div className="absolute inset-0 -m-2">
                      <div className="w-9 h-9 rounded-full bg-white opacity-30 animate-ping" />
                    </div>
                  )}
                </div>
              </button>

              {/* Modern Export Button */}
              <button
                onClick={handleExportAll}
                disabled={exporting || invoices.length === 0}
                className={`
                  relative px-4 py-2.5 rounded-xl transition-all duration-300 ease-out
                  flex items-center space-x-2.5
                  ${exportSuccess 
                    ? 'bg-gradient-to-r from-green-400 to-emerald-400 text-white shadow-lg shadow-green-200/50' 
                    : exporting
                      ? 'bg-gradient-to-r from-blue-400 to-indigo-400 text-white shadow-lg shadow-blue-200/50'
                      : 'bg-white hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 border border-gray-200 hover:border-blue-300 hover:shadow-md text-gray-700 hover:text-blue-700'
                  }
                  ${exporting || invoices.length === 0 ? 'cursor-not-allowed opacity-75' : 'cursor-pointer'}
                  group transform hover:scale-105 active:scale-95
                  font-medium text-sm
                `}
                title={
                  invoices.length === 0 
                    ? "No invoices to export" 
                    : exportSuccess 
                      ? "Successfully exported!" 
                      : "Export all invoices to CSV"
                }
              >
                {/* Modern icon with animation */}
                <div className="relative">
                  {exportSuccess ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : exporting ? (
                    <div className="relative">
                      <Download className="w-4 h-4 animate-pulse" />
                      <div className="absolute inset-0">
                        <div className="w-4 h-4 rounded-full border-2 border-transparent border-t-white animate-spin" />
                      </div>
                    </div>
                  ) : (
                    <Download className={`w-4 h-4 transition-transform duration-300 ${
                      invoices.length > 0 ? 'group-hover:translate-y-1' : ''
                    }`} />
                  )}
                </div>
                
                {/* Text label */}
                <span className="relative">
                  {exporting 
                    ? 'Exporting' 
                    : exportSuccess 
                      ? 'Exported' 
                      : 'Export All'
                  }
                  
                  {/* Modern dots animation for loading */}
                  {exporting && (
                    <span className="inline-flex ml-1">
                      <span className="animate-bounce animation-delay-0">.</span>
                      <span className="animate-bounce animation-delay-200">.</span>
                      <span className="animate-bounce animation-delay-400">.</span>
                    </span>
                  )}
                </span>
              </button>
              {onClose && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  className="text-gray-500 hover:text-gray-700 hover:bg-gray-100 p-2 rounded-lg transition-colors"
                  title="Close (Esc)"
                >
                  <X className="w-5 h-5" />
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-6 py-6">
            
            {/* Enhanced Filter Bar */}
            <div className="mb-6 border border-gray-200 rounded-lg bg-gray-50 p-4">
              <div className="flex items-center space-x-4">
                {/* Select All */}
                <label className="inline-flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-600">Select All</span>
                </label>

                {/* Search */}
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by customer name, invoice number, or order number..."
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>

                {/* Status Filter */}
                <div className="relative">
                  <select
                    value={filterStatus}
                    onChange={(e) => handleStatusChange(e.target.value)}
                    className="appearance-none pl-3 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white"
                  >
                    <option value="all">Status: All</option>
                    <option value="paid">Paid</option>
                    <option value="pending">Pending</option>
                    <option value="partial">Partial</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>

                {/* Date Filter */}
                <div className="relative">
                  <select
                    value={dateFilter}
                    onChange={(e) => handleDateChange(e.target.value)}
                    className="appearance-none pl-3 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white"
                  >
                    <option value="all">Last 30 days</option>
                    <option value="7">Last 7 days</option>
                    <option value="90">Last 90 days</option>
                    <option value="365">Last year</option>
                  </select>
                  <Calendar className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>

                {/* Bulk Actions */}
                {selectedCount > 0 ? (
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-700 mr-1">Selected: {selectedCount}</span>
                    <button 
                      onClick={() => exportSelectedPDF()} 
                      className="px-3 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm flex items-center space-x-2 shadow-sm"
                    >
                      <Download className="w-4 h-4" />
                      <span>Export PDF</span>
                    </button>
                    <button 
                      onClick={printSelected} 
                      className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm flex items-center space-x-1 shadow-sm"
                    >
                      <Printer className="w-4 h-4" />
                      <span>Print</span>
                    </button>
                    <button 
                      onClick={whatsappSelected} 
                      className="px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm flex items-center space-x-1 shadow-sm"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.149-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                      </svg>
                      <span>WhatsApp</span>
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => exportSelectedPDF()}
                    className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm flex items-center space-x-2"
                  >
                    <Download className="w-4 h-4" />
                    <span>Export PDF</span>
                  </button>
                )}
              </div>
              
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
            ) : filteredInvoices.length === 0 ? (
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
                  data={filteredInvoices}
                  columns={columns}
                  keyField="id"
                  searchable={false}
                  paginated={false}
                  pageSize={pagination.per_page}
                />
                
                {/* Pagination Controls */}
                <Pagination
                  currentPage={pagination.page}
                  totalPages={pagination.total_pages}
                  totalItems={pagination.total}
                  itemsPerPage={pagination.per_page}
                  onPageChange={(page) => fetchInvoices(page)}
                  loading={loading}
                  itemName="invoices"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoiceListV2;