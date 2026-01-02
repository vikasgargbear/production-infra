/**
 * Offline Services - Unified Exports
 * 
 * Architecture:
 * - PUSH: syncEngine        → Upload local changes to server
 * - PULL: syncPullService   → Download data from server  
 * - SEARCH: localSearchService → Query local IndexedDB
 * - CORE: offlineDB, networkMonitor → Infrastructure
 * 
 * Usage:
 *   import { syncPullService, localSearchService, syncEngine } from '@/services/offline';
 */

// ==================== CORE INFRASTRUCTURE ====================
export { default as offlineDB, SYNC_STATUS } from './core/offlineDatabase';
export { default as networkMonitor } from './core/networkMonitor';

// ==================== SYNC LAYER ====================
// PUSH: Upload local changes to server (invoices, customers, etc.)
export { default as syncEngine } from './sync/syncEngine';

// PULL: Download data from server (products, customers, batches)
export { default as syncPullService } from './sync/syncPullService';

// ==================== SEARCH LAYER ====================
// Local-first search on IndexedDB (products, customers)
export { default as localSearchService } from './search/localSearchService';

// ==================== DOCUMENT SERVICES ====================
export { default as documentNumberGenerator, DOC_TYPES } from './documents/documentNumberGenerator';

// ==================== TYPE EXPORTS ====================
export type {
    SyncResult,
    SyncProgress,
    SyncStatus as PullSyncStatus
} from './sync/syncPullService';

export type {
    SearchOptions,
    ProductSearchResult,
    CustomerSearchResult
} from './search/localSearchService';

export type {
    SyncResults,
    SyncStatus,
    SyncQueueItem
} from './sync/syncEngine';

export type {
    DocumentType,
    CounterRecord
} from './documents/documentNumberGenerator';
