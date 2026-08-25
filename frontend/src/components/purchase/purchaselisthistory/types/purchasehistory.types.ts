/**
 * PurchaseListHistory Types
 * Type definitions for purchase history listing and management
 */

export interface PurchaseOrder {
    id: string;
    po_number: string;
    po_date: string;
    supplier_id: string;
    supplier_name: string;
    total_amount: string | null;
    paid_amount: string | null;
    pending_amount: string | null;
    payment_status: 'paid' | 'partial' | 'pending' | 'overdue' | 'cancelled' | null;
    status: string;
    items_count: number;
    created_at: string;
    updated_at: string;
}

export interface PurchaseListHistoryProps {
    onClose?: () => void;
    onRecordReceipt?: (poId: string) => void;
}

export interface PurchaseFiltersProps {
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
}

export interface PurchaseHistoryTableProps {
    purchases: PurchaseOrder[];
    selectedIds: Set<string>;
    isAllSelected: boolean;
    loading: boolean;
    onToggleSelect: (id: string) => void;
    onToggleSelectAll: () => void;
    onViewPurchase: (purchase: PurchaseOrder) => void;
}

export interface PurchaseBulkActionsProps {
    selectedCount: number;
    onExport: () => void;
    onClear: () => void;
}

export interface PurchaseListHistoryState {
    purchases: PurchaseOrder[];
    selectedIds: Set<string>;
    filters: {
        searchQuery: string;
        dateFilter: string;
        statusFilter: string;
        dateFrom: string;
        dateTo: string;
    };
    ui: {
        showFilters: boolean;
        refreshing: boolean;
        exporting: boolean;
    };
    pagination: {
        total: number;
        page: number;
        per_page: number;
        total_pages: number;
    };
    loading: boolean;
    error: string | null;
}
