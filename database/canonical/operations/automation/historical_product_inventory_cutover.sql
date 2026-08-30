-- Promote only reviewed, source-code-bound historical products and exactly
-- reconciled opening inventory. Ordinary product setup remains strict; only an
-- immutable historical binding can carry the explicit setup-review exception.

ALTER TABLE catalog.products
  ADD COLUMN setup_review_required boolean NOT NULL DEFAULT false;
ALTER TABLE catalog.products DROP CONSTRAINT products_active_regulatory_ck;
ALTER TABLE catalog.products ADD CONSTRAINT products_active_regulatory_ck CHECK (
  status<>'active' OR setup_review_required
  OR num_nonnulls(drug_schedule,requires_prescription,ndps_regulated,
                   regulatory_ruleset_version)=4
);
ALTER TABLE catalog.products
  ADD CONSTRAINT products_setup_review_required_ck CHECK (
    NOT setup_review_required OR (product_kind='medicine' AND status='active')
  );

CREATE TABLE automation.historical_product_bindings (
  org_id uuid NOT NULL,
  dataset_id varchar(128) NOT NULL,
  source_product_code varchar(128) NOT NULL,
  source_fact_id uuid NOT NULL,
  product_id uuid NOT NULL,
  manufacturer_label text NOT NULL,
  hsn_code varchar(8) NOT NULL,
  gst_rate numeric(9,6) NOT NULL,
  raw_quantity numeric(20,6),
  derived_quantity numeric(20,6) NOT NULL,
  raw_inventory_value numeric(20,2),
  derived_inventory_value numeric(20,2) NOT NULL,
  setup_review_required boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  created_by_membership_id uuid NOT NULL,
  CONSTRAINT historical_product_bindings_pk
    PRIMARY KEY (org_id,dataset_id,source_product_code),
  CONSTRAINT historical_product_bindings_source_uq UNIQUE (org_id,source_fact_id),
  CONSTRAINT historical_product_bindings_product_uq UNIQUE (org_id,product_id),
  CONSTRAINT historical_product_bindings_quantity_ck CHECK (
    derived_quantity>=0 AND derived_quantity=greatest(COALESCE(raw_quantity,0),0)
  ),
  CONSTRAINT historical_product_bindings_value_ck CHECK (
    derived_inventory_value>=0
    AND derived_inventory_value=CASE WHEN COALESCE(raw_quantity,0)>0
      THEN greatest(COALESCE(raw_inventory_value,0),0) ELSE 0 END
  ),
  CONSTRAINT historical_product_bindings_review_ck CHECK (setup_review_required),
  CONSTRAINT historical_product_bindings_fact_fk FOREIGN KEY (org_id,source_fact_id)
    REFERENCES automation.historical_migration_facts(org_id,id) ON DELETE RESTRICT,
  CONSTRAINT historical_product_bindings_product_fk FOREIGN KEY (org_id,product_id)
    REFERENCES catalog.products(org_id,id) ON DELETE RESTRICT,
  CONSTRAINT historical_product_bindings_creator_fk FOREIGN KEY (
    org_id,created_by_membership_id
  ) REFERENCES core.memberships(org_id,id) ON DELETE RESTRICT
);

