-- Tenant/product source snapshots retain imported treatment without replacing
-- shared statutory releases. Source facts remain the immutable evidence owner.
ALTER TABLE core.reference_data_releases
  ADD COLUMN org_id uuid REFERENCES core.organizations(id),
  ADD COLUMN source_dataset_id varchar(128);
ALTER TABLE core.reference_data_releases DROP CONSTRAINT reference_data_releases_status_ck;
ALTER TABLE core.reference_data_releases ADD CONSTRAINT reference_data_releases_status_ck
  CHECK (status IN ('staged','active','superseded','source_snapshot'));
ALTER TABLE core.reference_data_releases ADD CONSTRAINT reference_data_releases_source_scope_ck
  CHECK ((org_id IS NULL AND source_dataset_id IS NULL AND status<>'source_snapshot')
    OR (org_id IS NOT NULL AND source_dataset_id IS NOT NULL
      AND dataset_kind='hsn_sac_tax' AND source_authority='legacy_erp_migration'
      AND status IN ('staged','source_snapshot') AND supersedes_release_id IS NULL));
CREATE UNIQUE INDEX reference_data_releases_source_dataset_uq
  ON core.reference_data_releases(org_id,source_dataset_id) WHERE org_id IS NOT NULL;

ALTER TABLE tax.tax_code_versions ADD COLUMN org_id uuid,
  ADD COLUMN product_id uuid, ADD COLUMN source_fact_id uuid;
ALTER TABLE tax.tax_code_versions DROP CONSTRAINT tax_code_versions_code_version_uq;
CREATE UNIQUE INDEX tax_code_versions_code_version_uq ON tax.tax_code_versions(code,version_number)
  WHERE org_id IS NULL;
ALTER TABLE tax.tax_code_versions ADD CONSTRAINT tax_code_versions_source_product_fk
  FOREIGN KEY(org_id,product_id) REFERENCES catalog.products(org_id,id);
ALTER TABLE tax.tax_code_versions ADD CONSTRAINT tax_code_versions_source_fact_fk
  FOREIGN KEY(org_id,source_fact_id) REFERENCES automation.historical_migration_facts(org_id,id);
ALTER TABLE tax.tax_code_versions DROP CONSTRAINT tax_code_versions_status_ck;
ALTER TABLE tax.tax_code_versions ADD CONSTRAINT tax_code_versions_status_ck
  CHECK (status IN ('active','retired','source_snapshot'));
ALTER TABLE tax.tax_code_versions ADD CONSTRAINT tax_code_versions_source_scope_ck
  CHECK ((org_id IS NULL AND product_id IS NULL AND source_fact_id IS NULL AND status<>'source_snapshot')
    OR (org_id IS NOT NULL AND product_id IS NOT NULL AND source_fact_id IS NOT NULL
      AND status='source_snapshot' AND code_kind='hsn' AND default_supply_type='goods'));
CREATE UNIQUE INDEX tax_code_versions_source_product_uq
  ON tax.tax_code_versions(org_id,product_id) WHERE org_id IS NOT NULL;
CREATE UNIQUE INDEX tax_code_versions_source_fact_uq
  ON tax.tax_code_versions(org_id,source_fact_id) WHERE org_id IS NOT NULL;

ALTER POLICY erp_select ON core.reference_data_releases USING
  (org_id IS NULL OR (org_id=erp_security.current_org_id() AND erp_security.current_actor_is_active()));
ALTER POLICY erp_select ON tax.tax_code_versions USING
  (org_id IS NULL OR (org_id=erp_security.current_org_id() AND erp_security.current_actor_is_active()));
ALTER TABLE core.reference_data_releases FORCE ROW LEVEL SECURITY;
ALTER TABLE tax.tax_code_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY source_release_owner ON core.reference_data_releases FOR ALL TO erp_migration_owner
  USING (org_id IS NULL OR (org_id=erp_security.current_org_id() AND erp_security.current_actor_is_active()))
  WITH CHECK (org_id IS NULL OR (org_id=erp_security.current_org_id() AND erp_security.current_actor_is_active()));
CREATE POLICY source_tax_owner ON tax.tax_code_versions FOR ALL TO erp_migration_owner
  USING (org_id IS NULL OR (org_id=erp_security.current_org_id() AND erp_security.current_actor_is_active()))
  WITH CHECK (org_id IS NULL OR (org_id=erp_security.current_org_id() AND erp_security.current_actor_is_active()));


