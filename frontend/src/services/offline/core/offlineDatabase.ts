import { openDB, IDBPDatabase, DBSchema } from 'idb';
import { SyncQueueManager } from './syncQueueManager';
import { BatchManager } from './batchManager';
import { CacheManager } from './cacheManager';
import { SYNC_STATUS, SyncStats, SyncQueueItem } from '../types';

export { SYNC_STATUS };


const DB_NAME = 'PharmaERPOffline';
const DB_VERSION = 8;
const LOG_PREFIX = '[OfflineDB]';

export interface OfflineSchema extends DBSchema {
    customers: {
        key: string | number;
        value: any;
        indexes: { 'name': string; 'phone': string; 'sync_status': string; 'updated_at': string };
    };
    products: {
        key: string | number;
        value: any;
        indexes: { 'name': string; 'sku': string; 'category': string; 'sync_status': string };
    };
    invoices: {
        key: string | number;
        value: any;
        indexes: { 'invoice_number': string; 'customer_id': string; 'sync_status': string; 'created_at': string; 'created_offline': number };
    };
    sales_orders: {
        key: string | number;
        value: any;
        indexes: { 'order_number': string; 'customer_id': string; 'sync_status': string; 'created_at': string };
    };
    payments: {
        key: string | number;
        value: any;
        indexes: { 'invoice_id': string; 'customer_id': string; 'sync_status': string; 'payment_date': string };
    };
    sync_queue: {
        key: number;
        value: SyncQueueItem;
        indexes: { 'entity_type': string; 'entity_id': string | number; 'action': string; 'created_at': string; 'attempts': number };
    };
    settings: {
        key: string;
        value: any;
    };
    sync_stats: {
        key: string;
        value: any;
    };
    employees: {
        key: string | number;
        value: any;
        indexes: { 'full_name': string; 'is_active': number };
    };
    batches: {
        key: string;
        value: any;
        indexes: { 'product_id': string; 'batch_number': string; 'expiry_date': string; 'updated_at': string };
    };
    preallocated_numbers: {
        key: number;
        value: any;
        indexes: { 'type': string; 'used': number };
    };
    app_cache: {
        key: string;
        value: { key: string; data: any; timestamp: number };
    };
}

class OfflineDatabase {
    private db: IDBPDatabase<OfflineSchema> | null = null;
    public syncQueue: SyncQueueManager;
    public batches: BatchManager;
    public cache: CacheManager;

    constructor() {
        // Managers take a getter for the DB to ensure it's initialized
        const getDb = () => this.init();
        this.syncQueue = new SyncQueueManager(getDb);
        this.batches = new BatchManager(getDb);
        this.cache = new CacheManager(getDb);
    }

