/**
 * useOfflineCustomers Hook
 * 
 * Search and access customers from offline storage.
 * Automatically waits for sync and updates on changes.
 * 
 * OPTIMISTIC UPDATES: Customer creation is instant
 */

import { useState, useEffect, useCallback } from 'react';
import { salesDataService, salesSyncService } from '../../../services/offline/modules/sales';
import type { OfflineCustomer } from '../../../services/offline/types/sales.types';

export interface OfflineCustomersHookReturn {
    customers: OfflineCustomer[];
    loading: boolean;
    error: string | null;
    search: (query: string) => Promise<void>;
    saveCustomer: (customer: Partial<OfflineCustomer>) => Promise<string>;
    refetch: () => Promise<void>;
}

/**
 * Hook for customer search and creation with offline support
 * 
 * @param initialQuery - Initial search query
 * @returns Customers, search function, and save function
 * 
 * @example
 * const { customers, search, saveCustomer, loading } = useOfflineCustomers();
 * 
 * // Search customers (instant from memory cache)
 * await search('John');
 * 
 * // Create new customer (instant feedback!)
 * const customerId = await saveCustomer({ customer_name: 'John Doe', ... });
 * // Customer appears in list immediately, no waiting!
 */
export function useOfflineCustomers(initialQuery: string = ''): OfflineCustomersHookReturn {
    const [customers, setCustomers] = useState<OfflineCustomer[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState(initialQuery);

    const fetchCustomers = useCallback(async (searchQuery: string = query) => {
        try {
            setLoading(true);
            setError(null);

            const results = await salesDataService.searchCustomers(searchQuery, { limit: 100 });
            setCustomers(results);

        } catch (err) {
            console.error('[useOfflineCustomers] Failed to fetch customers:', err);
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, [query]);

    const search = useCallback(async (newQuery: string) => {
        setQuery(newQuery);
        await fetchCustomers(newQuery);
    }, [fetchCustomers]);

    /**
     * Save customer with optimistic update
     * 
     * PATTERN: Optimistic UI
     * 1. Add to local list immediately
     * 2. Call save (returns immediately)
     * 3. Background save happens
     * 4. User sees instant feedback
     */
    const saveCustomer = useCallback(async (customerData: Partial<OfflineCustomer>): Promise<string> => {
        try {
            // 1. Call optimistic save (returns immediately with temp ID)
            const customerId = await salesDataService.saveCustomer(customerData);

            // 2. Refresh customer list to include new customer
            // Since saveCustomer updates memory cache, this will include new customer instantly
            await fetchCustomers();

            // 3. Trigger background sync if online
            salesSyncService.afterCustomerCreated();

            return customerId;

        } catch (err) {
            console.error('[useOfflineCustomers] Failed to save customer:', err);
            throw err;
        }
    }, [fetchCustomers]);

    useEffect(() => {
        // Wait for sync to be ready
        if (!salesSyncService.isReady()) {
            const unsubscribe = salesSyncService.subscribe((state) => {
                if (state.isReady) {
                    fetchCustomers();
                    unsubscribe();
                }
            });
            return unsubscribe;
        }

        fetchCustomers();

        // Re-fetch when sync completes
        const unsubscribe = salesSyncService.subscribe((state) => {
            if (state.phase === 'complete' && state.lastSync) {
                fetchCustomers();
            }
        });

        return unsubscribe;
    }, [fetchCustomers]);

    return {
        customers,
        loading,
        error,
        search,
        saveCustomer,
        refetch: () => fetchCustomers()
    };
}

export default useOfflineCustomers;
