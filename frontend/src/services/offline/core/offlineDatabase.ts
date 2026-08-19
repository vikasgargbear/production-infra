import { openDB, IDBPDatabase, DBSchema } from 'idb';
import { SyncQueueManager } from './syncQueueManager';
import { CacheManager } from './cacheManager';
import { SYNC_STATUS, SyncStats, SyncQueueItem } from '../types';

export { SYNC_STATUS };


const DB_NAME = 'PharmaERPOffline';
const DB_VERSION = 15;  // Bumped for payment_receipts offline store
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
    payment_receipts: {
        key: string | number;
        value: any;
        indexes: { 'receipt_number': string; 'customer_id': string; 'sync_status': string; 'receipt_date': string };
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
    customer_addresses: {
        key: string;  // address_id or temp_addr_xxx for offline-created
        value: any;
        indexes: { 'customer_id': string; 'sync_status': string; 'address_type': string };
    };
    // Company profile store for offline-first access
    company_profile: {
        key: string;  // 'current' - single record
        value: {
            key: string;
            company_name: string;
            company_address: string;
            company_gst_number: string;
            company_drug_license: string;
            company_phone: string;
            company_alternate_phone: string;
            company_email: string;
            company_website: string;
            company_pan: string;
            company_fssai: string;
            company_logo: string;
            billing_address: string;
            shipping_address: string;
            bank_details: any;
            updated_at: string;
        };
    };
    // Delivery Challans store for offline-first challan creation
    delivery_challans: {
        key: string;  // temp_id or challan_id
        value: any;
        indexes: { 'challan_number': string; 'customer_id': string; 'sync_status': string; 'created_at': string };
    };
    // Suppliers store for offline-first purchase flows
    suppliers: {
        key: string | number;
        value: any;
        indexes: { 'name': string; 'phone': string; 'sync_status': string; 'updated_at': string };
    };
    // Purchase Orders store for offline-first PO creation
    purchase_orders: {
        key: string;  // temp_id or order_id
        value: any;
        indexes: { 'po_number': string; 'supplier_id': string; 'sync_status': string; 'created_at': string };
    };
    // Purchase Entries store for offline-first GRN/purchase entry creation
    purchase_entries: {
        key: string;  // temp_id or invoice_id
        value: any;
        indexes: { 'invoice_number': string; 'supplier_id': string; 'sync_status': string; 'created_at': string };
    };
    // Sales Returns store for offline-first returns
    sales_returns: {
        key: string;  // temp_id or return_id
        value: any;
        indexes: { 'return_number': string; 'customer_id': string; 'sync_status': string; 'created_at': string };
    };
    // Purchase Returns store for offline-first returns
    purchase_returns: {
        key: string;  // temp_id or return_id
        value: any;
        indexes: { 'return_number': string; 'supplier_id': string; 'sync_status': string; 'created_at': string };
    };
    // Credit / Debit Notes store for offline-first finance adjustments
    credit_debit_notes: {
        key: string;  // temp_id or note_id
        value: any;
        indexes: { 'note_number': string; 'party_id': string; 'sync_status': string; 'created_at': string };
    };
    // Stock Adjustments store for offline-first stock adjustments
    stock_adjustments: {
        key: string;  // temp_id or adjustment_id
        value: any;
        indexes: { 'adjustment_number': string; 'sync_status': string; 'created_at': string };
    };
    // Stock Transfers store for offline-first stock transfers
    stock_transfers: {
        key: string;  // temp_id or transfer_id
        value: any;
        indexes: { 'transfer_number': string; 'sync_status': string; 'created_at': string };
    };
}

class OfflineDatabase {
    private db: IDBPDatabase<OfflineSchema> | null = null;
    public syncQueue: SyncQueueManager;
    public cache: CacheManager;

    constructor() {
        // Managers take a getter for the DB to ensure it's initialized
        const getDb = () => this.init();
        this.syncQueue = new SyncQueueManager(getDb);
        this.cache = new CacheManager(getDb);
    }

