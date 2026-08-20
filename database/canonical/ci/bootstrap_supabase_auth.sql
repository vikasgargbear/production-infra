-- Disposable PostgreSQL 15 stand-in for Supabase-owned prerequisites.
-- This fixture must never be applied to Supabase or any persistent environment.
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;

CREATE SCHEMA auth;
CREATE TABLE auth.users (
    id uuid PRIMARY KEY
);
