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
  Download, Eye, Edit, Printer, Package, Search, RefreshCw, CheckCircle, MessageCircle, Mail, MoreVertical
} from 'lucide-react';
import { Button, StatusBadge, DataTable, Pagination, ModuleHeader, InlineFilterPanel } from '../global';
import { supplierInvoicesApi } from '../../services/api';
import { formatCurrency } from '../../utils/formatters';
import { useCompany } from '../../contexts/CompanyContext';
import { toast } from 'react-toastify';

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

      const response = await supplierInvoicesApi.getAll(searchParams);
      const responseData = response?.data || response;

      // Handle both array response and object with invoices key
      const invoicesData = Array.isArray(responseData) ? responseData :
        (responseData?.invoices || responseData?.data?.invoices || []);

      if (invoicesData.length >= 0) {
        const transformedPurchases: PurchaseOrder[] = invoicesData.map((invoice: any) => ({
          id: invoice.supplier_invoice_id?.toString() || invoice.invoice_number,
          po_number: invoice.invoice_number || invoice.supplier_invoice_number,
          po_date: invoice.invoice_date || invoice.created_at,
          supplier_id: invoice.supplier_id?.toString() || '',
          supplier_name: invoice.supplier_name,
          total_amount: invoice.invoice_total || invoice.total_amount || 0,
          paid_amount: invoice.paid_amount || 0,
          pending_amount: (invoice.invoice_total || invoice.total_amount || 0) - (invoice.paid_amount || 0),
          payment_status: invoice.payment_status || (invoice.paid_amount >= invoice.invoice_total ? 'paid' : 'pending'),
          status: invoice.status || 'confirmed',
          items_count: invoice.items_count || invoice.item_count || 0,
          created_at: invoice.created_at || invoice.invoice_date,
          updated_at: invoice.updated_at || invoice.invoice_date
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
        // Empty array is valid - just means no invoices yet
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
      header: 'Invoice #',
      render: (_: any, purchase: PurchaseOrder) => (
        <div>
          <div className="font-medium text-gray-900">{purchase.po_number}</div>
          <div className="text-xs text-gray-500">
            {purchase.po_date ? new Date(purchase.po_date).toLocaleDateString('en-IN') : '-'}
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
    <div className="h-full bg-blue-50">
      <div className="h-full flex flex-col">

        {/* Header - Using Global ModuleHeader */}
        <ModuleHeader
          title="Purchase History"
          documentNumber=""
          status="active"
          icon={Package}
          iconColor="text-blue-600"
          onClose={onClose}
          showSaveDraft={false}
          onSaveDraft={() => { }}
          additionalActions={[
            {
              label: "",
              onClick: handleRefresh,
              variant: "ghost",
              icon: RefreshCw,
              disabled: ui.refreshing,
              title: "Refresh",
              className: ui.refreshing ? "animate-spin" : ""
            },
            {
              label: "Export All",
              onClick: handleExport,
              variant: "default",
              className: "bg-gray-900 hover:bg-gray-800 text-white"
            }
          ] as any}
        />

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-6 py-6">

            {/* Filters */}
            <InlineFilterPanel
              filters={[
                {
                  key: 'date_preset',
                  label: 'Period',
                  type: 'select',
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
                },
                {
                  key: 'payment_status',
                  label: 'Status',
                  type: 'select',
                  options: [
                    { value: 'all', label: 'All Status' },
                    { value: 'paid', label: 'Paid' },
                    { value: 'partial', label: 'Partial' },
                    { value: 'pending', label: 'Pending' },
                    { value: 'overdue', label: 'Overdue' }
                  ],
                },
                {
                  key: 'dateFrom',
                  label: 'From Date',
                  type: 'date'
                },
                {
                  key: 'dateTo',
                  label: 'To Date',
                  type: 'date'
                }
              ]}
              onFilterChange={(newFilters) => {
                dispatch({ type: 'SET_FILTERS', filters: newFilters });
                const searchParams = {
                  search: filters.searchQuery,
                  payment_status: newFilters.payment_status === 'all' ? undefined : newFilters.payment_status
                };
                fetchPurchases(1, searchParams);
              }}
              onSearchChange={handleSearchChange}
            />

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