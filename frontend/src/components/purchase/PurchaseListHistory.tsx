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
import { supplierInvoicesApi, purchasesApi, grnApi } from '../../services/api';

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

  // Document type state - default to supplier_invoice
  const [documentType, setDocumentType] = useState<DocumentType>('supplier_invoice');

  // Fetch documents from backend based on document type
  const fetchDocuments = useCallback(async (page = 1, searchFilters: any = {}, docType: DocumentType = documentType) => {
    dispatch({ type: 'SET_LOADING', loading: true });
    dispatch({ type: 'SET_ERROR', error: null });

    try {
      const pageOffset = (page - 1) * pagination.per_page;
      const searchParams: any = {
        limit: pagination.per_page,
        ...(docType === 'purchase_order' ? { offset: pageOffset } : { skip: pageOffset }),
        ...searchFilters
      };

      if (searchFilters.search?.trim()) {
        searchParams.search = searchFilters.search.trim();
      }

      let response;
      let transformedData: PurchaseOrder[] = [];

      if (docType === 'supplier_invoice') {
        response = await supplierInvoicesApi.getAll(searchParams);
        const responseData = response?.data;
        const invoicesData = Array.isArray(responseData) ? responseData :
          (responseData?.invoices || []);

        transformedData = invoicesData.map((invoice: any) => ({
          id: String(invoice.supplier_invoice_id),
          po_number: invoice.invoice_number,
          po_date: invoice.invoice_date,
          supplier_id: String(invoice.supplier_id),
          supplier_name: invoice.supplier_name,
          total_amount: Number(invoice.invoice_total || invoice.total_amount || 0),
          paid_amount: Number(invoice.paid_amount || 0),
          pending_amount: Number(invoice.pending_amount ?? ((invoice.invoice_total || invoice.total_amount || 0) - (invoice.paid_amount || 0))),
          payment_status: invoice.payment_status || 'pending',
          status: invoice.status || 'confirmed',
          items_count: invoice.items_count || 0,
          created_at: invoice.created_at,
          updated_at: invoice.updated_at
        }));

        const total = responseData?.total || transformedData.length;
        dispatch({ type: 'SET_PURCHASES', purchases: transformedData });
        dispatch({
          type: 'SET_PAGINATION',
          pagination: { total, page, total_pages: Math.ceil(total / pagination.per_page) }
        });

      } else if (docType === 'purchase_order') {
        response = await purchasesApi.getOrders(searchParams);
        const responseData = response?.data;
        const ordersData = Array.isArray(responseData) ? responseData :
          (responseData?.orders || responseData?.purchases || []);

        transformedData = ordersData.map((order: any) => ({
          id: String(order.po_id || order.purchase_order_id),
          po_number: order.po_number || order.order_number,
          po_date: order.po_date || order.order_date,
          supplier_id: String(order.supplier_id),
          supplier_name: order.supplier_name,
          total_amount: Number(order.total_amount || order.final_amount || 0),
          paid_amount: Number(order.paid_amount || 0),
          pending_amount: Number(order.pending_amount || 0),
          payment_status: order.payment_status || 'pending',
          status: order.status || order.po_status || 'draft',
          items_count: order.items_count || order.items?.length || 0,
          created_at: order.created_at,
          updated_at: order.updated_at
        }));

        const total = responseData?.total || transformedData.length;
        dispatch({ type: 'SET_PURCHASES', purchases: transformedData });
        dispatch({
          type: 'SET_PAGINATION',
          pagination: { total, page, total_pages: Math.ceil(total / pagination.per_page) }
        });

      } else if (docType === 'grn') {
        response = await grnApi.getAll(searchParams);
        const responseData = response?.data;
        const grnData = Array.isArray(responseData) ? responseData :
          (responseData?.grns || responseData?.data || []);

        transformedData = grnData.map((grn: any) => ({
          id: String(grn.grn_id),
          po_number: grn.grn_number,
          po_date: grn.grn_date,
          supplier_id: String(grn.supplier_id),
          supplier_name: grn.supplier_name,
          total_amount: Number(grn.total_amount || 0),
          paid_amount: 0,
          pending_amount: Number(grn.total_amount || 0),
          payment_status: 'pending',
          status: grn.grn_status,
          items_count: grn.items_count || grn.items?.length || 0,
          created_at: grn.created_at,
          updated_at: grn.updated_at
        }));

        const total = responseData?.total || transformedData.length;
        dispatch({ type: 'SET_PURCHASES', purchases: transformedData });
        dispatch({
          type: 'SET_PAGINATION',
          pagination: { total, page, total_pages: Math.ceil(total / pagination.per_page) }
        });
      }

    } catch (error) {
      console.error(`Failed to fetch ${docType}:`, error);
      dispatch({ type: 'SET_ERROR', error: `Failed to fetch ${documentTypeConfig[docType].label}. Please try again.` });
      dispatch({ type: 'SET_PURCHASES', purchases: [] });
    } finally {
      dispatch({ type: 'SET_LOADING', loading: false });
    }
  }, [dispatch, pagination.per_page, documentType]);

  // Alias for backward compatibility
  const fetchPurchases = fetchDocuments;

  // Load documents on mount and when document type changes
  useEffect(() => {
    fetchDocuments(1, {}, documentType);
  }, [documentType]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle document type change
  const handleDocumentTypeChange = (type: DocumentType) => {
    setDocumentType(type);
    dispatch({ type: 'CLEAR_SELECTION' });
    dispatch({ type: 'SET_FILTERS', filters: {
      searchQuery: '', statusFilter: 'all', dateFilter: 'all', dateFrom: '', dateTo: ''
    } });
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
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Event handlers
  const handleRefresh = async () => {
    dispatch({ type: 'SET_REFRESHING', refreshing: true });

    try {
      await fetchDocuments(pagination.page, buildSearchParams(), documentType);
    } finally {
      dispatch({ type: 'SET_REFRESHING', refreshing: false });
    }
  };

  const buildSearchParams = useCallback((overrides: Partial<typeof filters> = {}) => (
    buildPurchaseHistoryParams({ ...filters, ...overrides }, documentType)
  ), [filters, documentType]);

  const handleSearchChange = (query: string) => {
    dispatch({ type: 'SET_FILTERS', filters: { searchQuery: query } });
    if (searchTimerRef.current !== undefined) window.clearTimeout(searchTimerRef.current);
    searchTimerRef.current = window.setTimeout(() => {
      fetchDocuments(1, buildSearchParams({ searchQuery: query }), documentType);
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
    const selected = selectedIds.size > 0
      ? purchases.filter(p => selectedIds.has(p.id))
      : purchases;
    if (selected.length === 0) return;
    const csvContent = purchaseHistoryCsv(
      selected as unknown as Array<Record<string, unknown>>,
      documentTypeConfig[documentType].numberLabel,
    );
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${documentTypeConfig[documentType].label.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

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
          {purchase.po_date ? new Date(purchase.po_date).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
          }) : '-'}
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
          overdue: { status: 'error', label: 'Overdue' }
        };
        const config = statusMap[purchase.payment_status] || { status: 'default', label: purchase.payment_status };
        return <StatusBadge status={config.status} label={config.label} />;
      },
      width: '100px'
    },
    {
      key: 'total_amount',
      header: 'Amount',
      align: 'right' as const,
      render: (_: any, purchase: PurchaseOrder) => (
        <span className="font-medium text-gray-900">₹{purchase.total_amount.toLocaleString('en-IN')}</span>
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
              const message = `Dear ${purchase.supplier_name},\n\n${noun[0].toUpperCase()}${noun.slice(1)} ${purchase.po_number}\nAmount: ₹${purchase.total_amount.toLocaleString('en-IN')}\n\nThank you!`;
              window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
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
              const body = `Dear ${purchase.supplier_name},\n\n${subject}\nAmount: ₹${purchase.total_amount.toLocaleString('en-IN')}\n\nThank you!`;
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
              label: "Export All",
              onClick: handleExport,
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
              searchPlaceholder={`Search ${documentTypeConfig[documentType].label.toLowerCase()} by number or supplier...`}
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
                    { value: 'overdue', label: 'Overdue' }
                  ] : documentType === 'purchase_order' ? [
                    { value: 'all', label: 'All Status' }, { value: 'draft', label: 'Draft' },
                    { value: 'submitted', label: 'Submitted' }, { value: 'approved', label: 'Approved' },
                    { value: 'partially_received', label: 'Partially Received' },
                    { value: 'received', label: 'Received' }, { value: 'cancelled', label: 'Cancelled' }
                  ] : [
                    { value: 'all', label: 'All Status' }, { value: 'draft', label: 'Draft' },
                    { value: 'submitted', label: 'Submitted' }, { value: 'inspected', label: 'Inspected' },
                    { value: 'approved', label: 'Approved' }, { value: 'posted', label: 'Posted' },
                    { value: 'rejected', label: 'Rejected' }, { value: 'cancelled', label: 'Cancelled' },
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
                const nextFilters = {
                  dateFilter: String(newFilters.date_preset || 'all'),
                  statusFilter: String(newFilters.payment_status || 'all'),
                  dateFrom: String(newFilters.dateFrom || ''),
                  dateTo: String(newFilters.dateTo || ''),
                };
                dispatch({ type: 'SET_FILTERS', filters: nextFilters });
                fetchPurchases(1, buildSearchParams(nextFilters), documentType);
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
                  <Button variant="outline" size="sm" onClick={handleExport}>
                    <Download className="w-4 h-4 mr-2" />
                    Export
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
