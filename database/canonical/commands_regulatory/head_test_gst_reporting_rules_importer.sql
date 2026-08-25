\set ON_ERROR_STOP on

BEGIN;

DO $fixture$
DECLARE importer_definition text; stage_definition text; violation_constraint text;
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

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint AS constraint_row
     WHERE constraint_row.conrelid='core.reference_data_releases'::regclass
       AND constraint_row.conname='reference_data_releases_dates_ck'
       AND constraint_row.contype='c'
       AND constraint_row.convalidated
  ) THEN
    RAISE EXCEPTION 'validated reference release date constraint is missing';
  END IF;

  CREATE TEMP TABLE reference_release_date_probe
    (LIKE core.reference_data_releases INCLUDING DEFAULTS INCLUDING CONSTRAINTS)
    ON COMMIT DROP;

  INSERT INTO reference_release_date_probe (
    id,dataset_kind,ruleset_version,source_authority,source_uri,
    source_storage_bucket,source_storage_object_path,source_media_type,
    source_document_sha256,dataset_storage_bucket,dataset_storage_object_path,
    dataset_media_type,dataset_sha256,record_count,publication_date,effective_from,
    effective_to,reviewed_by_user_id,reviewed_at,status,created_at
  ) VALUES
    ('10000000-0000-7000-8000-000000000001','gst_reporting_rules','reporting-probe','gstn','https://example.invalid/reporting',
     'probe','reporting-source','application/pdf',decode(repeat('01',32),'hex'),'probe','reporting-dataset',
     'application/json',decode(repeat('02',32),'hex'),1,'2024-08-01','2017-07-01',NULL,
     '10000000-0000-7000-8000-000000000010','2024-08-02 00:00:00+00','staged','2024-08-03 00:00:00+00'),
    ('10000000-0000-7000-8000-000000000002','gst_itc_reversal_rules','itc-probe','gstn','https://example.invalid/itc',
     'probe','itc-source','application/pdf',decode(repeat('03',32),'hex'),'probe','itc-dataset',
     'application/json',decode(repeat('04',32),'hex'),1,'2024-08-01','2017-07-01',NULL,
     '10000000-0000-7000-8000-000000000010','2024-08-02 00:00:00+00','staged','2024-08-03 00:00:00+00');

  BEGIN
    INSERT INTO reference_release_date_probe (
      id,dataset_kind,ruleset_version,source_authority,source_uri,
      source_storage_bucket,source_storage_object_path,source_media_type,
      source_document_sha256,dataset_storage_bucket,dataset_storage_object_path,
      dataset_media_type,dataset_sha256,record_count,publication_date,effective_from,
      effective_to,reviewed_by_user_id,reviewed_at,status,created_at
    ) VALUES (
      '10000000-0000-7000-8000-000000000003','hsn_sac_tax','ordinary-probe','gstn','https://example.invalid/ordinary',
      'probe','ordinary-source','application/pdf',decode(repeat('05',32),'hex'),'probe','ordinary-dataset',
      'application/json',decode(repeat('06',32),'hex'),1,'2024-08-01','2017-07-01',NULL,
      '10000000-0000-7000-8000-000000000010','2024-08-02 00:00:00+00','staged','2024-08-03 00:00:00+00');
    RAISE EXCEPTION 'ordinary retrospective reference release was accepted';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS violation_constraint=CONSTRAINT_NAME;
    IF violation_constraint<>'reference_data_releases_dates_ck' THEN RAISE; END IF;
  END;

  BEGIN
    INSERT INTO reference_release_date_probe (
      id,dataset_kind,ruleset_version,source_authority,source_uri,
      source_storage_bucket,source_storage_object_path,source_media_type,
      source_document_sha256,dataset_storage_bucket,dataset_storage_object_path,
      dataset_media_type,dataset_sha256,record_count,publication_date,effective_from,
      effective_to,reviewed_by_user_id,reviewed_at,status,created_at
    ) VALUES (
      '10000000-0000-7000-8000-000000000004','gst_reporting_rules','range-probe','gstn','https://example.invalid/range',
      'probe','range-source','application/pdf',decode(repeat('07',32),'hex'),'probe','range-dataset',
      'application/json',decode(repeat('08',32),'hex'),1,'2024-08-01','2017-07-01','2017-06-30',
      '10000000-0000-7000-8000-000000000010','2024-08-02 00:00:00+00','staged','2024-08-03 00:00:00+00');
    RAISE EXCEPTION 'inverted reference release effective range was accepted';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS violation_constraint=CONSTRAINT_NAME;
    IF violation_constraint<>'reference_data_releases_dates_ck' THEN RAISE; END IF;
  END;

  BEGIN
    INSERT INTO reference_release_date_probe (
      id,dataset_kind,ruleset_version,source_authority,source_uri,
      source_storage_bucket,source_storage_object_path,source_media_type,
      source_document_sha256,dataset_storage_bucket,dataset_storage_object_path,
      dataset_media_type,dataset_sha256,record_count,publication_date,effective_from,
      effective_to,reviewed_by_user_id,reviewed_at,status,created_at
    ) VALUES (
      '10000000-0000-7000-8000-000000000005','gst_reporting_rules','review-probe','gstn','https://example.invalid/review',
      'probe','review-source','application/pdf',decode(repeat('09',32),'hex'),'probe','review-dataset',
      'application/json',decode(repeat('0a',32),'hex'),1,'2024-08-01','2017-07-01',NULL,
      '10000000-0000-7000-8000-000000000010','2024-08-04 00:00:00+00','staged','2024-08-03 00:00:00+00');
    RAISE EXCEPTION 'post-creation reference release review was accepted';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS violation_constraint=CONSTRAINT_NAME;
    IF violation_constraint<>'reference_data_releases_dates_ck' THEN RAISE; END IF;
  END;

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
