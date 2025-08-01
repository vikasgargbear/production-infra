-- =============================================
-- SUPABASE DEPLOYMENT SCRIPT
-- =============================================
-- Complete deployment script for Supabase
-- =============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- =============================================
-- STEP 1: Create API Schema
-- =============================================
CREATE SCHEMA IF NOT EXISTS api;
GRANT USAGE ON SCHEMA api TO anon, authenticated;

-- =============================================
-- STEP 2: Create all schemas in order
-- =============================================
\i ../01-schemas/01_master_schema.sql
\i ../01-schemas/02_inventory_schema.sql
\i ../01-schemas/03_parties_schema.sql
\i ../01-schemas/04_sales_schema.sql
\i ../01-schemas/05_procurement_schema.sql
\i ../01-schemas/06_financial_schema.sql
\i ../01-schemas/07_gst_schema.sql
\i ../01-schemas/08_compliance_schema.sql
\i ../01-schemas/09_analytics_schema.sql
\i ../01-schemas/10_system_config_schema.sql

-- =============================================
-- STEP 3: Create views for API compatibility
-- =============================================
\i ../02-views/01_api_compatibility_views.sql

-- =============================================
-- STEP 4: Create functions for API compatibility
-- =============================================
\i ../03-functions/01_api_compatibility_functions.sql

-- =============================================
-- STEP 5: Create all triggers
-- =============================================
\i ../04-triggers/01_validation_triggers.sql
\i ../04-triggers/02_audit_triggers.sql
\i ../04-triggers/03_inventory_triggers.sql
\i ../04-triggers/04_financial_triggers.sql
\i ../04-triggers/05_sales_triggers.sql
\i ../04-triggers/06_procurement_triggers.sql
\i ../04-triggers/07_gst_triggers.sql
\i ../04-triggers/08_compliance_triggers.sql
\i ../04-triggers/09_notification_triggers.sql
\i ../04-triggers/10_analytics_triggers.sql
\i ../04-triggers/11_system_triggers.sql

-- =============================================
-- STEP 6: Create business functions
-- =============================================
\i ../05-functions/01_inventory_functions.sql
\i ../05-functions/02_sales_functions.sql
\i ../05-functions/03_procurement_functions.sql
\i ../05-functions/04_financial_functions.sql
\i ../05-functions/05_gst_functions.sql
\i ../05-functions/06_compliance_functions.sql
\i ../05-functions/07_analytics_functions.sql
\i ../05-functions/08_system_functions.sql

-- =============================================
-- STEP 7: Create performance indexes
-- =============================================
\i ../06-indexes/01_performance_indexes.sql

-- =============================================
-- STEP 8: Load initial data
-- =============================================
\i ../07-initial-data/01_master_data.sql
\i ../07-initial-data/02_sample_products.sql

-- =============================================
-- STEP 9: Create all APIs
-- =============================================
\i ../08-api/01_master_apis.sql
\i ../08-api/02_inventory_apis.sql
\i ../08-api/03_sales_apis.sql
\i ../08-api/04_procurement_apis.sql
\i ../08-api/05_financial_apis.sql
\i ../08-api/06_gst_compliance_apis.sql
\i ../08-api/07_analytics_apis.sql
\i ../08-api/08_system_utility_apis.sql

-- =============================================
-- STEP 10: Set up Row Level Security (RLS)
-- =============================================

-- Enable RLS on all tables
ALTER TABLE master.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory.batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE parties.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE parties.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial.journal_entries ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for organization isolation
CREATE POLICY "Users can view their organization data" ON master.organizations
    FOR SELECT USING (org_id = (auth.jwt() -> 'org_id')::INTEGER);

CREATE POLICY "Users can view their branches" ON master.branches
    FOR SELECT USING (org_id = (auth.jwt() -> 'org_id')::INTEGER);

CREATE POLICY "Users can view their products" ON inventory.products
    FOR SELECT USING (org_id = (auth.jwt() -> 'org_id')::INTEGER);

CREATE POLICY "Users can manage their products" ON inventory.products
    FOR ALL USING (org_id = (auth.jwt() -> 'org_id')::INTEGER);

-- Add similar policies for all tables...

-- =============================================
-- STEP 11: Create Supabase-specific roles
-- =============================================

-- Grant permissions to anon role (for public APIs)
GRANT EXECUTE ON FUNCTION api.authenticate_user TO anon;

-- Grant permissions to authenticated role
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA api TO authenticated;

-- Create service role permissions
GRANT ALL ON ALL TABLES IN SCHEMA master TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA inventory TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA parties TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA sales TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA procurement TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA financial TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA gst TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA compliance TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA analytics TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA system_config TO service_role;

-- =============================================
-- STEP 12: Create Supabase Edge Functions helpers
-- =============================================

-- Function to get current user's organization
CREATE OR REPLACE FUNCTION auth.org_id()
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
    SELECT (auth.jwt() -> 'org_id')::INTEGER;
$$;

-- Function to get current user's branches
CREATE OR REPLACE FUNCTION auth.user_branches()
RETURNS INTEGER[]
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(
        ARRAY_AGG(branch_id),
        ARRAY[]::INTEGER[]
    )
    FROM system_config.user_branches
    WHERE user_id = auth.uid()::INTEGER;
$$;

-- =============================================
-- STEP 13: Create database event triggers for real-time
-- =============================================

-- Enable real-time for critical tables
ALTER PUBLICATION supabase_realtime ADD TABLE sales.invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE sales.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE inventory.inventory_movements;
ALTER PUBLICATION supabase_realtime ADD TABLE system_config.system_notifications;

-- =============================================
-- STEP 14: Verify deployment
-- =============================================
DO $$
DECLARE
    v_table_count INTEGER;
    v_trigger_count INTEGER;
    v_function_count INTEGER;
    v_index_count INTEGER;
BEGIN
    -- Count tables
    SELECT COUNT(*) INTO v_table_count
    FROM information_schema.tables
    WHERE table_schema IN ('master', 'inventory', 'parties', 'sales', 'procurement', 'financial', 'gst', 'compliance', 'analytics', 'system_config');
    
    -- Count triggers
    SELECT COUNT(*) INTO v_trigger_count
    FROM information_schema.triggers
    WHERE trigger_schema IN ('master', 'inventory', 'parties', 'sales', 'procurement', 'financial', 'gst', 'compliance', 'analytics', 'system_config');
    
    -- Count functions
    SELECT COUNT(*) INTO v_function_count
    FROM information_schema.routines
    WHERE routine_schema IN ('api', 'master', 'inventory', 'parties', 'sales', 'procurement', 'financial', 'gst', 'compliance', 'analytics', 'system_config')
    AND routine_type = 'FUNCTION';
    
    -- Count indexes
    SELECT COUNT(*) INTO v_index_count
    FROM pg_indexes
    WHERE schemaname IN ('master', 'inventory', 'parties', 'sales', 'procurement', 'financial', 'gst', 'compliance', 'analytics', 'system_config');
    
    RAISE NOTICE 'Deployment Summary:';
    RAISE NOTICE 'Tables created: %', v_table_count;
    RAISE NOTICE 'Triggers created: %', v_trigger_count;
    RAISE NOTICE 'Functions created: %', v_function_count;
    RAISE NOTICE 'Indexes created: %', v_index_count;
    
    IF v_table_count < 135 THEN
        RAISE EXCEPTION 'Table creation incomplete. Expected 135, got %', v_table_count;
    END IF;
    
    RAISE NOTICE 'Deployment completed successfully!';
END $$;