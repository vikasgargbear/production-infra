/**
 * React Query Configuration
 * Sets up the QueryClient with optimal settings for the pharma application
 */

import { QueryClient } from 'react-query';

// Create and configure the query client
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache data for 5 minutes by default
      staleTime: 5 * 60 * 1000,
      // Keep data in cache for 10 minutes
      cacheTime: 10 * 60 * 1000,
      // Retry failed requests up to 2 times
      retry: 2,
      // Don't refetch on window focus for better UX
      refetchOnWindowFocus: false,
      // Don't refetch on mount if data is fresh
      refetchOnMount: 'always',
      // Error handling
      onError: (error) => {
        console.error('Query error:', error);
      }
    },
    mutations: {
      // Retry failed mutations once
      retry: 1,
      // Error handling
      onError: (error) => {
        console.error('Mutation error:', error);
      }
    }
  }
});

export default queryClient;