-- Close the final tenant-table FORCE RLS gaps in canonical tax lineage.
--
-- Runtime principals retain SELECT-only, tenant-scoped access through the
-- policies installed by 0021. Reviewed command and trigger mutations execute
-- through SECURITY DEFINER functions owned by the NOLOGIN/BYPASSRLS migration
-- authority, so forcing RLS does not change their execution posture.

-- Supabase runs Alembic through its managed postgres login. The deployment
-- workflow grants that login SET-only membership in the reviewed NOLOGIN
-- migration authority for the duration of the migration, then revokes it.
-- Assume the table-owning role explicitly so ALTER TABLE has identical
-- ownership semantics in disposable PostgreSQL and canonical staging.
SET LOCAL ROLE erp_migration_owner;

ALTER TABLE tax.input_credit_lots FORCE ROW LEVEL SECURITY;
ALTER TABLE tax.input_credit_reversal_events FORCE ROW LEVEL SECURITY;
ALTER TABLE tax.input_credit_applications FORCE ROW LEVEL SECURITY;

DO $migration$
DECLARE
  relation_count integer;
  all_rls_forced boolean;
  all_owned_by_migration_authority boolean;
BEGIN
  SELECT count(*),
         bool_and(relation.relrowsecurity AND relation.relforcerowsecurity),
         bool_and(owner_role.rolname='erp_migration_owner')
    INTO relation_count,all_rls_forced,all_owned_by_migration_authority
    FROM pg_catalog.pg_class relation
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
    JOIN pg_catalog.pg_roles owner_role ON owner_role.oid=relation.relowner
   WHERE namespace.nspname='tax'
     AND relation.relname IN (
       'input_credit_lots',
       'input_credit_reversal_events',
       'input_credit_applications'
     )
     AND relation.relkind='r';

  IF relation_count<>3 OR NOT all_rls_forced OR NOT all_owned_by_migration_authority THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='input-credit tenant relations do not match reviewed FORCE RLS ownership';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles role
     WHERE role.rolname='erp_migration_owner'
       AND role.rolbypassrls
       AND NOT role.rolcanlogin
  ) THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='input-credit command owner is not the reviewed NOLOGIN/BYPASSRLS authority';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM (VALUES
        ('tax.input_credit_lots'),
        ('tax.input_credit_reversal_events'),
        ('tax.input_credit_applications')
      ) AS target(qualified_name)
     WHERE pg_catalog.has_table_privilege('erp_app',target.qualified_name,'INSERT')
        OR pg_catalog.has_table_privilege('erp_app',target.qualified_name,'UPDATE')
        OR pg_catalog.has_table_privilege('erp_app',target.qualified_name,'DELETE')
        OR pg_catalog.has_table_privilege('erp_runtime',target.qualified_name,'INSERT')
        OR pg_catalog.has_table_privilege('erp_runtime',target.qualified_name,'UPDATE')
        OR pg_catalog.has_table_privilege('erp_runtime',target.qualified_name,'DELETE')
  ) THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='input-credit tenant relations expose direct runtime mutation privileges';
  END IF;
END
$migration$;

RESET ROLE;
