/**
 * Inventory Module - Shared Type Definitions
 * 
 * Common types used across stock, batch, and movement components.
 * Following the same pattern as sales module.
 */

import { LucideIcon } from 'lucide-react';

// ==================== BASE STOCK ITEM ====================

/** 
 * Core stock item fields shared across all inventory views 
 * CANONICAL NAMES from inventory.products and inventory.batches
 */
export interface BaseStockItem {
    product_id: number;
    product_name: string;
    product_code?: string;
    generic_name?: string;
    category?: string;
    manufacturer?: string;
    brand?: string;

    // Stock quantities - Product level aggregates
    total_quantity_available: number; // PRODUCT-LEVEL: sum of all batches (not total_quantity_available)
    total_quantity_reserved?: number; // PRODUCT-LEVEL: sum reserved across batches
    total_quantity_quarantine?: number; // PRODUCT-LEVEL: sum quarantine

    // Thresholds - CANONICAL from inventory.products
    reorder_level?: number;
    min_stock_quantity?: number;      // CANONICAL (not minimum_stock_level)
    max_stock_quantity?: number;      // CANONICAL (not maximum_stock_level)

    // Pricing - use _per_unit suffix for batch-level pricing
    mrp_per_unit?: number;            // CANONICAL batch MRP
    cost_per_unit?: number;           // CANONICAL batch cost
    sale_price_per_unit?: number;     // CANONICAL batch selling price
    stock_value?: number;

    // Units
    unit?: string;
    base_uom?: string;                // CANONICAL from inventory.batches
    pack_uom?: string;                // CANONICAL from inventory.batches

    // Pack configuration - CANONICAL from inventory.batches
    pack_size?: number;
    pack_type?: string;
    units_per_pack?: number;          // CANONICAL (not pack_unit_quantity)
    packages_per_box?: number;        // CANONICAL

    // Tax
    gst_percent?: number;
    cess_percentage?: number;
    hsn_code?: string;

    // Status flags
    is_active?: boolean;
    low_stock?: boolean;              // computed flag
    out_of_stock?: boolean;           // computed flag
    expiry_alert?: boolean;           // computed flag

    // Metadata
    created_at?: string;
    updated_at?: string;
}

/** 
 * Core batch fields shared across inventory operations 
 * CANONICAL NAMES from inventory.batches
 */
export interface BaseBatch {
    batch_id: number;
    batch_number: string;              // CANONICAL (not batch_number)
    product_id: number;
    product_name?: string;

    // Quantities - CANONICAL
    quantity_available: number;        // CANONICAL
    quantity_reserved?: number;        // CANONICAL
    quantity_quarantine?: number;      // CANONICAL
    initial_quantity?: number;         // CANONICAL

    // Dates - CANONICAL
    expiry_date?: string;              // CANONICAL
    manufacturing_date?: string;       // CANONICAL (NOT manufacturing_date)

    // Pricing - CANONICAL with _per_unit suffix
    mrp_per_unit: number;              // CANONICAL (not mrp)
    cost_per_unit?: number;            // CANONICAL (not cost_per_unit)
    sale_price_per_unit?: number;      // CANONICAL (not sale_price)

    // Storage - CANONICAL
    storage_location?: string;         // CANONICAL (not location)
    storage_condition?: string;        // CANONICAL
    supplier_id?: number;              // CANONICAL
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
