SET LOCAL ROLE erp_migration_owner;

ALTER TABLE core.reference_data_releases
  DROP CONSTRAINT reference_data_releases_authority_ck;
ALTER TABLE core.reference_data_releases
  ADD CONSTRAINT reference_data_releases_authority_ck CHECK (
    (dataset_kind='ingredient_classification' AND source_authority='cdsco') OR
    (dataset_kind='hsn_sac_tax' AND source_authority IN ('gst_portal','gst_council','cbic','gstn')) OR
    (dataset_kind='withholding_rules' AND source_authority IN ('income_tax_department','cbic')) OR
    (dataset_kind='controlled_movement_rules' AND source_authority IN ('cdsco','revenue_department')) OR
    (dataset_kind IN ('einvoice_rules','gst_adjustment_rules','gst_reporting_rules','gst_itc_reversal_rules')
      AND source_authority IN ('gst_portal','gst_council','cbic','gstn'))
  );
ALTER TABLE core.reference_data_releases
  DROP CONSTRAINT reference_data_releases_kind_ck;
ALTER TABLE core.reference_data_releases
  ADD CONSTRAINT reference_data_releases_kind_ck CHECK (
    dataset_kind IN (
      'ingredient_classification','hsn_sac_tax','withholding_rules',
      'controlled_movement_rules','einvoice_rules','gst_adjustment_rules',
      'gst_reporting_rules','gst_itc_reversal_rules'
    )
  );
ALTER TABLE core.reference_data_releases
  DROP CONSTRAINT reference_data_releases_dates_ck;
ALTER TABLE core.reference_data_releases
  ADD CONSTRAINT reference_data_releases_dates_ck CHECK (
    (dataset_kind IN ('gst_reporting_rules','gst_itc_reversal_rules')
      OR publication_date<=effective_from)
    AND (effective_to IS NULL OR effective_to>=effective_from)
    AND reviewed_at<=created_at
  );

CREATE TABLE tax.itc_reversal_rule_versions (
  id uuid NOT NULL,
  release_id uuid NOT NULL,
  rule_code varchar(64) NOT NULL,
  rule_version varchar(64) NOT NULL,
  legal_section varchar(32) NOT NULL,
  event_kind varchar(64) NOT NULL,
  gstr3b_table_code varchar(16) NOT NULL,
  gstr3b_row_code varchar(16) NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  status text DEFAULT 'active' NOT NULL,
  created_at timestamptz DEFAULT transaction_timestamp() NOT NULL,
  CONSTRAINT itc_reversal_rule_versions_pkey PRIMARY KEY (id),
  CONSTRAINT itc_reversal_rule_versions_release_fk
    FOREIGN KEY (release_id) REFERENCES core.reference_data_releases(id) ON DELETE RESTRICT,
  CONSTRAINT itc_reversal_rule_versions_identity_uq UNIQUE (release_id,rule_code,rule_version),
  CONSTRAINT itc_reversal_rule_versions_dates_ck CHECK (effective_to IS NULL OR effective_to>=effective_from),
  CONSTRAINT itc_reversal_rule_versions_shape_ck CHECK (
    event_kind='goods_destroyed' AND legal_section='17(5)(h)'
    AND gstr3b_table_code='4' AND gstr3b_row_code='B(1)'
    AND btrim(rule_code)<>'' AND btrim(rule_version)<>''
  ),
  CONSTRAINT itc_reversal_rule_versions_status_ck CHECK (status IN ('active','retired'))
);
CREATE INDEX itc_reversal_rule_versions_effective_idx
  ON tax.itc_reversal_rule_versions(event_kind,effective_from,effective_to,id)
  WHERE status='active';

CREATE OR REPLACE FUNCTION erp_regulatory_commands.guard_itc_reversal_rule_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'active'
       OR NOT erp_regulatory_commands.scope_active('reference_import',NEW.release_id) THEN
      RAISE EXCEPTION USING ERRCODE='23514',
        MESSAGE='itc reversal rule requires verified exact-set import provenance';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='deployed itc reversal rule versions are retained';
  END IF;
  IF ROW(NEW.id,NEW.release_id,NEW.rule_code,NEW.rule_version,NEW.legal_section,
         NEW.event_kind,NEW.gstr3b_table_code,NEW.gstr3b_row_code,NEW.effective_from,
         NEW.effective_to,NEW.created_at)
     IS DISTINCT FROM
     ROW(OLD.id,OLD.release_id,OLD.rule_code,OLD.rule_version,OLD.legal_section,
         OLD.event_kind,OLD.gstr3b_table_code,OLD.gstr3b_row_code,OLD.effective_from,
         OLD.effective_to,OLD.created_at)
     OR OLD.status<>'active' OR NEW.status<>'retired'
     OR NOT erp_regulatory_commands.scope_active('reference_import',OLD.release_id) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='itc reversal rule authority is immutable';
  END IF;
  RETURN NEW;
END
$function$;
ALTER FUNCTION erp_regulatory_commands.guard_itc_reversal_rule_version()
  OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_regulatory_commands.guard_itc_reversal_rule_version()
  FROM PUBLIC,erp_app,erp_runtime,erp_regulatory_importer;
CREATE TRIGGER itc_reversal_rule_versions_release_guard
  BEFORE INSERT OR UPDATE OR DELETE ON tax.itc_reversal_rule_versions
  FOR EACH ROW EXECUTE FUNCTION erp_regulatory_commands.guard_itc_reversal_rule_version();

CREATE OR REPLACE FUNCTION erp_regulatory_commands.stage_itc_reversal_rule_release(
  p_release_id uuid,p_ruleset_version varchar,p_source_authority text,p_source_uri text,
  p_source_storage_bucket text,p_source_storage_object_path text,p_source_media_type varchar,
  p_source_bytes bytea,p_source_sha256 bytea,p_dataset_storage_bucket text,
  p_dataset_storage_object_path text,p_dataset_bytes bytea,p_dataset_sha256 bytea,
  p_publication_date date,p_effective_from date,p_effective_to date,
  p_reviewed_by_user_id uuid,p_reviewed_at timestamptz)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
#variable_conflict use_variable
DECLARE prior_id uuid; dataset_rows jsonb; row_count integer;
BEGIN
  IF SESSION_USER<>'erp_regulatory_importer' THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='ITC reversal rule import requires the isolated regulatory importer principal';
  END IF;
  IF p_release_id IS NULL OR pg_catalog.btrim(p_ruleset_version)=''
     OR p_source_authority<>'cbic'
     OR p_source_uri !~ '^https://([a-z0-9-]+\.)*cbic-gst\.gov\.in(/|$)'
     OR pg_catalog.btrim(p_source_storage_bucket)=''
     OR pg_catalog.btrim(p_source_storage_object_path)=''
     OR p_source_media_type<>'application/pdf'
     OR pg_catalog.btrim(p_dataset_storage_bucket)=''
     OR pg_catalog.btrim(p_dataset_storage_object_path)=''
     OR p_publication_date>p_reviewed_at::date
     OR p_reviewed_at>pg_catalog.transaction_timestamp()
     OR p_effective_from>CURRENT_DATE
     OR (p_effective_to IS NOT NULL AND p_effective_to<CURRENT_DATE)
     OR (p_effective_to IS NOT NULL AND p_effective_to<p_effective_from)
     OR pg_catalog.octet_length(p_source_bytes) NOT BETWEEN 1 AND 104857600
     OR pg_catalog.octet_length(p_dataset_bytes) NOT BETWEEN 2 AND 104857600
     OR pg_catalog.octet_length(p_source_sha256)<>32
     OR pg_catalog.octet_length(p_dataset_sha256)<>32
     OR extensions.digest(p_source_bytes,'sha256') IS DISTINCT FROM p_source_sha256
     OR extensions.digest(p_dataset_bytes,'sha256') IS DISTINCT FROM p_dataset_sha256 THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='ITC reversal source, review, effective period or dataset envelope is invalid';
  END IF;
  PERFORM 1 FROM core.users
   WHERE id=p_reviewed_by_user_id AND status='active' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='ITC reversal release reviewer must be an active typed user';
  END IF;
  BEGIN
    dataset_rows:=pg_catalog.convert_from(p_dataset_bytes,'UTF8')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='ITC reversal dataset artifact is not UTF-8 JSON';
  END;
  IF pg_catalog.jsonb_typeof(dataset_rows)<>'array'
     OR p_dataset_bytes IS DISTINCT FROM pg_catalog.convert_to(dataset_rows::text,'UTF8') THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='ITC reversal dataset must use canonical PostgreSQL JSONB bytes';
  END IF;
  row_count:=pg_catalog.jsonb_array_length(dataset_rows);
  IF row_count NOT BETWEEN 1 AND 500000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='ITC reversal dataset must contain a bounded non-empty exact set';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('gst_itc_reversal_rules',20260825));
  SELECT id INTO prior_id FROM core.reference_data_releases
   WHERE dataset_kind='gst_itc_reversal_rules' AND status='active' FOR UPDATE;
  IF prior_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM core.reference_data_releases
     WHERE id=prior_id AND effective_from>=p_effective_from
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='replacement ITC reversal release must start after the active release';
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
  VALUES(p_release_id,'gst_itc_reversal_rules',p_ruleset_version,p_source_authority,p_source_uri,
    p_source_storage_bucket,p_source_storage_object_path,p_source_media_type,p_source_sha256,
    p_dataset_storage_bucket,p_dataset_storage_object_path,'application/json',p_dataset_sha256,
    row_count,p_publication_date,p_effective_from,p_effective_to,prior_id,p_reviewed_by_user_id,
    p_reviewed_at,'staged');
  RETURN prior_id;
END
$function$;
ALTER FUNCTION erp_regulatory_commands.stage_itc_reversal_rule_release(
  uuid,varchar,text,text,text,text,varchar,bytea,bytea,text,text,bytea,bytea,
  date,date,date,uuid,timestamptz) OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_regulatory_commands.stage_itc_reversal_rule_release(
  uuid,varchar,text,text,text,text,varchar,bytea,bytea,text,text,bytea,bytea,
  date,date,date,uuid,timestamptz) FROM PUBLIC,erp_app,erp_runtime,erp_regulatory_importer;

