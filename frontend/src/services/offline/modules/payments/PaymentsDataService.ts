/**
 * Payments Data Service - Optimistic data layer for payments
 */

import offlineDB from '../../core/offlineDatabase';
import { paymentsMemoryCache } from './PaymentsMemoryCache';
import type { OfflinePayment, OfflinePaymentReceipt } from '../../types/payments.types';

class PaymentsDataService {
    async getPayment(paymentId: string): Promise<OfflinePayment | null> {
        const cached = paymentsMemoryCache.getPayment(paymentId);
        if (cached) return { ...cached };

        try {
            const payment = await offlineDB.get('payments', paymentId);
            return payment ? { ...payment } as OfflinePayment : null;
        } catch (error) {
            return null;
        }
    }

    async savePayment(paymentData: Partial<OfflinePayment>): Promise<string> {
        const tempId = `temp_pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const payment: OfflinePayment = {
            temp_id: tempId,
            payment_id: tempId,
            payment_number: `PAY-OFFLINE-${Date.now().toString(36).toUpperCase()}`,
            payment_date: new Date().toISOString().split('T')[0],
            party_type: 'customer',
            party_id: '',
            party_name: '',
            amount: 0,
            payment_method: 'cash',
            payment_status: 'pending',
            sync_status: 'pending',
            created_offline: true,
            ...paymentData
        } as OfflinePayment;

        try {
            await offlineDB.add('payments', payment);
            await offlineDB.addToSyncQueue('payments', tempId, 'create', payment as unknown as null);
            console.log('[PaymentsData] ✅ Payment saved optimistically:', tempId);
        } catch (error) {
            console.error('[PaymentsData] Failed to save payment:', error);
        }

        return tempId;
    }

    async saveReceipt(receiptData: Partial<OfflinePaymentReceipt>): Promise<string> {
        const tempId = `temp_rcpt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const receipt: OfflinePaymentReceipt = {
            temp_id: tempId,
            receipt_id: tempId,
            receipt_number: `RCPT-OFFLINE-${Date.now().toString(36).toUpperCase()}`,
            receipt_date: new Date().toISOString().split('T')[0],
            customer_id: '',
            customer_name: '',
            amount: 0,
            payment_method: 'cash',
            sync_status: 'pending',
            created_offline: true,
            ...receiptData
        } as OfflinePaymentReceipt;

        try {
            await offlineDB.add('payment_receipts', receipt);
            await offlineDB.addToSyncQueue('payment_receipts', tempId, 'create', receipt as unknown as null);
            console.log('[PaymentsData] ✅ Receipt saved optimistically:', tempId);
        } catch (error) {
            console.error('[PaymentsData] Failed to save receipt:', error);
        }

        return tempId;
    }
}

export const paymentsDataService = new PaymentsDataService();
export default paymentsDataService;