    async init(): Promise<IDBPDatabase<OfflineSchema>> {
        // Check if existing connection is still valid
        if (this.db) {
            try {
                // Quick validation - attempt to get store names (fails if connection is closing)
                // eslint-disable-next-line @typescript-eslint/no-unused-expressions
                void this.db.objectStoreNames;
                return this.db;
            } catch (e) {
                // Connection is stale, need to reconnect
                console.log(`${LOG_PREFIX} Database connection stale, reconnecting...`);
                this.db = null;
            }
        }
        console.log(`${LOG_PREFIX} Initializing database v${DB_VERSION}...`);

        this.db = await openDB<OfflineSchema>(DB_NAME, DB_VERSION, {
            blocked(currentVersion, blockedVersion, event) {
                // Database upgrade is blocked by another tab
                console.warn(`${LOG_PREFIX} ⚠️ Database upgrade blocked! Current: v${currentVersion}, target: v${blockedVersion}`);
                console.warn(`${LOG_PREFIX} Close other tabs and refresh this page.`);

                // Auto-reload after 3 seconds if blocked
                setTimeout(() => {
                    console.log(`${LOG_PREFIX} Reloading page to retry database upgrade...`);
                    window.location.reload();
                }, 3000);
            },
            upgrade(db, oldVersion, newVersion, transaction) {
                console.log(`${LOG_PREFIX} Upgrading from v${oldVersion} to v${newVersion}...`);
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

                // Payment Receipts store (for offline-first customer receipts)
                if (!db.objectStoreNames.contains('payment_receipts')) {
                    const receiptStore = db.createObjectStore('payment_receipts', {
                        keyPath: 'temp_id'
                    });
                    receiptStore.createIndex('receipt_number', 'receipt_number');
                    receiptStore.createIndex('customer_id', 'customer_id');
                    receiptStore.createIndex('sync_status', 'sync_status');
                    receiptStore.createIndex('receipt_date', 'receipt_date');
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

                // Customer Addresses store (for offline-first address creation)
                if (!db.objectStoreNames.contains('customer_addresses')) {
                    const addrStore = db.createObjectStore('customer_addresses', { keyPath: 'id' });
                    addrStore.createIndex('customer_id', 'customer_id');
                    addrStore.createIndex('sync_status', 'sync_status');
                    addrStore.createIndex('address_type', 'address_type');
                }

                // Company Profile store (for offline-first company info access)
                if (!db.objectStoreNames.contains('company_profile')) {
                    db.createObjectStore('company_profile', { keyPath: 'key' });
                }

                // Delivery Challans store (for offline-first challan creation)
                if (!db.objectStoreNames.contains('delivery_challans')) {
                    const challanStore = db.createObjectStore('delivery_challans', { keyPath: 'temp_id' });
                    challanStore.createIndex('challan_number', 'challan_number');
                    challanStore.createIndex('customer_id', 'customer_id');
                    challanStore.createIndex('sync_status', 'sync_status');
                    challanStore.createIndex('created_at', 'created_at');
                }

                // Suppliers store (for offline-first purchase flows)
                if (!db.objectStoreNames.contains('suppliers')) {
                    const supplierStore = db.createObjectStore('suppliers', { keyPath: 'id' });
                    supplierStore.createIndex('name', 'name');
                    supplierStore.createIndex('phone', 'phone');
                    supplierStore.createIndex('sync_status', 'sync_status');
                    supplierStore.createIndex('updated_at', 'updated_at');
                }

                // Purchase Orders store (for offline-first PO creation)
                if (!db.objectStoreNames.contains('purchase_orders')) {
                    const poStore = db.createObjectStore('purchase_orders', { keyPath: 'temp_id' });
                    poStore.createIndex('po_number', 'po_number');
                    poStore.createIndex('supplier_id', 'supplier_id');
                    poStore.createIndex('sync_status', 'sync_status');
                    poStore.createIndex('created_at', 'created_at');
                }

                // Purchase Entries store (for offline-first GRN/purchase entry)
                if (!db.objectStoreNames.contains('purchase_entries')) {
                    const peStore = db.createObjectStore('purchase_entries', { keyPath: 'temp_id' });
                    peStore.createIndex('invoice_number', 'invoice_number');
                    peStore.createIndex('supplier_id', 'supplier_id');
                    peStore.createIndex('sync_status', 'sync_status');
                    peStore.createIndex('created_at', 'created_at');
                }

                // Sales Returns store (for offline-first returns)
                if (!db.objectStoreNames.contains('sales_returns')) {
                    const salesReturnStore = db.createObjectStore('sales_returns', { keyPath: 'temp_id' });
                    salesReturnStore.createIndex('return_number', 'return_number');
                    salesReturnStore.createIndex('customer_id', 'customer_id');
                    salesReturnStore.createIndex('sync_status', 'sync_status');
                    salesReturnStore.createIndex('created_at', 'created_at');
                }

                // Purchase Returns store (for offline-first returns)
                if (!db.objectStoreNames.contains('purchase_returns')) {
                    const purchaseReturnStore = db.createObjectStore('purchase_returns', { keyPath: 'temp_id' });
                    purchaseReturnStore.createIndex('return_number', 'return_number');
                    purchaseReturnStore.createIndex('supplier_id', 'supplier_id');
                    purchaseReturnStore.createIndex('sync_status', 'sync_status');
                    purchaseReturnStore.createIndex('created_at', 'created_at');
                }

                // Credit / Debit Notes store (for offline-first finance adjustments)
                if (!db.objectStoreNames.contains('credit_debit_notes')) {
                    const notesStore = db.createObjectStore('credit_debit_notes', { keyPath: 'temp_id' });
                    notesStore.createIndex('note_number', 'note_number');
                    notesStore.createIndex('party_id', 'party_id');
                    notesStore.createIndex('sync_status', 'sync_status');
                    notesStore.createIndex('created_at', 'created_at');
                }

                // Stock Adjustments store (for offline-first stock adjustments)
                if (!db.objectStoreNames.contains('stock_adjustments')) {
                    const adjStore = db.createObjectStore('stock_adjustments', { keyPath: 'temp_id' });
                    adjStore.createIndex('adjustment_number', 'adjustment_number');
                    adjStore.createIndex('sync_status', 'sync_status');
                    adjStore.createIndex('created_at', 'created_at');
                }

                // Stock Transfers store (for offline-first stock transfers)
                if (!db.objectStoreNames.contains('stock_transfers')) {
                    const transferStore = db.createObjectStore('stock_transfers', { keyPath: 'temp_id' });
                    transferStore.createIndex('transfer_number', 'transfer_number');
                    transferStore.createIndex('sync_status', 'sync_status');
                    transferStore.createIndex('created_at', 'created_at');
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

        // temp_id is the canonical local key. _localId/local_id are legacy
        // aliases still recognized so older queued records can sync.
        const items = await store.getAll();
        const item = items.find((i: any) =>
            i.temp_id === localId ||
            i._localId === localId ||
            i.local_id === localId
        );

        if (item) {
            // Update with server ID
            const idField = storeName === 'invoices' ? 'invoice_id' :
                storeName === 'customers' ? 'customer_id' :
                    storeName === 'products' ? 'product_id' :
                        storeName === 'sales_orders' ? 'order_id' :
                            storeName === 'delivery_challans' ? 'challan_id' :
                                    storeName === 'purchase_orders' ? 'order_id' :
                                        storeName === 'purchase_entries' ? 'invoice_id' :
                                            storeName === 'sales_returns' ? 'return_id' :
                                                storeName === 'purchase_returns' ? 'return_id' :
                                                    storeName === 'credit_debit_notes' ? 'note_id' :
                                                        storeName === 'payment_receipts' ? 'payment_id' :
                                                            storeName === 'stock_adjustments' ? 'adjustment_id' :
                                                                storeName === 'stock_transfers' ? 'transfer_id' :
                                                                    storeName === 'suppliers' ? 'supplier_id' : 'id';

            item[idField] = serverId;
            item.sync_status = SYNC_STATUS.SYNCED;
            item.synced_at = new Date().toISOString();
            delete item._localId;
            delete item.local_id;

            await store.put(item);
        }

        await tx.done;
    }

    /**
     * Deduct stock locally (for offline-first invoice creation)
     * Updates quantity_available in embedded batches within product records
     * 
     * @param deductions Array of { product_id, batch_id, quantity }
     */
    async deductStockLocally(deductions: Array<{ product_id: string | number; batch_id: string | number; quantity: number }>): Promise<void> {
        if (!deductions || deductions.length === 0) return;

        const db = await this.init();
        const tx = db.transaction('products', 'readwrite');
        const store = tx.objectStore('products');

        for (const { product_id, batch_id, quantity } of deductions) {
            try {
                const product = await store.get(String(product_id));
                if (!product || !product.batches) continue;

                // Find and update the batch within the product
                const batchIndex = product.batches.findIndex(
                    (b: any) => String(b.batch_id) === String(batch_id)
                );

                if (batchIndex !== -1) {
                    const currentQty = product.batches[batchIndex].quantity_available || 0;
                    product.batches[batchIndex].quantity_available = Math.max(0, currentQty - quantity);

                    // Also update product total_stock if present
                    if (typeof product.total_stock === 'number') {
                        product.total_stock = Math.max(0, product.total_stock - quantity);
                    }

                    product.updated_at = new Date().toISOString();
                    await store.put(product);

                    console.log(`${LOG_PREFIX} ✅ Deducted ${quantity} from product ${product_id}, batch ${batch_id}. New qty: ${product.batches[batchIndex].quantity_available}`);
                }
            } catch (err) {
                console.warn(`${LOG_PREFIX} Could not deduct stock for product ${product_id}:`, err);
            }
        }

        await tx.done;
    }

    /**
     * Add stock locally (for offline-first GRN/purchase entry)
     * Inverse of deductStockLocally - increases quantity_available
     *
     * @param additions Array of { product_id, batch_id, quantity, batch_data? }
     */
    async addStockLocally(additions: Array<{ product_id: string | number; batch_id: string | number; quantity: number; batch_data?: any }>): Promise<void> {
        if (!additions || additions.length === 0) return;

        const db = await this.init();
        const tx = db.transaction('products', 'readwrite');
        const store = tx.objectStore('products');

        for (const { product_id, batch_id, quantity, batch_data } of additions) {
            try {
                const product = await store.get(String(product_id));
                if (!product) continue;

                if (!product.batches) product.batches = [];

                const batchIndex = product.batches.findIndex(
                    (b: any) => String(b.batch_id) === String(batch_id)
                );

                if (batchIndex !== -1) {
                    // Existing batch - add quantity
                    product.batches[batchIndex].quantity_available = (product.batches[batchIndex].quantity_available || 0) + quantity;
                } else if (batch_data) {
                    // New batch from GRN - add it
                    product.batches.push({
                        batch_id: String(batch_id),
                        product_id: String(product_id),
                        quantity_available: quantity,
                        ...batch_data
                    });
                }

                // Update product total_stock if present
                if (typeof product.total_stock === 'number') {
                    product.total_stock += quantity;
                }

                product.updated_at = new Date().toISOString();
                await store.put(product);

                console.log(`${LOG_PREFIX} ✅ Added ${quantity} to product ${product_id}, batch ${batch_id}`);
            } catch (err) {
                console.warn(`${LOG_PREFIX} Could not add stock for product ${product_id}:`, err);
            }
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
    // ==================== BATCH HELPERS (Embedded in Products) ====================
    // Batches are now embedded in products as product.batches[]
    // These methods provide a consistent API for components

    /**
     * Get batches for a product
     * Checks both:
     * 1. The 'batches' store (from full/delta sync)
     * 2. Embedded product.batches (from search-with-batches API)
     */
    async getBatchesByProduct(productId: string | number): Promise<any[]> {
        const db = await this.init();
        const productIdStr = String(productId);

        // Source 1: Batches store (from sync)
        let batchesFromStore: any[] = [];
        try {
            const index = db.transaction('batches', 'readonly').store.index('product_id');
            batchesFromStore = await index.getAll(productIdStr);
        } catch (e) {
            console.warn(`${LOG_PREFIX} Error reading batches store:`, e);
        }

        // Source 2: Embedded batches in product (from search-with-batches)
        let embeddedBatches: any[] = [];
        try {
            const product = await this.get('products', productIdStr);
            embeddedBatches = product?.batches || [];
        } catch (e) {
            console.warn(`${LOG_PREFIX} Error reading product batches:`, e);
        }

        // Merge both sources, preferring batches store (more recent from sync)
        if (batchesFromStore.length > 0) {
            return batchesFromStore;
        }
        return embeddedBatches;
    }

    /**
     * Alias for getBatchesByProduct for backward compatibility
     */
    async getBatchesForProduct(productId: string | number): Promise<any[]> {
        return this.getBatchesByProduct(productId);
    }

    /**
     * Store/update batches for a product (MERGES with existing batches)
     */
    async storeBatches(batches: any[]): Promise<void> {
        if (!batches || batches.length === 0) return;

        // Group batches by product_id
        const batchesByProduct = new Map<string, any[]>();
        for (const batch of batches) {
            const productId = String(batch.product_id);
            if (!batchesByProduct.has(productId)) {
                batchesByProduct.set(productId, []);
            }
            batchesByProduct.get(productId)!.push(batch);
        }

        // Update each product - MERGE batches, don't replace
        for (const [productId, newBatches] of batchesByProduct) {
            const product = await this.get('products', productId);
            if (product) {
                const existingBatches = product.batches || [];

                // Create a map of existing batches by batch_id
                const batchMap = new Map<string, any>();
                for (const batch of existingBatches) {
                    batchMap.set(String(batch.batch_id), batch);
                }

                // Merge new batches (update existing or add new)
                for (const newBatch of newBatches) {
                    batchMap.set(String(newBatch.batch_id), {
                        ...batchMap.get(String(newBatch.batch_id)),
                        ...newBatch
                    });
                }

                product.batches = Array.from(batchMap.values());
                product.updated_at = new Date().toISOString();
                await this.update('products', product);
            }
        }
    }

    /**
     * Reserve batch quantity for offline invoice
     * Updates product.batches[].quantity_reserved_offline
     */
    async reserveBatchQuantity(productId: string | number, batchId: string | number, quantity: number): Promise<{ success: boolean; error?: string; usable?: number }> {
        const product = await this.get('products', String(productId));
        if (!product || !product.batches) {
            return { success: false, error: 'Product not found' };
        }

        const batch = product.batches.find((b: any) => String(b.batch_id) === String(batchId));
        if (!batch) {
            return { success: false, error: 'Batch not found' };
        }

        const available = batch.quantity_available || 0;
        const reserved = batch.quantity_reserved_offline || 0;
        const usable = available - reserved;

        if (usable < quantity) {
            return { success: false, error: `Insufficient stock. Available: ${usable}`, usable };
        }

        batch.quantity_reserved_offline = reserved + quantity;
        await this.update('products', product);

        console.log(`[OfflineDB] Reserved ${quantity} units on batch ${batchId}`);
        return { success: true, usable: usable - quantity };
    }

    /**
     * Clear reserved quantity after sync completes
     */
    async clearReservedQuantity(productId: string | number, batchId: string | number, quantity: number): Promise<void> {
        const product = await this.get('products', String(productId));
        if (!product || !product.batches) return;

        const batch = product.batches.find((b: any) => String(b.batch_id) === String(batchId));
        if (!batch) return;

        batch.quantity_reserved_offline = Math.max(0, (batch.quantity_reserved_offline || 0) - quantity);
        await this.update('products', product);
    }

    /**
     * Update batch quantity from server response
     */
    async updateBatchQuantity(productId: string | number, batchId: string | number, newQuantity: number): Promise<void> {
        const product = await this.get('products', String(productId));
        if (!product || !product.batches) return;

        const batch = product.batches.find((b: any) => String(b.batch_id) === String(batchId));
        if (batch) {
            batch.quantity_available = newQuantity;
            await this.update('products', product);
        }
    }

    // ==================== CUSTOMER ADDRESS METHODS ====================

    /**
     * Save a customer address locally (offline-first)
     * Returns the temp_id for the new address
     */
    async saveCustomerAddress(customerId: string | number, addressData: any): Promise<string> {
        const db = await this.init();
        const tempId = `temp_addr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const addressRecord = {
            id: tempId,
            customer_id: String(customerId),
            ...addressData,
            sync_status: SYNC_STATUS.PENDING,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        await db.put('customer_addresses', addressRecord);

        // Add to sync queue for background upload
        await this.syncQueue.addToSyncQueue(
            'customer_address',
            tempId,
            'create',
            addressRecord
        );

        console.log(`${LOG_PREFIX} Saved address ${tempId} for customer ${customerId} (pending sync)`);
        return tempId;
    }

    /**
     * Get all addresses for a customer (merges synced + pending)
     */
    async getCustomerAddresses(customerId: string | number): Promise<any[]> {
        const db = await this.init();
        const customerIdStr = String(customerId);

        // Get pending addresses from IndexedDB
        let pendingAddresses: any[] = [];
        try {
            const index = db.transaction('customer_addresses', 'readonly').store.index('customer_id');
            pendingAddresses = await index.getAll(customerIdStr);
        } catch (e) {
            console.warn(`${LOG_PREFIX} Error reading customer_addresses store:`, e);
        }

        // Get synced addresses embedded in customer record
        let syncedAddresses: any[] = [];
        try {
            const customer = await this.get('customers', customerIdStr);
            syncedAddresses = customer?.addresses || [];
        } catch (e) {
            console.warn(`${LOG_PREFIX} Error reading customer addresses:`, e);
        }

        // Merge: synced addresses + pending addresses (no duplicates)
        const syncedIds = new Set(syncedAddresses.map((a: any) => String(a.address_id || a.id)));
        const uniquePending = pendingAddresses.filter(a => !syncedIds.has(String(a.id)));

        console.log(`${LOG_PREFIX} Customer ${customerId}: ${syncedAddresses.length} synced, ${uniquePending.length} pending addresses`);

        return [...syncedAddresses, ...uniquePending];
    }

    /**
     * Mark a pending address as synced (after successful API upload)
     */
    async markAddressSynced(tempId: string, realAddressId: number): Promise<void> {
        const db = await this.init();

        try {
            const addr = await db.get('customer_addresses', tempId);
            if (addr) {
                // Update with real ID and synced status
                await db.delete('customer_addresses', tempId);
                addr.id = String(realAddressId);
                addr.address_id = realAddressId;
                addr.sync_status = SYNC_STATUS.SYNCED;
                addr.synced_at = new Date().toISOString();
                await db.put('customer_addresses', addr);

                console.log(`${LOG_PREFIX} Address ${tempId} synced as ${realAddressId}`);
            }
        } catch (e) {
            console.error(`${LOG_PREFIX} Error marking address synced:`, e);
        }
    }
}


// Export singleton instance
const offlineDB = new OfflineDatabase();
export default offlineDB;
