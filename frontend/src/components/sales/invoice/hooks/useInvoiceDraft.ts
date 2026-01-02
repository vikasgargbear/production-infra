/**
 * useInvoiceDraft Hook
 * 
 * Manages invoice draft auto-save and loading.
 * - Auto-saves every 30 seconds
 * - Loads draft on mount
 * - Cleans up old drafts (>24 hours)
 */

import { useEffect, useRef } from 'react';
import { storageService, STORAGE_KEYS } from '../../../../services/core/storageService';
import { getUTCTimestamp } from '../../../../utils/indianDateUtils';
import { Customer } from '../../../../types/models/customer';
import type { Invoice } from '../hooks/useInvoiceLogic';

export interface UseInvoiceDraftProps {
    invoice: Invoice;
    selectedCustomer: Customer | null;
}

/**
 * Hook to manage draft auto-save and loading
 */
export function useInvoiceDraft({ invoice, selectedCustomer }: UseInvoiceDraftProps) {
    // Refs for auto-save (prevents effect re-run on every state change)
    const invoiceRef = useRef(invoice);
    const selectedCustomerRef = useRef(selectedCustomer);

    // Keep refs in sync without triggering effects
    useEffect(() => { invoiceRef.current = invoice; }, [invoice]);
    useEffect(() => { selectedCustomerRef.current = selectedCustomer; }, [selectedCustomer]);

    // Auto-save draft every 30 seconds (uses refs to avoid re-running effect)
    useEffect(() => {
        const autoSaveInterval = setInterval(() => {
            const currentInvoice = invoiceRef.current;
            const currentCustomer = selectedCustomerRef.current;

            if (currentInvoice.items.length === 0 || !currentCustomer) {
                return;
            }

            try {
                const draftData = {
                    ...currentInvoice,
                    customer_id: currentCustomer.customer_id,
                    customer_details: currentCustomer,
                    draft_saved_at: getUTCTimestamp()
                };

                storageService.setItem(STORAGE_KEYS.INVOICE_DRAFT, draftData);
                console.log('[Invoice] Auto-saved draft');
            } catch (error) {
                console.error('[Invoice] Auto-save failed:', error);
            }
        }, 30000);

        return () => clearInterval(autoSaveInterval);
    }, []); // Empty deps - runs once, uses refs for current values

    // Load draft on mount - use ref to prevent double execution in StrictMode
    const draftLoadedRef = useRef(false);

    useEffect(() => {
        if (draftLoadedRef.current) {
            return;
        }
        draftLoadedRef.current = true;

        // Clean up old drafts silently
        try {
            const draft = storageService.getItem<{ draft_saved_at: string }>(STORAGE_KEYS.INVOICE_DRAFT);
            if (draft) {
                const draftAge = Date.now() - new Date(draft.draft_saved_at).getTime();
                const maxAge = 24 * 60 * 60 * 1000;
                if (draftAge >= maxAge) {
                    storageService.removeItem(STORAGE_KEYS.INVOICE_DRAFT);
                }
            }
        } catch {
            // Silent cleanup
        }
    }, []);
}

export default useInvoiceDraft;
