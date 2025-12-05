import React, { useState, useEffect } from 'react';
import { Clock, AlertCircle } from 'lucide-react';
import offlineDB from '../../../services/offline/offlineDatabase';
import { useNetworkStatus } from '../../../hooks/useNetworkStatus';

/**
 * Shows pending offline stock reservations
 * Displays when there are batches with pending sync quantities
 */
const OfflineStockIndicator = () => {
  const [pendingBatches, setPendingBatches] = useState([]);
  const { isOnline } = useNetworkStatus();
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    loadPendingBatches();
    
    // Refresh every 10 seconds
    const interval = setInterval(loadPendingBatches, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadPendingBatches = async () => {
    try {
      const batches = await offlineDB.getBatchesWithReservations();
      setPendingBatches(batches);
    } catch (error) {
      console.error('Failed to load pending batches:', error);
    }
  };

  if (pendingBatches.length === 0) {
    return null; // Nothing to show
  }

  const totalReserved = pendingBatches.reduce(
    (sum, batch) => sum + (batch.quantity_reserved_offline || 0), 
    0
  );

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div 
        className={`
          bg-white rounded-lg shadow-lg border-2 p-4 min-w-[280px] max-w-[400px]
          ${isOnline ? 'border-amber-400' : 'border-gray-400'}
        `}
      >
        {/* Header */}
        <div 
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setShowDetails(!showDetails)}
        >
          <div className="flex items-center gap-2">
            <div className={`
              p-2 rounded-full 
              ${isOnline ? 'bg-amber-100' : 'bg-gray-100'}
            `}>
              <Clock className={`
                w-4 h-4 
                ${isOnline ? 'text-amber-600' : 'text-gray-600'}
              `} />
            </div>
            <div>
              <p className="font-semibold text-sm text-gray-900">
                {totalReserved} Units Pending Sync
              </p>
              <p className="text-xs text-gray-500">
                {pendingBatches.length} batches affected
              </p>
            </div>
          </div>
          <button className="text-gray-400 hover:text-gray-600">
            <AlertCircle className="w-4 h-4" />
          </button>
        </div>

        {/* Status */}
        <div className="mt-2">
          {isOnline ? (
            <div className="flex items-center gap-2 text-xs text-amber-600">
              <div className="w-2 h-2 bg-amber-600 rounded-full animate-pulse" />
              Syncing when possible...
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <div className="w-2 h-2 bg-gray-400 rounded-full" />
              Will sync when online
            </div>
          )}
        </div>

        {/* Details (expandable) */}
        {showDetails && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <p className="text-xs text-gray-600 mb-2 font-medium">
              Batches with pending quantities:
            </p>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {pendingBatches.slice(0, 10).map(batch => (
                <div 
                  key={batch.batch_id}
                  className="flex justify-between text-xs bg-gray-50 p-2 rounded"
                >
                  <span className="text-gray-700 font-medium">
                    {batch.product_name || batch.batch_number || `Batch #${batch.batch_id}`}
                  </span>
                  <span className="text-amber-600 font-semibold">
                    -{batch.quantity_reserved_offline}
                  </span>
                </div>
              ))}
              {pendingBatches.length > 10 && (
                <p className="text-xs text-gray-500 italic text-center pt-1">
                  +{pendingBatches.length - 10} more batches
                </p>
              )}
            </div>
          </div>
        )}

        {/* Help text */}
        <div className="mt-3 pt-3 border-t border-gray-200">
          <p className="text-xs text-gray-500">
            These quantities are reserved from offline invoices and will be synced to server automatically.
          </p>
        </div>
      </div>
    </div>
  );
};

export default OfflineStockIndicator;