    async init(): Promise<IDBPDatabase<OfflineSchema>> {
        if (this.db) return this.db;
        console.log(`${LOG_PREFIX} Initializing database v${DB_VERSION}...`);

        this.db = await openDB<OfflineSchema>(DB_NAME, DB_VERSION, {
            upgrade(db, oldVersion, newVersion, transaction) {
                // Customers store
                if (!db.objectStoreNames.contains('customers')) {
                    const customerStore = db.createObjectStore('customers', { keyPath: 'id' });
                    customerStore.createIndex('name', 'name');
                    customerStore.createIndex('phone', 'phone');
                    customerStore.createIndex('sync_status', 'sync_status');
                    customerStore.createIndex('updated_at', 'updated_at');
                }

                // Products store
                if (!db.objectStoreNames.contains('products')) {
                    const productStore = db.createObjectStore('products', { keyPath: 'id' });
                    productStore.createIndex('name', 'name');
                    productStore.createIndex('sku', 'sku');
                    productStore.createIndex('category', 'category');
                    productStore.createIndex('sync_status', 'sync_status');
                }

                // Invoices store
                if (!db.objectStoreNames.contains('invoices')) {
                    const invoiceStore = db.createObjectStore('invoices', {
                        keyPath: 'temp_id' // Using temp_id as primary key keyPath
                    });
                    invoiceStore.createIndex('invoice_number', 'invoice_number');
                    invoiceStore.createIndex('customer_id', 'customer_id');
                    invoiceStore.createIndex('sync_status', 'sync_status');
                    invoiceStore.createIndex('created_at', 'created_at');
                    invoiceStore.createIndex('created_offline', 'created_offline');
                }

                // Sales Orders store
                if (!db.objectStoreNames.contains('sales_orders')) {
                    const orderStore = db.createObjectStore('sales_orders', {
                        keyPath: 'temp_id'
                    });
                    orderStore.createIndex('order_number', 'order_number');
                    orderStore.createIndex('customer_id', 'customer_id');
                    orderStore.createIndex('sync_status', 'sync_status');
                    orderStore.createIndex('created_at', 'created_at');
                }

                // Payments store
                if (!db.objectStoreNames.contains('payments')) {
                    const paymentStore = db.createObjectStore('payments', {
                        keyPath: 'temp_id'
                    });
                    paymentStore.createIndex('invoice_id', 'invoice_id');
                    paymentStore.createIndex('customer_id', 'customer_id');
                    paymentStore.createIndex('sync_status', 'sync_status');
                    paymentStore.createIndex('payment_date', 'payment_date');
                }

                // Sync Queue store
                if (!db.objectStoreNames.contains('sync_queue')) {
                    const queueStore = db.createObjectStore('sync_queue', {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    queueStore.createIndex('entity_type', 'entity_type');
                    queueStore.createIndex('entity_id', 'entity_id');
                    queueStore.createIndex('action', 'action');
                    queueStore.createIndex('created_at', 'created_at');
                    queueStore.createIndex('attempts', 'attempts');
                }

                // Settings store
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }

                // Sync Stats store (for tracking sync status)
                if (!db.objectStoreNames.contains('sync_stats')) {
                    db.createObjectStore('sync_stats', { keyPath: 'key' });
                }

                // Employees store (for salesperson selection in invoices)
                if (!db.objectStoreNames.contains('employees')) {
                    const empStore = db.createObjectStore('employees', { keyPath: 'employee_id' });
                    empStore.createIndex('full_name', 'full_name');
                    empStore.createIndex('is_active', 'is_active');
                }

                // Batches store (for fast offline batch selection)
                if (!db.objectStoreNames.contains('batches')) {
                    const batchStore = db.createObjectStore('batches', { keyPath: 'batch_id' });
                    batchStore.createIndex('product_id', 'product_id');
                    batchStore.createIndex('batch_number', 'batch_number');
                    batchStore.createIndex('expiry_date', 'expiry_date');
                    batchStore.createIndex('updated_at', 'updated_at');
                }

                // Preallocated Numbers store
                if (!db.objectStoreNames.contains('preallocated_numbers')) {
                    const numbersStore = db.createObjectStore('preallocated_numbers', {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    numbersStore.createIndex('type', 'type');
                    numbersStore.createIndex('used', 'used');
                }

                // App Cache store (Generic Key-Value for consolidation)
                if (!db.objectStoreNames.contains('app_cache')) {
                    db.createObjectStore('app_cache', { keyPath: 'key' });
                }
            },
        });

        return this.db;
    }

    // Generic CRUD operations
    async add(storeName: any, data: any): Promise<number | string> {
        const db = await this.init();
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);

        // Add metadata
        const enrichedData = {
            ...data,
            sync_status: SYNC_STATUS.PENDING,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            created_offline: !navigator.onLine
        };

        const id = await store.add(enrichedData);
        await tx.done;

        // Add to sync queue if offline
        if (!navigator.onLine) {
            await this.syncQueue.addToSyncQueue(storeName, String(id), 'create', enrichedData);
        }

        return id as number | string;
    }

    async get(storeName: any, key: any): Promise<any> {
        const db = await this.init();
        return db.get(storeName, key);
    }

    async getAll(storeName: any, indexName: string | null = null, query: any = null): Promise<any[]> {
        const db = await this.init();

        if (indexName && query) {
            const tx = db.transaction(storeName);
            // @ts-ignore - Dynamic store access
            const index = tx.store.index(indexName);
            return (index as any).getAll(query);
        }

        return db.getAll(storeName);
    }

    async update(storeName: any, data: any): Promise<any> {
        const db = await this.init();
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);

        // Update metadata
        const updatedData = {
            ...data,
            updated_at: new Date().toISOString()
        };

        await store.put(updatedData);
        await tx.done;

        // Add to sync queue if offline
        if (!navigator.onLine) {
            await this.syncQueue.addToSyncQueue(storeName, data.id || data.temp_id, 'update', updatedData);
        }

        return updatedData;
    }

    async delete(storeName: any, key: any): Promise<void> {
        const db = await this.init();
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);

        await store.delete(key);
        await tx.done;

        // Add to sync queue if offline
        if (!navigator.onLine) {
            await this.syncQueue.addToSyncQueue(storeName, key, 'delete');
        }
    }