CREATE OR REPLACE FUNCTION erp_regulatory_commands.import_itc_reversal_rule_release(
  p_release_id uuid,p_ruleset_version varchar,p_source_authority text,p_source_uri text,
  p_source_storage_bucket text,p_source_storage_object_path text,p_source_media_type varchar,
  p_source_bytes bytea,p_source_sha256 bytea,p_dataset_storage_bucket text,
  p_dataset_storage_object_path text,p_dataset_bytes bytea,p_dataset_sha256 bytea,
  p_publication_date date,p_effective_from date,p_effective_to date,
  p_reviewed_by_user_id uuid,p_reviewed_at timestamptz,p_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
#variable_conflict use_variable
DECLARE prior_id uuid; item jsonb; supplied_count integer; dataset_rows jsonb;
BEGIN
  IF p_request_id IS NULL
     OR NULLIF(pg_catalog.current_setting('app.request_id',true),'')::uuid IS DISTINCT FROM p_request_id THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='itc reversal rule import requires matching transaction-local request id';
  END IF;
  dataset_rows:=pg_catalog.convert_from(p_dataset_bytes,'UTF8')::jsonb;
  prior_id:=erp_regulatory_commands.stage_itc_reversal_rule_release(
    p_release_id,p_ruleset_version,p_source_authority,p_source_uri,
    p_source_storage_bucket,p_source_storage_object_path,p_source_media_type,p_source_bytes,
    p_source_sha256,p_dataset_storage_bucket,p_dataset_storage_object_path,p_dataset_bytes,
    p_dataset_sha256,p_publication_date,p_effective_from,p_effective_to,
    p_reviewed_by_user_id,p_reviewed_at);
  supplied_count:=pg_catalog.jsonb_array_length(dataset_rows);
  IF supplied_count<1 OR EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(dataset_rows) row(value)
     WHERE pg_catalog.jsonb_typeof(value)<>'object'
       OR NOT value ?& ARRAY['id','rule_code','rule_version','legal_section','event_kind',
          'gstr3b_table_code','gstr3b_row_code','effective_from','effective_to']
       OR value-ARRAY['id','rule_code','rule_version','legal_section','event_kind',
          'gstr3b_table_code','gstr3b_row_code','effective_from','effective_to']<>'{}'::jsonb
       OR value->>'legal_section'<>'17(5)(h)' OR value->>'event_kind'<>'goods_destroyed'
       OR value->>'gstr3b_table_code'<>'4' OR value->>'gstr3b_row_code'<>'B(1)'
       OR (value->>'effective_from')::date<p_effective_from
       OR (p_effective_to IS NOT NULL
           AND COALESCE(NULLIF(value->>'effective_to','')::date,p_effective_to)>p_effective_to)
  ) OR (SELECT count(DISTINCT value->>'id')
          FROM pg_catalog.jsonb_array_elements(dataset_rows))<>supplied_count
    OR (SELECT count(DISTINCT (value->>'rule_code',value->>'rule_version'))
          FROM pg_catalog.jsonb_array_elements(dataset_rows))<>supplied_count
    OR EXISTS (
      SELECT 1
        FROM pg_catalog.jsonb_array_elements(dataset_rows) WITH ORDINALITY left_row(value,ordinality)
        JOIN pg_catalog.jsonb_array_elements(dataset_rows) WITH ORDINALITY right_row(value,ordinality)
          ON left_row.ordinality<right_row.ordinality
       WHERE left_row.value->>'event_kind'=right_row.value->>'event_kind'
         AND (left_row.value->>'effective_from')::date<=
             COALESCE(NULLIF(right_row.value->>'effective_to','')::date,'infinity'::date)
         AND (right_row.value->>'effective_from')::date<=
             COALESCE(NULLIF(left_row.value->>'effective_to','')::date,'infinity'::date)) THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='itc reversal rule dataset is not one exact non-overlapping typed set';
  END IF;
  IF prior_id IS NOT NULL THEN
    UPDATE tax.itc_reversal_rule_versions SET status='retired'
     WHERE release_id=prior_id AND status='active';
  END IF;
  FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(dataset_rows) ORDER BY value->>'id' LOOP
    INSERT INTO tax.itc_reversal_rule_versions(
      id,release_id,rule_code,rule_version,legal_section,event_kind,gstr3b_table_code,
      gstr3b_row_code,effective_from,effective_to,status)
    VALUES((item->>'id')::uuid,p_release_id,item->>'rule_code',item->>'rule_version',
      item->>'legal_section',item->>'event_kind',item->>'gstr3b_table_code',
      item->>'gstr3b_row_code',(item->>'effective_from')::date,
      NULLIF(item->>'effective_to','')::date,'active');
  END LOOP;
  IF (SELECT count(*) FROM tax.itc_reversal_rule_versions
       WHERE release_id=p_release_id)<>supplied_count THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='itc reversal rule exact-set count mismatch';
  END IF;
  PERFORM erp_regulatory_commands.finish_release(p_release_id,prior_id);
  RETURN p_release_id;
END
$function$;
ALTER FUNCTION erp_regulatory_commands.import_itc_reversal_rule_release(
  uuid,varchar,text,text,text,text,varchar,bytea,bytea,text,text,bytea,bytea,
  date,date,date,uuid,timestamptz,uuid) OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_regulatory_commands.import_itc_reversal_rule_release(
  uuid,varchar,text,text,text,text,varchar,bytea,bytea,text,text,bytea,bytea,
  date,date,date,uuid,timestamptz,uuid) FROM PUBLIC,erp_app,erp_runtime,erp_regulatory_importer;
GRANT EXECUTE ON FUNCTION erp_regulatory_commands.import_itc_reversal_rule_release(
  uuid,varchar,text,text,text,text,varchar,bytea,bytea,text,text,bytea,bytea,
  date,date,date,uuid,timestamptz,uuid) TO erp_regulatory_importer;

CREATE TABLE tax.input_credit_lots (
  org_id uuid NOT NULL,
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  registration_id uuid NOT NULL,
  supplier_invoice_id uuid NOT NULL,
  supplier_invoice_line_id uuid NOT NULL,
  supplier_invoice_receipt_allocation_id uuid NOT NULL,
  goods_receipt_line_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  acquired_on date NOT NULL,
  acquired_base_quantity numeric(20,6) NOT NULL,
  eligible_cgst_amount numeric(20,2) DEFAULT 0 NOT NULL,
  eligible_sgst_amount numeric(20,2) DEFAULT 0 NOT NULL,
  eligible_igst_amount numeric(20,2) DEFAULT 0 NOT NULL,
  eligible_cess_amount numeric(20,2) DEFAULT 0 NOT NULL,
  remaining_base_quantity numeric(20,6) NOT NULL,
  remaining_cgst_amount numeric(20,2) DEFAULT 0 NOT NULL,
  remaining_sgst_amount numeric(20,2) DEFAULT 0 NOT NULL,
  remaining_igst_amount numeric(20,2) DEFAULT 0 NOT NULL,
  remaining_cess_amount numeric(20,2) DEFAULT 0 NOT NULL,
  lineage_status text DEFAULT 'exact' NOT NULL,
  source_hash bytea NOT NULL,
  created_at timestamptz DEFAULT transaction_timestamp() NOT NULL,
  created_by_membership_id uuid DEFAULT current_setting('app.membership_id')::uuid NOT NULL,
  updated_at timestamptz DEFAULT transaction_timestamp() NOT NULL,
  updated_by_membership_id uuid DEFAULT current_setting('app.membership_id')::uuid NOT NULL,
  row_version bigint DEFAULT 1 NOT NULL,
  CONSTRAINT input_credit_lots_pkey PRIMARY KEY (org_id,id),
  CONSTRAINT input_credit_lots_source_uq UNIQUE (org_id,supplier_invoice_receipt_allocation_id),
  CONSTRAINT input_credit_lots_registration_fk FOREIGN KEY (org_id,registration_id)
    REFERENCES tax.registrations(org_id,id) ON DELETE RESTRICT,
  CONSTRAINT input_credit_lots_invoice_fk FOREIGN KEY (org_id,supplier_invoice_id)
    REFERENCES procurement.supplier_invoices(org_id,id) ON DELETE RESTRICT,
  CONSTRAINT input_credit_lots_invoice_line_fk FOREIGN KEY (org_id,supplier_invoice_line_id)
    REFERENCES procurement.supplier_invoice_lines(org_id,id) ON DELETE RESTRICT,
  CONSTRAINT input_credit_lots_receipt_allocation_fk FOREIGN KEY (org_id,supplier_invoice_receipt_allocation_id)
    REFERENCES procurement.supplier_invoice_receipt_allocations(org_id,id) ON DELETE RESTRICT,
  CONSTRAINT input_credit_lots_receipt_line_fk FOREIGN KEY (org_id,goods_receipt_line_id)
    REFERENCES procurement.goods_receipt_lines(org_id,id) ON DELETE RESTRICT,
  CONSTRAINT input_credit_lots_batch_fk FOREIGN KEY (org_id,batch_id)
    REFERENCES inventory.batches(org_id,id) ON DELETE RESTRICT,
  CONSTRAINT input_credit_lots_quantity_ck CHECK (
    acquired_base_quantity>0 AND remaining_base_quantity>=0
    AND remaining_base_quantity<=acquired_base_quantity
  ),
  CONSTRAINT input_credit_lots_amount_ck CHECK (
    eligible_cgst_amount>=0 AND eligible_sgst_amount>=0 AND eligible_igst_amount>=0 AND eligible_cess_amount>=0
    AND remaining_cgst_amount BETWEEN 0 AND eligible_cgst_amount
    AND remaining_sgst_amount BETWEEN 0 AND eligible_sgst_amount
    AND remaining_igst_amount BETWEEN 0 AND eligible_igst_amount
    AND remaining_cess_amount BETWEEN 0 AND eligible_cess_amount
    AND eligible_cgst_amount+eligible_sgst_amount+eligible_igst_amount+eligible_cess_amount>0
  ),
  CONSTRAINT input_credit_lots_status_ck CHECK (lineage_status IN ('exact','ambiguous_return')),
  CONSTRAINT input_credit_lots_hash_ck CHECK (octet_length(source_hash)=32),
  CONSTRAINT input_credit_lots_row_version_ck CHECK (row_version>0)
);
CREATE INDEX input_credit_lots_residual_idx
  ON tax.input_credit_lots(org_id,batch_id,acquired_on,id)
  WHERE lineage_status='exact' AND remaining_base_quantity>0;

ALTER TABLE compliance.destructions
  ADD COLUMN physical_destruction_confirmed_at timestamptz,
  ADD COLUMN itc_treatment text,
  ADD COLUMN itc_reversal_evidence_attachment_id uuid,
  ADD COLUMN gst_registration_id uuid,
  ADD COLUMN gst_return_period_id uuid,
  ADD COLUMN gstr3b_return_id uuid,
  ADD COLUMN itc_reversal_rule_version_id uuid,
  ADD COLUMN itc_reversal_cgst_amount numeric(20,2) DEFAULT 0 NOT NULL,
  ADD COLUMN itc_reversal_sgst_amount numeric(20,2) DEFAULT 0 NOT NULL,
  ADD COLUMN itc_reversal_igst_amount numeric(20,2) DEFAULT 0 NOT NULL,
  ADD COLUMN itc_reversal_cess_amount numeric(20,2) DEFAULT 0 NOT NULL;

