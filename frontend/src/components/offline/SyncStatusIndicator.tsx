/**
 * SyncStatusIndicator Component
 * 
 * Shows current sync status in a compact form.
 * Can be placed in header or status bar.
 */

import React from 'react';
import { useSyncStatus } from '../../hooks/offline/core';

interface SyncStatusIndicatorProps {
    className?: string;
    showLabel?: boolean;
}

export function SyncStatusIndicator({
    className = '',
    showLabel = true
}: SyncStatusIndicatorProps) {
    const { isReady, isSyncing, isOnline, pendingCount, lastSync } = useSyncStatus();

    // Syncing state
    if (isSyncing) {
        return (
            <div className={`flex items-center gap-2 text-blue-600 ${className}`}>
                <svg
                    className="w-4 h-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                >
                    <circle
                        className="opacity-25"
                        cx="12" cy="12" r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                    />
                    <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                </svg>
                {showLabel && <span className="text-sm">Syncing...</span>}
            </div>
        );
    }

    // Loading initial data
    if (!isReady) {
        return (
            <div className={`flex items-center gap-2 text-gray-500 ${className}`}>
                <svg
                    className="w-4 h-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                >
                    <circle
                        className="opacity-25"
                        cx="12" cy="12" r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                    />
                    <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                </svg>
                {showLabel && <span className="text-sm">Loading...</span>}
            </div>
        );
    }

    // Offline
    if (!isOnline) {
        return (
            <div className={`flex items-center gap-2 text-amber-600 ${className}`}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414" />
                </svg>
                {showLabel && <span className="text-sm">Offline</span>}
            </div>
        );
    }

    // Has pending changes
    if (pendingCount > 0) {
        return (
            <div className={`flex items-center gap-2 text-amber-600 ${className}`}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                {showLabel && <span className="text-sm">{pendingCount} pending</span>}
            </div>
        );
    }

    // All synced
    return (
        <div className={`flex items-center gap-2 text-green-600 ${className}`}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {showLabel && <span className="text-sm">Synced</span>}
        </div>
    );
}

export default SyncStatusIndicator;
