-- =============================================
-- CREATE DATABASE ROLES FOR PHARMA ERP
-- =============================================
-- This script creates all necessary roles
-- Run this before deploying the main schema
-- =============================================

-- Create roles if they don't exist
DO $$
BEGIN
    -- API roles (for PostgREST/Supabase compatibility)
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anonymous') THEN
        CREATE ROLE anonymous NOLOGIN;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated_user') THEN
        CREATE ROLE authenticated_user NOLOGIN;
    END IF;
    
    -- Admin role
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'admin') THEN
        CREATE ROLE admin;
    END IF;
    
    -- Executive role
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'executive') THEN
        CREATE ROLE executive;
    END IF;
    
    -- Sales roles
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sales_user') THEN
        CREATE ROLE sales_user;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sales_manager') THEN
        CREATE ROLE sales_manager;
    END IF;
    
    -- Procurement roles
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'procurement_user') THEN
        CREATE ROLE procurement_user;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'procurement_manager') THEN
        CREATE ROLE procurement_manager;
    END IF;
    
    -- Warehouse roles
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'warehouse_user') THEN
        CREATE ROLE warehouse_user;
    END IF;
    
    -- Finance roles
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finance_user') THEN
        CREATE ROLE finance_user;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finance_manager') THEN
        CREATE ROLE finance_manager;
    END IF;
    
    -- GST roles
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gst_user') THEN
        CREATE ROLE gst_user;
    END IF;
    
    -- Compliance roles
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'compliance_officer') THEN
        CREATE ROLE compliance_officer;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pharmacist') THEN
        CREATE ROLE pharmacist;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'quality_manager') THEN
        CREATE ROLE quality_manager;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'quality_user') THEN
        CREATE ROLE quality_user;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'auditor') THEN
        CREATE ROLE auditor;
    END IF;
    
    -- System roles
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'system') THEN
        CREATE ROLE system;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'system_admin') THEN
        CREATE ROLE system_admin;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backup_operator') THEN
        CREATE ROLE backup_operator;
    END IF;
    
    -- Analytics role
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'analytics_user') THEN
        CREATE ROLE analytics_user;
    END IF;
    
    -- Logistics role
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'logistics_user') THEN
        CREATE ROLE logistics_user;
    END IF;
    
    -- Production roles
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'production_manager') THEN
        CREATE ROLE production_manager;
    END IF;
    
    -- HR role
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hr_manager') THEN
        CREATE ROLE hr_manager;
    END IF;
    
    -- Inventory role
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'inventory_manager') THEN
        CREATE ROLE inventory_manager;
    END IF;
END
$$;

-- Note: Permissions will be granted after schemas and tables are created
-- This script only creates the roles

-- Display created roles
SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb
FROM pg_roles
WHERE rolname IN (
    'anonymous', 'authenticated_user', 'admin', 'executive', 'sales_user', 'sales_manager', 
    'procurement_user', 'procurement_manager', 'warehouse_user', 'finance_user', 'finance_manager', 
    'gst_user', 'compliance_officer', 'pharmacist', 'quality_manager', 'quality_user', 'auditor', 
    'system', 'system_admin', 'backup_operator', 'analytics_user', 'logistics_user', 
    'production_manager', 'hr_manager', 'inventory_manager'
)
ORDER BY rolname;