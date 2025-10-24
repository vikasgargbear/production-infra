/**
 * Sync Status Indicator
 * Shows real-time sync status for offline-first data layer
 */

import React, { useState, useEffect } from 'react';
import { Cloud, CloudOff, RefreshCw, CheckCircle2, AlertCircle, Wifi, WifiOff } from 'lucide-react';
import localFirstService from '../../../services/offline/localFirstService';

interface SyncStatus {
  initialized: boolean;
  syncing: boolean;
  lastSyncTime: number | null;
  isOnline: boolean;
}

interface SyncEvent {
  status: 'seeded' | 'syncing' | 'synced' | 'error';
  timestamp?: number;
  productsUpdated?: number;
  customersUpdated?: number;
  error?: any;
}

export const SyncStatusIndicator: React.FC = () => {
  const [status, setStatus] = useState<SyncStatus>({
    initialized: false,
    syncing: false,
    lastSyncTime: null,
    isOnline: navigator.onLine
  });
  const [lastSync, setLastSync] = useState<SyncEvent | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    // Initialize and get initial status
    const initStatus = localFirstService.getSyncStatus();
    setStatus(initStatus);

    // Listen for sync events
    const unsubscribe = localFirstService.onSyncStatusChange((event: SyncEvent) => {
      setLastSync(event);
      
      // Update status
      const newStatus = localFirstService.getSyncStatus();
      setStatus(newStatus);
    });

    // Listen for online/offline events
    const handleOnline = () => {
      setStatus(prev => ({ ...prev, isOnline: true }));
      // Trigger sync when coming online
      localFirstService.syncNow().catch(() => {});
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
    localFirstService.syncNow();
  };

  const getStatusColor = () => {
    if (!status.isOnline) return 'text-gray-400';
    if (status.syncing) return 'text-blue-500 animate-pulse';
    if (lastSync?.status === 'error') return 'text-red-500';
    if (lastSync?.status === 'synced') return 'text-green-500';
    return 'text-gray-500';
  };

  const getStatusIcon = () => {
    if (!status.isOnline) {
      return <CloudOff className="w-4 h-4" />;
    }
    if (status.syncing) {
      return <RefreshCw className="w-4 h-4 animate-spin" />;
    }
    if (lastSync?.status === 'error') {
      return <AlertCircle className="w-4 h-4" />;
    }
    if (lastSync?.status === 'synced') {
      return <CheckCircle2 className="w-4 h-4" />;
    }
    return <Cloud className="w-4 h-4" />;
  };

  const getStatusText = () => {
    if (!status.isOnline) return 'Offline';
    if (status.syncing) return 'Syncing...';
    if (lastSync?.status === 'error') return 'Sync Error';
    if (lastSync?.status === 'synced' && status.lastSyncTime) {
      const minutes = Math.floor((Date.now() - status.lastSyncTime) / 60000);
      if (minutes === 0) return 'Just synced';
      if (minutes < 60) return `Synced ${minutes}m ago`;
      const hours = Math.floor(minutes / 60);
      return `Synced ${hours}h ago`;
    }
    return 'Ready';
  };

  const formatLastSyncDetails = () => {
    if (!lastSync) return null;
    
    const parts: string[] = [];
    if (lastSync.productsUpdated !== undefined) {
      parts.push(`${lastSync.productsUpdated} products`);
    }
    if (lastSync.customersUpdated !== undefined) {
      parts.push(`${lastSync.customersUpdated} customers`);
    }
    
    return parts.length > 0 ? parts.join(', ') : 'No updates';
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
                disabled={status.syncing || !status.isOnline}
                className="p-1 text-blue-600 hover:bg-blue-50 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                title="Sync now"
              >
                <RefreshCw className={`w-4 h-4 ${status.syncing ? 'animate-spin' : ''}`} />
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

            {/* Sync Info */}
            {status.lastSyncTime && (
              <div className="text-xs text-gray-600">
                <div className="font-medium mb-1">Last Sync:</div>
                <div>{new Date(status.lastSyncTime).toLocaleString()}</div>
                {lastSync && (
                  <div className="mt-1 text-gray-500">
                    {formatLastSyncDetails()}
                  </div>
                )}
              </div>
            )}

            {/* Status Message */}
            <div className="text-xs">
              {!status.isOnline && (
                <div className="p-2 bg-yellow-50 border border-yellow-200 rounded text-yellow-800">
                  <strong>Offline Mode:</strong> Searches use local data. Changes will sync when online.
                </div>
              )}
              {lastSync?.status === 'error' && (
                <div className="p-2 bg-red-50 border border-red-200 rounded text-red-800">
                  <strong>Sync Error:</strong> Unable to sync. Will retry automatically.
                </div>
              )}
              {status.syncing && (
                <div className="p-2 bg-blue-50 border border-blue-200 rounded text-blue-800">
                  <strong>Syncing:</strong> Updating local data...
                </div>
              )}
              {!status.initialized && status.isOnline && (
                <div className="p-2 bg-gray-50 border border-gray-200 rounded text-gray-800">
                  <strong>Initializing:</strong> Loading data for offline use...
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
