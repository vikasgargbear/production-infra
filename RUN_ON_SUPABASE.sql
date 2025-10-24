-- =============================================
-- RUN THIS ON SUPABASE SQL EDITOR
-- =============================================
-- This is SECTION 35 from MASTER_DATABASE_FIXES.sql
-- Fixes 3-5 second query times on employees/departments/branches APIs

-- employees table indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_employees_org_id 
    ON master.employees(org_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_employees_org_active 
    ON master.employees(org_id, employment_status) 
    WHERE employment_status = 'active';

-- departments table indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_departments_org_id 
    ON master.departments(org_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_departments_org_active 
    ON master.departments(org_id, is_active) 
    WHERE is_active = true;

-- org_branches table indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_org_branches_org_id 
    ON master.org_branches(org_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_org_branches_org_active 
    ON master.org_branches(org_id, is_active) 
    WHERE is_active = true;

-- Update statistics for query planner
ANALYZE master.employees;
ANALYZE master.departments;
ANALYZE master.org_branches;

-- Verify indexes were created
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE indexname IN (
    'idx_employees_org_id',
    'idx_employees_org_active',
    'idx_departments_org_id', 
    'idx_departments_org_active',
    'idx_org_branches_org_id',
    'idx_org_branches_org_active'
)
ORDER BY tablename, indexname;
