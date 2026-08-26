-- Restrict the Supabase Auth custom access-token hook to one reviewed
-- evidence-storage service identity.  The service user itself is reconciled
-- through the hosted Auth Admin API after this migration is applied.

SET LOCAL ROLE erp_migration_owner;

DO $supabase_auth_admin_preflight$
BEGIN
    IF pg_catalog.to_regrole('supabase_auth_admin') IS NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = 'undefined_object',
            MESSAGE = 'Supabase Auth hook principal supabase_auth_admin is absent';
    END IF;
END
$supabase_auth_admin_preflight$;

CREATE OR REPLACE FUNCTION erp_security.canonical_evidence_storage_access_token_hook(
    event jsonb
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $canonical_evidence_storage_access_token_hook$
DECLARE
    service_auth_user_id constant uuid :=
        'd3000000-0000-4000-8000-0000000000e1'::uuid;
    service_email constant text :=
        'canonical-evidence-storage@service.aasopharma.invalid';
    service_marker constant text := 'canonical-evidence-storage-service-v1';
    service_role constant text := 'erp_evidence_storage';
    claims jsonb := event->'claims';
    event_user_id text := event->>'user_id';
    claim_subject text := claims->>'sub';
    claim_email text := pg_catalog.lower(claims->>'email');
    claim_marker text := claims#>>'{app_metadata,erp_service_identity}';
    claim_service_role text := claims#>>'{app_metadata,erp_service_role}';
    claim_token_marker text := claims->>'erp_service_identity';
    claim_role text := claims->>'role';
    authentication_method text := event->>'authentication_method';
    is_service_candidate boolean;
    issued_at_epoch numeric;
    original_expiry_epoch numeric;
    bounded_expiry_epoch numeric;
BEGIN
    IF pg_catalog.jsonb_typeof(event) IS DISTINCT FROM 'object'
       OR pg_catalog.jsonb_typeof(claims) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'custom access token hook event is malformed';
    END IF;

    is_service_candidate :=
        event_user_id IS NOT DISTINCT FROM service_auth_user_id::text
        OR claim_subject IS NOT DISTINCT FROM service_auth_user_id::text
        OR claim_email IS NOT DISTINCT FROM service_email
        OR claim_marker IS NOT DISTINCT FROM service_marker
        OR claim_service_role IS NOT DISTINCT FROM service_role
        OR claim_token_marker IS NOT DISTINCT FROM service_marker
        OR claim_role IS NOT DISTINCT FROM service_role;

    IF NOT is_service_candidate THEN
        RETURN pg_catalog.jsonb_build_object('claims', claims);
    END IF;

    IF event_user_id IS DISTINCT FROM service_auth_user_id::text
       OR claim_subject IS DISTINCT FROM service_auth_user_id::text
       OR claim_email IS DISTINCT FROM service_email
       OR claim_marker IS DISTINCT FROM service_marker
       OR claim_service_role IS DISTINCT FROM service_role
       OR (
           claim_token_marker IS NOT NULL
           AND claim_token_marker IS DISTINCT FROM service_marker
       )
       OR claim_role IS DISTINCT FROM 'authenticated'
       OR claims->>'aud' IS DISTINCT FROM 'authenticated'
       OR authentication_method NOT IN ('password', 'token_refresh') THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'canonical evidence storage service identity is invalid';
    END IF;

    IF pg_catalog.jsonb_typeof(claims->'iat') IS DISTINCT FROM 'number'
       OR pg_catalog.jsonb_typeof(claims->'exp') IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'canonical evidence storage token lifetime is invalid';
    END IF;
    issued_at_epoch := (claims->>'iat')::numeric;
    original_expiry_epoch := (claims->>'exp')::numeric;
    IF issued_at_epoch <> pg_catalog.trunc(issued_at_epoch)
       OR original_expiry_epoch <> pg_catalog.trunc(original_expiry_epoch)
       OR original_expiry_epoch <= issued_at_epoch THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'canonical evidence storage token lifetime is invalid';
    END IF;
    bounded_expiry_epoch := LEAST(
        original_expiry_epoch,
        issued_at_epoch + 900,
        pg_catalog.floor(EXTRACT(epoch FROM pg_catalog.now())) + 900
    );

    claims := pg_catalog.jsonb_set(
        claims,
        ARRAY['role']::text[],
        pg_catalog.to_jsonb(service_role),
        false
    );
    claims := pg_catalog.jsonb_set(
        claims,
        ARRAY['exp']::text[],
        pg_catalog.to_jsonb(bounded_expiry_epoch::bigint),
        false
    );
    claims := pg_catalog.jsonb_set(
        claims,
        ARRAY['erp_service_identity']::text[],
        pg_catalog.to_jsonb(service_marker),
        true
    );
    RETURN pg_catalog.jsonb_build_object('claims', claims);
END
$canonical_evidence_storage_access_token_hook$;

REVOKE ALL ON FUNCTION
    erp_security.canonical_evidence_storage_access_token_hook(jsonb)
    FROM PUBLIC;
GRANT USAGE ON SCHEMA erp_security TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION
    erp_security.canonical_evidence_storage_access_token_hook(jsonb)
    TO supabase_auth_admin;

DO $hook_privilege_authority$
DECLARE
    hook_oid oid :=
        'erp_security.canonical_evidence_storage_access_token_hook(jsonb)'::regprocedure::oid;
    auth_admin_oid oid := 'supabase_auth_admin'::regrole::oid;
BEGIN
    IF EXISTS (
        SELECT 1
          FROM pg_catalog.aclexplode(
                   COALESCE(
                       (SELECT proacl FROM pg_catalog.pg_proc WHERE oid=hook_oid),
                       pg_catalog.acldefault('f',
                           (SELECT proowner FROM pg_catalog.pg_proc WHERE oid=hook_oid))
                   )
               ) AS grant_row
         WHERE grant_row.grantee=0
           AND grant_row.privilege_type='EXECUTE'
    ) OR NOT pg_catalog.has_function_privilege(
        'supabase_auth_admin', hook_oid, 'EXECUTE'
    ) OR NOT pg_catalog.has_schema_privilege(
        'supabase_auth_admin', 'erp_security', 'USAGE'
    ) THEN
        RAISE EXCEPTION 'canonical evidence storage Auth hook privilege drifted';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM pg_catalog.aclexplode(
                   COALESCE(
                       (SELECT proacl FROM pg_catalog.pg_proc WHERE oid=hook_oid),
                       pg_catalog.acldefault('f',
                           (SELECT proowner FROM pg_catalog.pg_proc WHERE oid=hook_oid))
                   )
               ) AS grant_row
         WHERE grant_row.privilege_type='EXECUTE'
           AND grant_row.grantee NOT IN (
               auth_admin_oid,
               (SELECT proowner FROM pg_catalog.pg_proc WHERE oid=hook_oid)
           )
    ) THEN
        RAISE EXCEPTION 'canonical evidence storage Auth hook has an unexpected grantee';
    END IF;
END
$hook_privilege_authority$;

RESET ROLE;