CREATE TABLE automation.historical_inventory_openings (
  org_id uuid NOT NULL,
  dataset_id varchar(128) NOT NULL,
  source_product_fact_id uuid NOT NULL,
  product_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  location_id uuid NOT NULL,
  inventory_document_id uuid NOT NULL,
  journal_entry_id uuid NOT NULL,
  accounting_event_id uuid NOT NULL,
  quantity numeric(20,6) NOT NULL,
  inventory_value numeric(20,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  created_by_membership_id uuid NOT NULL,
  CONSTRAINT historical_inventory_openings_pk
    PRIMARY KEY (org_id,source_product_fact_id),
  CONSTRAINT historical_inventory_openings_document_uq
    UNIQUE (org_id,inventory_document_id),
  CONSTRAINT historical_inventory_openings_journal_uq UNIQUE (org_id,journal_entry_id),
  CONSTRAINT historical_inventory_openings_event_uq UNIQUE (org_id,accounting_event_id),
  CONSTRAINT historical_inventory_openings_amount_ck CHECK (
    quantity>0 AND inventory_value>0
  ),
  CONSTRAINT historical_inventory_openings_fact_fk FOREIGN KEY (
    org_id,source_product_fact_id
  ) REFERENCES automation.historical_migration_facts(org_id,id) ON DELETE RESTRICT,
  CONSTRAINT historical_inventory_openings_product_fk FOREIGN KEY (org_id,product_id)
    REFERENCES catalog.products(org_id,id) ON DELETE RESTRICT,
  CONSTRAINT historical_inventory_openings_branch_fk FOREIGN KEY (org_id,branch_id)
    REFERENCES core.branches(org_id,id) ON DELETE RESTRICT,
  CONSTRAINT historical_inventory_openings_location_fk FOREIGN KEY (org_id,location_id)
    REFERENCES inventory.locations(org_id,id) ON DELETE RESTRICT,
  CONSTRAINT historical_inventory_openings_document_fk FOREIGN KEY (
    org_id,inventory_document_id
  ) REFERENCES inventory.inventory_documents(org_id,id) ON DELETE RESTRICT,
  CONSTRAINT historical_inventory_openings_journal_fk FOREIGN KEY (org_id,journal_entry_id)
    REFERENCES finance.journal_entries(org_id,id) ON DELETE RESTRICT,
  CONSTRAINT historical_inventory_openings_event_fk FOREIGN KEY (org_id,accounting_event_id)
    REFERENCES finance.accounting_events(org_id,id) ON DELETE RESTRICT,
  CONSTRAINT historical_inventory_openings_creator_fk FOREIGN KEY (
    org_id,created_by_membership_id
  ) REFERENCES core.memberships(org_id,id) ON DELETE RESTRICT
);

CREATE TABLE automation.historical_batch_bindings (
  org_id uuid NOT NULL,
  dataset_id varchar(128) NOT NULL,
  source_batch_fact_id uuid NOT NULL,
  source_product_code varchar(128) NOT NULL,
  batch_id uuid NOT NULL,
  inventory_document_line_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  created_by_membership_id uuid NOT NULL,
  CONSTRAINT historical_batch_bindings_pk PRIMARY KEY (org_id,source_batch_fact_id),
  CONSTRAINT historical_batch_bindings_line_uq
    UNIQUE (org_id,inventory_document_line_id),
  CONSTRAINT historical_batch_bindings_product_fk FOREIGN KEY (
    org_id,dataset_id,source_product_code
  ) REFERENCES automation.historical_product_bindings(
    org_id,dataset_id,source_product_code
  ) ON DELETE RESTRICT,
  CONSTRAINT historical_batch_bindings_fact_fk FOREIGN KEY (org_id,source_batch_fact_id)
    REFERENCES automation.historical_migration_facts(org_id,id) ON DELETE RESTRICT,
  CONSTRAINT historical_batch_bindings_batch_fk FOREIGN KEY (org_id,batch_id)
    REFERENCES inventory.batches(org_id,id) ON DELETE RESTRICT,
  CONSTRAINT historical_batch_bindings_line_fk FOREIGN KEY (
    org_id,inventory_document_line_id
  ) REFERENCES inventory.inventory_document_lines(org_id,id) ON DELETE RESTRICT,
  CONSTRAINT historical_batch_bindings_creator_fk FOREIGN KEY (
    org_id,created_by_membership_id
  ) REFERENCES core.memberships(org_id,id) ON DELETE RESTRICT
);

CREATE INDEX historical_product_bindings_product_idx
  ON automation.historical_product_bindings(org_id,product_id);
CREATE INDEX historical_batch_bindings_batch_idx
  ON automation.historical_batch_bindings(org_id,batch_id);

ALTER TABLE automation.historical_product_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation.historical_product_bindings FORCE ROW LEVEL SECURITY;
ALTER TABLE automation.historical_inventory_openings ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation.historical_inventory_openings FORCE ROW LEVEL SECURITY;
ALTER TABLE automation.historical_batch_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation.historical_batch_bindings FORCE ROW LEVEL SECURITY;
CREATE POLICY historical_product_bindings_owner_scope
  ON automation.historical_product_bindings TO erp_migration_owner
  USING (org_id=erp_security.current_org_id() AND erp_security.current_actor_is_active())
  WITH CHECK (org_id=erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY historical_inventory_openings_owner_scope
  ON automation.historical_inventory_openings TO erp_migration_owner
  USING (org_id=erp_security.current_org_id() AND erp_security.current_actor_is_active())
  WITH CHECK (org_id=erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY historical_batch_bindings_owner_scope
  ON automation.historical_batch_bindings TO erp_migration_owner
  USING (org_id=erp_security.current_org_id() AND erp_security.current_actor_is_active())
  WITH CHECK (org_id=erp_security.current_org_id() AND erp_security.current_actor_is_active());

CREATE TRIGGER historical_product_bindings_audit AFTER INSERT OR UPDATE OR DELETE
  ON automation.historical_product_bindings FOR EACH ROW
  EXECUTE FUNCTION erp_plumbing.audit_row_mutation();
CREATE TRIGGER historical_inventory_openings_audit AFTER INSERT OR UPDATE OR DELETE
  ON automation.historical_inventory_openings FOR EACH ROW
  EXECUTE FUNCTION erp_plumbing.audit_row_mutation();
CREATE TRIGGER historical_batch_bindings_audit AFTER INSERT OR UPDATE OR DELETE
  ON automation.historical_batch_bindings FOR EACH ROW
  EXECUTE FUNCTION erp_plumbing.audit_row_mutation();
CREATE TRIGGER historical_product_bindings_immutable BEFORE UPDATE OR DELETE
  ON automation.historical_product_bindings FOR EACH ROW
  EXECUTE FUNCTION erp_plumbing.reject_row_mutation();
CREATE TRIGGER historical_inventory_openings_immutable BEFORE UPDATE OR DELETE
  ON automation.historical_inventory_openings FOR EACH ROW
  EXECUTE FUNCTION erp_plumbing.reject_row_mutation();
CREATE TRIGGER historical_batch_bindings_immutable BEFORE UPDATE OR DELETE
  ON automation.historical_batch_bindings FOR EACH ROW
  EXECUTE FUNCTION erp_plumbing.reject_row_mutation();

CREATE FUNCTION erp_automation_commands.guard_historical_product_review_marker()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
BEGIN
  IF NEW.setup_review_required
     AND NOT erp_regulatory_commands.scope_active('product_activation',NEW.id)
     AND NOT EXISTS (
       SELECT 1 FROM automation.historical_product_bindings binding
        WHERE binding.org_id=NEW.org_id AND binding.product_id=NEW.id
     ) THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='setup-review marker requires immutable historical product provenance';
  END IF;
  IF OLD.setup_review_required AND NOT NEW.setup_review_required THEN
    IF NEW.status<>'active'
       OR pg_catalog.cardinality(erp_master_commands.product_setup_missing_fields(
         NEW.org_id,NEW.id,erp_core_commands.current_organization_business_date()
       ))<>0 THEN
      RAISE EXCEPTION USING ERRCODE='23514',
        MESSAGE='historical product review marker can clear only after complete ordinary activation';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;
CREATE CONSTRAINT TRIGGER products_historical_review_marker_guard
  AFTER INSERT OR UPDATE OF setup_review_required ON catalog.products
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION erp_automation_commands.guard_historical_product_review_marker();

CREATE OR REPLACE FUNCTION erp_invariants_agent.guard_active_medicine_composition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=''
AS $function$
DECLARE target_org uuid; target_product uuid; product_row catalog.products%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME='products' THEN target_org:=NEW.org_id; target_product:=NEW.id;
  ELSIF TG_OP='DELETE' THEN target_org:=OLD.org_id; target_product:=OLD.product_id;
  ELSE target_org:=NEW.org_id; target_product:=NEW.product_id; END IF;
  SELECT * INTO product_row FROM catalog.products product
   WHERE product.org_id=target_org AND product.id=target_product FOR SHARE;
  IF FOUND AND product_row.product_kind='medicine' AND product_row.status='active'
     AND NOT EXISTS (
       SELECT 1 FROM catalog.product_ingredients composition
        WHERE composition.org_id=target_org AND composition.product_id=target_product
          AND composition.status='active' AND composition.valid_from<=CURRENT_DATE
          AND (composition.valid_until IS NULL OR composition.valid_until>=CURRENT_DATE)
     ) AND NOT (
       product_row.setup_review_required AND (
         erp_regulatory_commands.scope_active('product_activation',target_product)
         OR EXISTS (
           SELECT 1 FROM automation.historical_product_bindings binding
            WHERE binding.org_id=target_org AND binding.product_id=target_product
         )
       )
     ) THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='active medicine requires a current active composition';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END
$function$;

CREATE OR REPLACE FUNCTION erp_invariants_agent.guard_product_state_and_first_use()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=''
AS $function$
BEGIN
  IF OLD.status='draft' AND NEW.status NOT IN ('draft','active','retired')
     OR OLD.status='active' AND NEW.status NOT IN ('active','blocked','retired')
     OR OLD.status='blocked' AND NEW.status NOT IN ('blocked','active','retired')
     OR OLD.status='retired' AND NEW.status IS DISTINCT FROM 'retired' THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='invalid product lifecycle transition';
  END IF;
  IF OLD.status='retired' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='retired product is immutable';
  END IF;
  IF OLD.first_used_at IS NOT NULL
     AND NEW.first_used_at IS DISTINCT FROM OLD.first_used_at THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='product first-use evidence is immutable';
  END IF;
  IF NEW.first_used_at IS NOT NULL AND (
       NEW.first_used_at<NEW.created_at
       OR NEW.first_used_at>pg_catalog.transaction_timestamp()
     ) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='product first-use timestamp is invalid';
  END IF;
  IF OLD.first_used_at IS NOT NULL AND ROW(
       NEW.hsn_code,NEW.manufacturer_party_id,NEW.drug_schedule,
       NEW.ndps_regulated,NEW.regulatory_ruleset_version,
       NEW.schedule_h2_applicable_from,NEW.traceability_product_code,
       NEW.base_uom_code
     ) IS DISTINCT FROM ROW(
       OLD.hsn_code,OLD.manufacturer_party_id,OLD.drug_schedule,
       OLD.ndps_regulated,OLD.regulatory_ruleset_version,
       OLD.schedule_h2_applicable_from,OLD.traceability_product_code,
       OLD.base_uom_code
     ) AND NOT (
       OLD.setup_review_required
       AND erp_regulatory_commands.scope_active('product_activation',OLD.id)
       AND EXISTS (
         SELECT 1 FROM automation.historical_product_bindings binding
          WHERE binding.org_id=OLD.org_id AND binding.product_id=OLD.id
       )
     ) THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='post-first-use regulated product changes require an approved versioned command; none is persisted, so the change is denied';
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION erp_invariants_agent.guard_first_used_product_composition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=''
AS $function$
DECLARE target_org uuid:=CASE WHEN TG_OP='DELETE' THEN OLD.org_id ELSE NEW.org_id END;
  target_product uuid:=CASE WHEN TG_OP='DELETE' THEN OLD.product_id ELSE NEW.product_id END;
  product_row catalog.products%ROWTYPE;
BEGIN
  SELECT * INTO product_row FROM catalog.products product
   WHERE product.org_id=target_org AND product.id=target_product FOR SHARE;
  IF product_row.first_used_at IS NOT NULL AND NOT (
       product_row.setup_review_required
       AND erp_regulatory_commands.scope_active('product_activation',target_product)
       AND EXISTS (
         SELECT 1 FROM automation.historical_product_bindings binding
          WHERE binding.org_id=target_org AND binding.product_id=target_product
       )
     ) THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='post-first-use composition changes require an approved versioned command; none is persisted, so the change is denied';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END
$function$;

CREATE FUNCTION erp_master_commands.complete_historical_product_setup(
  organization_id uuid,
  product_identifier uuid,
  expected_row_version bigint,
  dosage_form_value varchar,
  strength_display_value varchar,
  composition_rows jsonb,
  manufacturer_traceability_code varchar,
  idempotency_key_hash bytea,
  expires_at timestamptz
)
RETURNS TABLE(product_id uuid,new_row_version bigint,idempotency_replayed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
#variable_conflict use_variable
DECLARE actor_id uuid; product catalog.products%ROWTYPE; item jsonb;
  business_date date; sequence_value smallint:=0; composition_count integer;
  classified_count integer; release_count integer; max_schedule integer;
  derived_schedule text; derived_ndps boolean; derived_h2 date;
  ingredient_release core.reference_data_releases%ROWTYPE;
  claim core.idempotency_keys%ROWTYPE; request_document jsonb; response_document jsonb;
BEGIN
  actor_id:=erp_core_commands.assert_context(
    organization_id,'catalog.product.manage',NULL::uuid
  );
  business_date:=erp_core_commands.current_organization_business_date();
  request_document:=pg_catalog.jsonb_build_object(
    'product_id',product_identifier,'expected_row_version',expected_row_version,
    'dosage_form',dosage_form_value,'strength_display',strength_display_value,
    'composition',composition_rows,
    'manufacturer_traceability_code',manufacturer_traceability_code
  );
  claim:=erp_core_commands.claim(
    organization_id,actor_id,'catalog.historical_product.complete_setup',
    idempotency_key_hash,request_document,expires_at
  );
  IF claim.status='succeeded' THEN
    IF claim.resource_type<>'catalog.products' OR claim.resource_id IS DISTINCT FROM product_identifier THEN
      RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='historical product setup key belongs to another resource';
    END IF;
    RETURN QUERY SELECT product_row.id,product_row.row_version,true
      FROM catalog.products product_row
     WHERE product_row.org_id=organization_id AND product_row.id=product_identifier
       AND NOT product_row.setup_review_required;
    RETURN;
  END IF;
  SELECT * INTO product FROM catalog.products candidate
   WHERE candidate.org_id=organization_id AND candidate.id=product_identifier FOR UPDATE;
  IF NOT FOUND OR product.status<>'active' OR NOT product.setup_review_required
     OR product.product_kind<>'medicine'
     OR product.row_version<>expected_row_version
     OR NOT EXISTS (
       SELECT 1 FROM automation.historical_product_bindings binding
        WHERE binding.org_id=organization_id AND binding.product_id=product_identifier
     ) THEN
    RAISE EXCEPTION USING ERRCODE='40001',
      MESSAGE='historical product setup requires the expected active review-bound version';
  END IF;
  IF NULLIF(pg_catalog.btrim(dosage_form_value),'') IS NULL
     OR NULLIF(pg_catalog.btrim(strength_display_value),'') IS NULL
     OR pg_catalog.jsonb_typeof(composition_rows)<>'array'
     OR pg_catalog.jsonb_array_length(composition_rows)=0 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='reviewed dosage, strength and composition are required';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(composition_rows) supplied(value)
     WHERE pg_catalog.jsonb_typeof(value)<>'object'
       OR NOT value ?& ARRAY['ingredient_id','ingredient_role','strength_value','strength_uom_code','basis_quantity','basis_uom_code']
       OR value - ARRAY['ingredient_id','ingredient_role','strength_value','strength_uom_code','basis_quantity','basis_uom_code']<>'{}'::jsonb
       OR value->>'ingredient_id' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
       OR value->>'ingredient_role' NOT IN ('active','excipient')
       OR (value->>'ingredient_role'='active' AND (
         COALESCE(value->>'strength_value','') !~ '^[0-9]+([.][0-9]{1,6})?$'
         OR (value->>'strength_value')::numeric<=0
         OR COALESCE(value->>'basis_quantity','') !~ '^[0-9]+([.][0-9]{1,6})?$'
         OR (value->>'basis_quantity')::numeric<=0
         OR NULLIF(pg_catalog.btrim(value->>'strength_uom_code'),'') IS NULL
         OR NULLIF(pg_catalog.btrim(value->>'basis_uom_code'),'') IS NULL
       ))
  ) OR (
    SELECT count(DISTINCT value->>'ingredient_id')
      FROM pg_catalog.jsonb_array_elements(composition_rows)
  )<>pg_catalog.jsonb_array_length(composition_rows) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='composition must be one exact typed row per ingredient';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(composition_rows) supplied(value)
     WHERE NOT EXISTS (
       SELECT 1 FROM catalog.ingredients ingredient
       JOIN core.reference_data_releases release ON release.id=ingredient.release_id
        WHERE ingredient.id=(value->>'ingredient_id')::uuid
          AND ingredient.status='active' AND release.status='active'
          AND release.dataset_kind='ingredient_classification'
          AND business_date BETWEEN ingredient.effective_from AND COALESCE(ingredient.effective_to,'infinity'::date)
          AND business_date BETWEEN release.effective_from AND COALESCE(release.effective_to,'infinity'::date)
     ) OR (value->>'ingredient_role'='active' AND (
       NOT EXISTS (SELECT 1 FROM catalog.units_of_measure unit WHERE unit.code=value->>'strength_uom_code' AND unit.status='active')
       OR NOT EXISTS (SELECT 1 FROM catalog.units_of_measure unit WHERE unit.code=value->>'basis_uom_code' AND unit.status='active')
     ))
  ) THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='composition references unavailable reviewed data';
  END IF;
  INSERT INTO erp_regulatory_commands.command_scopes VALUES (
    pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'product_activation',product_identifier
  );
  FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(composition_rows) ORDER BY value->>'ingredient_id' LOOP
    sequence_value:=sequence_value+1;
    INSERT INTO catalog.product_ingredients(
      org_id,product_id,ingredient_id,sequence_number,ingredient_role,
      strength_value,strength_uom_code,basis_quantity,basis_uom_code,
      valid_from,status,created_by_membership_id
    ) VALUES (
      organization_id,product_identifier,(item->>'ingredient_id')::uuid,sequence_value,
      item->>'ingredient_role',
      CASE WHEN item->>'ingredient_role'='active' THEN (item->>'strength_value')::numeric END,
      CASE WHEN item->>'ingredient_role'='active' THEN item->>'strength_uom_code' END,
      CASE WHEN item->>'ingredient_role'='active' THEN (item->>'basis_quantity')::numeric END,
      CASE WHEN item->>'ingredient_role'='active' THEN item->>'basis_uom_code' END,
      business_date,'active',actor_id
    );
  END LOOP;
  SELECT count(*),count(ingredient.id),count(DISTINCT ingredient.release_id),
         max(CASE ingredient.drugs_rules_schedule WHEN 'X' THEN 4 WHEN 'H1' THEN 3 WHEN 'H' THEN 2 WHEN 'G' THEN 1 ELSE 0 END),
         bool_or(ingredient.ndps_classification<>'NONE'),min(ingredient.schedule_h2_applicable_from)
    INTO composition_count,classified_count,release_count,max_schedule,derived_ndps,derived_h2
    FROM catalog.product_ingredients composition
    LEFT JOIN catalog.ingredients ingredient ON ingredient.id=composition.ingredient_id
      AND ingredient.status='active'
      AND business_date BETWEEN ingredient.effective_from AND COALESCE(ingredient.effective_to,'infinity'::date)
   WHERE composition.org_id=organization_id AND composition.product_id=product_identifier
     AND composition.status='active'
     AND business_date BETWEEN composition.valid_from AND COALESCE(composition.valid_until,'infinity'::date);
  IF composition_count=0 OR classified_count<>composition_count OR release_count<>1 THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='composition lacks one complete effective reviewed ingredient release';
  END IF;
  SELECT release.* INTO STRICT ingredient_release
    FROM core.reference_data_releases release
    JOIN catalog.product_ingredients composition
      ON composition.org_id=organization_id AND composition.product_id=product_identifier
    JOIN catalog.ingredients ingredient
      ON ingredient.id=composition.ingredient_id AND ingredient.release_id=release.id
   WHERE release.dataset_kind='ingredient_classification' AND release.status='active'
     AND business_date BETWEEN release.effective_from AND COALESCE(release.effective_to,'infinity'::date)
   LIMIT 1 FOR SHARE OF release;
  derived_schedule:=CASE max_schedule WHEN 4 THEN 'X' WHEN 3 THEN 'H1' WHEN 2 THEN 'H' WHEN 1 THEN 'G' ELSE 'NONE' END;
  IF derived_h2 IS NOT NULL AND derived_h2<=business_date
     AND pg_catalog.btrim(COALESCE(manufacturer_traceability_code,''))='' THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='effective Schedule H2 product lacks manufacturer traceability code';
  END IF;
  UPDATE catalog.products target SET
    dosage_form=pg_catalog.btrim(dosage_form_value),
    strength_display=pg_catalog.btrim(strength_display_value),
    drug_schedule=derived_schedule,requires_prescription=derived_schedule IN ('H','H1','X'),
    ndps_regulated=COALESCE(derived_ndps,false),
    regulatory_ruleset_version=ingredient_release.ruleset_version,
    schedule_h2_applicable_from=derived_h2,
    traceability_product_code=CASE WHEN derived_h2 IS NULL THEN NULL
      ELSE NULLIF(pg_catalog.btrim(manufacturer_traceability_code),'') END,
    setup_review_required=false,updated_at=pg_catalog.transaction_timestamp(),
    updated_by_membership_id=actor_id,row_version=target.row_version+1
   WHERE target.org_id=organization_id AND target.id=product_identifier
     AND target.row_version=expected_row_version AND target.setup_review_required;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='historical product changed during reviewed completion'; END IF;
  DELETE FROM erp_regulatory_commands.command_scopes scope
   WHERE scope.backend_pid=pg_catalog.pg_backend_pid()
     AND scope.transaction_id=pg_catalog.txid_current()
     AND scope.scope='product_activation' AND scope.target_id=product_identifier;
  response_document:=pg_catalog.jsonb_build_object(
    'product_id',product_identifier,'row_version',expected_row_version+1
  );
  PERFORM erp_core_commands.finish_claim(
    organization_id,claim.id,'catalog.products',product_identifier,response_document
  );
  RETURN QUERY SELECT product_identifier,expected_row_version+1,false;
END
$function$;

CREATE FUNCTION erp_automation_commands.promote_historical_product_inventory_batch(
  organization_id uuid,
  reviewed_dataset_id varchar,
  opening_location_id uuid,
  batch_size integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
#variable_conflict use_variable
DECLARE actor_id uuid; product_fact automation.historical_migration_facts%ROWTYPE;
  batch_fact automation.historical_migration_facts%ROWTYPE;
  product_identifier uuid; manufacturer_identifier uuid; tax_release_identifier uuid;
  identity_conversion_id uuid; batch_identifier uuid; line_identifier uuid;
  document_identifier uuid; journal_identifier uuid; event_identifier uuid;
  branch_identifier uuid; inventory_account_id uuid; equity_account_id uuid;
  raw_quantity numeric(20,6); derived_quantity numeric(20,6);
  raw_value numeric(20,2); derived_value numeric(20,2);
  batch_quantity numeric(20,6); batch_value numeric(20,2);
  batch_count integer; line_number integer; matching_count integer;
  source_code text; manufacturer_label text; base_uom text; source_hsn text;
  source_gst numeric(9,6); opening_date date; fiscal_year integer;
  product_created integer:=0; zero_clamped integer:=0; openings_posted integer:=0;
  batches_bound integer:=0; products_remaining integer; replayed integer:=0;
  command_time timestamptz:=pg_catalog.transaction_timestamp();
  created_product record; created_manufacturer record;
BEGIN
  actor_id:=erp_core_commands.assert_context(
    organization_id,'core.organization.manage',NULL::uuid
  );
  SET CONSTRAINTS ALL DEFERRED;
  IF NULLIF(pg_catalog.btrim(reviewed_dataset_id),'') IS NULL
     OR batch_size NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='historical product cutover request is invalid';
  END IF;
  SELECT location.branch_id INTO STRICT branch_identifier
    FROM inventory.locations location
   WHERE location.org_id=organization_id AND location.id=opening_location_id
     AND location.status='active' AND location.allows_sale
     AND NOT location.allows_negative_stock FOR SHARE;
  IF NOT erp_security.can_access_branch(branch_identifier) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='opening inventory location is outside branch scope';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    organization_id::text||':historical-product-inventory:'||reviewed_dataset_id,730073
  ));
  inventory_account_id:=erp_commercial_commands.resolve_role_account(
    organization_id,branch_identifier,'inventory_asset','asset','INR',false
  );
  SELECT account.id INTO equity_account_id
    FROM core.settings setting JOIN finance.accounts account
      ON account.org_id=setting.org_id AND account.id=setting.value_text::uuid
   WHERE setting.org_id=organization_id AND setting.namespace='finance.account_roles'
     AND setting.key='opening_balance_equity' AND setting.status='active'
     AND setting.branch_id IS NULL AND account.status='active' AND account.account_type='equity';
  IF equity_account_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='opening balance equity account role is unavailable';
  END IF;

  FOR product_fact IN
    SELECT fact.* FROM automation.historical_migration_facts fact
    LEFT JOIN automation.historical_product_bindings binding
      ON binding.org_id=fact.org_id AND binding.source_fact_id=fact.id
   WHERE fact.org_id=organization_id AND fact.dataset_id=reviewed_dataset_id
     AND fact.source_kind='product' AND fact.selection_state='reviewed'
     AND binding.source_fact_id IS NULL
   ORDER BY fact.id LIMIT batch_size
  LOOP
    source_code:=COALESCE(NULLIF(pg_catalog.btrim(product_fact.product_code),''),
      NULLIF(pg_catalog.btrim(product_fact.payload->>'source_product_code'),''));
    manufacturer_label:=NULLIF(pg_catalog.btrim(product_fact.payload->>'source_company'),'');
    base_uom:=NULLIF(pg_catalog.btrim(product_fact.payload->>'base_uom_code'),'');
    source_hsn:=NULLIF(pg_catalog.btrim(product_fact.payload->>'hsn_code'),'');
    source_gst:=NULLIF(product_fact.payload->>'gst_rate','')::numeric;
    raw_quantity:=COALESCE(product_fact.quantity,0);
    raw_value:=COALESCE(product_fact.inventory_value,0);
    derived_quantity:=greatest(raw_quantity,0);
    derived_value:=CASE WHEN raw_quantity>0 THEN greatest(raw_value,0) ELSE 0 END;
    opening_date:=product_fact.event_date;
    IF source_code IS NULL OR NULLIF(pg_catalog.btrim(product_fact.product_name),'') IS NULL
       OR manufacturer_label IS NULL OR base_uom IS NULL OR source_hsn IS NULL
       OR source_hsn !~ '^[0-9]{4,8}$' OR source_gst IS NULL OR source_gst<0
       OR opening_date IS NULL
       OR COALESCE(product_fact.payload->>'product_kind','medicine')<>'medicine'
       OR COALESCE((product_fact.payload->>'hsn_gst_candidate_unique')::boolean,false) IS DISTINCT FROM true
       OR (raw_quantity>0 AND COALESCE(product_fact.payload->>'batch_reconciliation_status','')<>'exact') THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='reviewed historical product fact is incomplete or ambiguous';
    END IF;
    PERFORM 1 FROM catalog.units_of_measure unit
     WHERE unit.code=base_uom AND unit.status='active' FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='historical product base UOM is unavailable';
    END IF;
    SELECT count(*),(min(tax_version.release_id::text))::uuid
      INTO matching_count,tax_release_identifier
      FROM tax.tax_code_versions tax_version
      JOIN core.reference_data_releases release ON release.id=tax_version.release_id
     WHERE tax_version.code=source_hsn AND tax_version.code_kind='hsn'
       AND tax_version.default_supply_type='goods' AND tax_version.status='active'
       AND release.dataset_kind='hsn_sac_tax' AND release.status='active'
       AND opening_date BETWEEN tax_version.effective_from AND COALESCE(tax_version.effective_to,'infinity'::date)
       AND opening_date BETWEEN release.effective_from AND COALESCE(release.effective_to,'infinity'::date)
       AND tax_version.igst_rate=source_gst;
    IF matching_count<>1 THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='historical HSN and GST candidate does not resolve exactly once';
    END IF;
    SELECT count(*),(min(party.id::text))::uuid
      INTO matching_count,manufacturer_identifier
      FROM catalog.manufacturers manufacturer JOIN parties.parties party
        ON party.org_id=manufacturer.org_id AND party.id=manufacturer.party_id
     WHERE manufacturer.org_id=organization_id AND manufacturer.status='active'
       AND party.status='active'
       AND pg_catalog.lower(pg_catalog.btrim(party.legal_name))=
           pg_catalog.lower(manufacturer_label);
    IF matching_count>1 THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='historical manufacturer label is ambiguous';
    ELSIF matching_count=0 THEN
      SELECT * INTO STRICT created_manufacturer
        FROM erp_master_commands.create_product_manufacturer(
          organization_id,manufacturer_label,
          extensions.digest(pg_catalog.convert_to(
            reviewed_dataset_id||':manufacturer:'||pg_catalog.lower(manufacturer_label),'UTF8'
          ),'sha256'),command_time+interval '1 hour'
        );
      manufacturer_identifier:=created_manufacturer.manufacturer_party_id;
    END IF;
    SELECT * INTO STRICT created_product
      FROM erp_master_commands.create_product_draft(
        organization_id,product_fact.product_name,NULL,'medicine',
        extensions.digest(pg_catalog.convert_to(
          reviewed_dataset_id||':product:'||source_code,'UTF8'
        ),'sha256'),command_time+interval '1 hour'
      );
    product_identifier:=created_product.product_id;
    identity_conversion_id:=pg_catalog.gen_random_uuid();
    INSERT INTO catalog.uom_conversions(
      org_id,id,product_id,from_uom_code,to_uom_code,multiplier,valid_from,status,
      created_by_membership_id
    ) VALUES (
      organization_id,identity_conversion_id,product_identifier,base_uom,base_uom,1,
      opening_date,'active',actor_id
    );
    INSERT INTO erp_regulatory_commands.command_scopes VALUES (
      pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'product_activation',
      product_identifier
    );
    UPDATE catalog.products product SET
      manufacturer_party_id=manufacturer_identifier,base_uom_code=base_uom,
      hsn_code=source_hsn,hsn_release_id=tax_release_identifier,
      setup_review_required=true,status='active',updated_at=command_time,
      updated_by_membership_id=actor_id,row_version=row_version+1
     WHERE product.org_id=organization_id AND product.id=product_identifier
       AND product.status='draft';
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='historical product draft changed before binding';
    END IF;
    INSERT INTO automation.historical_product_bindings(
      org_id,dataset_id,source_product_code,source_fact_id,product_id,
      manufacturer_label,hsn_code,gst_rate,raw_quantity,derived_quantity,
      raw_inventory_value,derived_inventory_value,setup_review_required,
      created_by_membership_id
    ) VALUES (
      organization_id,reviewed_dataset_id,source_code,product_fact.id,product_identifier,
      manufacturer_label,source_hsn,source_gst,raw_quantity,derived_quantity,
      raw_value,derived_value,true,actor_id
    );
    IF NOT EXISTS (
      SELECT 1 FROM automation.historical_product_bindings binding
       WHERE binding.org_id=organization_id AND binding.product_id=product_identifier
         AND binding.source_fact_id=product_fact.id
    ) THEN
      RAISE EXCEPTION USING ERRCODE='23514',
        MESSAGE='historical product activation lacks immutable source binding';
    END IF;
    DELETE FROM erp_regulatory_commands.command_scopes scope
     WHERE scope.backend_pid=pg_catalog.pg_backend_pid()
       AND scope.transaction_id=pg_catalog.txid_current()
       AND scope.scope='product_activation' AND scope.target_id=product_identifier;
    product_created:=product_created+1;
    IF derived_quantity=0 THEN
      IF EXISTS (
        SELECT 1 FROM automation.historical_migration_facts fact
         WHERE fact.org_id=organization_id AND fact.dataset_id=reviewed_dataset_id
           AND fact.source_kind='batch' AND fact.product_code=source_code
           AND fact.selection_state='reviewed' AND COALESCE(fact.quantity,0)>0
      ) THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='zero opening product owns reviewed positive batches'; END IF;
      IF raw_quantity<0 THEN zero_clamped:=zero_clamped+1; END IF;
      CONTINUE;
    END IF;
    IF derived_value<=0 THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='positive historical stock requires positive exact value';
    END IF;
    SELECT count(*),COALESCE(sum(fact.quantity),0),COALESCE(sum(fact.inventory_value),0)
      INTO batch_count,batch_quantity,batch_value
      FROM automation.historical_migration_facts fact
     WHERE fact.org_id=organization_id AND fact.dataset_id=reviewed_dataset_id
       AND fact.source_kind='batch' AND fact.product_code=source_code
       AND fact.selection_state='reviewed';
    IF batch_count=0 OR batch_quantity IS DISTINCT FROM derived_quantity
       OR batch_value IS DISTINCT FROM derived_value THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='historical batch quantity or value does not reconcile exact product opening';
    END IF;
    IF EXISTS (
      SELECT 1 FROM automation.historical_migration_facts fact
       WHERE fact.org_id=organization_id AND fact.dataset_id=reviewed_dataset_id
         AND fact.source_kind='batch' AND fact.product_code=source_code
         AND fact.selection_state='reviewed'
         AND (COALESCE(fact.quantity,0)<=0 OR COALESCE(fact.inventory_value,0)<=0
           OR fact.event_date IS NULL OR fact.event_date<=opening_date
           OR NULLIF(pg_catalog.btrim(fact.batch_number),'') IS NULL
           OR NULLIF(fact.payload->>'mrp','')::numeric<=0
           OR NULLIF(fact.payload->>'unit_cost','')::numeric<0
           OR fact.payload->>'base_uom_code' IS DISTINCT FROM base_uom
           OR fact.payload->>'mrp_uom_code' IS DISTINCT FROM base_uom
           OR NULLIF(fact.payload->>'mrp_uom_multiplier','')::numeric IS DISTINCT FROM 1
           OR pg_catalog.round(fact.quantity*NULLIF(fact.payload->>'unit_cost','')::numeric,2)
                IS DISTINCT FROM fact.inventory_value)
    ) OR EXISTS (
      SELECT 1 FROM automation.historical_migration_facts fact
       WHERE fact.org_id=organization_id AND fact.dataset_id=reviewed_dataset_id
         AND fact.source_kind='batch' AND fact.product_code=source_code
         AND fact.selection_state='reviewed'
       GROUP BY pg_catalog.lower(pg_catalog.btrim(fact.batch_number))
      HAVING count(DISTINCT ROW(fact.event_date,fact.payload->>'mrp',
        fact.payload->>'base_uom_code',fact.payload->>'mrp_uom_code',
        fact.payload->>'mrp_uom_multiplier'))<>1
    ) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='historical batch is expired, incomplete, negative, or conflicting';
    END IF;
    document_identifier:=pg_catalog.gen_random_uuid();
    journal_identifier:=pg_catalog.gen_random_uuid();
    event_identifier:=pg_catalog.gen_random_uuid();
    fiscal_year:=CASE WHEN pg_catalog.date_part('month',opening_date)>=4
      THEN pg_catalog.date_part('year',opening_date)::integer
      ELSE pg_catalog.date_part('year',opening_date)::integer-1 END;
    INSERT INTO inventory.inventory_documents(
      org_id,id,branch_id,physical_movement_required,document_type,document_number,
      fiscal_year,document_date,status,reason_code,currency_code,costing_method_snapshot,
      total_abs_base_quantity,total_value,approved_at,approved_by_membership_id,
      created_by_membership_id,updated_by_membership_id
    ) VALUES (
      organization_id,document_identifier,branch_identifier,false,'opening_receipt',
      pg_catalog.left('MIG-OPEN-'||pg_catalog.replace(product_fact.id::text,'-',''),64),
      fiscal_year,opening_date,'approved','historical_marg_opening','INR',
      'moving_weighted_average',derived_quantity,derived_value,command_time,actor_id,
      actor_id,actor_id
    );
    line_number:=0;
    FOR batch_fact IN
      SELECT fact.* FROM automation.historical_migration_facts fact
       WHERE fact.org_id=organization_id AND fact.dataset_id=reviewed_dataset_id
         AND fact.source_kind='batch' AND fact.product_code=source_code
         AND fact.selection_state='reviewed'
       ORDER BY pg_catalog.lower(pg_catalog.btrim(fact.batch_number)),fact.id
    LOOP
      SELECT binding.batch_id INTO batch_identifier
        FROM automation.historical_batch_bindings binding
        JOIN automation.historical_migration_facts prior
          ON prior.org_id=binding.org_id AND prior.id=binding.source_batch_fact_id
       WHERE binding.org_id=organization_id AND binding.dataset_id=reviewed_dataset_id
         AND binding.source_product_code=source_code
         AND pg_catalog.lower(pg_catalog.btrim(prior.batch_number))=
             pg_catalog.lower(pg_catalog.btrim(batch_fact.batch_number))
       LIMIT 1;
      IF batch_identifier IS NULL THEN
        batch_identifier:=pg_catalog.gen_random_uuid();
        INSERT INTO inventory.batches(
          org_id,id,product_id,batch_number,lot_kind,manufactured_on,expires_on,mrp,
          mrp_uom_conversion_id,status,released_at,released_by_membership_id,
          created_by_membership_id,updated_by_membership_id
        ) VALUES (
          organization_id,batch_identifier,product_identifier,
          pg_catalog.btrim(batch_fact.batch_number),'manufacturer_batch',
          NULLIF(batch_fact.payload->>'manufactured_on','')::date,batch_fact.event_date,
          (batch_fact.payload->>'mrp')::numeric,identity_conversion_id,'quarantined',NULL,
          NULL,actor_id,actor_id
        );
      END IF;
      line_number:=line_number+1;
      line_identifier:=pg_catalog.gen_random_uuid();
      INSERT INTO inventory.inventory_document_lines(
        org_id,id,inventory_document_id,line_number,movement_kind,product_id,batch_id,
        uom_code,entered_quantity,base_quantity,to_location_id,unit_cost,extended_cost,
        created_by_membership_id
      ) VALUES (
        organization_id,line_identifier,document_identifier,line_number,'receipt',
        product_identifier,batch_identifier,base_uom,batch_fact.quantity,batch_fact.quantity,
        opening_location_id,(batch_fact.payload->>'unit_cost')::numeric,
        batch_fact.inventory_value,actor_id
      );
      INSERT INTO automation.historical_batch_bindings(
        org_id,dataset_id,source_batch_fact_id,source_product_code,batch_id,
        inventory_document_line_id,created_by_membership_id
      ) VALUES (
        organization_id,reviewed_dataset_id,batch_fact.id,source_code,batch_identifier,
        line_identifier,actor_id
      );
      batches_bound:=batches_bound+1;
    END LOOP;
    PERFORM erp_trade_commands.post_locked_document(
      organization_id,document_identifier,actor_id
    );
    INSERT INTO erp_trade_commands.command_scopes(
      backend_pid,transaction_id,scope,org_id,entity_id
    ) SELECT pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),
      'goods_receipt_batch_release',binding.org_id,binding.batch_id
      FROM automation.historical_batch_bindings binding
     WHERE binding.org_id=organization_id AND binding.dataset_id=reviewed_dataset_id
       AND binding.source_product_code=source_code
    ON CONFLICT DO NOTHING;
    UPDATE inventory.batches batch SET
      status='released',released_at=command_time,released_by_membership_id=actor_id,
      updated_at=command_time,updated_by_membership_id=actor_id,
      row_version=batch.row_version+1
      FROM erp_trade_commands.command_scopes scope
     WHERE scope.backend_pid=pg_catalog.pg_backend_pid()
       AND scope.transaction_id=pg_catalog.txid_current()
       AND scope.scope='goods_receipt_batch_release'
       AND scope.org_id=organization_id
       AND batch.org_id=scope.org_id AND batch.id=scope.entity_id
       AND batch.status='quarantined';
    DELETE FROM erp_trade_commands.command_scopes scope
     WHERE scope.backend_pid=pg_catalog.pg_backend_pid()
       AND scope.transaction_id=pg_catalog.txid_current()
       AND scope.scope='goods_receipt_batch_release'
       AND scope.org_id=organization_id;
    INSERT INTO finance.journal_entries(
      org_id,id,journal_number,posting_date,description,transaction_currency,
      functional_currency,fx_rate,transaction_debit_total,transaction_credit_total,
      functional_debit_total,functional_credit_total,status,
      created_by_membership_id,updated_by_membership_id
    ) VALUES (
      organization_id,journal_identifier,
      pg_catalog.left('MIG-INV-'||pg_catalog.replace(product_fact.id::text,'-',''),64),
      opening_date,'Historical MARG opening inventory '||source_code,'INR','INR',1,
      derived_value,derived_value,derived_value,derived_value,'draft',actor_id,actor_id
    );
    INSERT INTO finance.journal_lines(
      org_id,id,journal_entry_id,line_number,account_id,branch_id,description,
      transaction_debit,transaction_credit,functional_debit,functional_credit,
      created_by_membership_id
    ) VALUES
    (organization_id,pg_catalog.gen_random_uuid(),journal_identifier,1,inventory_account_id,
      branch_identifier,'Historical opening inventory '||source_code,
      derived_value,0,derived_value,0,actor_id),
    (organization_id,pg_catalog.gen_random_uuid(),journal_identifier,2,equity_account_id,
      branch_identifier,'Historical opening inventory offset '||source_code,
      0,derived_value,0,derived_value,actor_id);
    UPDATE finance.journal_entries SET status='posted',posted_at=command_time,
      posted_by_membership_id=actor_id,updated_at=command_time,
      updated_by_membership_id=actor_id,row_version=row_version+1
     WHERE org_id=organization_id AND id=journal_identifier AND status='draft';
    INSERT INTO finance.accounting_events(
      org_id,id,event_type,inventory_document_id,journal_entry_id,occurred_at,
      source_posted_at,created_by_membership_id
    ) SELECT organization_id,event_identifier,'inventory_valuation',document_identifier,
      journal_identifier,command_time,document.posted_at,actor_id
      FROM inventory.inventory_documents document
     WHERE document.org_id=organization_id AND document.id=document_identifier
       AND document.status='posted';
    INSERT INTO automation.historical_inventory_openings(
      org_id,dataset_id,source_product_fact_id,product_id,branch_id,location_id,
      inventory_document_id,journal_entry_id,accounting_event_id,quantity,
      inventory_value,created_by_membership_id
    ) VALUES (
      organization_id,reviewed_dataset_id,product_fact.id,product_identifier,
      branch_identifier,opening_location_id,document_identifier,journal_identifier,
      event_identifier,derived_quantity,derived_value,actor_id
    );
    openings_posted:=openings_posted+1;
  END LOOP;
  SELECT count(*) INTO products_remaining
    FROM automation.historical_migration_facts fact
    LEFT JOIN automation.historical_product_bindings binding
      ON binding.org_id=fact.org_id AND binding.source_fact_id=fact.id
   WHERE fact.org_id=organization_id AND fact.dataset_id=reviewed_dataset_id
     AND fact.source_kind='product' AND fact.selection_state='reviewed'
     AND binding.source_fact_id IS NULL;
  RETURN pg_catalog.jsonb_build_object(
    'products_created',product_created,'products_replayed',replayed,
    'products_remaining',products_remaining,'negative_products_clamped',zero_clamped,
    'batches_bound',batches_bound,'openings_posted',openings_posted,
    'complete',products_remaining=0
  );
