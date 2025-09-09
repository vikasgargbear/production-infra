# Immediate Cleanup Actions for Production Launch

## Phase 1: Quick Wins (Do Now - 30 mins)

### 1. Archive Unused Duplicate Components
These files are confirmed duplicates that can be safely archived:

```bash
# Create archive directory
mkdir -p frontend/src/components/archive/2025-01-cleanup

# Move duplicate table components (using global ItemsTable instead)
mv frontend/src/components/global/PharmaItemsTable.js frontend/src/components/archive/2025-01-cleanup/
mv frontend/src/components/purchase/components/EnhancedPurchaseItemsTable.js frontend/src/components/archive/2025-01-cleanup/
mv frontend/src/components/returns/components/ReturnItemsTable.js frontend/src/components/archive/2025-01-cleanup/

# Move unused GRN variant
mv frontend/src/components/purchase/ModernGRNFlow.js frontend/src/components/archive/2025-01-cleanup/
```

### 2. Update Imports to Use Global Components
Files that need import updates:

1. **PurchaseOrderFlow.js** - Change PharmaItemsTable to ItemsTable
2. **PurchaseItemsTableWrapper.js** - Change PharmaItemsTable to ItemsTable  
3. **EnhancedPurchaseEntry.js** - Change EnhancedPurchaseItemsTable to ItemsTable
4. **PurchaseReturnFlowV2.js** - Change ReturnItemsTable to ItemsTable
5. **SalesReturnFlow.js** - Change ReturnItemsTable to ItemsTable

### 3. Remove Already Archived Files
```bash
# Delete files already in archive folders
rm -rf frontend/src/components/payment/archive/*.tsx
rm -rf frontend/src/components/purchase/archive/*
rm -rf backend/app/parsers_complete/
```

## Phase 2: Critical Fixes (Before Launch - 1 hour)

### 1. Test Critical Flows
After updating imports, test:
- [ ] Invoice creation flow
- [ ] Purchase entry flow
- [ ] Sales return flow
- [ ] Purchase return flow
- [ ] Payment recording

### 2. Fix Any Breaking Changes
- Update component props if needed
- Ensure global components handle all use cases

### 3. Commit Changes
```bash
git add -A
git commit -m "cleanup: Remove duplicate components, use global ItemsTable

- Archived PharmaItemsTable, EnhancedPurchaseItemsTable, ReturnItemsTable
- Updated all imports to use global ItemsTable component
- Removed already archived files from payment and purchase modules
- Standardized table component usage across application"

git push
```

## Phase 3: Post-Launch Cleanup (After Stable)

### 1. Remove Versioned Components
- Consolidate V2, V3, V4, V5 versions
- Keep only the latest working version

### 2. Clean Backend Duplicates
- Remove duplicate parser implementations
- Consolidate route versions

### 3. Database Optimization
- Implement GST field standardization
- Remove redundant calculated fields

## Files to Update NOW:

### 1. PurchaseOrderFlow.js
```javascript
// OLD
import { SupplierSearch, PurchaseProductSearch, PharmaItemsTable, ... } from '../global';

// NEW
import { SupplierSearch, PurchaseProductSearch, ItemsTable, ... } from '../global';
```

### 2. EnhancedPurchaseEntry.js
```javascript
// OLD
import EnhancedPurchaseItemsTable from './components/EnhancedPurchaseItemsTable';

// NEW
import { ItemsTable } from '../global';
```

### 3. Returns Module Files
```javascript
// OLD
import ReturnItemsTable from './components/ReturnItemsTable';

// NEW
import { ItemsTable } from '../global';
```

## Verification Checklist:
- [ ] All imports updated
- [ ] Application builds without errors
- [ ] No console errors in browser
- [ ] Key flows tested and working
- [ ] Changes committed and pushed

## Do NOT Do Now:
- Don't refactor large files yet
- Don't change database schema
- Don't modify working business logic
- Don't update field naming conventions yet

Focus only on removing obvious duplicates and standardizing component usage!