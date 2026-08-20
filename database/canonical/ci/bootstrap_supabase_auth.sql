-- Disposable PostgreSQL 15 stand-in for the one Supabase-owned FK target.
-- This fixture must never be applied to Supabase or any persistent environment.
CREATE SCHEMA auth;
CREATE TABLE auth.users (
    id uuid PRIMARY KEY
);
