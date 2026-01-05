/**
 * Delta Sync Service
 * 
 * Action-driven incremental synchronization.
 * Call after specific actions to sync only changed data.
 * 
 * USAGE:
 * - After invoice: deltaSyncService.afterInvoiceCreated()
 * - After GRN: deltaSyncService.afterGRNApproved()
 * - After customer created: deltaSyncService.afterCustomerCreated()
 * - Manual: deltaSyncService.syncTables(['products', 'batches'])
 * - Background: deltaSyncService.startBackgroundSync()
 * 
 * This is MUCH faster than full sync as it only fetches changed records.
 */

import offlineDB from '../core/offlineDatabase';
import { syncApi, DeltaSyncResponse } from '../../api/modules/system/sync.api';

// ==================== TYPES ====================

export interface DeltaSyncResult {
    success: boolean;
    changesApplied: number;
    deactivated: number;
    error?: string;
    syncTimestamp?: string;
}

export type SyncTrigger =
    | 'invoice_created'
    | 'grn_approved'
    | 'customer_created'
    | 'product_created'
    | 'stock_adjusted'
    | 'manual'
    | 'background'
    | 'page_focus';

// ==================== CONSTANTS ====================

const SYNC_TIMESTAMP_KEY = 'deltaSync_lastTimestamp';
const TABLE_TIMESTAMPS_KEY = 'deltaSync_tableTimestamps';
const BACKGROUND_SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Maps actions to tables that need syncing
const ACTION_TABLE_MAP: Record<SyncTrigger, string[]> = {
    'invoice_created': ['batches', 'products'],   // Stock changed
    'grn_approved': ['batches', 'products'],       // New stock received
    'customer_created': ['customers'],
    'product_created': ['products'],
    'stock_adjusted': ['batches', 'products'],
    'manual': [],                                  // Caller specifies
    'background': ['products', 'batches'],         // Periodic refresh
    'page_focus': ['products', 'batches']          // User came back
};

// ==================== SERVICE CLASS ====================

class DeltaSyncService {
    private syncInProgress: boolean = false;
    private backgroundInterval: NodeJS.Timeout | null = null;
    private listeners: Set<(event: SyncEvent) => void> = new Set();