CREATE FUNCTION erp_automation_commands.guard_source_product_tax()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
DECLARE fact automation.historical_migration_facts%ROWTYPE;
  release core.reference_data_releases%ROWTYPE;
BEGIN
  IF TG_OP<>'INSERT' THEN
    IF OLD.org_id IS NOT NULL OR (TG_OP='UPDATE' AND NEW.org_id IS DISTINCT FROM OLD.org_id) THEN
      RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='source product tax snapshots are immutable';
    END IF;
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF NEW.org_id IS NULL THEN RETURN NEW; END IF;
  IF NOT erp_regulatory_commands.scope_active('source_product_tax',NEW.product_id) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='source product tax requires reviewed command provenance';
  END IF;
  SELECT * INTO STRICT fact FROM automation.historical_migration_facts
    WHERE org_id=NEW.org_id AND id=NEW.source_fact_id AND source_kind='product' AND selection_state='reviewed';
  SELECT * INTO STRICT release FROM core.reference_data_releases
    WHERE id=NEW.release_id AND org_id=NEW.org_id AND source_dataset_id=fact.dataset_id
      AND source_authority='legacy_erp_migration' AND status='source_snapshot';
  IF NEW.code IS DISTINCT FROM fact.payload->>'hsn_code'
    OR NEW.igst_rate IS DISTINCT FROM (fact.payload->>'gst_rate')::numeric
    OR NEW.effective_from IS DISTINCT FROM fact.event_date OR NEW.effective_to IS NOT NULL
    OR NEW.cgst_rate<>NEW.igst_rate/2 OR NEW.sgst_rate<>NEW.igst_rate/2 OR NEW.cess_rate<>0
    OR NEW.ruleset_version IS DISTINCT FROM release.ruleset_version
    OR NEW.taxability IS DISTINCT FROM (CASE WHEN NEW.igst_rate=0 THEN 'nil_rated' ELSE 'taxable' END)
    OR NOT EXISTS (SELECT 1 FROM catalog.products WHERE org_id=NEW.org_id AND id=NEW.product_id) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='source product tax differs from reviewed evidence';
  END IF;
  RETURN NEW;
END
$function$;
CREATE TRIGGER source_product_tax_guard BEFORE INSERT OR UPDATE OR DELETE ON tax.tax_code_versions
  FOR EACH ROW EXECUTE FUNCTION erp_automation_commands.guard_source_product_tax();

