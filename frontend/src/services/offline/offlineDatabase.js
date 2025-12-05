// IndexedDB Service for Offline Storage
import { openDB } from 'idb';

const DB_NAME = 'PharmaERPOffline';
const DB_VERSION = 2;  // Incremented for batches store

// Sync status enum
export const SYNC_STATUS = {
  PENDING: 'pending',      // Created offline
  SYNCING: 'syncing',     // Currently syncing
  SYNCED: 'synced',       // Successfully synced
  CONFLICT: 'conflict',   // Needs resolution
  FAILED: 'failed'        // Sync failed
};

class OfflineDatabase {
  constructor() {
    this.db = null;
  }

  async init() {
    if (this.db) return this.db;

    this.db = await openDB(DB_NAME, DB_VERSION, {
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
            keyPath: 'temp_id' 
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

        // Batches store (for fast offline batch selection)
        if (!db.objectStoreNames.contains('batches')) {
          const batchStore = db.createObjectStore('batches', { keyPath: 'batch_id' });
          batchStore.createIndex('product_id', 'product_id');  // Fast lookup by product
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
      },
    });

    return this.db;
  }

  // Generic CRUD operations
  async add(storeName, data) {
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
    await tx.complete;
    
    // Add to sync queue if offline
    if (!navigator.onLine) {
      await this.addToSyncQueue(storeName, id, 'create');
    }
    
    return id;
  }

  async get(storeName, key) {
    const db = await this.init();
    return db.get(storeName, key);
  }

  async getAll(storeName, indexName = null, query = null) {
    const db = await this.init();
    
    if (indexName && query) {
      const index = db.transaction(storeName).store.index(indexName);
      return index.getAll(query);
    }
    
    return db.getAll(storeName);
  }

  async update(storeName, data) {
    const db = await this.init();
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    
    // Update metadata
    const updatedData = {
      ...data,
      updated_at: new Date().toISOString()
    };
    
    await store.put(updatedData);
    await tx.complete;
    
    // Add to sync queue if offline
    if (!navigator.onLine) {
      await this.addToSyncQueue(storeName, data.id || data.temp_id, 'update');
    }
    
    return updatedData;
  }

  async delete(storeName, key) {
    const db = await this.init();
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    
    await store.delete(key);
    await tx.complete;
    
    // Add to sync queue if offline
    if (!navigator.onLine) {
      await this.addToSyncQueue(storeName, key, 'delete');
    }
  }

  // Sync Queue Management
  async addToSyncQueue(entityType, entityId, action) {
    const db = await this.init();
    const tx = db.transaction('sync_queue', 'readwrite');
    const store = tx.objectStore('sync_queue');
    
    await store.add({
      entity_type: entityType,
      entity_id: entityId,
      action: action,
      created_at: new Date().toISOString(),
      attempts: 0
    });
    
    await tx.complete;
  }

  async getSyncQueue() {
    const db = await this.init();
    return db.getAll('sync_queue');
  }

  // async removeFromSyncQueue(id) {
  //   const db = await this.init();
  //   return db.delete('sync_queue', id);
  // }

  // Preallocated Numbers Management
  async addPreallocatedNumbers(type, numbers) {
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
    
    await tx.complete;
  }

  async getNextPreallocatedNumber(type) {
    const db = await this.init();
    const tx = db.transaction('preallocated_numbers', 'readwrite');
    const store = tx.objectStore('preallocated_numbers');
    const index = store.index('type');
    
    // Get first unused number of this type
    const cursor = await index.openCursor(IDBKeyRange.only(type));
    
    while (cursor) {
      if (!cursor.value.used) {
        // Mark as used
        cursor.value.used = true;
        cursor.value.used_at = new Date().toISOString();
        await cursor.update(cursor.value);
        await tx.complete;
        return cursor.value.number;
      }
      await cursor.continue();
    }
    
    // No preallocated numbers available
    throw new Error(`No preallocated ${type} numbers available. Please connect to internet to get more.`);
  }

  // Search operations
  async searchCustomers(query) {
    const db = await this.init();
    const allCustomers = await db.getAll('customers');
    
    const searchTerm = query.toLowerCase();
    return allCustomers.filter(customer => 
      customer.name?.toLowerCase().includes(searchTerm) ||
      customer.phone?.includes(searchTerm) ||
      customer.email?.toLowerCase().includes(searchTerm)
    );
  }

  async searchProducts(query) {
    const db = await this.init();
    const allProducts = await db.getAll('products');
    
    const searchTerm = query.toLowerCase();
    return allProducts.filter(product => 
      product.name?.toLowerCase().includes(searchTerm) ||
      product.sku?.toLowerCase().includes(searchTerm) ||
      product.barcode?.includes(searchTerm)
    );
  }

  // Sync conflict management
  async markSyncConflict(id, error) {
    const db = await this.init();
    const item = await db.get('sync_queue', id);
    if (item) {
      item.sync_status = SYNC_STATUS.CONFLICT;
      item.conflict_reason = error;
      item.conflict_at = new Date().toISOString();
      return db.put('sync_queue', item);
    }
  }