ALTER TABLE compliance.destructions
  ADD CONSTRAINT destructions_itc_treatment_ck CHECK (
    itc_treatment IS NULL OR itc_treatment='section_17_5_h_reversal'
  ),
  ADD CONSTRAINT destructions_itc_amounts_ck CHECK (
    itc_reversal_cgst_amount>=0 AND itc_reversal_sgst_amount>=0
    AND itc_reversal_igst_amount>=0 AND itc_reversal_cess_amount>=0
  ),
  ADD CONSTRAINT destructions_gst_authority_ck CHECK (
    status NOT IN ('submitted','approved','posted') OR (
      physical_destruction_confirmed_at IS NOT NULL
      AND itc_treatment='section_17_5_h_reversal'
      AND itc_reversal_evidence_attachment_id IS NOT NULL
      AND gst_registration_id IS NOT NULL AND gst_return_period_id IS NOT NULL
      AND gstr3b_return_id IS NOT NULL AND itc_reversal_rule_version_id IS NOT NULL
      AND itc_reversal_cgst_amount+itc_reversal_sgst_amount
          +itc_reversal_igst_amount+itc_reversal_cess_amount>0
    )
  ),
  ADD CONSTRAINT destructions_itc_evidence_fk
    FOREIGN KEY (org_id,itc_reversal_evidence_attachment_id)
    REFERENCES core.attachments(org_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT destructions_gst_registration_fk
    FOREIGN KEY (org_id,gst_registration_id)
    REFERENCES tax.registrations(org_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT destructions_gst_period_fk
    FOREIGN KEY (org_id,gst_return_period_id)
    REFERENCES tax.return_periods(org_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT destructions_gstr3b_return_fk
    FOREIGN KEY (org_id,gstr3b_return_id)
    REFERENCES tax.returns(org_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT destructions_itc_rule_fk
    FOREIGN KEY (itc_reversal_rule_version_id)
    REFERENCES tax.itc_reversal_rule_versions(id) ON DELETE RESTRICT;

CREATE TABLE tax.input_credit_reversal_events (
  org_id uuid NOT NULL,
  id uuid NOT NULL,
  destruction_id uuid NOT NULL,
  registration_id uuid NOT NULL,
  return_period_id uuid NOT NULL,
  gstr3b_return_id uuid NOT NULL,
  rule_version_id uuid NOT NULL,
  evidence_attachment_id uuid NOT NULL,
  journal_entry_id uuid NOT NULL,
  reversal_expense_account_id uuid NOT NULL,
  input_cgst_account_id uuid NOT NULL,
  input_sgst_account_id uuid NOT NULL,
  input_igst_account_id uuid NOT NULL,
  input_cess_account_id uuid NOT NULL,
  physical_destruction_confirmed_at timestamptz NOT NULL,
  cgst_amount numeric(20,2) DEFAULT 0 NOT NULL,
  sgst_amount numeric(20,2) DEFAULT 0 NOT NULL,
  igst_amount numeric(20,2) DEFAULT 0 NOT NULL,
  cess_amount numeric(20,2) DEFAULT 0 NOT NULL,
  status text DEFAULT 'draft' NOT NULL,
  posted_at timestamptz,
  posted_by_membership_id uuid,
  created_at timestamptz DEFAULT transaction_timestamp() NOT NULL,
  created_by_membership_id uuid DEFAULT current_setting('app.membership_id')::uuid NOT NULL,
  CONSTRAINT input_credit_reversal_events_pkey PRIMARY KEY (org_id,id),
  CONSTRAINT input_credit_reversal_events_destruction_uq UNIQUE (org_id,destruction_id),
  CONSTRAINT input_credit_reversal_events_destruction_fk FOREIGN KEY (org_id,destruction_id)
    REFERENCES compliance.destructions(org_id,id) ON DELETE RESTRICT,
  CONSTRAINT input_credit_reversal_events_registration_fk FOREIGN KEY (org_id,registration_id)
    REFERENCES tax.registrations(org_id,id) ON DELETE RESTRICT,
  CONSTRAINT input_credit_reversal_events_period_fk FOREIGN KEY (org_id,return_period_id)
    REFERENCES tax.return_periods(org_id,id) ON DELETE RESTRICT,
  CONSTRAINT input_credit_reversal_events_return_fk FOREIGN KEY (org_id,gstr3b_return_id)
    REFERENCES tax.returns(org_id,id) ON DELETE RESTRICT,
  CONSTRAINT input_credit_reversal_events_rule_fk FOREIGN KEY (rule_version_id)
    REFERENCES tax.itc_reversal_rule_versions(id) ON DELETE RESTRICT,
  CONSTRAINT input_credit_reversal_events_evidence_fk FOREIGN KEY (org_id,evidence_attachment_id)
    REFERENCES core.attachments(org_id,id) ON DELETE RESTRICT,
  CONSTRAINT input_credit_reversal_events_journal_fk FOREIGN KEY (org_id,journal_entry_id)
    REFERENCES finance.journal_entries(org_id,id) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT input_credit_reversal_events_expense_account_fk FOREIGN KEY (org_id,reversal_expense_account_id)
    REFERENCES finance.accounts(org_id,id) ON DELETE RESTRICT,
  CONSTRAINT input_credit_reversal_events_cgst_account_fk FOREIGN KEY (org_id,input_cgst_account_id)
    REFERENCES finance.accounts(org_id,id) ON DELETE RESTRICT,
  CONSTRAINT input_credit_reversal_events_sgst_account_fk FOREIGN KEY (org_id,input_sgst_account_id)
    REFERENCES finance.accounts(org_id,id) ON DELETE RESTRICT,
  CONSTRAINT input_credit_reversal_events_igst_account_fk FOREIGN KEY (org_id,input_igst_account_id)
    REFERENCES finance.accounts(org_id,id) ON DELETE RESTRICT,
  CONSTRAINT input_credit_reversal_events_cess_account_fk FOREIGN KEY (org_id,input_cess_account_id)
    REFERENCES finance.accounts(org_id,id) ON DELETE RESTRICT,
  CONSTRAINT input_credit_reversal_events_amount_ck CHECK (
    cgst_amount>=0 AND sgst_amount>=0 AND igst_amount>=0 AND cess_amount>=0
    AND cgst_amount+sgst_amount+igst_amount+cess_amount>0
  ),
  CONSTRAINT input_credit_reversal_events_status_ck CHECK (
    status IN ('draft','posted') AND (status='draft' OR (posted_at IS NOT NULL AND posted_by_membership_id IS NOT NULL))
  )
);

CREATE TABLE tax.input_credit_applications (
  org_id uuid NOT NULL,
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  input_credit_lot_id uuid NOT NULL,
  destruction_id uuid,
  reversal_event_id uuid,
  stock_ledger_entry_id uuid,
  reverses_application_id uuid,
  application_kind text NOT NULL,
  application_direction text DEFAULT 'consume' NOT NULL,
  applied_base_quantity numeric(20,6) NOT NULL,
  applied_cgst_amount numeric(20,2) DEFAULT 0 NOT NULL,
  applied_sgst_amount numeric(20,2) DEFAULT 0 NOT NULL,
  applied_igst_amount numeric(20,2) DEFAULT 0 NOT NULL,
  applied_cess_amount numeric(20,2) DEFAULT 0 NOT NULL,
  source_lot_row_version bigint NOT NULL,
  status text DEFAULT 'reserved' NOT NULL,
  posted_at timestamptz,
  created_at timestamptz DEFAULT transaction_timestamp() NOT NULL,
  created_by_membership_id uuid DEFAULT current_setting('app.membership_id')::uuid NOT NULL,
  CONSTRAINT input_credit_applications_pkey PRIMARY KEY (org_id,id),
  CONSTRAINT input_credit_applications_lot_fk FOREIGN KEY (org_id,input_credit_lot_id)
    REFERENCES tax.input_credit_lots(org_id,id) ON DELETE RESTRICT,
  CONSTRAINT input_credit_applications_destruction_fk FOREIGN KEY (org_id,destruction_id)
    REFERENCES compliance.destructions(org_id,id) ON DELETE RESTRICT,
  CONSTRAINT input_credit_applications_event_fk FOREIGN KEY (org_id,reversal_event_id)
    REFERENCES tax.input_credit_reversal_events(org_id,id) ON DELETE RESTRICT,
  CONSTRAINT input_credit_applications_ledger_fk FOREIGN KEY (org_id,stock_ledger_entry_id)
    REFERENCES inventory.stock_ledger_entries(org_id,id) ON DELETE RESTRICT,
  CONSTRAINT input_credit_applications_reversal_fk FOREIGN KEY (org_id,reverses_application_id)
    REFERENCES tax.input_credit_applications(org_id,id) ON DELETE RESTRICT,
  CONSTRAINT input_credit_applications_shape_ck CHECK (
    applied_base_quantity>0 AND applied_cgst_amount>=0 AND applied_sgst_amount>=0
    AND applied_igst_amount>=0 AND applied_cess_amount>=0
    AND source_lot_row_version>0
    AND ((application_kind='destruction_reversal' AND application_direction='consume'
          AND destruction_id IS NOT NULL AND reversal_event_id IS NOT NULL
          AND stock_ledger_entry_id IS NULL AND reverses_application_id IS NULL)
      OR (application_kind IN ('sale_consumption','purchase_return_consumption','opening_consumption')
          AND application_direction='consume' AND destruction_id IS NULL
          AND reversal_event_id IS NULL AND reverses_application_id IS NULL)
      OR (application_kind='sales_return_restoration' AND application_direction='restore'
          AND destruction_id IS NULL AND reversal_event_id IS NULL
          AND stock_ledger_entry_id IS NOT NULL AND reverses_application_id IS NOT NULL))
  ),
  CONSTRAINT input_credit_applications_direction_ck CHECK (application_direction IN ('consume','restore')),
  CONSTRAINT input_credit_applications_status_ck CHECK (
    status IN ('reserved','posted') AND (status='reserved' OR posted_at IS NOT NULL)
  )
);
CREATE UNIQUE INDEX input_credit_applications_destruction_lot_uq
  ON tax.input_credit_applications(org_id,destruction_id,input_credit_lot_id)
  WHERE destruction_id IS NOT NULL;
CREATE UNIQUE INDEX input_credit_applications_ledger_lot_uq
  ON tax.input_credit_applications(org_id,stock_ledger_entry_id,input_credit_lot_id)
  WHERE stock_ledger_entry_id IS NOT NULL AND application_direction='consume';
CREATE UNIQUE INDEX input_credit_applications_restoration_uq
  ON tax.input_credit_applications(org_id,stock_ledger_entry_id,reverses_application_id)
  WHERE application_direction='restore';

ALTER TABLE tax.itc_reversal_rule_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax.input_credit_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax.input_credit_reversal_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax.input_credit_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY erp_select ON tax.itc_reversal_rule_versions FOR SELECT TO erp_app USING (true);
CREATE POLICY erp_select ON tax.input_credit_lots FOR SELECT TO erp_app
  USING (org_id=erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY erp_select ON tax.input_credit_reversal_events FOR SELECT TO erp_app
  USING (org_id=erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY erp_select ON tax.input_credit_applications FOR SELECT TO erp_app
  USING (org_id=erp_security.current_org_id() AND erp_security.current_actor_is_active());
GRANT SELECT ON tax.itc_reversal_rule_versions,tax.input_credit_lots,
  tax.input_credit_reversal_events,tax.input_credit_applications TO erp_app;

COMMENT ON TABLE tax.input_credit_lots IS
  'Batch-bound residual eligible GST input-credit source lots created only from posted supplier-invoice and exact receipt-allocation lineage.';
COMMENT ON TABLE tax.input_credit_applications IS
  'Append-only quantity and GST-component applications from an exact input-credit lot; destruction reservations become posted atomically with stock and accounting.';
COMMENT ON TABLE tax.input_credit_reversal_events IS
  'Section 17(5)(h) destruction reversal events bound to GST registration, return period, GSTR-3B revision, reviewed rule, evidence, and physical event time.';

DO $migration$
DECLARE definition text;
  gst_rejection text:=$needle$  IF EXISTS(SELECT 1 FROM tax.registrations registration
      WHERE registration.org_id=organization_id AND registration.status='active'
        AND registration.effective_from<=destruction_date
        AND (registration.effective_to IS NULL OR registration.effective_to>=destruction_date)) THEN
    RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='GST-registered destruction requires a reviewed Section 17(5)(h) ITC reversal command';
  END IF;
$needle$;
  old_batch_guard text:=$needle$         AND status IN ('quarantined','blocked','expired') AND expires_on IS NOT NULL
$needle$;
  new_batch_guard text:=$needle$         AND (status IN ('quarantined','blocked','expired') OR (
           status='released' AND location.location_type='quarantine'
           AND EXISTS(SELECT 1 FROM inventory.stock_ledger_entries returned_ledger
             JOIN inventory.inventory_documents returned_document
               ON returned_document.org_id=returned_ledger.org_id
              AND returned_document.id=returned_ledger.inventory_document_id
            WHERE returned_ledger.org_id=organization_id
              AND returned_ledger.branch_id=branch.id
              AND returned_ledger.location_id=location.id
              AND returned_ledger.product_id=product.id
              AND returned_ledger.batch_id=(allocation->>'batch_id')::uuid
              AND returned_ledger.quantity_delta>0
              AND returned_document.document_type='sales_return_receipt'
              AND returned_document.status='posted')))
         AND expires_on IS NOT NULL
$needle$;
  old_reason_guard text:=$needle$      ELSIF request_document->>'reason_code'<>'expired' AND batch.status NOT IN ('quarantined','blocked') THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='damage or quality destruction requires blocked or quarantined stock';
$needle$;
  new_reason_guard text:=$needle$      ELSIF request_document->>'reason_code'<>'expired'
        AND batch.status NOT IN ('quarantined','blocked')
        AND NOT (batch.status='released' AND location.location_type='quarantine') THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='damage or quality destruction requires blocked stock or exact sales-return quarantine custody';
$needle$;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'erp_automation_commands.resolve_inventory_destruction_prepare(uuid,uuid,uuid,uuid,uuid,character varying,uuid,uuid,jsonb)'::pg_catalog.regprocedure)
    INTO STRICT definition;
  IF pg_catalog.strpos(definition,
      'request_document->>''itc_treatment''<>''not_applicable_unregistered''')=0
     OR pg_catalog.strpos(definition,gst_rejection)=0
     OR pg_catalog.strpos(definition,
       '''gst_scope'',''organization_has_no_active_gst_registration'',''itc_treatment'',''not_applicable_unregistered''')=0 THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='GST destruction migration requires the exact reviewed unregistered resolver';
  END IF;
  definition:=pg_catalog.replace(definition,
    'request_document->>''itc_treatment''<>''not_applicable_unregistered''',
    'request_document->>''itc_treatment''<>''section_17_5_h_reversal''');
  definition:=pg_catalog.replace(definition,gst_rejection,'');
  definition:=pg_catalog.replace(definition,
    '''gst_scope'',''organization_has_no_active_gst_registration'',''itc_treatment'',''not_applicable_unregistered''',
    '''gst_scope'',''active_registered_taxpayer'',''itc_treatment'',''section_17_5_h_reversal''');
  definition:=pg_catalog.replace(definition,
    '''gst_registered_or_itc_reversal'',''partial_batch''',
    '''missing_exact_itc_lineage'',''partial_batch''');
  IF pg_catalog.strpos(definition,old_batch_guard)=0
     OR pg_catalog.strpos(definition,old_reason_guard)=0 THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='GST destruction migration requires the exact reviewed batch custody guards';
  END IF;
  definition:=pg_catalog.replace(definition,old_batch_guard,new_batch_guard);
  definition:=pg_catalog.replace(definition,old_reason_guard,new_reason_guard);
  EXECUTE definition;
END
$migration$;

ALTER FUNCTION erp_automation_commands.resolve_inventory_destruction_prepare(
  uuid,uuid,uuid,uuid,uuid,character varying,uuid,uuid,jsonb)
  RENAME TO resolve_inventory_destruction_prepare_physical_base;

CREATE OR REPLACE FUNCTION erp_automation_commands.resolve_inventory_destruction_prepare(
  organization_id uuid, membership_id uuid, auth_user_id uuid,
  application_user_id uuid, grant_id uuid, caller_client_id varchar,
  destruction_id uuid, inventory_document_id uuid, request_document jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
#variable_conflict use_variable
DECLARE resolved jsonb; clean_sources jsonb; source_versions jsonb;
  branch_id uuid:=NULLIF(request_document->>'branch_id','')::uuid;
  destruction_date date:=NULLIF(request_document->>'destruction_date','')::date;
  reversal_evidence_id uuid:=NULLIF(request_document->>'itc_reversal_evidence_attachment_id','')::uuid;
  registration tax.registrations%ROWTYPE; return_period tax.return_periods%ROWTYPE;
  gstr3b_return tax.returns%ROWTYPE; rule tax.itc_reversal_rule_versions%ROWTYPE;
  evidence core.attachments%ROWTYPE; expense_account finance.accounts%ROWTYPE;
  input_cgst finance.accounts%ROWTYPE; input_sgst finance.accounts%ROWTYPE;
  input_igst finance.accounts%ROWTYPE; input_cess finance.accounts%ROWTYPE;
  resolved_line jsonb; lot tax.input_credit_lots%ROWTYPE; required_quantity numeric(20,6);
  applied_quantity numeric(20,6); component numeric(20,2);
  applications jsonb:='[]'::jsonb; total_cgst numeric(20,2):=0;
  total_sgst numeric(20,2):=0; total_igst numeric(20,2):=0; total_cess numeric(20,2):=0;
BEGIN
  IF reversal_evidence_id IS NULL OR request_document->>'itc_treatment'<>'section_17_5_h_reversal'
     OR NULLIF(request_document->>'itc_reversal_event_id','')::uuid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='GST destruction requires exact reversal evidence and event identity';
  END IF;
  resolved:=erp_automation_commands.resolve_inventory_destruction_prepare_physical_base(
    organization_id,membership_id,auth_user_id,application_user_id,grant_id,
    caller_client_id,destruction_id,inventory_document_id,request_document);
  SELECT registration_row.* INTO STRICT registration
    FROM tax.registration_branches association
    JOIN tax.registrations registration_row
      ON registration_row.org_id=association.org_id AND registration_row.id=association.registration_id
   WHERE association.org_id=organization_id AND association.branch_id=branch_id
     AND registration_row.status='active' AND registration_row.registration_type='regular'
     AND registration_row.effective_from<=destruction_date
     AND (registration_row.effective_to IS NULL OR registration_row.effective_to>=destruction_date)
   FOR SHARE OF registration_row;
  SELECT * INTO STRICT return_period FROM tax.return_periods period
   WHERE period.org_id=organization_id AND period.registration_id=registration.id
     AND destruction_date BETWEEN period.period_start AND period.period_end
     AND period.status='open' FOR SHARE;
  SELECT * INTO STRICT gstr3b_return FROM tax.returns filing
   WHERE filing.org_id=organization_id AND filing.return_period_id=return_period.id
     AND filing.return_type='gstr3b' AND filing.status='draft'
   ORDER BY filing.revision DESC LIMIT 1 FOR SHARE;
  SELECT * INTO STRICT rule FROM tax.itc_reversal_rule_versions candidate
   WHERE candidate.status='active' AND candidate.event_kind='goods_destroyed'
     AND candidate.legal_section='17(5)(h)'
     AND candidate.effective_from<=destruction_date
     AND (candidate.effective_to IS NULL OR candidate.effective_to>=destruction_date)
   ORDER BY candidate.effective_from DESC,candidate.id LIMIT 1 FOR SHARE;
  SELECT * INTO STRICT evidence FROM core.attachments attachment
   WHERE attachment.org_id=organization_id AND attachment.id=reversal_evidence_id
     AND attachment.evidence_kind='inventory_destruction_itc_reversal'
     AND attachment.status IN ('verified','retained') AND attachment.verified_at IS NOT NULL
     AND attachment.verified_at<=pg_catalog.transaction_timestamp()
     AND attachment.document_date=destruction_date
     AND attachment.retention_until>=destruction_date AND attachment.sha256 IS NOT NULL FOR SHARE;
  SELECT * INTO STRICT expense_account FROM finance.accounts account
   WHERE account.org_id=organization_id
     AND account.id=erp_commercial_commands.resolve_role_account(
       organization_id,branch_id,'inventory_itc_reversal_expense','expense','INR',false)
     AND account.status='active' AND NOT account.allows_party_posting FOR SHARE;
  SELECT * INTO STRICT input_cgst FROM finance.accounts account WHERE account.org_id=organization_id
     AND account.id=erp_commercial_commands.resolve_role_account(organization_id,branch_id,'input_cgst','asset','INR',false)
     AND account.status='active' AND NOT account.allows_party_posting FOR SHARE;
  SELECT * INTO STRICT input_sgst FROM finance.accounts account WHERE account.org_id=organization_id
     AND account.id=erp_commercial_commands.resolve_role_account(organization_id,branch_id,'input_sgst','asset','INR',false)
     AND account.status='active' AND NOT account.allows_party_posting FOR SHARE;
  SELECT * INTO STRICT input_igst FROM finance.accounts account WHERE account.org_id=organization_id
     AND account.id=erp_commercial_commands.resolve_role_account(organization_id,branch_id,'input_igst','asset','INR',false)
     AND account.status='active' AND NOT account.allows_party_posting FOR SHARE;
  SELECT * INTO STRICT input_cess FROM finance.accounts account WHERE account.org_id=organization_id
     AND account.id=erp_commercial_commands.resolve_role_account(organization_id,branch_id,'input_cess','asset','INR',false)
     AND account.status='active' AND NOT account.allows_party_posting FOR SHARE;

  SELECT COALESCE(pg_catalog.jsonb_agg(value ORDER BY ordinal),'[]'::jsonb) INTO clean_sources
    FROM pg_catalog.jsonb_array_elements(resolved->'source_versions') WITH ORDINALITY source(value,ordinal)
   WHERE value->>'resource_type'<>'gst_registration_state';
  source_versions:=clean_sources||pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('resource_type','gst_registration','id',registration.id,
      'row_version',registration.row_version,'gstin',registration.gstin),
    pg_catalog.jsonb_build_object('resource_type','gst_return_period','id',return_period.id,
      'row_version',return_period.row_version,'period_start',return_period.period_start,
      'period_end',return_period.period_end,'status',return_period.status),
    pg_catalog.jsonb_build_object('resource_type','gstr3b_return','id',gstr3b_return.id,
      'row_version',gstr3b_return.row_version,'revision',gstr3b_return.revision,'status',gstr3b_return.status),
    pg_catalog.jsonb_build_object('resource_type','itc_reversal_rule','id',rule.id,
      'release_id',rule.release_id,'rule_code',rule.rule_code,'rule_version',rule.rule_version,
      'legal_section',rule.legal_section,'gstr3b_table_code',rule.gstr3b_table_code,
      'gstr3b_row_code',rule.gstr3b_row_code),
    pg_catalog.jsonb_build_object('resource_type','itc_reversal_evidence','id',evidence.id,
      'status',evidence.status,'verified_at',evidence.verified_at,
      'sha256',pg_catalog.encode(evidence.sha256,'hex')),
    pg_catalog.jsonb_build_object('resource_type','finance_account','role','inventory_itc_reversal_expense',
      'id',expense_account.id,'row_version',expense_account.row_version),
    pg_catalog.jsonb_build_object('resource_type','finance_account','role','input_cgst',
      'id',input_cgst.id,'row_version',input_cgst.row_version),
    pg_catalog.jsonb_build_object('resource_type','finance_account','role','input_sgst',
      'id',input_sgst.id,'row_version',input_sgst.row_version),
    pg_catalog.jsonb_build_object('resource_type','finance_account','role','input_igst',
      'id',input_igst.id,'row_version',input_igst.row_version),
    pg_catalog.jsonb_build_object('resource_type','finance_account','role','input_cess',
      'id',input_cess.id,'row_version',input_cess.row_version));

  FOR resolved_line IN SELECT value FROM pg_catalog.jsonb_array_elements(resolved->'lines') LOOP
    required_quantity:=(resolved_line->>'base_quantity')::numeric;
    FOR lot IN SELECT source.* FROM tax.input_credit_lots source
      WHERE source.org_id=organization_id AND source.batch_id=(resolved_line->>'batch_id')::uuid
        AND source.registration_id=registration.id AND source.lineage_status='exact'
        AND source.remaining_base_quantity>0
      ORDER BY source.acquired_on,source.supplier_invoice_id,source.supplier_invoice_line_id,source.id
      FOR SHARE
    LOOP
      EXIT WHEN required_quantity=0;
      applied_quantity:=least(required_quantity,lot.remaining_base_quantity);
      applications:=applications||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'input_credit_lot_id',lot.id,'inventory_document_line_id',resolved_line->>'inventory_document_line_id',
        'batch_id',lot.batch_id,'applied_base_quantity',applied_quantity::text,
        'applied_cgst_amount',(CASE WHEN applied_quantity=lot.remaining_base_quantity THEN lot.remaining_cgst_amount ELSE round(lot.remaining_cgst_amount*applied_quantity/lot.remaining_base_quantity,2) END)::text,
        'applied_sgst_amount',(CASE WHEN applied_quantity=lot.remaining_base_quantity THEN lot.remaining_sgst_amount ELSE round(lot.remaining_sgst_amount*applied_quantity/lot.remaining_base_quantity,2) END)::text,
        'applied_igst_amount',(CASE WHEN applied_quantity=lot.remaining_base_quantity THEN lot.remaining_igst_amount ELSE round(lot.remaining_igst_amount*applied_quantity/lot.remaining_base_quantity,2) END)::text,
        'applied_cess_amount',(CASE WHEN applied_quantity=lot.remaining_base_quantity THEN lot.remaining_cess_amount ELSE round(lot.remaining_cess_amount*applied_quantity/lot.remaining_base_quantity,2) END)::text,
        'source_lot_row_version',lot.row_version));
      total_cgst:=total_cgst+CASE WHEN applied_quantity=lot.remaining_base_quantity THEN lot.remaining_cgst_amount ELSE round(lot.remaining_cgst_amount*applied_quantity/lot.remaining_base_quantity,2) END;
      total_sgst:=total_sgst+CASE WHEN applied_quantity=lot.remaining_base_quantity THEN lot.remaining_sgst_amount ELSE round(lot.remaining_sgst_amount*applied_quantity/lot.remaining_base_quantity,2) END;
      total_igst:=total_igst+CASE WHEN applied_quantity=lot.remaining_base_quantity THEN lot.remaining_igst_amount ELSE round(lot.remaining_igst_amount*applied_quantity/lot.remaining_base_quantity,2) END;
      total_cess:=total_cess+CASE WHEN applied_quantity=lot.remaining_base_quantity THEN lot.remaining_cess_amount ELSE round(lot.remaining_cess_amount*applied_quantity/lot.remaining_base_quantity,2) END;
      source_versions:=source_versions||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'resource_type','input_credit_lot','id',lot.id,'row_version',lot.row_version,
        'batch_id',lot.batch_id,'remaining_base_quantity',lot.remaining_base_quantity::text,
        'remaining_cgst_amount',lot.remaining_cgst_amount::text,'remaining_sgst_amount',lot.remaining_sgst_amount::text,
        'remaining_igst_amount',lot.remaining_igst_amount::text,'remaining_cess_amount',lot.remaining_cess_amount::text,
        'source_hash',pg_catalog.encode(lot.source_hash,'hex')));
      required_quantity:=required_quantity-applied_quantity;
    END LOOP;
    IF required_quantity<>0 THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='destroyed batch lacks exact residual eligible input-credit lineage';
    END IF;
  END LOOP;
  IF total_cgst+total_sgst+total_igst+total_cess<=0 THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='GST-registered destruction must reverse a positive exact input-credit amount';
  END IF;
  RETURN resolved||pg_catalog.jsonb_build_object(
    'itc_treatment','section_17_5_h_reversal','itc_reversal_evidence_attachment_id',evidence.id,
    'gst_registration_id',registration.id,'gst_return_period_id',return_period.id,
    'gstr3b_return_id',gstr3b_return.id,'itc_reversal_rule_version_id',rule.id,
    'itc_reversal_event_id',(request_document->>'itc_reversal_event_id')::uuid,
    'inventory_itc_reversal_expense_account_id',expense_account.id,
    'input_cgst_account_id',input_cgst.id,'input_sgst_account_id',input_sgst.id,
    'input_igst_account_id',input_igst.id,'input_cess_account_id',input_cess.id,
    'itc_reversal_cgst_amount',total_cgst::text,'itc_reversal_sgst_amount',total_sgst::text,
    'itc_reversal_igst_amount',total_igst::text,'itc_reversal_cess_amount',total_cess::text,
    'itc_reversal_total',(total_cgst+total_sgst+total_igst+total_cess)::text,
    'itc_applications',applications,'source_versions',source_versions,
    'legal_scope',pg_catalog.jsonb_build_object(
      'country','IN','currency','INR','approval_policy','separate_approver',
      'physical_action','completed_and_certified','valuation','locked_moving_weighted_average',
      'gst_scope','active_registered_taxpayer','itc_treatment','section_17_5_h_reversal',
      'legal_section',rule.legal_section,'gstr3b_table_code',rule.gstr3b_table_code,
      'gstr3b_row_code',rule.gstr3b_row_code,'supported_method','licensed_incineration',
      'supported_quantity','full_batch_location_balance_only',
      'unsupported_fail_closed',pg_catalog.jsonb_build_array(
        'missing_exact_itc_lineage','ambiguous_sales_return_lineage','partial_batch',
        'backdated_or_future','cold_chain','schedule_h_h1_x_or_ndps','recall_linked',
        'saleable_location','uncertified','closed_gst_period','filed_gstr3b','reversal')));
END
$function$;
ALTER FUNCTION erp_automation_commands.resolve_inventory_destruction_prepare(
  uuid,uuid,uuid,uuid,uuid,character varying,uuid,uuid,jsonb) OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_automation_commands.resolve_inventory_destruction_prepare(
  uuid,uuid,uuid,uuid,uuid,character varying,uuid,uuid,jsonb) FROM PUBLIC,erp_app,erp_runtime;
GRANT EXECUTE ON FUNCTION erp_automation_commands.resolve_inventory_destruction_prepare(
  uuid,uuid,uuid,uuid,uuid,character varying,uuid,uuid,jsonb) TO erp_runtime;

CREATE OR REPLACE FUNCTION erp_compliance_commands.populate_destruction_gst_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
#variable_conflict use_variable
DECLARE command_id uuid:=NULLIF(pg_catalog.current_setting('app.request_id',true),'')::uuid;
  command automation.command_requests%ROWTYPE; grant_row automation.agent_grants%ROWTYPE;
  membership core.memberships%ROWTYPE; user_row core.users%ROWTYPE; request_document jsonb;
  resolved jsonb; application jsonb;
BEGIN
  SELECT * INTO STRICT command FROM automation.command_requests
   WHERE org_id=NEW.org_id AND id=command_id
     AND capability_code='inventory.destruction.prepare'
     AND target_resource_id=NEW.id FOR SHARE;
  SELECT * INTO STRICT grant_row FROM automation.agent_grants
   WHERE org_id=NEW.org_id AND id=command.agent_grant_id FOR SHARE;
  SELECT * INTO STRICT membership FROM core.memberships
   WHERE org_id=NEW.org_id AND id=command.requested_by_membership_id FOR SHARE;
  SELECT * INTO STRICT user_row FROM core.users WHERE id=membership.user_id FOR SHARE;
  request_document:=pg_catalog.convert_from(command.request_bytes,'UTF8')::jsonb;
  resolved:=erp_automation_commands.resolve_inventory_destruction_prepare(
    NEW.org_id,membership.id,user_row.auth_user_id,membership.user_id,grant_row.id,
    grant_row.client_id,NEW.id,NEW.inventory_document_id,request_document);
  NEW.physical_destruction_confirmed_at:=(resolved->>'physical_destruction_confirmed_at')::timestamptz;
  NEW.itc_treatment:=resolved->>'itc_treatment';
  NEW.itc_reversal_evidence_attachment_id:=(resolved->>'itc_reversal_evidence_attachment_id')::uuid;
  NEW.gst_registration_id:=(resolved->>'gst_registration_id')::uuid;
  NEW.gst_return_period_id:=(resolved->>'gst_return_period_id')::uuid;
  NEW.gstr3b_return_id:=(resolved->>'gstr3b_return_id')::uuid;
  NEW.itc_reversal_rule_version_id:=(resolved->>'itc_reversal_rule_version_id')::uuid;
  NEW.itc_reversal_cgst_amount:=(resolved->>'itc_reversal_cgst_amount')::numeric;
  NEW.itc_reversal_sgst_amount:=(resolved->>'itc_reversal_sgst_amount')::numeric;
  NEW.itc_reversal_igst_amount:=(resolved->>'itc_reversal_igst_amount')::numeric;
  NEW.itc_reversal_cess_amount:=(resolved->>'itc_reversal_cess_amount')::numeric;
  RETURN NEW;
END
$function$;
ALTER FUNCTION erp_compliance_commands.populate_destruction_gst_authority() OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_compliance_commands.populate_destruction_gst_authority()
  FROM PUBLIC,erp_app,erp_runtime;
CREATE TRIGGER destruction_gst_authority_before_insert
  BEFORE INSERT ON compliance.destructions
  FOR EACH ROW EXECUTE FUNCTION erp_compliance_commands.populate_destruction_gst_authority();

CREATE OR REPLACE FUNCTION erp_compliance_commands.reserve_destruction_input_credit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
#variable_conflict use_variable
DECLARE command_id uuid:=NULLIF(pg_catalog.current_setting('app.request_id',true),'')::uuid;
  command automation.command_requests%ROWTYPE; grant_row automation.agent_grants%ROWTYPE;
  membership core.memberships%ROWTYPE; user_row core.users%ROWTYPE; request_document jsonb;
  resolved jsonb; application jsonb; event_id uuid;
BEGIN
  SELECT * INTO STRICT command FROM automation.command_requests
   WHERE org_id=NEW.org_id AND id=command_id
     AND capability_code='inventory.destruction.prepare' AND target_resource_id=NEW.id FOR SHARE;
  SELECT * INTO STRICT grant_row FROM automation.agent_grants
   WHERE org_id=NEW.org_id AND id=command.agent_grant_id FOR SHARE;
  SELECT * INTO STRICT membership FROM core.memberships
   WHERE org_id=NEW.org_id AND id=command.requested_by_membership_id FOR SHARE;
  SELECT * INTO STRICT user_row FROM core.users WHERE id=membership.user_id FOR SHARE;
  request_document:=pg_catalog.convert_from(command.request_bytes,'UTF8')::jsonb;
  resolved:=erp_automation_commands.resolve_inventory_destruction_prepare(
    NEW.org_id,membership.id,user_row.auth_user_id,membership.user_id,grant_row.id,
    grant_row.client_id,NEW.id,NEW.inventory_document_id,request_document);
  event_id:=(resolved->>'itc_reversal_event_id')::uuid;
  INSERT INTO tax.input_credit_reversal_events(
    org_id,id,destruction_id,registration_id,return_period_id,gstr3b_return_id,
    rule_version_id,evidence_attachment_id,journal_entry_id,reversal_expense_account_id,
    input_cgst_account_id,input_sgst_account_id,input_igst_account_id,input_cess_account_id,
    physical_destruction_confirmed_at,cgst_amount,sgst_amount,igst_amount,cess_amount,
    created_by_membership_id)
  VALUES(NEW.org_id,event_id,NEW.id,(resolved->>'gst_registration_id')::uuid,
    (resolved->>'gst_return_period_id')::uuid,(resolved->>'gstr3b_return_id')::uuid,
    (resolved->>'itc_reversal_rule_version_id')::uuid,
    (resolved->>'itc_reversal_evidence_attachment_id')::uuid,
    (request_document->>'journal_id')::uuid,
    (resolved->>'inventory_itc_reversal_expense_account_id')::uuid,
    (resolved->>'input_cgst_account_id')::uuid,(resolved->>'input_sgst_account_id')::uuid,
    (resolved->>'input_igst_account_id')::uuid,(resolved->>'input_cess_account_id')::uuid,
    (resolved->>'physical_destruction_confirmed_at')::timestamptz,
    (resolved->>'itc_reversal_cgst_amount')::numeric,(resolved->>'itc_reversal_sgst_amount')::numeric,
    (resolved->>'itc_reversal_igst_amount')::numeric,(resolved->>'itc_reversal_cess_amount')::numeric,
    membership.id);
  FOR application IN SELECT value FROM pg_catalog.jsonb_array_elements(resolved->'itc_applications') LOOP
    INSERT INTO tax.input_credit_applications(
      org_id,input_credit_lot_id,destruction_id,reversal_event_id,application_kind,
      applied_base_quantity,applied_cgst_amount,applied_sgst_amount,applied_igst_amount,
      applied_cess_amount,source_lot_row_version,status,created_by_membership_id)
    VALUES(NEW.org_id,(application->>'input_credit_lot_id')::uuid,NEW.id,event_id,
      'destruction_reversal',(application->>'applied_base_quantity')::numeric,
      (application->>'applied_cgst_amount')::numeric,(application->>'applied_sgst_amount')::numeric,
      (application->>'applied_igst_amount')::numeric,(application->>'applied_cess_amount')::numeric,
      (application->>'source_lot_row_version')::bigint,'reserved',membership.id);
  END LOOP;
  RETURN NEW;
END
$function$;
ALTER FUNCTION erp_compliance_commands.reserve_destruction_input_credit() OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_compliance_commands.reserve_destruction_input_credit()
  FROM PUBLIC,erp_app,erp_runtime;
CREATE TRIGGER destruction_input_credit_after_insert
  AFTER INSERT ON compliance.destructions
  FOR EACH ROW EXECUTE FUNCTION erp_compliance_commands.reserve_destruction_input_credit();

CREATE OR REPLACE FUNCTION erp_compliance_commands.extend_destruction_journal_header()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE reversal_total numeric(20,2);
BEGIN
  SELECT event.cgst_amount+event.sgst_amount+event.igst_amount+event.cess_amount
    INTO reversal_total
    FROM tax.input_credit_reversal_events event
   WHERE event.org_id=NEW.org_id AND event.journal_entry_id=NEW.id AND event.status='draft';
  IF FOUND THEN
    NEW.transaction_debit_total:=NEW.transaction_debit_total+reversal_total;
    NEW.transaction_credit_total:=NEW.transaction_credit_total+reversal_total;
    NEW.functional_debit_total:=NEW.functional_debit_total+reversal_total;
    NEW.functional_credit_total:=NEW.functional_credit_total+reversal_total;
  END IF;
  RETURN NEW;
END
$function$;
ALTER FUNCTION erp_compliance_commands.extend_destruction_journal_header() OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_compliance_commands.extend_destruction_journal_header()
  FROM PUBLIC,erp_app,erp_runtime;
CREATE TRIGGER destruction_itc_journal_header
  BEFORE INSERT ON finance.journal_entries
  FOR EACH ROW EXECUTE FUNCTION erp_compliance_commands.extend_destruction_journal_header();

CREATE OR REPLACE FUNCTION erp_compliance_commands.extend_destruction_journal_lines()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE event tax.input_credit_reversal_events%ROWTYPE; branch_id uuid; reversal_total numeric(20,2);
BEGIN
  IF NEW.line_number<>2 THEN RETURN NEW; END IF;
  SELECT * INTO event FROM tax.input_credit_reversal_events candidate
   WHERE candidate.org_id=NEW.org_id AND candidate.journal_entry_id=NEW.journal_entry_id
     AND candidate.status='draft';
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT document.branch_id INTO STRICT branch_id
    FROM compliance.destructions destruction
    JOIN inventory.inventory_documents document
      ON document.org_id=destruction.org_id AND document.id=destruction.inventory_document_id
   WHERE destruction.org_id=event.org_id AND destruction.id=event.destruction_id;
  reversal_total:=event.cgst_amount+event.sgst_amount+event.igst_amount+event.cess_amount;
  INSERT INTO finance.journal_lines(
    org_id,id,journal_entry_id,line_number,account_id,branch_id,description,
    transaction_debit,transaction_credit,functional_debit,functional_credit)
  VALUES(NEW.org_id,gen_random_uuid(),NEW.journal_entry_id,3,event.reversal_expense_account_id,
    branch_id,'Section 17(5)(h) input-credit reversal on destroyed goods',
    reversal_total,0,reversal_total,0);
  INSERT INTO finance.journal_lines(
    org_id,id,journal_entry_id,line_number,account_id,branch_id,description,
    transaction_debit,transaction_credit,functional_debit,functional_credit)
  SELECT NEW.org_id,gen_random_uuid(),NEW.journal_entry_id,component.line_number,
    component.account_id,branch_id,component.description,0,component.amount,0,component.amount
  FROM (VALUES
    (4,event.input_cgst_account_id,'Input CGST reversed under Section 17(5)(h)',event.cgst_amount),
    (5,event.input_sgst_account_id,'Input SGST reversed under Section 17(5)(h)',event.sgst_amount),
    (6,event.input_igst_account_id,'Input IGST reversed under Section 17(5)(h)',event.igst_amount),
    (7,event.input_cess_account_id,'Input cess reversed under Section 17(5)(h)',event.cess_amount)
  ) component(line_number,account_id,description,amount)
  WHERE component.amount>0;
  RETURN NEW;
END
$function$;
ALTER FUNCTION erp_compliance_commands.extend_destruction_journal_lines() OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_compliance_commands.extend_destruction_journal_lines()
  FROM PUBLIC,erp_app,erp_runtime;
CREATE TRIGGER destruction_itc_journal_lines
  AFTER INSERT ON finance.journal_lines
  FOR EACH ROW EXECUTE FUNCTION erp_compliance_commands.extend_destruction_journal_lines();

CREATE OR REPLACE FUNCTION erp_compliance_commands.post_destruction_input_credit_reversal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
#variable_conflict use_variable
DECLARE event tax.input_credit_reversal_events%ROWTYPE; application tax.input_credit_applications%ROWTYPE;
  lot tax.input_credit_lots%ROWTYPE; actor_id uuid;
BEGIN
  IF NEW.status<>'posted' OR OLD.status IS NOT DISTINCT FROM 'posted' THEN RETURN NEW; END IF;
  actor_id:=NEW.posted_by_membership_id;
  SELECT * INTO STRICT event FROM tax.input_credit_reversal_events candidate
   WHERE candidate.org_id=NEW.org_id AND candidate.destruction_id=NEW.id
     AND candidate.status='draft' FOR UPDATE;
  PERFORM 1 FROM tax.registrations registration
   WHERE registration.org_id=NEW.org_id AND registration.id=event.registration_id
     AND registration.status='active' AND registration.effective_from<=NEW.destruction_date
     AND (registration.effective_to IS NULL OR registration.effective_to>=NEW.destruction_date) FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='GST registration changed before destruction posting'; END IF;
  PERFORM 1 FROM tax.return_periods period JOIN tax.returns filing
    ON filing.org_id=period.org_id AND filing.return_period_id=period.id
   WHERE period.org_id=NEW.org_id AND period.id=event.return_period_id AND period.status='open'
     AND filing.id=event.gstr3b_return_id AND filing.return_type='gstr3b' AND filing.status='draft' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='GSTR-3B period changed before destruction posting'; END IF;
  PERFORM 1 FROM core.attachments evidence
   WHERE evidence.org_id=NEW.org_id AND evidence.id=event.evidence_attachment_id
     AND evidence.evidence_kind='inventory_destruction_itc_reversal'
     AND evidence.status IN ('verified','retained') AND evidence.sha256 IS NOT NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='ITC reversal evidence changed before destruction posting'; END IF;
  FOR application IN SELECT * FROM tax.input_credit_applications candidate
    WHERE candidate.org_id=NEW.org_id AND candidate.destruction_id=NEW.id
      AND candidate.reversal_event_id=event.id AND candidate.status='reserved'
    ORDER BY candidate.input_credit_lot_id FOR UPDATE
  LOOP
    SELECT * INTO STRICT lot FROM tax.input_credit_lots source
     WHERE source.org_id=NEW.org_id AND source.id=application.input_credit_lot_id FOR UPDATE;
    IF lot.row_version<>application.source_lot_row_version OR lot.lineage_status<>'exact'
       OR lot.remaining_base_quantity<application.applied_base_quantity
       OR lot.remaining_cgst_amount<application.applied_cgst_amount
       OR lot.remaining_sgst_amount<application.applied_sgst_amount
       OR lot.remaining_igst_amount<application.applied_igst_amount
       OR lot.remaining_cess_amount<application.applied_cess_amount THEN
      RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='input-credit lot changed after approved destruction preview';
    END IF;
    UPDATE tax.input_credit_lots SET
      remaining_base_quantity=remaining_base_quantity-application.applied_base_quantity,
      remaining_cgst_amount=remaining_cgst_amount-application.applied_cgst_amount,
      remaining_sgst_amount=remaining_sgst_amount-application.applied_sgst_amount,
      remaining_igst_amount=remaining_igst_amount-application.applied_igst_amount,
      remaining_cess_amount=remaining_cess_amount-application.applied_cess_amount,
      updated_at=transaction_timestamp(),updated_by_membership_id=actor_id,row_version=row_version+1
     WHERE org_id=NEW.org_id AND id=lot.id AND row_version=lot.row_version;
    UPDATE tax.input_credit_applications SET status='posted',posted_at=transaction_timestamp()
     WHERE org_id=NEW.org_id AND id=application.id AND status='reserved';
  END LOOP;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='destruction has no reserved input-credit source applications';
  END IF;
  UPDATE tax.input_credit_reversal_events SET status='posted',posted_at=transaction_timestamp(),
    posted_by_membership_id=actor_id WHERE org_id=NEW.org_id AND id=event.id AND status='draft';
  RETURN NEW;
END
$function$;
ALTER FUNCTION erp_compliance_commands.post_destruction_input_credit_reversal() OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_compliance_commands.post_destruction_input_credit_reversal()
  FROM PUBLIC,erp_app,erp_runtime;
CREATE TRIGGER destruction_input_credit_after_post
  AFTER UPDATE OF status ON compliance.destructions
  FOR EACH ROW EXECUTE FUNCTION erp_compliance_commands.post_destruction_input_credit_reversal();

DO $migration$
DECLARE definition text;
  old_totals text:=$needle$       'INR'::bpchar,1::numeric,(resolved_document->>'total_value')::numeric,
       (resolved_document->>'total_value')::numeric,(resolved_document->>'total_value')::numeric,
       (resolved_document->>'total_value')::numeric)
     OR (SELECT count(*) FROM finance.journal_lines line
          WHERE line.org_id=organization_id AND line.journal_entry_id=journal_id)<>2
