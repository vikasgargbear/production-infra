SET LOCAL ROLE erp_migration_owner;

ALTER TABLE tax.gstr1_reporting_rule_versions
  ADD COLUMN activated_by_user_id uuid NOT NULL,
  ADD COLUMN activated_at timestamptz NOT NULL,
  ADD COLUMN activation_request_id uuid NOT NULL,
  ADD CONSTRAINT gstr1_reporting_rule_versions_activator_fk
    FOREIGN KEY (activated_by_user_id) REFERENCES core.users(id) ON DELETE RESTRICT;

ALTER TABLE tax.gstr1_reporting_rule_versions
  DROP CONSTRAINT gstr1_reporting_rule_versions_effective_uq;
CREATE UNIQUE INDEX gstr1_reporting_rule_versions_active_effective_uq
  ON tax.gstr1_reporting_rule_versions(effective_from,rule_code)
  WHERE status='active';

CREATE OR REPLACE FUNCTION erp_regulatory_commands.stage_release(
  p_release_id uuid, p_dataset_kind text, p_ruleset_version varchar,
  p_source_authority text, p_source_uri text, p_source_storage_bucket text,
  p_source_storage_object_path text, p_source_media_type varchar,
  p_source_bytes bytea, p_source_sha256 bytea,
  p_dataset_storage_bucket text, p_dataset_storage_object_path text,
  p_dataset_bytes bytea, p_dataset_sha256 bytea,
  p_publication_date date, p_effective_from date, p_effective_to date,
  p_reviewed_by_user_id uuid, p_reviewed_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE prior_id uuid; canonical_hash bytea; source_hash bytea; row_count integer; dataset_rows jsonb;
BEGIN
    IF SESSION_USER<>'erp_regulatory_importer' THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='reference import requires the isolated regulatory importer principal';
    END IF;
    IF p_dataset_kind NOT IN ('ingredient_classification','hsn_sac_tax','withholding_rules','controlled_movement_rules','einvoice_rules','gst_adjustment_rules','gst_reporting_rules')
       OR pg_catalog.btrim(p_ruleset_version)='' OR pg_catalog.btrim(p_source_media_type)=''
       OR pg_catalog.btrim(p_source_storage_bucket)='' OR pg_catalog.btrim(p_source_storage_object_path)=''
       OR pg_catalog.btrim(p_dataset_storage_bucket)='' OR pg_catalog.btrim(p_dataset_storage_object_path)=''
       OR NOT ((p_dataset_kind='ingredient_classification' AND p_source_authority='cdsco'
                AND p_source_uri ~ '^https://([a-z0-9-]+\.)*cdsco\.gov\.in(/|$)')
            OR (p_dataset_kind='hsn_sac_tax' AND p_source_authority='gst_portal'
                AND p_source_uri ~ '^https://([a-z0-9-]+\.)*gst\.gov\.in(/|$)')
            OR (p_dataset_kind='hsn_sac_tax' AND p_source_authority='gst_council'
                AND p_source_uri ~ '^https://([a-z0-9-]+\.)*gstcouncil\.gov\.in(/|$)')
            OR (p_dataset_kind='hsn_sac_tax' AND p_source_authority='cbic'
                AND p_source_uri ~ '^https://([a-z0-9-]+\.)*cbic-gst\.gov\.in(/|$)')
            OR (p_dataset_kind='hsn_sac_tax' AND p_source_authority='gstn'
                AND p_source_uri ~ '^https://([a-z0-9-]+\.)*gstn\.org\.in(/|$)')
            OR (p_dataset_kind='withholding_rules' AND p_source_authority='income_tax_department'
                AND (p_source_uri ~ '^https://([a-z0-9-]+\.)*incometax\.gov\.in(/|$)'
                  OR p_source_uri ~ '^https://([a-z0-9-]+\.)*incometaxindia\.gov\.in(/|$)'))
            OR (p_dataset_kind='withholding_rules' AND p_source_authority='cbic'
                AND p_source_uri ~ '^https://([a-z0-9-]+\.)*cbic-gst\.gov\.in(/|$)')
            OR (p_dataset_kind='controlled_movement_rules' AND p_source_authority='cdsco'
                AND p_source_uri ~ '^https://([a-z0-9-]+\.)*cdsco\.gov\.in(/|$)')
            OR (p_dataset_kind='controlled_movement_rules' AND p_source_authority='revenue_department'
                AND p_source_uri ~ '^https://([a-z0-9-]+\.)*dor\.gov\.in(/|$)')
            OR (p_dataset_kind IN ('einvoice_rules','gst_adjustment_rules','gst_reporting_rules') AND p_source_authority='gst_portal'
                AND p_source_uri ~ '^https://([a-z0-9-]+\.)*gst\.gov\.in(/|$)')
            OR (p_dataset_kind IN ('einvoice_rules','gst_adjustment_rules','gst_reporting_rules') AND p_source_authority='gst_council'
                AND p_source_uri ~ '^https://([a-z0-9-]+\.)*gstcouncil\.gov\.in(/|$)')
            OR (p_dataset_kind IN ('einvoice_rules','gst_adjustment_rules','gst_reporting_rules') AND p_source_authority='cbic'
                AND p_source_uri ~ '^https://([a-z0-9-]+\.)*cbic-gst\.gov\.in(/|$)')
            OR (p_dataset_kind IN ('einvoice_rules','gst_adjustment_rules','gst_reporting_rules') AND p_source_authority='gstn'
                AND p_source_uri ~ '^https://([a-z0-9-]+\.)*gstn\.org\.in(/|$)'))
       OR (p_dataset_kind<>'gst_reporting_rules' AND p_publication_date>p_effective_from)
       OR p_reviewed_at>pg_catalog.transaction_timestamp()
       OR p_reviewed_at::date<p_publication_date
       OR p_effective_from>CURRENT_DATE OR (p_effective_to IS NOT NULL AND p_effective_to<CURRENT_DATE)
       OR (p_effective_to IS NOT NULL AND p_effective_to<p_effective_from)
       OR pg_catalog.octet_length(p_source_bytes) NOT BETWEEN 1 AND 104857600
       OR pg_catalog.octet_length(p_dataset_bytes) NOT BETWEEN 2 AND 104857600
       OR pg_catalog.octet_length(p_source_sha256)<>32 OR pg_catalog.octet_length(p_dataset_sha256)<>32 THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='reference source, review, effective period or dataset envelope is invalid';
    END IF;
    PERFORM 1 FROM core.users WHERE id=p_reviewed_by_user_id AND status='active' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='reference release reviewer must be an active typed user'; END IF;
    BEGIN
      dataset_rows:=pg_catalog.convert_from(p_dataset_bytes,'UTF8')::jsonb;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='canonical reference dataset artifact is not UTF-8 JSON';
    END;
    IF pg_catalog.jsonb_typeof(dataset_rows)<>'array'
       OR p_dataset_bytes IS DISTINCT FROM pg_catalog.convert_to(dataset_rows::text,'UTF8') THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='dataset artifact must use canonical PostgreSQL JSONB bytes';
    END IF;
    row_count:=pg_catalog.jsonb_array_length(dataset_rows);
    IF row_count NOT BETWEEN 1 AND 500000 THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='reference dataset must contain a bounded non-empty exact set';
    END IF;
    source_hash:=extensions.digest(p_source_bytes,'sha256');
    canonical_hash:=extensions.digest(p_dataset_bytes,'sha256');
    IF source_hash IS DISTINCT FROM p_source_sha256 OR canonical_hash IS DISTINCT FROM p_dataset_sha256 THEN
        RAISE EXCEPTION USING ERRCODE='22000', MESSAGE='reference source or canonical dataset SHA-256 mismatch';
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_dataset_kind,20260820));
    SELECT id INTO prior_id FROM core.reference_data_releases
     WHERE dataset_kind=p_dataset_kind AND status='active' FOR UPDATE;
    IF prior_id IS NOT NULL THEN
      IF p_dataset_kind<>'gst_reporting_rules' AND EXISTS (
          SELECT 1 FROM core.reference_data_releases
           WHERE id=prior_id AND effective_from>=p_effective_from
      ) THEN
          RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='replacement release must start after the active release';
      ELSIF p_dataset_kind='gst_reporting_rules' AND EXISTS (
          SELECT 1 FROM core.reference_data_releases prior
           WHERE prior.id=prior_id
             AND (
               p_effective_from>prior.effective_from
               OR (prior.effective_to IS NULL AND p_effective_to IS NOT NULL)
               OR (prior.effective_to IS NOT NULL AND p_effective_to IS NOT NULL
                   AND p_effective_to<prior.effective_to)
             )
      ) THEN
          RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='GSTR-1 reporting replacement must preserve the complete historical effective range';
      END IF;
    END IF;
    INSERT INTO erp_regulatory_commands.command_scopes VALUES
      (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'reference_import',p_release_id);
    IF prior_id IS NOT NULL THEN
      INSERT INTO erp_regulatory_commands.command_scopes VALUES
        (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'reference_import',prior_id);
    END IF;
    INSERT INTO core.reference_data_releases(
      id,dataset_kind,ruleset_version,source_authority,source_uri,source_storage_bucket,
      source_storage_object_path,source_media_type,source_document_sha256,dataset_storage_bucket,
      dataset_storage_object_path,dataset_media_type,dataset_sha256,record_count,publication_date,
      effective_from,effective_to,supersedes_release_id,reviewed_by_user_id,reviewed_at,status)
    VALUES(p_release_id,p_dataset_kind,p_ruleset_version,p_source_authority,p_source_uri,
      p_source_storage_bucket,p_source_storage_object_path,p_source_media_type,p_source_sha256,
      p_dataset_storage_bucket,p_dataset_storage_object_path,'application/json',p_dataset_sha256,
      row_count,p_publication_date,p_effective_from,p_effective_to,prior_id,p_reviewed_by_user_id,
      p_reviewed_at,'staged');
    RETURN prior_id;
