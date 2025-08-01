-- =============================================
-- CLEANUP EXISTING SCHEMAS (IF ANY)
-- =============================================
-- WARNING: This will DROP all schemas and data!
-- Only run this for fresh installation
-- Comment out if upgrading existing system
-- =============================================

-- Drop schemas in reverse dependency order
DROP SCHEMA IF EXISTS system_config CASCADE;
DROP SCHEMA IF EXISTS analytics CASCADE;
DROP SCHEMA IF EXISTS compliance CASCADE;
DROP SCHEMA IF EXISTS gst CASCADE;
DROP SCHEMA IF EXISTS financial CASCADE;
DROP SCHEMA IF EXISTS procurement CASCADE;
DROP SCHEMA IF EXISTS sales CASCADE;
DROP SCHEMA IF EXISTS parties CASCADE;
DROP SCHEMA IF EXISTS inventory CASCADE;
DROP SCHEMA IF EXISTS master CASCADE;

-- Drop any leftover objects in public schema
-- Be careful - this might affect other applications
-- DROP SCHEMA public CASCADE;
-- CREATE SCHEMA public;
-- GRANT ALL ON SCHEMA public TO postgres;
-- GRANT ALL ON SCHEMA public TO public;

-- Clean up any custom types
DROP TYPE IF EXISTS order_status_enum CASCADE;
DROP TYPE IF EXISTS payment_status_enum CASCADE;
DROP TYPE IF EXISTS invoice_status_enum CASCADE;

-- Clean up any hanging functions
DROP FUNCTION IF EXISTS generate_order_number CASCADE;
DROP FUNCTION IF EXISTS calculate_tax CASCADE;
DROP FUNCTION IF EXISTS update_inventory CASCADE;

-- Verify cleanup
SELECT 
    nspname as schema_name
FROM pg_namespace
WHERE nspname NOT IN ('pg_catalog', 'information_schema', 'public', 'auth', 'storage')
ORDER BY nspname;