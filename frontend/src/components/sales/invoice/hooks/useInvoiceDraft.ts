/**
 * useInvoiceDraft Hook
 * 
 * Invoice-specific wrapper around shared draft auto-save hook.
 * Manages invoice draft auto-save with customer data.
 */

import { useDraftAutoSave } from '../../hooks/useDraftAutoSave';
import { STORAGE_KEYS } from '../../../../services/core/storageService';
import { Customer } from '../../../../types/models/customer';
import type { Invoice } from '../hooks/useInvoiceLogic';

export interface UseInvoiceDraftProps {
    invoice: Invoice;
    selectedCustomer: Customer | null;
}

/**
 * Hook to manage invoice draft auto-save
 * 
 * Uses the shared useDraftAutoSave hook with invoice-specific conditions.
 */
export function useInvoiceDraft({ invoice, selectedCustomer }: UseInvoiceDraftProps) {
    useDraftAutoSave({
        data: {
            ...invoice,
            customer_id: selectedCustomer?.customer_id,
            customer_details: selectedCustomer
        },
        storageKey: STORAGE_KEYS.INVOICE_DRAFT,
        shouldSave: (data) => data.items.length > 0 && !!selectedCustomer
    });
}

export default useInvoiceDraft;
