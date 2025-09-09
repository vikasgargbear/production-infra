# Archive Log

## 2025-01-08 - High Priority Cleanup
**Agent**: CLEANUP
**Files Archived**: 5 test files
**Console.logs Removed**: 4 security-critical files
**Space Saved**: ~50 KB

### What Was Done

#### Console.log Removal (Security Fix)
Removed console.log statements from critical files:
- `/frontend/src/services/auth.js` - 3 console statements removed
- `/frontend/src/services/OrgIdManager.js` - 11 console statements removed  
- `/frontend/src/services/api/apiClient.ts` - 8 console statements removed
- `/frontend/src/services/api/partyLedgerApi.js` - 12 console statements removed

**Note**: Replaced with structured error returns for UI handling

#### To `/archive/test_files/2025-01-08/`
- `TestIntegration.tsx` - Test component not used in production
- `App.test.tsx` - Test file importing TestIntegration
- `test-invoice-api.js` - Standalone test script
- `test-invoice-calculations.js` - Standalone test script
- `INVOICE_CALCULATION_TEST.js` - Invoice calculation test

### Rollback Instructions
```bash
# If issues arise with archived files
git reset --hard pre-cleanup-20250108
# Or restore specific files from /archive/test_files/2025-01-08/
```

---

## 2025-01-06 - Major Cleanup
**Agent**: CLEANUP
**Files Archived**: ~90 files
**Space Saved**: ~2.5 MB

### What Was Archived

#### To `/archive/temp/` (for eventual deletion)
- **system-files/**: 24 `.DS_Store` files (macOS metadata)
- **logs/**: Old log files (backend.log, server.log)
- **test-html/**: 15 HTML test files from root and frontend
- **test-scripts/**: Test scripts that were in root (.py, .sh, .sql)
- **db-scripts/**: Database utility scripts from root
- **old-docs/**: Old TODO and planning documents
- **test-data/**: Frontend test data directory
- **duplicate-scripts/**: Duplicate cleanup scripts

#### To `/archive/duplicates/`
- Backend old API routes (party_ledger_old.py, party_ledger_debug.py)

#### To `/archive/reports/2025-01-06/`
- Old analysis reports (duplicates_proposed.json, duplicates_analysis.md)

### Files Can Be Deleted After Review
All files in `/archive/temp/` can be safely deleted after a review period (suggested: 30 days)

### Rollback Instructions
If needed to restore:
```bash
git reset --hard pre-cleanup-20250106-[timestamp]
```

Or manually restore specific files from `/archive/`