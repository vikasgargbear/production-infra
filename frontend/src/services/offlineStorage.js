/**
 * Enterprise-Grade Offline Storage Service
 * Replaces all mock data with real offline functionality
 */

class OfflineStorageService {
  constructor() {
    this.isOnline = navigator.onLine;
    this.offlineQueue = [];
    this.syncInProgress = false;
    
    // Initialize event listeners
    this.initializeEventListeners();
    
    // Load offline queue from storage
    this.loadOfflineQueue();
  }

  /**
   * Initialize online/offline event listeners
   */
  initializeEventListeners() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.handleOnline();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.handleOffline();
    });

    // Listen for visibility changes to sync when tab becomes visible
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.isOnline) {
        this.syncOfflineData();
      }
    });
  }

  /**
   * Handle coming back online
   */
  async handleOnline() {
    this.showOfflineIndicator(false);
    await this.syncOfflineData();
  }

  /**
   * Handle going offline
   */
  handleOffline() {
    this.showOfflineIndicator(true);
  }

  /**
   * Show/hide offline indicator
   */
  showOfflineIndicator(show) {
    let indicator = document.getElementById('offline-indicator');
    
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'offline-indicator';
      indicator.className = 'fixed top-0 left-0 right-0 z-50 p-2 text-center text-white font-medium';
      document.body.appendChild(indicator);
    }

    if (show) {
      indicator.className = 'fixed top-0 left-0 right-0 z-50 p-2 text-center text-white font-medium bg-red-600';
      indicator.textContent = '📴 You are currently offline. Data will be synced when connection is restored.';
    } else {
      indicator.className = 'fixed top-0 left-0 right-0 z-50 p-2 text-center text-white font-medium bg-green-600';
      indicator.textContent = '🌐 Connection restored. Syncing offline data...';
      setTimeout(() => {
        indicator.remove();
      }, 3000);
    }
  }

  /**
   * Store data offline with proper structure
   */
  async storeOffline(key, data, options = {}) {
    try {
      const offlineData = {
        data,
        timestamp: Date.now(),
        version: options.version || '1.0',
        metadata: options.metadata || {},
        lastSync: null
      };

      // Store in localStorage for critical data
      if (options.critical) {
        localStorage.setItem(`offline_${key}`, JSON.stringify(offlineData));
      }

      // Store in IndexedDB for larger datasets
      if (options.persistent) {
        await this.storeInIndexedDB(key, offlineData);
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Retrieve offline data
   */
  async getOffline(key, options = {}) {
    try {
      // Try localStorage first for critical data
      if (options.critical) {
        const localData = localStorage.getItem(`offline_${key}`);
        if (localData) {
          return JSON.parse(localData);
        }
      }

      // Try IndexedDB for persistent data
      if (options.persistent) {
        const dbData = await this.getFromIndexedDB(key);
        if (dbData) {
          return dbData;
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Queue operation for offline processing
   */
  queueOfflineOperation(operation) {
    const queueItem = {
      id: Date.now() + Math.random(),
      operation,
      timestamp: Date.now(),
      retryCount: 0,
      maxRetries: 3
    };

    this.offlineQueue.push(queueItem);
    this.saveOfflineQueue();
    
  }

  /**
   * Save offline queue to storage
   */
  saveOfflineQueue() {
    try {
      localStorage.setItem('offlineQueue', JSON.stringify(this.offlineQueue));
    } catch (error) {
    }
  }

  /**
   * Load offline queue from storage
   */
  loadOfflineQueue() {
    try {
      const saved = localStorage.getItem('offlineQueue');
      if (saved) {
        this.offlineQueue = JSON.parse(saved);
      }
    } catch (error) {
      this.offlineQueue = [];
    }
  }

  /**
   * Sync offline data when online
   */
  async syncOfflineData() {
    if (this.syncInProgress || this.offlineQueue.length === 0) {
      return;
    }

    this.syncInProgress = true;

    try {
      const successfulOperations = [];
      const failedOperations = [];

      for (const item of this.offlineQueue) {
        try {
          const success = await this.processOfflineOperation(item);
          if (success) {
            successfulOperations.push(item);
          } else {
            failedOperations.push(item);
          }
        } catch (error) {
          failedOperations.push(item);
        }
      }

      // Remove successful operations
      this.offlineQueue = failedOperations;
      this.saveOfflineQueue();

      
      if (successfulOperations.length > 0) {
        this.showSyncSuccess(successfulOperations.length);
      }
    } catch (error) {
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Process individual offline operation
   */
  async processOfflineOperation(queueItem) {
    try {
      const { operation } = queueItem;
      
      // Track retry attempts
      if (!queueItem.retryCount) {
        queueItem.retryCount = 0;
      }
      queueItem.retryCount++;
      
      // Max 3 retry attempts for any operation
      if (queueItem.retryCount > 3) {
        return true; // Remove from queue
      }
      
      switch (operation.type) {
        case 'stock_adjustment':
          return await this.syncStockAdjustment(operation.data);
        case 'payment_record':
          return await this.syncPaymentRecord(operation.data);
        case 'batch_update':
          return await this.syncBatchUpdate(operation.data);
        case 'invoice_create':
          return await this.syncInvoiceCreate(operation.data);
        case 'CREATE_CUSTOMER':
          return await this.syncCustomerCreate(operation.data, queueItem.retryCount);
        case 'CREATE_SUPPLIER':
          return await this.syncSupplierCreate(operation.data, queueItem.retryCount);
        default:
          return true; // Remove unknown operations from queue
      }
    } catch (error) {
      return false;
    }
  }

  /**
   * Sync stock adjustment
   */
  async syncStockAdjustment(data) {
    try {
      // Import the stock API dynamically to avoid circular dependencies
      const { stockApi } = await import('./api/modules/stock.api.js');
      const response = await stockApi.createAdjustment(data);
      return response.success;
    } catch (error) {
      return false;
    }
  }

  /**
   * Sync customer creation
   */
  async syncCustomerCreate(data, attemptCount = 1) {
    try {
      // Import the customers API dynamically to avoid circular dependencies
      const { customersApi } = await import('./api');
      const response = await customersApi.create(data);
      return response.success;
    } catch (error) {
      // For 422 errors (validation), don't retry - the data is invalid
      if (error?.response?.status === 422) {
        return true; // Return true to remove from queue
      }
      // For other errors, only log on first attempt
      if (attemptCount === 1) {
      }
      return false;
    }
  }

  /**
   * Sync supplier creation
   */
  async syncSupplierCreate(data, attemptCount = 1) {
    try {
      // Import the suppliers API dynamically to avoid circular dependencies
      const { suppliersApi } = await import('./api');
      const response = await suppliersApi.create(data);
      return response.success;
    } catch (error) {
      // For 422 errors (validation), don't retry - the data is invalid
      if (error?.response?.status === 422) {
        return true; // Return true to remove from queue
      }
      // For other errors, only log on first attempt
      if (attemptCount === 1) {
      }
      return false;
    }
  }

  /**
   * Sync payment record
   */
  async syncPaymentRecord(data) {
    try {
      // Import the payments API dynamically to avoid circular dependencies
      const { paymentsApi } = await import('./api/modules/payments.api.js');
      const response = await paymentsApi.createPayment(data);
      return response.success;
    } catch (error) {
      return false;
    }
  }

  /**
   * Sync batch update
   */
  async syncBatchUpdate(data) {
    try {
      // Import the stock API dynamically to avoid circular dependencies
      const { stockApi } = await import('./api/modules/stock.api.js');
      const response = await stockApi.updateBatch(data.batch_id, data.updates);
      return response.success;
    } catch (error) {
      return false;
    }
  }

  /**
   * Sync invoice creation
   */
  async syncInvoiceCreate(data) {
    try {
      // Import the invoices API dynamically to avoid circular dependencies
      const { invoicesApi } = await import('./api/modules/invoices.api.js');
      const response = await invoicesApi.createInvoice(data);
      return response.success;
    } catch (error) {
      return false;
    }
  }

  /**
   * Show sync success message
   */
  showSyncSuccess(count) {
    // Try to use the toast system if available
    if (window.__toast) {
      window.__toast.success(`Synced ${count} offline operations`);
    } else {
      // Fallback to console log
    }
  }

  /**
   * Check if data is stale (older than specified time)
   */
  isDataStale(data, maxAgeMinutes = 60) {
    if (!data || !data.timestamp) return true;
    
    const age = Date.now() - data.timestamp;
    const maxAge = maxAgeMinutes * 60 * 1000;
    
    return age > maxAge;
  }

  /**
   * Clear old offline data
   */
  clearOldData(maxAgeHours = 24) {
    try {
      const maxAge = maxAgeHours * 60 * 60 * 1000;
      const now = Date.now();
      
      // Clear old localStorage data
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('offline_')) {
          try {
            const data = JSON.parse(localStorage.getItem(key));
            if (data.timestamp && (now - data.timestamp) > maxAge) {
              localStorage.removeItem(key);
            }
          } catch (error) {
            // Remove invalid data
            localStorage.removeItem(key);
          }
        }
      });
    } catch (error) {
    }
  }

  /**
   * Get offline status
   */
  getOfflineStatus() {
    return {
      isOnline: this.isOnline,
      offlineQueueLength: this.offlineQueue.length,
      syncInProgress: this.syncInProgress,
      lastSync: this.lastSync
    };
  }

  /**
   * Initialize IndexedDB for larger datasets
   */
  async initializeIndexedDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('PharmaERP_Offline', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Create object stores for different data types
        if (!db.objectStoreNames.contains('stockData')) {
          db.createObjectStore('stockData', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('batchData')) {
          db.createObjectStore('batchData', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('paymentData')) {
          db.createObjectStore('paymentData', { keyPath: 'key' });
        }
      };
    });
  }

  /**
   * Store data in IndexedDB
   */
  async storeInIndexedDB(key, data) {
    try {
      const db = await this.initializeIndexedDB();
      const transaction = db.transaction(['stockData', 'batchData', 'paymentData'], 'readwrite');
      
      // Determine which store to use based on key prefix
      let storeName = 'stockData';
      if (key.startsWith('batch_')) storeName = 'batchData';
      if (key.startsWith('payment_')) storeName = 'paymentData';
      
      const store = transaction.objectStore(storeName);
      await store.put({ key, ...data });
      
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get data from IndexedDB
   */
  async getFromIndexedDB(key) {
    try {
      const db = await this.initializeIndexedDB();
      const transaction = db.transaction(['stockData', 'batchData', 'paymentData'], 'readonly');
      
      // Determine which store to use based on key prefix
      let storeName = 'stockData';
      if (key.startsWith('batch_')) storeName = 'batchData';
      if (key.startsWith('payment_')) storeName = 'paymentData';
      
      const store = transaction.objectStore(storeName);
      const request = store.get(key);
      
      return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      return null;
    }
  }
}

// Create singleton instance
const offlineStorage = new OfflineStorageService();

// Export the service
export default offlineStorage;

// Also export the class for testing
export { OfflineStorageService }; 