    // Delegate Sync Queue methods for backward compatibility
    async addToSyncQueue(entityType: string, entityId: string | number, action: 'create' | 'update' | 'delete', data: any = null) {
        return this.syncQueue.addToSyncQueue(entityType, entityId, action, data);
    }

    async getSyncQueue() {
        return this.syncQueue.getSyncQueue();
    }

    async removeFromSyncQueue(id: number) {
        return this.syncQueue.removeFromSyncQueue(id);
    }

    async clearSyncQueue() {
        return this.syncQueue.clearSyncQueue();
    }

    async markSyncConflict(id: number, error: any) {
        return this.syncQueue.markSyncConflict(id, error);
    }

    async incrementSyncRetry(id: number) {
        return this.syncQueue.incrementSyncRetry(id);
    }

    // Preallocated Numbers Management
    async addPreallocatedNumbers(type: string, numbers: string[]): Promise<void> {
        const db = await this.init();
        const tx = db.transaction('preallocated_numbers', 'readwrite');
        const store = tx.objectStore('preallocated_numbers');

        for (const number of numbers) {
            await store.add({
                type: type,
                number: number,
                used: false,
                allocated_at: new Date().toISOString()
            });
        }

        await tx.done;
    }

    async getNextPreallocatedNumber(type: string): Promise<string> {
        const db = await this.init();
        const tx = db.transaction('preallocated_numbers', 'readwrite');
        const store = tx.objectStore('preallocated_numbers');
        const index = store.index('type');

        // Get first unused number of this type
        const cursor = await index.openCursor(IDBKeyRange.only(type));

        while (cursor) {
            if (!cursor.value.used) {
                // Mark as used
                const updateValue = { ...cursor.value };
                updateValue.used = true;
                updateValue.used_at = new Date().toISOString();

                await cursor.update(updateValue);
                await tx.done;
                return cursor.value.number;
            }
            await cursor.continue();
        }

        // No preallocated numbers available
        console.warn(`${LOG_PREFIX} No preallocated ${type} numbers available`);
        throw new Error(`No preallocated ${type} numbers available. Please connect to internet to get more.`);
    }

    // Search operations
    // Note: These should ideally be optimized with cursors or search indexes in the future
    async searchCustomers(query: string): Promise<any[]> {
        const db = await this.init();
        const allCustomers = await db.getAll('customers');

        const searchTerm = query.toLowerCase();
        return allCustomers.filter(customer =>
            customer.name?.toLowerCase().includes(searchTerm) ||
            customer.phone?.includes(searchTerm) ||
            customer.email?.toLowerCase().includes(searchTerm)
        );
    }

    async searchProducts(query: string): Promise<any[]> {
        const db = await this.init();
        const allProducts = await db.getAll('products');

        const searchTerm = query.toLowerCase();
        return allProducts.filter(product =>
            product.name?.toLowerCase().includes(searchTerm) ||
            product.sku?.toLowerCase().includes(searchTerm) ||
            product.barcode?.includes(searchTerm)
        );
    }

    async updateSyncStats(stats: Partial<SyncStats>): Promise<any> {
        try {
            const db = await this.init();

            // Check if store exists before accessing
            if (!db.objectStoreNames.contains('sync_stats')) {
                console.warn(`${LOG_PREFIX} sync_stats store not found, skipping update`);
                return stats;
            }

            const tx = db.transaction('sync_stats', 'readwrite');
            const store = tx.objectStore('sync_stats');

            // Build clean object - ensure 'key' is first and only keyPath field
            const updated = {
                key: 'current', // inline keyPath
                ...stats,
                updated_at: new Date().toISOString()
            };

            await store.put(updated);
            await tx.done;
            return updated;
        } catch (error) {
            console.warn(`${LOG_PREFIX} updateSyncStats failed:`, (error as Error).message);
            return stats; // Return input to allow sync to continue
        }
    }

