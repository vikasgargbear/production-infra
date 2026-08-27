/**
 * PurchaseListHistory Component (REFACTORED)
 * Reduced from 1,073 lines to ~380 lines (65% reduction)
 * 
 * Refactoring changes:
 * - 15 useState → 1 useReducer (via usePurchaseListHistoryState hook)
 * - Extracted types and hook
 * - Cleaner, more maintainable code structure
 */

import React, { useEffect, useCallback, useRef, useState } from 'react';
import {
  Download, Package, RefreshCw, MessageCircle, Mail,
  FileText, ClipboardList, Truck
} from 'lucide-react';
import { Button, StatusBadge, DataTable, Pagination, ModuleHeader, InlineFilterPanel } from '../global';
import { canonicalDocumentHistoryApi, requireCanonicalHistoryAmount } from '../../services/api';
import { formatExactCurrency } from '../../utils/exactDecimal';
import { formatCalendarDate } from '../../utils/calendarDate';

// Import hooks and types
import { usePurchaseListHistoryState } from './purchaselisthistory/hooks/usePurchaseListHistoryState';
import type { PurchaseListHistoryProps, PurchaseOrder } from './purchaselisthistory/types/purchasehistory.types';
import {
  buildPurchaseHistoryParams,
  purchaseHistoryCsv,
  PurchaseDocumentType,
} from './purchaselisthistory/utils/purchaseHistoryProjection';
import { canRecordCanonicalReceipt } from './grn/canonicalReceiptCommand';

// Document type configuration
type DocumentType = PurchaseDocumentType;

const documentTypeConfig = {
  supplier_invoice: {
    label: 'Supplier Invoices',
    singular: 'supplier invoice',
    numberLabel: 'Supplier Invoice #',
    icon: FileText,
    activeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    iconColor: 'text-blue-600'
  },
  purchase_order: {
    label: 'Purchase Orders',
    singular: 'purchase order',
    numberLabel: 'Purchase Order #',
    icon: ClipboardList,
    activeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    iconColor: 'text-blue-600'
  },
  grn: {
    label: 'GRN',
    singular: 'goods receipt',
    numberLabel: 'GRN #',
    icon: Truck,
    activeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    iconColor: 'text-blue-600'
  }
};

