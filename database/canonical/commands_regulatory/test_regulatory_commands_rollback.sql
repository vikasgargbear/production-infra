\set ON_ERROR_STOP on

BEGIN;

DO $fixture$
DECLARE definition text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
     WHERE rolname='erp_regulatory_importer' AND rolcanlogin AND NOT rolinherit
       AND NOT rolsuper AND NOT rolbypassrls
  ) THEN RAISE EXCEPTION 'isolated regulatory importer role is missing'; END IF;
  IF pg_catalog.has_table_privilege('erp_regulatory_importer','erp_regulatory_commands.command_scopes','SELECT')
     OR pg_catalog.has_table_privilege('erp_app','erp_regulatory_commands.command_scopes','INSERT') THEN
    RAISE EXCEPTION 'transaction scope table is exposed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
    WHERE namespace.nspname='erp_regulatory_commands'
      AND procedure.proname IN ('import_ingredient_release','import_tax_release','import_withholding_release')
      AND pg_catalog.has_function_privilege('erp_app',procedure.oid,'EXECUTE')
  ) THEN RAISE EXCEPTION 'application can execute official reference import'; END IF;
  IF (
    SELECT count(*) FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
    WHERE namespace.nspname='erp_regulatory_commands'
      AND procedure.proname IN ('import_ingredient_release','import_tax_release','import_withholding_release')
      AND pg_catalog.has_function_privilege('erp_regulatory_importer',procedure.oid,'EXECUTE')
  )<>3 THEN RAISE EXCEPTION 'isolated importer command surface is incomplete'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
    WHERE namespace.nspname='erp_master_commands'
      AND procedure.proname='activate_configured_product'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc AS procedure
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
      WHERE namespace.nspname='erp_regulatory_commands' AND procedure.proname='activate_product'
        AND (
          pg_catalog.has_function_privilege('erp_app',procedure.oid,'EXECUTE')
          OR pg_catalog.has_function_privilege('erp_runtime',procedure.oid,'EXECUTE')
        )
    ) THEN RAISE EXCEPTION 'lower-level product activation grant is exposed'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc AS procedure
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
      WHERE namespace.nspname='erp_master_commands'
        AND procedure.proname='activate_configured_product'
        AND pg_catalog.has_function_privilege('erp_runtime',procedure.oid,'EXECUTE')
    ) THEN RAISE EXCEPTION 'canonical product activation grant is missing'; END IF;
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
    WHERE namespace.nspname='erp_regulatory_commands' AND procedure.proname='activate_product'
      AND pg_catalog.has_function_privilege('erp_app',procedure.oid,'EXECUTE')
  ) THEN RAISE EXCEPTION 'baseline product activation grant is missing'; END IF;
  SELECT pg_catalog.pg_get_functiondef(procedure.oid) INTO definition
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
   WHERE namespace.nspname='erp_plumbing' AND procedure.proname='audit_row_mutation';
  IF definition NOT LIKE '%SESSION_USER = ''erp_regulatory_importer''%'
     OR definition NOT LIKE '%scope.scope=''reference_import''%'
     OR definition NOT LIKE '%event_request_id IS NOT NULL%'
     OR definition NOT LIKE '%WHEN regulatory_import_scope THEN ''system''%'
     OR definition LIKE '%GRANT "erp_migration_owner" TO "erp_regulatory_importer"%' THEN
    RAISE EXCEPTION 'scoped system audit boundary is incomplete';
  END IF;
END
$fixture$;

ROLLBACK;