    constructor() {
        // Setup visibility change listener for page focus sync
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') {
                    this.onPageFocus();
                }
            });
        }
    }

    // ==================== TIMESTAMP MANAGEMENT ====================

    private getLastSyncTimestamp(): string | null {
        return localStorage.getItem(SYNC_TIMESTAMP_KEY);
    }

    private setLastSyncTimestamp(timestamp: string): void {
        localStorage.setItem(SYNC_TIMESTAMP_KEY, timestamp);
    }

    private getTableTimestamps(): Record<string, string> {
        const stored = localStorage.getItem(TABLE_TIMESTAMPS_KEY);
        return stored ? JSON.parse(stored) : {};
    }

    private setTableTimestamp(table: string, timestamp: string): void {
        const timestamps = this.getTableTimestamps();
        timestamps[table] = timestamp;
        localStorage.setItem(TABLE_TIMESTAMPS_KEY, JSON.stringify(timestamps));
    }

    // ==================== CORE SYNC METHODS ====================

    /**
     * Sync specific tables incrementally
     * This is the main method - call after any data-changing action
     */
    async syncTables(tables: string[], trigger: SyncTrigger = 'manual'): Promise<DeltaSyncResult> {
        if (this.syncInProgress) {
            console.log('[DeltaSync] Sync already in progress, skipping');
            return { success: false, changesApplied: 0, deactivated: 0, error: 'Sync in progress' };
        }

        const since = this.getLastSyncTimestamp();
        if (!since) {
            console.log('[DeltaSync] No previous sync timestamp, need full sync');
            return { success: false, changesApplied: 0, deactivated: 0, error: 'Need full sync first' };
        }

        this.syncInProgress = true;
        this.notify({ type: 'sync_started', trigger, tables });

        try {
            // ============================================================
            // PUSH-BEFORE-PULL: Sync local changes to server FIRST
            // This ensures server has latest data before we pull updates
            // Critical for offline-first: prevents stock inconsistencies
            // ============================================================
            if (navigator.onLine) {
                try {
                    const { default: syncEngine } = await import('./syncEngine');
                    const pushResult = await syncEngine.startSync();

                    if (pushResult.synced > 0) {
                        console.log(`[DeltaSync] 📤 Pushed ${pushResult.synced} pending items before pull`);
                    }
                    if (pushResult.conflicts > 0) {
                        console.warn(`[DeltaSync] ⚠️ ${pushResult.conflicts} conflicts during push`);
                    }
                } catch (pushError) {
                    // Don't fail delta sync if push fails - just log and continue
                    console.warn('[DeltaSync] Push before pull failed, continuing with pull:', pushError);
                }
            }

            console.log(`[DeltaSync] Starting delta sync for [${tables.join(', ')}] since ${since}`);

            const response = await syncApi.getDelta(since, tables.join(','));
            const data = response.data as DeltaSyncResponse;

            let totalChanges = 0;
            let totalDeactivated = 0;

            // Apply changes to IndexedDB
            if (data.changes) {
                if (data.changes.products?.length) {
                    await this.applyProductChanges(data.changes.products);
                    totalChanges += data.changes.products.length;
                    console.log(`[DeltaSync] Applied ${data.changes.products.length} product changes`);
                }

                if (data.changes.batches?.length) {
                    await this.applyBatchChanges(data.changes.batches);
                    totalChanges += data.changes.batches.length;
                    console.log(`[DeltaSync] Applied ${data.changes.batches.length} batch changes`);
                }

                if (data.changes.customers?.length) {
                    await this.applyCustomerChanges(data.changes.customers);
                    totalChanges += data.changes.customers.length;
                    console.log(`[DeltaSync] Applied ${data.changes.customers.length} customer changes`);
                }

                if (data.changes.employees?.length) {
                    await this.applyEmployeeChanges(data.changes.employees);
                    totalChanges += data.changes.employees.length;
                }
            }

            // Remove deactivated records
            if (data.deactivated) {
                if (data.deactivated.products?.length) {
                    for (const id of data.deactivated.products) {
                        await offlineDB.delete('products', String(id));
                    }
                    totalDeactivated += data.deactivated.products.length;
                }

                if (data.deactivated.batches?.length) {
                    // Batches are embedded in products, need to update products
                    totalDeactivated += data.deactivated.batches.length;
                }

                if (data.deactivated.customers?.length) {
                    for (const id of data.deactivated.customers) {
                        await offlineDB.delete('customers', String(id));
                    }
                    totalDeactivated += data.deactivated.customers.length;
                }
            }

            // Update sync timestamp
            this.setLastSyncTimestamp(data.sync_timestamp);
            tables.forEach(table => this.setTableTimestamp(table, data.sync_timestamp));

            console.log(`[DeltaSync] ✅ Complete: ${totalChanges} changes, ${totalDeactivated} removed`);

            this.notify({
                type: 'sync_complete',
                trigger,
                tables,
                changesApplied: totalChanges,
                deactivated: totalDeactivated
            });

            return {
                success: true,
                changesApplied: totalChanges,
                deactivated: totalDeactivated,
                syncTimestamp: data.sync_timestamp
            };

        } catch (error: any) {
            console.error('[DeltaSync] Sync failed:', error);
            this.notify({ type: 'sync_error', trigger, error: error.message });
            return { success: false, changesApplied: 0, deactivated: 0, error: error.message };
        } finally {
            this.syncInProgress = false;
        }
    }

    // ==================== DATA APPLICATION ====================

    private async applyProductChanges(products: any[]): Promise<void> {
        for (const product of products) {
            const productId = String(product.product_id);

            // Get existing product to preserve offline reservations
            const existing = await offlineDB.get('products', productId);

            const transformed = {
                id: productId,
                product_id: productId,
                product_name: product.product_name || '',
                product_code: product.product_code || '',
                hsn_code: product.hsn_code || '',
                category_id: product.category_id,
                gst_percent: product.gst_percent || 0,
                is_active: product.is_active,
                total_quantity_available: product.total_quantity_available || 0,
                mrp_per_unit: product.mrp_per_unit || 0,
                sale_price_per_unit: product.sale_price_per_unit || 0,
                updated_at: product.updated_at,
                // Preserve existing batches (they're updated separately)
                batches: existing?.batches || [],
                // Preserve search fields
                _search_name: (product.product_name || '').toLowerCase(),
                _search_code: (product.product_code || '').toLowerCase()
            };

            await offlineDB.update('products', transformed);
        }
    }

    private async applyBatchChanges(batches: any[]): Promise<void> {
        // Group batches by product
        const batchesByProduct = new Map<string, any[]>();

        for (const batch of batches) {
            const productId = String(batch.product_id);
            if (!batchesByProduct.has(productId)) {
                batchesByProduct.set(productId, []);
            }
            batchesByProduct.get(productId)!.push(batch);
        }

        // Update each product's batches
        for (const [productId, productBatches] of batchesByProduct) {
            const product = await offlineDB.get('products', productId);
            if (!product) continue;

            // Get existing batch reservations
            const existingBatches = product.batches || [];
            const reservationMap = new Map<string, number>();
            for (const b of existingBatches) {
                if (b.quantity_reserved_offline > 0) {
                    reservationMap.set(String(b.batch_id), b.quantity_reserved_offline);
                }
            }

            // Update or add batches
            for (const newBatch of productBatches) {
                const batchId = String(newBatch.batch_id);
                const existingIndex = existingBatches.findIndex(
                    (b: any) => String(b.batch_id) === batchId
                );

                const transformedBatch = {
                    batch_id: batchId,
                    product_id: productId,
                    batch_number: newBatch.batch_number || '',
                    expiry_date: newBatch.expiry_date,
                    manufacturing_date: newBatch.manufacturing_date,
                    quantity_available: newBatch.quantity_available || 0,
                    quantity_reserved_offline: reservationMap.get(batchId) || 0,
                    mrp_per_unit: newBatch.mrp_per_unit || 0,
                    sale_price_per_unit: newBatch.sale_price_per_unit || 0,
                    cost_per_unit: newBatch.cost_per_unit || 0,
                    batch_status: newBatch.batch_status || 'active',
                    is_active: newBatch.batch_status === 'active'
                };

                if (existingIndex >= 0) {
                    existingBatches[existingIndex] = transformedBatch;
                } else {
                    existingBatches.push(transformedBatch);
                }
            }

            // Remove depleted batches (quantity = 0)
            product.batches = existingBatches.filter(
                (b: any) => b.quantity_available > 0 || b.quantity_reserved_offline > 0
            );

            await offlineDB.update('products', product);
        }
    }

    private async applyCustomerChanges(customers: any[]): Promise<void> {
        for (const customer of customers) {
            const customerId = String(customer.customer_id);

            const transformed = {
                id: customerId,
                customer_id: customerId,
                customer_name: customer.customer_name || '',
                customer_code: customer.customer_code || '',
                primary_phone: customer.primary_phone || '',
                primary_email: customer.primary_email || '',
                gst_number: customer.gst_number || '',
                customer_type: customer.customer_type || 'regular',
                credit_limit: customer.credit_limit || 0,
                credit_days: customer.credit_days || 0,
                current_outstanding: customer.current_outstanding || 0,
                is_active: customer.is_active,
                city: customer.city || '',
                state: customer.state || '',
                pincode: customer.pincode || '',
                updated_at: customer.updated_at,
                _search_name: (customer.customer_name || '').toLowerCase(),
                _search_phone: (customer.primary_phone || '').replace(/\D/g, '')
            };

            await offlineDB.update('customers', transformed);
        }
    }

    private async applyEmployeeChanges(employees: any[]): Promise<void> {
        for (const employee of employees) {
            await offlineDB.update('employees', {
                ...employee,
                employee_id: String(employee.employee_id)
            });
        }
    }

    // ==================== ACTION TRIGGERS ====================

    /**
     * Call after creating/posting an invoice
     * Syncs batches and products (stock levels changed)
     */
    async afterInvoiceCreated(): Promise<DeltaSyncResult> {
        console.log('[DeltaSync] Triggered after invoice created');
        return this.syncTables(ACTION_TABLE_MAP.invoice_created, 'invoice_created');
    }

    /**
     * Call after approving a GRN
     * Syncs batches and products (new stock received)
     */
    async afterGRNApproved(): Promise<DeltaSyncResult> {
        console.log('[DeltaSync] Triggered after GRN approved');
        return this.syncTables(ACTION_TABLE_MAP.grn_approved, 'grn_approved');
    }

    /**
     * Call after creating a new customer
     */
    async afterCustomerCreated(): Promise<DeltaSyncResult> {
        console.log('[DeltaSync] Triggered after customer created');
        return this.syncTables(ACTION_TABLE_MAP.customer_created, 'customer_created');
    }

    /**
     * Call after creating a new product
     */
    async afterProductCreated(): Promise<DeltaSyncResult> {
        console.log('[DeltaSync] Triggered after product created');
        return this.syncTables(ACTION_TABLE_MAP.product_created, 'product_created');
    }

    /**
     * Call after stock adjustment
     */
    async afterStockAdjusted(): Promise<DeltaSyncResult> {
        console.log('[DeltaSync] Triggered after stock adjusted');
        return this.syncTables(ACTION_TABLE_MAP.stock_adjusted, 'stock_adjusted');
    }

    // ==================== AUTOMATIC SYNC ====================

    /**
     * Called when page becomes visible (user comes back to tab)
     */
    private async onPageFocus(): Promise<void> {
        const lastSync = this.getLastSyncTimestamp();
        if (!lastSync) return;

        const lastSyncTime = new Date(lastSync).getTime();
        const timeSinceSync = Date.now() - lastSyncTime;

        // Only sync if data is older than 1 minute
        if (timeSinceSync > 60 * 1000) {
            console.log('[DeltaSync] Page focus - syncing stale data');
            await this.syncTables(ACTION_TABLE_MAP.page_focus, 'page_focus');
        }
    }

    /**
     * Start background sync interval (every 5 minutes)
     */
    startBackgroundSync(): void {
        if (this.backgroundInterval) return;

        console.log('[DeltaSync] Starting background sync interval');
        this.backgroundInterval = setInterval(async () => {
            if (!this.syncInProgress && navigator.onLine) {
                await this.syncTables(ACTION_TABLE_MAP.background, 'background');
            }
        }, BACKGROUND_SYNC_INTERVAL);
    }

    /**
     * Stop background sync
     */
    stopBackgroundSync(): void {
        if (this.backgroundInterval) {
            clearInterval(this.backgroundInterval);
            this.backgroundInterval = null;
            console.log('[DeltaSync] Background sync stopped');
        }
    }

    // ==================== INITIALIZATION ====================

    /**
     * Initialize after full sync completes
     * Call this after syncPullService.fullSync()
     */
    initializeAfterFullSync(syncTimestamp: string): void {
        this.setLastSyncTimestamp(syncTimestamp);
        console.log(`[DeltaSync] Initialized with sync timestamp: ${syncTimestamp}`);
    }

    /**
     * Check if delta sync is available (has a previous sync timestamp)
     */
    canDeltaSync(): boolean {
        return !!this.getLastSyncTimestamp();
    }

    /**
     * Get time since last sync
     */
    getTimeSinceSync(): number | null {
        const timestamp = this.getLastSyncTimestamp();
        if (!timestamp) return null;
        return Date.now() - new Date(timestamp).getTime();
    }

    // ==================== EVENTS ====================

    private notify(event: SyncEvent): void {
        this.listeners.forEach(callback => {
            try {
                callback(event);
            } catch (e) {
                console.error('[DeltaSync] Listener error:', e);
            }
        });
    }

    /**
     * Subscribe to sync events
     */
    onSyncEvent(callback: (event: SyncEvent) => void): () => void {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }
}

// ==================== TYPES ====================

interface SyncEvent {
    type: 'sync_started' | 'sync_complete' | 'sync_error';
    trigger: SyncTrigger;
    tables?: string[];
    changesApplied?: number;
    deactivated?: number;
    error?: string;
}

// ==================== SINGLETON EXPORT ====================

const deltaSyncService = new DeltaSyncService();
export default deltaSyncService;
