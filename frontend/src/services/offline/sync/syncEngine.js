// Sync Engine for Offline Support
import offlineDB from '../core/offlineDatabase';
import apiClient from '../../api/apiClient';
import { toast } from 'react-toastify';

class SyncEngine {
  constructor() {
    this.isSyncing = false;
    this.syncInterval = null;
    this.retryTimeout = null;
    this.maxRetries = 3;
    this.retryDelay = 5000; // 5 seconds
  }

  // Start automatic sync
  startAutoSync(interval = 30000) { // Default 30 seconds
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    this.syncInterval = setInterval(() => {
      if (navigator.onLine && !this.isSyncing) {
        this.startSync();
      }
    }, interval);

    // Initial sync if online
    if (navigator.onLine) {
      this.startSync();
    }
  }

  // Stop automatic sync
  stopAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }
  }

  // Main sync function
  async startSync() {
    if (this.isSyncing || !navigator.onLine) {
      return { success: false, message: 'Already syncing or offline' };
    }

    this.isSyncing = true;
    const results = {
      success: true,
      synced: 0,
      failed: 0,
      conflicts: 0,
      errors: [],
      conflictDetails: [] // Store detailed conflict info
    };

    try {


      // Get all pending items from sync queue
      const pendingItems = await offlineDB.getSyncQueue();

      if (pendingItems.length === 0) {

        return { ...results, message: 'No items to sync' };
      }

      // CRITICAL FIX: Sort items chronologically to maintain order
      // Invoices must sync in order of creation to prevent stock conflicts
      const sortedItems = this.sortItemsChronologically(pendingItems);

      console.log(`[SyncEngine] Syncing ${sortedItems.length} items in chronological order`);

      // CRITICAL FIX: Process items SEQUENTIALLY to avoid race conditions
      // Parallel syncing could cause concurrent stock deductions
      for (const item of sortedItems) {
        try {
          const syncResult = await this.syncItem(item);

          if (syncResult.success) {
            results.synced++;
            // Remove from sync queue
            await offlineDB.removeFromSyncQueue(item.id);
          } else if (syncResult.conflict) {
            results.conflicts++;
            // Mark as conflict for manual resolution
            await offlineDB.markSyncConflict(item.id, syncResult.error);

            // Store detailed conflict info for user notification
            results.conflictDetails.push({
              itemType: item.entity_type,
              itemId: item.entity_id,
              error: syncResult.error,
              details: syncResult.details
            });
          } else {
            results.failed++;
            results.errors.push(syncResult.error);
            // Increment retry count
            await offlineDB.incrementSyncRetry(item.id);
          }
        } catch (error) {
          console.error('[SyncEngine] Error syncing item:', error);
          results.failed++;
          results.errors.push(error.message);
        }
      }

      // Update sync stats
      await offlineDB.updateSyncStats({
        lastSync: new Date().toISOString(),
        synced: results.synced,
        failed: results.failed,
        conflicts: results.conflicts
      });



      // Show notification if items were synced
      if (results.synced > 0) {
        toast.success(`Synced ${results.synced} items successfully`);
      }

      if (results.failed > 0) {
        toast.warning(`${results.failed} items failed to sync`);
      }

      if (results.conflicts > 0) {
        toast.info(`${results.conflicts} conflicts need manual resolution`);
      }

      return results;

    } catch (error) {
      console.error('[SyncEngine] Sync failed:', error);
      toast.error('Sync failed. Will retry automatically.');

      // Schedule retry
      this.scheduleRetry();

      return {
        success: false,
        message: error.message,
        ...results
      };
    } finally {
      this.isSyncing = false;
    }
  }

  // Sync individual item
  async syncItem(item) {
    try {
      let response;

      switch (item.entity_type || item.type) {
        case 'invoices':
        case 'invoice':
          response = await this.syncInvoice(item.data);
          break;

        case 'customers':
        case 'customer':
          response = await this.syncCustomer(item.data);
          break;

        case 'products':
        case 'product':
          response = await this.syncProduct(item.data);
          break;

        case 'payments':
        case 'payment':
          response = await this.syncPayment(item.data);
          break;

        default:
          throw new Error(`Unknown sync type: ${item.entity_type || item.type}`);
      }

      return { success: true, response };

    } catch (error) {
      // Enhanced conflict detection
      if (error.isConflict) {
        // Our custom conflict object from syncInvoice
        return {
          success: false,
          conflict: true,
          error: error.message,
          details: {
            type: error.type,
            productId: error.productId,
            batchId: error.batchId,
            requiredQty: error.requiredQty,
            availableQty: error.availableQty,
            invoiceNumber: error.invoiceNumber
          }
        };
      }

      // Check if it's a 409 conflict from server
      if (error.response?.status === 409) {
        return {
          success: false,
          conflict: true,
          error: error.response?.data?.detail?.message || 'Data conflict - please review'
        };
      }

      // Regular error
      return {
        success: false,
        error: error.message || 'Sync failed'
      };
    }
  }

  // Sort items chronologically for proper sync order
  sortItemsChronologically(items) {
    return items.slice().sort((a, b) => {
      // Get timestamps from the data
      const timeA = a.data?.invoice_date || a.data?.created_at || a.created_at || 0;
      const timeB = b.data?.invoice_date || b.data?.created_at || b.created_at || 0;

      // Sort oldest first to maintain chronological order
      return new Date(timeA) - new Date(timeB);
    });
  }

  // Sync invoice
  async syncInvoice(invoiceData) {
    // Remove local-only fields
    const { _localId, _syncStatus, reserved_batches, ...invoice } = invoiceData;

    try {
      let response;

      // If it has a server ID, update; otherwise create
      if (invoice.invoice_id && !invoice.invoice_id.startsWith('LOCAL_')) {
        response = await apiClient.put(`/invoices/${invoice.invoice_id}`, invoice);
      } else {
        // Create new invoice
        response = await apiClient.post('/invoices', invoice);

        // Update local database with server ID
        if (response.data?.invoice_id) {
          await offlineDB.updateLocalId(
            'invoices',
            invoiceData._localId,
            response.data.invoice_id
          );
        }
      }

      // SUCCESS: Clear reserved quantities
      if (reserved_batches && Array.isArray(reserved_batches)) {
        for (const reservation of reserved_batches) {
          await offlineDB.clearReservedQuantity(
            reservation.batch_id,
            reservation.quantity
          );
        }
        console.log(`✅ Cleared ${reserved_batches.length} batch reservations after successful sync`);
      }

      // Update batch quantities from server response if available
      if (response.data?.updated_batches) {
        for (const batchUpdate of response.data.updated_batches) {
          await offlineDB.updateBatchQuantity(
            batchUpdate.batch_id,
            batchUpdate.new_quantity
          );
        }
      }

      return response;
    } catch (error) {
      // Enhanced error handling for stock conflicts
      if (error.response?.status === 409 && error.response?.data?.detail?.error === 'INSUFFICIENT_STOCK') {
        // This is a stock conflict - return detailed info
        const details = error.response.data.detail;
        throw {
          isConflict: true,
          type: 'INSUFFICIENT_STOCK',
          message: details.message,
          productId: details.product_id,
          batchId: details.batch_id,
          requiredQty: details.required_quantity,
          availableQty: details.available_quantity,
          invoiceNumber: details.invoice_number
        };
      }

      // Re-throw other errors
      throw error;
    }
  }

  // Sync customer
  async syncCustomer(customerData) {
    const { _localId, _syncStatus, ...customer } = customerData;

    if (customer.customer_id && !customer.customer_id.startsWith('LOCAL_')) {
      return await apiClient.put(`/customers/${customer.customer_id}`, customer);
    } else {
      const response = await apiClient.post('/customers', customer);

      if (response.data?.customer_id) {
        await offlineDB.updateLocalId(
          'customers',
          customerData._localId,
          response.data.customer_id
        );
      }

      return response;
    }
  }

  // Sync product
  async syncProduct(productData) {
    const { _localId, _syncStatus, ...product } = productData;

    if (product.product_id && !product.product_id.startsWith('LOCAL_')) {
      return await apiClient.put(`/products/${product.product_id}`, product);
    } else {
      const response = await apiClient.post('/products', product);

      if (response.data?.product_id) {
        await offlineDB.updateLocalId(
          'products',
          productData._localId,
          response.data.product_id
        );
      }

      return response;
    }
  }

  // Sync payment
  async syncPayment(paymentData) {
    const { _localId, _syncStatus, ...payment } = paymentData;

    if (payment.payment_id && !payment.payment_id.startsWith('LOCAL_')) {
      return await apiClient.put(`/payments/${payment.payment_id}`, payment);
    } else {
      return await apiClient.post('/payments', payment);
    }
  }

  // Schedule retry for failed syncs
  scheduleRetry(delay = this.retryDelay) {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
    }

    this.retryTimeout = setTimeout(() => {
      if (navigator.onLine && !this.isSyncing) {

        this.startSync();
      }
    }, delay);
  }

  // Force sync (user-triggered)
  async forceSync() {
    if (!navigator.onLine) {
      toast.error('Cannot sync while offline');
      return { success: false, message: 'Device is offline' };
    }

    if (this.isSyncing) {
      toast.info('Sync already in progress');
      return { success: false, message: 'Sync already in progress' };
    }

    toast.info('Starting sync...');
    return await this.startSync();
  }

  // Get sync status
  getSyncStatus() {
    return {
      isSyncing: this.isSyncing,
      isAutoSyncEnabled: !!this.syncInterval,
      isOnline: navigator.onLine
    };
  }

  // Clear all sync data (for debugging/reset)
  async clearSyncData() {
    await offlineDB.clearSyncQueue();
    await offlineDB.updateSyncStats({
      lastSync: null,
      synced: 0,
      failed: 0,
      conflicts: 0
    });
    toast.info('Sync data cleared');
  }
}

// Export singleton instance
const syncEngine = new SyncEngine();
export default syncEngine;