$needle$;
  new_totals text:=$needle$       'INR'::bpchar,1::numeric,
       (resolved_document->>'total_value')::numeric+(resolved_document->>'itc_reversal_total')::numeric,
       (resolved_document->>'total_value')::numeric+(resolved_document->>'itc_reversal_total')::numeric,
       (resolved_document->>'total_value')::numeric+(resolved_document->>'itc_reversal_total')::numeric,
       (resolved_document->>'total_value')::numeric+(resolved_document->>'itc_reversal_total')::numeric)
     OR (SELECT count(*) FROM finance.journal_lines line
          WHERE line.org_id=organization_id AND line.journal_entry_id=journal_id)
        <>3+(CASE WHEN (resolved_document->>'itc_reversal_cgst_amount')::numeric>0 THEN 1 ELSE 0 END)
            +(CASE WHEN (resolved_document->>'itc_reversal_sgst_amount')::numeric>0 THEN 1 ELSE 0 END)
            +(CASE WHEN (resolved_document->>'itc_reversal_igst_amount')::numeric>0 THEN 1 ELSE 0 END)
            +(CASE WHEN (resolved_document->>'itc_reversal_cess_amount')::numeric>0 THEN 1 ELSE 0 END)
$needle$;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'erp_automation_commands.assert_inventory_destruction_draft(uuid,uuid,uuid,uuid,jsonb)'::pg_catalog.regprocedure)
    INTO STRICT definition;
  IF pg_catalog.strpos(definition,old_totals)=0 THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='GST destruction requires the exact reviewed draft journal assertion';
  END IF;
  definition:=pg_catalog.replace(definition,old_totals,new_totals);
  EXECUTE definition;
