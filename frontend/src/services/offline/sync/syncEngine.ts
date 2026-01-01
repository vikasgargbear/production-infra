/**
 * Sync Engine for Offline Support
 * Handles syncing of local changes to backend
 */

import offlineDB from '../core/offlineDatabase';
import { invoicesApi, customersApi, productsApi, paymentsApi } from '../../api';
import apiClient from '../../api/apiClient';
import { cleanData } from '../../api/utils/dataUtils';
import { toast } from 'react-toastify';
import { AxiosResponse } from 'axios';
import { SyncQueueItem as BaseSyncQueueItem, SyncStats } from '../types';

// ==================== TYPE DEFINITIONS ====================

// Extend imported SyncQueueItem with additional fields used by SyncEngine
interface SyncQueueItem extends BaseSyncQueueItem {
    type?: string; // alias for entity_type
}

interface InvoiceData {
    invoice_id?: string;
    invoice_number?: string;
    invoice_date?: string;
    customer_id?: number;
    items?: Array<Record<string, unknown>>;
    _localId?: string;
    _syncStatus?: string;
    reserved_batches?: Array<{
        batch_id: string | number;
        quantity: number;
    }>;
    created_at?: string;
    [key: string]: unknown;
}

interface CustomerData {
    customer_id?: string;
    _localId?: string;
    _syncStatus?: string;
    [key: string]: unknown;
}

interface ProductData {
    product_id?: string;
    _localId?: string;
    _syncStatus?: string;
    [key: string]: unknown;
}

interface PaymentData {
    payment_id?: string;
    _localId?: string;
    _syncStatus?: string;
    [key: string]: unknown;
}

interface ConflictDetails {
    type?: string;
    productId?: number;
    batchId?: number;
    requiredQty?: number;
    availableQty?: number;
    invoiceNumber?: string;
}

interface SyncItemResult {
    success: boolean;
    conflict?: boolean;
    error?: string;
    details?: ConflictDetails;
    response?: AxiosResponse;
}

interface SyncResults {
    success: boolean;
    message?: string;
    synced: number;
    failed: number;
    conflicts: number;
    errors: string[];
    conflictDetails: Array<{
        itemType?: string;
        itemId?: string | number;
        error?: string;
        details?: ConflictDetails;
    }>;
}

interface SyncStatus {
    isSyncing: boolean;
    isAutoSyncEnabled: boolean;
    isOnline: boolean;
}

interface StockConflictError {
    isConflict: boolean;
    type: string;
    message: string;
    productId?: number;
    batchId?: number;
    requiredQty?: number;
    availableQty?: number;
    invoiceNumber?: string;
}

// ==================== SERVICE CLASS ====================

class SyncEngine {
    private isSyncing: boolean = false;
    private syncInterval: ReturnType<typeof setInterval> | null = null;
    private retryTimeout: ReturnType<typeof setTimeout> | null = null;
    private maxRetries: number = 3;
    private retryDelay: number = 5000; // 5 seconds

    /**
     * Start automatic sync (includes product sync for offline-first search)
     */
    startAutoSync(interval: number = 30000): void {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
        }

        this.syncInterval = setInterval(() => {
            if (navigator.onLine && !this.isSyncing) {
                this.startSync();
            }
        }, interval);

