-- ========================================
-- ADD ORG_ID INDEXES FOR PERFORMANCE
-- ========================================
-- These indexes speed up queries filtering by org_id
-- which is THE most common query pattern in multi-tenant system

-- Check existing indexes first
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename IN ('employees', 'departments', 'org_branches')
ORDER BY tablename, indexname;

-- ========================================
-- MASTER SCHEMA INDEXES
-- ========================================

-- employees table
CREATE INDEX IF NOT EXISTS idx_employees_org_id 
ON master.employees(org_id);

CREATE INDEX IF NOT EXISTS idx_employees_org_employment_status 
ON master.employees(org_id, employment_status) 
WHERE employment_status = 'active';

-- departments table  
CREATE INDEX IF NOT EXISTS idx_departments_org_id 
ON master.departments(org_id);

CREATE INDEX IF NOT EXISTS idx_departments_org_active 
ON master.departments(org_id, is_active) 
WHERE is_active = true;

-- org_branches table
CREATE INDEX IF NOT EXISTS idx_org_branches_org_id 
ON master.org_branches(org_id);

CREATE INDEX IF NOT EXISTS idx_org_branches_org_active 
ON master.org_branches(org_id, is_active) 
WHERE is_active = true;

-- ========================================
-- VERIFY INDEXES CREATED
-- ========================================
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE indexname LIKE 'idx_%_org%'
ORDER BY tablename, indexname;

-- ========================================
-- ANALYZE TABLES FOR QUERY PLANNER
-- ========================================
ANALYZE master.employees;
ANALYZE master.departments;
ANALYZE master.org_branches;

-- Done!
SELECT 'Indexes created and tables analyzed successfully!' as status;
