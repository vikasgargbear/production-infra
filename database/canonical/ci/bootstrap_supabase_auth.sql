-- Disposable PostgreSQL 15 stand-in for Supabase-owned prerequisites.
-- This fixture must never be applied to Supabase or any persistent environment.
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;

-- Hosted Supabase owns this Auth hook executor.  The disposable PostgreSQL
-- fixture creates only the least-privilege role shape needed by migrations.
CREATE ROLE supabase_auth_admin NOLOGIN NOINHERIT NOBYPASSRLS;

CREATE SCHEMA auth;
CREATE TABLE auth.users (
    id uuid PRIMARY KEY
);
