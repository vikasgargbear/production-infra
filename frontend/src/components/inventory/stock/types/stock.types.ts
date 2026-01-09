/**
 * Stock Component Type Definitions
 * Extracted from CurrentStock.tsx
 */

import React from 'react';

// ============================================================================
// Base Types (Already exist in parent, we reference them)
// ============================================================================

export interface StockItem {
    product_id: number;
    product_name: string;
    product_code?: string;
    generic_name?: string;
    category?: string;
    product_type?: string;
    product_class?: string;
    manufacturer?: string;
    brand?: string;
    hsn_code?: string;
    unit?: string;
    total_quantity_available: number;
    total_quantity_reserved?: number;
    available_stock?: number;
    reserved_stock?: number;
    mrp_per_unit?: number;
    cost_per_unit?: number;
    sale_price_per_unit?: number;
    reorder_level?: number;
    low_stock?: boolean;
    expiry_alert?: boolean;
    total_batches?: number;
    expired_batches?: number;
    near_expiry_batches?: number;
    total_value?: number;
    stock_value?: number;
    batches?: any[];
    batch_count?: number;
    drug_schedule?: string;
    prescription_required?: boolean;
    is_narcotic?: boolean;
    is_controlled_substance?: boolean;
    stock_status?: 'out_of_stock' | 'low_stock' | 'normal';
    storage_conditions?: string;
    requires_cold_chain?: boolean;
    pack_type?: string;
    pack_size?: string;
    pack_unit_quantity?: number;
    sub_unit_quantity?: number;
    purchase_unit?: string;
    sale_unit?: string;
}

export interface StockFilters {
    category: string;
    location: string;
    showLowStock: boolean;
    showExpiring: boolean;
    dateFilter: string;
    stockStatus: string;
    expiryPeriod: string;
    packType: string;
    searchQuery?: string;
}

export interface SortConfig {
    key: string;
    direction: 'asc' | 'desc';
}

// ============================================================================
// Component Props
// ============================================================================

export interface CurrentStockProps {
    open?: boolean;
    onClose?: () => void;
}

export interface StockFiltersProps {
    filters: StockFilters;
    onFilterChange: (filters: Partial<StockFilters>) => void;
    onRefresh: () => void;
    refreshing: boolean;
    lowStockCount: number;
    expiringCount: number;
}

export interface StockTableProps {
    data: StockItem[];
    loading: boolean;
    sortConfig: SortConfig;
    onSort: (key: string) => void;
    onViewDetails: (item: StockItem) => void;
    onEdit: (item: StockItem) => void;
    selectedIds: Set<number>;
    onSelectionChange: (ids: Set<number>) => void;
}

export interface StockActionsProps {
    selectedCount: number;
    onExport: () => void;
    onPrint: () => void;
    onWhatsApp: () => void;
}

export interface StockDetailModalProps {
    item: StockItem | null;
    open: boolean;
    onClose: () => void;
}

// ============================================================================
// State Management Types
// ============================================================================

export interface StockUIState {
    searchQuery: string;
    selectedCategory: string;
    selectedLocation: string;
    showLowStock: boolean;
    showExpiring: boolean;
    dateFilter: string;
    sortConfig: SortConfig;
    showDetails: boolean;
    showEditModal: boolean;
    showMoreFilters: boolean;
    showHelpModal: boolean;
    moreFilters: {
        stockStatus: string;
        expiryPeriod: string;
        packType: string;
    };
}

export interface StockDataState {
    stockData: StockItem[];
    allProducts: StockItem[];
    selectedProduct: StockItem | null;
    editingProduct: StockItem | null;
    selectedIds: Set<number>;
}

export interface StockAsyncState {
    loading: boolean;
    loadingMore: boolean;
    error: string | null;
    refreshing: boolean;
    currentPage: number;
    hasMore: boolean;
}

export interface StockState {
    ui: StockUIState;
    data: StockDataState;
    async: StockAsyncState;
}
