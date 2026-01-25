/**
 * InvoiceList Component (REFACTORED)
 * Reduced from 1,127 lines to ~430 lines (62% reduction)
 * 
 * Refactoring changes:
 * - 15 useState → 1 useReducer (via useInvoiceListState hook)
 * - Extracted 3 sub-components (Filters, Table, BulkActions)
 * - All sub-components use React.memo for performance
 * - Types extracted to invoicelist/types/
 */

import React, { useEffect, useCallback, useState, useMemo } from 'react';
import { FileText, Clock, AlertTriangle, IndianRupee, Plus, X } from 'lucide-react';
import { Pagination } from '../../global';
import { invoicesApi } from '../../../services/api';
import CancelInvoiceModal from '../modals/CancelInvoiceModal';

// Import extracted components
import { InvoiceFilters } from './invoicelist/components/InvoiceFilters';
import { InvoiceTable } from './invoicelist/components/InvoiceTable';
import { InvoiceBulkActions } from './invoicelist/components/InvoiceBulkActions';

// Import hooks and types
import { useInvoiceListState } from './invoicelist/hooks/useInvoiceListState';
import type { InvoiceListProps, Invoice } from './invoicelist/types/invoicelist.types';

const InvoiceList: React.FC<InvoiceListProps> = ({ onClose }) => {
  // Use centralized state management (replaces 15 useState!)
  const { state, dispatch, invoices, selectedIds, filters, ui, pagination, loading } = useInvoiceListState();

  // Cancel modal state
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [invoiceToCancel, setInvoiceToCancel] = useState<Invoice | null>(null);

  // Fetch invoices from backend
  const fetchInvoices = useCallback(async (page = 1, searchFilters: any = {}) => {
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

      const response = await invoicesApi.getAll(searchParams);
      const responseData = response?.data || response;

      if (responseData?.invoices || responseData?.success) {
        const invoicesData = responseData.invoices || responseData.data?.invoices || [];

        const transformedInvoices: Invoice[] = invoicesData.map((invoice: any) => ({
          id: invoice.invoice_id?.toString() || invoice.invoice_number,
          invoice_number: invoice.invoice_number,
          customer_id: invoice.customer_id?.toString() || '',
          customer_name: invoice.customer_name,
          invoice_date: invoice.invoice_date,
          due_date: invoice.due_date || '',
          total_amount: invoice.final_amount || 0,
          paid_amount: invoice.paid_amount || 0,
          pending_amount: invoice.pending_amount || 0,
          payment_status: invoice.payment_status || 'pending',
          items_count: invoice.items_count || 0,
          created_at: invoice.created_at || invoice.invoice_date,
          updated_at: invoice.updated_at || invoice.invoice_date
        }));

        dispatch({ type: 'SET_INVOICES', invoices: transformedInvoices });

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
        dispatch({ type: 'SET_ERROR', error: responseData?.error?.message || 'Failed to fetch invoices' });
      }
    } catch (error) {
      dispatch({ type: 'SET_ERROR', error: 'Failed to fetch invoices. Please try again.' });
    } finally {
      dispatch({ type: 'SET_LOADING', loading: false });
    }
  }, [dispatch, pagination.per_page]);

  // Load invoices on mount
  useEffect(() => {
    fetchInvoices();
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

      if (event.altKey && event.key.toLowerCase() === 'e') {
        event.preventDefault();
        handleExportAll();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('[placeholder*="Search"]')?.focus();
        return;
      }

      if (event.altKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        dispatch({ type: 'TOGGLE_SHOW_FILTERS' });
        return;
      }

      if (event.key === 'PageUp' && pagination.page > 1) {
        event.preventDefault();
        fetchInvoices(pagination.page - 1, buildSearchParams());
        return;
      }

      if (event.key === 'PageDown' && pagination.page < pagination.total_pages) {
        event.preventDefault();
        fetchInvoices(pagination.page + 1, buildSearchParams());
        return;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, pagination, dispatch, fetchInvoices]);

  // Build search params from current filters
  const buildSearchParams = useCallback(() => ({
    search: filters.searchQuery,
    payment_status: filters.statusFilter === 'all' ? undefined : filters.statusFilter,
    dateFilter: filters.dateFilter
  }), [filters]);

  // Event handlers
  const handleRefresh = async () => {
    dispatch({ type: 'SET_REFRESHING', refreshing: true });
    dispatch({ type: 'SET_REFRESH_SUCCESS', success: false });

    try {
      await fetchInvoices(pagination.page, buildSearchParams());
      dispatch({ type: 'SET_REFRESH_SUCCESS', success: true });
      setTimeout(() => dispatch({ type: 'SET_REFRESH_SUCCESS', success: false }), 2000);
    } finally {
      dispatch({ type: 'SET_REFRESHING', refreshing: false });
    }
  };

  const handleExportAll = () => {
    dispatch({ type: 'SET_EXPORTING', exporting: true });
    dispatch({ type: 'SET_EXPORT_SUCCESS', success: false });

    try {
      const csvData = generateCSVData(invoices);
      downloadCSV(csvData, `invoices-export-${new Date().toISOString().split('T')[0]}.csv`);

      dispatch({ type: 'SET_EXPORT_SUCCESS', success: true });
      setTimeout(() => dispatch({ type: 'SET_EXPORT_SUCCESS', success: false }), 3000);
    } finally {
      dispatch({ type: 'SET_EXPORTING', exporting: false });
    }
  };

  const generateCSVData = (data: Invoice[]) => {
    const headers = ['Invoice Number', 'Customer Name', 'Date', 'Due Date', 'Amount', 'Paid', 'Pending', 'Status'];
    const rows = data.map(invoice => [
      invoice.invoice_number,
      invoice.customer_name,
      invoice.invoice_date,
      invoice.due_date,
      invoice.total_amount.toString(),
      invoice.paid_amount.toString(),
      invoice.pending_amount.toString(),
      invoice.payment_status
    ]);
    return [headers, ...rows];
  };

  const downloadCSV = (data: any[][], filename: string) => {
    const csvContent = data.map(row =>
      row.map(field =>
        typeof field === 'string' && field.includes(',') ? `"${field}"` : field
      ).join(',')
    ).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleSearchChange = (query: string) => {
    dispatch({ type: 'SET_FILTERS', filters: { searchQuery: query } });

    const timeoutId = setTimeout(() => {
      fetchInvoices(1, { ...buildSearchParams(), search: query });
    }, 500);

    return () => clearTimeout(timeoutId);
  };

  const handleStatusChange = (status: string) => {
    dispatch({ type: 'SET_FILTERS', filters: { statusFilter: status } });
    fetchInvoices(1, { ...buildSearchParams(), payment_status: status === 'all' ? undefined : status });
  };

  const handleDateChange = (dateFilter: string) => {
    dispatch({ type: 'SET_FILTERS', filters: { dateFilter } });
    fetchInvoices(1, { ...buildSearchParams(), dateFilter });
  };

  const handleToggleSelect = (id: string) => {
    dispatch({ type: 'TOGGLE_SELECT', id });
  };

  const handleToggleSelectAll = () => {
    const invoiceIds = invoices.map(inv => inv.id);
    dispatch({ type: 'TOGGLE_SELECT_ALL', invoiceIds });
  };

  const handleViewInvoice = (invoice: Invoice) => {
    console.log('View invoice:', invoice);
    // TODO: Implement invoice view modal
  };

  const handlePrintInvoice = (invoice: Invoice) => {
    console.log('Print invoice:', invoice);
    // TODO: Implement print functionality
  };

  const handleCancelInvoice = (invoice: Invoice) => {
    setInvoiceToCancel(invoice);
    setCancelModalOpen(true);
  };

  const handleCancelComplete = () => {
    setCancelModalOpen(false);
    setInvoiceToCancel(null);
    fetchInvoices(pagination.page, buildSearchParams()); // Refresh list
  };

  const handleMarkPaid = () => {
    console.log('Mark selected as paid:', Array.from(selectedIds));
    // TODO: Implement bulk mark as paid
  };

  const handleSendReminder = () => {
    console.log('Send reminder for:', Array.from(selectedIds));
    // TODO: Implement bulk send reminder
  };

  const handleExportSelected = () => {
    const selected = invoices.filter(inv => selectedIds.has(inv.id));
    const csvData = generateCSVData(selected);
    downloadCSV(csvData, `invoices-selected-${new Date().toISOString().split('T')[0]}.csv`);
  };

  const handlePageChange = (page: number) => {
    fetchInvoices(page, buildSearchParams());
  };

  const handlePerPageChange = (perPage: number) => {
    dispatch({ type: 'SET_PAGINATION', pagination: { per_page: perPage, page: 1 } });
    fetchInvoices(1, buildSearchParams());
  };

  // Filtered invoices
  const filteredInvoices = invoices;
  const isAllSelected = filteredInvoices.length > 0 && filteredInvoices.every(invoice => selectedIds.has(invoice.id));
  const selectedCount = Array.from(selectedIds).filter(id => filteredInvoices.some(f => f.id === id)).length;

  // Calculate summary stats
  const summaryStats = useMemo(() => {
    const totalAmount = invoices.reduce((sum, inv) => sum + inv.total_amount, 0);
    const pendingAmount = invoices.reduce((sum, inv) => sum + inv.pending_amount, 0);
    const overdueCount = invoices.filter(inv => {
      if (inv.payment_status === 'paid' || inv.payment_status === 'cancelled') return false;
      return new Date(inv.due_date) < new Date();
    }).length;
    const statusCounts = {
      all: invoices.length,
      paid: invoices.filter(i => i.payment_status === 'paid').length,
      partial: invoices.filter(i => i.payment_status === 'partial').length,
      pending: invoices.filter(i => i.payment_status === 'pending').length,
      overdue: overdueCount
    };
    return { totalAmount, pendingAmount, overdueCount, statusCounts };
  }, [invoices]);

  return (
    <div className="h-full bg-gray-50">
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Manage and track all your sales invoices
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 font-medium transition-colors"
                onClick={() => window.dispatchEvent(new CustomEvent('openInvoiceFlow'))}
              >
                <Plus className="w-4 h-4" />
                Create Invoice
              </button>
              {onClose && (
                <button
                  onClick={onClose}
                  className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>

          {/* Stat Cards */}
          <div className="grid grid-cols-4 gap-4 mt-4">
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <FileText className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total</p>
                  <p className="text-xl font-bold text-gray-900">{pagination.total}</p>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <IndianRupee className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total Value</p>
                  <p className="text-xl font-bold text-gray-900">₹{summaryStats.totalAmount.toLocaleString('en-IN')}</p>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <Clock className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Pending</p>
                  <p className="text-xl font-bold text-amber-600">₹{summaryStats.pendingAmount.toLocaleString('en-IN')}</p>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Overdue</p>
                  <p className="text-xl font-bold text-red-600">{summaryStats.overdueCount}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-6 py-6">
            {/* Filters */}
            <InvoiceFilters
              searchQuery={filters.searchQuery}
              dateFilter={filters.dateFilter}
              statusFilter={filters.statusFilter}
              showFilters={ui.showFilters}
              onSearchChange={handleSearchChange}
              onDateFilterChange={handleDateChange}
              onStatusFilterChange={handleStatusChange}
              onToggleFilters={() => dispatch({ type: 'TOGGLE_SHOW_FILTERS' })}
              onRefresh={handleRefresh}
              refreshing={ui.refreshing}
              refreshSuccess={ui.refreshSuccess}
              statusCounts={summaryStats.statusCounts}
            />

            {/* Bulk Actions */}
            <InvoiceBulkActions
              selectedCount={selectedCount}
              onMarkPaid={handleMarkPaid}
              onSendReminder={handleSendReminder}
              onExport={handleExportSelected}
              onClear={() => dispatch({ type: 'CLEAR_SELECTION' })}
            />

            {/* Table */}
            <InvoiceTable
              invoices={filteredInvoices}
              selectedIds={selectedIds}
              isAllSelected={isAllSelected}
              loading={loading}
              onToggleSelect={handleToggleSelect}
              onToggleSelectAll={handleToggleSelectAll}
              onViewInvoice={handleViewInvoice}
              onPrintInvoice={handlePrintInvoice}
              onCancelInvoice={handleCancelInvoice}
            />

            {/* Pagination */}
            {!loading && pagination.total > 0 && (
              <div className="mt-6">
                <Pagination
                  currentPage={pagination.page}
                  totalPages={pagination.total_pages}
                  onPageChange={handlePageChange}
                  itemsPerPage={pagination.per_page}
                  totalItems={pagination.total}
                  onItemsPerPageChange={handlePerPageChange}
                />
              </div>
            )}
          </div>
        </div>

        {/* Keyboard Shortcuts Help */}
        <div className="bg-gray-50 border-t border-gray-200 px-6 py-2 text-xs text-gray-500">
          <span className="font-medium">Shortcuts:</span> Alt+R: Refresh | Alt+E: Export | Alt+S: Filters | Ctrl+F: Search | Esc: Close
        </div>
      </div>

      {/* Cancel Invoice Modal */}
      <CancelInvoiceModal
        isOpen={cancelModalOpen}
        onClose={() => { setCancelModalOpen(false); setInvoiceToCancel(null); }}
        invoice={invoiceToCancel}
        onCancelled={handleCancelComplete}
      />
    </div>
  );
};

export default InvoiceList;