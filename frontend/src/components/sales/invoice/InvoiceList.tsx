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

import React, { useEffect, useCallback, useState, useRef } from 'react';
import { Archive, FileText, RefreshCw, Package, ShoppingCart } from 'lucide-react';
import { Pagination, ModuleHeader, InlineFilterPanel } from '../../global';
import { canonicalDocumentHistoryApi } from '../../../services/api';
import { InvoiceTable } from './invoicelist/components/InvoiceTable';
import { InvoiceBulkActions } from './invoicelist/components/InvoiceBulkActions';
import { useInvoiceListState } from './invoicelist/hooks/useInvoiceListState';
import type { InvoiceListProps, Invoice, InvoiceFilters } from './invoicelist/types/invoicelist.types';
import { projectInvoiceListRow, projectSalesHistoryRow } from './invoicelist/utils/invoiceListProjection';
import {
  salesHistoryExportFilename,
  salesHistoryListCsv,
} from './invoicelist/utils/salesHistoryPresentation';
import {
  buildSalesHistoryRequestParams,
  resolveSalesHistoryDateRange,
} from './invoicelist/utils/salesHistoryQuery';
import { ImportedInvoiceArchive } from './invoicelist/components/ImportedInvoiceArchive';

// Document type configuration
type CanonicalDocumentType = 'invoice' | 'challan' | 'sales_order';
type DocumentType = CanonicalDocumentType | 'imported_invoice';

