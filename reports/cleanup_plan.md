# Cleanup Plan - 2025-01-06

## Summary
Identified 31 files for archival/cleanup to improve codebase organization.
**Total space to recover**: ~464 KB

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

### Configuration/Documentation
- `/reports/structure_validation.md` - Recent validation report, keep for reference

## Risk Assessment
- **Risk Level**: LOW
- **Business Impact**: NONE (only cleaning temp/system files)
- **Rollback Plan**: All files archived, not deleted - can restore instantly

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