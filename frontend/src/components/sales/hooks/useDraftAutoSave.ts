/**
 * useDraftAutoSave Hook
 * 
 * Generic hook for auto-saving drafts to localStorage.
 * Works with any data type - used by invoice, challan, order, etc.
 * 
 * Features:
 * - Auto-saves every 30 seconds
 * - Loads draft on mount
 * - Cleans up old drafts (>24 hours)
 * - Uses refs to avoid unnecessary re-renders
 */

import { useEffect, useRef } from 'react';
import { storageService } from '../../../services/core/storageService';
import { getUTCTimestamp } from '../../../utils/indianDateUtils';

export interface UseDraftAutoSaveOptions<T> {
    /** Data to auto-save */
    data: T;
    /** Storage key for localStorage */
    storageKey: string;
    /** Condition to check before saving (e.g., data.items.length > 0) */
    shouldSave?: (data: T) => boolean;
    /** Auto-save interval in milliseconds (default: 30000 = 30s) */
    intervalMs?: number;
    /** Max age for drafts in milliseconds (default: 24h) */
    maxAgeMs?: number;
}

/**
 * Hook to auto-save drafts to localStorage
 * 
 * @example
 * ```ts
 * useDraftAutoSave({
 *   data: invoice,
 *   storageKey: STORAGE_KEYS.INVOICE_DRAFT,
 *   shouldSave: (inv) => inv.items.length > 0 && !!inv.customer_id
 * });
 * ```
 */
export function useDraftAutoSave<T>({
    data,
    storageKey,
    shouldSave = () => true,
    intervalMs = 30000,
    maxAgeMs = 24 * 60 * 60 * 1000
}: UseDraftAutoSaveOptions<T>): void {

    // Use ref to avoid re-running effect on every data change
    const dataRef = useRef(data);

    // Keep ref in sync without triggering effects
    useEffect(() => {
        dataRef.current = data;
    }, [data]);

    // Auto-save draft at interval
    useEffect(() => {
        const autoSaveInterval = setInterval(() => {
            const currentData = dataRef.current;

            if (!shouldSave(currentData)) {
                return;
            }

            try {
                const draftData = {
                    ...currentData,
                    draft_saved_at: getUTCTimestamp()
                };

                storageService.setItem(storageKey, draftData);
                console.log(`[DraftAutoSave] Auto-saved draft to ${storageKey}`);
            } catch (error) {
                console.error(`[DraftAutoSave] Auto-save failed for ${storageKey}:`, error);
            }
        }, intervalMs);

        return () => clearInterval(autoSaveInterval);
    }, [storageKey, intervalMs, shouldSave]);

    // Clean up old drafts on mount
    const cleanupExecutedRef = useRef(false);

    useEffect(() => {
        if (cleanupExecutedRef.current) {
            return;
        }
        cleanupExecutedRef.current = true;

        try {
            const draft = storageService.getItem<{ draft_saved_at: string }>(storageKey);
            if (draft && draft.draft_saved_at) {
                const draftAge = Date.now() - new Date(draft.draft_saved_at).getTime();
                if (draftAge >= maxAgeMs) {
                    storageService.removeItem(storageKey);
                    console.log(`[DraftAutoSave] Cleaned up old draft from ${storageKey}`);
                }
            }
        } catch (error) {
            // Silent cleanup failure
            console.warn(`[DraftAutoSave] Cleanup failed for ${storageKey}:`, error);
        }
    }, [storageKey, maxAgeMs]);
}

export default useDraftAutoSave;
