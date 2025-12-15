/**
 * Offline Services - Unified Exports
 * 
 * Import from this index for clean, consistent access to all offline functionality.
 * 
 * Usage:
 *   import { offlineDB, localFirstService, dataSyncService } from '@/services/offline';
 */

// Core Infrastructure
export { default as offlineDB, SYNC_STATUS } from './core/offlineDatabase';
export { default as networkMonitor } from './core/networkMonitor';

// Synchronization Layer
export { default as dataSyncService } from './sync/dataSyncService';
export { default as syncEngine } from './sync/syncEngine';

// Caching / Local-First Layer
export { default as localFirstService } from './cache/localFirstService';

// Document Services
export { default as documentNumberGenerator } from './documents/documentNumberGenerator';
export { default as documentNumberService } from './documents/documentNumberService';
export { default as localInvoiceService } from './documents/localInvoiceService';
