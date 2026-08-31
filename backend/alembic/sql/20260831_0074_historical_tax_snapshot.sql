SET LOCAL ROLE erp_migration_owner;

-- The baseline invariant referenced a retired draft column name.  Correct the
-- immutable comparison before exercising the already-supported active to
-- retired release transition.
CREATE OR REPLACE FUNCTION erp_finance_invariants.guard_tax_code_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=''
AS $function$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='deployed tax code versions are retained';
  END IF;
  IF ROW(
       NEW.code,NEW.code_kind,NEW.version_number,NEW.description,
       NEW.effective_from,NEW.effective_to,NEW.taxability,
       NEW.default_supply_type,NEW.cgst_rate,NEW.sgst_rate,NEW.igst_rate,
       NEW.cess_rate,NEW.ruleset_version,NEW.created_at
     ) IS DISTINCT FROM ROW(
       OLD.code,OLD.code_kind,OLD.version_number,OLD.description,
       OLD.effective_from,OLD.effective_to,OLD.taxability,
       OLD.default_supply_type,OLD.cgst_rate,OLD.sgst_rate,OLD.igst_rate,
       OLD.cess_rate,OLD.ruleset_version,OLD.created_at
     ) OR OLD.status='retired' OR NEW.status NOT IN ('active','retired') THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='deployed tax code version is immutable except active-to-retired transition';
  END IF;
  RETURN NEW;
END
$function$;

-- Historical product facts can carry the exact tax treatment used by the
-- source ERP without pretending that the source artifact was published by a
-- statutory authority.  The snapshot remains a reviewed HSN/SAC tax dataset,
-- but its provenance is explicit and every promoted product keeps the
-- setup_review_required marker introduced by revision 0073.
ALTER TABLE core.reference_data_releases
  DROP CONSTRAINT reference_data_releases_authority_ck;
ALTER TABLE core.reference_data_releases
  ADD CONSTRAINT reference_data_releases_authority_ck CHECK (
    (dataset_kind='ingredient_classification' AND source_authority='cdsco')
    OR (dataset_kind='hsn_sac_tax' AND source_authority IN (
      'gst_portal','gst_council','cbic','gstn','legacy_erp_migration'
    ))
    OR (dataset_kind='withholding_rules'
        AND source_authority IN ('income_tax_department','cbic'))
    OR (dataset_kind='controlled_movement_rules'
        AND source_authority IN ('cdsco','revenue_department'))
    OR (dataset_kind IN (
          'einvoice_rules','gst_adjustment_rules','gst_reporting_rules',
          'gst_itc_reversal_rules'
        )
        AND source_authority IN ('gst_portal','gst_council','cbic','gstn'))
  );

