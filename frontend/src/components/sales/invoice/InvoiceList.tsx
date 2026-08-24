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
import { FileText, RefreshCw, Package, ShoppingCart } from 'lucide-react';
import { Pagination, ModuleHeader, InlineFilterPanel } from '../../global';
import { invoicesApi, challansApi, ordersApi } from '../../../services/api';
import CancelInvoiceModal from '../modals/CancelInvoiceModal';
import { useCompany } from '../../../contexts/CompanyContext';
import { InvoiceTable } from './invoicelist/components/InvoiceTable';
import { InvoiceBulkActions } from './invoicelist/components/InvoiceBulkActions';
import { useInvoiceListState } from './invoicelist/hooks/useInvoiceListState';
import type { InvoiceListProps, Invoice } from './invoicelist/types/invoicelist.types';
import { projectInvoiceListRow } from './invoicelist/utils/invoiceListProjection';

// Document type configuration
type DocumentType = 'invoice' | 'challan' | 'sales_order';

const documentTypeConfig = {
  invoice: {
    label: 'Invoices',
    icon: FileText,
    activeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    iconColor: 'text-blue-600'
  },
  challan: {
    label: 'Delivery Challans',
    icon: Package,
    activeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    iconColor: 'text-emerald-600'
  },
  sales_order: {
    label: 'Sales Orders',
    icon: ShoppingCart,
    activeClass: 'bg-purple-50 text-purple-700 border-purple-200',
    iconColor: 'text-purple-600'
  }
};

