/**
 * useDraftAutoSave - Auto-save draft to localStorage
 * 
 * Borrowed from sales module pattern
 */

import { useEffect, useRef } from 'react';

interface UseDraftAutoSaveConfig<T> {
    data: T;
    storageKey: string;
    shouldSave?: (data: T) => boolean;
    debounceMs?: number;
}

export function useDraftAutoSave<T>({
    data,
    storageKey,
    shouldSave = () => true,
    debounceMs = 2000,
}: UseDraftAutoSaveConfig<T>) {
    const timeoutRef = useRef<NodeJS.Timeout>();

    useEffect(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        if (!shouldSave(data)) {
            return;
        }

        timeoutRef.current = setTimeout(() => {
            try {
                localStorage.setItem(storageKey, JSON.stringify(data));
            } catch (error) {
                console.error('Failed to save draft:', error);
            }
        }, debounceMs);

        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, [data, storageKey, shouldSave, debounceMs]);

    const clearDraft = () => {
        try {
            localStorage.removeItem(storageKey);
        } catch (error) {
            console.error('Failed to clear draft:', error);
        }
    };

    return { clearDraft };
}

/**
 * Load draft from localStorage
 */
export function loadDraft<T>(storageKey: string): T | null {
    try {
        const saved = localStorage.getItem(storageKey);
        return saved ? JSON.parse(saved) : null;
    } catch (error) {
        console.error('Failed to load draft:', error);
        return null;
    }
}

/**
 * Storage keys for different purchase types
 */
export const PURCHASE_DRAFT_KEYS = {
    PURCHASE_ORDER: 'draft_purchase_order',
    PURCHASE_ENTRY: 'draft_purchase_entry',
    GRN: 'draft_grn',
} as const;
