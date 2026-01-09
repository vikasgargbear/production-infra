/**
 * Sales Module Offline Services
 * 
 * Exports all services for the sales module offline functionality.
 * 
 * @example
 * import { 
 *   salesStockService, 
 *   salesDataService, 
 *   salesSyncService,
 *   salesMemoryCache 
 * } from '@/services/offline/modules/sales';
 */

// Core services
export { salesStockService, default as SalesStockService } from './SalesStockService';
export { salesDataService, default as SalesDataService } from './SalesDataService';
export { salesSyncService, default as SalesSyncService } from './SalesSyncService';
export { salesMemoryCache, default as SalesMemoryCache } from './SalesMemoryCache';

// Re-export types
export * from '../../types/sales.types';