END
$function$;

ALTER FUNCTION erp_regulatory_commands.stage_release(
  uuid,text,varchar,text,text,text,text,varchar,bytea,bytea,text,text,bytea,bytea,date,date,date,uuid,timestamptz
) OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_regulatory_commands.stage_release(
  uuid,text,varchar,text,text,text,text,varchar,bytea,bytea,text,text,bytea,bytea,date,date,date,uuid,timestamptz
) FROM PUBLIC, erp_app, erp_runtime, erp_regulatory_importer;

CREATE FUNCTION erp_regulatory_commands.guard_gstr1_reporting_rule_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='deployed GSTR-1 reporting rules are retained';
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'active'
       OR NOT erp_regulatory_commands.scope_active('reference_import',NEW.release_id) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='GSTR-1 reporting rule requires verified exact-set import provenance';
    END IF;
    RETURN NEW;
  END IF;
  IF ROW(NEW.id,NEW.release_id,NEW.rule_code,NEW.rule_version,
         NEW.b2cl_threshold_amount,NEW.effective_from,NEW.effective_to,
         NEW.activated_by_user_id,NEW.activated_at,NEW.activation_request_id,NEW.created_at)
     IS DISTINCT FROM
     ROW(OLD.id,OLD.release_id,OLD.rule_code,OLD.rule_version,
         OLD.b2cl_threshold_amount,OLD.effective_from,OLD.effective_to,
         OLD.activated_by_user_id,OLD.activated_at,OLD.activation_request_id,OLD.created_at)
     OR OLD.status<>'active' OR NEW.status<>'retired'
     OR NOT erp_regulatory_commands.scope_active('reference_import',OLD.release_id) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='GSTR-1 reporting rule identity and attestation are immutable';
  END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION erp_regulatory_commands.guard_gstr1_reporting_rule_version()
  FROM PUBLIC, erp_app, erp_runtime, erp_regulatory_importer;

