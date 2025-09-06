# Cleanup Plan - 2025-01-06 (REVISED)

## Summary
Identified 90+ files for archival/cleanup to improve codebase organization.
**Total space to recover**: ~2.5 MB
**Risk Level**: LOW-MEDIUM (more files, but all safely archived)

## 1. OS System Files to Archive (24 files, ~196 KB)
**Action**: Move to `/archive/temp/2025-01-06/`

These `.DS_Store` files are macOS system files that store folder display preferences. They're not needed for the application and clutter the repository.

- [ ] `./database/.DS_Store` - macOS folder metadata
- [ ] `./database/schemas/.DS_Store` - macOS folder metadata
- [ ] `./.DS_Store` - macOS folder metadata
- [ ] `./frontend/.DS_Store` - macOS folder metadata
- [ ] `./frontend/src/.DS_Store` - macOS folder metadata
- [ ] `./frontend/src/tests/.DS_Store` - macOS folder metadata
- [ ] `./frontend/src/components/.DS_Store` - macOS folder metadata
- [ ] `./frontend/src/components/global/.DS_Store` - macOS folder metadata
- [ ] `./frontend/src/modules/.DS_Store` - macOS folder metadata
- [ ] `./frontend/src/services/.DS_Store` - macOS folder metadata
- [ ] `./frontend/src/services/api/.DS_Store` - macOS folder metadata
- [ ] `./archive/.DS_Store` - macOS folder metadata (ironic!)
- [ ] `./config/.DS_Store` - macOS folder metadata
- [ ] `./tests/.DS_Store` - macOS folder metadata
- [ ] `./backend/.DS_Store` - macOS folder metadata
- [ ] `./backend/app/.DS_Store` - macOS folder metadata
- [ ] `./backend/app/api/.DS_Store` - macOS folder metadata
- [ ] `./backend/app/infrastructure/parsers/.DS_Store` - macOS folder metadata
- [ ] `./backend/app/infrastructure/.DS_Store` - macOS folder metadata
- [ ] `./backend/tests/.DS_Store` - macOS folder metadata
- [ ] `./docs/.DS_Store` - macOS folder metadata
- [ ] `./scripts/.DS_Store` - macOS folder metadata
- [ ] `./infrastructure/docker/.DS_Store` - macOS folder metadata
- [ ] `./infrastructure/.DS_Store` - macOS folder metadata

## 2. Old Log Files to Archive (2 files, ~464 KB)
**Action**: Move to `/archive/temp/2025-01-06/logs/`

These log files are from August/September and contain old debugging information:

- [ ] `./backend/backend.log` (231 KB) - Last modified: Aug 26, backend debugging logs
- [ ] `./server.log` (233 KB) - Last modified: Sep 5, server operation logs

## 3. Test Scripts in Root (3 files)
**Action**: Move to `/archive/temp/2025-01-06/test-scripts/`

These appear to be one-off test scripts that should not be in the root directory:

- [ ] `./test-payment-allocations.sql` - SQL test for payment allocations (likely one-time test)
- [ ] `./test_purchase_triggers.sh` - Shell script for testing purchase triggers
- [ ] `./test_purchase_api.sh` - Shell script for testing purchase API

## 4. Old Reports (2 files)
**Action**: Archive to `/archive/reports/2025-01-06/`

These are old analysis reports that have been acted upon:

- [ ] `./reports/duplicates_proposed.json` - Old duplicate analysis (ProductMaster already handled)
- [ ] `./reports/duplicates_analysis.md` - Analysis report for duplicates (already completed)

## 5. Test HTML Files (15 files)
**Action**: Archive to `/archive/temp/2025-01-06/test-html/`

These are standalone test HTML files cluttering the codebase:

### Root directory test files:
- [ ] `./test-product-id-fix.html` - Product ID testing page
- [ ] `./test-party-ledger-v2.html` - Party ledger v2 test
- [ ] `./test-party-ledger.html` - Party ledger test
- [ ] `./test-number-keys-fix.html` - Number key fix test

### Frontend test HTML files:
- [ ] `./frontend/tests/e2e-company-data.html` - E2E company data test
- [ ] `./frontend/tests/comprehensive-api-test.html` - API comprehensive test
- [ ] `./frontend/test_split_payment.html` - Split payment test
- [ ] `./frontend/set-org-id.html` - Org ID setter test
- [ ] `./frontend/debug-storage.html` - Storage debugging
- [ ] `./frontend/tests/address-management/test-address-segregation.html` - Address test
- [ ] `./frontend/tests/address-management/test-address-enhanced.html` - Enhanced address test
- [ ] `./frontend/tests/address-management/test-invoice-address.html` - Invoice address test

## 6. Test Python Scripts in Root (2 files)
**Action**: Archive to `/archive/temp/2025-01-06/test-scripts/`

Root directory shouldn't have test files:
- [ ] `./test_all_apis.py` - API testing script
- [ ] `./test_apis_comprehensive.py` - Comprehensive API test

## 7. Old Documentation/TODO Files (10+ files)
**Action**: Archive to `/archive/temp/2025-01-06/old-docs/`