        // Initial sync if online
        if (navigator.onLine) {
            this.startSync();

            // Also sync products with batches for offline-first search (with auth check)
            this.syncProductsForOfflineFirst();
        }
    }

    private productSyncInProgress: boolean = false;

    /**
     * Sync products with batches for offline-first search
     * Uses the localFirstService for paginated bulk sync
     * IMPORTANT: Only runs if user is authenticated
     */
    private async syncProductsForOfflineFirst(): Promise<void> {
        // Prevent concurrent syncs
        if (this.productSyncInProgress) {
            console.log('[SyncEngine] Product sync already in progress, skipping...');
            return;
        }

        // Check if user is authenticated (has token)
        const token = localStorage.getItem('access_token');
        if (!token) {
            console.log('[SyncEngine] User not authenticated, skipping product sync');
            return;
        }

        this.productSyncInProgress = true;

        try {
            // Dynamic import to avoid circular dependencies
            const { default: localFirstService } = await import('../cache/localFirstService');

            if (localFirstService.needsSync()) {
                console.log('🔄 [SyncEngine] Triggering product sync for offline-first...');
                const result = await localFirstService.syncProductsWithBatches({
                    fullSync: false,
                    pageSize: 100
                });
                if (result.success) {
                    console.log(`✅ [SyncEngine] Product sync complete: ${result.productsSynced} products`);
                } else {
                    console.warn('⚠️ [SyncEngine] Product sync failed:', result.error);
                }
            } else {
                console.log('[SyncEngine] Product data is fresh, skipping sync');
            }
        } catch (error) {
            console.warn('[SyncEngine] Failed to sync products:', error);
        } finally {
            this.productSyncInProgress = false;
        }
    }

    /**
     * Stop automatic sync
     */
    stopAutoSync(): void {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
        if (this.retryTimeout) {
            clearTimeout(this.retryTimeout);
            this.retryTimeout = null;
        }
    }

    /**
     * Main sync function
     */
    async startSync(): Promise<SyncResults> {
        if (this.isSyncing || !navigator.onLine) {
            return {
                success: false,
                message: 'Already syncing or offline',
                synced: 0,
                failed: 0,
                conflicts: 0,
                errors: [],
                conflictDetails: []
            };
        }

        this.isSyncing = true;
        const results: SyncResults = {
            success: true,
            synced: 0,
            failed: 0,
            conflicts: 0,
            errors: [],
            conflictDetails: []
        };

        try {
            // Get all pending items from sync queue
            const pendingItems = await offlineDB.getSyncQueue() as SyncQueueItem[];

            if (pendingItems.length === 0) {
                this.isSyncing = false;
                return { ...results, message: 'No items to sync' };
            }

            // CRITICAL FIX: Sort items chronologically to maintain order
            const sortedItems = this.sortItemsChronologically(pendingItems);

            console.log(`[SyncEngine] Syncing ${sortedItems.length} items in chronological order`);

            // CRITICAL FIX: Process items SEQUENTIALLY to avoid race conditions
            for (const item of sortedItems) {
                try {
                    const syncResult = await this.syncItem(item);

                    if (syncResult.success) {
                        results.synced++;
                        if (typeof item.id === 'number') {
                            await offlineDB.removeFromSyncQueue(item.id);
                        }
                    } else if (syncResult.conflict) {
                        results.conflicts++;
                        if (typeof item.id === 'number') {
                            await offlineDB.markSyncConflict(item.id, syncResult.error || 'Unknown conflict');
                        }

                        results.conflictDetails.push({
                            itemType: item.entity_type,
                            itemId: item.entity_id,
                            error: syncResult.error,
                            details: syncResult.details
                        });
                    } else {
                        results.failed++;
                        if (syncResult.error) {
                            results.errors.push(syncResult.error);
                        }
                        if (typeof item.id === 'number') {
                            await offlineDB.incrementSyncRetry(item.id);
                        }
                    }
                } catch (error) {
                    console.error('[SyncEngine] Error syncing item:', error);
                    results.failed++;
                    results.errors.push((error as Error).message);
                }
            }

            // Update sync stats
            await offlineDB.updateSyncStats({
                lastSync: new Date().toISOString(),
                synced: results.synced,
                failed: results.failed,
                conflicts: results.conflicts
            });

            // Show notifications
            if (results.synced > 0) {
                toast.success(`Synced ${results.synced} items successfully`);
            }

            if (results.failed > 0) {
                toast.warning(`${results.failed} items failed to sync`);
            }

            if (results.conflicts > 0) {
                toast.info(`${results.conflicts} conflicts need manual resolution`);
            }

            return results;

        } catch (error) {
            console.error('[SyncEngine] Sync failed:', error);
            toast.error('Sync failed. Will retry automatically.');

            this.scheduleRetry();

            return {
                ...results,
                success: false,
                message: (error as Error).message
            };
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Sync individual item
     */
    async syncItem(item: SyncQueueItem): Promise<SyncItemResult> {
        try {
            let response: AxiosResponse;

            switch (item.entity_type || item.type) {
                case 'invoices':
                case 'invoice':
                    response = await this.syncInvoice(item.data as InvoiceData);
                    break;

                case 'customers':
                case 'customer':
                    response = await this.syncCustomer(item.data as CustomerData);
                    break;

                case 'products':
                case 'product':
                    response = await this.syncProduct(item.data as ProductData);
                    break;

                case 'payments':
                case 'payment':
                    response = await this.syncPayment(item.data as PaymentData);
                    break;

                default:
                    throw new Error(`Unknown sync type: ${item.entity_type || item.type}`);
            }

            return { success: true, response };

        } catch (error: unknown) {
            // Enhanced conflict detection
            const stockError = error as StockConflictError;
            if (stockError.isConflict) {
                return {
                    success: false,
                    conflict: true,
                    error: stockError.message,
                    details: {
                        type: stockError.type,
                        productId: stockError.productId,
                        batchId: stockError.batchId,
                        requiredQty: stockError.requiredQty,
                        availableQty: stockError.availableQty,
                        invoiceNumber: stockError.invoiceNumber
                    }
                };
            }

            // Check if it's a 409 conflict from server
            const axiosError = error as { response?: { status: number; data?: { detail?: { message?: string } } } };
            if (axiosError.response?.status === 409) {
                return {
                    success: false,
                    conflict: true,
                    error: axiosError.response?.data?.detail?.message || 'Data conflict - please review'
                };
            }

            // Regular error
            return {
                success: false,
                error: (error as Error).message || 'Sync failed'
            };
        }
    }

    /**
     * Sort items chronologically for proper sync order
     */
    sortItemsChronologically(items: SyncQueueItem[]): SyncQueueItem[] {
        return items.slice().sort((a, b) => {
            const dataA = a.data as { invoice_date?: string; created_at?: string };
            const dataB = b.data as { invoice_date?: string; created_at?: string };

            const timeA = dataA?.invoice_date || dataA?.created_at || a.created_at || '0';
            const timeB = dataB?.invoice_date || dataB?.created_at || b.created_at || '0';

            return new Date(timeA).getTime() - new Date(timeB).getTime();
        });
    }

    /**
     * Sync invoice
     */
    async syncInvoice(invoiceData: InvoiceData): Promise<AxiosResponse> {
        const { _localId, _syncStatus, reserved_batches, ...invoice } = invoiceData;

        try {
            let response: AxiosResponse;
            const cleanedInvoice = cleanData(invoice);

            if (invoice.invoice_id && !invoice.invoice_id.startsWith('LOCAL_')) {
                // Use centralized API module
                response = await invoicesApi.update(invoice.invoice_id, cleanedInvoice);
            } else {
                console.log('[SyncEngine] Syncing invoice with cleaned data:', JSON.stringify(cleanedInvoice, null, 2));
                // Use centralized API module
                response = await invoicesApi.create(cleanedInvoice as any); // Cast to any matching API expectation

                if (response.data) {
                    console.log('[SyncEngine] Invoice sync response:', response.data);
                }

                if (response.data?.invoice_id && _localId) {
                    await offlineDB.updateLocalId('invoices', _localId, response.data.invoice_id);
                }
            }

            // SUCCESS: Clear reserved quantities
            if (reserved_batches && Array.isArray(reserved_batches)) {
                for (const reservation of reserved_batches) {
                    await offlineDB.clearReservedQuantity(reservation.batch_id, reservation.quantity);
                }
                console.log(`✅ Cleared ${reserved_batches.length} batch reservations after successful sync`);
            }

            // Update batch quantities from server response if available
            if (response.data?.updated_batches) {
                for (const batchUpdate of response.data.updated_batches) {
                    await offlineDB.updateBatchQuantity(batchUpdate.batch_id, batchUpdate.new_quantity);
                }
            }

            return response;
        } catch (error: unknown) {
            const axiosError = error as {
                response?: {
                    status: number;
                    data?: {
                        detail?: {
                            error?: string;
                            message?: string;
                            product_id?: number;
                            batch_id?: number;
                            required_quantity?: number;
                            available_quantity?: number;
                            invoice_number?: string;
                        }
                    }
                }
            };

            if (axiosError.response?.status === 409 && axiosError.response?.data?.detail?.error === 'INSUFFICIENT_STOCK') {
                const details = axiosError.response.data.detail;
                throw {
                    isConflict: true,
                    type: 'INSUFFICIENT_STOCK',
                    message: details.message,
                    productId: details.product_id,
                    batchId: details.batch_id,
                    requiredQty: details.required_quantity,
                    availableQty: details.available_quantity,
                    invoiceNumber: details.invoice_number
                } as StockConflictError;
            }

            throw error;
        }
    }

    /**
     * Sync customer
     */
    async syncCustomer(customerData: CustomerData): Promise<AxiosResponse> {
        const { _localId, _syncStatus, ...customer } = customerData;
        const cleanedCustomer = cleanData(customer);

        if (customer.customer_id && !customer.customer_id.startsWith('LOCAL_')) {
            return await customersApi.update(customer.customer_id, cleanedCustomer);
        } else {
            const response = await customersApi.create(cleanedCustomer);

            if (response.data?.customer_id && _localId) {
                await offlineDB.updateLocalId('customers', _localId, response.data.customer_id);
            }

            return response;
        }
    }

    /**
     * Sync product
     */
    async syncProduct(productData: ProductData): Promise<AxiosResponse> {
        const { _localId, _syncStatus, ...product } = productData;
        const cleanedProduct = cleanData(product);

        if (product.product_id && !product.product_id.startsWith('LOCAL_')) {
            return await productsApi.update(product.product_id, cleanedProduct);
        } else {
            const response = await productsApi.create(cleanedProduct);

            if (response.data?.product_id && _localId) {
                await offlineDB.updateLocalId('products', _localId, response.data.product_id);
            }

            return response;
        }
    }

    /**
     * Sync payment
     */
    async syncPayment(paymentData: PaymentData): Promise<AxiosResponse> {
        const { _localId, _syncStatus, ...payment } = paymentData;
        const cleanedPayment = cleanData(payment);

        if (payment.payment_id && !payment.payment_id.startsWith('LOCAL_')) {
            return await paymentsApi.update(payment.payment_id, cleanedPayment);
        } else {
            return await paymentsApi.create(cleanedPayment);
        }
    }

    /**
     * Schedule retry for failed syncs
     */
    scheduleRetry(delay: number = this.retryDelay): void {
        if (this.retryTimeout) {
            clearTimeout(this.retryTimeout);
        }

        this.retryTimeout = setTimeout(() => {
            if (navigator.onLine && !this.isSyncing) {
                this.startSync();
            }
        }, delay);
    }

    /**
     * Force sync (user-triggered or when coming back online)
     * Syncs both pending queue items AND products with batches
     */
    async forceSync(): Promise<any> {
        if (!navigator.onLine) {
            toast.error('Cannot sync while offline');
            return {
                success: false,
                message: 'Device is offline',
                synced: 0,
                failed: 0,
                conflicts: 0,
                errors: [],
                conflictDetails: []
            };
        }

        if (this.isSyncing) {
            toast.info('Sync already in progress');
            return {
                success: false,
                message: 'Sync already in progress',
                synced: 0,
                failed: 0,
                conflicts: 0,
                errors: [],
                conflictDetails: []
            };
        }

        toast.info('Starting sync...');

        // Sync pending queue items
        const result = await this.startSync();

        // Also sync products with batches for offline-first search
        this.syncProductsForOfflineFirst();

        return result;
    }

    /**
     * Get sync status
     */
    getSyncStatus(): SyncStatus {
        return {
            isSyncing: this.isSyncing,
            isAutoSyncEnabled: !!this.syncInterval,
            isOnline: navigator.onLine
        };
    }

    /**
     * Clear all sync data (for debugging/reset)
     */
    async clearSyncData(): Promise<void> {
        await offlineDB.clearSyncQueue();
        await offlineDB.updateSyncStats({
            synced: 0,
            failed: 0,
            conflicts: 0
        });
        toast.info('Sync data cleared');
    }
}

// Export singleton instance
const syncEngine = new SyncEngine();
export default syncEngine;

// Re-export types
export type {
    SyncQueueItem,
    SyncResults,
    SyncStatus,
    SyncItemResult,
    InvoiceData,
    CustomerData,
    ProductData,
    PaymentData
};
