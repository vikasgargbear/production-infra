/**
 * InvoiceList Types
 * Type definitions for invoice listing and management
 */

// ============================================================================
// Core Entity Types
// ============================================================================

export interface Invoice {
    id: string;
    invoice_number: string;
    invoice_date: string;
    due_date: string;
    customer_id: string;
    customer_name: string;
    total_amount: number;
    paid_amount: number;
    pending_amount: number;
    payment_status: 'paid' | 'partial' | 'pending' | 'overdue' | 'cancelled';
    items_count: number;
    created_at: string;
    updated_at: string;
}

// ============================================================================
// Component Props
// ============================================================================

export interface InvoiceListProps {
    onClose?: () => void;
}

export interface InvoiceFiltersProps {
    searchQuery: string;
    dateFilter: string;
    statusFilter: string;
    showFilters: boolean;
    onSearchChange: (query: string) => void;
    onDateFilterChange: (filter: string) => void;
    onStatusFilterChange: (status: string) => void;
    onToggleFilters: () => void;
    onRefresh: () => void;
    refreshing: boolean;
    refreshSuccess: boolean;
}

export interface InvoiceTableProps {
    invoices: Invoice[];
    selectedIds: Set<string>;
    isAllSelected: boolean;
    loading: boolean;
    onToggleSelect: (id: string) => void;
    onToggleSelectAll: () => void;
    onViewInvoice: (invoice: Invoice) => void;
    onPrintInvoice: (invoice: Invoice) => void;
    onCancelInvoice?: (invoice: Invoice) => void;
}

export interface InvoiceBulkActionsProps {
    selectedCount: number;
    onMarkPaid: () => void;
    onSendReminder: () => void;
    onExport: () => void;
    onClear: () => void;
}

export interface InvoicePaginationProps {
    currentPage: number;
    totalPages: number;
    perPage: number;
    total: number;
    onPageChange: (page: number) => void;
    onPerPageChange: (perPage: number) => void;
}

// ============================================================================
// State Management Types
// ============================================================================

export interface InvoiceFilters {
    searchQuery: string;
    dateFilter: string;
    statusFilter: string;
}

export interface InvoiceUIState {
    showFilters: boolean;
    refreshing: boolean;
    exporting: boolean;
    refreshSuccess: boolean;
    exportSuccess: boolean;
}

export interface InvoicePagination {
    total: number;
    page: number;
    per_page: number;
    total_pages: number;
}

export interface InvoiceListState {
    invoices: Invoice[];
    selectedIds: Set<string>;
    filters: InvoiceFilters;
    ui: InvoiceUIState;
    pagination: InvoicePagination;
    loading: boolean;
    error: string | null;
}
