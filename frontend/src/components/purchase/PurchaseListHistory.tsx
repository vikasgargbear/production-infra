/**
 * PurchaseListHistory Component (REFACTORED)
 * Reduced from 1,073 lines to ~380 lines (65% reduction)
 * 
 * Refactoring changes:
 * - 15 useState → 1 useReducer (via usePurchaseListHistoryState hook)
 * - Extracted types and hook
 * - Cleaner, more maintainable code structure
 */

import React, { useEffect, useCallback } from 'react';
import {
  Download, Eye, Edit, Printer, Package, Search, RefreshCw, CheckCircle
} from 'lucide-react';
import { Button, StatusBadge, DataTable, Pagination } from '../global';
import { purchasesApi } from '../../services/api';
import { formatCurrency } from '../../utils/formatters';

// Import hooks and types
import { usePurchaseListHistoryState } from './purchaselisthistory/hooks/usePurchaseListHistoryState';
import type { PurchaseListHistoryProps, PurchaseOrder } from './purchaselisthistory/types/purchasehistory.types';

const PurchaseListHistory: React.FC<PurchaseListHistoryProps> = ({ onClose }) => {
  // Use centralized state management (replaces 15 useState!)
  const { state, dispatch, purchases, selectedIds, filters, ui, pagination, loading } = usePurchaseListHistoryState();

  // Fetch purchases from backend
  const fetchPurchases = useCallback(async (page = 1, searchFilters: any = {}) => {
    dispatch({ type: 'SET_LOADING', loading: true });
    dispatch({ type: 'SET_ERROR', error: null });

    try {
      const searchParams: any = {
        limit: pagination.per_page,
        offset: (page - 1) * pagination.per_page,
        ...searchFilters
      };

      if (searchFilters.search?.trim()) {
        searchParams.search = searchFilters.search.trim();
      }

      const response = await purchasesApi.getAll(searchParams);
      const responseData = response?.data || response;

      if (responseData?.purchases || responseData?.success) {
        const purchasesData = responseData.purchases || responseData.data?.purchases || [];

        const transformedPurchases: PurchaseOrder[] = purchasesData.map((purchase: any) => ({
          id: purchase.po_id?.toString() || purchase.po_number,
          po_number: purchase.po_number,
          po_date: purchase.po_date,
          supplier_id: purchase.supplier_id?.toString() || '',
          supplier_name: purchase.supplier_name,
          total_amount: purchase.total_amount || 0,
          paid_amount: purchase.paid_amount || 0,
          pending_amount: purchase.pending_amount || 0,
          payment_status: purchase.payment_status || 'pending',
          status: purchase.status || 'draft',
          items_count: purchase.items_count || 0,
          created_at: purchase.created_at || purchase.po_date,
          updated_at: purchase.updated_at || purchase.po_date
        }));

        dispatch({ type: 'SET_PURCHASES', purchases: transformedPurchases });

        const total = responseData.total || responseData.data?.total || 0;
        dispatch({
          type: 'SET_PAGINATION',
          pagination: {
            total,
            page,
            total_pages: Math.ceil(total / pagination.per_page)
          }
        });
      } else {
        dispatch({ type: 'SET_ERROR', error: responseData?.error?.message || 'Failed to fetch purchases' });
      }
    } catch (error) {
      dispatch({ type: 'SET_ERROR', error: 'Failed to fetch purchases. Please try again.' });
    } finally {
      dispatch({ type: 'SET_LOADING', loading: false });
    }
  }, [dispatch, pagination.per_page]);

  // Load purchases on mount
  useEffect(() => {
    fetchPurchases();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onClose) {
        onClose();
        return;
      }

      if ((event.altKey && event.key.toLowerCase() === 'r') || event.key === 'F5') {
        event.preventDefault();
        handleRefresh();
        return;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Event handlers
  const handleRefresh = async () => {
    dispatch({ type: 'SET_REFRESHING', refreshing: true });

    try {
      await fetchPurchases(pagination.page, buildSearchParams());
    } finally {
      dispatch({ type: 'SET_REFRESHING', refreshing: false });
    }
  };

  const buildSearchParams = useCallback(() => ({
    search: filters.searchQuery,
    payment_status: filters.statusFilter === 'all' ? undefined : filters.statusFilter,
    dateFilter: filters.dateFilter
  }), [filters]);

  const handleSearchChange = (query: string) => {
    dispatch({ type: 'SET_FILTERS', filters: { searchQuery: query } });

    setTimeout(() => {
      fetchPurchases(1, { ...buildSearchParams(), search: query });
    }, 500);
  };

  const handleToggleSelect = (id: string) => {
    dispatch({ type: 'TOGGLE_SELECT', id });
  };

  const handleToggleSelectAll = () => {
    const purchaseIds = purchases.map(p => p.id);
    dispatch({ type: 'TOGGLE_SELECT_ALL', purchaseIds });
  };

  const handleExport = () => {
    const selected = purchases.filter(p => selectedIds.has(p.id));
    const csvData = [
      ['PO Number', 'Supplier', 'Date', 'Amount', 'Paid', 'Pending', 'Status'],
      ...selected.map(p => [
        p.po_number,
        p.supplier_name,
        p.po_date,
        p.total_amount.toString(),
        p.paid_amount.toString(),
        p.pending_amount.toString(),
        p.payment_status
      ])
    ];

    const csvContent = csvData.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `purchases-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const filteredPurchases = purchases;
  const isAllSelected = filteredPurchases.length > 0 && filteredPurchases.every(p => selectedIds.has(p.id));
  const selectedCount = Array.from(selectedIds).filter(id => filteredPurchases.some(f => f.id === id)).length;

  // Table columns
  const columns = [
    {
      key: 'select',
      header: (
        <input
          type="checkbox"
          checked={isAllSelected}
          onChange={handleToggleSelectAll}
          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
        />
      ),
      render: (_: any, purchase: PurchaseOrder) => (
        <input
          type="checkbox"
          checked={selectedIds.has(purchase.id)}
          onChange={() => handleToggleSelect(purchase.id)}
          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
        />
      ),
      width: '50px'
    },
    {
      key: 'po_number',
      header: 'PO #',
      render: (_: any, purchase: PurchaseOrder) => (
        <div>
          <div className="font-medium text-gray-900">{purchase.po_number}</div>
          <div className="text-xs text-gray-500">
            {new Date(purchase.po_date).toLocaleDateString('en-IN')}
          </div>
        </div>
      ),
      width: '150px'
    },
    {
      key: 'supplier_name',
      header: 'Supplier',
      render: (_: any, purchase: PurchaseOrder) => (
        <div>
          <div className="font-medium text-gray-900">{purchase.supplier_name}</div>
          <div className="text-xs text-gray-500">{purchase.items_count} items</div>
        </div>
      )
    },
    {
      key: 'total_amount',
      header: 'Amount',
      align: 'right' as const,
      render: (_: any, purchase: PurchaseOrder) => (
        <div className="text-right">
          <div className="font-semibold text-gray-900">
            ₹{purchase.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          {purchase.pending_amount > 0 && (
            <div className="text-xs text-red-600">
              ₹{purchase.pending_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })} pending
            </div>
          )}
        </div>
      ),
      width: '150px'
    },
    {
      key: 'payment_status',
      header: 'Payment',
      align: 'center' as const,
      render: (_: any, purchase: PurchaseOrder) => {
        const statusMap: Record<string, any> = {
          paid: { status: 'success', label: 'Paid' },
          partial: { status: 'warning', label: 'Partial' },
          pending: { status: 'info', label: 'Pending' },
          overdue: { status: 'error', label: 'Overdue' }
        };
        const config = statusMap[purchase.payment_status] || { status: 'default', label: purchase.payment_status };
        return <StatusBadge status={config.status} label={config.label} />;
      },
      width: '120px'
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center' as const,
      render: (_: any, purchase: PurchaseOrder) => {
        const statusMap: Record<string, any> = {
          confirmed: { status: 'success', label: 'Confirmed' },
          received: { status: 'success', label: 'Received' },
          draft: { status: 'warning', label: 'Draft' },
          cancelled: { status: 'error', label: 'Cancelled' }
        };
        const config = statusMap[purchase.status] || { status: 'default', label: purchase.status };
        return <StatusBadge status={config.status} label={config.label} />;
      },
      width: '120px'
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'center' as const,
      render: (_: any, purchase: PurchaseOrder) => (
        <div className="flex items-center justify-center space-x-2">
          <button
            onClick={() => console.log('View:', purchase)}
            className="p-1 text-blue-600 hover:bg-blue-50 rounded"
            title="View Purchase"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            className="p-1 text-gray-600 hover:bg-gray-50 rounded"
            title="Print"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      ),
      width: '100px'
    }
  ];

  return (
    <div className="h-full bg-gray-50">
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Purchase History</h1>
              <p className="text-sm text-gray-600 mt-1">{pagination.total} total purchases</p>
            </div>
            {onClose && (
              <button onClick={onClose} className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
                Close
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-6 py-6">
            {/* Search and Actions */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 max-w-md">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                      type="text"
                      placeholder="Search purchases..."
                      value={filters.searchQuery}
                      onChange={(e) => handleSearchChange(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRefresh}
                    disabled={ui.refreshing}
                    className="px-4 py-2 text-sm font-medium bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                  >
                    {ui.refreshing ? (
                      <RefreshCw className="w-4 h-4 inline-block mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4 inline-block mr-2" />
                    )}
                    Refresh
                  </button>
                </div>
              </div>
            </div>

            {/* Bulk Actions */}
            {selectedCount > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-blue-900">
                    {selectedCount} purchase{selectedCount > 1 ? 's' : ''} selected
                  </span>
                  <Button variant="outline" size="sm" onClick={handleExport}>
                    <Download className="w-4 h-4 mr-2" />
                    Export
                  </Button>
                </div>
              </div>
            )}

            {/* Table */}
            <div className="bg-white rounded-lg shadow-sm">
              <DataTable
                columns={columns}
                data={filteredPurchases}
                keyField="id"
                loading={loading}
                emptyMessage="No purchases found"
              />
            </div>

            {/* Pagination */}
            {!loading && pagination.total > 0 && (
              <div className="mt-6">
                <Pagination
                  currentPage={pagination.page}
                  totalPages={pagination.total_pages}
                  onPageChange={(page) => fetchPurchases(page, buildSearchParams())}
                  itemsPerPage={pagination.per_page}
                  totalItems={pagination.total}
                  onItemsPerPageChange={(perPage) => {
                    dispatch({ type: 'SET_PAGINATION', pagination: { per_page: perPage, page: 1 } });
                    fetchPurchases(1, buildSearchParams());
                  }}
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