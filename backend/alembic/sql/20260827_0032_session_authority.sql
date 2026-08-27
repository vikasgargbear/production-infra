-- Canonical public-session authority.
--
-- Command execution and public session admission are deliberately separate:
-- deployment provisioning may use the command boundary without admitting
-- normal browser or MCP sessions.

-- Incremental migrations enter the canonical owner context explicitly.  Role
-- creation is cluster-level administration, so the reviewed migration
-- principal resumes only for that bounded bootstrap below.
SET LOCAL ROLE erp_migration_owner;
RESET ROLE;

DO $session_authority_role$
DECLARE
    existing pg_catalog.pg_roles%ROWTYPE;
BEGIN
    SELECT * INTO existing
      FROM pg_catalog.pg_roles
     WHERE rolname='erp_session_authority';
    IF NOT FOUND THEN
        CREATE ROLE erp_session_authority
          NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
          INHERIT NOBYPASSRLS NOREPLICATION;
    ELSIF existing.rolcanlogin
       OR existing.rolsuper
       OR existing.rolcreatedb
       OR existing.rolcreaterole
       OR NOT existing.rolinherit
       OR existing.rolbypassrls
       OR existing.rolreplication THEN
        RAISE EXCEPTION USING
          ERRCODE='42501',
          MESSAGE='erp_session_authority role posture is invalid';
    END IF;
END
$session_authority_role$;

-- A migration never opens public traffic.  Only the reviewed write-fence
-- transition may grant this role to the runtime login after provisioning.
REVOKE erp_session_authority FROM
  erp_app,
  erp_runtime,
  erp_calculator,
  erp_regulatory_importer,
  erp_tax_provider;

-- Restore and then release the canonical owner context before Alembic returns
-- this connection to its pool.
SET LOCAL ROLE erp_migration_owner;
RESET ROLE;
