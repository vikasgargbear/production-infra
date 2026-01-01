/**
 * Data Sync Service
 * Downloads all data after login for full offline capability
 * 
 * For companies with poor/no WiFi - sync once, work all day offline
 */

import { apiClient, syncApi } from '../../api';
import offlineDB from '../core/offlineDatabase';
import { toast, Id as ToastId } from 'react-toastify';



// ==================== TYPE DEFINITIONS ====================

interface Product {
    product_id: number;
    product_name: string;
    product_code?: string;
    generic_name?: string;
    brand?: string;
    hsn_code?: string;
    category_id?: number;
    gst_percent?: number;
    current_stock?: number;
    is_active?: boolean;
}

interface Batch {
    batch_id: number;
    product_id: number;
    batch_number: string;
    expiry_date?: string;
    manufacturing_date?: string;
    quantity_available?: number;
    units_per_pack?: number;
    packages_per_box?: number;
    mrp_per_unit?: number;
    sale_price_per_unit?: number;
    cost_per_unit?: number;
}

interface Customer {
    customer_id: number;
    customer_name: string;
    customer_code?: string;
    primary_phone?: string;
    primary_email?: string;
    gst_number?: string;
    customer_type?: string;
    credit_limit?: number;
    credit_days?: number;
    current_outstanding?: number;
    customer_category?: string;
    address_line1?: string;
    address_line2?: string;
    city?: string;
    state?: string;
    state_code?: string;
    pincode?: string;
    is_active?: boolean;
}

interface Employee {
    employee_id: number;
    full_name: string;
    employee_code?: string;
    personal_email?: string;
    personal_mobile?: string;
    designation?: string;
    is_active?: boolean;
}

interface SyncResponse {
    products: Product[];
    batches: Batch[];
    customers: Customer[];
    employees: Employee[];
    counts: {
        products: number;
        batches: number;
        customers: number;
        employees: number;
    };
}

interface SyncResult {
    success: boolean;
    reason?: string;
    error?: string;
    counts?: {
        products: number;
        batches: number;
        customers: number;
        employees: number;
    };
}

interface TransformedProduct {
    id: string;
    product_id: string;
    product_name: string;
    product_code?: string;
    generic_name?: string;
    brand?: string;
    hsn_code?: string;
    category_id?: number;
    gst_percent: number;
    current_stock: number;
    is_active?: boolean;
    _search_name: string;
    _search_code: string;
    _search_hsn: string;
}

interface TransformedBatch {
    batch_id: string;
    product_id: string;
    batch_number: string;
    expiry_date?: string;
    manufacturing_date?: string;
    quantity_available: number;
    units_per_pack: number;
    packages_per_box: number;
    mrp_per_unit: number;
    sale_price_per_unit: number;
    cost_per_unit: number;
    quantity_reserved_offline: number;
}

interface TransformedCustomer {
    id: string;
    customer_id: string;
    customer_name: string;
    customer_code?: string;
    primary_phone?: string;
    primary_email?: string;
    gst_number?: string;
    customer_type?: string;
    credit_limit: number;
    credit_days: number;
    current_outstanding: number;
    customer_category?: string;
    address_line1?: string;
    address_line2?: string;
    city?: string;
    state?: string;
    state_code?: string;
    pincode?: string;
    is_active?: boolean;
    _search_name: string;
    _search_phone: string;
    _search_gst: string;
}

interface TransformedEmployee {
    employee_id: string;
    full_name: string;
    employee_code?: string;
    personal_email?: string;
    personal_mobile?: string;
    designation?: string;
    is_active?: boolean;
}

// ==================== SERVICE CLASS ====================

class DataSyncService {
    private syncing: boolean = false;
    private lastSyncTime: number | null = null;