END
$function$;

CREATE FUNCTION erp_automation_reads.historical_product_inventory_cutover_status(
  organization_id uuid,
  reviewed_dataset_id varchar
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE result jsonb;
BEGIN
  PERFORM erp_core_commands.assert_context(organization_id,NULL,NULL::uuid);
  SELECT pg_catalog.jsonb_build_object(
    'source_products',count(*) FILTER (
      WHERE fact.source_kind='product' AND fact.selection_state='reviewed'
    ),
    'quarantined_products',count(*) FILTER (
      WHERE fact.source_kind='product' AND fact.selection_state='quarantined'
    ),
    'bound_products',(SELECT count(*) FROM automation.historical_product_bindings binding
      WHERE binding.org_id=organization_id AND binding.dataset_id=reviewed_dataset_id),
    'setup_review_required',(SELECT count(*) FROM automation.historical_product_bindings binding
      JOIN catalog.products product ON product.org_id=binding.org_id AND product.id=binding.product_id
      WHERE binding.org_id=organization_id AND binding.dataset_id=reviewed_dataset_id
        AND product.setup_review_required),
    'negative_products_clamped',(SELECT count(*) FROM automation.historical_product_bindings binding
      WHERE binding.org_id=organization_id AND binding.dataset_id=reviewed_dataset_id
        AND binding.raw_quantity<0 AND binding.derived_quantity=0),
    'source_batches',count(*) FILTER (
      WHERE fact.source_kind='batch' AND fact.selection_state='reviewed'
    ),
    'quarantined_batches',count(*) FILTER (
      WHERE fact.source_kind='batch' AND fact.selection_state='quarantined'
    ),
    'bound_batches',(SELECT count(*) FROM automation.historical_batch_bindings binding
      WHERE binding.org_id=organization_id AND binding.dataset_id=reviewed_dataset_id),
    'posted_openings',(SELECT count(*) FROM automation.historical_inventory_openings opening
      WHERE opening.org_id=organization_id AND opening.dataset_id=reviewed_dataset_id),
    'opening_quantity',COALESCE((SELECT sum(opening.quantity)
      FROM automation.historical_inventory_openings opening
      WHERE opening.org_id=organization_id AND opening.dataset_id=reviewed_dataset_id),0)::text,
    'opening_value',COALESCE((SELECT sum(opening.inventory_value)
      FROM automation.historical_inventory_openings opening
      WHERE opening.org_id=organization_id AND opening.dataset_id=reviewed_dataset_id),0)::text,
    'ledger_quantity',COALESCE((SELECT sum(entry.quantity_delta)
      FROM automation.historical_inventory_openings opening
      JOIN inventory.stock_ledger_entries entry
        ON entry.org_id=opening.org_id AND entry.inventory_document_id=opening.inventory_document_id
      WHERE opening.org_id=organization_id AND opening.dataset_id=reviewed_dataset_id),0)::text,
    'ledger_value',COALESCE((SELECT sum(entry.value_delta)
      FROM automation.historical_inventory_openings opening
      JOIN inventory.stock_ledger_entries entry
        ON entry.org_id=opening.org_id AND entry.inventory_document_id=opening.inventory_document_id
      WHERE opening.org_id=organization_id AND opening.dataset_id=reviewed_dataset_id),0)::text
  ) INTO result
  FROM automation.historical_migration_facts fact
  WHERE fact.org_id=organization_id AND fact.dataset_id=reviewed_dataset_id;
  RETURN result;
END
$function$;

CREATE FUNCTION erp_automation_reads.is_historical_product(
  organization_id uuid,
  product_identifier uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
BEGIN
  PERFORM erp_core_commands.assert_context(organization_id,NULL,NULL::uuid);
  RETURN EXISTS (
    SELECT 1 FROM automation.historical_product_bindings binding
     WHERE binding.org_id=organization_id AND binding.product_id=product_identifier
  );
END
$function$;

ALTER TABLE automation.historical_product_bindings OWNER TO erp_migration_owner;
ALTER TABLE automation.historical_inventory_openings OWNER TO erp_migration_owner;
ALTER TABLE automation.historical_batch_bindings OWNER TO erp_migration_owner;
ALTER FUNCTION erp_automation_commands.guard_historical_product_review_marker()
  OWNER TO erp_migration_owner;
ALTER FUNCTION erp_master_commands.complete_historical_product_setup(
  uuid,uuid,bigint,varchar,varchar,jsonb,varchar,bytea,timestamptz
) OWNER TO erp_migration_owner;
ALTER FUNCTION erp_automation_commands.promote_historical_product_inventory_batch(
  uuid,varchar,uuid,integer
) OWNER TO erp_migration_owner;
ALTER FUNCTION erp_automation_reads.historical_product_inventory_cutover_status(
  uuid,varchar
) OWNER TO erp_migration_owner;
ALTER FUNCTION erp_automation_reads.is_historical_product(uuid,uuid)
  OWNER TO erp_migration_owner;
REVOKE ALL ON TABLE automation.historical_product_bindings,
  automation.historical_inventory_openings,
  automation.historical_batch_bindings FROM PUBLIC,erp_app,erp_runtime,erp_calculator;
REVOKE ALL ON FUNCTION erp_automation_commands.guard_historical_product_review_marker()
  FROM PUBLIC,erp_app,erp_runtime,erp_calculator;
REVOKE ALL ON FUNCTION erp_master_commands.complete_historical_product_setup(
  uuid,uuid,bigint,varchar,varchar,jsonb,varchar,bytea,timestamptz
) FROM PUBLIC,erp_app,erp_runtime,erp_calculator;
REVOKE ALL ON FUNCTION erp_automation_commands.promote_historical_product_inventory_batch(
  uuid,varchar,uuid,integer
) FROM PUBLIC,erp_app,erp_runtime,erp_calculator;
REVOKE ALL ON FUNCTION erp_automation_reads.historical_product_inventory_cutover_status(
  uuid,varchar
) FROM PUBLIC,erp_app,erp_runtime,erp_calculator;
REVOKE ALL ON FUNCTION erp_automation_reads.is_historical_product(uuid,uuid)
  FROM PUBLIC,erp_app,erp_runtime,erp_calculator;
GRANT EXECUTE ON FUNCTION erp_automation_commands.promote_historical_product_inventory_batch(
  uuid,varchar,uuid,integer
) TO erp_runtime;
GRANT EXECUTE ON FUNCTION erp_automation_reads.historical_product_inventory_cutover_status(
  uuid,varchar
) TO erp_runtime;
GRANT EXECUTE ON FUNCTION erp_automation_reads.is_historical_product(uuid,uuid)
  TO erp_runtime;
GRANT EXECUTE ON FUNCTION erp_master_commands.complete_historical_product_setup(
  uuid,uuid,bigint,varchar,varchar,jsonb,varchar,bytea,timestamptz
) TO erp_runtime;