  async incrementSyncRetry(id) {
    const db = await this.init();
    const item = await db.get('sync_queue', id);
    if (item) {
      item.retry_count = (item.retry_count || 0) + 1;
      item.last_retry_at = new Date().toISOString();
      return db.put('sync_queue', item);
    }
  }

  async updateSyncStats(stats) {
    const db = await this.init();
    const tx = db.transaction('sync_stats', 'readwrite');
    const store = tx.objectStore('sync_stats');
    
    const existing = await store.get('current') || {};
    const updated = {
      ...existing,
      ...stats,
      updated_at: new Date().toISOString()
    };
    
    await store.put(updated, 'current');
    await tx.complete;
    return updated;
  }

  async getSyncStats() {
    const db = await this.init();
    const stats = await db.get('sync_stats', 'current') || {};
    
    // Count pending items
    const syncQueue = await this.getSyncQueue();
    const pending = syncQueue.filter(item => item.sync_status === SYNC_STATUS.PENDING).length;
    const syncing = syncQueue.filter(item => item.sync_status === SYNC_STATUS.SYNCING).length;
    const failed = syncQueue.filter(item => item.sync_status === SYNC_STATUS.FAILED).length;
    const conflict = syncQueue.filter(item => item.sync_status === SYNC_STATUS.CONFLICT).length;
    
    return {
      pending,
      syncing,
      synced: stats.synced || 0,
      failed,
      conflict,
      lastSync: stats.lastSync
    };
  }

  async clearSyncQueue() {
    const db = await this.init();
    const tx = db.transaction('sync_queue', 'readwrite');
    await tx.objectStore('sync_queue').clear();
    await tx.complete;
  }

  async updateLocalId(storeName, localId, serverId) {
    const db = await this.init();
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    
    // Find item by local ID
    const items = await store.getAll();
    const item = items.find(i => i._localId === localId);
    
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
    
    await tx.complete;
  }

  // Bulk operations for initial data load
  async bulkLoad(storeName, data) {
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
    
    await tx.complete;
  }

  // Clear all offline data
  async clearAll() {
    const db = await this.init();
    const storeNames = ['customers', 'products', 'invoices', 'sales_orders', 'payments', 'sync_queue', 'batches'];
    
    for (const storeName of storeNames) {
      const tx = db.transaction(storeName, 'readwrite');
      await tx.objectStore(storeName).clear();
      await tx.complete;
    }
  }

  // ====== BATCH OPERATIONS (for offline-first batch selection) ======
  
  /**
   * Get batches for a specific product (fast IndexedDB lookup)
   * @param {string|number} productId - Product ID
   * @returns {Promise<Array>} Array of batches
   */
  async getBatchesByProduct(productId) {
    const db = await this.init();
    const tx = db.transaction('batches', 'readonly');
    const index = tx.objectStore('batches').index('product_id');
    
    // Get all batches for this product
    const batches = await index.getAll(String(productId));
    
    return batches || [];
  }

  /**
   * Store batches in IndexedDB for offline use
   * @param {Array} batches - Array of batch objects
   */
  async storeBatches(batches) {
    if (!Array.isArray(batches) || batches.length === 0) return;
    
    const db = await this.init();
    const tx = db.transaction('batches', 'readwrite');
    const store = tx.objectStore('batches');
    
    const timestamp = new Date().toISOString();
    
    for (const batch of batches) {
      await store.put({
        ...batch,
        updated_at: timestamp  // Track when cached
      });
    }
    
    await tx.done;
  }

  /**
   * Clear batches for a specific product (cache invalidation)
   * @param {string|number} productId - Product ID
   */
  async clearBatchesForProduct(productId) {
    const db = await this.init();
    const tx = db.transaction('batches', 'readwrite');
    const index = tx.objectStore('batches').index('product_id');
    const store = tx.objectStore('batches');
    
    // Get all batches for this product
    const batches = await index.getAll(String(productId));
    
    // Delete each batch
    for (const batch of batches) {
      await store.delete(batch.batch_id);
    }
    
    await tx.done;
  }

  /**
   * Clear all cached batches
   */
  async clearAllBatches() {
    const db = await this.init();
    const tx = db.transaction('batches', 'readwrite');
    await tx.objectStore('batches').clear();
    await tx.done;
  }

  // Get sync statistics
  async getSyncStats() {
    const db = await this.init();
    const stats = {
      pending: 0,
      syncing: 0,
      synced: 0,
      failed: 0,
      conflict: 0
    };
    
    const storeNames = ['invoices', 'sales_orders', 'payments'];
    
    for (const storeName of storeNames) {
      const items = await db.getAll(storeName);
      items.forEach(item => {
        if (item.sync_status) {
          stats[item.sync_status.toLowerCase()]++;
        }
      });
    }
    
    const queueItems = await db.getAll('sync_queue');
    stats.pending += queueItems.length;
    
    return stats;
  }
}

// Export singleton instance
const offlineDB = new OfflineDatabase();
export default offlineDB;