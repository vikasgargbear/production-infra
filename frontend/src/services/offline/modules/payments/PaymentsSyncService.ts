/**
 * Payments Sync Service - Sync orchestration for payments
 */

import { BaseSyncService } from '../../core/BaseSyncService';
import offlineDB from '../../core/offlineDatabase';
import { paymentsMemoryCache } from './PaymentsMemoryCache';
import type { OfflinePayment, OfflinePaymentReceipt, PaymentsSyncState } from '../../types/payments.types';

class PaymentsSyncService extends BaseSyncService<PaymentsSyncState> {
    protected readonly logPrefix = '[PaymentsSync]';

    constructor() {
        super({ phase: 'idle', progress: 0, isReady: false, lastSync: null, error: null });
    }

    protected async warmCache(): Promise<void> {
        const [payments, receipts] = await Promise.all([
            offlineDB.getAll('payments'),
            offlineDB.getAll('payment_receipts')
        ]);

        paymentsMemoryCache.warmCache(
            (payments || []) as OfflinePayment[],
            (receipts || []) as OfflinePaymentReceipt[]
        );

        console.log('[PaymentsSync] Cache warmed');
    }

    protected onStop(): void {
        paymentsMemoryCache.clear();
    }
}

export const paymentsSyncService = new PaymentsSyncService();
export default paymentsSyncService;
