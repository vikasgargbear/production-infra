import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { useNetworkStatus } from '../../../hooks/useNetworkStatus';
import offlineDB from '../../../services/offline/core/offlineDatabase';
import ConflictResolutionModal from '../../sales/modals/ConflictResolutionModal';

// ==================== TYPE DEFINITIONS ====================

interface SyncStats {
    pending: number;
    syncing: number;
    failed: number;
    conflict: number;
}

interface SyncQueueItem {
    id: string | number;
    sync_status: string;
    conflict_reason?: string;
    [key: string]: any;
}

// ==================== COMPONENT ====================

const OfflineIndicator: React.FC = () => {
    const { isOnline, pendingCount, syncStats, forceSync } = useNetworkStatus() as any;
    const totalPending = pendingCount + syncStats.failed + syncStats.conflict;

    const [showConflicts, setShowConflicts] = useState<boolean>(false);
    const [conflicts, setConflicts] = useState<SyncQueueItem[]>([]);

    useEffect(() => {
        if (syncStats.conflict > 0) {
            loadConflicts();
        }
    }, [syncStats.conflict]);

    const loadConflicts = async (): Promise<void> => {
        try {
            const queue = await (offlineDB as any).getSyncQueue();
            const conflictItems = queue.filter((item: SyncQueueItem) =>
                item.sync_status === 'conflict' || item.conflict_reason
            );
            setConflicts(conflictItems);
        } catch (error) {
            console.error('Failed to load conflicts:', error);
        }
    };

    if (isOnline && totalPending === 0) {
        return null;
    }

    const handleForceSync = async (): Promise<void> => {
        if (isOnline && totalPending > 0) {
            await forceSync();
        }
    };

    const handleViewConflicts = (): void => {
        setShowConflicts(true);
    };

    const handleConflictResolved = async (): Promise<void> => {
        await loadConflicts();
        await forceSync();
    };

    return (
        <div
            className={`fixed bottom-4 right-4 z-50 transition-all duration-300 ${!isOnline ? 'animate-pulse' : ''}`}
            data-network-indicator
        >
            <div
                className={`flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg border ${!isOnline
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

                {/* Actions */}
                {isOnline && totalPending > 0 && (
                    <div className="ml-auto flex gap-2">
                        {syncStats.conflict > 0 && (
                            <button
                                onClick={handleViewConflicts}
                                className="px-3 py-1 text-xs font-medium bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors"
                                title="View conflicts"
                            >
                                View Conflicts
                            </button>
                        )}
                        <button
                            onClick={handleForceSync}
                            className="px-3 py-1 text-xs font-medium bg-white rounded border border-current hover:bg-gray-50 transition-colors"
                            title="Force sync now"
                        >
                            Sync Now
                        </button>
                    </div>
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

            {/* Conflict Resolution Modal */}
            <ConflictResolutionModal
                isOpen={showConflicts}
                onClose={() => setShowConflicts(false)}
                conflicts={conflicts as any}
                onResolved={handleConflictResolved}
            />
        </div>
    );
};

export default OfflineIndicator;