These are old planning/TODO documents:
- [ ] `./FUTURE_OPTIMIZATION_TODO.md` - Old optimization plans
- [ ] `./DATA_OPTIMIZATION_TODO.md` - Data optimization notes
- [ ] `./TODO_FEATURES.md` - Old feature TODO
- [ ] `./MIGRATION_GUIDE_DYNAMIC_ORG_ID.md` - Completed migration guide
- [ ] `./ENTERPRISE_MIGRATION_SUCCESS_REPORT.md` - Old migration report
- [ ] `./CLEANUP_COMPLETION_SUMMARY.md` - Old cleanup summary
- [ ] `./API_TEST_REPORT.md` - Old API test report
- [ ] `./PERFORMANCE_ANALYSIS.md` - Old performance analysis
- [ ] `./PURCHASE_RETURN_REVAMP_PLAN.md` - Completed revamp plan
- [ ] `./frontend/TODO_Financial_ERP_Roadmap.md` - Old roadmap
- [ ] `./frontend/test-purchase-verification.md` - Old test verification

## 8. Database Test/Fix Scripts in Root (7 files)
**Action**: Archive to `/archive/temp/2025-01-06/db-scripts/`

These one-off scripts shouldn't be in root:
- [ ] `./apply_purchase_triggers.sh` - Purchase trigger application
- [ ] `./apply_section_26.sh` - Section 26 application
- [ ] `./quick_apply_triggers.sh` - Quick trigger application
- [ ] `./verify_outstanding_working.sh` - Outstanding verification
- [ ] `./database_query.py` - Database query utility
- [ ] `./parse_schema_from_sql.py` - Schema parser utility

## 9. Frontend Test Data (Should be fixtures)
**Action**: Archive to `/archive/temp/2025-01-06/test-data/`

Test data scattered in frontend:
- [ ] `./frontend/test-data/` entire directory - Move to proper test fixtures

## 10. Backend Old/Debug Routes (2 files)
**Action**: Archive to `/archive/duplicates/backend/`

Old API routes that are replaced:
- [ ] `./backend/app/api/routes/party_ledger_old.py` - Old party ledger implementation
- [ ] `./backend/app/api/routes/party_ledger_debug.py` - Debug version of party ledger

## 11. Duplicate Cleanup Scripts
**Action**: Archive to `/archive/temp/2025-01-06/duplicate-scripts/`

Multiple copies of cleanup scripts:
- [ ] `./scripts/cleanup/` directory (duplicate of frontend/scripts/cleanup)
- [ ] `./frontend/scripts/cleanup/` - Keep only one set

## Files NOT Being Touched (Safety First)

### Recently Modified (Within 7 days)
- Database SQL files in `/database/` - Recently modified, critical for migrations

### Test Files in Proper Locations
- Files in `/frontend/src/tests/` - Proper test location, actively used
- Files in `/backend/tests/` - Proper test location, actively used
- `/tests/run_e2e_tests.sh` - E2E test runner, might be needed

### Database Fixes (Revenue Critical)
- `/database/fixes/` directory - Contains critical database fixes, never touch
- `/database/MASTER_DATABASE_FIXES.sql` - Master fixes file, absolutely critical

### Keep These Critical Files
- `README.md` - Main project documentation
- `RAILWAY_DEPLOYMENT.md` - Deployment guide (needed)
- `RAILWAY_CLI_GUIDE.md` - CLI reference (needed)
- `QUICK_REFERENCE.md` - Quick reference guide (useful)
- `COMPREHENSIVE_PROJECT_DOCUMENTATION.md` - Main docs (keep)
- `DOCUMENTATION_INDEX.md` - Documentation index (keep)
- `FOLDER_STRUCTURE.md` - Structure reference (keep)
- `CRITICAL_COMPONENTS.md` - Critical component docs (keep)
- `CLAUDE.md`, `CLAUDE.local.md` - Agent instructions (keep)
- `/frontend/public/index.html` - Main app entry (keep)
- `/frontend/public/org-id-debug.html`, `/frontend/public/fix-org-id.html` - Might be needed for org-id fixes

### Backend Tests (Keep in proper location)
- `/backend/tests/` directory - Proper test location, actively used
- `/tests/e2e/` directory - E2E tests in proper location

### Database Files (NEVER TOUCH)
- `/database/fixes/` directory - Critical database fixes
- `/database/MASTER_DATABASE_FIXES.sql` - Master fixes file

## Risk Assessment
- **Risk Level**: LOW-MEDIUM
- **Business Impact**: MINIMAL (cleaning test files and old docs)
- **Rollback Plan**: All files archived to `/archive/`, can restore instantly

## Total Files to Archive: ~95 files
- 24 `.DS_Store` files
- 2 log files  
- 15 HTML test files
- 11 old documentation files
- 6 shell scripts in root
- 2 Python scripts in root
- 2 old backend routes
- Test data directory
- Duplicate cleanup scripts
- Old reports

## Space Recovery: ~2.5 MB

## Post-Cleanup Benefits
1. **Cleaner root directory** - No test files in root
2. **Better organization** - Test files in proper locations
3. **Reduced confusion** - No duplicate scripts
4. **Easier navigation** - Less clutter
5. **Clear purpose** - Only active files remain

## Verification Steps After Cleanup
1. `npm test` - Ensure all tests pass
2. `npm run build` - Ensure build succeeds
3. Check frontend loads properly
4. Verify backend API responds

## Notes
- All files will be ARCHIVED, not deleted
- Original directory structure preserved in archive
- Can restore any file if needed
- No source code is being touched
- No configuration files affected

**Please review and approve this cleanup plan before execution.**