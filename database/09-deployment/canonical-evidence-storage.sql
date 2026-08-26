-- Canonical private evidence bucket authority.
--
-- Apply only to the disposable canonical Supabase project.  This role has no
-- database-table authority outside Supabase Storage and is never a browser
-- credential.  The ERP backend uses a Supabase `sb_secret_` API key configured
-- with the custom role `erp_evidence_storage`; do not substitute the Supabase
-- service-role key.

BEGIN;

DO $role$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='erp_evidence_storage') THEN
        CREATE ROLE erp_evidence_storage NOLOGIN NOINHERIT NOBYPASSRLS;
    END IF;
END
$role$;

GRANT erp_evidence_storage TO authenticator;
GRANT USAGE ON SCHEMA storage TO erp_evidence_storage;
GRANT SELECT ON TABLE storage.buckets TO erp_evidence_storage;
GRANT SELECT, INSERT, DELETE ON TABLE storage.objects TO erp_evidence_storage;
REVOKE UPDATE ON TABLE storage.objects FROM erp_evidence_storage;

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
    USING (bucket_id='canonical-evidence-private-v1');

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
    USING (bucket_id='canonical-evidence-private-v1');

COMMIT;
