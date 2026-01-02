/**
 * Sync Status Indicator
 * Shows real-time sync status for offline-first data layer
 * 
 * Uses syncPullService for status (not localFirstService)
 */

import React, { useState, useEffect } from 'react';
import { Cloud, CloudOff, RefreshCw, CheckCircle2, AlertCircle, Wifi, WifiOff } from 'lucide-react';
import syncPullService from '../../../services/offline/sync/syncPullService';

interface SyncStatus {
  lastSyncTime: number | null;
  isOnline: boolean;
  productCount: number;
  customerCount: number;
}

interface SyncEvent {
  status: 'syncing' | 'synced' | 'error';
  type?: 'products' | 'customers';
  count?: number;
  error?: any;
}

export const SyncStatusIndicator: React.FC = () => {
  const [status, setStatus] = useState<SyncStatus>({
    lastSyncTime: syncPullService.getLastSyncTime(),
    isOnline: navigator.onLine,
    productCount: 0,
    customerCount: 0
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastEvent, setLastEvent] = useState<SyncEvent | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    // Get initial status
    syncPullService.getStatus().then(setStatus);

    // Listen for sync events
    const unsubscribe = syncPullService.onSyncEvent((event: SyncEvent) => {
      setLastEvent(event);
      setIsSyncing(event.status === 'syncing');

      if (event.status === 'synced') {
        syncPullService.getStatus().then(setStatus);
      }
    });

    // Listen for online/offline events
    const handleOnline = () => {
      setStatus(prev => ({ ...prev, isOnline: true }));
      // Trigger sync when coming online
      syncPullService.syncProducts({ fullSync: false }).catch(() => { });
    };

    const handleOffline = () => {
      setStatus(prev => ({ ...prev, isOnline: false }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleManualSync = () => {
    syncPullService.syncProducts({ fullSync: false });
  };

  const getStatusColor = () => {
    if (!status.isOnline) return 'text-gray-400';
    if (isSyncing) return 'text-blue-500 animate-pulse';
    if (lastEvent?.status === 'error') return 'text-red-500';
    if (lastEvent?.status === 'synced') return 'text-green-500';
    return 'text-gray-500';
  };

  const getStatusIcon = () => {
    if (!status.isOnline) {
      return <CloudOff className="w-4 h-4" />;
    }
    if (isSyncing) {
      return <RefreshCw className="w-4 h-4 animate-spin" />;
    }
    if (lastEvent?.status === 'error') {
      return <AlertCircle className="w-4 h-4" />;
    }
    if (lastEvent?.status === 'synced') {
      return <CheckCircle2 className="w-4 h-4" />;
    }
    return <Cloud className="w-4 h-4" />;
  };

  const getStatusText = () => {
    if (!status.isOnline) return 'Offline';
    if (isSyncing) return 'Syncing...';
    if (lastEvent?.status === 'error') return 'Sync Error';
    if (status.lastSyncTime) {
      const minutes = Math.floor((Date.now() - status.lastSyncTime) / 60000);
      if (minutes === 0) return 'Just synced';
      if (minutes < 60) return `Synced ${minutes}m ago`;
      const hours = Math.floor(minutes / 60);
      return `Synced ${hours}h ago`;
    }
    return 'Ready';
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowDetails(!showDetails)}
        className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${getStatusColor()} hover:bg-gray-100`}
        title={getStatusText()}
      >
        {getStatusIcon()}
        <span className="hidden sm:inline">{getStatusText()}</span>
        {status.isOnline ? (
          <Wifi className="w-3 h-3 text-green-500" />
        ) : (
          <WifiOff className="w-3 h-3 text-red-500" />
        )}
      </button>

      {/* Details Dropdown */}
      {showDetails && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 p-4 z-50">
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">Sync Status</h3>
              <button
                onClick={handleManualSync}
                disabled={isSyncing || !status.isOnline}
                className="p-1 text-blue-600 hover:bg-blue-50 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                title="Sync now"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Connection Status */}
            <div className="flex items-center gap-2">
              {status.isOnline ? (
                <>
                  <Wifi className="w-4 h-4 text-green-500" />
                  <span className="text-xs text-gray-600">Online</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-4 h-4 text-red-500" />
                  <span className="text-xs text-gray-600">Offline Mode</span>
                </>
              )}
            </div>

            {/* Data Stats */}
            <div className="text-xs text-gray-600">
              <div className="font-medium mb-1">Local Data:</div>
              <div>{status.productCount} products, {status.customerCount} customers</div>
            </div>

            {/* Sync Info */}
            {status.lastSyncTime && (
              <div className="text-xs text-gray-600">
                <div className="font-medium mb-1">Last Sync:</div>
                <div>{new Date(status.lastSyncTime).toLocaleString()}</div>
              </div>
            )}

            {/* Status Message */}
            <div className="text-xs">
              {!status.isOnline && (
                <div className="p-2 bg-yellow-50 border border-yellow-200 rounded text-yellow-800">
                  <strong>Offline Mode:</strong> Searches use local data. Changes will sync when online.
                </div>
              )}
              {lastEvent?.status === 'error' && (
                <div className="p-2 bg-red-50 border border-red-200 rounded text-red-800">
                  <strong>Sync Error:</strong> Unable to sync. Will retry automatically.
                </div>
              )}
              {isSyncing && (
                <div className="p-2 bg-blue-50 border border-blue-200 rounded text-blue-800">
                  <strong>Syncing:</strong> Updating local data...
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SyncStatusIndicator;
