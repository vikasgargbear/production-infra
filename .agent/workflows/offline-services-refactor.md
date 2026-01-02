# Offline Services Refactoring Plan

> **Date:** January 1, 2026  
> **Status:** ✅ COMPLETE

---

## Final Architecture

```
offline/
├── core/
│   ├── offlineDatabase.ts  → IndexedDB + embedded batch helpers
│   ├── cacheManager.ts     → Generic cache
│   ├── syncQueueManager.ts → Queue operations
│   └── networkMonitor.ts   → Network status
├── sync/
│   ├── syncEngine.ts       → ⬆️ PUSH to server
│   └── syncPullService.ts  → ⬇️ PULL from server
├── search/
│   └── localSearchService.ts → 🔍 SEARCH only
└── documents/
    └── documentNumberGenerator.ts
```

## Migration Guide

| Old Import | New Import |
|------------|------------|
| `localFirstService.searchProducts()` | `localSearchService.searchProducts()` |
| `localFirstService.searchCustomers()` | `localSearchService.searchCustomers()` |
| `dataSyncService.fullSync()` | `syncPullService.fullSync()` |
| `syncEngine.forceSync()` | Same (uses syncPullService internally) |

## Key Changes
1. Batches embedded in products (no separate store)
2. Single source for PULL (syncPullService)
3. Single source for SEARCH (localSearchService)
4. syncEngine only handles PUSH operations
