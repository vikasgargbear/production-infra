/**
 * Payments Memory Cache - O(1) lookups for payments and receipts
 */

import { GenericCollectionCache } from '../../core/GenericCollectionCache';
import type { OfflinePayment, OfflinePaymentReceipt } from '../../types/payments.types';

class PaymentsMemoryCache {
    private payments = new GenericCollectionCache<OfflinePayment>({ idField: 'payment_id' });
    private receipts = new GenericCollectionCache<OfflinePaymentReceipt>({ idField: 'receipt_id' });
    private paymentsByParty = new Map<string, OfflinePayment[]>();

    warmCache(payments: OfflinePayment[], receipts: OfflinePaymentReceipt[]): void {
        this.payments.warmCache(payments);
        this.receipts.warmCache(receipts);

        this.paymentsByParty.clear();
        for (const payment of payments) {
            const partyId = String(payment.party_id);
            const existing = this.paymentsByParty.get(partyId) || [];
            existing.push(payment);
            this.paymentsByParty.set(partyId, existing);
        }

        console.log(`[PaymentsCache] ✅ Warmed: ${payments.length} payments, ${receipts.length} receipts`);
    }

    getPayment(id: string): OfflinePayment | null {
        return this.payments.get(id);
    }

    getReceipt(id: string): OfflinePaymentReceipt | null {
        return this.receipts.get(id);
    }

    getPaymentsByParty(partyId: string): OfflinePayment[] {
        return (this.paymentsByParty.get(String(partyId)) || []).map(p => ({ ...p }));
    }

    clear(): void {
        this.payments.clear();
        this.receipts.clear();
        this.paymentsByParty.clear();
    }

    isReady(): boolean {
        return this.payments.isReady();
    }
}

export const paymentsMemoryCache = new PaymentsMemoryCache();
export default paymentsMemoryCache;
