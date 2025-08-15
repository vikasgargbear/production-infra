# Backend Scripts Directory

This directory contains utility scripts, SQL files, and debug tools for the backend application.

## 📂 Directory Structure

### `/utils/` - Utility Scripts
**Production utility scripts for maintenance and verification:**

- `check_failing_apis.py` - Verify API endpoint functionality
- `check_orders_schema.py` - Validate order schema structure  
- `check_users.py` - Check user accounts and permissions
- `verify_apis.py` - Comprehensive API testing script
- `find_actual_columns.py` - Database column discovery tool
- `insert_test_products.py` - Insert sample product data
- `migrate_supplier_website.py` - Supplier data migration script

### `/sql/` - SQL Scripts
**Database maintenance and setup scripts:**

- `create_system_user.sql` - Create system user for API operations
- `FIX_USER_ISSUE.sql` - Fix user-related database issues  
- `check_users_direct.sql` - Direct SQL user verification queries

### `/debug/` - Debug Scripts
**Development and debugging utilities:**

- `debug_write_errors.py` - Debug write operation failures
- `disable_kpi_trigger.py` - Disable problematic KPI triggers
- `test_db_route.py` - Database connection testing route (moved from API routes)

## 🔧 Usage

### Running Utility Scripts
```bash
# From backend directory
python scripts/utils/check_failing_apis.py
python scripts/utils/verify_apis.py
```

### Executing SQL Scripts
```bash
# Using psql
psql -U username -d database_name -f scripts/sql/create_system_user.sql
```

### Debug Scripts
```bash
# Debug specific issues
python scripts/debug/debug_write_errors.py
```

## 📋 Notes

- **Utils**: Production-ready maintenance scripts
- **SQL**: Database setup and maintenance 
- **Debug**: Development and troubleshooting only

All scripts are organized by purpose and should be executed from the backend root directory.