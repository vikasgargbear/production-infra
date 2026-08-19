/**
 * Payments Module Offline Types
 * 
 * Type definitions for payment transactions and records.
 */

// ============================================
// PAYMENT TYPES
// ============================================

export interface OfflinePayment {
    temp_id?: string;
    payment_id: string;
    payment_number: string;
    payment_date: string;

    // Party details
    party_type: 'customer' | 'supplier';
    party_id: string;
    party_name: string;

    // Payment details
    amount: number;
    payment_method: 'cash' | 'upi' | 'card' | 'cheque' | 'bank_transfer';
    payment_status: 'pending' | 'completed' | 'failed' | 'cancelled';

    // Reference
    reference_type?: 'invoice' | 'purchase' | 'advance' | 'general';
    reference_id?: string;
    reference_number?: string;

    // Transaction details
    transaction_id?: string;
    upi_id?: string;
    cheque_number?: string;
    bank_name?: string;

    notes?: string;

    // Sync metadata
    sync_status?: 'synced' | 'pending' | 'error';
    last_synced_at?: string;
    // Legacy alias kept for older IndexedDB records only. New writes use temp_id.
    local_id?: string;
    created_offline?: boolean;
}

// ============================================
// PAYMENT RECEIPT TYPES
// ============================================

export interface OfflinePaymentReceipt {
    temp_id?: string;
    receipt_id: string;
    receipt_number: string;
    receipt_date: string;

    customer_id: string;
    customer_name: string;

    amount: number;
    payment_method: 'cash' | 'upi' | 'card' | 'cheque';

    // Allocated invoices
    allocated_invoices?: {
        invoice_id: string;
        invoice_number: string;
        allocated_amount: number;
    }[];

    notes?: string;

    // Sync metadata
    sync_status?: 'synced' | 'pending' | 'error';
    last_synced_at?: string;
    // Legacy alias kept for older IndexedDB records only. New writes use temp_id.
    local_id?: string;
    created_offline?: boolean;
}

// ============================================
// SYNC STATE TYPES
// ============================================

export interface PaymentsSyncState {
    phase: 'idle' | 'syncing-payments' | 'syncing-receipts' | 'warming-cache' | 'complete' | 'error';
    progress: number;
    isReady: boolean;
    lastSync: string | null;
    error: string | null;
}

export const DEFAULT_PAYMENTS_SYNC_STATE: PaymentsSyncState = {
    phase: 'idle',
    progress: 0,
    isReady: false,
    lastSync: null,
    error: null
};