CREATE FUNCTION erp_automation_commands.install_historical_tax_snapshot(
  organization_id uuid,
  reviewed_dataset_id varchar
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
#variable_conflict use_variable
DECLARE actor_id uuid; reviewer_user_id uuid;
  prior_release core.reference_data_releases%ROWTYPE;
  release_identifier uuid:=pg_catalog.gen_random_uuid();
  effective_date date; product_count integer; source_code_count integer;
  tax_rows jsonb; source_hash bytea; dataset_hash bytea; ruleset text;
  item jsonb; replayed_release uuid;
BEGIN
  actor_id:=erp_core_commands.assert_context(
    organization_id,'core.organization.manage',NULL::uuid
  );
  SELECT membership.user_id INTO STRICT reviewer_user_id
    FROM core.memberships membership
   WHERE membership.org_id=organization_id AND membership.id=actor_id
     AND membership.status='active' AND membership.revoked_at IS NULL;
  IF NULLIF(pg_catalog.btrim(reviewed_dataset_id),'') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='historical tax snapshot requires a reviewed dataset';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'historical-tax-snapshot:'||reviewed_dataset_id,740074
  ));

  SELECT min(fact.event_date),count(*),count(DISTINCT fact.payload->>'hsn_code')
    INTO effective_date,product_count,source_code_count
    FROM automation.historical_migration_facts fact
   WHERE fact.org_id=organization_id AND fact.dataset_id=reviewed_dataset_id
     AND fact.source_kind='product' AND fact.selection_state='reviewed';
  IF product_count=0 OR effective_date IS NULL OR source_code_count=0 THEN
    RAISE EXCEPTION USING ERRCODE='P0002',
      MESSAGE='reviewed historical products are unavailable for tax snapshot';
  END IF;
  IF EXISTS (
    SELECT 1 FROM automation.historical_migration_facts fact
     WHERE fact.org_id=organization_id AND fact.dataset_id=reviewed_dataset_id
       AND fact.source_kind='product' AND fact.selection_state='reviewed'
       AND (
         fact.event_date IS DISTINCT FROM effective_date
         OR fact.payload->>'hsn_code' !~ '^[0-9]{4,8}$'
         OR COALESCE(fact.payload->>'gst_rate','') !~ '^[0-9]+([.][0-9]{1,6})?$'
         OR (fact.payload->>'gst_rate')::numeric NOT BETWEEN 0 AND 100
         OR COALESCE((fact.payload->>'hsn_gst_candidate_unique')::boolean,false)
            IS DISTINCT FROM true
       )
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='reviewed historical tax candidates are incomplete';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM automation.historical_migration_facts fact
     WHERE fact.org_id=organization_id AND fact.dataset_id=reviewed_dataset_id
       AND fact.source_kind='product' AND fact.selection_state='reviewed'
     GROUP BY fact.payload->>'hsn_code'
    HAVING count(DISTINCT (fact.payload->>'gst_rate')::numeric)<>1
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='reviewed historical HSN has conflicting GST rates';
  END IF;

  SELECT release.* INTO prior_release
    FROM core.reference_data_releases release
   WHERE release.dataset_kind='hsn_sac_tax' AND release.status='active'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002',
      MESSAGE='active canonical tax release is unavailable';
  END IF;
  SELECT release.id INTO replayed_release
    FROM core.reference_data_releases release
   WHERE release.dataset_kind='hsn_sac_tax'
     AND release.source_authority='legacy_erp_migration'
     AND release.source_uri='urn:aasopharma:legacy-erp-migration:'
       ||organization_id::text||':'||reviewed_dataset_id
     AND release.status='active';
  IF replayed_release IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'release_id',replayed_release,'products',product_count,
      'source_hsn_codes',source_code_count,'replayed',true
    );
  END IF;

  IF EXISTS (
    WITH historical AS (
      SELECT fact.payload->>'hsn_code' AS code,
             min((fact.payload->>'gst_rate')::numeric) AS gst_rate
        FROM automation.historical_migration_facts fact
       WHERE fact.org_id=organization_id AND fact.dataset_id=reviewed_dataset_id
         AND fact.source_kind='product' AND fact.selection_state='reviewed'
       GROUP BY fact.payload->>'hsn_code'
    )
    SELECT 1 FROM historical
    JOIN tax.tax_code_versions current_version
      ON current_version.release_id=prior_release.id
     AND current_version.code=historical.code
     AND current_version.code_kind='hsn' AND current_version.status='active'
   WHERE current_version.igst_rate<>historical.gst_rate
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='historical GST treatment conflicts with the active canonical release';
  END IF;

  WITH historical AS (
    SELECT fact.payload->>'hsn_code' AS code,
           min((fact.payload->>'gst_rate')::numeric) AS gst_rate
      FROM automation.historical_migration_facts fact
     WHERE fact.org_id=organization_id AND fact.dataset_id=reviewed_dataset_id
       AND fact.source_kind='product' AND fact.selection_state='reviewed'
     GROUP BY fact.payload->>'hsn_code'
  ), candidates AS (
    SELECT historical.code,'hsn'::text AS code_kind,
           'Legacy ERP migration HSN '||historical.code||' (setup review required)'
             AS description,
           CASE WHEN historical.gst_rate=0 THEN 'nil_rated' ELSE 'taxable' END
             AS taxability,
           'goods'::text AS supply_type,
           historical.gst_rate/2 AS cgst_rate,
           historical.gst_rate/2 AS sgst_rate,
           historical.gst_rate AS igst_rate,0::numeric AS cess_rate
      FROM historical
    UNION ALL
    SELECT current_version.code,current_version.code_kind,current_version.description,
           current_version.taxability,current_version.default_supply_type,
           current_version.cgst_rate,current_version.sgst_rate,current_version.igst_rate,
           current_version.cess_rate
      FROM tax.tax_code_versions current_version
     WHERE current_version.release_id=prior_release.id
       AND current_version.status='active'
       AND NOT EXISTS (
         SELECT 1 FROM historical WHERE historical.code=current_version.code
       )
  )
  SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'id',pg_catalog.gen_random_uuid(),
           'code',candidate.code,'code_kind',candidate.code_kind,
           'version_number',(SELECT COALESCE(max(prior.version_number),0)+1
             FROM tax.tax_code_versions prior WHERE prior.code=candidate.code),
           'description',candidate.description,
           'taxability',candidate.taxability,
           'default_supply_type',candidate.supply_type,
           'cgst_rate',candidate.cgst_rate,'sgst_rate',candidate.sgst_rate,
           'igst_rate',candidate.igst_rate,'cess_rate',candidate.cess_rate
         ) ORDER BY candidate.code,candidate.code_kind)
    INTO tax_rows FROM candidates candidate;
  IF pg_catalog.jsonb_array_length(tax_rows)<source_code_count THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='historical tax snapshot lost reviewed HSN codes';
  END IF;

  SELECT extensions.digest(pg_catalog.convert_to(pg_catalog.string_agg(
           pg_catalog.encode(fact.row_sha256,'hex'),'|' ORDER BY fact.id
         ),'UTF8'),'sha256')
    INTO source_hash
    FROM automation.historical_migration_facts fact
   WHERE fact.org_id=organization_id AND fact.dataset_id=reviewed_dataset_id
     AND fact.source_kind='product' AND fact.selection_state='reviewed';
  dataset_hash:=extensions.digest(pg_catalog.convert_to(tax_rows::text,'UTF8'),'sha256');
  ruleset:='legacy-migration-'||pg_catalog.substr(
    pg_catalog.encode(dataset_hash,'hex'),1,24
  );

  INSERT INTO erp_regulatory_commands.command_scopes VALUES
    (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'reference_import',release_identifier),
    (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'reference_import',prior_release.id);
  INSERT INTO core.reference_data_releases(
    id,dataset_kind,ruleset_version,source_authority,source_uri,
    source_storage_bucket,source_storage_object_path,source_media_type,
    source_document_sha256,dataset_storage_bucket,dataset_storage_object_path,
    dataset_media_type,dataset_sha256,record_count,publication_date,effective_from,
    supersedes_release_id,reviewed_by_user_id,reviewed_at,status
  ) VALUES (
    release_identifier,'hsn_sac_tax',ruleset,'legacy_erp_migration',
    'urn:aasopharma:legacy-erp-migration:'||organization_id::text||':'||reviewed_dataset_id,
    'database-bound-review','historical/'||organization_id::text||'/'
      ||reviewed_dataset_id||'/source-facts','application/json',source_hash,
    'database-bound-review','historical/'||organization_id::text||'/'
      ||reviewed_dataset_id||'/tax-snapshot.json','application/json',dataset_hash,
    pg_catalog.jsonb_array_length(tax_rows),effective_date,effective_date,
    prior_release.id,reviewer_user_id,pg_catalog.transaction_timestamp(),'staged'
  );
  UPDATE tax.tax_code_versions SET status='retired'
   WHERE release_id=prior_release.id AND status='active';
  FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(tax_rows) ORDER BY value->>'code' LOOP
    INSERT INTO tax.tax_code_versions(
      id,release_id,code,code_kind,version_number,description,effective_from,
      taxability,default_supply_type,cgst_rate,sgst_rate,igst_rate,cess_rate,
      ruleset_version,status
    ) VALUES (
      (item->>'id')::uuid,release_identifier,item->>'code',item->>'code_kind',
      (item->>'version_number')::integer,item->>'description',effective_date,
      item->>'taxability',item->>'default_supply_type',
      (item->>'cgst_rate')::numeric,(item->>'sgst_rate')::numeric,
      (item->>'igst_rate')::numeric,(item->>'cess_rate')::numeric,
      ruleset,'active'
    );
  END LOOP;
  UPDATE core.reference_data_releases SET status='superseded'
   WHERE id=prior_release.id AND status='active';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='40001',
      MESSAGE='active tax release changed during historical snapshot';
  END IF;
  UPDATE core.reference_data_releases SET status='active'
   WHERE id=release_identifier AND status='staged';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='40001',
      MESSAGE='historical tax snapshot changed during activation';
  END IF;
  DELETE FROM erp_regulatory_commands.command_scopes scope
   WHERE scope.backend_pid=pg_catalog.pg_backend_pid()
     AND scope.transaction_id=pg_catalog.txid_current()
     AND scope.scope='reference_import'
     AND scope.target_id IN (release_identifier,prior_release.id);
  RETURN pg_catalog.jsonb_build_object(
    'release_id',release_identifier,'products',product_count,
    'source_hsn_codes',source_code_count,
    'snapshot_codes',pg_catalog.jsonb_array_length(tax_rows),'replayed',false
  );
END
$function$;

ALTER FUNCTION erp_automation_commands.install_historical_tax_snapshot(uuid,varchar)
  OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION
  erp_automation_commands.install_historical_tax_snapshot(uuid,varchar)
  FROM PUBLIC,erp_app,erp_runtime,erp_regulatory_importer;

RESET ROLE;
