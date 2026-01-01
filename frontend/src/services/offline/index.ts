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
export { default as documentNumberGenerator, DOC_TYPES } from './documents/documentNumberGenerator';

// Re-export types for external use
export type {
    SyncResult,
    TransformedProduct,
    TransformedBatch,
    TransformedCustomer
} from './sync/dataSyncService';

export type {
    SyncResults,
    SyncStatus,
    SyncQueueItem
} from './sync/syncEngine';

export type {
    DocumentType,
    CounterRecord
} from './documents/documentNumberGenerator';