CREATE TRIGGER gstr1_reporting_rule_versions_release_guard
BEFORE INSERT OR UPDATE OR DELETE ON tax.gstr1_reporting_rule_versions
FOR EACH ROW EXECUTE FUNCTION erp_regulatory_commands.guard_gstr1_reporting_rule_version();

CREATE FUNCTION erp_regulatory_commands.import_gstr1_reporting_release(
  p_release_id uuid, p_ruleset_version varchar,
  p_source_authority text, p_source_uri text,
  p_source_storage_bucket text, p_source_storage_object_path text,
  p_source_media_type varchar, p_source_bytes bytea, p_source_sha256 bytea,
  p_dataset_storage_bucket text, p_dataset_storage_object_path text,
  p_dataset_bytes bytea, p_dataset_sha256 bytea,
  p_publication_date date, p_effective_from date, p_effective_to date,
  p_reviewed_by_user_id uuid, p_reviewed_at timestamptz,
  p_activated_by_user_id uuid, p_activated_at timestamptz,
  p_request_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE
  prior_id uuid; item jsonb; supplied_count integer; dataset_rows jsonb;
  existing_release core.reference_data_releases%ROWTYPE; matching_count integer;
  source_hash bytea; dataset_hash bytea;
BEGIN
  IF SESSION_USER<>'erp_regulatory_importer' THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='GSTR-1 reporting import requires the isolated regulatory importer principal';
  END IF;
  IF p_request_id IS NULL OR p_release_id IS NULL
     OR p_source_bytes IS NULL OR p_source_sha256 IS NULL
     OR p_dataset_bytes IS NULL OR p_dataset_sha256 IS NULL
     OR p_effective_from IS NULL OR p_publication_date IS NULL
     OR p_reviewed_at IS NULL
     OR p_activated_by_user_id IS NULL OR p_reviewed_by_user_id IS NULL
     OR p_activated_by_user_id=p_reviewed_by_user_id
     OR p_activated_at IS NULL OR p_activated_at>pg_catalog.transaction_timestamp()
     OR p_activated_at<p_reviewed_at THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='GSTR-1 reporting import requires distinct reviewed activation attestation';
  END IF;
  PERFORM 1 FROM core.users WHERE id=p_activated_by_user_id AND status='active' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='GSTR-1 reporting activator must be a distinct active typed user';
  END IF;
  PERFORM 1 FROM core.users WHERE id=p_reviewed_by_user_id AND status='active' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='GSTR-1 reporting reviewer must be an active typed user';
  END IF;
  BEGIN
    dataset_rows:=pg_catalog.convert_from(p_dataset_bytes,'UTF8')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='GSTR-1 reporting dataset is not UTF-8 JSON';
  END;
  IF pg_catalog.jsonb_typeof(dataset_rows)<>'array'
     OR p_dataset_bytes IS DISTINCT FROM pg_catalog.convert_to(dataset_rows::text,'UTF8') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='GSTR-1 reporting dataset must use canonical PostgreSQL JSONB bytes';
  END IF;
  supplied_count:=pg_catalog.jsonb_array_length(dataset_rows);
  IF supplied_count NOT BETWEEN 1 AND 1000
     OR EXISTS (
       SELECT 1 FROM pg_catalog.jsonb_array_elements(dataset_rows) row(value)
        WHERE pg_catalog.jsonb_typeof(value)<>'object'
           OR NOT value ?& ARRAY['id','rule_code','rule_version','b2cl_threshold_amount','effective_from','effective_to']
           OR value-ARRAY['id','rule_code','rule_version','b2cl_threshold_amount','effective_from','effective_to']<>'{}'::jsonb
           OR value->>'id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
           OR pg_catalog.btrim(value->>'rule_code')<>'b2cl_invoice_value_threshold'
           OR pg_catalog.btrim(value->>'rule_version')=''
           OR value->>'b2cl_threshold_amount' !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$'
           OR (value->>'b2cl_threshold_amount')::numeric<=0
           OR value->>'effective_from' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
           OR (value->>'effective_from')::date<p_effective_from
           OR (NULLIF(value->>'effective_to',''))::date<(value->>'effective_from')::date
           OR (p_effective_to IS NOT NULL AND COALESCE(NULLIF(value->>'effective_to','')::date,p_effective_to)>p_effective_to)
     )
     OR (SELECT count(DISTINCT value->>'id') FROM pg_catalog.jsonb_array_elements(dataset_rows))<>supplied_count
     OR (SELECT count(DISTINCT value->>'rule_version') FROM pg_catalog.jsonb_array_elements(dataset_rows))<>supplied_count
     OR EXISTS (
       SELECT 1
         FROM pg_catalog.jsonb_array_elements(dataset_rows) WITH ORDINALITY left_row(value,ordinality)
         JOIN pg_catalog.jsonb_array_elements(dataset_rows) WITH ORDINALITY right_row(value,ordinality)
           ON left_row.ordinality<right_row.ordinality
        WHERE daterange(
                (left_row.value->>'effective_from')::date,
                COALESCE(NULLIF(left_row.value->>'effective_to','')::date,'infinity'::date),'[]'
              ) && daterange(
                (right_row.value->>'effective_from')::date,
                COALESCE(NULLIF(right_row.value->>'effective_to','')::date,'infinity'::date),'[]'
              )
     )
     OR (SELECT min((value->>'effective_from')::date) FROM pg_catalog.jsonb_array_elements(dataset_rows))<>p_effective_from
     OR EXISTS (
       SELECT 1 FROM (
         SELECT (value->>'effective_from')::date AS effective_from,
                NULLIF(value->>'effective_to','')::date AS effective_to,
                lead((value->>'effective_from')::date) OVER (ORDER BY (value->>'effective_from')::date) AS next_from
           FROM pg_catalog.jsonb_array_elements(dataset_rows)
       ) ranges
       WHERE ranges.next_from IS NOT NULL
         AND (ranges.effective_to IS NULL OR ranges.next_from<>ranges.effective_to+1)
     )
     OR (
       p_effective_to IS NULL AND
       (SELECT count(*) FROM pg_catalog.jsonb_array_elements(dataset_rows) WHERE value->>'effective_to'='')<>1
     )
     OR (
       p_effective_to IS NOT NULL AND
       (SELECT max(NULLIF(value->>'effective_to','')::date) FROM pg_catalog.jsonb_array_elements(dataset_rows))<>p_effective_to
     ) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='GSTR-1 reporting dataset is not one complete non-overlapping exact rule set';
  END IF;

  source_hash:=extensions.digest(p_source_bytes,'sha256');
  dataset_hash:=extensions.digest(p_dataset_bytes,'sha256');
  IF source_hash IS DISTINCT FROM p_source_sha256
     OR dataset_hash IS DISTINCT FROM p_dataset_sha256 THEN
    RAISE EXCEPTION USING ERRCODE='22000', MESSAGE='GSTR-1 reporting source or dataset SHA-256 mismatch';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('gst_reporting_rules',20260820)
  );
  IF EXISTS (
    SELECT 1 FROM tax.gstr1_reporting_rule_versions
     WHERE activation_request_id=p_request_id AND release_id<>p_release_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='GSTR-1 reporting activation request id was already used for another release';
  END IF;
  SELECT * INTO existing_release FROM core.reference_data_releases WHERE id=p_release_id FOR SHARE;
  IF FOUND THEN
    SELECT count(*) INTO matching_count
      FROM tax.gstr1_reporting_rule_versions rule
      JOIN pg_catalog.jsonb_array_elements(dataset_rows) item(value)
        ON rule.id=(item.value->>'id')::uuid
       AND rule.rule_code=item.value->>'rule_code'
       AND rule.rule_version=item.value->>'rule_version'
       AND rule.b2cl_threshold_amount=(item.value->>'b2cl_threshold_amount')::numeric
       AND rule.effective_from=(item.value->>'effective_from')::date
       AND rule.effective_to IS NOT DISTINCT FROM NULLIF(item.value->>'effective_to','')::date
     WHERE rule.release_id=p_release_id AND rule.status='active'
       AND rule.activated_by_user_id=p_activated_by_user_id
       AND rule.activated_at=p_activated_at
       AND rule.activation_request_id=p_request_id;
    IF existing_release.dataset_kind='gst_reporting_rules'
       AND existing_release.ruleset_version=p_ruleset_version
       AND existing_release.source_authority=p_source_authority
       AND existing_release.source_uri=p_source_uri
       AND existing_release.source_storage_bucket=p_source_storage_bucket
       AND existing_release.source_storage_object_path=p_source_storage_object_path
       AND existing_release.source_media_type=p_source_media_type
       AND existing_release.source_document_sha256=source_hash
       AND existing_release.dataset_storage_bucket=p_dataset_storage_bucket
       AND existing_release.dataset_storage_object_path=p_dataset_storage_object_path
       AND existing_release.dataset_sha256=dataset_hash
       AND existing_release.record_count=supplied_count
       AND existing_release.publication_date=p_publication_date
       AND existing_release.effective_from=p_effective_from
       AND existing_release.effective_to IS NOT DISTINCT FROM p_effective_to
       AND existing_release.reviewed_by_user_id=p_reviewed_by_user_id
       AND existing_release.reviewed_at=p_reviewed_at
       AND existing_release.status='active'
       AND matching_count=supplied_count
       AND (SELECT count(*) FROM tax.gstr1_reporting_rule_versions
             WHERE release_id=p_release_id AND status='active')=supplied_count THEN
      RETURN p_release_id;
    END IF;
    RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='GSTR-1 reporting release idempotency key has different exact input';
  END IF;

  PERFORM pg_catalog.set_config('app.request_id',p_request_id::text,true);
  prior_id:=erp_regulatory_commands.stage_release(
    p_release_id,'gst_reporting_rules',p_ruleset_version,
    p_source_authority,p_source_uri,p_source_storage_bucket,p_source_storage_object_path,
    p_source_media_type,p_source_bytes,p_source_sha256,p_dataset_storage_bucket,
    p_dataset_storage_object_path,p_dataset_bytes,p_dataset_sha256,p_publication_date,
    p_effective_from,p_effective_to,p_reviewed_by_user_id,p_reviewed_at
  );
  IF prior_id IS NOT NULL THEN
    UPDATE tax.gstr1_reporting_rule_versions SET status='retired'
     WHERE release_id=prior_id AND status='active';
  END IF;
  FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(dataset_rows)
               ORDER BY (value->>'effective_from')::date,(value->>'id')::uuid LOOP
    INSERT INTO tax.gstr1_reporting_rule_versions(
      id,release_id,rule_code,rule_version,b2cl_threshold_amount,
      effective_from,effective_to,status,activated_by_user_id,activated_at,
      activation_request_id
    ) VALUES (
      (item->>'id')::uuid,p_release_id,item->>'rule_code',item->>'rule_version',
      (item->>'b2cl_threshold_amount')::numeric,(item->>'effective_from')::date,
      NULLIF(item->>'effective_to','')::date,'active',p_activated_by_user_id,
      p_activated_at,p_request_id
    );
  END LOOP;
  IF (SELECT count(*) FROM tax.gstr1_reporting_rule_versions
       WHERE release_id=p_release_id AND status='active')<>supplied_count THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='GSTR-1 reporting exact-set count mismatch';
  END IF;
  PERFORM erp_regulatory_commands.finish_release(p_release_id,prior_id);
  RETURN p_release_id;
END
$function$;

ALTER FUNCTION erp_regulatory_commands.import_gstr1_reporting_release(
  uuid,varchar,text,text,text,text,varchar,bytea,bytea,text,text,bytea,bytea,
  date,date,date,uuid,timestamptz,uuid,timestamptz,uuid
) OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_regulatory_commands.import_gstr1_reporting_release(
  uuid,varchar,text,text,text,text,varchar,bytea,bytea,text,text,bytea,bytea,
  date,date,date,uuid,timestamptz,uuid,timestamptz,uuid
) FROM PUBLIC, erp_app, erp_runtime;
GRANT EXECUTE ON FUNCTION erp_regulatory_commands.import_gstr1_reporting_release(
  uuid,varchar,text,text,text,text,varchar,bytea,bytea,text,text,bytea,bytea,
  date,date,date,uuid,timestamptz,uuid,timestamptz,uuid
) TO erp_regulatory_importer;

COMMENT ON FUNCTION erp_regulatory_commands.import_gstr1_reporting_release(
  uuid,varchar,text,text,text,text,varchar,bytea,bytea,text,text,bytea,bytea,
  date,date,date,uuid,timestamptz,uuid,timestamptz,uuid
) IS 'Governed, hash-attested, independently reviewed and activated exact-set import for global GSTR-1 reporting rules.';

RESET ROLE;
