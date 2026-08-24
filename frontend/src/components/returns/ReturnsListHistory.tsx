import React, { useState, useEffect } from 'react';
import {
  Download, Package, RotateCcw,
  X, AlertCircle, RefreshCw, Users, Truck
} from 'lucide-react';
import { Button, StatusBadge, DataTable, InlineFilterPanel, ModuleHeader } from '../global';
import { returnsApi } from '../../services/api';
import {
  normalizeReturnStatus,
  projectReturnsHistoryRows,
  returnsHistoryCsv,
  ReturnsHistoryRow,
} from './utils/returnsHistoryProjection';

// Return type configuration for visual tabs
type ReturnType = 'all' | 'sales' | 'purchase';

const returnTypeConfig = {
  all: {
    label: 'All Returns',
    icon: RotateCcw,
    activeClass: 'bg-gray-100 text-gray-700 border-gray-300',
    iconColor: 'text-gray-600'
  },
  sales: {
    label: 'Sales Returns',
    icon: Users,
    activeClass: 'bg-red-50 text-red-700 border-red-200',
    iconColor: 'text-red-600'
  },
  purchase: {
    label: 'Purchase Returns',
    icon: Truck,
    activeClass: 'bg-orange-50 text-orange-700 border-orange-200',
    iconColor: 'text-orange-600'
  }
};

interface ReturnsListHistoryProps {
  onClose?: () => void;
}

