import React, { useState, useEffect } from 'react';
import {
  Download, Eye, Edit, Printer, MessageCircle,
  MoreHorizontal, Package, ShoppingBag, Search, Calendar, ChevronDown,
  X, Check, AlertCircle, RefreshCw, CheckCircle, Clock
} from 'lucide-react';
import { Button, StatusBadge, DataTable, InlineFilterPanel, Pagination } from '../global';
import { purchasesApi } from '../../services/api';
import { formatCurrency } from '../../utils/formatters';

interface PurchaseListHistoryProps {
  onClose?: () => void;
}

interface Purchase {
  id: string;
  purchase_order_id?: string;
  po_number: string;
  supplier_name: string;
  po_date: string;
  total_amount: number;
  payment_status: string;
  po_status: string;
  po_type: string;
  created_at: string;
  expected_delivery_date?: string;
  items_count?: number;
}

// Bulk action bar
const BulkActionBar: React.FC<{
  selectedCount: number;
  onMarkReceived: () => void;
  onMarkPaid: () => void;
  onExport: () => void;
  onClear: () => void;
}> = ({ selectedCount, onMarkReceived, onMarkPaid, onExport, onClear }) => {
  if (selectedCount === 0) return null;

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <span className="text-sm font-medium text-blue-900">
            {selectedCount} purchase{selectedCount > 1 ? 's' : ''} selected
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={onMarkReceived}>
            <Check className="w-4 h-4 mr-2" />
            Mark as Received
          </Button>
          <Button variant="outline" size="sm" onClick={onMarkPaid}>
            <Check className="w-4 h-4 mr-2" />
            Mark as Paid
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

const PurchaseListHistory: React.FC<PurchaseListHistoryProps> = ({ onClose }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedPurchases, setSelectedPurchases] = useState<string[]>([]);
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
  const [purchases, setPurchases] = useState<Purchase[]>([]);

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

  // Filter configuration for the global component
  const filterOptions = [
    {
      key: 'po_status',
      label: 'Status',
      type: 'select' as const,
      options: [
        { value: 'draft', label: 'Draft' },
        { value: 'sent', label: 'Sent' },
        { value: 'confirmed', label: 'Confirmed' },
        { value: 'received', label: 'Received' },
        { value: 'cancelled', label: 'Cancelled' }
      ]
    },
    {
      key: 'payment_status',
      label: 'Payment',
      type: 'select' as const,
      options: [
        { value: 'pending', label: 'Pending' },
        { value: 'partial', label: 'Partial' },
        { value: 'paid', label: 'Paid' }
      ]
    },
    {
      key: 'po_type',
      label: 'Type',
      type: 'select' as const,
      options: [
        { value: 'purchase_order', label: 'Purchase Order' },
        { value: 'direct_purchase', label: 'Direct Purchase' },
        { value: 'grn', label: 'GRN' }
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

  // Fetch purchases from backend
  const fetchPurchases = async (page = 1, filters: any = {}) => {
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

      // Try to get supplier invoices as they represent actual purchases
      let response;
      try {
        // First try to get regular purchases
        response = await purchasesApi.enhanced.getAll(searchParams);
        
        // If no purchases found, load supplier invoices instead
        if (!response.data?.purchases || response.data.purchases.length === 0) {
          
          const invoicesResponse = await purchasesApi.getReturnableInvoices(searchParams);
          
          if (invoicesResponse.data?.invoices) {
            // Transform supplier invoices to match purchase format
            const transformedInvoices = invoicesResponse.data.invoices.map((invoice: any) => ({
              purchase_order_id: invoice.supplier_invoice_id,
              po_number: invoice.supplier_invoice_number || `INV-${invoice.supplier_invoice_id}`,
              supplier_name: invoice.supplier_name || 'Unknown Supplier',
              po_date: invoice.invoice_date || invoice.created_at,
              total_amount: parseFloat(invoice.invoice_amount) || 0,
              payment_status: invoice.payment_status || 'pending',
              po_status: 'completed',
              po_type: 'supplier_invoice',
              items_count: invoice.total_items || 0
            }));
            
            response = {
              data: {
                purchases: transformedInvoices,
                pagination: {
                  total: invoicesResponse.data.total || transformedInvoices.length,
                  page: 1,
                  per_page: searchParams.limit,
                  total_pages: Math.ceil((invoicesResponse.data.total || transformedInvoices.length) / searchParams.limit)
                }
              }
            };
          }
        }
      } catch (error) {
        // Don't try supplier invoices until backend is fixed
        throw error;
      }
      
      if (response.data) {
        // Transform backend data to match our interface
        const transformedPurchases = response.data.purchases?.map((purchase: any) => ({
          id: purchase.purchase_order_id?.toString() || purchase.id,
          purchase_order_id: purchase.purchase_order_id,
          po_number: purchase.po_number || purchase.purchase_no || `PO-${purchase.purchase_order_id || purchase.id}`,
          supplier_name: purchase.supplier_name || purchase.supplier?.name || 'Unknown Supplier',
          po_date: purchase.po_date || purchase.purchase_date || purchase.created_at,
          total_amount: parseFloat(purchase.total_amount) || 0,
          payment_status: purchase.payment_status || 'pending',
          po_status: purchase.po_status || 'draft',
          po_type: purchase.po_type || 'purchase_order',
          created_at: purchase.created_at,
          expected_delivery_date: purchase.expected_delivery_date,
          items_count: purchase.items_count || purchase.items?.length || 0
        })) || [];

        setPurchases(transformedPurchases);
        
        // Use the pagination data from the API response
        if (response.data.pagination) {
          setPagination({
            total: response.data.pagination.total,
            page: response.data.pagination.page,
            per_page: response.data.pagination.per_page,
            total_pages: response.data.pagination.total_pages
          });
        } else {
          // Fallback if pagination is not in response
          setPagination({
            total: transformedPurchases.length,
            page: page,
            per_page: pagination.per_page,
            total_pages: Math.ceil(transformedPurchases.length / pagination.per_page)
          });
        }
      } else {
        setError('No data received from API');
      }
    } catch (error) {
      setError('Failed to fetch purchases. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Load purchases on component mount
  useEffect(() => {
    fetchPurchases();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Enhanced refresh with better UX
  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshSuccess(false);
    
    try {
      await fetchPurchases(pagination.page);
      
      // Show success feedback
      setRefreshSuccess(true);
      setTimeout(() => setRefreshSuccess(false), 2000);
    } catch (error) {
    } finally {
      setRefreshing(false);
    }
  };

  // Enhanced export with better UX
  const handleExportAll = async () => {
    setExporting(true);
    setExportSuccess(false);
    
    try {
      // Generate CSV data from purchases
      const csvData = generateCSVData(purchases);
      downloadCSV(csvData, `purchases-export-${new Date().toISOString().split('T')[0]}.csv`);
      
      // Show success feedback
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 3000);
    } catch (error) {
    } finally {
      setExporting(false);
    }
  };

  // Generate CSV data from purchases
  const generateCSVData = (data: Purchase[]) => {
    const headers = [
      'PO Number',
      'Supplier Name', 
      'Date',
      'Expected Delivery',
      'Amount',
      'Payment Status',
      'PO Status'
    ];
    
    const rows = data.map(purchase => [
      purchase.po_number || '',
      purchase.supplier_name || '',
      purchase.po_date || '',
      purchase.expected_delivery_date || '',
      purchase.total_amount || 0,
      purchase.payment_status || '',
      purchase.po_status || ''
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
    // Reset to first page when filters change
    fetchPurchases(1, { ...filters, search: searchQuery });
  };

  // Handle search changes with auto-search and debouncing
  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    
    // Debounce search to avoid too many API calls
    const timeoutId = setTimeout(() => {
      const searchParams = {
        search: query,
        po_status: filterStatus === 'all' ? undefined : filterStatus
      };
      fetchPurchases(1, searchParams);
    }, 500);
    
    return () => clearTimeout(timeoutId);
  };

  // Handle status filter changes
  const handleStatusChange = (status: string) => {
    setFilterStatus(status);
    const searchParams = {
      search: searchQuery,
      po_status: status === 'all' ? undefined : status
    };
    fetchPurchases(1, searchParams);
  };

  // Handle date filter changes  
  const handleDateChange = (dateFilter: string) => {
    setDateFilter(dateFilter);
    const searchParams = {
      search: searchQuery,
      po_status: filterStatus === 'all' ? undefined : filterStatus,
      dateFilter: dateFilter
    };
    fetchPurchases(1, searchParams);
  };

  // Client-side filtering for display purposes only (server-side search is handled in fetchPurchases)
  const filteredPurchases = purchases; // Use server-filtered data directly

  // Multi-select functionality
  const isAllSelected = filteredPurchases.length > 0 && filteredPurchases.every(purchase => selectedIds.has(purchase.id));
  const selectedCount = Array.from(selectedIds).filter(id => filteredPurchases.some(f => f.id === id)).length;

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
        filteredPurchases.forEach(purchase => next.delete(purchase.id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filteredPurchases.forEach(purchase => next.add(purchase.id));
        return next;
      });
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount);
  };

  const exportSelectedPDF = () => {
    const itemsToExport = filteredPurchases.filter(purchase => selectedIds.has(purchase.id));
    if (itemsToExport.length === 0) return;

    // Export as CSV
    const headers = ['PO #', 'Date', 'Supplier', 'Amount', 'Status'];
    const csvContent = [
      headers.join(','),
      ...itemsToExport.map(purchase => [
        purchase.po_number,
        formatDate(purchase.po_date),
        `"${purchase.supplier_name || 'N/A'}"`,
        purchase.total_amount || 0,
        purchase.po_status || 'draft'
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `purchase-orders-${new Date().getTime()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const printSelected = () => {
    const itemsToPrint = filteredPurchases.filter(purchase => selectedIds.has(purchase.id));
    const html = `<!DOCTYPE html><html><head><title>Print Purchase Orders</title>
      <style>body{font-family:Arial,sans-serif;padding:24px;} table{width:100%;border-collapse:collapse;} th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left;} th{background:#f5f5f5;}</style>
      </head><body>
      <h2>Purchase Orders Report</h2>
      <table><thead><tr><th>PO #</th><th>Date</th><th>Supplier</th><th>Amount</th><th>Status</th></tr></thead>
      <tbody>
      ${itemsToPrint.map(purchase => `<tr><td>${purchase.po_number}</td><td>${formatDate(purchase.po_date)}</td><td>${purchase.supplier_name || 'N/A'}</td><td>${formatCurrency(purchase.total_amount || 0)}</td><td>${purchase.po_status || 'draft'}</td></tr>`).join('')}
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
    const itemsToSend = filteredPurchases.filter(purchase => selectedIds.has(purchase.id));
    if (itemsToSend.length === 0) return;
    
    const message = encodeURIComponent(
      `Purchase Orders Report:\n\n${itemsToSend.map(purchase => 
        `${purchase.po_number} - ${formatDate(purchase.po_date)} - ${purchase.supplier_name} - ${formatCurrency(purchase.total_amount || 0)} (${purchase.po_status})`
      ).join('\n')}`
    );
    
    window.open(`https://wa.me/?text=${message}`, '_blank');
  };

  // Action handlers
  const handleViewPurchase = (purchase: Purchase) => {
    // TODO: Navigate to purchase view page or open modal
    alert(`Viewing purchase: ${purchase.po_number}`);
  };

  const handleEditPurchase = (purchase: Purchase) => {
    // TODO: Navigate to purchase edit page or open modal
    alert(`Editing purchase: ${purchase.po_number}`);
  };

  const handlePrintPurchase = (purchase: Purchase) => {
    // For now, just alert until proper purchase print is implemented
    alert(`Print functionality for purchase ${purchase.po_number} will be implemented soon.`);
  };

  const handleMoreOptions = (purchase: Purchase) => {
    // TODO: Show dropdown menu with more options
    alert(`More options for purchase: ${purchase.po_number}`);
  };

  // Helper function to get proper status text
  const getStatusText = (status: string | undefined) => {
    if (!status) return 'Unknown';

    // Map backend statuses to display text - handle various formats
    const statusMap: Record<string, string> = {
      // Common lowercase variations
      'draft': 'Draft',
      'sent': 'Sent',
      'confirmed': 'Confirmed',
      'received': 'Received',
      'cancelled': 'Cancelled',
      'canceled': 'Cancelled', // Handle US spelling
      'pending': 'Pending',
      'partial': 'Partial',
      'paid': 'Paid',
      
      // Common uppercase variations
      'DRAFT': 'Draft',
      'SENT': 'Sent',
      'CONFIRMED': 'Confirmed',
      'RECEIVED': 'Received',
      'CANCELLED': 'Cancelled',
      'CANCELED': 'Cancelled',
      'PENDING': 'Pending',
      'PARTIAL': 'Partial',
      'PAID': 'Paid',
      
      // Handle null/undefined cases
      'null': 'Unknown',
      'undefined': 'Unknown',
      '': 'Unknown',
      
      // Handle numeric statuses if backend uses them
      '0': 'Draft',
      '1': 'Sent',
      '2': 'Confirmed',
      '3': 'Received',
      '4': 'Cancelled',
      '5': 'Pending',
      '6': 'Partial',
      '7': 'Paid'
    };
    
    const normalizedStatus = status.toString().toLowerCase().trim();
    const mappedStatus = statusMap[normalizedStatus];
    
    if (mappedStatus) {
      return mappedStatus;
    }
    
    // If no mapping found, log it and return the original value
    return status;
  };

  const columns = [
    {
      key: 'select',
      header: '',
      render: (value: any, purchase: Purchase) => (
        <input
          type="checkbox"
          checked={selectedIds.has(purchase.id)}
          onChange={() => toggleSelect(purchase.id)}
          className="w-4 h-4 rounded border-gray-300"
        />
      ),
      width: '50px',
    },
    {
      key: 'po_date',
      header: 'Date',
      render: (value: string, purchase: Purchase) => (
        <div className="text-gray-900 font-medium">{formatDate(purchase.po_date)}</div>
      ),
      width: '120px',
    },
    {
      key: 'supplier_name',
      header: 'Supplier',
      render: (value: string, purchase: Purchase) => (
        <div className="text-gray-900 font-medium">{purchase.supplier_name}</div>
      ),
      width: '200px',
    },
    {
      key: 'po_number',
      header: 'PO #',
      render: (value: string, purchase: Purchase) => (
        <div className="text-gray-600 text-sm">
          {purchase.po_number}
        </div>
      ),
      width: '120px',
    },
    {
      key: 'total_amount',
      header: 'Amount',
      render: (value: number, purchase: Purchase) => (
        <div className="font-medium text-gray-900">
          {formatCurrency(purchase.total_amount)}
        </div>
      ),
      width: '120px',
    },
    {
      key: 'po_status',
      header: 'Status',
      render: (value: string, purchase: Purchase) => {
        const statusText = getStatusText(purchase.po_status);
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
      render: (value: string, purchase: Purchase) => {
        const paymentText = getStatusText(purchase.payment_status);
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
      render: (value: any, purchase: Purchase) => (
        <div className="flex items-center space-x-1">
          <button
            onClick={() => handleViewPurchase(purchase)}
            className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
            title="View Purchase"
          >
            <Eye className="w-4 h-4" />
          </button>
          
          <button
            onClick={() => {
              setSelectedIds(new Set([purchase.id]));
              setTimeout(() => printSelected(), 0);
            }}
            className="p-2 text-green-500 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors"
            title="Print PDF"
          >
            <Printer className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              // For now, export as CSV until proper purchase PDF is implemented
              const csvContent = [
                ['PO Number', 'Date', 'Supplier', 'Amount', 'Status'].join(','),
                [
                  purchase.po_number,
                  formatDate(purchase.po_date),
                  `"${purchase.supplier_name}"`,
                  purchase.total_amount || 0,
                  purchase.po_status
                ].join(',')
              ].join('\n');
              
              const blob = new Blob([csvContent], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = `${purchase.po_number}.csv`;
              link.click();
              URL.revokeObjectURL(url);
            }}
            className="p-2 text-purple-500 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition-colors"
            title="Download CSV"
          >
            <Download className="w-4 h-4" />
          </button>
          
          <button
            onClick={() => {
              setSelectedIds(new Set([purchase.id]));
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
            onClick={() => handleMoreOptions(purchase)}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            title="More Options"
          >
            <MoreHorizontal className="w-4 h-4" />
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
              <ShoppingBag className="w-6 h-6 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Purchase History
                </h1>
                <p className="text-sm text-gray-600">
                  View and manage all your purchases
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
                disabled={exporting || purchases.length === 0}
                className={`
                  relative px-4 py-2.5 rounded-xl transition-all duration-300 ease-out
                  flex items-center space-x-2.5
                  ${exportSuccess 
                    ? 'bg-gradient-to-r from-green-400 to-emerald-400 text-white shadow-lg shadow-green-200/50' 
                    : exporting
                      ? 'bg-gradient-to-r from-blue-400 to-indigo-400 text-white shadow-lg shadow-blue-200/50'
                      : 'bg-white hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 border border-gray-200 hover:border-blue-300 hover:shadow-md text-gray-700 hover:text-blue-700'
                  }
                  ${exporting || purchases.length === 0 ? 'cursor-not-allowed opacity-75' : 'cursor-pointer'}
                  group transform hover:scale-105 active:scale-95
                  font-medium text-sm
                `}
                title={
                  purchases.length === 0 
                    ? "No purchases to export" 
                    : exportSuccess 
                      ? "Successfully exported!" 
                      : "Export all purchases to CSV"
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
                      purchases.length > 0 ? 'group-hover:translate-y-1' : ''
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
                    placeholder="Search by supplier name, PO number..."
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
                    <option value="draft">Draft</option>
                    <option value="sent">Sent</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="received">Received</option>
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
                      className="px-3 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 text-sm flex items-center space-x-2"
                    >
                      <Download className="w-4 h-4" />
                      <span>PDF</span>
                    </button>
                    <button 
                      onClick={printSelected} 
                      className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm flex items-center space-x-1"
                    >
                      <Printer className="w-4 h-4" />
                      <span>Print</span>
                    </button>
                    <button 
                      onClick={whatsappSelected} 
                      className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm flex items-center space-x-1"
                    >
                      <MessageCircle className="w-4 h-4" />
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
              selectedCount={selectedPurchases.length}
              onMarkReceived={() => {/* TODO: Implement mark as received */}}
              onMarkPaid={() => {/* TODO: Implement mark as paid */}}
              onExport={() => {/* TODO: Implement export selected */}}
              onClear={() => setSelectedPurchases([])}
            />

            {/* Loading State */}
            {loading ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
                  <p className="text-gray-600">Loading purchases...</p>
                </div>
              </div>
            ) : filteredPurchases.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
                <div className="text-center">
                  <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p className="text-lg font-medium text-gray-500">
                    {searchQuery ? `No purchases found matching "${searchQuery}"` : 'No purchases found'}
                  </p>
                  <p className="text-sm text-gray-400">
                    {error ? 'There was an error loading purchases' : 
                     searchQuery ? 'Try adjusting your search terms or filters' : 'No purchases match your criteria'}
                  </p>
                  {searchQuery && (
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        setSearchQuery('');
                        fetchPurchases(1);
                      }} 
                      className="mt-4"
                    >
                      Clear Search
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              /* Purchase Table */
              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <DataTable
                  data={filteredPurchases}
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
                  onPageChange={(page) => fetchPurchases(page)}
                  loading={loading}
                  itemName="purchases"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PurchaseListHistory;