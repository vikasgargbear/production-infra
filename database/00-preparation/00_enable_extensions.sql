-- =============================================
-- ENABLE REQUIRED EXTENSIONS
-- =============================================
-- Run this first in your Supabase SQL editor
-- These extensions provide additional functionality
-- =============================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable cryptographic functions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enable PostGIS for location tracking (optional)
-- CREATE EXTENSION IF NOT EXISTS "postgis";

-- Enable fuzzy string matching
CREATE EXTENSION IF NOT EXISTS "fuzzystrmatch";

-- Enable trigram matching for better search
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Enable case-insensitive text
CREATE EXTENSION IF NOT EXISTS "citext";

-- Enable advanced JSON functionality
CREATE EXTENSION IF NOT EXISTS "jsonb_plv8" CASCADE;

-- Enable vector for AI/ML features (if available)
-- CREATE EXTENSION IF NOT EXISTS "vector";

-- Verify extensions
SELECT 
    extname as extension_name,
    extversion as version
FROM pg_extension
WHERE extname IN (
    'uuid-ossp', 
    'pgcrypto', 
    'fuzzystrmatch', 
    'pg_trgm', 
    'citext'
)
ORDER BY extname;