-- PRODUCTS PERFORMANCE OPTIMIZATION INDEXES
-- Run these to fix 5+ second response times

-- Essential indexes for product search performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_search_compound 
ON inventory.products USING gin(
    (product_name || ' ' || generic_name || ' ' || brand || ' ' || manufacturer || ' ' || product_code) gin_trgm_ops
);

-- Individual column indexes for exact matches
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_product_type 
ON inventory.products(product_type) WHERE is_active = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_manufacturer 
ON inventory.products(manufacturer) WHERE is_active = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_brand 
ON inventory.products(brand) WHERE is_active = true;

-- Tenant filtering index
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_org_active 
ON inventory.products(org_id, is_active, created_at DESC);

-- Category join optimization  
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_product_categories_org_category 
ON inventory.product_categories(org_id, category_id);

-- Stock calculation optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_batches_product_stock 
ON inventory.batches(product_id, batch_status, quality_status) 
WHERE batch_status = 'active' AND quality_status = 'approved';

-- Enable trigram extension for fuzzy search (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Performance monitoring query
-- Run this to check index usage:
/*
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes 
WHERE tablename = 'products'
ORDER BY idx_scan DESC;
*/