/**
 * Master Module - Shared Type Definitions
 * 
 * Common types for master data entities (customers, suppliers, products, etc.)
 */

// ==================== ENTITY STATUS ====================

/** Common entity status */
export type EntityStatus = 'active' | 'inactive' | 'suspended' | 'deleted';

// ==================== CUSTOMER ====================

/** Base customer fields - aligned with backend schema */
export interface BaseCustomer {
    customer_id: number;
    customer_name: string;
    customer_code?: string;
    customer_type?: 'retail' | 'wholesale' | 'dealer' | 'hospital' | 'institution';

    // Contact - backend uses primary_phone and contact_person
    contact_person?: string;
    primary_phone?: string;
    secondary_phone?: string;
    whatsapp_number?: string;
    email?: string;
    contact_person_phone?: string;
    contact_person_email?: string;

    // Address
    address?: string;
    address_line1?: string;
    address_line2?: string;
    city?: string;
    state?: string;
    pincode?: string;

    // Tax info - backend uses pan_number
    gst_number?: string;
    pan_number?: string;
    drug_license_number?: string;

    // Credit
    credit_days?: number;
    credit_limit?: number;
    balance?: number;
    outstanding?: number;

    // Status
    is_active?: boolean;
    status?: EntityStatus;

    // Metadata
    created_at?: string;
    updated_at?: string;
}

// ==================== SUPPLIER ====================

/** Base supplier fields - aligned with backend schema */
export interface BaseSupplier {
    supplier_id: number;
    supplier_name: string;
    supplier_code?: string;
    supplier_type?: 'manufacturer' | 'distributor' | 'wholesaler' | 'importer';

    // Contact - backend uses primary_phone and contact_person
    contact_person?: string;
    primary_phone?: string;
    secondary_phone?: string;
    email?: string;

    // Address
    address?: string;
    address_line1?: string;
    address_line2?: string;
    city?: string;
    state?: string;
    pincode?: string;

    // Tax info - backend uses pan_number
    gst_number?: string;
    pan_number?: string;
    drug_license_number?: string;

    // Credit
    credit_days?: number;
    credit_limit?: number;
    balance?: number;
    outstanding?: number;

    // Status
    is_active?: boolean;
    status?: EntityStatus;

    // Metadata
    created_at?: string;
    updated_at?: string;
}

// ==================== PRODUCT ====================

/** Base product fields */
export interface BaseProduct {
    product_id: number;
    product_name: string;
    product_code?: string;
    generic_name?: string;

    // Category
    category_id?: number;
    category_name?: string;
    manufacturer?: string;
    brand?: string;

    // Pricing
    mrp?: number;
    cost_per_unit?: number;
    selling_price?: number;

    // Pack config
    pack_size?: number;
    pack_type?: string;
    units_per_pack?: number;

    // Tax
    gst_percent?: number;
    hsn_code?: string;

    // Stock levels
    reorder_level?: number;
    min_stock?: number;
    max_stock?: number;

    // Status
    is_active?: boolean;
    status?: EntityStatus;

    // Metadata
    created_at?: string;
    updated_at?: string;
}

// ==================== UNIT ====================

/** Base unit/UOM fields */
export interface BaseUnit {
    unit_id: number;
    unit_name: string;
    unit_code: string;
    unit_type?: 'base' | 'pack' | 'box';
    conversion_factor?: number;
    is_active?: boolean;
}

// ==================== TAX ====================

/** Tax configuration */
export interface TaxConfig {
    tax_id: number;
    tax_name: string;
    tax_percent: number;
    tax_type: 'gst' | 'cess' | 'custom';
    cgst_percent?: number;
    sgst_percent?: number;
    igst_percent?: number;
    hsn_code?: string;
    is_active?: boolean;
}

// ==================== WAREHOUSE ====================

/** Base warehouse fields */
export interface BaseWarehouse {
    warehouse_id: number;
    warehouse_name: string;
    warehouse_code?: string;
    address?: string;
    city?: string;
    state?: string;
    is_primary?: boolean;
    is_active?: boolean;
}

// ==================== CONSTANTS ====================

export const ENTITY_STATUS = {
    ACTIVE: 'active' as EntityStatus,
    INACTIVE: 'inactive' as EntityStatus,
    SUSPENDED: 'suspended' as EntityStatus,
    DELETED: 'deleted' as EntityStatus
} as const;

export const CUSTOMER_TYPES = ['retail', 'wholesale', 'dealer', 'hospital', 'institution'] as const;
export const SUPPLIER_TYPES = ['manufacturer', 'distributor', 'wholesaler', 'importer'] as const;
