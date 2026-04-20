/**
 * Sync Engine (Push Service)
 * 
 * Handles PUSHING local changes TO the server.
 * This processes the sync queue and uploads pending invoices, customers, etc.
 * 
 * For PULLING data FROM server, use syncPullService.
 */

import offlineDB from '../core/offlineDatabase';
import { invoicesApi, customersApi, productsApi, paymentsApi, ordersApi, challansApi, stockApi, suppliersApi } from '../../api';
import { submitCustomerPayment } from '../../api/modules/finance/payments.api';
import { cleanData } from '../../api/utils/dataUtils';
import { toast } from 'react-toastify';
import { AxiosResponse } from 'axios';
// SyncStats is used via offlineDB.updateSyncStats() calls throughout this file
import { SyncQueueItem as BaseSyncQueueItem, SyncStats } from '../types';
import type { SyncTrigger } from './deltaSyncService';

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
    temp_id?: string;
    _localId?: string;
    _syncStatus?: string;
    reserved_batches?: Array<{
        product_id: string | number;
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
    temp_id?: string;
    _localId?: string;
    _syncStatus?: string;
    [key: string]: unknown;
}

interface PaymentReceiptData {
    receipt_id?: string;
    temp_id?: string;
    _localId?: string;
    _syncStatus?: string;
    customer_id?: string | number;
    receipt_date?: string;
    amount?: number;
    payment_method?: string;
    reference_number?: string;
    bank_name?: string;
    notes?: string;
    allocated_invoices?: Array<{ invoice_id: string | number; invoice_number?: string; allocated_amount: number }>;
    [key: string]: unknown;
}

interface CustomerAddressData {
    customer_id?: string | number;
    address_line1?: string;
    address_line2?: string;
    city?: string;
    state?: string;
    pincode?: string;
    mobile?: string;
    landmark?: string;
    address_type?: string;
    is_default?: boolean;
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

// ==================== GENERIC SYNC ENTITY CONFIG ====================

interface SyncEntityConfig {
    idField: string;
    tableName: string;
    getApi: () => Promise<{ [key: string]: Function }> | { [key: string]: Function };
    createMethod?: string;        // default: 'create'
    hasUpdate?: boolean;          // default: false (most are create-only during sync)
    deltaSyncTables?: string[];
    deltaSyncReason?: SyncTrigger;  // default: 'manual'
}

const SYNC_ENTITY_REGISTRY: Record<string, SyncEntityConfig> = {
    customers:         { idField: 'customer_id',    tableName: 'customers',         getApi: () => customersApi,  hasUpdate: true },
    products:          { idField: 'product_id',     tableName: 'products',          getApi: () => productsApi,   hasUpdate: true },
    suppliers:         { idField: 'supplier_id',    tableName: 'suppliers',         getApi: () => suppliersApi,  hasUpdate: true },
    sales_orders:      { idField: 'order_id',       tableName: 'sales_orders',      getApi: () => ordersApi,     deltaSyncTables: ['products'] },
    delivery_challans: { idField: 'challan_id',     tableName: 'delivery_challans', getApi: () => challansApi,   deltaSyncTables: ['batches', 'products'] },
    purchase_orders:   { idField: 'order_id',       tableName: 'purchase_orders',   getApi: async () => (await import('../../api')).purchasesApi },
    purchase_entries:  { idField: 'invoice_id',     tableName: 'purchase_entries',  getApi: async () => (await import('../../api')).purchasesApi, createMethod: 'createEntry', deltaSyncTables: ['batches', 'products'], deltaSyncReason: 'grn_approved' },
    sales_returns:     { idField: 'return_id',      tableName: 'sales_returns',     getApi: async () => (await import('../../api')).returnsApi,   createMethod: 'createSaleReturn', deltaSyncTables: ['batches', 'products'] },
    purchase_returns:  { idField: 'return_id',      tableName: 'purchase_returns',  getApi: async () => (await import('../../api')).returnsApi,   createMethod: 'createPurchaseReturn', deltaSyncTables: ['batches', 'products'] },
    credit_debit_notes:{ idField: 'note_id',        tableName: 'credit_debit_notes', getApi: async () => (await import('../../api')).notesApi },
    stock_adjustments: { idField: 'adjustment_id',  tableName: 'stock_adjustments', getApi: () => stockApi,      createMethod: 'createAdjustment', deltaSyncTables: ['batches', 'products'], deltaSyncReason: 'stock_adjusted' },
};

// ==================== SERVICE CLASS ====================

class SyncEngine {
    private isSyncing: boolean = false;
    private syncInterval: ReturnType<typeof setInterval> | null = null;
    private retryTimeout: ReturnType<typeof setTimeout> | null = null;
    private maxRetries: number = 3;
    private retryDelay: number = 5000; // 5 seconds
    private pullSyncInProgress: boolean = false;