END
$migration$;

ALTER FUNCTION erp_automation_commands.assert_inventory_destruction_draft(
  uuid,uuid,uuid,uuid,jsonb) RENAME TO assert_inventory_destruction_physical_draft;

CREATE OR REPLACE FUNCTION erp_automation_commands.assert_inventory_destruction_draft(
  organization_id uuid, destruction_id uuid, inventory_document_id uuid,
  journal_id uuid, resolved_document jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
#variable_conflict use_variable
DECLARE event tax.input_credit_reversal_events%ROWTYPE; expected_lines integer;
BEGIN
  PERFORM erp_automation_commands.assert_inventory_destruction_physical_draft(
    organization_id,destruction_id,inventory_document_id,journal_id,resolved_document);
  SELECT * INTO STRICT event FROM tax.input_credit_reversal_events candidate
   WHERE candidate.org_id=organization_id AND candidate.destruction_id=destruction_id
     AND candidate.journal_entry_id=journal_id AND candidate.status='draft' FOR SHARE;
  expected_lines:=3+(CASE WHEN event.cgst_amount>0 THEN 1 ELSE 0 END)
    +(CASE WHEN event.sgst_amount>0 THEN 1 ELSE 0 END)
    +(CASE WHEN event.igst_amount>0 THEN 1 ELSE 0 END)
    +(CASE WHEN event.cess_amount>0 THEN 1 ELSE 0 END);
  IF ROW(event.registration_id,event.return_period_id,event.gstr3b_return_id,event.rule_version_id,
         event.evidence_attachment_id,event.physical_destruction_confirmed_at,
         event.cgst_amount,event.sgst_amount,event.igst_amount,event.cess_amount)
     IS DISTINCT FROM ROW((resolved_document->>'gst_registration_id')::uuid,
       (resolved_document->>'gst_return_period_id')::uuid,(resolved_document->>'gstr3b_return_id')::uuid,
       (resolved_document->>'itc_reversal_rule_version_id')::uuid,
       (resolved_document->>'itc_reversal_evidence_attachment_id')::uuid,
       (resolved_document->>'physical_destruction_confirmed_at')::timestamptz,
       (resolved_document->>'itc_reversal_cgst_amount')::numeric,
       (resolved_document->>'itc_reversal_sgst_amount')::numeric,
       (resolved_document->>'itc_reversal_igst_amount')::numeric,
       (resolved_document->>'itc_reversal_cess_amount')::numeric)
     OR (SELECT count(*) FROM finance.journal_lines line
          WHERE line.org_id=organization_id AND line.journal_entry_id=journal_id)<>expected_lines
     OR NOT EXISTS(SELECT 1 FROM finance.journal_lines line
          WHERE line.org_id=organization_id AND line.journal_entry_id=journal_id
            AND line.line_number=3 AND line.account_id=event.reversal_expense_account_id
            AND line.party_id IS NULL
            AND line.transaction_debit=(resolved_document->>'itc_reversal_total')::numeric
            AND line.transaction_credit=0
            AND line.functional_debit=(resolved_document->>'itc_reversal_total')::numeric
            AND line.functional_credit=0)
     OR EXISTS(SELECT 1 FROM (VALUES
          (4,event.input_cgst_account_id,event.cgst_amount),
          (5,event.input_sgst_account_id,event.sgst_amount),
          (6,event.input_igst_account_id,event.igst_amount),
          (7,event.input_cess_account_id,event.cess_amount)
        ) component(line_number,account_id,amount)
        WHERE component.amount>0 AND NOT EXISTS(
          SELECT 1 FROM finance.journal_lines line
           WHERE line.org_id=organization_id AND line.journal_entry_id=journal_id
             AND line.line_number=component.line_number AND line.account_id=component.account_id
             AND line.party_id IS NULL AND line.transaction_debit=0
             AND line.transaction_credit=component.amount AND line.functional_debit=0
             AND line.functional_credit=component.amount)) THEN
    RAISE EXCEPTION USING ERRCODE='40001',
      MESSAGE='prepared destruction ITC reversal event or component journal differs from approved preview';
  END IF;
END
$function$;
ALTER FUNCTION erp_automation_commands.assert_inventory_destruction_draft(
  uuid,uuid,uuid,uuid,jsonb) OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_automation_commands.assert_inventory_destruction_draft(
  uuid,uuid,uuid,uuid,jsonb) FROM PUBLIC,erp_app,erp_runtime;

DO $migration$
DECLARE definition text;
  old_registration_guard text:=$needle$     OR certificate.status NOT IN ('verified','retained')
     OR EXISTS(SELECT 1 FROM tax.registrations registration
        WHERE registration.org_id=organization_id AND registration.status='active'
          AND registration.effective_from<=destruction.destruction_date
          AND (registration.effective_to IS NULL OR registration.effective_to>=destruction.destruction_date)) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='only the exact approved non-GST certified destruction may post';
$needle$;
  new_registration_guard text:=$needle$     OR certificate.status NOT IN ('verified','retained')
     OR destruction.itc_treatment<>'section_17_5_h_reversal'
     OR destruction.physical_destruction_confirmed_at IS NULL
     OR destruction.itc_reversal_evidence_attachment_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='only the exact approved GST-registered certified destruction may post';
$needle$;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'erp_compliance_commands.post_destruction(uuid,uuid,uuid,bytea,bytea,timestamp with time zone)'::pg_catalog.regprocedure)
    INTO STRICT definition;
  IF pg_catalog.strpos(definition,old_registration_guard)=0 THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='GST destruction requires the exact reviewed posting guard';
  END IF;
  definition:=pg_catalog.replace(definition,old_registration_guard,new_registration_guard);
  EXECUTE definition;