const PurchaseListHistory: React.FC<PurchaseListHistoryProps> = ({ onClose, onRecordReceipt }) => {
  // Use centralized state management (replaces 15 useState!)
  const { state, dispatch, purchases, selectedIds, filters, ui, pagination, loading } = usePurchaseListHistoryState();
  const searchTimerRef = useRef<number | undefined>();
  const requestSequenceRef = useRef(0);
  const businessDateRef = useRef<string | null>(null);

  // Document type state - default to supplier_invoice
  const [documentType, setDocumentType] = useState<DocumentType>('supplier_invoice');

  // Fetch documents from backend based on document type
  const fetchDocuments = useCallback(async (page = 1, searchFilters: any = {}, docType: DocumentType = documentType) => {
    const requestSequence = ++requestSequenceRef.current;
    dispatch({ type: 'SET_LOADING', loading: true });
    dispatch({ type: 'SET_ERROR', error: null });

    try {
      const response = await canonicalDocumentHistoryApi.get({
        document_kind: docType === 'grn' ? 'goods_receipt' : docType,
        page,
        page_size: pagination.per_page,
        ...searchFilters,
      });
      const transformedData: PurchaseOrder[] = response.items.map(row => ({
        id: row.document_id,
        po_number: row.document_number,
        po_date: row.document_date,
        supplier_id: row.party_account_id,
        supplier_name: row.party_name,
        total_amount: requireCanonicalHistoryAmount(row.total_amount, `${row.document_kind} total`),
        paid_amount: row.paid_amount,
        pending_amount: row.outstanding_amount,
        payment_status: row.payment_status,
        status: row.status,
        items_count: row.line_count,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }));
      if (requestSequence !== requestSequenceRef.current) return;
      businessDateRef.current = response.business_date;
      dispatch({ type: 'SET_PURCHASES', purchases: transformedData });
      dispatch({ type: 'SET_PAGINATION', pagination: {
        total: response.total, page, total_pages: Math.ceil(response.total / pagination.per_page),
      } });

    } catch (error) {
      if (requestSequence !== requestSequenceRef.current) return;
      console.error(`Failed to fetch ${docType}:`, error);
      dispatch({ type: 'SET_ERROR', error: `Failed to fetch ${documentTypeConfig[docType].label}. Please try again.` });
      dispatch({ type: 'SET_PURCHASES', purchases: [] });
    } finally {
      if (requestSequence === requestSequenceRef.current) {
        dispatch({ type: 'SET_LOADING', loading: false });
      }
    }
  }, [dispatch, pagination.per_page, documentType]);

  // Alias for backward compatibility
  const fetchPurchases = fetchDocuments;

  // Load documents on mount and when document type changes
  useEffect(() => {
    fetchDocuments(1, {}, documentType);
    return () => {
      if (searchTimerRef.current !== undefined) window.clearTimeout(searchTimerRef.current);
      requestSequenceRef.current += 1;
    };
  }, [documentType]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle document type change
  const handleDocumentTypeChange = (type: DocumentType) => {
    setDocumentType(type);
    dispatch({ type: 'CLEAR_SELECTION' });
    dispatch({ type: 'SET_FILTERS', filters: {
      searchQuery: '', statusFilter: 'all', dateFilter: 'all', dateFrom: '', dateTo: ''
    } });
  };

  const buildSearchParams = useCallback((overrides: Partial<typeof filters> = {}) => {
    if (!businessDateRef.current) {
      dispatch({ type: 'SET_ERROR', error: 'Organization business date is unavailable.' });
      return null;
    }
    return buildPurchaseHistoryParams({ ...filters, ...overrides }, documentType, businessDateRef.current);
  }, [dispatch, filters, documentType]);

  const handleRefresh = useCallback(async () => {
    if (searchTimerRef.current !== undefined) {
      window.clearTimeout(searchTimerRef.current);
      searchTimerRef.current = undefined;
    }
    const params = buildSearchParams();
    if (!params) return;
    dispatch({ type: 'SET_REFRESHING', refreshing: true });
    try {
      await fetchDocuments(pagination.page, params, documentType);
    } finally {
      dispatch({ type: 'SET_REFRESHING', refreshing: false });
    }
  }, [buildSearchParams, dispatch, documentType, fetchDocuments, pagination.page]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onClose) onClose();
      if ((event.altKey && event.key.toLowerCase() === 'r') || event.key === 'F5') {
        event.preventDefault();
        handleRefresh();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleRefresh, onClose]);

  const handleSearchChange = (query: string) => {
    dispatch({ type: 'SET_FILTERS', filters: { searchQuery: query } });
    if (searchTimerRef.current !== undefined) window.clearTimeout(searchTimerRef.current);
    requestSequenceRef.current += 1;
    searchTimerRef.current = window.setTimeout(() => {
      searchTimerRef.current = undefined;
      const params = buildSearchParams({ searchQuery: query });
      if (params) fetchDocuments(1, params, documentType);
    }, 500);
  };

  const handleToggleSelect = (id: string) => {
    dispatch({ type: 'TOGGLE_SELECT', id });
  };

  const handleToggleSelectAll = () => {
    const purchaseIds = purchases.map(p => p.id);
    dispatch({ type: 'TOGGLE_SELECT_ALL', purchaseIds });
  };

  const exportRows = (rows: PurchaseOrder[], selected: boolean) => {
    if (rows.length === 0) return;
    const csvContent = purchaseHistoryCsv(
      rows,
      documentTypeConfig[documentType].numberLabel,
    );
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    if (!businessDateRef.current) {
      URL.revokeObjectURL(url);
      dispatch({ type: 'SET_ERROR', error: 'Organization business date is unavailable.' });
      return;
    }
    const scope = selected ? 'selected' : 'page';
    link.download = `${documentTypeConfig[documentType].label.toLowerCase().replace(/\s+/g, '-')}-${scope}-${businessDateRef.current}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPage = () => exportRows(purchases, false);
  const handleExportSelected = () => exportRows(
    purchases.filter(purchase => selectedIds.has(purchase.id)),
    true,
  );

  const filteredPurchases = purchases;
  const isAllSelected = filteredPurchases.length > 0 && filteredPurchases.every(p => selectedIds.has(p.id));
  const selectedCount = Array.from(selectedIds).filter(id => filteredPurchases.some(f => f.id === id)).length;

  // Table columns - MATCHING Invoice History structure exactly
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
      key: 'po_date',
      header: 'Date',
      render: (_: any, purchase: PurchaseOrder) => (
        <div className="text-gray-700">
          {purchase.po_date ? formatCalendarDate(purchase.po_date) : '-'}
        </div>
      ),
      width: '110px'
    },
    {
      key: 'po_number',
      header: documentTypeConfig[documentType].numberLabel,
      render: (_: any, purchase: PurchaseOrder) => (
        <div className="text-sm text-gray-600">{purchase.po_number}</div>
      ),
      width: '140px'
    },
    {
      key: 'supplier_name',
      header: 'Supplier',
      render: (_: any, purchase: PurchaseOrder) => (
        <div>
          <div className="font-medium text-gray-900">{purchase.supplier_name}</div>
          <div className="text-xs text-gray-500">{purchase.items_count} items</div>
        </div>
      ),
      width: '150px'
    },
    {
      key: 'payment_status',
      header: 'Status',
      align: 'center' as const,
      render: (_: any, purchase: PurchaseOrder) => {
        if (documentType !== 'supplier_invoice') {
          const documentStatus = String(purchase.status || 'unknown');
          const statusTone = ['posted', 'received', 'approved'].includes(documentStatus)
            ? 'success'
            : ['cancelled', 'rejected', 'reversed'].includes(documentStatus) ? 'error' : 'info';
          return <StatusBadge status={statusTone} label={documentStatus.replace(/_/g, ' ')} />;
        }
        const statusMap: Record<string, any> = {
          paid: { status: 'success', label: 'Paid' },
          partial: { status: 'warning', label: 'Partial' },
          pending: { status: 'info', label: 'Pending' },
          overdue: { status: 'error', label: 'Overdue' },
          cancelled: { status: 'error', label: 'Cancelled' }
        };
        const config = purchase.payment_status
          ? statusMap[purchase.payment_status] || { status: 'default', label: purchase.payment_status }
          : { status: 'default', label: purchase.status };
        return <StatusBadge status={config.status} label={config.label} />;
      },
      width: '100px'
    },
    {
      key: 'total_amount',
      header: 'Amount',
      align: 'right' as const,
      render: (_: any, purchase: PurchaseOrder) => (
        <span className="font-medium text-gray-900">
          {purchase.total_amount === null ? 'Not available' : formatExactCurrency(purchase.total_amount, 'Purchase history amount')}
        </span>
      ),
      width: '120px'
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'center' as const,
      render: (_: any, purchase: PurchaseOrder) => (
        <div className="flex items-center justify-center space-x-1">
          {/* Canonical receipt is available only after PO approval and until fully received. */}
          {documentType === 'purchase_order' && onRecordReceipt &&
            canRecordCanonicalReceipt(purchase.status) && (
            <button
              onClick={() => onRecordReceipt(purchase.id)}
              aria-label={`Record canonical receipt for purchase order ${purchase.id}`}
              className="min-h-11 px-3 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              title={`Record canonical receipt for ${purchase.po_number}`}
            >
              <Package className="w-3.5 h-3.5 inline mr-1" />
              Receipt
            </button>
          )}
          <button
            onClick={() => {
              const noun = documentTypeConfig[documentType].singular;
              const amount = purchase.total_amount === null
                ? '' : `\nAmount: ${formatExactCurrency(purchase.total_amount, 'Purchase history amount')}`;
              const message = `Dear ${purchase.supplier_name},\n\n${noun[0].toUpperCase()}${noun.slice(1)} ${purchase.po_number}${amount}\n\nThank you!`;
              window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
            }}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
            title="Share via WhatsApp"
            aria-label={`Share ${purchase.po_number} via WhatsApp`}
          >
            <MessageCircle className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              const noun = documentTypeConfig[documentType].singular;
              const subject = `${noun[0].toUpperCase()}${noun.slice(1)} ${purchase.po_number}`;
              const amount = purchase.total_amount === null
                ? '' : `\nAmount: ${formatExactCurrency(purchase.total_amount, 'Purchase history amount')}`;
              const body = `Dear ${purchase.supplier_name},\n\n${subject}${amount}\n\nThank you!`;
              window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
            }}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
            title="Send via Email"
            aria-label={`Email ${purchase.po_number}`}
          >
            <Mail className="w-4 h-4" />
          </button>
        </div>
      ),
      width: '170px'
    }
  ];

  return (
    <div className="h-full bg-gray-50">
      <div className="h-full flex flex-col">

        {/* Header - Using Global ModuleHeader */}
        <ModuleHeader
          title="Purchase History"
          documentNumber=""
          status="active"
          icon={documentTypeConfig[documentType].icon}
          iconColor={documentTypeConfig[documentType].iconColor}
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
              label: "Export Page",
              onClick: handleExportPage,
              variant: "secondary",
              disabled: purchases.length === 0
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

            {/* Filters */}
            <InlineFilterPanel
              searchPlaceholder={`Search ${documentTypeConfig[documentType].label.toLowerCase()} by number, canonical UUID, or supplier...`}
              searchQuery={filters.searchQuery}
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
                  options: documentType === 'supplier_invoice' ? [
                    { value: 'all', label: 'All Status' }, { value: 'paid', label: 'Paid' },
                    { value: 'partial', label: 'Partial' }, { value: 'pending', label: 'Pending' },
                    { value: 'overdue', label: 'Overdue' }, { value: 'cancelled', label: 'Cancelled' }
                  ] : documentType === 'purchase_order' ? [
                    { value: 'all', label: 'All Status' }, { value: 'submitted', label: 'Submitted' },
                    { value: 'approved', label: 'Approved' },
                    { value: 'partially_received', label: 'Partially Received' },
                    { value: 'received', label: 'Received' }, { value: 'cancelled', label: 'Cancelled' }
                  ] : [
                    { value: 'all', label: 'All Status' }, { value: 'posted', label: 'Posted' },
                    { value: 'cancelled', label: 'Cancelled' },
                    { value: 'reversed', label: 'Reversed' }
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
                if (searchTimerRef.current !== undefined) {
                  window.clearTimeout(searchTimerRef.current);
                  searchTimerRef.current = undefined;
                }
                const nextFilters = {
                  dateFilter: String(newFilters.date_preset || 'all'),
                  statusFilter: String(newFilters.payment_status || 'all'),
                  dateFrom: String(newFilters.dateFrom || ''),
                  dateTo: String(newFilters.dateTo || ''),
                };
                dispatch({ type: 'SET_FILTERS', filters: nextFilters });
                const params = buildSearchParams(nextFilters);
                if (params) fetchPurchases(1, params, documentType);
              }}
              onSearchChange={handleSearchChange}
              showFilters={ui.showFilters}
              onToggleFilters={() => dispatch({ type: 'TOGGLE_SHOW_FILTERS' })}
            />

            {/* Bulk Actions */}
            {selectedCount > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-blue-900">
                    {selectedCount} purchase{selectedCount > 1 ? 's' : ''} selected
                  </span>
                  <Button variant="outline" size="sm" onClick={handleExportSelected}>
                    <Download className="w-4 h-4 mr-2" />
                    Export Selected
                  </Button>
                </div>
              </div>
            )}

            {/* Table */}
            {state.error && (
              <div className="mb-4 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
                {state.error}
              </div>
            )}
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
                  onPageChange={(page) => {
                    if (searchTimerRef.current !== undefined) {
                      window.clearTimeout(searchTimerRef.current);
                      searchTimerRef.current = undefined;
                    }
                    const params = buildSearchParams();
                    if (params) fetchPurchases(page, params);
                  }}
                  itemsPerPage={pagination.per_page}
                  totalItems={pagination.total}
                  onItemsPerPageChange={(perPage) => {
                    if (searchTimerRef.current !== undefined) {
                      window.clearTimeout(searchTimerRef.current);
                      searchTimerRef.current = undefined;
                    }
                    dispatch({ type: 'SET_PAGINATION', pagination: { per_page: perPage, page: 1 } });
                    const params = buildSearchParams();
                    if (params) fetchPurchases(1, params);
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
