-- =============================================
-- CREATE ALL SCHEMAS FOR ENTERPRISE ERP
-- =============================================
-- Creates 10 schemas for microservices architecture
-- Each schema represents a bounded context
-- =============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Master Data Management
CREATE SCHEMA IF NOT EXISTS master;
COMMENT ON SCHEMA master IS 'Core master data: organizations, users, locations, configuration';

-- 2. Inventory Management  
CREATE SCHEMA IF NOT EXISTS inventory;
COMMENT ON SCHEMA inventory IS 'Product, batch, stock, and warehouse management';

-- 3. Party Management
CREATE SCHEMA IF NOT EXISTS parties;
COMMENT ON SCHEMA parties IS 'Customers, suppliers, and other business partners';

-- 4. Sales Operations
CREATE SCHEMA IF NOT EXISTS sales;
COMMENT ON SCHEMA sales IS 'Orders, invoices, deliveries, and sales returns';

-- 5. Procurement Operations
CREATE SCHEMA IF NOT EXISTS procurement;
COMMENT ON SCHEMA procurement IS 'Purchase orders, goods receipts, and supplier management';

-- 6. Financial Management
CREATE SCHEMA IF NOT EXISTS financial;
COMMENT ON SCHEMA financial IS 'Accounting, payments, banking, and financial reporting';

-- 7. GST & Tax Management
CREATE SCHEMA IF NOT EXISTS gst;
COMMENT ON SCHEMA gst IS 'GST compliance, returns, and tax management';

-- 8. Compliance & Regulatory
CREATE SCHEMA IF NOT EXISTS compliance;
COMMENT ON SCHEMA compliance IS 'Licenses, inspections, and regulatory compliance';

-- 9. Analytics & Reporting
CREATE SCHEMA IF NOT EXISTS analytics;
COMMENT ON SCHEMA analytics IS 'Business intelligence, KPIs, and reporting';

-- 10. System & Configuration
CREATE SCHEMA IF NOT EXISTS system_config;
COMMENT ON SCHEMA system_config IS 'System settings, integrations, and monitoring';

-- 11. Testing Schema
CREATE SCHEMA IF NOT EXISTS testing;
COMMENT ON SCHEMA testing IS 'Testing framework and test utilities';

-- 12. API Schema
CREATE SCHEMA IF NOT EXISTS api;
COMMENT ON SCHEMA api IS 'REST-style API functions for external access';

-- Grant basic permissions
GRANT USAGE ON SCHEMA master TO authenticated;
GRANT USAGE ON SCHEMA inventory TO authenticated;
GRANT USAGE ON SCHEMA parties TO authenticated;
GRANT USAGE ON SCHEMA sales TO authenticated;
GRANT USAGE ON SCHEMA procurement TO authenticated;
GRANT USAGE ON SCHEMA financial TO authenticated;
GRANT USAGE ON SCHEMA gst TO authenticated;
GRANT USAGE ON SCHEMA compliance TO authenticated;
GRANT USAGE ON SCHEMA analytics TO authenticated;
GRANT USAGE ON SCHEMA system_config TO authenticated;
GRANT USAGE ON SCHEMA testing TO authenticated;
GRANT USAGE ON SCHEMA api TO authenticated;

-- Verify schema creation
SELECT 
    nspname as schema_name,
    obj_description(oid, 'pg_namespace') as description
FROM pg_namespace
WHERE nspname IN (
    'master', 'inventory', 'parties', 'sales', 'procurement',
    'financial', 'gst', 'compliance', 'analytics', 'system_config'
)
ORDER BY 
    CASE nspname
        WHEN 'master' THEN 1
        WHEN 'inventory' THEN 2
        WHEN 'parties' THEN 3
        WHEN 'sales' THEN 4
        WHEN 'procurement' THEN 5
        WHEN 'financial' THEN 6
        WHEN 'gst' THEN 7
        WHEN 'compliance' THEN 8
        WHEN 'analytics' THEN 9
        WHEN 'system_config' THEN 10
    END;