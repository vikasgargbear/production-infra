import React, { useState, useEffect } from 'react';
import {
  Download, Eye, Edit, Printer,
  MoreHorizontal, Package, RotateCcw,
  X, Check, AlertCircle, RefreshCw
} from 'lucide-react';
import { Button, StatusBadge, DataTable, InlineFilterPanel, ModuleHeader } from '../global';
import { returnsApi } from '../../services/api';

interface ReturnsListHistoryProps {
  onClose?: () => void;
}

interface Return {
  id: string;
  return_no: string;
  return_type: 'sales' | 'purchase';
  customer_name?: string;
  supplier_name?: string;
  original_document_no: string;
  return_date: string;
  total_amount: number;
  status: string;
  reason: string;
  created_at?: string;
  items_count?: number;
}

// Bulk action bar
const BulkActionBar: React.FC<{
  selectedCount: number;
  onApprove: () => void;
  onReject: () => void;
  onExport: () => void;
  onClear: () => void;
}> = ({ selectedCount, onApprove, onReject, onExport, onClear }) => {
  if (selectedCount === 0) return null;

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <span className="text-sm font-medium text-blue-900">
            {selectedCount} return{selectedCount > 1 ? 's' : ''} selected
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={onApprove}>
            <Check className="w-4 h-4 mr-2" />
            Approve
          </Button>
          <Button variant="outline" size="sm" onClick={onReject}>
            <X className="w-4 h-4 mr-2" />
            Reject
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

const ReturnsListHistory: React.FC<ReturnsListHistoryProps> = ({ onClose }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(true);  // Show filters by default to see type selector
  const [selectedReturns, setSelectedReturns] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    per_page: 25,
    total_pages: 0
  });

  // State for real data
  const [returns, setReturns] = useState<Return[]>([]);

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
      key: 'return_type',
      label: 'Type',
      type: 'select' as const,
      options: [
        { value: 'all', label: 'All Returns' },
        { value: 'sales', label: 'Sales Returns' },
        { value: 'purchase', label: 'Purchase Returns' }
      ],
      defaultValue: 'all'  // Show all returns by default
    },
    {
      key: 'status',
      label: 'Status',
      type: 'select' as const,
      options: [
        { value: 'pending', label: 'Pending' },
        { value: 'approved', label: 'Approved' },
        { value: 'rejected', label: 'Rejected' },
        { value: 'completed', label: 'Completed' }
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

  // Fetch returns from backend
  const fetchReturns = async (page = 1, filters: any = {}) => {
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
      
      // Fetch both sales and purchase returns
      // Using Promise.allSettled to handle if one endpoint fails
      const [salesResult, purchaseResult] = await Promise.allSettled([
        returnsApi.getCustomerReturns(searchParams),
        returnsApi.getSupplierReturns(searchParams)
      ]);
      
      // Handle responses based on their status
      const salesResponse = salesResult.status === 'fulfilled' ? salesResult.value : null;
      const purchaseResponse = purchaseResult.status === 'fulfilled' ? purchaseResult.value : null;

      const salesReturnsList = salesResponse?.data?.returns || [];
      const purchaseReturnsList = purchaseResponse?.data?.data || [];
      
      const salesReturns: Return[] = (Array.isArray(salesReturnsList) ? salesReturnsList : []).map((ret: any) => ({
        id: ret.return_id || ret.id,  // Backend uses return_id
        return_no: ret.return_number || ret.return_no || ret.sales_return_no || `SR-${ret.return_id || ret.id}`,
        return_type: 'sales' as const,
        customer_name: ret.party_name || ret.customer_name || 'Unknown Customer',  // Backend uses party_name
        supplier_name: undefined,
        original_document_no: ret.original_invoice_number || ret.original_invoice_number || ret.invoice_number || '-',
        return_date: ret.return_date,
        total_amount: ret.total_amount || 0,
        status: ret.approval_status || ret.status || 'pending',  // Backend uses approval_status
        reason: ret.return_reason || ret.reason || '-',
        created_at: ret.created_at,
        items_count: ret.items?.length || 0
      }));

      const purchaseReturns: Return[] = (Array.isArray(purchaseReturnsList) ? purchaseReturnsList : []).map((ret: any) => ({
        id: ret.return_id || ret.id,  // Backend uses return_id
        return_no: ret.return_number || ret.return_no || ret.purchase_return_no || `PR-${ret.return_id || ret.id}`,
        return_type: 'purchase' as const,
        customer_name: undefined,
        supplier_name: ret.party_name || ret.supplier_name || 'Unknown Supplier',  // Backend uses party_name
        original_document_no: ret.original_invoice_number || ret.original_purchase_no || ret.purchase_no || '-',
        return_date: ret.return_date,
        total_amount: ret.total_amount || 0,
        status: ret.approval_status || ret.status || 'pending',  // Backend uses approval_status
        reason: ret.return_reason || ret.reason || '-',
        created_at: ret.created_at,
        items_count: ret.items?.length || 0
      }));

      // Combine and filter based on type filter if specified
      let allReturns = [...salesReturns, ...purchaseReturns];
      
      if (filters.return_type && filters.return_type !== 'all') {
        allReturns = allReturns.filter(ret => ret.return_type === filters.return_type);
      }

      setReturns(allReturns);
      setPagination({
        total: allReturns.length,
        page: page,
        per_page: pagination.per_page,
        total_pages: Math.ceil(allReturns.length / pagination.per_page)
      });
      
      // If both endpoints failed, show a message
      if (salesResult.status === 'rejected' && purchaseResult.status === 'rejected') {
        setError('Returns feature is currently being deployed. Please try again later.');
      }
    } catch (error) {
      // Log error for debugging if needed
      setError('Failed to fetch returns. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Load returns on component mount
  useEffect(() => {
    fetchReturns();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh returns
  const handleRefresh = () => {
    fetchReturns(pagination.page);
  };

  // Handle filter changes with auto-search
  const handleFilterChange = (filters: any) => {
    // Reset to first page when filters change
    fetchReturns(1, { ...filters, search: searchQuery });
  };

  // Handle search changes with auto-search
  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    // Auto-search after a short delay to avoid too many API calls
    const timeoutId = setTimeout(() => {
      fetchReturns(1, { search: query });
    }, 300);
    
    return () => clearTimeout(timeoutId);
  };

  // Action handlers
  const handleViewReturn = (returnItem: Return) => {
    // TODO: Navigate to return view page or open modal
    alert(`Viewing return: ${returnItem.return_no}`);
  };

  const handleEditReturn = (returnItem: Return) => {
    // TODO: Navigate to return edit page or open modal
    alert(`Editing return: ${returnItem.return_no}`);
  };

  const handlePrintReturn = (returnItem: Return) => {
    // TODO: Open print dialog or generate PDF
    alert(`Printing return: ${returnItem.return_no}`);
  };

  const handleMoreOptions = (returnItem: Return) => {
    // TODO: Show dropdown menu with more options
    alert(`More options for return: ${returnItem.return_no}`);
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

    // Map backend statuses to display text - handle various formats
    const statusMap: Record<string, string> = {
      // Common lowercase variations
      'pending': 'Pending',
      'approved': 'Approved',
      'rejected': 'Rejected',
      'completed': 'Completed',
      'cancelled': 'Cancelled',
      'canceled': 'Cancelled', // Handle US spelling
      'draft': 'Draft',
      'sent': 'Sent',
      
      // Common uppercase variations
      'PENDING': 'Pending',
      'APPROVED': 'Approved',
      'REJECTED': 'Rejected',
      'COMPLETED': 'Completed',
      'CANCELLED': 'Cancelled',
      'CANCELED': 'Cancelled',
      'DRAFT': 'Draft',
      'SENT': 'Sent',
      
      // Handle null/undefined cases
      'null': 'Unknown',
      'undefined': 'Unknown',
      '': 'Unknown',
      
      // Handle numeric statuses if backend uses them
      '0': 'Draft',
      '1': 'Pending',
      '2': 'Approved',
      '3': 'Rejected',
      '4': 'Completed',
      '5': 'Cancelled'
    };
    
    const normalizedStatus = status.toString().toLowerCase().trim();
    const mappedStatus = statusMap[normalizedStatus];
    
    if (mappedStatus) {
      return mappedStatus;
    }
    
    // If no mapping found, log it and return the original value
    // No status mapping found, returning original value
    return status;
  };

  const columns = [
    {
      key: 'return_no',
      header: 'Return #',
      render: (value: string, returnItem: Return) => (
        <div className="font-medium text-gray-900">
          {returnItem.return_no}
        </div>
      ),
      width: '120px',
    },
    {
      key: 'return_type',
      header: 'Type',
      render: (value: string, returnItem: Return) => (
        <div className="flex items-center space-x-2">
          {returnItem.return_type === 'sales' ? (
            <Package className="w-4 h-4 text-blue-600" />
          ) : (
            <RotateCcw className="w-4 h-4 text-green-600" />
          )}
          <span className="text-gray-900 capitalize">
            {returnItem.return_type === 'sales' ? 'Sales' : 'Purchase'}
          </span>
        </div>
      ),
      width: '100px',
    },
    {
      key: 'customer_supplier',
      header: 'Customer/Supplier',
      render: (value: string, returnItem: Return) => (
        <div className="text-gray-900">
          {returnItem.return_type === 'sales' 
            ? returnItem.customer_name || 'Unknown Customer'
            : returnItem.supplier_name || 'Unknown Supplier'
          }
        </div>
      ),
      width: '180px',
    },
    {
      key: 'original_document_no',
      header: 'Original Doc',
      render: (value: string, returnItem: Return) => (
        <div className="text-gray-600">{returnItem.original_document_no}</div>
      ),
      width: '140px',
    },
    {
      key: 'return_date',
      header: 'Return Date',
      render: (value: string, returnItem: Return) => (
        <div className="text-gray-600">{formatDate(returnItem.return_date)}</div>
      ),
      width: '120px',
    },
    {
      key: 'total_amount',
      header: 'Amount',
      render: (value: number, returnItem: Return) => (
        <div className="font-medium text-gray-900">
          {formatCurrency(returnItem.total_amount)}
        </div>
      ),
      width: '120px',
    },
    {
      key: 'status',
      header: 'Status',
      render: (value: string, returnItem: Return) => {
        const statusText = getStatusText(returnItem.status);
        // Status column render
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
      key: 'actions',
      header: 'Actions',
      render: (value: any, returnItem: Return) => (
        <div className="flex items-center space-x-2">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => handleViewReturn(returnItem)}
            title="View Return"
            className="h-10 w-10 p-0 hover:bg-blue-50"
          >
            <Eye className="w-5 h-5 text-blue-600" />
          </Button>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => handleEditReturn(returnItem)}
            title="Edit Return"
            className="h-10 w-10 p-0 hover:bg-green-50"
          >
            <Edit className="w-5 h-5 text-green-600" />
          </Button>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => handlePrintReturn(returnItem)}
            title="Print Return"
            className="h-10 w-10 p-0 hover:bg-purple-50"
          >
            <Printer className="w-5 h-5 text-purple-600" />
          </Button>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => handleMoreOptions(returnItem)}
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
    <div className="h-full bg-blue-50">
      <div className="h-full flex flex-col">
        
        {/* Header - Using Global ModuleHeader */}
        <ModuleHeader
          title="Returns History"
          documentNumber=""
          status="active"
          icon={RotateCcw}
          iconColor="text-blue-600"
          onClose={onClose}
          historyType="return"
          showSaveDraft={false}
          onSaveDraft={() => {}}
          additionalActions={[
            {
              label: "Refresh",
              onClick: handleRefresh,
              variant: "default",
              icon: loading ? RefreshCw : RefreshCw,
              disabled: loading
            },
            {
              label: "Export All",
              variant: "default",
              icon: Download
            }
          ] as any}
        />

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
              selectedCount={selectedReturns.length}
              onApprove={() => {/* TODO: Implement approve selected */}}
              onReject={() => {/* TODO: Implement reject selected */}}
              onExport={() => {/* TODO: Implement export selected */}}
              onClear={() => setSelectedReturns([])}
            />

            {/* Loading State */}
            {loading ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
                  <p className="text-gray-600">Loading returns...</p>
                </div>
              </div>
            ) : returns.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
                <div className="text-center">
                  <RotateCcw className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p className="text-lg font-medium text-gray-500">
                    {searchQuery ? `No returns found matching "${searchQuery}"` : 'No returns found'}
                  </p>
                  <p className="text-sm text-gray-400">
                    {error ? 'There was an error loading returns' : 
                     searchQuery ? 'Try adjusting your search terms or filters' : 'No returns match your criteria'}
                  </p>
                  {searchQuery && (
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        setSearchQuery('');
                        fetchReturns(1);
                      }} 
                      className="mt-4"
                    >
                      Clear Search
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              /* Returns Table */
              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <DataTable
                  data={returns}
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
                      Showing {returns.length} of {pagination.total} returns
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fetchReturns(pagination.page - 1)}
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
                        onClick={() => fetchReturns(pagination.page + 1)}
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

export default ReturnsListHistory;