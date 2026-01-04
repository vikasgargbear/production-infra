/**
 * usePurchaseItems - Shared hook for managing purchase items
 * 
 * Handles add, update, remove operations for purchase line items
 */

import { useState, useCallback } from 'react';
import type { BasePurchaseItem } from '../types';
import { generateTempId } from '../utils';

export function usePurchaseItems<T extends BasePurchaseItem>(initialItems: T[] = []) {
    const [items, setItems] = useState<T[]>(initialItems);

    const handleAddItem = useCallback((newItem: T) => {
        setItems(prev => [...prev, { ...newItem, id: newItem.id || generateTempId() }]);
    }, []);

    const handleUpdateItem = useCallback((index: number, field: keyof T, value: any) => {
        setItems(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], [field]: value };
            return updated;
        });
    }, []);

    const handleRemoveItem = useCallback((index: number) => {
        setItems(prev => prev.filter((_, i) => i !== index));
    }, []);

    const clearItems = useCallback(() => {
        setItems([]);
    }, []);

    return {
        items,
        setItems,
        handleAddItem,
        handleUpdateItem,
        handleRemoveItem,
        clearItems,
    };
}
