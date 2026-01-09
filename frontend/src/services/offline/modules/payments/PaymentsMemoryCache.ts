/**
 * Payments Memory Cache - O(1) lookups for payments and receipts
 */

import type { OfflinePayment, OfflinePaymentReceipt } from '../../types/payments.types';

class PaymentsMemoryCache {
    private payments = new Map<string, OfflinePayment>();
    private paymentReceipts = new Map<string, OfflinePaymentReceipt>();
    private paymentsByParty = new Map<string, OfflinePayment[]>();

    private isWarmed = false;

    warmCache(payments: OfflinePayment[], receipts: OfflinePaymentReceipt[]): void {
        this.clear();

        for (const payment of payments) {
            const id = String(payment.payment_id);
            this.payments.set(id, payment);

            const partyId = String(payment.party_id);
            const existing = this.paymentsByParty.get(partyId) || [];
            existing.push(payment);
            this.paymentsByParty.set(partyId, existing);
        }

        for (const receipt of receipts) {
            const id = String(receipt.receipt_id);
            this.paymentReceipts.set(id, receipt);
        }

        this.isWarmed = true;
        console.log(`[PaymentsCache] ✅ Warmed: ${payments.length} payments, ${receipts.length} receipts`);
    }

    getPayment(id: string): OfflinePayment | null {
        return this.payments.get(String(id)) || null;
    }

    getReceipt(id: string): OfflinePaymentReceipt | null {
        return this.paymentReceipts.get(String(id)) || null;
    }

    getPaymentsByParty(partyId: string): OfflinePayment[] {
        return (this.paymentsByParty.get(String(partyId)) || []).map(p => ({ ...p }));
    }

    clear(): void {
        this.payments.clear();
        this.paymentReceipts.clear();
        this.paymentsByParty.clear();
        this.isWarmed = false;
    }

    isReady(): boolean {
        return this.isWarmed;
    }
}

export const paymentsMemoryCache = new PaymentsMemoryCache();
export default paymentsMemoryCache;
