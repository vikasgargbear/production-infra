-- =============================================
-- GRANT PERMISSIONS TO DATABASE ROLES
-- =============================================
-- Run this AFTER creating schemas and tables
-- =============================================

-- Grant basic schema usage permissions to all roles
GRANT USAGE ON SCHEMA master, inventory, parties, sales, procurement, financial, gst, compliance, analytics, system_config, api TO 
    admin, executive, sales_user, sales_manager, procurement_user, procurement_manager, 
    warehouse_user, finance_user, finance_manager, gst_user, compliance_officer, 
    pharmacist, quality_manager, quality_user, auditor, system;

-- Admin gets full access to all schemas
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA 
    master, inventory, parties, sales, procurement, financial, gst, compliance, analytics, system_config, api 
TO admin;

GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA 
    master, inventory, parties, sales, procurement, financial, gst, compliance, analytics, system_config, api 
TO admin;

GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA 
    master, inventory, parties, sales, procurement, financial, gst, compliance, analytics, system_config, api 
TO admin;

-- Sales roles permissions
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA sales TO sales_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA sales TO sales_manager;
GRANT SELECT ON ALL TABLES IN SCHEMA parties, inventory, master TO sales_user, sales_manager;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA sales TO sales_user, sales_manager;

-- Procurement roles permissions
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA procurement TO procurement_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA procurement TO procurement_manager;
GRANT SELECT ON ALL TABLES IN SCHEMA parties, inventory, master TO procurement_user, procurement_manager;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA procurement TO procurement_user, procurement_manager;

-- Warehouse roles permissions
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA inventory TO warehouse_user;
GRANT SELECT ON ALL TABLES IN SCHEMA master TO warehouse_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA inventory TO warehouse_user;

-- Finance roles permissions
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA financial TO finance_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA financial TO finance_manager;
GRANT SELECT ON ALL TABLES IN SCHEMA sales, procurement, gst TO finance_user, finance_manager;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA financial TO finance_user, finance_manager;

-- GST roles permissions
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA gst TO gst_user;
GRANT SELECT ON ALL TABLES IN SCHEMA sales, procurement, financial TO gst_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA gst TO gst_user;

-- Compliance roles permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA compliance TO compliance_officer, pharmacist, quality_manager;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA compliance TO quality_user;
GRANT SELECT ON ALL TABLES IN SCHEMA compliance TO auditor;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA compliance TO compliance_officer, pharmacist, quality_manager, quality_user;

-- Executive gets read access to everything
GRANT SELECT ON ALL TABLES IN SCHEMA 
    master, inventory, parties, sales, procurement, financial, gst, compliance, analytics, system_config 
TO executive;

-- System role for background jobs
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA 
    master, inventory, parties, sales, procurement, financial, gst, compliance, analytics, system_config 
TO system;

GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA 
    master, inventory, parties, sales, procurement, financial, gst, compliance, analytics, system_config 
TO system;

-- Grant execute permissions on API functions to all roles
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA api TO 
    admin, executive, sales_user, sales_manager, procurement_user, procurement_manager, 
    warehouse_user, finance_user, finance_manager, gst_user, compliance_officer, 
    pharmacist, quality_manager, quality_user, auditor, system;

-- Grant permissions for future objects (so new tables automatically get permissions)
ALTER DEFAULT PRIVILEGES IN SCHEMA sales GRANT SELECT, INSERT, UPDATE ON TABLES TO sales_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA sales GRANT ALL PRIVILEGES ON TABLES TO sales_manager;
ALTER DEFAULT PRIVILEGES IN SCHEMA procurement GRANT SELECT, INSERT, UPDATE ON TABLES TO procurement_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA procurement GRANT ALL PRIVILEGES ON TABLES TO procurement_manager;
ALTER DEFAULT PRIVILEGES IN SCHEMA inventory GRANT SELECT, INSERT, UPDATE ON TABLES TO warehouse_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA financial GRANT SELECT, INSERT, UPDATE ON TABLES TO finance_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA financial GRANT ALL PRIVILEGES ON TABLES TO finance_manager;
ALTER DEFAULT PRIVILEGES IN SCHEMA gst GRANT SELECT, INSERT, UPDATE ON TABLES TO gst_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA compliance GRANT ALL PRIVILEGES ON TABLES TO compliance_officer, pharmacist, quality_manager;
ALTER DEFAULT PRIVILEGES IN SCHEMA compliance GRANT SELECT, INSERT, UPDATE ON TABLES TO quality_user;

-- Display granted permissions summary
SELECT 'Permissions granted successfully' as status;