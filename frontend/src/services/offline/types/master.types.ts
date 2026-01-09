/**
 * Master Module Offline Types
 * 
 * Type definitions for master data (employees, warehouses, categories, etc.)
 */

// ============================================
// EMPLOYEE TYPES
// ============================================

export interface OfflineEmployee {
    employee_id: string;
    employee_code?: string;
    employee_name: string;
    designation?: string;
    department?: string;
    phone?: string;
    email?: string;
    is_active: boolean;

    // Search optimization
    _search_name?: string;
    _search_phone?: string;

    // Sync metadata
    sync_status?: 'synced' | 'pending' | 'error';
    last_synced_at?: string;
}

// ============================================
// WAREHOUSE TYPES
// ============================================

export interface OfflineWarehouse {
    warehouse_id: string;
    warehouse_code?: string;
    warehouse_name: string;
    location?: string;
    address?: string;
    is_active: boolean;

    // Sync metadata
    sync_status?: 'synced' | 'pending' | 'error';
    last_synced_at?: string;
}

// ============================================
// CATEGORY TYPES
// ============================================

export interface OfflineCategory {
    category_id: string;
    category_name: string;
    parent_category_id?: string;
    description?: string;
    is_active: boolean;

    // Sync metadata
    sync_status?: 'synced' | 'pending' | 'error';
    last_synced_at?: string;
}

// ============================================
// MANUFACTURER TYPES
// ============================================

export interface OfflineManufacturer {
    manufacturer_id: string;
    manufacturer_name: string;
    contact_person?: string;
    phone?: string;
    email?: string;
    is_active: boolean;

    // Search optimization
    _search_name?: string;

    // Sync metadata
    sync_status?: 'synced' | 'pending' | 'error';
    last_synced_at?: string;
}

// ============================================
// SYNC STATE TYPES
// ============================================

export interface MasterSyncState {
    phase: 'idle' | 'syncing-employees' | 'syncing-warehouses' | 'syncing-categories' | 'warming-cache' | 'complete' | 'error';
    progress: number;
    isReady: boolean;
    lastSync: string | null;
    error: string | null;
}

export const DEFAULT_MASTER_SYNC_STATE: MasterSyncState = {
    phase: 'idle',
    progress: 0,
    isReady: false,
    lastSync: null,
    error: null
};
