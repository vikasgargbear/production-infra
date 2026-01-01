/**
 * Network Monitor Service
 * Monitors network connectivity and triggers sync when connection is restored
 */

import { toast, ToastOptions } from 'react-toastify';

// ==================== TYPE DEFINITIONS ====================

type NetworkStatus = 'online' | 'offline';
type NetworkListener = (status: NetworkStatus, isOnline: boolean) => void;

interface NetworkStatusInfo {
    isOnline: boolean;
    lastChecked: string;
}

// Lazy import to avoid circular dependency (networkMonitor <-> syncEngine)
const getSyncEngine = () => import('../sync/syncEngine').then(m => m.default);

// ==================== SERVICE CLASS ====================

class NetworkMonitor {
    private isOnline: boolean;
    private listeners: NetworkListener[] = [];
    private checkInterval: ReturnType<typeof setInterval> | null = null;
    private lastOnlineStatus: boolean;

    constructor() {
        this.isOnline = navigator.onLine;
        this.lastOnlineStatus = this.isOnline;

        // Bind event handlers
        this.handleOnline = this.handleOnline.bind(this);
        this.handleOffline = this.handleOffline.bind(this);

        // Start monitoring
        this.startMonitoring();
    }

    /**
     * Start monitoring network status
     */
    startMonitoring(): void {
        // Listen to browser online/offline events
        window.addEventListener('online', this.handleOnline);
        window.addEventListener('offline', this.handleOffline);

        // Disable periodic checking for now - rely on browser events
        // This prevents false offline detection due to API issues
        // this.checkInterval = setInterval(() => {
        //   this.checkConnection();
        // }, 30000);
    }

    /**
     * Stop monitoring network status
     */
    stopMonitoring(): void {
        window.removeEventListener('online', this.handleOnline);
        window.removeEventListener('offline', this.handleOffline);

        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    }

    /**
     * Check connection by making a request to the server
     */
    async checkConnection(): Promise<void> {
        try {
            // First check browser's online status
            if (!navigator.onLine) {
                if (this.lastOnlineStatus) {
                    this.lastOnlineStatus = false;
                    this.handleOffline();
                }
                return;
            }

            // Try to fetch a small resource from the server
            // Using GET instead of HEAD, and checking a valid endpoint
            const response = await fetch('/api/users/me', {
                method: 'GET',
                cache: 'no-cache',
                headers: {
                    'X-Connection-Check': 'true'
                }
            }).catch(() => null);

            const wasOffline = !this.lastOnlineStatus;
            // Consider online if we get any response (even 401/403)
            // Only consider offline if network request completely fails
            const isOnline = response !== null;

            this.lastOnlineStatus = isOnline;

            if (isOnline && wasOffline) {
                // Connection restored
                this.handleOnline();
            } else if (!isOnline && !wasOffline) {
                // Connection lost
                this.handleOffline();
            }
        } catch (error) {
            // Network error - we're offline
            if (this.lastOnlineStatus) {
                this.lastOnlineStatus = false;
                this.handleOffline();
            }
        }
    }

    /**
     * Handle coming online
     */
    handleOnline(): void {
        this.isOnline = true;
        console.log('[NetworkMonitor] Connection restored');

        const toastOptions: ToastOptions = {
            position: 'bottom-right',
            autoClose: 3000
        };

        // Use lazy import to avoid circular dependency
        getSyncEngine().then(syncEngine => {
            syncEngine.startSync().then((result) => {
                if (result.success && result.synced > 0) {
                    toast.success(`✅ Synced ${result.synced} items successfully`, toastOptions);
                }
            }).catch((error: Error) => {
                console.error('[NetworkMonitor] Sync failed:', error);
                if (error.message !== 'No items to sync') {
                    toast.error('Sync failed. Will retry automatically.', toastOptions);
                }
            });
        });

        // Notify all listeners
        this.notifyListeners('online');

        // Update UI indicators
        this.updateStatusIndicators();
    }

    /**
     * Handle going offline
     */
    handleOffline(): void {
        this.isOnline = false;

        // Don't show toast notification - let the visual indicator handle it
        // Only show toast when user tries to perform an action while offline

        // Notify all listeners
        this.notifyListeners('offline');

        // Update UI indicators
        this.updateStatusIndicators();
    }

    /**
     * Update DOM elements that show network status
     */
    updateStatusIndicators(): void {
        // Update all elements with network status class
        const indicators = document.querySelectorAll('[data-network-indicator]');
        indicators.forEach(indicator => {
            if (this.isOnline) {
                indicator.classList.remove('offline');
                indicator.classList.add('online');
            } else {
                indicator.classList.remove('online');
                indicator.classList.add('offline');
            }
        });

        // Update body class for global styling
        if (this.isOnline) {
            document.body.classList.remove('app-offline');
            document.body.classList.add('app-online');
        } else {
            document.body.classList.remove('app-online');
            document.body.classList.add('app-offline');
        }
    }

    /**
     * Subscribe to network status changes
     */
    subscribe(callback: NetworkListener): () => void {
        this.listeners.push(callback);

        // Return unsubscribe function
        return () => {
            this.listeners = this.listeners.filter(listener => listener !== callback);
        };
    }

    /**
     * Notify all listeners of status change
     */
    private notifyListeners(status: NetworkStatus): void {
        this.listeners.forEach(listener => {
            try {
                listener(status, this.isOnline);
            } catch (error) {
                console.error('[NetworkMonitor] Listener error:', error);
            }
        });
    }

    /**
     * Get current network status
     */
    getStatus(): NetworkStatusInfo {
        return {
            isOnline: this.isOnline,
            lastChecked: new Date().toISOString()
        };
    }

    /**
     * Force a connection check
     */
    async forceCheck(): Promise<NetworkStatusInfo> {
        await this.checkConnection();
        return this.getStatus();
    }
}

// Export singleton instance
const networkMonitor = new NetworkMonitor();
export default networkMonitor;

// Re-export types
export type { NetworkStatus, NetworkListener, NetworkStatusInfo };
