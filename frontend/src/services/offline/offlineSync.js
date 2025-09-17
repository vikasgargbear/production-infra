/**
 * Offline Sync Service
 * Handles data synchronization between local SQLite and remote PostgreSQL
 */

import localforage from 'localforage';

class OfflineSyncService {
  constructor() {
    this.syncQueue = localforage.createInstance({
      name: 'pharmaERP',
      storeName: 'syncQueue'
    });

    this.localData = localforage.createInstance({
      name: 'pharmaERP',
      storeName: 'localData'
    });

    this.isOnline = navigator.onLine;
    this.isSyncing = false;
    this.syncInterval = null;

    // Setup event listeners
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Listen for online/offline events
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.startAutoSync();
      this.syncNow();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.stopAutoSync();
    });

    // Listen for Electron IPC messages
    if (window.electronAPI) {
      window.addEventListener('message', (event) => {
        if (event.data.type === 'SYNC_INITIATED') {
          this.syncNow();
        }
      });
    }
  }

  /**
   * Queue an operation for sync
   */
  async queueOperation(operation) {
    const queueItem = {
      id: `op_${Date.now()}_${Math.random()}`,
      timestamp: new Date().toISOString(),
      operation: operation.type,
      entity: operation.entity,
      data: operation.data,
      status: 'pending',
      retryCount: 0
    };

    await this.syncQueue.setItem(queueItem.id, queueItem);

    // Try to sync immediately if online
    if (this.isOnline && !this.isSyncing) {
      this.syncNow();
    }

    return queueItem.id;
  }

  /**
   * Perform synchronization
   */
  async syncNow() {
    if (this.isSyncing) return;

    this.isSyncing = true;
    console.log('Starting sync...');

    try {
      // 1. Push local changes to server
      await this.pushLocalChanges();

      // 2. Pull remote changes
      await this.pullRemoteChanges();

      // 3. Resolve conflicts if any
      await this.resolveConflicts();

      console.log('Sync completed successfully');
      this.notifyUser('Data synced successfully', 'success');

    } catch (error) {
      console.error('Sync failed:', error);
      this.notifyUser('Sync failed. Will retry when online.', 'error');
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Push local changes to remote server
   */
  async pushLocalChanges() {
    const pendingOps = [];

    // Get all pending operations
    await this.syncQueue.iterate((value, key) => {
      if (value.status === 'pending') {
        pendingOps.push({ key, value });
      }
    });

    console.log(`Found ${pendingOps.length} pending operations`);

    for (const { key, value } of pendingOps) {
      try {
        // Send to server based on operation type
        let response;

        switch (value.operation) {
          case 'CREATE':
            response = await this.pushCreate(value);
            break;
          case 'UPDATE':
            response = await this.pushUpdate(value);
            break;
          case 'DELETE':
            response = await this.pushDelete(value);
            break;
          default:
            console.warn(`Unknown operation type: ${value.operation}`);
            continue;
        }

        if (response.success) {
          // Mark as synced
          value.status = 'synced';
          value.syncedAt = new Date().toISOString();
          value.remoteId = response.remoteId;
          await this.syncQueue.setItem(key, value);
        } else {
          // Increment retry count
          value.retryCount++;
          if (value.retryCount > 3) {
            value.status = 'failed';
            value.error = response.error;
          }
          await this.syncQueue.setItem(key, value);
        }
      } catch (error) {
        console.error(`Failed to sync operation ${key}:`, error);
        value.retryCount++;
        await this.syncQueue.setItem(key, value);
      }
    }
  }

  /**
   * Pull changes from remote server
   */
  async pullRemoteChanges() {
    try {
      // Get last sync timestamp
      const lastSync = await this.localData.getItem('lastSyncTimestamp') || '2020-01-01T00:00:00Z';

      // Fetch changes from server
      const response = await fetch('/api/sync/changes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ since: lastSync })
      });

      if (!response.ok) throw new Error('Failed to fetch remote changes');

      const changes = await response.json();
      console.log(`Received ${changes.length} remote changes`);

      // Apply changes locally
      for (const change of changes) {
        await this.applyRemoteChange(change);
      }

      // Update last sync timestamp
      await this.localData.setItem('lastSyncTimestamp', new Date().toISOString());

    } catch (error) {
      console.error('Failed to pull remote changes:', error);
      throw error;
    }
  }

  /**
   * Apply a remote change locally
   */
  async applyRemoteChange(change) {
    const localKey = `${change.entity}_${change.id}`;
    const localData = await this.localData.getItem(localKey);

    if (!localData) {
      // New item, just save it
      await this.localData.setItem(localKey, change.data);
      return;
    }

    // Check for conflicts
    if (localData.modifiedAt > change.modifiedAt) {
      // Local is newer, queue for conflict resolution
      await this.queueConflict(localData, change.data);
    } else {
      // Remote is newer, update local
      await this.localData.setItem(localKey, change.data);
    }
  }

  /**
   * Resolve conflicts between local and remote data
   */
  async resolveConflicts() {
    const conflicts = await this.localData.getItem('conflicts') || [];

    if (conflicts.length === 0) return;

    console.log(`Resolving ${conflicts.length} conflicts`);

    for (const conflict of conflicts) {
      // Default strategy: Last Write Wins
      // You can implement more sophisticated strategies here
      const resolution = this.resolveConflict(conflict.local, conflict.remote);

      const localKey = `${conflict.entity}_${conflict.id}`;
      await this.localData.setItem(localKey, resolution);
    }

    // Clear conflicts
    await this.localData.removeItem('conflicts');
  }

  /**
   * Conflict resolution strategy
   */
  resolveConflict(localData, remoteData) {
    // Strategy 1: Last Write Wins
    if (localData.modifiedAt > remoteData.modifiedAt) {
      return localData;
    }
    return remoteData;

    // Strategy 2: Merge (for specific fields)
    // return {
    //   ...remoteData,
    //   ...localData,
    //   modifiedAt: new Date().toISOString()
    // };
  }

  /**
   * Queue a conflict for resolution
   */
  async queueConflict(localData, remoteData) {
    const conflicts = await this.localData.getItem('conflicts') || [];
    conflicts.push({
      id: localData.id,
      entity: localData.entity,
      local: localData,
      remote: remoteData,
      timestamp: new Date().toISOString()
    });
    await this.localData.setItem('conflicts', conflicts);
  }

  /**
   * Push create operation
   */
  async pushCreate(operation) {
    const response = await fetch(`/api/${operation.entity}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(operation.data)
    });

    if (!response.ok) {
      throw new Error(`Failed to create ${operation.entity}`);
    }

    const result = await response.json();
    return { success: true, remoteId: result.id };
  }

  /**
   * Push update operation
   */
  async pushUpdate(operation) {
    const response = await fetch(`/api/${operation.entity}/${operation.data.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(operation.data)
    });

    if (!response.ok) {
      throw new Error(`Failed to update ${operation.entity}`);
    }

    return { success: true, remoteId: operation.data.id };
  }

  /**
   * Push delete operation
   */
  async pushDelete(operation) {
    const response = await fetch(`/api/${operation.entity}/${operation.data.id}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new Error(`Failed to delete ${operation.entity}`);
    }

    return { success: true };
  }

  /**
   * Start automatic sync
   */
  startAutoSync(intervalMinutes = 5) {
    this.stopAutoSync();

    this.syncInterval = setInterval(() => {
      if (this.isOnline) {
        this.syncNow();
      }
    }, intervalMinutes * 60 * 1000);
  }

  /**
   * Stop automatic sync
   */
  stopAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  /**
   * Notify user about sync status
   */
  notifyUser(message, type) {
    // If in Electron, use native notifications
    if (window.electronAPI) {
      window.electronAPI.notify(message, type);
    } else {
      // Use web notifications or toast
      console.log(`[${type.toUpperCase()}] ${message}`);
    }
  }

  /**
   * Get sync status
   */
  async getSyncStatus() {
    const pendingCount = await this.getPendingOperationsCount();
    const lastSync = await this.localData.getItem('lastSyncTimestamp');
    const conflicts = await this.localData.getItem('conflicts') || [];

    return {
      isOnline: this.isOnline,
      isSyncing: this.isSyncing,
      pendingOperations: pendingCount,
      lastSyncTime: lastSync,
      conflictCount: conflicts.length
    };
  }

  /**
   * Get count of pending operations
   */
  async getPendingOperationsCount() {
    let count = 0;
    await this.syncQueue.iterate((value) => {
      if (value.status === 'pending') count++;
    });
    return count;
  }

  /**
   * Clear all local data (use with caution)
   */
  async clearLocalData() {
    await this.syncQueue.clear();
    await this.localData.clear();
    console.log('Local data cleared');
  }

  /**
   * Export local data for backup
   */
  async exportLocalData() {
    const data = {
      syncQueue: {},
      localData: {},
      exportedAt: new Date().toISOString()
    };

    await this.syncQueue.iterate((value, key) => {
      data.syncQueue[key] = value;
    });

    await this.localData.iterate((value, key) => {
      data.localData[key] = value;
    });

    return data;
  }

  /**
   * Import local data from backup
   */
  async importLocalData(data) {
    // Clear existing data
    await this.clearLocalData();

    // Import sync queue
    for (const [key, value] of Object.entries(data.syncQueue)) {
      await this.syncQueue.setItem(key, value);
    }

    // Import local data
    for (const [key, value] of Object.entries(data.localData)) {
      await this.localData.setItem(key, value);
    }

    console.log('Local data imported successfully');
  }
}

// Create singleton instance
const offlineSync = new OfflineSyncService();

// Start auto-sync if online
if (navigator.onLine) {
  offlineSync.startAutoSync();
}

export default offlineSync;