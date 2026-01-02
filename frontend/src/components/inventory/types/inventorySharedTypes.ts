/**
 * Inventory Module - Shared Type Definitions
 * 
 * Common types used across stock, batch, and movement components.
 * Following the same pattern as sales module.
 */

import { LucideIcon } from 'lucide-react';

// ==================== BASE STOCK ITEM ====================

/** Core stock item fields shared across all inventory views */
export interface BaseStockItem {
    product_id: number;
    product_name: string;
    product_code?: string;
    generic_name?: string;
    category?: string;
    manufacturer?: string;
    brand?: string;

    // Stock quantities
    current_stock: number;
    available_stock?: number;
    reserved_stock?: number;

    // Thresholds
    reorder_level?: number;
    minimum_stock_level?: number;
    maximum_stock_level?: number;

    // Pricing
    mrp?: number;
    cost_price?: number;
    purchase_rate?: number;
    selling_rate?: number;
    stock_value?: number;

    // Units
    unit?: string;
    sale_unit?: string;
    purchase_unit?: string;

    // Pack configuration
    pack_size?: number;
    pack_type?: string;
    pack_unit_quantity?: number;
    sub_unit_quantity?: number;

    // Tax
    gst_percent?: number;
    cess_percentage?: number;
    hsn_code?: string;

    // Status flags
    is_active?: boolean;
    low_stock?: boolean;
    out_of_stock?: boolean;
    expiry_alert?: boolean;

    // Metadata
    created_at?: string;
    updated_at?: string;
    last_updated?: string;
}

// ==================== BASE BATCH ====================

/** Core batch fields shared across inventory operations */
export interface BaseBatch {
    batch_id: number;
    batch_number: string;
    product_id: number;
    product_name?: string;

    // Quantities
    quantity_available: number;
    quantity_received?: number;
    quantity_sold?: number;

    // Dates
    expiry_date?: string;
    manufacturing_date?: string;
    mfg_date?: string;
    received_date?: string;

    // Pricing
    mrp?: number;
    mrp_per_unit?: number;
    cost_price?: number;
    sale_price?: number;
    sale_price_per_unit?: number;

    // Metadata
    supplier?: string;
    location?: string;
    warehouse?: string;
    is_active?: boolean;
}

// ==================== STOCK STATUS ====================

/** Stock status levels */
export type StockStatus = 'out_of_stock' | 'low_stock' | 'normal' | 'overstock';

/** Stock status display information */
export interface StockStatusInfo {
    status: StockStatus;
    color: 'red' | 'orange' | 'green' | 'blue' | 'gray';
    text: string;
    icon: LucideIcon;
}

// ==================== BATCH STATUS ====================

/** Batch expiry status */
export type BatchExpiryStatus = 'expired' | 'expiring_soon' | 'near_expiry' | 'normal';

/** Batch status display information */
export interface BatchStatusInfo {
    status: BatchExpiryStatus;
    color: 'red' | 'orange' | 'yellow' | 'green' | 'gray';
    text: string;
    daysRemaining?: number;
}

// ==================== STOCK MOVEMENT ====================

/** Movement types */
export type MovementType =
    | 'receive'
    | 'issue'
    | 'transfer'
    | 'adjustment'
    | 'opening'
    | 'damage'
    | 'expiry';

/** Movement reasons */
export type MovementReason =
    | 'purchase'
    | 'sales_return'
    | 'stock_transfer_in'
    | 'sales'
    | 'purchase_return'
    | 'stock_transfer_out'
    | 'damage'
    | 'expiry'
    | 'theft'
    | 'sample'
    | 'physical_count'
    | 'other';

/** Movement status */
export type MovementStatus =
    | 'draft'
    | 'pending'
    | 'approved'
    | 'completed'
    | 'cancelled';

/** Base stock movement */
export interface BaseStockMovement {
    movement_id?: number;
    movement_type: MovementType;
    movement_date: string;
    movement_status?: MovementStatus;

    // Product/Batch
    product_id: number;
    product_name?: string;
    batch_id?: number;
    batch_number?: string;

    // Quantity
    quantity: number;
    unit?: string;

    // Reason & Notes
    reason?: MovementReason | string;
    notes?: string;
    reference_number?: string;

    // Location
    from_location?: string;
    to_location?: string;
    warehouse?: string;

    // User
    created_by?: string;
    approved_by?: string;

    // Metadata
    created_at?: string;
    updated_at?: string;
}

// ==================== FILTERS ====================

/** Stock filter options */
export interface StockFilters {
    searchQuery?: string;
    category?: string;
    location?: string;
    stockStatus?: 'all' | 'in-stock' | 'out-of-stock' | 'low-stock';
    expiryPeriod?: 'all' | '30' | '60' | '90' | 'expired';
    packType?: string;
    showLowStock?: boolean;
    showExpiring?: boolean;
}

/** Sort configuration */
export interface SortConfig {
    key: string;
    direction: 'asc' | 'desc';
}

// ==================== EXPORT TYPES ====================

/** Export format */
export type ExportFormat = 'csv' | 'pdf' | 'excel';

/** Export configuration */
export interface ExportConfig {
    format: ExportFormat;
    filename?: string;
    title?: string;
    columns?: string[];
    includeHeaders?: boolean;
}

// ==================== PACK BREAKDOWN ====================

/** Pack breakdown result */
export interface PackBreakdown {
    totalUnits: number;
    boxes: number;
    subBoxes: number;
    strips: number;
    remainingUnits: number;
    formatted: string;
}

// ==================== CONSTANTS ====================

/** Movement type constants */
export const MOVEMENT_TYPES = {
    RECEIVE: 'receive' as MovementType,
    ISSUE: 'issue' as MovementType,
    TRANSFER: 'transfer' as MovementType,
    ADJUSTMENT: 'adjustment' as MovementType,
    OPENING: 'opening' as MovementType,
    DAMAGE: 'damage' as MovementType,
    EXPIRY: 'expiry' as MovementType
} as const;

/** Movement status constants */
export const MOVEMENT_STATUS = {
    DRAFT: 'draft' as MovementStatus,
    PENDING: 'pending' as MovementStatus,
    APPROVED: 'approved' as MovementStatus,
    COMPLETED: 'completed' as MovementStatus,
    CANCELLED: 'cancelled' as MovementStatus
} as const;

/** Stock status constants */
export const STOCK_STATUS = {
    OUT_OF_STOCK: 'out_of_stock' as StockStatus,
    LOW_STOCK: 'low_stock' as StockStatus,
    NORMAL: 'normal' as StockStatus,
    OVERSTOCK: 'overstock' as StockStatus
} as const;

/** Batch expiry thresholds (in days) */
export const EXPIRY_THRESHOLDS = {
    EXPIRED: 0,
    EXPIRING_SOON: 30,
    NEAR_EXPIRY: 90,
    NORMAL: 180
} as const;
