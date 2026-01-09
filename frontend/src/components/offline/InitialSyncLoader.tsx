/**
 * InitialSyncLoader Component
 * 
 * Full-screen loading state during initial sync.
 * Shows progress and what's being synced.
 */

import React from 'react';
import { useOfflineReady } from '../../hooks/offline/core';

interface InitialSyncLoaderProps {
    children: React.ReactNode;
}

export function InitialSyncLoader({ children }: InitialSyncLoaderProps) {
    const { isReady, isLoading, progress, error } = useOfflineReady();

    if (isReady) {
        return <>{children}</>;
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center max-w-md p-6">
                    <svg
                        className="w-16 h-16 mx-auto text-red-500 mb-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        />
                    </svg>
                    <h2 className="text-xl font-semibold text-gray-900 mb-2">
                        Sync Failed
                    </h2>
                    <p className="text-gray-600 mb-4">{error}</p>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center">
                    {/* Logo or icon */}
                    <div className="mb-8">
                        <svg
                            className="w-16 h-16 mx-auto text-blue-600 animate-pulse"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
                            />
                        </svg>
                    </div>

                    <h2 className="text-xl font-semibold text-gray-900 mb-2">
                        Loading Data...
                    </h2>

                    <p className="text-gray-600 mb-6">
                        {progress < 10 && 'Initializing...'}
                        {progress >= 10 && progress < 40 && 'Syncing customers...'}
                        {progress >= 40 && progress < 90 && 'Syncing products...'}
                        {progress >= 90 && 'Finishing up...'}
                    </p>

                    {/* Progress bar */}
                    <div className="w-64 mx-auto">
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-blue-600 transition-all duration-300 ease-out"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                        <p className="text-sm text-gray-500 mt-2">{Math.round(progress)}%</p>
                    </div>
                </div>
            </div>
        );
    }

    return null;
}

export default InitialSyncLoader;
