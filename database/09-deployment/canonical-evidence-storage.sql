-- Canonical private evidence bucket authority.
--
-- Apply only to the disposable canonical Supabase project.  This role has no
-- database-table authority outside Supabase Storage and is never a browser
-- credential.  The ERP backend signs in as one exact hosted Auth service user;
-- the versioned custom access-token hook assigns only that identity the
-- `erp_evidence_storage` role.  Never substitute the Supabase service-role key.

BEGIN;

DO $role$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='erp_evidence_storage') THEN
        CREATE ROLE erp_evidence_storage NOLOGIN NOINHERIT NOBYPASSRLS;
    END IF;
END
$role$;

DO $protected_role_authority$
BEGIN
    IF EXISTS (
        SELECT 1
          FROM pg_catalog.pg_roles
         WHERE rolname='erp_evidence_storage'
           AND (rolsuper OR rolreplication OR rolbypassrls)
    ) THEN
        RAISE EXCEPTION 'erp_evidence_storage protected role posture drifted';
    END IF;
END
$protected_role_authority$;

-- Hosted Supabase deliberately exposes a non-superuser CREATEROLE principal.
-- Reconcile only attributes that principal is allowed to change; mentioning
-- SUPERUSER, REPLICATION, or BYPASSRLS in ALTER ROLE is itself forbidden.
ALTER ROLE erp_evidence_storage
    NOLOGIN NOINHERIT NOCREATEDB NOCREATEROLE;

DO $role_authority$
DECLARE
    evidence_role_oid oid := 'erp_evidence_storage'::regrole::oid;
    authenticator_oid oid := 'authenticator'::regrole::oid;
    administrator_oid oid := current_user::regrole::oid;
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_catalog.pg_roles
         WHERE oid=evidence_role_oid
           AND NOT rolcanlogin
           AND NOT rolinherit
           AND NOT rolsuper
           AND NOT rolcreatedb
           AND NOT rolcreaterole
           AND NOT rolreplication
           AND NOT rolbypassrls
    ) THEN
        RAISE EXCEPTION 'erp_evidence_storage role posture drifted';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_catalog.pg_auth_members
         WHERE member=evidence_role_oid
    ) THEN
        RAISE EXCEPTION 'erp_evidence_storage must not inherit or SET ROLE into another role';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_catalog.pg_auth_members
         WHERE roleid=evidence_role_oid
           AND member NOT IN (authenticator_oid,administrator_oid)
    ) THEN
        RAISE EXCEPTION 'erp_evidence_storage has an unexpected member';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_catalog.pg_auth_members
         WHERE roleid=evidence_role_oid
           AND member=administrator_oid
           AND NOT admin_option
    ) THEN
        RAISE EXCEPTION 'erp_evidence_storage creator membership drifted';
    END IF;
    IF NOT (
        SELECT relrowsecurity
          FROM pg_catalog.pg_class
         WHERE oid='storage.objects'::regclass
    ) THEN
        RAISE EXCEPTION 'storage.objects must have row-level security enabled';
    END IF;
END
$role_authority$;

GRANT erp_evidence_storage TO authenticator;
REVOKE ALL PRIVILEGES ON SCHEMA storage FROM erp_evidence_storage;
REVOKE ALL PRIVILEGES ON TABLE storage.buckets, storage.objects
    FROM erp_evidence_storage;
GRANT USAGE ON SCHEMA storage TO erp_evidence_storage;
GRANT SELECT ON TABLE storage.buckets TO erp_evidence_storage;
GRANT SELECT, INSERT, DELETE ON TABLE storage.objects TO erp_evidence_storage;