    /**
     * Start automatic sync
     * - Pushes local changes to server (invoices, customers, etc.)
     * - Triggers pull sync for products (via syncPullService)
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

            // Also trigger PULL sync for products (via syncPullService)
            this.triggerPullSync();
        }
    }

    /**
     * Trigger pull sync via syncPullService
     * Keeps push/pull logic separated
     */
    private async triggerPullSync(): Promise<void> {
        if (this.pullSyncInProgress) {
            console.log('[SyncEngine] Pull sync already in progress');
            return;
        }

        const token = localStorage.getItem('authToken');
        if (!token) {
            console.log('[SyncEngine] Not authenticated, skipping pull sync');
            return;
        }

        this.pullSyncInProgress = true;

        try {
            // Use syncPullService for all pull operations
            const { default: syncPullService } = await import('./syncPullService');

            if (syncPullService.needsSync()) {
                console.log('🔄 [SyncEngine] Triggering pull sync...');

                // Sync products
                const productResult = await syncPullService.syncProducts({ fullSync: false });
                if (productResult.success) {
                    console.log(`✅ [SyncEngine] Product sync complete: ${productResult.itemsSynced} products`);
                } else {
                    console.warn('⚠️ [SyncEngine] Product sync failed:', productResult.error);
                }

                // Sync customers (with embedded addresses)
                const customerResult = await syncPullService.syncCustomers({});
                if (customerResult.success) {
                    console.log(`✅ [SyncEngine] Customer sync complete: ${customerResult.itemsSynced} customers`);
                } else {
                    console.warn('⚠️ [SyncEngine] Customer sync failed:', customerResult.error);
                }

                // Sync employees
                const employeeResult = await syncPullService.syncEmployees();
                if (employeeResult.success) {
                    console.log(`✅ [SyncEngine] Employee sync complete: ${employeeResult.itemsSynced} employees`);
                } else {
                    console.warn('⚠️ [SyncEngine] Employee sync failed:', employeeResult.error);
                }
            } else {
                console.log('[SyncEngine] Data is fresh, skipping pull sync');
            }
        } catch (error) {
            console.warn('[SyncEngine] Pull sync failed:', error);
        } finally {
            this.pullSyncInProgress = false;
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
            const entityType = item.entity_type || item.type || '';

            // Normalize to plural form for registry lookup
            const normalized = entityType.endsWith('s') ? entityType : entityType + 's';
            const config = SYNC_ENTITY_REGISTRY[normalized];

            if (config) {
                // Use generic handler for registry-matched entities
                response = await this.syncGenericEntity(config, item.data as Record<string, unknown>);
            } else {
                // Custom handlers for complex/unique entities
                switch (entityType) {
                    case 'invoices':
                    case 'invoice':
                        response = await this.syncInvoice(item.data as InvoiceData);
                        break;

                    case 'payments':
                    case 'payment':
                        response = await this.syncPayment(item.data as PaymentData);
                        break;

                    case 'payment_receipts':
                    case 'payment_receipt':
                        response = await this.syncPaymentReceipt(item.data as PaymentReceiptData);
                        break;

                    case 'customer_address':
                    case 'customer_addresses':
                        response = await this.syncCustomerAddress(item.data as CustomerAddressData);
                        break;

                    case 'stock_transfers':
                    case 'stock_transfer':
                        response = await this.syncStockTransfer(item.data as Record<string, unknown>);
                        break;

                    default:
                        throw new Error(`Unknown sync type: ${entityType}`);
                }
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
     * Generic entity sync — handles create/update, localId mapping, delta sync, and batch reservation clearing.
     * Replaces 10 nearly-identical sync[Entity]() methods.
     */
    async syncGenericEntity(config: SyncEntityConfig, data: Record<string, unknown>): Promise<AxiosResponse> {
        const { _localId, _syncStatus, sync_status, created_offline, temp_id, reserved_batches, ...entityData } = data;
        const localId = String(_localId || temp_id || '');
        const cleaned = cleanData(entityData);
        const api = await config.getApi();
        const createFn = api[config.createMethod || 'create'] as Function;

        let response: AxiosResponse;

        if (config.hasUpdate && entityData[config.idField] && !String(entityData[config.idField]).startsWith('LOCAL_')) {
            response = await (api.update as Function)(entityData[config.idField], cleaned);
        } else {
            response = await createFn(cleaned);

            if (response.data?.[config.idField] && localId) {
                await offlineDB.updateLocalId(config.tableName, localId, response.data[config.idField]);
            }
        }

        // Clear reserved batch quantities if present (used by challans)
        if (reserved_batches && Array.isArray(reserved_batches)) {
            for (const reservation of reserved_batches as Array<{ product_id: string | number; batch_id: string | number; quantity: number }>) {
                await offlineDB.clearReservedQuantity(reservation.product_id, reservation.batch_id, reservation.quantity);
            }
        }

        // Trigger delta sync if configured
        if (config.deltaSyncTables?.length) {
            try {
                const { default: deltaSyncService } = await import('./deltaSyncService');
                deltaSyncService.syncTables(config.deltaSyncTables, config.deltaSyncReason || 'manual');
            } catch (e) { /* ignore */ }
        }

        return response;
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
        const { _localId, _syncStatus, temp_id, reserved_batches, ...invoice } = invoiceData;
        const localId = String(_localId || temp_id || '');

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

                if (response.data?.invoice_id && localId) {
                    await offlineDB.updateLocalId('invoices', localId, response.data.invoice_id);
                }
            }

            // SUCCESS: Clear reserved quantities
            if (reserved_batches && Array.isArray(reserved_batches)) {
                for (const reservation of reserved_batches) {
                    await offlineDB.clearReservedQuantity(reservation.product_id, reservation.batch_id, reservation.quantity);
                }
                console.log(`✅ Cleared ${reserved_batches.length} batch reservations after successful sync`);
            }

            // Update batch quantities from server response if available
            if (response.data?.updated_batches) {
                for (const batchUpdate of response.data.updated_batches) {
                    await offlineDB.updateBatchQuantity(batchUpdate.product_id, batchUpdate.batch_id, batchUpdate.new_quantity);
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
     * Sync payment. Offline-created payments use local/temp IDs, so they must
     * create server records instead of attempting an update with NaN IDs.
     */
    async syncPayment(paymentData: PaymentData): Promise<AxiosResponse> {
        const { _localId, _syncStatus, sync_status, created_offline, temp_id, local_id, ...payment } = paymentData;
        const paymentId = payment.payment_id;
        const isServerPayment = paymentId && /^\d+$/.test(String(paymentId));

        const cleanedPayment = cleanData({
            ...payment,
            party_id: payment.party_id ? Number(payment.party_id) : undefined,
            party_type: payment.party_type || 'customer',
            payment_type: payment.payment_type || 'receipt',
            amount: payment.amount ?? payment.payment_amount ?? 0,
            payment_mode: payment.payment_mode || payment.payment_method || 'cash',
            payment_date: payment.payment_date,
            reference_number: payment.reference_number,
            notes: payment.notes
        });

        if (isServerPayment) {
            return await paymentsApi.update(parseInt(String(paymentId), 10), cleanedPayment);
        }

        const response = await paymentsApi.create(cleanedPayment);
        const serverId = response.data?.payment_id || response.data?.data?.payment_id;
        const localId = String(temp_id || _localId || local_id || paymentId || '');
        if (serverId && localId) {
            await offlineDB.updateLocalId('payments', localId, serverId);
        }
        return response;
    }

    async syncPaymentReceipt(receiptData: PaymentReceiptData): Promise<AxiosResponse> {
        const { _localId, _syncStatus, sync_status, created_offline, temp_id, local_id, receipt_id, allocated_invoices, ...receipt } = receiptData;
        const customerId = receipt.customer_id;
        if (!customerId) {
            throw new Error('Customer ID required for receipt sync');
        }

        const result = await submitCustomerPayment(customerId, {
            customer_id: Number(customerId),
            payment_date: String(receipt.receipt_date || receipt.payment_date || new Date().toISOString().slice(0, 10)),
            amount: Number(receipt.amount || receipt.payment_amount || 0),
            payment_mode: String(receipt.payment_mode || receipt.payment_method || 'cash'),
            reference_number: receipt.reference_number ? String(receipt.reference_number) : undefined,
            bank_name: receipt.bank_name ? String(receipt.bank_name) : undefined,
            notes: receipt.notes ? String(receipt.notes) : undefined,
            allocate_to_invoices: Array.isArray(allocated_invoices)
                ? allocated_invoices.map(invoice => Number(invoice.invoice_id)).filter(Number.isFinite)
                : undefined
        });

        const localId = String(temp_id || _localId || local_id || receipt_id || '');
        if (result.paymentId && localId) {
            await offlineDB.updateLocalId('payment_receipts', localId, result.paymentId);
        }

        return {
            data: {
                payment_id: result.paymentId,
                payment_reference: result.paymentReference,
                ...result.raw
            },
            status: 200,
            statusText: 'OK',
            headers: {},
            config: {}
        } as AxiosResponse;
    }

    /**
     * Sync customer address
     */
    async syncCustomerAddress(addressData: CustomerAddressData): Promise<AxiosResponse> {
        const { customer_id, ...address } = addressData;

        if (!customer_id) {
            throw new Error('Customer ID required for address sync');
        }

        const cleanedAddress = cleanData(address);

        // Use the customers API to create address
        const response = await customersApi.createAddress(String(customer_id), cleanedAddress);

        console.log('[SyncEngine] Customer address synced:', response.data);
        return response;
    }

    /**
     * Sync stock transfer (custom: loops over items, multiple API calls)
     */
    async syncStockTransfer(data: Record<string, unknown>): Promise<AxiosResponse> {
        const { _localId, _syncStatus, sync_status, created_offline, temp_id, items, ...transferMeta } = data;
        const localId = String(temp_id || _localId || '');
        const transferItems = items as Array<Record<string, unknown>> || [];

        let lastResponse: AxiosResponse | null = null;

        // Process each item as a separate transfer call
        for (const item of transferItems) {
            const transferPayload = {
                product_id: item.product_id,
                batch_id: item.batch_id,
                quantity: item.transfer_quantity,
                source_location: transferMeta.source_location,
                destination_location: transferMeta.destination_location,
                movement_date: transferMeta.movement_date,
                reason: transferMeta.reason || 'Stock transfer'
            };
            lastResponse = await stockApi.transfer(cleanData(transferPayload));
        }

        if (lastResponse && localId) {
            await offlineDB.updateLocalId('stock_transfers', localId, lastResponse.data?.transfer_id || Date.now());
        }

        // Trigger delta sync for batches/products
        try {
            const { default: deltaSyncService } = await import('./deltaSyncService');
            deltaSyncService.syncTables(['batches', 'products'], 'stock_adjusted');
        } catch (e) { /* ignore */ }

        return lastResponse!;
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

        // Sync pending queue items (PUSH)
        const result = await this.startSync();

        // Also trigger data pull (products, etc.)
        this.triggerPullSync();

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