    /**
     * Full sync - downloads all products, batches, customers
     * Called after login to enable offline operation
     */
    async fullSync(): Promise<SyncResult> {
        if (this.syncing) {
            console.log('[DataSync] Sync already in progress');
            return { success: false, reason: 'already_syncing' };
        }

        this.syncing = true;
        console.log('[DataSync] Starting full data sync...');

        try {
            // Initialize IndexedDB
            await offlineDB.init();

            console.log('[DataSync] Fetching data from backend...');

            // Fetch all data from backend
            const response = await syncApi.getFullData() as any; // Cast for now as types are loose

            console.log('[DataSync] Response status:', response.status);
            console.log('[DataSync] Response data:', response.data);

            const { products, batches, customers, employees, counts } = response.data;

            console.log('[DataSync] Received:', counts);

            // Store products
            if (products && products.length > 0) {
                const transformedProducts: TransformedProduct[] = products.map(p => ({
                    id: String(p.product_id),
                    product_id: String(p.product_id),
                    product_name: p.product_name,
                    product_code: p.product_code,
                    generic_name: p.generic_name,
                    brand: p.brand,
                    hsn_code: p.hsn_code,
                    category_id: p.category_id,
                    gst_percent: p.gst_percent || 0,
                    current_stock: p.current_stock || 0,
                    is_active: p.is_active,
                    _search_name: (p.product_name || '').toLowerCase(),
                    _search_code: (p.product_code || '').toLowerCase(),
                    _search_hsn: (p.hsn_code || '').toLowerCase()
                }));

                await offlineDB.bulkLoad('products', transformedProducts);
                console.log(`[DataSync] Stored ${transformedProducts.length} products`);
            }

            // Store batches (CRITICAL for offline invoicing)
            if (batches && batches.length > 0) {
                const transformedBatches: TransformedBatch[] = batches.map(b => ({
                    batch_id: String(b.batch_id),
                    product_id: String(b.product_id),
                    batch_number: b.batch_number,
                    expiry_date: b.expiry_date,
                    manufacturing_date: b.manufacturing_date,
                    quantity_available: b.quantity_available || 0,
                    units_per_pack: b.units_per_pack || 1,
                    packages_per_box: b.packages_per_box || 1,
                    mrp_per_unit: b.mrp_per_unit || 0,
                    sale_price_per_unit: b.sale_price_per_unit || 0,
                    cost_per_unit: b.cost_per_unit || 0,
                    quantity_reserved_offline: 0
                }));

                await offlineDB.storeBatches(transformedBatches);
                console.log(`[DataSync] Stored ${transformedBatches.length} batches`);
            }

            // Store customers
            if (customers && customers.length > 0) {
                const transformedCustomers: TransformedCustomer[] = customers.map(c => ({
                    id: String(c.customer_id),
                    customer_id: String(c.customer_id),
                    customer_name: c.customer_name,
                    customer_code: c.customer_code,
                    primary_phone: c.primary_phone,
                    primary_email: c.primary_email,
                    gst_number: c.gst_number,
                    customer_type: c.customer_type,
                    credit_limit: c.credit_limit || 0,
                    credit_days: c.credit_days || 0,
                    current_outstanding: c.current_outstanding || 0,
                    customer_category: c.customer_category,
                    address_line1: c.address_line1,
                    address_line2: c.address_line2,
                    city: c.city,
                    state: c.state,
                    state_code: c.state_code,
                    pincode: c.pincode,
                    is_active: c.is_active,
                    _search_name: (c.customer_name || '').toLowerCase(),
                    _search_phone: (c.primary_phone || '').replace(/\D/g, ''),
                    _search_gst: (c.gst_number || '').toLowerCase()
                }));

                await offlineDB.bulkLoad('customers', transformedCustomers);
                console.log(`[DataSync] Stored ${transformedCustomers.length} customers`);
            }

            // Store employees (for salesperson selection)
            if (employees && employees.length > 0) {
                const transformedEmployees: TransformedEmployee[] = employees.map(e => ({
                    employee_id: String(e.employee_id),
                    full_name: e.full_name,
                    employee_code: e.employee_code,
                    personal_email: e.personal_email,
                    personal_mobile: e.personal_mobile,
                    designation: e.designation,
                    is_active: e.is_active
                }));

                await offlineDB.bulkLoad('employees', transformedEmployees);
                console.log(`[DataSync] Stored ${transformedEmployees.length} employees`);
            }

            this.lastSyncTime = Date.now();

            // Store sync timestamp
            await offlineDB.update('settings', {
                key: 'lastFullSync',
                value: this.lastSyncTime
            });

            console.log('[DataSync] Full sync completed successfully');

            return {
                success: true,
                counts: {
                    products: products?.length || 0,
                    batches: batches?.length || 0,
                    customers: customers?.length || 0,
                    employees: employees?.length || 0
                }
            };

        } catch (error) {
            console.error('[DataSync] Full sync failed:', error);
            return {
                success: false,
                error: (error as Error).message
            };
        } finally {
            this.syncing = false;
        }
    }

    /**
     * Get last sync status
     */
    async getLastSyncTime(): Promise<number | null> {
        try {
            const setting = await offlineDB.get('settings', 'lastFullSync');
            return setting?.value || null;
        } catch {
            return null;
        }
    }

    /**
     * Check if sync is needed (no data or stale)
     */
    async needsSync(): Promise<boolean> {
        try {
            const products = await offlineDB.getAll('products');
            const batches = await offlineDB.getAll('batches');
            const customers = await offlineDB.getAll('customers');

            // Sync needed if any store is empty
            return products.length === 0 || batches.length === 0 || customers.length === 0;
        } catch {
            return true;
        }
    }

    /**
     * Sync with progress toast
     */
    async syncWithProgress(): Promise<SyncResult> {
        const toastId: ToastId = toast.loading('📥 Syncing data for offline use...', {
            autoClose: false
        });

        try {
            const result = await this.fullSync();

            if (result.success && result.counts) {
                toast.update(toastId, {
                    render: `✅ Synced ${result.counts.products} products, ${result.counts.batches} batches, ${result.counts.customers} customers`,
                    type: 'success',
                    isLoading: false,
                    autoClose: 3000
                });
            } else {
                toast.update(toastId, {
                    render: `⚠️ Sync failed: ${result.error}`,
                    type: 'warning',
                    isLoading: false,
                    autoClose: 5000
                });
            }

            return result;
        } catch (error) {
            toast.update(toastId, {
                render: `❌ Sync error: ${(error as Error).message}`,
                type: 'error',
                isLoading: false,
                autoClose: 5000
            });
            throw error;
        }
    }
}

// Singleton instance
const dataSyncService = new DataSyncService();

export default dataSyncService;

// Expose for debugging (must be after export)
if (typeof window !== 'undefined') {
    (window as any).dataSyncService = dataSyncService;
}

// Re-export types
export type {
    Product,
    Batch,
    Customer,
    Employee,
    SyncResult,
    TransformedProduct,
    TransformedBatch,
    TransformedCustomer,
    TransformedEmployee
};
