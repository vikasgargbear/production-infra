/**
 * Local-First Invoice Service
 * 
 * Instantly creates invoices locally, syncs to backend asynchronously
 * Provides enterprise-grade speed and offline capability
 */

import { openDB } from 'idb';
import { apiClient } from '../../api';

const DB_NAME = 'aaso_invoices';
const DB_VERSION = 1;
const INVOICE_STORE = 'invoices';
const SYNC_QUEUE_STORE = 'sync_queue';

class LocalInvoiceService {
  constructor() {
    this.db = null;
    this.syncInProgress = false;
  }

  async initialize() {
    if (this.db) return this.db;

    this.db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Invoices store
        if (!db.objectStoreNames.contains(INVOICE_STORE)) {
          const invoiceStore = db.createObjectStore(INVOICE_STORE, {
            keyPath: 'invoice_number'
          });
          invoiceStore.createIndex('created_at', 'created_at');
          invoiceStore.createIndex('customer_id', 'customer_id');
          invoiceStore.createIndex('synced', 'synced');
        }

        // Sync queue store
        if (!db.objectStoreNames.contains(SYNC_QUEUE_STORE)) {
          const syncStore = db.createObjectStore(SYNC_QUEUE_STORE, {
            keyPath: 'id',
            autoIncrement: true
          });
          syncStore.createIndex('timestamp', 'timestamp');
          syncStore.createIndex('status', 'status');
        }
      }
    });

    // Start background sync
    this.startBackgroundSync();

    return this.db;
  }

  /**
   * Create invoice instantly (local-first)
   * Returns immediately, syncs to backend asynchronously
   */
  async createInvoice(invoiceData) {
    await this.initialize();

    // Add timestamp and local flags
    const localInvoice = {
      ...invoiceData,
      created_at: new Date().toISOString(),
      synced: false,
      local_id: `local_${Date.now()}`,
      sync_attempts: 0
    };

    // Save locally (instant)
    await this.db.put(INVOICE_STORE, localInvoice);

    // Add to sync queue
    await this.addToSyncQueue({
      type: 'CREATE_INVOICE',
      data: invoiceData,
      invoice_number: invoiceData.invoice_number,
      timestamp: Date.now(),
      status: 'pending'
    });

    // Trigger async sync (non-blocking)
    this.syncToBackend(invoiceData.invoice_number).catch(err => {
      console.error('Background sync failed:', err);
      // Silent fail - will retry later
    });

    return {
      success: true,
      invoice_number: invoiceData.invoice_number,
      local: true,
      message: 'Invoice created locally, syncing to server...'
    };
  }

  /**
   * Sync single invoice to backend
   */
  async syncToBackend(invoiceNumber) {
    await this.initialize();

    const invoice = await this.db.get(INVOICE_STORE, invoiceNumber);
    if (!invoice || invoice.synced) return;

    try {
      // Send to backend
      const response = await apiClient.post('/invoices/', invoice);

      if (response.data) {
        // Mark as synced
        invoice.synced = true;
        invoice.backend_id = response.data.invoice_id || response.data.id;
        invoice.synced_at = new Date().toISOString();
        await this.db.put(INVOICE_STORE, invoice);

        // Remove from sync queue
        await this.removeFromSyncQueue(invoiceNumber);

        return { success: true, data: response.data };
      }
    } catch (error) {
      // Update sync attempts
      invoice.sync_attempts = (invoice.sync_attempts || 0) + 1;
      invoice.last_sync_error = error.message;
      invoice.last_sync_attempt = new Date().toISOString();
      await this.db.put(INVOICE_STORE, invoice);

      throw error;
    }
  }

  /**
   * Add to sync queue
   */
  async addToSyncQueue(item) {
    await this.initialize();
    await this.db.add(SYNC_QUEUE_STORE, item);
  }

  /**
   * Remove from sync queue
   */
  async removeFromSyncQueue(invoiceNumber) {
    await this.initialize();
    const tx = this.db.transaction(SYNC_QUEUE_STORE, 'readwrite');
    const store = tx.objectStore(SYNC_QUEUE_STORE);
    const all = await store.getAll();

    for (const item of all) {
      if (item.invoice_number === invoiceNumber) {
        await store.delete(item.id);
      }
    }
    await tx.done;
  }

  /**
   * Background sync worker
   * Runs every 30 seconds to sync pending invoices
   */
  startBackgroundSync() {
    // Sync every 30 seconds
    setInterval(async () => {
      if (this.syncInProgress || !navigator.onLine) return;

      this.syncInProgress = true;
      try {
        await this.syncPendingInvoices();
      } catch (error) {
        // Silent fail
      } finally {
        this.syncInProgress = false;
      }
    }, 30000); // Every 30 seconds

    // INSTANT SYNC when connection is restored
    window.addEventListener('online', async () => {
      if (this.syncInProgress) return;

      console.log('🌐 Connection restored - syncing invoices...');
      this.syncInProgress = true;
      try {
        await this.syncPendingInvoices();
        const status = await this.getSyncStatus();
        if (status.pending === 0) {
          console.log('✅ All invoices synced to server');
        }
      } catch (error) {
        console.error('Sync on reconnect failed:', error);
      } finally {
        this.syncInProgress = false;
      }
    });
  }

  /**
   * Sync all pending invoices
   */
  async syncPendingInvoices() {
    await this.initialize();

    const tx = this.db.transaction(INVOICE_STORE, 'readonly');
    const store = tx.objectStore(INVOICE_STORE);
    const index = store.index('synced');
    const unsynced = await index.getAll(false);

    for (const invoice of unsynced) {
      // Skip if too many failed attempts
      if (invoice.sync_attempts >= 5) continue;

      try {
        await this.syncToBackend(invoice.invoice_number);
      } catch (error) {
        // Continue to next invoice
      }
    }
  }

  /**
   * Get invoice from local storage
   */
  async getInvoice(invoiceNumber) {
    await this.initialize();
    return this.db.get(INVOICE_STORE, invoiceNumber);
  }

  /**
   * Get all invoices (with pagination)
   */
  async getAllInvoices(options = {}) {
    await this.initialize();

    const { limit = 50, offset = 0, synced = null } = options;

    let invoices;
    if (synced !== null) {
      const index = this.db.transaction(INVOICE_STORE).objectStore(INVOICE_STORE).index('synced');
      invoices = await index.getAll(synced);
    } else {
      invoices = await this.db.getAll(INVOICE_STORE);
    }

    // Sort by created_at descending
    invoices.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return invoices.slice(offset, offset + limit);
  }

  /**
   * Get sync status
   */
  async getSyncStatus() {
    await this.initialize();

    const allInvoices = await this.db.getAll(INVOICE_STORE);
    const pending = allInvoices.filter(inv => !inv.synced);

    return {
      total: allInvoices.length,
      synced: allInvoices.length - pending.length,
      pending: pending.length,
      failed: pending.filter(inv => inv.sync_attempts >= 5).length
    };
  }

  /**
   * Force sync now
   */
  async forceSyncNow() {
    await this.syncPendingInvoices();
    return this.getSyncStatus();
  }

  /**
   * Clear old synced invoices (keep last 100)
   */
  async clearOldInvoices() {
    await this.initialize();

    const allInvoices = await this.db.getAll(INVOICE_STORE);
    const synced = allInvoices.filter(inv => inv.synced);

    // Keep only last 100 synced invoices
    if (synced.length > 100) {
      synced.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      const toDelete = synced.slice(0, synced.length - 100);

      for (const invoice of toDelete) {
        await this.db.delete(INVOICE_STORE, invoice.invoice_number);
      }
    }
  }
}

// Singleton instance
const localInvoiceService = new LocalInvoiceService();

// Expose globally for debugging
if (typeof window !== 'undefined') {
  window.localInvoiceService = localInvoiceService;
}

export default localInvoiceService;