INSERT INTO storage.buckets (
    id,name,public,file_size_limit,allowed_mime_types
) VALUES (
    'canonical-evidence-private-v1',
    'canonical-evidence-private-v1',
    false,
    10485760,
    ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE
   SET public=false,
       file_size_limit=EXCLUDED.file_size_limit,
       allowed_mime_types=EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS canonical_evidence_server_select ON storage.objects;
DROP POLICY IF EXISTS canonical_evidence_server_insert ON storage.objects;
DROP POLICY IF EXISTS canonical_evidence_server_delete ON storage.objects;

CREATE POLICY canonical_evidence_server_select
    ON storage.objects FOR SELECT TO erp_evidence_storage
    USING (
        bucket_id='canonical-evidence-private-v1'
        AND storage.allow_any_operation(ARRAY[
            'storage.object.upload',
            'storage.object.get_authenticated',
            'storage.object.delete'
        ])
        AND storage.extension(name)='pdf'
        AND cardinality(storage.foldername(name))=3
        AND (storage.foldername(name))[1]
              ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        AND (storage.foldername(name))[2]
              ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        AND (storage.foldername(name))[3]='expense_receipt'
        AND storage.filename(name)
              ~ '^[0-9a-f]{64}\.pdf$'
    );

CREATE POLICY canonical_evidence_server_insert
    ON storage.objects FOR INSERT TO erp_evidence_storage
    WITH CHECK (
        bucket_id='canonical-evidence-private-v1'
        AND storage.extension(name)='pdf'
        AND cardinality(storage.foldername(name))=3
        AND (storage.foldername(name))[1]
              ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        AND (storage.foldername(name))[2]
              ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        AND (storage.foldername(name))[3]='expense_receipt'
        AND storage.filename(name)
              ~ '^[0-9a-f]{64}\.pdf$'
    );

CREATE POLICY canonical_evidence_server_delete
    ON storage.objects FOR DELETE TO erp_evidence_storage
    USING (
        bucket_id='canonical-evidence-private-v1'
        AND storage.extension(name)='pdf'
        AND cardinality(storage.foldername(name))=3
        AND (storage.foldername(name))[1]
              ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        AND (storage.foldername(name))[2]
              ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        AND (storage.foldername(name))[3]='expense_receipt'
        AND storage.filename(name)
              ~ '^[0-9a-f]{64}\.pdf$'
    );

DO $policy_authority$
DECLARE
    evidence_role_oid oid := 'erp_evidence_storage'::regrole::oid;
BEGIN
    IF EXISTS (
        SELECT 1
          FROM pg_catalog.pg_policy
         WHERE polrelid='storage.objects'::regclass
           AND (0=ANY(polroles) OR evidence_role_oid=ANY(polroles))
           AND polname NOT IN (
               'canonical_evidence_server_select',
               'canonical_evidence_server_insert',
               'canonical_evidence_server_delete'
           )
    ) THEN
        RAISE EXCEPTION 'a public or extra evidence-role policy can broaden storage authority';
    END IF;
    IF NOT pg_catalog.has_schema_privilege(
        'erp_evidence_storage', 'storage', 'USAGE'
    ) OR pg_catalog.has_schema_privilege(
        'erp_evidence_storage', 'storage', 'CREATE'
    ) THEN
        RAISE EXCEPTION 'erp_evidence_storage schema privileges drifted';
    END IF;
    IF (
        SELECT pg_catalog.count(*)
          FROM information_schema.role_table_grants
         WHERE grantee='erp_evidence_storage'
           AND (table_schema,table_name,privilege_type) IN (
               ('storage','buckets','SELECT'),
               ('storage','objects','SELECT'),
               ('storage','objects','INSERT'),
               ('storage','objects','DELETE')
           )
    )<>4 OR EXISTS (
        SELECT 1
          FROM information_schema.role_table_grants
         WHERE grantee='erp_evidence_storage'
           AND (table_schema,table_name,privilege_type) NOT IN (
               ('storage','buckets','SELECT'),
               ('storage','objects','SELECT'),
               ('storage','objects','INSERT'),
               ('storage','objects','DELETE')
           )
    ) THEN
        RAISE EXCEPTION 'erp_evidence_storage table privileges drifted';
    END IF;
END
$policy_authority$;

COMMIT;