CREATE FUNCTION erp_automation_commands.install_source_product_tax(
  organization_id uuid, reviewed_dataset_id varchar, source_fact_identifier uuid, product_identifier uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
#variable_conflict use_variable
DECLARE fact automation.historical_migration_facts%ROWTYPE; release_id uuid;
  actor uuid; reviewer uuid; source_hash bytea; snapshot_ruleset text;
  source_count integer; effective_date date; result uuid; rate numeric; code text;
BEGIN
  actor:=erp_core_commands.assert_context(organization_id,'core.organization.manage',NULL::uuid);
  SELECT user_id INTO STRICT reviewer FROM core.memberships WHERE org_id=organization_id AND id=actor;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('source-tax:'||organization_id||':'||reviewed_dataset_id,0));
  SELECT * INTO STRICT fact FROM automation.historical_migration_facts
    WHERE org_id=organization_id AND id=source_fact_identifier AND dataset_id=reviewed_dataset_id
      AND source_kind='product' AND selection_state='reviewed';
  code:=fact.payload->>'hsn_code'; rate:=(fact.payload->>'gst_rate')::numeric;
  IF code !~ '^[0-9]{4,8}$' OR code IS NULL OR rate IS NULL OR rate NOT BETWEEN 0 AND 100
    OR rate<>round(rate,6) OR rate/2<>round(rate/2,6)
    OR fact.event_date IS NULL OR COALESCE((fact.payload->>'hsn_gst_candidate_unique')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='source product tax evidence is incomplete';
  END IF;
  SELECT id INTO result FROM tax.tax_code_versions
    WHERE org_id=organization_id AND product_id=product_identifier AND source_fact_id=source_fact_identifier;
  IF result IS NOT NULL THEN RETURN result; END IF;
  SELECT extensions.digest(pg_catalog.convert_to(pg_catalog.string_agg(id::text||':'||encode(row_sha256,'hex'),',' ORDER BY id),'UTF8'),'sha256'),
         count(*),min(event_date)
    INTO source_hash,source_count,effective_date FROM automation.historical_migration_facts
    WHERE org_id=organization_id AND dataset_id=reviewed_dataset_id AND source_kind='product' AND selection_state='reviewed';
  snapshot_ruleset:=pg_catalog.encode(source_hash,'hex');
  SELECT id INTO release_id FROM core.reference_data_releases
    WHERE org_id=organization_id AND source_dataset_id=reviewed_dataset_id AND status='source_snapshot';
  IF release_id IS NULL THEN
    release_id:=pg_catalog.gen_random_uuid();
    INSERT INTO erp_regulatory_commands.command_scopes VALUES
      (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'reference_import',release_id);
    INSERT INTO core.reference_data_releases(id,dataset_kind,ruleset_version,source_authority,source_uri,
      source_storage_bucket,source_storage_object_path,source_media_type,source_document_sha256,
      dataset_storage_bucket,dataset_storage_object_path,dataset_sha256,record_count,
      publication_date,effective_from,reviewed_by_user_id,reviewed_at,status,org_id,source_dataset_id)
    VALUES(release_id,'hsn_sac_tax',snapshot_ruleset,'legacy_erp_migration',
      'urn:aasopharma:source-product-tax:'||organization_id||':'||reviewed_dataset_id,
      'database-bound-review','historical/'||organization_id||'/'||reviewed_dataset_id||'/source-facts',
      'application/json',source_hash,'database-bound-review',
      'historical/'||organization_id||'/'||reviewed_dataset_id||'/source-facts',source_hash,source_count,
      effective_date,effective_date,reviewer,transaction_timestamp(),'staged',organization_id,reviewed_dataset_id);
    UPDATE core.reference_data_releases SET status='source_snapshot' WHERE id=release_id;
    DELETE FROM erp_regulatory_commands.command_scopes WHERE backend_pid=pg_backend_pid()
      AND transaction_id=txid_current() AND scope='reference_import' AND target_id=release_id;
  ELSIF NOT EXISTS (SELECT 1 FROM core.reference_data_releases WHERE id=release_id AND dataset_sha256=source_hash) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='reviewed source product set changed after tax assignment';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tax-code-version:'||code,0));
  result:=pg_catalog.gen_random_uuid();
  INSERT INTO erp_regulatory_commands.command_scopes VALUES
    (pg_backend_pid(),txid_current(),'source_product_tax',product_identifier);
  INSERT INTO tax.tax_code_versions(id,release_id,code,code_kind,version_number,description,effective_from,
    taxability,default_supply_type,cgst_rate,sgst_rate,igst_rate,cess_rate,ruleset_version,status,org_id,product_id,source_fact_id)
  SELECT result,release_id,code,'hsn',1,'Reviewed source product treatment',fact.event_date,
    CASE WHEN rate=0 THEN 'nil_rated' ELSE 'taxable' END,'goods',rate/2,rate/2,rate,0,
    snapshot_ruleset,'source_snapshot',organization_id,product_identifier,source_fact_identifier;
  DELETE FROM erp_regulatory_commands.command_scopes WHERE backend_pid=pg_backend_pid()
    AND transaction_id=txid_current() AND scope='source_product_tax' AND target_id=product_identifier;
  RETURN result;
END
$function$;

CREATE FUNCTION erp_automation_reads.resolve_product_tax(
  organization_id uuid, product_identifier uuid, document_date date
) RETURNS SETOF tax.tax_code_versions LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
#variable_conflict use_variable
DECLARE product catalog.products%ROWTYPE; version tax.tax_code_versions%ROWTYPE; matches integer;
BEGIN
  IF organization_id IS NULL OR organization_id IS DISTINCT FROM erp_security.current_org_id()
     OR NOT erp_security.current_actor_is_active() THEN
    RAISE EXCEPTION 'product tax read requires active organization context' USING ERRCODE='42501';
  END IF;
  IF document_date IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='product tax requires document date'; END IF;
  SELECT * INTO product FROM catalog.products WHERE org_id=organization_id AND id=product_identifier;
  IF NOT FOUND OR product.hsn_code IS NULL OR product.hsn_code='0000' OR product.status='draft' THEN RETURN; END IF;
  matches:=0;
  FOR version IN SELECT v.* FROM tax.tax_code_versions v
    JOIN core.reference_data_releases r ON r.id=v.release_id
    JOIN automation.historical_product_bindings b ON b.org_id=v.org_id AND b.product_id=v.product_id AND b.source_fact_id=v.source_fact_id
    WHERE product.setup_review_required AND v.org_id=organization_id AND v.product_id=product_identifier AND v.code=product.hsn_code
      AND v.status='source_snapshot' AND r.status='source_snapshot' AND r.org_id=organization_id
      AND r.source_dataset_id=b.dataset_id AND b.gst_rate=v.igst_rate AND b.hsn_code=v.code
      AND document_date BETWEEN v.effective_from AND COALESCE(v.effective_to,'infinity'::date)
      AND document_date BETWEEN r.effective_from AND COALESCE(r.effective_to,'infinity'::date)
  LOOP
    matches:=matches+1;
    IF matches>1 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='source product tax is ambiguous'; END IF;
    RETURN NEXT version;
  END LOOP;
  IF matches=1 THEN RETURN; END IF;
  -- A source assignment must not silently fall back to a different global rate.
  IF product.setup_review_required AND EXISTS(SELECT 1 FROM tax.tax_code_versions WHERE org_id=organization_id AND product_id=product_identifier) THEN RETURN; END IF;
  FOR version IN SELECT v.* FROM tax.tax_code_versions v JOIN core.reference_data_releases r ON r.id=v.release_id
    WHERE v.org_id IS NULL AND v.code=product.hsn_code AND v.code_kind='hsn' AND v.status='active'
      AND r.org_id IS NULL AND r.dataset_kind='hsn_sac_tax' AND r.status='active'
      AND document_date BETWEEN v.effective_from AND COALESCE(v.effective_to,'infinity'::date)
      AND document_date BETWEEN r.effective_from AND COALESCE(r.effective_to,'infinity'::date)
  LOOP
    matches:=matches+1;
    IF matches>1 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='product tax is ambiguous'; END IF;
    RETURN NEXT version;
  END LOOP;
END
$function$;

CREATE FUNCTION erp_automation_reads.tax_ruleset_fingerprint(lines jsonb)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
DECLARE total integer; matched integer; scoped boolean; rules integer; single_rule text; material text;
BEGIN
  IF jsonb_typeof(lines)<>'array' OR jsonb_array_length(lines)=0 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='tax fingerprint requires resolved lines'; END IF;
  SELECT count(*) INTO total FROM jsonb_array_elements(lines);
  SELECT count(*),bool_or(v.org_id IS NOT NULL),count(DISTINCT v.ruleset_version),min(v.ruleset_version),
    string_agg(DISTINCT v.id::text||':'||v.ruleset_version,',' ORDER BY v.id::text||':'||v.ruleset_version)
    INTO matched,scoped,rules,single_rule,material
    FROM jsonb_array_elements(lines) l JOIN tax.tax_code_versions v
      ON v.id=(l->>'tax_code_version_id')::uuid AND v.ruleset_version=l->>'ruleset_version'
    WHERE v.org_id IS NULL OR (v.org_id=erp_security.current_org_id() AND erp_security.current_actor_is_active());
  IF matched<>total THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='tax fingerprint references unreviewed or foreign versions'; END IF;
  IF NOT scoped AND rules=1 THEN RETURN single_rule; END IF;
  RETURN encode(extensions.digest(convert_to('aasopharma-tax-set-v1:'||material,'UTF8'),'sha256'),'hex');
END
$function$;

ALTER FUNCTION erp_automation_commands.guard_source_product_tax() OWNER TO erp_migration_owner;
ALTER FUNCTION erp_automation_commands.install_source_product_tax(uuid,varchar,uuid,uuid) OWNER TO erp_migration_owner;
ALTER FUNCTION erp_automation_reads.resolve_product_tax(uuid,uuid,date) OWNER TO erp_migration_owner;
ALTER FUNCTION erp_automation_reads.tax_ruleset_fingerprint(jsonb) OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_automation_commands.guard_source_product_tax() FROM PUBLIC,erp_app,erp_runtime;
REVOKE ALL ON FUNCTION erp_automation_commands.install_source_product_tax(uuid,varchar,uuid,uuid) FROM PUBLIC,erp_app,erp_runtime;
REVOKE ALL ON FUNCTION erp_automation_reads.resolve_product_tax(uuid,uuid,date) FROM PUBLIC;
REVOKE ALL ON FUNCTION erp_automation_reads.tax_ruleset_fingerprint(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erp_automation_reads.resolve_product_tax(uuid,uuid,date),
  erp_automation_reads.tax_ruleset_fingerprint(jsonb) TO erp_app,erp_runtime;
