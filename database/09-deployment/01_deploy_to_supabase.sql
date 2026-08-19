-- SCHEMA_BASELINE_REQUIRED
--
-- This legacy deployment entrypoint referenced 37 files that do not exist and
-- mixed bootstrap DDL with production mutations. It is deliberately disabled.
-- Establish and review the live Supabase baseline, then deploy only through the
-- canonical backend/alembic revision chain declared in schema-authority.json.

\echo 'BLOCKED: live schema baseline and canonical Alembic history are required'
\quit 3
