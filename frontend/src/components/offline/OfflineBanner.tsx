/**
 * OfflineBanner Component
 * 
 * Shows a banner when the app is offline.
 * Displays pending changes count.
 */

import React from 'react';
import { useSyncStatus } from '../../hooks/offline/core';

interface OfflineBannerProps {
    className?: string;
}

export function OfflineBanner({ className = '' }: OfflineBannerProps) {
    const { isOnline, pendingCount } = useSyncStatus();

    if (isOnline) return null;

    return (
        <div
            className={`bg-amber-500 text-white px-4 py-2 flex items-center justify-between ${className}`}
            role="alert"
            aria-live="polite"
        >
            <div className="flex items-center gap-2">
                <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414"
                    />
                </svg>
                <span className="font-medium">You're offline</span>
            </div>

            {pendingCount > 0 && (
                <span className="text-sm bg-amber-600 px-2 py-1 rounded">
                    {pendingCount} {pendingCount === 1 ? 'change' : 'changes'} pending sync
                </span>
            )}
        </div>
    );
}

export default OfflineBanner;