const documentTypeConfig = {
  imported_invoice: {
    label: 'Existing Invoices',
    icon: Archive,
    activeClass: 'bg-sky-50 text-sky-700 border-sky-200',
    iconColor: 'text-sky-600'
  },
  invoice: {
    label: 'New ERP Invoices',
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
const commonFilterOptions = [
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

const historyFilterOptions = (type: CanonicalDocumentType) => [{
  key: 'payment_status', label: 'Status', type: 'select' as const, defaultValue: 'all',
  options: type === 'invoice' ? [
    { value: 'all', label: 'All Status' }, { value: 'paid', label: 'Paid' },
    { value: 'partial', label: 'Partial' }, { value: 'pending', label: 'Pending' },
    { value: 'overdue', label: 'Overdue' }, { value: 'cancelled', label: 'Cancelled' },
  ] : type === 'sales_order' ? [
    { value: 'all', label: 'All Status' }, { value: 'submitted', label: 'Submitted' },
    { value: 'approved', label: 'Approved' }, { value: 'partially_fulfilled', label: 'Partially Fulfilled' },
    { value: 'fulfilled', label: 'Fulfilled' }, { value: 'cancelled', label: 'Cancelled' },
  ] : [
    { value: 'all', label: 'All Status' }, { value: 'posted', label: 'Posted' },
    { value: 'cancelled', label: 'Cancelled' }, { value: 'reversed', label: 'Reversed' },
  ],
}, ...commonFilterOptions];

const emptyFilters = (): InvoiceFilters => ({
  searchQuery: '',
  statusFilter: 'all',
  dateFilter: 'all',
  dateFrom: '',
  dateTo: '',
});

const InvoiceList: React.FC<InvoiceListProps> = ({ onClose }) => {
  // Use centralized state management (replaces 15 useState!)
  const { dispatch, invoices, selectedIds, filters, ui, pagination, loading } = useInvoiceListState();

  // Existing business history is the useful default after migration. Newly
  // created canonical invoices remain available in their own adjacent tab.
  const [documentType, setDocumentType] = useState<DocumentType>('imported_invoice');
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSequenceRef = useRef(0);
  const businessDateRef = useRef<string | null>(null);
  const perPageRef = useRef(pagination.per_page);
  perPageRef.current = pagination.per_page;

  // Fetch documents from backend based on document type
  const fetchDocuments = useCallback(async (
    page: number,
    activeFilters: InvoiceFilters,
    docType: DocumentType,
    perPage: number,
  ) => {
    const requestSequence = ++requestSequenceRef.current;
    dispatch({ type: 'SET_LOADING', loading: true });
    dispatch({ type: 'SET_ERROR', error: null });

    try {
      if (docType === 'imported_invoice') return;
      const searchParams = buildSalesHistoryRequestParams(docType, activeFilters, page, perPage);
      const response = await canonicalDocumentHistoryApi.get(searchParams);
      const transformedData: Invoice[] = docType === 'invoice'
        ? response.items.map(projectInvoiceListRow)
        : response.items.map(row => projectSalesHistoryRow(row, docType));
      const total = response.total;

      if (requestSequence !== requestSequenceRef.current) return;
      businessDateRef.current = response.business_date;
      dispatch({ type: 'SET_INVOICES', invoices: transformedData });
      dispatch({
        type: 'SET_PAGINATION',
        pagination: { total, page, total_pages: Math.ceil(total / perPage) }
      });

    } catch (error) {
      if (requestSequence !== requestSequenceRef.current) return;
      console.error(`Failed to fetch ${docType}:`, error);
      dispatch({ type: 'SET_ERROR', error: `Failed to fetch ${documentTypeConfig[docType].label}. Please try again.` });
      dispatch({ type: 'SET_INVOICES', invoices: [] });
    } finally {
      if (requestSequence === requestSequenceRef.current) {
        dispatch({ type: 'SET_LOADING', loading: false });
      }
    }
  }, [dispatch]);

  // Load documents on mount and when document type changes
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (documentType === 'imported_invoice') {
      dispatch({ type: 'SET_INVOICES', invoices: [] });
      dispatch({ type: 'SET_LOADING', loading: false });
    } else {
      fetchDocuments(1, emptyFilters(), documentType, perPageRef.current);
    }
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      requestSequenceRef.current += 1;
    };
  }, [dispatch, documentType, fetchDocuments]); // pagination size is handled by its explicit change handler

  // Handle document type change
  const handleDocumentTypeChange = (type: DocumentType) => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    setDocumentType(type);
    dispatch({ type: 'CLEAR_SELECTION' });
    dispatch({
      type: 'SET_FILTERS',
      filters: emptyFilters()
    });
  };

  // Build search params from current filters
  const buildSearchParams = useCallback((): InvoiceFilters => ({ ...filters }), [filters]);

  // Event handlers
  const handleRefresh = useCallback(async () => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    dispatch({ type: 'SET_REFRESHING', refreshing: true });
    dispatch({ type: 'SET_REFRESH_SUCCESS', success: false });

    try {
      await fetchDocuments(pagination.page, buildSearchParams(), documentType, pagination.per_page);
      dispatch({ type: 'SET_REFRESH_SUCCESS', success: true });
      setTimeout(() => dispatch({ type: 'SET_REFRESH_SUCCESS', success: false }), 2000);
    } finally {
      dispatch({ type: 'SET_REFRESHING', refreshing: false });
    }
  }, [buildSearchParams, dispatch, documentType, fetchDocuments, pagination.page, pagination.per_page]);

  const downloadCSV = useCallback((csvContent: string, filename: string) => {
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
  }, []);

  const handleExportAll = useCallback(() => {
    if (documentType === 'imported_invoice') return;
    dispatch({ type: 'SET_EXPORTING', exporting: true });
    dispatch({ type: 'SET_EXPORT_SUCCESS', success: false });

    try {
      const today = businessDateRef.current;
      if (!today) throw new Error('Organization business date is unavailable.');
      downloadCSV(
        salesHistoryListCsv(documentType, invoices),
        salesHistoryExportFilename(documentType, today),
      );

      dispatch({ type: 'SET_EXPORT_SUCCESS', success: true });
      setTimeout(() => dispatch({ type: 'SET_EXPORT_SUCCESS', success: false }), 3000);
    } finally {
      dispatch({ type: 'SET_EXPORTING', exporting: false });
    }
  }, [dispatch, documentType, downloadCSV, invoices]);

  const handleSearchChange = (query: string) => {
    const nextFilters = { ...filters, searchQuery: query };
    dispatch({ type: 'SET_FILTERS', filters: nextFilters });
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    requestSequenceRef.current += 1;
    searchTimeoutRef.current = setTimeout(() => {
      fetchDocuments(1, nextFilters, documentType, pagination.per_page);
    }, 500);
  };

  const handleToggleSelect = (id: string) => {
    dispatch({ type: 'TOGGLE_SELECT', id });
  };

  const handleToggleSelectAll = () => {
    const invoiceIds = invoices.map(inv => inv.id);
    dispatch({ type: 'TOGGLE_SELECT_ALL', invoiceIds });
  };

  const handleExportSelected = () => {
    if (documentType === 'imported_invoice') return;
    const selected = invoices.filter(inv => selectedIds.has(inv.id));
    const today = businessDateRef.current;
    if (!today) {
      dispatch({ type: 'SET_ERROR', error: 'Organization business date is unavailable.' });
      return;
    }
    downloadCSV(
      salesHistoryListCsv(documentType, selected),
      salesHistoryExportFilename(documentType, today, true),
    );
  };

  const handlePageChange = (page: number) => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    fetchDocuments(page, buildSearchParams(), documentType, pagination.per_page);
  };

  const handlePerPageChange = (perPage: number) => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    dispatch({ type: 'SET_PAGINATION', pagination: { per_page: perPage, page: 1 } });
    fetchDocuments(1, buildSearchParams(), documentType, perPage);
  };

  // Filtered invoices
  const filteredInvoices = invoices;
  const isAllSelected = filteredInvoices.length > 0 && filteredInvoices.every(invoice => selectedIds.has(invoice.id));
  const selectedCount = Array.from(selectedIds).filter(id => filteredInvoices.some(f => f.id === id)).length;

  // Handle filter changes from InlineFilterPanel
  const handleFilterChange = (newFilters: any) => {
    if (typeof newFilters.search === 'string') {
      const nextFilters = { ...filters, searchQuery: newFilters.search };
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      fetchDocuments(1, nextFilters, documentType, pagination.per_page);
      return;
    }

    const preset = newFilters.date_preset || 'all';
    if (!businessDateRef.current) {
      dispatch({ type: 'SET_ERROR', error: 'Organization business date is unavailable.' });
      return;
    }
    const presetRange = resolveSalesHistoryDateRange(preset, businessDateRef.current);
    const nextFilters: InvoiceFilters = {
      ...filters,
      statusFilter: newFilters.payment_status || 'all',
      dateFilter: preset,
      dateFrom: newFilters.dateFrom || presetRange.dateFrom,
      dateTo: newFilters.dateTo || presetRange.dateTo,
    };
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    dispatch({ type: 'SET_FILTERS', filters: nextFilters });
    fetchDocuments(1, nextFilters, documentType, pagination.per_page);
  };

  const handleClearFilters = () => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    const nextFilters = emptyFilters();
    dispatch({ type: 'SET_FILTERS', filters: nextFilters });
    fetchDocuments(1, nextFilters, documentType, pagination.per_page);
  };

  // Keyboard shortcuts use the same authoritative filter snapshot as visible controls.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onClose) {
        onClose();
      } else if ((event.altKey && event.key.toLowerCase() === 'r') || event.key === 'F5') {
        event.preventDefault();
        handleRefresh();
      } else if (event.altKey && event.key.toLowerCase() === 'e') {
        event.preventDefault();
        handleExportAll();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('[placeholder*="Search"]')?.focus();
      } else if (event.altKey && event.key.toLowerCase() === 's' && documentType === 'invoice') {
        event.preventDefault();
        dispatch({ type: 'TOGGLE_SHOW_FILTERS' });
      } else if (event.key === 'PageUp' && pagination.page > 1) {
        event.preventDefault();
        fetchDocuments(pagination.page - 1, filters, documentType, pagination.per_page);
      } else if (event.key === 'PageDown' && pagination.page < pagination.total_pages) {
        event.preventDefault();
        fetchDocuments(pagination.page + 1, filters, documentType, pagination.per_page);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, pagination, dispatch, fetchDocuments, documentType, filters, handleExportAll, handleRefresh]);

  return (
    <div className="h-full bg-gray-50">
      <div className="h-full flex flex-col">

        {/* Header */}
        <ModuleHeader
          title="Sales History"
          icon={documentTypeConfig[documentType].icon}
          iconColor={documentTypeConfig[documentType].iconColor}
          onClose={onClose}
          additionalActions={documentType === 'imported_invoice' ? [] : [
            {
              label: "",
              onClick: handleRefresh,
              icon: RefreshCw,
              disabled: loading,
              title: "Refresh",
              className: loading ? "animate-spin" : ""
            },
            {
              label: "Export Page",
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
                  aria-pressed={isActive}
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

            {documentType === 'imported_invoice' ? <ImportedInvoiceArchive /> : <>
            {/* Global Inline Filter Panel */}
            <div className="mb-6">
              <InlineFilterPanel
                key={documentType}
                filters={historyFilterOptions(documentType)}
                onFilterChange={handleFilterChange}
                searchQuery={filters.searchQuery}
                onSearchChange={handleSearchChange}
                searchPlaceholder={documentType === 'sales_order'
                  ? 'Search order number or customer name...'
                  : 'Search invoice number or customer name...'}
                showFilterToggle={true}
                showFilters={ui.showFilters}
                onToggleFilters={(show: boolean) => dispatch({ type: 'TOGGLE_SHOW_FILTERS' })}
                onClearFilters={handleClearFilters}
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
              documentType={documentType}
              selectedIds={selectedIds}
              isAllSelected={isAllSelected}
              loading={loading}
              onToggleSelect={handleToggleSelect}
              onToggleSelectAll={handleToggleSelectAll}
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
            </>}
          </div>
        </div>
      </div>

    </div>
  );
};

export default InvoiceList;
