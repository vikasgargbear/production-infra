/**
 * Data Sync Service
 * Downloads all data after login for full offline capability
 * 
 * For companies with poor/no WiFi - sync once, work all day offline
 */

import { apiClient } from '../api';
import offlineDB from './offlineDatabase';
import { toast } from 'react-toastify';

class DataSyncService {
    constructor() {
        this.syncing = false;
        this.lastSyncTime = null;
    }

    /**
     * Full sync - downloads all products, batches, customers
     * Called after login to enable offline operation
     * 
     * @returns {Promise<{success: boolean, counts: object}>}
     */
    async fullSync() {
        if (this.syncing) {
            console.log('[DataSync] Sync already in progress');
            return { success: false, reason: 'already_syncing' };
        }

        this.syncing = true;
        console.log('[DataSync] Starting full data sync...');

        try {
            // Initialize IndexedDB
            await offlineDB.init();

            // Fetch all data from backend
            const response = await apiClient.get('/sync/full-data');
            const { products, batches, customers, employees, counts } = response.data;

            console.log('[DataSync] Received:', counts);

            // Store products
            if (products && products.length > 0) {
                const transformedProducts = products.map(p => ({
                    id: String(p.product_id),
                    product_id: String(p.product_id),
                    product_name: p.product_name,
                    product_code: p.product_code,
                    hsn_code: p.hsn_code,
                    category: p.category,
                    mrp: p.mrp,
                    selling_price: p.selling_price,
                    gst_percent: p.gst_percent,
                    current_stock: p.current_stock,
                    is_active: p.is_active,
                    // Search fields
                    _search_name: (p.product_name || '').toLowerCase(),
                    _search_code: (p.product_code || '').toLowerCase(),
                    _search_hsn: (p.hsn_code || '').toLowerCase()
                }));

                await offlineDB.bulkLoad('products', transformedProducts);
                console.log(`[DataSync] Stored ${transformedProducts.length} products`);
            }

            // Store batches (CRITICAL for offline invoicing)
            if (batches && batches.length > 0) {
                const transformedBatches = batches.map(b => ({
                    batch_id: String(b.batch_id), // Convert to string for consistent lookup
                    product_id: String(b.product_id),
                    batch_number: b.batch_number,
                    expiry_date: b.expiry_date,
                    manufacturing_date: b.manufacturing_date,
                    quantity_available: b.quantity_available,
                    mrp: b.mrp,
                    selling_price: b.selling_price,
                    cost_per_unit: b.cost_per_unit,
                    quantity_reserved_offline: 0 // Initialize reservation tracking
                }));

                await offlineDB.storeBatches(transformedBatches);
                console.log(`[DataSync] Stored ${transformedBatches.length} batches`);
            }

            // Store customers
            if (customers && customers.length > 0) {
                const transformedCustomers = customers.map(c => ({
                    id: String(c.customer_id),
                    customer_id: String(c.customer_id),
                    customer_name: c.customer_name,
                    customer_code: c.customer_code,
                    phone: c.phone,
                    email: c.email,
                    gst_number: c.gst_number,
                    address: c.address,
                    city: c.city,
                    state: c.state,
                    customer_type: c.customer_type,
                    is_active: c.is_active,
                    // Search fields  
                    _search_name: (c.customer_name || '').toLowerCase(),
                    _search_phone: (c.phone || '').replace(/\D/g, ''),
                    _search_gst: (c.gst_number || '').toLowerCase()
                }));

                await offlineDB.bulkLoad('customers', transformedCustomers);
                console.log(`[DataSync] Stored ${transformedCustomers.length} customers`);
            }

            // Store employees (for salesperson selection)
            if (employees && employees.length > 0) {
                const transformedEmployees = employees.map(e => ({
                    employee_id: String(e.employee_id),
                    full_name: e.full_name,
                    employee_code: e.employee_code,
                    email: e.email,
                    phone: e.phone,
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
                error: error.message
            };
        } finally {
            this.syncing = false;
        }
    }

    /**
     * Get last sync status
     */
    async getLastSyncTime() {
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
    async needsSync() {
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
    async syncWithProgress() {
        const toastId = toast.loading('📥 Syncing data for offline use...', {
            autoClose: false
        });

        try {
            const result = await this.fullSync();

            if (result.success) {
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
                render: `❌ Sync error: ${error.message}`,
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

// Expose for debugging
if (typeof window !== 'undefined') {
    window.dataSyncService = dataSyncService;
}

export default dataSyncService;
