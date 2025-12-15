// React Hook for Network Status
import { useState, useEffect } from 'react';
import networkMonitor from '../services/offline/core/networkMonitor';
import offlineDB from '../services/offline/core/offlineDatabase';

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(networkMonitor.isOnline);
  const [syncStats, setSyncStats] = useState({
    pending: 0,
    syncing: 0,
    synced: 0,
    failed: 0,
    conflict: 0
  });

  useEffect(() => {
    // Subscribe to network status changes
    const unsubscribe = networkMonitor.subscribe((status, online) => {
      setIsOnline(online);

      // Update sync stats when status changes
      updateSyncStats();
    });

    // Initial sync stats
    updateSyncStats();

    // Update sync stats periodically
    const interval = setInterval(updateSyncStats, 10000); // Every 10 seconds

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const updateSyncStats = async () => {
    try {
      const stats = await offlineDB.getSyncStats();
      setSyncStats(stats);
    } catch (error) {
      console.error('Failed to get sync stats:', error);
    }
  };

  const forceSync = async () => {
    if (isOnline) {
      const { default: syncEngine } = await import('../services/offline/sync/syncEngine');
      return syncEngine.startSync();
    }
    return { success: false, message: 'Cannot sync while offline' };
  };

  return {
    isOnline,
    syncStats,
    pendingCount: syncStats.pending,
    forceSync,
    updateSyncStats
  };
}