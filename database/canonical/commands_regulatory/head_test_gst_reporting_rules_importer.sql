\set ON_ERROR_STOP on

BEGIN;

DO $fixture$
DECLARE importer_definition text; stage_definition text; release_dates_definition text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='tax' AND table_name='gstr1_reporting_rule_versions'
       AND column_name='activated_by_user_id' AND is_nullable='NO'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='tax' AND table_name='gstr1_reporting_rule_versions'
       AND column_name='activation_request_id' AND is_nullable='NO'
  ) THEN
    RAISE EXCEPTION 'GST reporting activation attestation columns are missing';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(procedure.oid) INTO importer_definition
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
   WHERE namespace.nspname='erp_regulatory_commands'
     AND procedure.proname='import_gstr1_reporting_release';
  IF importer_definition IS NULL
     OR importer_definition NOT LIKE '%SESSION_USER<>''erp_regulatory_importer''%'
     OR importer_definition NOT LIKE '%p_activated_by_user_id=p_reviewed_by_user_id%'
     OR importer_definition NOT LIKE '%extensions.digest(p_source_bytes,''sha256'')%'
     OR importer_definition NOT LIKE '%one complete non-overlapping exact rule set%'
     OR importer_definition NOT LIKE '%stage_release(%'
     OR importer_definition NOT LIKE '%finish_release(%'
     OR importer_definition LIKE '%250000%'
     OR importer_definition LIKE '%100000%' THEN
    RAISE EXCEPTION 'governed GST reporting exact-set importer is incomplete or contains defaults';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(procedure.oid) INTO stage_definition
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
   WHERE namespace.nspname='erp_regulatory_commands' AND procedure.proname='stage_release';
  IF stage_definition NOT LIKE '%gst_reporting_rules%'
     OR stage_definition NOT LIKE '%canonical PostgreSQL JSONB bytes%'
     OR stage_definition NOT LIKE '%reference source or canonical dataset SHA-256 mismatch%' THEN
    RAISE EXCEPTION 'GST reporting rules are absent from the governed release stage';
  END IF;

  SELECT pg_catalog.pg_get_constraintdef(constraint_row.oid)
    INTO release_dates_definition
    FROM pg_catalog.pg_constraint AS constraint_row
   WHERE constraint_row.conrelid='core.reference_data_releases'::regclass
     AND constraint_row.conname='reference_data_releases_dates_ck';
  IF release_dates_definition IS NULL
     OR release_dates_definition NOT LIKE '%dataset_kind = ANY%'
     OR release_dates_definition NOT LIKE '%gst_reporting_rules%'
     OR release_dates_definition NOT LIKE '%gst_itc_reversal_rules%'
     OR release_dates_definition NOT LIKE '%publication_date <= effective_from%'
     OR release_dates_definition NOT LIKE '%effective_to >= effective_from%'
     OR release_dates_definition NOT LIKE '%reviewed_at <= created_at%' THEN
    RAISE EXCEPTION 'reference release dates do not permit only governed retrospective GST rule datasets';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
    WHERE namespace.nspname='erp_regulatory_commands'
      AND procedure.proname='import_gstr1_reporting_release'
      AND pg_catalog.has_function_privilege('erp_regulatory_importer',procedure.oid,'EXECUTE')
      AND NOT pg_catalog.has_function_privilege('erp_app',procedure.oid,'EXECUTE')
      AND NOT pg_catalog.has_function_privilege('erp_runtime',procedure.oid,'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'GST reporting import execution grants are unsafe';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
     WHERE tgrelid='tax.gstr1_reporting_rule_versions'::regclass
       AND tgname='gstr1_reporting_rule_versions_release_guard'
       AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'GST reporting release mutation guard is missing';
  END IF;
END
$fixture$;

ROLLBACK;
