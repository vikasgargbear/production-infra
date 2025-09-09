// Offline Status Indicator Component
import React from 'react';
import { WifiOff, Wifi, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { useNetworkStatus } from '../../../hooks/useNetworkStatus';

const OfflineIndicator = () => {
  const { isOnline, pendingCount, syncStats, forceSync } = useNetworkStatus();
  const totalPending = pendingCount + syncStats.failed + syncStats.conflict;

  // Don't show anything if online and no pending items
  if (isOnline && totalPending === 0) {
    return null;
  }

  const handleForceSync = async () => {
    if (isOnline && totalPending > 0) {
      await forceSync();
    }
  };

  return (
    <div 
      className={`fixed bottom-4 right-4 z-50 transition-all duration-300 ${
        !isOnline ? 'animate-pulse' : ''
      }`}
      data-network-indicator
    >
      <div 
        className={`flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg border ${
          !isOnline 
            ? 'bg-orange-50 border-orange-200 text-orange-700' 
            : totalPending > 0
            ? 'bg-blue-50 border-blue-200 text-blue-700'
            : 'bg-green-50 border-green-200 text-green-700'
        }`}
      >
        {/* Status Icon */}
        {!isOnline ? (
          <WifiOff className="w-5 h-5" />
        ) : syncStats.syncing > 0 ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : totalPending > 0 ? (
          <AlertCircle className="w-5 h-5" />
        ) : (
          <CheckCircle className="w-5 h-5" />
        )}

        {/* Status Text */}
        <div className="flex flex-col">
          <span className="font-medium text-sm">
            {!isOnline ? (
              'Offline Mode'
            ) : syncStats.syncing > 0 ? (
              `Syncing ${syncStats.syncing} items...`
            ) : totalPending > 0 ? (
              `${totalPending} items pending sync`
            ) : (
              'All synced'
            )}
          </span>

          {/* Detailed Stats */}
          {totalPending > 0 && (
            <div className="flex gap-3 text-xs mt-1">
              {syncStats.pending > 0 && (
                <span>📝 {syncStats.pending} pending</span>
              )}
              {syncStats.failed > 0 && (
                <span className="text-red-600">❌ {syncStats.failed} failed</span>
              )}
              {syncStats.conflict > 0 && (
                <span className="text-yellow-600">⚠️ {syncStats.conflict} conflicts</span>
              )}
            </div>
          )}
        </div>

        {/* Force Sync Button */}
        {isOnline && totalPending > 0 && (
          <button
            onClick={handleForceSync}
            className="ml-auto px-3 py-1 text-xs font-medium bg-white rounded border border-current hover:bg-gray-50 transition-colors"
            title="Force sync now"
          >
            Sync Now
          </button>
        )}

        {/* Offline Mode Info */}
        {!isOnline && (
          <div className="ml-auto text-xs">
            <Wifi className="w-4 h-4 opacity-30" />
          </div>
        )}
      </div>

      {/* Extended Information Tooltip */}
      {!isOnline && (
        <div className="mt-2 px-4 py-2 bg-gray-800 text-white text-xs rounded-lg">
          <p>You can continue working offline.</p>
          <p>Your changes will sync automatically when connection returns.</p>
        </div>
      )}
    </div>
  );
};

export default OfflineIndicator;