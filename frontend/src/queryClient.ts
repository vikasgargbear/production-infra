/**
 * React Query Configuration
 * Sets up the QueryClient with optimal settings for the pharma application
 */

import { QueryClient } from '@tanstack/react-query';

// Create and configure the query client
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // Cache data for 5 minutes by default
            staleTime: 5 * 60 * 1000,
            // Keep data in cache for 10 minutes (gcTime replaces deprecated cacheTime)
            gcTime: 10 * 60 * 1000,
            // Retry failed requests up to 2 times
            retry: 2,
            // Don't refetch on window focus for better UX
            refetchOnWindowFocus: false,
            // Always refetch on mount
            refetchOnMount: 'always',
        },
        mutations: {
            // Retry failed mutations once
            retry: 1,
        }
    }
});

export default queryClient;