// Bulk action bar
const BulkActionBar: React.FC<{
  selectedCount: number;
  onExport: () => void;
  onClear: () => void;
}> = ({ selectedCount, onExport, onClear }) => {
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
  const [activeFilters, setActiveFilters] = useState<Record<string, unknown>>({});
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

  // Return type state - default to all
  const [returnType, setReturnType] = useState<ReturnType>('all');

  // State for real data
  const [returns, setReturns] = useState<ReturnsHistoryRow[]>([]);

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
      key: 'date_preset',
      label: 'Period',
      type: 'select' as const,
      options: [
        { value: 'all', label: 'All Time' },
        { value: 'today', label: 'Today' },
        { value: 'yesterday', label: 'Yesterday' },
        { value: 'last7days', label: 'Last 7 Days' },
        { value: 'last30days', label: 'Last 30 Days' },
        { value: 'thisMonth', label: 'This Month' },
        { value: 'lastMonth', label: 'Last Month' },
        { value: 'thisQuarter', label: 'This Quarter' }
      ],
      defaultValue: 'all'
    },
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
        { value: 'all', label: 'All Statuses' },
        { value: 'draft', label: 'Draft' },
        { value: 'submitted', label: 'Submitted' },
        { value: 'approved', label: 'Approved' },
        { value: 'posted', label: 'Posted' },
        { value: 'cancelled', label: 'Cancelled' },
        { value: 'reversed', label: 'Reversed' }
      ],
      defaultValue: 'all'
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
        ...filters,
        from_date: filters.dateFrom,
        to_date: filters.dateTo,
      };
      delete searchParams.dateFrom;
      delete searchParams.dateTo;
      delete searchParams.date_preset;
      delete searchParams.return_type;
      if (searchParams.status === 'all') delete searchParams.status;

      // If there's a search query, add it to the filters
      if (filters.search && filters.search.trim()) {
        searchParams.search = filters.search.trim();
      }

      // Fetch both sales and purchase returns
      // Using Promise.allSettled to handle if one endpoint fails
      const [salesResult, purchaseResult] = await Promise.allSettled([
        returnsApi.getSaleReturns(searchParams),
        returnsApi.getPurchaseReturns(searchParams)
      ]);

      // Handle responses based on their status
      const salesResponse = salesResult.status === 'fulfilled' ? salesResult.value : null;
      const purchaseResponse = purchaseResult.status === 'fulfilled' ? purchaseResult.value : null;

      const salesReturnsList = salesResponse?.data?.returns || salesResponse?.data?.sales_returns || [];
      const purchaseReturnsList = purchaseResponse?.data?.returns || purchaseResponse?.data?.purchase_returns || [];

      const salesReturns = projectReturnsHistoryRows(salesReturnsList, 'sales');
      const purchaseReturns = projectReturnsHistoryRows(purchaseReturnsList, 'purchase');

      // Combine and filter based on type filter if specified
      let allReturns = [...salesReturns, ...purchaseReturns];

      if (filters.return_type && filters.return_type !== 'all') {
        allReturns = allReturns.filter(ret => ret.return_type === filters.return_type);
      }

      const salesTotal = Number(salesResponse?.data?.total || 0);
      const purchaseTotal = Number(purchaseResponse?.data?.total || 0);
      const filteredTotal = filters.return_type === 'sales'
        ? salesTotal
        : filters.return_type === 'purchase' ? purchaseTotal : salesTotal + purchaseTotal;

      setReturns(allReturns);
      setPagination({
        total: filteredTotal,
        page: page,
        per_page: pagination.per_page,
        total_pages: Math.ceil(filteredTotal / pagination.per_page)
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

  // Load returns on component mount and when return type changes
  useEffect(() => {
    fetchReturns(1, { return_type: returnType });
  }, [returnType]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle return type change
  const handleReturnTypeChange = (type: ReturnType) => {
    setReturnType(type);
    setActiveFilters(prev => ({ ...prev, return_type: type }));
    setSelectedReturns([]);
  };

  // Refresh returns
  const handleRefresh = () => {
    fetchReturns(pagination.page);
  };

  // Handle filter changes with auto-search
  const handleFilterChange = (filters: any) => {
    setActiveFilters(filters);
    // Reset to first page when filters change
    fetchReturns(1, { ...filters, search: searchQuery });
  };

  // Handle search changes with auto-search
  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    // Auto-search after a short delay to avoid too many API calls
    const timeoutId = setTimeout(() => {
      fetchReturns(1, { ...activeFilters, search: query });
    }, 300);

    return () => clearTimeout(timeoutId);
  };

  const exportRows = (rows: ReturnsHistoryRow[]) => {
    if (!rows.length) return;
    const blob = new Blob([returnsHistoryCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `returns-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportSelected = () => exportRows(
    returns.filter(item => selectedReturns.includes(item.id)),
  );

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

  // Columns ordered to match Invoice History: Date, Doc #, Party, Amount, Status
  const columns = [
    {
      key: 'return_date',
      header: 'Date',
      render: (value: string, returnItem: ReturnsHistoryRow) => (
        <div className="text-gray-700">{formatDate(returnItem.return_date)}</div>
      ),
      width: '110px',
    },
    {
      key: 'return_no',
      header: 'Return #',
      render: (value: string, returnItem: ReturnsHistoryRow) => (
        <div className="text-sm text-gray-600">
          {returnItem.return_no}
        </div>
      ),
      width: '140px',
    },
    {
      key: 'return_type',
      header: 'Type',
      render: (value: string, returnItem: ReturnsHistoryRow) => (
        <div className="flex items-center space-x-2">
          {returnItem.return_type === 'sales' ? (
            <Package className="w-4 h-4 text-red-500" />
          ) : (
            <Truck className="w-4 h-4 text-orange-500" />
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
      header: 'Party',
      render: (value: string, returnItem: ReturnsHistoryRow) => (
        <div className="font-medium text-gray-900">
          {returnItem.return_type === 'sales'
            ? returnItem.customer_name || 'Unknown Customer'
            : returnItem.supplier_name || 'Unknown Supplier'
          }
        </div>
      ),
    },
    {
      key: 'original_document_no',
      header: 'Original Doc',
      render: (value: string, returnItem: ReturnsHistoryRow) => (
        <div className="text-gray-600">{returnItem.original_document_no}</div>
      ),
      width: '140px',
    },
    {
      key: 'total_amount',
      header: 'Amount',
      align: 'right' as const,
      render: (value: number, returnItem: ReturnsHistoryRow) => (
        <div className="font-semibold text-gray-900 text-right">
          {formatCurrency(returnItem.total_amount)}
        </div>
      ),
      width: '120px',
    },
    {
      key: 'status',
      header: 'Status',
      render: (value: string, returnItem: ReturnsHistoryRow) => {
        const normalized = normalizeReturnStatus(returnItem.status);
        const badgeStatus = ['posted', 'approved'].includes(normalized.status) ? 'success'
          : ['cancelled', 'reversed'].includes(normalized.status) ? 'error'
            : normalized.status === 'submitted' ? 'pending' : normalized.status;
        return (
          <StatusBadge
            status={badgeStatus}
            label={normalized.label}
            variant="light"
          />
        );
      },
      width: '100px',
    },
    {
      key: 'actions',
      header: 'Action',
      render: () => (
        <span className="text-sm text-gray-500" title="Canonical return reversal is not available">
          No actions
        </span>
      ),
      width: '110px',
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
          icon={returnTypeConfig[returnType].icon}
          iconColor={returnTypeConfig[returnType].iconColor}
          onClose={onClose}
          showSaveDraft={false}
          additionalActions={[
            {
              label: "Refresh",
              onClick: handleRefresh,
              variant: "default",
              icon: loading ? RefreshCw : RefreshCw,
              disabled: loading
            },
            {
              label: "Export Current Page",
              onClick: () => exportRows(returns),
              variant: "default",
              icon: Download,
              disabled: loading || returns.length === 0,
            }
          ] as any}
        />

        {/* Return Type Tabs */}
        <div className="px-6 py-3 bg-white border-b border-gray-200">
          <div className="flex space-x-1">
            {(Object.keys(returnTypeConfig) as ReturnType[]).map((type) => {
              const config = returnTypeConfig[type];
              const Icon = config.icon;
              const isActive = returnType === type;
              return (
                <button
                  key={type}
                  onClick={() => handleReturnTypeChange(type)}
                  className={`
                    flex items-center px-4 py-2 rounded-lg font-medium transition-all text-sm border
                    ${isActive
                      ? config.activeClass
                      : 'text-gray-600 hover:bg-gray-50 border-transparent'
                    }
                  `}
                >
                  <Icon className="h-4 w-4 mr-2" />
                  {config.label}
                </button>
              );
            })}
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
              selectedCount={selectedReturns.length}
              onExport={handleExportSelected}
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