END
$migration$;

DO $migration$
DECLARE definition text;
  old_journal_guard text:=$needle$   WHERE org_id=organization_id AND id=journal_id AND status='draft'
     AND transaction_debit_total=ledger_value AND transaction_credit_total=ledger_value
     AND functional_debit_total=ledger_value AND functional_credit_total=ledger_value;
$needle$;
  new_journal_guard text:=$needle$   WHERE org_id=organization_id AND id=journal_id AND status='draft'
     AND transaction_debit_total=ledger_value+(current_resolution->>'itc_reversal_total')::numeric
     AND transaction_credit_total=ledger_value+(current_resolution->>'itc_reversal_total')::numeric
     AND functional_debit_total=ledger_value+(current_resolution->>'itc_reversal_total')::numeric
     AND functional_credit_total=ledger_value+(current_resolution->>'itc_reversal_total')::numeric;
$needle$;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'erp_automation_commands.execute_inventory_destruction_command(uuid,uuid)'::pg_catalog.regprocedure)
    INTO STRICT definition;
  IF pg_catalog.strpos(definition,old_journal_guard)=0 THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='GST destruction requires the exact reviewed journal posting guard';
  END IF;
  definition:=pg_catalog.replace(definition,old_journal_guard,new_journal_guard);
  EXECUTE definition;