// Filter configuration for InlineFilterPanel
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
    key: 'payment_status',
    label: 'Status',
    type: 'select' as const,
    options: [
      { value: 'all', label: 'All Status' },
      { value: 'paid', label: 'Paid' },
      { value: 'partial', label: 'Partial' },
      { value: 'pending', label: 'Pending' },
      { value: 'overdue', label: 'Overdue' }
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

const InvoiceList: React.FC<InvoiceListProps> = ({ onClose }) => {
  // Use centralized state management (replaces 15 useState!)
  const { state, dispatch, invoices, selectedIds, filters, ui, pagination, loading } = useInvoiceListState();

  // Document type state - default to invoice
  const [documentType, setDocumentType] = useState<DocumentType>('invoice');

  // Cancel modal state
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [invoiceToCancel, setInvoiceToCancel] = useState<Invoice | null>(null);

  // Fetch documents from backend based on document type
  const fetchDocuments = useCallback(async (page = 1, searchFilters: any = {}, docType: DocumentType = documentType) => {
    dispatch({ type: 'SET_LOADING', loading: true });
    dispatch({ type: 'SET_ERROR', error: null });

    try {
      const searchParams: any = {
        limit: pagination.per_page,
        offset: (page - 1) * pagination.per_page,
        skip: (page - 1) * pagination.per_page,
        ...searchFilters
      };

      if (searchFilters.search?.trim()) {
        searchParams.search = searchFilters.search.trim();
      }

      let response;
      let transformedData: Invoice[] = [];

      if (docType === 'invoice') {
        // Invoices API returns { invoices: [], total }
        response = await invoicesApi.getAll(searchParams);
        const responseData = response?.data;
        console.log('[Invoice API] Raw response:', responseData);

        // Backend returns: { invoices: [...], total }
        const invoicesData = responseData?.invoices;

        if (!Array.isArray(invoicesData)) {
          console.error('[Invoice API] Expected invoices array, got:', typeof invoicesData);
          dispatch({ type: 'SET_INVOICES', invoices: [] });
          dispatch({ type: 'SET_PAGINATION', pagination: { total: 0, page, total_pages: 0 } });
          return;
        }

        // Map invoice fields to display format
        // Backend fields: invoice_id, invoice_number, invoice_date, customer_name, final_amount, paid_amount, pending_amount, payment_status, due_date
        transformedData = invoicesData.map(projectInvoiceListRow);

        const total = responseData?.total ?? transformedData.length;
        dispatch({ type: 'SET_INVOICES', invoices: transformedData });
        dispatch({
          type: 'SET_PAGINATION',
          pagination: { total, page, total_pages: Math.ceil(total / pagination.per_page) }
        });

      } else if (docType === 'challan') {
        // Challans API returns DIRECT ARRAY (not wrapped in { challans: [] })
        response = await challansApi.getAll({
          skip: searchParams.skip,
          limit: searchParams.limit,
          start_date: searchFilters.date_from,
          end_date: searchFilters.date_to
        });

        // Backend returns direct array: [{ challan_id, challan_number, ... }]
        const challansData = response?.data;
        console.log('[Challan API] Raw response:', challansData);

        if (!Array.isArray(challansData)) {
          console.error('[Challan API] Expected array, got:', typeof challansData);
          dispatch({ type: 'SET_INVOICES', invoices: [] });
          dispatch({ type: 'SET_PAGINATION', pagination: { total: 0, page, total_pages: 0 } });
          return;
        }

        // Map challan fields to display format
        // Backend fields: challan_id, challan_number, challan_date, customer_name, total_amount, challan_status, delivery_status
        transformedData = challansData.map((challan: any) => ({
          id: String(challan.challan_id),
          invoice_number: challan.challan_number,
          customer_id: String(challan.customer_id),
          customer_name: challan.customer_name,
          invoice_date: challan.challan_date,
          due_date: challan.dispatch_date,
          total_amount: Number(challan.total_amount),
          paid_amount: 0,
          pending_amount: Number(challan.total_amount),
          payment_status: challan.delivery_status,
          items_count: Number(challan.total_quantity),
          created_at: challan.challan_date,
          updated_at: challan.challan_date
        }));

        const total = transformedData.length;
        dispatch({ type: 'SET_INVOICES', invoices: transformedData });
        dispatch({
          type: 'SET_PAGINATION',
          pagination: { total, page, total_pages: Math.ceil(total / pagination.per_page) }
        });

      } else if (docType === 'sales_order') {
        // Sales Orders API returns { orders: [], total, page, per_page }
        response = await ordersApi.getAll({
          skip: searchParams.skip,
          limit: searchParams.limit,
          from_date: searchFilters.date_from,
          to_date: searchFilters.date_to
        });

        const responseData = response?.data;
        console.log('[Sales Orders API] Raw response:', responseData);

        // Backend returns: { orders: [...], total, page, per_page }
        const ordersData = responseData?.orders;

        if (!Array.isArray(ordersData)) {
          console.error('[Sales Orders API] Expected orders array, got:', typeof ordersData);
          dispatch({ type: 'SET_INVOICES', invoices: [] });
          dispatch({ type: 'SET_PAGINATION', pagination: { total: 0, page, total_pages: 0 } });
          return;
        }

        // Map order fields to display format
        // Backend fields: order_id, order_number, order_date, customer_name, total_amount, order_status, paid_amount, balance_amount
        transformedData = ordersData.map((order: any) => ({
          id: String(order.order_id),
          invoice_number: order.order_number,
          customer_id: String(order.customer_id),
          customer_name: order.customer_name,
          invoice_date: order.order_date,
          due_date: order.delivery_date,
          total_amount: Number(order.total_amount),
          paid_amount: Number(order.paid_amount),
          pending_amount: Number(order.balance_amount),
          payment_status: order.order_status,
          items_count: order.items?.length ?? 0,
          created_at: order.created_at,
          updated_at: order.updated_at
        }));

        const total = responseData?.total ?? transformedData.length;
        dispatch({ type: 'SET_INVOICES', invoices: transformedData });
        dispatch({
          type: 'SET_PAGINATION',
          pagination: { total, page, total_pages: Math.ceil(total / pagination.per_page) }
        });
      }

    } catch (error) {
      console.error(`Failed to fetch ${docType}:`, error);
      dispatch({ type: 'SET_ERROR', error: `Failed to fetch ${documentTypeConfig[docType].label}. Please try again.` });
      dispatch({ type: 'SET_INVOICES', invoices: [] });
    } finally {
      dispatch({ type: 'SET_LOADING', loading: false });
    }
  }, [dispatch, pagination.per_page, documentType]);

  // Alias for backward compatibility
  const fetchInvoices = fetchDocuments;

  // Load documents on mount and when document type changes
  useEffect(() => {
    fetchDocuments(1, {}, documentType);
  }, [documentType]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle document type change
  const handleDocumentTypeChange = (type: DocumentType) => {
    setDocumentType(type);
    dispatch({ type: 'CLEAR_SELECTION' });
  };

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
        fetchDocuments(pagination.page - 1, buildSearchParams(), documentType);
        return;
      }

      if (event.key === 'PageDown' && pagination.page < pagination.total_pages) {
        event.preventDefault();
        fetchDocuments(pagination.page + 1, buildSearchParams(), documentType);
        return;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, pagination, dispatch, fetchDocuments, documentType]);

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
      await fetchDocuments(pagination.page, buildSearchParams(), documentType);
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
      fetchDocuments(1, { ...buildSearchParams(), search: query }, documentType);
    }, 500);

    return () => clearTimeout(timeoutId);
  };

  const handleStatusChange = (status: string) => {
    dispatch({ type: 'SET_FILTERS', filters: { statusFilter: status } });
    fetchDocuments(1, { ...buildSearchParams(), payment_status: status === 'all' ? undefined : status }, documentType);
  };

  const handleDateChange = (dateFilter: string) => {
    dispatch({ type: 'SET_FILTERS', filters: { dateFilter } });
    fetchDocuments(1, { ...buildSearchParams(), dateFilter }, documentType);
  };

  const handleToggleSelect = (id: string) => {
    dispatch({ type: 'TOGGLE_SELECT', id });
  };

  const handleToggleSelectAll = () => {
    const invoiceIds = invoices.map(inv => inv.id);
    dispatch({ type: 'TOGGLE_SELECT_ALL', invoiceIds });
  };

  const handleCancelInvoice = (invoice: Invoice) => {
    setInvoiceToCancel(invoice);
    setCancelModalOpen(true);
  };

  const handleCancelComplete = () => {
    setCancelModalOpen(false);
    setInvoiceToCancel(null);
    fetchDocuments(pagination.page, buildSearchParams(), documentType); // Refresh list
  };

  const handleExportSelected = () => {
    const selected = invoices.filter(inv => selectedIds.has(inv.id));
    const csvData = generateCSVData(selected);
    downloadCSV(csvData, `invoices-selected-${new Date().toISOString().split('T')[0]}.csv`);
  };

  const handlePageChange = (page: number) => {
    fetchDocuments(page, buildSearchParams(), documentType);
  };

  const handlePerPageChange = (perPage: number) => {
    dispatch({ type: 'SET_PAGINATION', pagination: { per_page: perPage, page: 1 } });
    fetchDocuments(1, buildSearchParams(), documentType);
  };

  // Filtered invoices
  const filteredInvoices = invoices;
  const isAllSelected = filteredInvoices.length > 0 && filteredInvoices.every(invoice => selectedIds.has(invoice.id));
  const selectedCount = Array.from(selectedIds).filter(id => filteredInvoices.some(f => f.id === id)).length;

  // Calculate status counts for filter tabs
  const statusCounts = useMemo(() => ({
    all: invoices.length,
    paid: invoices.filter(i => i.payment_status === 'paid').length,
    partial: invoices.filter(i => i.payment_status === 'partial').length,
    pending: invoices.filter(i => i.payment_status === 'pending').length,
    overdue: invoices.filter(inv => {
      if (inv.payment_status === 'paid' || inv.payment_status === 'cancelled') return false;
      return new Date(inv.due_date) < new Date();
    }).length
  }), [invoices]);

  // Handle filter changes from InlineFilterPanel
  const handleFilterChange = (newFilters: any) => {
    // Map filter values to search params
    const searchFilters: any = {};

    if (newFilters.payment_status && newFilters.payment_status !== 'all') {
      searchFilters.payment_status = newFilters.payment_status;
    }

    // Handle date preset conversion
    if (newFilters.date_preset && newFilters.date_preset !== 'all') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      switch (newFilters.date_preset) {
        case 'today':
          searchFilters.date_from = today.toISOString().split('T')[0];
          searchFilters.date_to = today.toISOString().split('T')[0];
          break;
        case 'yesterday':
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);
          searchFilters.date_from = yesterday.toISOString().split('T')[0];
          searchFilters.date_to = yesterday.toISOString().split('T')[0];
          break;
        case 'last7days':
          const last7 = new Date(today);
          last7.setDate(last7.getDate() - 7);
          searchFilters.date_from = last7.toISOString().split('T')[0];
          searchFilters.date_to = today.toISOString().split('T')[0];
          break;
        case 'last30days':
          const last30 = new Date(today);
          last30.setDate(last30.getDate() - 30);
          searchFilters.date_from = last30.toISOString().split('T')[0];
          searchFilters.date_to = today.toISOString().split('T')[0];
          break;
        case 'thisMonth':
          const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
          searchFilters.date_from = startOfMonth.toISOString().split('T')[0];
          searchFilters.date_to = today.toISOString().split('T')[0];
          break;
        case 'lastMonth':
          const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
          const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
          searchFilters.date_from = startOfLastMonth.toISOString().split('T')[0];
          searchFilters.date_to = endOfLastMonth.toISOString().split('T')[0];
          break;
        case 'thisQuarter':
          const quarter = Math.floor(today.getMonth() / 3);
          const startOfQuarter = new Date(today.getFullYear(), quarter * 3, 1);
          searchFilters.date_from = startOfQuarter.toISOString().split('T')[0];
          searchFilters.date_to = today.toISOString().split('T')[0];
          break;
      }
    }

    // Custom date range (overrides preset if both specified)
    if (newFilters.dateFrom) {
      searchFilters.date_from = newFilters.dateFrom;
    }
    if (newFilters.dateTo) {
      searchFilters.date_to = newFilters.dateTo;
    }

    fetchDocuments(1, { ...searchFilters, search: filters.searchQuery }, documentType);
  };

  return (
    <div className="h-full bg-gray-50">
      <div className="h-full flex flex-col">

        {/* Header */}
        <ModuleHeader
          title="Sales History"
          icon={documentTypeConfig[documentType].icon}
          iconColor={documentTypeConfig[documentType].iconColor}
          onClose={onClose}
          additionalActions={[
            {
              label: "",
              onClick: handleRefresh,
              icon: RefreshCw,
              disabled: loading,
              title: "Refresh",
              className: loading ? "animate-spin" : ""
            },
            {
              label: "Export All",
              onClick: handleExportAll,
              className: "bg-gray-900 hover:bg-gray-800 text-white"
            }
          ] as any}
        />

        {/* Document Type Tabs */}
        <div className="px-6 py-3 bg-white border-b border-gray-200">
          <div className="flex space-x-1">
            {(Object.keys(documentTypeConfig) as DocumentType[]).map((type) => {
              const config = documentTypeConfig[type];
              const Icon = config.icon;
              const isActive = documentType === type;
              return (
                <button
                  key={type}
                  onClick={() => handleDocumentTypeChange(type)}
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
                searchQuery={filters.searchQuery}
                onSearchChange={handleSearchChange}
                showFilters={ui.showFilters}
                onToggleFilters={(show: boolean) => dispatch({ type: 'TOGGLE_SHOW_FILTERS' })}
              />
            </div>

            {/* Bulk Actions */}
            <InvoiceBulkActions
              selectedCount={selectedCount}
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