    async getSyncStats(): Promise<SyncStats> {
        const db = await this.init();
        const stats = await db.get('sync_stats', 'current') || {};

        // Count pending items
        const syncQueue = await this.getSyncQueue();
        const pending = syncQueue.filter(item => item.sync_status === SYNC_STATUS.PENDING).length;
        const syncing = syncQueue.filter(item => item.sync_status === SYNC_STATUS.SYNCING).length;
        const failed = syncQueue.filter(item => item.sync_status === SYNC_STATUS.FAILED).length;
        const conflicts = syncQueue.filter(item => item.sync_status === SYNC_STATUS.CONFLICT).length;

        return {
            pending,
            syncing,
            synced: stats.synced || 0,
            failed,
            conflicts,
            lastSync: stats.lastSync
        };
    }

    // Cache delegates
    async setCache(key: string, data: any) {
        return this.cache.setCache(key, data);
    }

    async getCache(key: string, maxAgeMinutes: number | null = null) {
        return this.cache.getCache(key, maxAgeMinutes);
    }

    async clearCache(key: string | null = null) {
        return this.cache.clearCache(key);
    }

    async updateLocalId(storeName: any, localId: string, serverId: string | number): Promise<void> {
        const db = await this.init();
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);

        // Find item by local ID - NOTE: This is inefficient, should iterate based on an index if possible
        // But keeping as-is for parity during TS conversion
        const items = await store.getAll();
        const item = items.find((i: any) => i._localId === localId);

        if (item) {
            // Update with server ID
            const idField = storeName === 'invoices' ? 'invoice_id' :
                storeName === 'customers' ? 'customer_id' :
                    storeName === 'products' ? 'product_id' : 'id';

            item[idField] = serverId;
            item.sync_status = SYNC_STATUS.SYNCED;
            item.synced_at = new Date().toISOString();
            delete item._localId;

            await store.put(item);
        }

        await tx.done;
    }

    // Bulk operations for initial data load
    async bulkLoad(storeName: any, data: any[]): Promise<void> {
        const db = await this.init();
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);

        for (const item of data) {
            await store.put({
                ...item,
                sync_status: SYNC_STATUS.SYNCED,
                updated_at: new Date().toISOString()
            });
        }

        await tx.done;
    }

    // Clear all offline data
    async clearAll(): Promise<void> {
        const db = await this.init();
        const storeNames = ['customers', 'products', 'invoices', 'sales_orders', 'payments', 'sync_queue', 'batches'] as const;

        // Use a simpler approach to clear multiple stores
        for (const storeName of storeNames) {
            if (db.objectStoreNames.contains(storeName)) {
                const tx = db.transaction(storeName, 'readwrite');
                await tx.objectStore(storeName).clear();
                await tx.done;
            }
        }
    }

    // Batch delegates
    async getBatchesByProduct(productId: string | number) {
        return this.batches.getBatchesByProduct(productId);
    }

    async storeBatches(batches: any[]) {
        return this.batches.storeBatches(batches);
    }

    async clearBatchesForProduct(productId: string | number) {
        return this.batches.clearBatchesForProduct(productId);
    }

    async clearAllBatches() {
        return this.batches.clearAllBatches();
    }

    async reserveBatchQuantity(batchId: string | number, quantity: number) {
        return this.batches.reserveBatchQuantity(batchId, quantity);
    }

    async getBatchesForProduct(productId: string | number) {
        return this.batches.getBatchesByProduct(productId);
    }

    async getBatchUsableQuantity(batchId: string | number) {
        return this.batches.getBatchUsableQuantity(batchId);
    }



    async getBatchesWithReservations() {
        return this.batches.getBatchesWithReservations();
    }

    async clearReservedQuantity(batchId: string | number, quantity: number) {
        return this.batches.clearReservedQuantity(batchId, quantity);
    }

    async updateBatchQuantity(batchId: string | number, newQuantity: number) {
        return this.batches.updateBatchQuantity(batchId, newQuantity);
    }
}

// Export singleton instance
const offlineDB = new OfflineDatabase();
export default offlineDB;