END
$migration$;

CREATE OR REPLACE FUNCTION erp_compliance_commands.create_supplier_invoice_input_credit_lots(
  organization_id uuid, supplier_invoice_id uuid, actor_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
#variable_conflict use_variable
DECLARE inserted_count integer;
BEGIN
  IF organization_id IS NULL OR supplier_invoice_id IS NULL OR actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='input-credit lot source identity is incomplete';
  END IF;
  PERFORM 1 FROM procurement.supplier_invoices invoice
   WHERE invoice.org_id=organization_id AND invoice.id=supplier_invoice_id
     AND invoice.status='posted' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='input-credit lots require a posted supplier invoice';
  END IF;
  WITH source AS (
    SELECT allocation.id AS allocation_id,allocation.goods_receipt_line_id,
           line.id AS invoice_line_id,line.supplier_invoice_id,receipt_line.batch_id,
           tax_document.registration_id,tax_document.document_date AS acquired_on,
           allocation.allocated_base_billed_quantity+allocation.allocated_base_free_quantity AS acquired_quantity,
           line.base_billed_quantity+line.base_free_quantity AS line_quantity,
           line.cgst_amount,line.sgst_amount,line.igst_amount,line.cess_amount,
           row_number() OVER (PARTITION BY line.id ORDER BY allocation.id) AS allocation_number,
           count(*) OVER (PARTITION BY line.id) AS allocation_count
      FROM procurement.supplier_invoice_lines line
      JOIN procurement.supplier_invoice_receipt_allocations allocation
        ON allocation.org_id=line.org_id AND allocation.supplier_invoice_line_id=line.id
      JOIN procurement.goods_receipt_lines receipt_line
        ON receipt_line.org_id=allocation.org_id AND receipt_line.id=allocation.goods_receipt_line_id
      JOIN tax.documents tax_document
        ON tax_document.org_id=line.org_id
       AND tax_document.supplier_invoice_id=line.supplier_invoice_id
       AND tax_document.document_class='supplier_invoice'
       AND tax_document.document_effect='original'
     WHERE line.org_id=organization_id AND line.supplier_invoice_id=supplier_invoice_id
       AND line.line_kind='product' AND line.itc_eligibility='eligible'
       AND line.base_billed_quantity+line.base_free_quantity>0
       AND line.cgst_amount+line.sgst_amount+line.igst_amount+line.cess_amount>0
  ), allocated AS (
    SELECT source.*,
      CASE WHEN allocation_number=allocation_count THEN cgst_amount-
        COALESCE(sum(round(cgst_amount*acquired_quantity/line_quantity,2)) OVER (
          PARTITION BY invoice_line_id ORDER BY allocation_id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0)
        ELSE round(cgst_amount*acquired_quantity/line_quantity,2) END AS lot_cgst,
      CASE WHEN allocation_number=allocation_count THEN sgst_amount-
        COALESCE(sum(round(sgst_amount*acquired_quantity/line_quantity,2)) OVER (
          PARTITION BY invoice_line_id ORDER BY allocation_id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0)
        ELSE round(sgst_amount*acquired_quantity/line_quantity,2) END AS lot_sgst,
      CASE WHEN allocation_number=allocation_count THEN igst_amount-
        COALESCE(sum(round(igst_amount*acquired_quantity/line_quantity,2)) OVER (
          PARTITION BY invoice_line_id ORDER BY allocation_id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0)
        ELSE round(igst_amount*acquired_quantity/line_quantity,2) END AS lot_igst,
      CASE WHEN allocation_number=allocation_count THEN cess_amount-
        COALESCE(sum(round(cess_amount*acquired_quantity/line_quantity,2)) OVER (
          PARTITION BY invoice_line_id ORDER BY allocation_id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0)
        ELSE round(cess_amount*acquired_quantity/line_quantity,2) END AS lot_cess
    FROM source
  )
  INSERT INTO tax.input_credit_lots(
    org_id,registration_id,supplier_invoice_id,supplier_invoice_line_id,
    supplier_invoice_receipt_allocation_id,goods_receipt_line_id,batch_id,acquired_on,
    acquired_base_quantity,eligible_cgst_amount,eligible_sgst_amount,eligible_igst_amount,
    eligible_cess_amount,remaining_base_quantity,remaining_cgst_amount,remaining_sgst_amount,
    remaining_igst_amount,remaining_cess_amount,source_hash,created_by_membership_id,
    updated_by_membership_id)
  SELECT organization_id,registration_id,supplier_invoice_id,invoice_line_id,allocation_id,
         goods_receipt_line_id,batch_id,acquired_on,acquired_quantity,
         lot_cgst,lot_sgst,lot_igst,lot_cess,acquired_quantity,
         lot_cgst,lot_sgst,lot_igst,lot_cess,
         extensions.digest(pg_catalog.convert_to(pg_catalog.jsonb_build_array(
           registration_id,supplier_invoice_id,invoice_line_id,allocation_id,
           goods_receipt_line_id,batch_id,acquired_on,acquired_quantity,
           lot_cgst,lot_sgst,lot_igst,lot_cess)::text,'UTF8'),'sha256'),
         actor_id,actor_id
    FROM allocated
  ON CONFLICT (org_id,supplier_invoice_receipt_allocation_id) DO NOTHING;
  GET DIAGNOSTICS inserted_count=ROW_COUNT;
  RETURN inserted_count;
END
$function$;
ALTER FUNCTION erp_compliance_commands.create_supplier_invoice_input_credit_lots(uuid,uuid,uuid)
  OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_compliance_commands.create_supplier_invoice_input_credit_lots(uuid,uuid,uuid)
  FROM PUBLIC,erp_app,erp_runtime;

CREATE OR REPLACE FUNCTION erp_compliance_commands.consume_input_credit_lots(
  organization_id uuid, batch_id uuid, consumed_quantity numeric,
  application_kind text, stock_ledger_entry_id uuid, actor_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
#variable_conflict use_variable
DECLARE lot tax.input_credit_lots%ROWTYPE; remaining_quantity numeric(20,6):=consumed_quantity;
  applied_quantity numeric(20,6); applied_cgst numeric(20,2); applied_sgst numeric(20,2);
  applied_igst numeric(20,2); applied_cess numeric(20,2);
BEGIN
  IF organization_id IS NULL OR batch_id IS NULL OR actor_id IS NULL
     OR consumed_quantity<=0 OR consumed_quantity<>round(consumed_quantity,6)
     OR application_kind NOT IN ('sale_consumption','purchase_return_consumption','opening_consumption') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='input-credit consumption input is invalid';
  END IF;
  FOR lot IN SELECT * FROM tax.input_credit_lots source
    WHERE source.org_id=organization_id AND source.batch_id=batch_id
      AND source.lineage_status='exact' AND source.remaining_base_quantity>0
    ORDER BY source.acquired_on,source.supplier_invoice_id,source.supplier_invoice_line_id,source.id
    FOR UPDATE
  LOOP
    EXIT WHEN remaining_quantity=0;
    applied_quantity:=least(remaining_quantity,lot.remaining_base_quantity);
    applied_cgst:=CASE WHEN applied_quantity=lot.remaining_base_quantity THEN lot.remaining_cgst_amount
      ELSE round(lot.remaining_cgst_amount*applied_quantity/lot.remaining_base_quantity,2) END;
    applied_sgst:=CASE WHEN applied_quantity=lot.remaining_base_quantity THEN lot.remaining_sgst_amount
      ELSE round(lot.remaining_sgst_amount*applied_quantity/lot.remaining_base_quantity,2) END;
    applied_igst:=CASE WHEN applied_quantity=lot.remaining_base_quantity THEN lot.remaining_igst_amount
      ELSE round(lot.remaining_igst_amount*applied_quantity/lot.remaining_base_quantity,2) END;
    applied_cess:=CASE WHEN applied_quantity=lot.remaining_base_quantity THEN lot.remaining_cess_amount
      ELSE round(lot.remaining_cess_amount*applied_quantity/lot.remaining_base_quantity,2) END;
    INSERT INTO tax.input_credit_applications(
      org_id,input_credit_lot_id,stock_ledger_entry_id,application_kind,
      applied_base_quantity,applied_cgst_amount,applied_sgst_amount,
      applied_igst_amount,applied_cess_amount,source_lot_row_version,status,posted_at,
      created_by_membership_id)
    VALUES(organization_id,lot.id,stock_ledger_entry_id,application_kind,
      applied_quantity,applied_cgst,applied_sgst,applied_igst,applied_cess,
      lot.row_version,'posted',transaction_timestamp(),actor_id);
    UPDATE tax.input_credit_lots SET
      remaining_base_quantity=remaining_base_quantity-applied_quantity,
      remaining_cgst_amount=remaining_cgst_amount-applied_cgst,
      remaining_sgst_amount=remaining_sgst_amount-applied_sgst,
      remaining_igst_amount=remaining_igst_amount-applied_igst,
      remaining_cess_amount=remaining_cess_amount-applied_cess,
      updated_at=transaction_timestamp(),updated_by_membership_id=actor_id,
      row_version=row_version+1
     WHERE org_id=organization_id AND id=lot.id AND row_version=lot.row_version;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='input-credit lot changed during deterministic consumption';
    END IF;
    remaining_quantity:=remaining_quantity-applied_quantity;
  END LOOP;
  IF remaining_quantity<>0 THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='stock issue exceeds exact eligible input-credit lot lineage';
  END IF;
  RETURN consumed_quantity;
END
$function$;
ALTER FUNCTION erp_compliance_commands.consume_input_credit_lots(uuid,uuid,numeric,text,uuid,uuid)
  OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_compliance_commands.consume_input_credit_lots(uuid,uuid,numeric,text,uuid,uuid)
  FROM PUBLIC,erp_app,erp_runtime;

CREATE OR REPLACE FUNCTION erp_compliance_commands.restore_sales_return_input_credit_lots(
  organization_id uuid,batch_id uuid,restored_quantity numeric,
  stock_ledger_entry_id uuid,actor_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
#variable_conflict use_variable
DECLARE consumed tax.input_credit_applications%ROWTYPE; lot tax.input_credit_lots%ROWTYPE;
  remaining_quantity numeric(20,6):=restored_quantity; available_quantity numeric(20,6);
  applied_quantity numeric(20,6); restored_cgst numeric(20,2); restored_sgst numeric(20,2);
  restored_igst numeric(20,2); restored_cess numeric(20,2); prior record;
BEGIN
  IF organization_id IS NULL OR batch_id IS NULL OR stock_ledger_entry_id IS NULL OR actor_id IS NULL
     OR restored_quantity<=0 OR restored_quantity<>round(restored_quantity,6) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='sales-return credit-lot restoration input is invalid';
  END IF;
  FOR consumed IN SELECT application.* FROM tax.input_credit_applications application
    JOIN tax.input_credit_lots source ON source.org_id=application.org_id
      AND source.id=application.input_credit_lot_id
   WHERE application.org_id=organization_id AND source.batch_id=batch_id
     AND application.application_kind='sale_consumption'
     AND application.application_direction='consume' AND application.status='posted'
   ORDER BY application.posted_at DESC,application.id DESC FOR UPDATE OF application
  LOOP
    EXIT WHEN remaining_quantity=0;
    SELECT COALESCE(sum(restoration.applied_base_quantity),0) quantity,
           COALESCE(sum(restoration.applied_cgst_amount),0) cgst,
           COALESCE(sum(restoration.applied_sgst_amount),0) sgst,
           COALESCE(sum(restoration.applied_igst_amount),0) igst,
           COALESCE(sum(restoration.applied_cess_amount),0) cess
      INTO prior FROM tax.input_credit_applications restoration
     WHERE restoration.org_id=organization_id
       AND restoration.reverses_application_id=consumed.id
       AND restoration.application_kind='sales_return_restoration'
       AND restoration.status='posted';
    available_quantity:=consumed.applied_base_quantity-prior.quantity;
    CONTINUE WHEN available_quantity<=0;
    applied_quantity:=least(remaining_quantity,available_quantity);
    restored_cgst:=CASE WHEN applied_quantity=available_quantity THEN consumed.applied_cgst_amount-prior.cgst
      ELSE round((consumed.applied_cgst_amount-prior.cgst)*applied_quantity/available_quantity,2) END;
    restored_sgst:=CASE WHEN applied_quantity=available_quantity THEN consumed.applied_sgst_amount-prior.sgst
      ELSE round((consumed.applied_sgst_amount-prior.sgst)*applied_quantity/available_quantity,2) END;
    restored_igst:=CASE WHEN applied_quantity=available_quantity THEN consumed.applied_igst_amount-prior.igst
      ELSE round((consumed.applied_igst_amount-prior.igst)*applied_quantity/available_quantity,2) END;
    restored_cess:=CASE WHEN applied_quantity=available_quantity THEN consumed.applied_cess_amount-prior.cess
      ELSE round((consumed.applied_cess_amount-prior.cess)*applied_quantity/available_quantity,2) END;
    SELECT * INTO STRICT lot FROM tax.input_credit_lots source
     WHERE source.org_id=organization_id AND source.id=consumed.input_credit_lot_id FOR UPDATE;
    IF lot.remaining_base_quantity+applied_quantity>lot.acquired_base_quantity
       OR lot.remaining_cgst_amount+restored_cgst>lot.eligible_cgst_amount
       OR lot.remaining_sgst_amount+restored_sgst>lot.eligible_sgst_amount
       OR lot.remaining_igst_amount+restored_igst>lot.eligible_igst_amount
       OR lot.remaining_cess_amount+restored_cess>lot.eligible_cess_amount THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='sales return would over-restore its exact input-credit source lot';
    END IF;
    INSERT INTO tax.input_credit_applications(
      org_id,input_credit_lot_id,stock_ledger_entry_id,reverses_application_id,
      application_kind,application_direction,applied_base_quantity,applied_cgst_amount,
      applied_sgst_amount,applied_igst_amount,applied_cess_amount,source_lot_row_version,
      status,posted_at,created_by_membership_id)
    VALUES(organization_id,lot.id,stock_ledger_entry_id,consumed.id,
      'sales_return_restoration','restore',applied_quantity,restored_cgst,restored_sgst,
      restored_igst,restored_cess,lot.row_version,'posted',transaction_timestamp(),actor_id);
    UPDATE tax.input_credit_lots SET remaining_base_quantity=remaining_base_quantity+applied_quantity,
      remaining_cgst_amount=remaining_cgst_amount+restored_cgst,
      remaining_sgst_amount=remaining_sgst_amount+restored_sgst,
      remaining_igst_amount=remaining_igst_amount+restored_igst,
      remaining_cess_amount=remaining_cess_amount+restored_cess,
      updated_at=transaction_timestamp(),updated_by_membership_id=actor_id,row_version=row_version+1
     WHERE org_id=organization_id AND id=lot.id AND row_version=lot.row_version;
    remaining_quantity:=remaining_quantity-applied_quantity;
  END LOOP;
  IF remaining_quantity<>0 THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='sales return exceeds exact previously consumed input-credit lineage';
  END IF;
  RETURN restored_quantity;
END
$function$;
ALTER FUNCTION erp_compliance_commands.restore_sales_return_input_credit_lots(uuid,uuid,numeric,uuid,uuid)
  OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_compliance_commands.restore_sales_return_input_credit_lots(uuid,uuid,numeric,uuid,uuid)
  FROM PUBLIC,erp_app,erp_runtime;

CREATE OR REPLACE FUNCTION erp_compliance_commands.capture_supplier_invoice_input_credit_lots()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
BEGIN
  IF NEW.status='posted'
     AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'posted') THEN
    PERFORM erp_compliance_commands.create_supplier_invoice_input_credit_lots(
      NEW.org_id,NEW.id,NEW.posted_by_membership_id);
  END IF;
  RETURN NEW;
END
$function$;
ALTER FUNCTION erp_compliance_commands.capture_supplier_invoice_input_credit_lots() OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_compliance_commands.capture_supplier_invoice_input_credit_lots()
  FROM PUBLIC,erp_app,erp_runtime;
CREATE TRIGGER supplier_invoice_input_credit_lots
  AFTER INSERT OR UPDATE ON procurement.supplier_invoices
  FOR EACH ROW EXECUTE FUNCTION erp_compliance_commands.capture_supplier_invoice_input_credit_lots();

CREATE OR REPLACE FUNCTION erp_compliance_commands.capture_tax_document_input_credit_lots()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE actor_id uuid;
BEGIN
  IF NEW.supplier_invoice_id IS NOT NULL
     AND NEW.document_class='supplier_invoice'
     AND NEW.document_effect='original' THEN
    SELECT invoice.posted_by_membership_id INTO actor_id
      FROM procurement.supplier_invoices invoice
     WHERE invoice.org_id=NEW.org_id AND invoice.id=NEW.supplier_invoice_id
       AND invoice.status='posted';
    IF actor_id IS NOT NULL THEN
      PERFORM erp_compliance_commands.create_supplier_invoice_input_credit_lots(
        NEW.org_id,NEW.supplier_invoice_id,actor_id);
    END IF;
  END IF;
  RETURN NEW;
END
$function$;
ALTER FUNCTION erp_compliance_commands.capture_tax_document_input_credit_lots()
  OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_compliance_commands.capture_tax_document_input_credit_lots()
  FROM PUBLIC,erp_app,erp_runtime;
CREATE TRIGGER tax_document_input_credit_lots
  AFTER INSERT ON tax.documents
  FOR EACH ROW EXECUTE FUNCTION erp_compliance_commands.capture_tax_document_input_credit_lots();

CREATE OR REPLACE FUNCTION erp_compliance_commands.capture_input_credit_stock_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
#variable_conflict use_variable
DECLARE document_type text; actor_id uuid;
BEGIN
  SELECT document.document_type INTO STRICT document_type
    FROM inventory.inventory_documents document
   WHERE document.org_id=NEW.org_id AND document.id=NEW.inventory_document_id;
  actor_id:=COALESCE(NULLIF(pg_catalog.current_setting('app.membership_id',true),'')::uuid,
    NEW.posted_by_membership_id);
  IF NEW.quantity_delta<0 AND NEW.entry_kind='issue' AND document_type IN ('sales_issue','purchase_return_issue')
     AND EXISTS(SELECT 1 FROM tax.input_credit_lots lot
       WHERE lot.org_id=NEW.org_id AND lot.batch_id=NEW.batch_id) THEN
    PERFORM erp_compliance_commands.consume_input_credit_lots(
      NEW.org_id,NEW.batch_id,-NEW.quantity_delta,
      CASE document_type WHEN 'sales_issue' THEN 'sale_consumption' ELSE 'purchase_return_consumption' END,
      NEW.id,actor_id);
  ELSIF NEW.quantity_delta>0 AND document_type='sales_return_receipt'
     AND EXISTS(SELECT 1 FROM tax.input_credit_lots lot
       WHERE lot.org_id=NEW.org_id AND lot.batch_id=NEW.batch_id) THEN
    PERFORM erp_compliance_commands.restore_sales_return_input_credit_lots(
      NEW.org_id,NEW.batch_id,NEW.quantity_delta,NEW.id,actor_id);
  END IF;
  RETURN NEW;
END
$function$;
ALTER FUNCTION erp_compliance_commands.capture_input_credit_stock_movement() OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_compliance_commands.capture_input_credit_stock_movement()
  FROM PUBLIC,erp_app,erp_runtime;
CREATE TRIGGER stock_ledger_input_credit_lineage
  AFTER INSERT ON inventory.stock_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION erp_compliance_commands.capture_input_credit_stock_movement();

CREATE TRIGGER tax_input_credit_lots_audit_trg
  AFTER INSERT OR UPDATE OR DELETE ON tax.input_credit_lots
  FOR EACH ROW EXECUTE FUNCTION erp_plumbing.audit_row_mutation();
CREATE TRIGGER tax_input_credit_applications_audit_trg
  AFTER INSERT OR UPDATE OR DELETE ON tax.input_credit_applications
  FOR EACH ROW EXECUTE FUNCTION erp_plumbing.audit_row_mutation();
CREATE TRIGGER tax_input_credit_reversal_events_audit_trg
  AFTER INSERT OR UPDATE OR DELETE ON tax.input_credit_reversal_events
  FOR EACH ROW EXECUTE FUNCTION erp_plumbing.audit_row_mutation();
CREATE TRIGGER tax_input_credit_reversal_events_outbox_trg
  AFTER INSERT OR UPDATE OF status ON tax.input_credit_reversal_events
  FOR EACH ROW EXECUTE FUNCTION erp_plumbing.enqueue_state_outbox(
    'input_credit_reversal','posted');

RESET ROLE;
