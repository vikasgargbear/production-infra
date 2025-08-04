# Archive Folder

This folder contains old, debug, and test files that are not used in production but may be useful for debugging or reference.

## Structure

### `/backend/routes/`
- **debug_invoice.py** - Debug endpoints for invoice testing
- **database_fix.py** - Database fix utilities and trigger management
- **table_inspector.py** - Table structure inspection tools
- **create_fixed_triggers.py** - Fixed trigger creation endpoints

### `/database/`
- **CREATE_FIXED_TRIGGERS.sql** - SQL for creating fixed triggers
- **fix_triggers.sql** - Original trigger fixes
- **fix_triggers_final.sql** - Final trigger fixes
- **01_master_data_old.sql** - Old master data
- **02_migrate_from_old_structure.sql** - Migration from old structure
- **01_compatibility_views_fixed.sql** - Fixed compatibility views

### `/documentation/`
- **CORRECTED_SCHEMA_ANALYSIS.md** - Schema analysis documentation
- **SCHEMA_MISMATCH_SUMMARY.md** - Summary of schema mismatches found
- **COLUMN_MAPPING_FIX.md** - Documentation of column mapping fixes
- **INVOICE_API_STATUS.md** - Status of invoice API fixes

### `/_duplicates_old/`
- Old duplicate frontend service files

## Usage

These files are archived and not loaded by the application. To use them:

1. **For debug endpoints**: Uncomment the imports in `/backend/app/main.py`
2. **For SQL fixes**: Run manually if needed
3. **For documentation**: Reference for understanding past issues and fixes

## Note

These files were working but have been archived to keep the main codebase clean. They contain valuable debugging tools and documentation of fixes applied.