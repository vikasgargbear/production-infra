/**
 * Payments Sync Service - Sync orchestration for payments
 */

import offlineDB from '../../core/offlineDatabase';
import { paymentsMemoryCache } from './PaymentsMemoryCache';
import type { OfflinePayment, OfflinePaymentReceipt, PaymentsSyncState } from '../../types/payments.types';

type SyncListener = (state: PaymentsSyncState) => void;

class PaymentsSyncService {
    private state: PaymentsSyncState = {
        phase: 'idle',
        progress: 0,
        isReady: false,
        lastSync: null,
        error: null
    };

    private listeners: Set<SyncListener> = new Set();

    private updateState(partial: Partial<PaymentsSyncState>): void {
        this.state = { ...this.state, ...partial };
        for (const listener of this.listeners) {
            try { listener(this.state); } catch (error) { console.error('[PaymentsSync] Listener error:', error); }
        }
    }

    subscribe(listener: SyncListener): () => void {
        this.listeners.add(listener);
        listener(this.state);
        return () => { this.listeners.delete(listener); };
    }

    getState(): PaymentsSyncState {
        return { ...this.state };
    }

    isReady(): boolean {
        return this.state.isReady;
    }

    async performInitialSync(): Promise<void> {
        if (this.state.phase !== 'idle' && this.state.phase !== 'error') return;

        console.log('[PaymentsSync] Starting initial sync...');

        try {
            await this.warmCache();

            this.updateState({
                phase: 'complete',
                progress: 100,
                isReady: true,
                lastSync: new Date().toISOString()
            });

            console.log('[PaymentsSync] ✅ Initial sync complete!');
        } catch (error) {
            console.error('[PaymentsSync] Sync failed:', error);
            this.updateState({
                phase: 'error',
                error: (error as Error).message
            });
        }
    }

    private async warmCache(): Promise<void> {
        try {
            const [payments, receipts] = await Promise.all([
                offlineDB.getAll('payments'),
                offlineDB.getAll('payment_receipts')
            ]);

            paymentsMemoryCache.warmCache(
                (payments || []) as OfflinePayment[],
                (receipts || []) as OfflinePaymentReceipt[]
            );

            console.log('[PaymentsSync] Cache warmed');
        } catch (error) {
            console.error('[PaymentsSync] Cache warmup failed:', error);
            throw error;
        }
    }

    stop(): void {
        paymentsMemoryCache.clear();
        this.updateState({ phase: 'idle', progress: 0, isReady: false });
    }
}

export const paymentsSyncService = new PaymentsSyncService();
export default paymentsSyncService;
