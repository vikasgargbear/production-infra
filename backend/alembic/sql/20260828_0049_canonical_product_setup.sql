SET LOCAL ROLE erp_migration_owner;

-- Countable pharmacy packaging units are controlled global vocabulary.  They
-- carry no tax, regulatory, pricing or stock fact.
INSERT INTO catalog.units_of_measure(code,name,symbol,dimension,decimal_places,status)
VALUES
  ('BX','Box','box','count',3,'active'),
  ('STRIP','Strip','strip','count',3,'active'),
  ('BTL','Bottle','btl','count',3,'active'),
  ('VIAL','Vial','vial','count',3,'active'),
  ('AMP','Ampoule','amp','count',3,'active'),
  ('TUBE','Tube','tube','count',3,'active'),
  ('SACH','Sachet','sachet','count',3,'active'),
  ('JAR','Jar','jar','count',3,'active');

-- Prefix and full-text paths keep tenant product search index-backed.  Exact
-- code/GTIN matches remain the highest-ranked application results.
CREATE INDEX products_search_name_lower_idx
  ON catalog.products(org_id,(pg_catalog.lower(name)) text_pattern_ops,id)
  WHERE status IN ('draft','active','blocked');
CREATE INDEX products_search_generic_lower_idx
  ON catalog.products(org_id,(pg_catalog.lower(generic_name)) text_pattern_ops,id)
  WHERE generic_name IS NOT NULL AND status IN ('draft','active','blocked');
CREATE INDEX products_search_document_idx
  ON catalog.products USING gin (
    pg_catalog.to_tsvector(
      'simple'::pg_catalog.regconfig,
      pg_catalog.coalesce(sku,'')||' '||pg_catalog.coalesce(name,'')||' '||
      pg_catalog.coalesce(generic_name,'')||' '||pg_catalog.coalesce(gtin,'')
    )
  ) WHERE status IN ('draft','active','blocked');
CREATE INDEX parties_search_name_lower_idx
  ON parties.parties(org_id,(pg_catalog.lower(legal_name)) text_pattern_ops,id)
  WHERE status='active';
CREATE INDEX parties_search_document_idx
  ON parties.parties USING gin (
    pg_catalog.to_tsvector(
      'simple'::pg_catalog.regconfig,
      pg_catalog.coalesce(legal_name,'')||' '||pg_catalog.coalesce(trade_name,'')
    )
  ) WHERE status IN ('active','blocked');
CREATE INDEX tax_code_versions_search_description_idx
  ON tax.tax_code_versions USING gin (
    pg_catalog.to_tsvector('simple'::pg_catalog.regconfig,description)
  ) WHERE status='active' AND code_kind='hsn' AND default_supply_type='goods';

CREATE FUNCTION erp_master_commands.product_setup_missing_fields(
  organization_id uuid,
  product_identifier uuid,
  effective_on date
)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path=''
AS $function$
#variable_conflict use_variable
DECLARE product catalog.products%ROWTYPE; missing text[]:='{}'::text[];
BEGIN
  PERFORM erp_core_commands.assert_context(
    organization_id,'catalog.product.manage',NULL::uuid
  );
  IF effective_on IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='product setup readiness requires an effective date';
  END IF;
  SELECT * INTO product FROM catalog.products candidate
   WHERE candidate.org_id=organization_id AND candidate.id=product_identifier;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='product draft not found';
  END IF;
  IF product.manufacturer_party_id IS NULL OR NOT EXISTS(
    SELECT 1 FROM parties.parties manufacturer
     WHERE manufacturer.org_id=organization_id
       AND manufacturer.id=product.manufacturer_party_id
       AND manufacturer.status='active'
  ) THEN missing:=pg_catalog.array_append(missing,'manufacturer_party_id'); END IF;
  IF NOT EXISTS(
    SELECT 1 FROM catalog.uom_conversions conversion
     WHERE conversion.org_id=organization_id AND conversion.product_id=product_identifier
       AND conversion.from_uom_code=product.base_uom_code
       AND conversion.to_uom_code=product.base_uom_code
       AND conversion.multiplier=1 AND conversion.status='active'
       AND effective_on BETWEEN conversion.valid_from
                            AND COALESCE(conversion.valid_until,'infinity'::date)
  ) THEN missing:=pg_catalog.array_append(missing,'base_uom_code'); END IF;
  IF NOT EXISTS(
    SELECT 1 FROM tax.tax_code_versions tax_version
    JOIN core.reference_data_releases release ON release.id=tax_version.release_id
     WHERE tax_version.code=product.hsn_code AND tax_version.code_kind='hsn'
       AND tax_version.default_supply_type='goods' AND tax_version.status='active'
       AND release.dataset_kind='hsn_sac_tax' AND release.status='active'
       AND effective_on BETWEEN tax_version.effective_from
                            AND COALESCE(tax_version.effective_to,'infinity'::date)
       AND effective_on BETWEEN release.effective_from
                            AND COALESCE(release.effective_to,'infinity'::date)
  ) THEN missing:=pg_catalog.array_append(missing,'hsn_code'); END IF;
  IF product.product_kind='medicine' THEN
    IF NULLIF(pg_catalog.btrim(product.dosage_form),'') IS NULL THEN
      missing:=pg_catalog.array_append(missing,'dosage_form');
    END IF;
    IF NULLIF(pg_catalog.btrim(product.strength_display),'') IS NULL THEN
      missing:=pg_catalog.array_append(missing,'strength_display');
    END IF;
    IF NOT EXISTS(
      SELECT 1
        FROM catalog.product_ingredients composition
        JOIN catalog.ingredients ingredient ON ingredient.id=composition.ingredient_id
        JOIN core.reference_data_releases release ON release.id=ingredient.release_id
       WHERE composition.org_id=organization_id
         AND composition.product_id=product_identifier
         AND composition.status='active'
         AND effective_on BETWEEN composition.valid_from
                              AND COALESCE(composition.valid_until,'infinity'::date)
         AND ingredient.status='active'
         AND effective_on BETWEEN ingredient.effective_from
                              AND COALESCE(ingredient.effective_to,'infinity'::date)
         AND release.dataset_kind='ingredient_classification'
         AND release.status='active'
         AND effective_on BETWEEN release.effective_from
                              AND COALESCE(release.effective_to,'infinity'::date)
    ) THEN missing:=pg_catalog.array_append(missing,'ingredients'); END IF;
  END IF;
  RETURN missing;
END
$function$;

CREATE FUNCTION erp_master_commands.configure_product_draft(
  organization_id uuid,
  product_identifier uuid,
  expected_row_version bigint,
  category_identifier uuid,
  manufacturer_identifier uuid,
  base_uom varchar,
  dosage_form_value varchar,
  strength_display_value varchar,
  hsn_code_value varchar,
  cold_chain_value boolean,
  minimum_storage_value numeric,
  maximum_storage_value numeric,
  shelf_life_days_value integer,
  gtin_value varchar,
  pack_conversions jsonb,
  composition_rows jsonb
)
RETURNS TABLE(product_id uuid,product_code varchar,product_name text,new_row_version bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
#variable_conflict use_variable
DECLARE actor_id uuid; current_product catalog.products%ROWTYPE;
        business_date date; item jsonb; sequence_value smallint:=0;
        normalized_gtin varchar; release_count integer;
BEGIN
  actor_id:=erp_core_commands.assert_context(
    organization_id,'catalog.product.manage',NULL::uuid
  );
  business_date:=erp_core_commands.current_organization_business_date();
  IF product_identifier IS NULL OR expected_row_version IS NULL OR expected_row_version<=0
     OR manufacturer_identifier IS NULL OR NULLIF(pg_catalog.btrim(base_uom),'') IS NULL
     OR NULLIF(pg_catalog.btrim(hsn_code_value),'') IS NULL
     OR cold_chain_value IS NULL
     OR pg_catalog.jsonb_typeof(pack_conversions)<>'array'
     OR pg_catalog.jsonb_typeof(composition_rows)<>'array' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='product setup request is incomplete';
  END IF;
  SELECT * INTO current_product FROM catalog.products product
   WHERE product.org_id=organization_id AND product.id=product_identifier FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='product draft not found';
  END IF;
  IF current_product.status<>'draft' OR current_product.first_used_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='only an unused product draft can be configured';
  END IF;
  IF current_product.row_version<>expected_row_version THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='product draft row version changed';
  END IF;
  IF category_identifier IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM catalog.categories category
     WHERE category.org_id=organization_id AND category.id=category_identifier
       AND category.status='active'
  ) THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='selected product category is unavailable'; END IF;
  PERFORM 1 FROM parties.parties manufacturer
   WHERE manufacturer.org_id=organization_id AND manufacturer.id=manufacturer_identifier
     AND manufacturer.status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='selected manufacturer is unavailable'; END IF;
  PERFORM 1 FROM catalog.units_of_measure unit
   WHERE unit.code=pg_catalog.btrim(base_uom) AND unit.status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='selected base unit is unavailable'; END IF;
  PERFORM 1 FROM tax.tax_code_versions tax_version
  JOIN core.reference_data_releases release ON release.id=tax_version.release_id
   WHERE tax_version.code=pg_catalog.btrim(hsn_code_value)
     AND tax_version.code_kind='hsn' AND tax_version.default_supply_type='goods'
     AND tax_version.status='active' AND release.dataset_kind='hsn_sac_tax'
     AND release.status='active'
     AND business_date BETWEEN tax_version.effective_from
                           AND COALESCE(tax_version.effective_to,'infinity'::date)
     AND business_date BETWEEN release.effective_from
                           AND COALESCE(release.effective_to,'infinity'::date)
   FOR SHARE OF tax_version,release;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='selected HSN is not in the active reviewed tax release'; END IF;
  IF cold_chain_value AND (
       minimum_storage_value IS NULL OR maximum_storage_value IS NULL
       OR minimum_storage_value>=maximum_storage_value
     ) THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='cold-chain storage range is invalid'; END IF;
  IF NOT cold_chain_value AND (
       minimum_storage_value IS NOT NULL OR maximum_storage_value IS NOT NULL
     ) THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='storage temperatures require cold-chain handling'; END IF;
  IF shelf_life_days_value IS NOT NULL AND shelf_life_days_value<=0 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='shelf life must be positive';
  END IF;
  normalized_gtin:=NULLIF(pg_catalog.btrim(gtin_value),'');
  IF normalized_gtin IS NOT NULL AND normalized_gtin !~ '^[0-9]{8,14}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='GTIN must contain 8 to 14 digits';
  END IF;
  IF current_product.product_kind='medicine' AND (
       NULLIF(pg_catalog.btrim(dosage_form_value),'') IS NULL
       OR NULLIF(pg_catalog.btrim(strength_display_value),'') IS NULL
       OR pg_catalog.jsonb_array_length(composition_rows)=0
     ) THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='medicine dosage, strength and composition are required'; END IF;
  IF current_product.product_kind<>'medicine' AND pg_catalog.jsonb_array_length(composition_rows)<>0 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='non-medicine products cannot own medicine composition';
  END IF;
  IF EXISTS(
    SELECT 1 FROM pg_catalog.jsonb_array_elements(pack_conversions) supplied(value)
     WHERE pg_catalog.jsonb_typeof(value)<>'object'
        OR NOT value ?& ARRAY['uom_code','multiplier']
        OR value - ARRAY['uom_code','multiplier'] <> '{}'::jsonb
        OR pg_catalog.btrim(value->>'uom_code')=''
        OR NOT CASE
             WHEN value->>'multiplier' ~ '^[0-9]+([.][0-9]{1,6})?$'
             THEN (value->>'multiplier')::numeric>0
             ELSE false
           END
        OR pg_catalog.btrim(value->>'uom_code')=pg_catalog.btrim(base_uom)
  ) OR (
    SELECT count(DISTINCT pg_catalog.btrim(value->>'uom_code'))
      FROM pg_catalog.jsonb_array_elements(pack_conversions)
  )<>pg_catalog.jsonb_array_length(pack_conversions) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='pack conversions must be one exact positive row per unit';
  END IF;
  IF EXISTS(
    SELECT 1 FROM pg_catalog.jsonb_array_elements(pack_conversions) supplied(value)
     WHERE NOT EXISTS(
       SELECT 1 FROM catalog.units_of_measure unit
        WHERE unit.code=pg_catalog.btrim(value->>'uom_code') AND unit.status='active'
     )
  ) THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='a selected pack unit is unavailable'; END IF;
  IF EXISTS(
    SELECT 1 FROM pg_catalog.jsonb_array_elements(composition_rows) supplied(value)
     WHERE pg_catalog.jsonb_typeof(value)<>'object'
        OR NOT value ?& ARRAY['ingredient_id','ingredient_role','strength_value','strength_uom_code','basis_quantity','basis_uom_code']
        OR value - ARRAY['ingredient_id','ingredient_role','strength_value','strength_uom_code','basis_quantity','basis_uom_code'] <> '{}'::jsonb
        OR value->>'ingredient_id' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
        OR value->>'ingredient_role' NOT IN ('active','excipient')
        OR (value->>'ingredient_role'='active' AND (
             NOT CASE
               WHEN value->>'strength_value' ~ '^[0-9]+([.][0-9]{1,6})?$'
               THEN (value->>'strength_value')::numeric>0
               ELSE false
             END
             OR NOT CASE
               WHEN value->>'basis_quantity' ~ '^[0-9]+([.][0-9]{1,6})?$'
               THEN (value->>'basis_quantity')::numeric>0
               ELSE false
             END
             OR NULLIF(pg_catalog.btrim(value->>'strength_uom_code'),'') IS NULL
             OR NULLIF(pg_catalog.btrim(value->>'basis_uom_code'),'') IS NULL
           ))
  ) OR (
    SELECT count(DISTINCT value->>'ingredient_id')
      FROM pg_catalog.jsonb_array_elements(composition_rows)
  )<>pg_catalog.jsonb_array_length(composition_rows) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='composition must be one exact typed row per ingredient';
  END IF;
  IF EXISTS(
    SELECT 1 FROM pg_catalog.jsonb_array_elements(composition_rows) supplied(value)
     WHERE NOT EXISTS(
       SELECT 1 FROM catalog.ingredients ingredient
       JOIN core.reference_data_releases release ON release.id=ingredient.release_id
        WHERE ingredient.id=(value->>'ingredient_id')::uuid
          AND ingredient.status='active' AND release.status='active'
          AND release.dataset_kind='ingredient_classification'
          AND business_date BETWEEN ingredient.effective_from
                                AND COALESCE(ingredient.effective_to,'infinity'::date)
          AND business_date BETWEEN release.effective_from
                                AND COALESCE(release.effective_to,'infinity'::date)
     ) OR (value->>'ingredient_role'='active' AND (
       NOT EXISTS(SELECT 1 FROM catalog.units_of_measure unit WHERE unit.code=value->>'strength_uom_code' AND unit.status='active')
       OR NOT EXISTS(SELECT 1 FROM catalog.units_of_measure unit WHERE unit.code=value->>'basis_uom_code' AND unit.status='active')
     ))
  ) THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='composition references unavailable reviewed data'; END IF;

  DELETE FROM catalog.product_ingredients composition
   WHERE composition.org_id=organization_id AND composition.product_id=product_identifier;
  DELETE FROM catalog.uom_conversions conversion
   WHERE conversion.org_id=organization_id AND conversion.product_id=product_identifier;
  INSERT INTO catalog.uom_conversions(
    org_id,id,product_id,from_uom_code,to_uom_code,multiplier,valid_from,status,
    created_by_membership_id
  ) VALUES (
    organization_id,pg_catalog.gen_random_uuid(),product_identifier,
    pg_catalog.btrim(base_uom),pg_catalog.btrim(base_uom),1,business_date,'active',actor_id
  );
  FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(pack_conversions) ORDER BY value->>'uom_code' LOOP
    INSERT INTO catalog.uom_conversions(
      org_id,id,product_id,from_uom_code,to_uom_code,multiplier,valid_from,status,
      created_by_membership_id
    ) VALUES (
      organization_id,pg_catalog.gen_random_uuid(),product_identifier,
      pg_catalog.btrim(item->>'uom_code'),pg_catalog.btrim(base_uom),
      (item->>'multiplier')::numeric,business_date,'active',actor_id
    );
  END LOOP;
  FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(composition_rows) ORDER BY value->>'ingredient_id' LOOP
    sequence_value:=sequence_value+1;
    INSERT INTO catalog.product_ingredients(
      org_id,product_id,ingredient_id,sequence_number,ingredient_role,
      strength_value,strength_uom_code,basis_quantity,basis_uom_code,
      valid_from,status,created_by_membership_id
    ) VALUES (
      organization_id,product_identifier,(item->>'ingredient_id')::uuid,sequence_value,
      item->>'ingredient_role',
      CASE WHEN item->>'ingredient_role'='active' THEN (item->>'strength_value')::numeric ELSE NULL END,
      CASE WHEN item->>'ingredient_role'='active' THEN item->>'strength_uom_code' ELSE NULL END,
      CASE WHEN item->>'ingredient_role'='active' THEN (item->>'basis_quantity')::numeric ELSE NULL END,
      CASE WHEN item->>'ingredient_role'='active' THEN item->>'basis_uom_code' ELSE NULL END,
      business_date,'active',actor_id
    );
  END LOOP;
  IF current_product.product_kind='medicine' THEN
    SELECT count(DISTINCT ingredient.release_id) INTO release_count
      FROM catalog.product_ingredients composition
      JOIN catalog.ingredients ingredient ON ingredient.id=composition.ingredient_id
     WHERE composition.org_id=organization_id AND composition.product_id=product_identifier;
    IF release_count<>1 THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='medicine composition must use one active reviewed release';
    END IF;
  END IF;
  RETURN QUERY
  UPDATE catalog.products product SET
    category_id=category_identifier,manufacturer_party_id=manufacturer_identifier,
    base_uom_code=pg_catalog.btrim(base_uom),
    dosage_form=NULLIF(pg_catalog.btrim(dosage_form_value),''),
    strength_display=NULLIF(pg_catalog.btrim(strength_display_value),''),
    hsn_code=pg_catalog.btrim(hsn_code_value),cold_chain_required=cold_chain_value,
    minimum_storage_celsius=minimum_storage_value,
    maximum_storage_celsius=maximum_storage_value,
    shelf_life_days=shelf_life_days_value,gtin=normalized_gtin,
    updated_at=pg_catalog.transaction_timestamp(),updated_by_membership_id=actor_id,
    row_version=product.row_version+1
   WHERE product.org_id=organization_id AND product.id=product_identifier
     AND product.row_version=expected_row_version
  RETURNING product.id,product.sku,product.name,product.row_version;
END
$function$;

CREATE FUNCTION erp_master_commands.activate_configured_product(
  organization_id uuid,
  product_identifier uuid,
  expected_row_version bigint,
  manufacturer_traceability_code varchar,
  idempotency_key_hash bytea,
  expires_at timestamptz
)
RETURNS TABLE(
  product_id uuid,product_code varchar,product_name text,new_row_version bigint,
  idempotency_replayed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
#variable_conflict use_variable
DECLARE missing text[]; was_replayed boolean;
BEGIN
  missing:=erp_master_commands.product_setup_missing_fields(
    organization_id,product_identifier,
    erp_core_commands.current_organization_business_date()
  );
  IF pg_catalog.cardinality(missing)>0 THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='product setup is incomplete: '||pg_catalog.array_to_string(missing,', ');
  END IF;
  SELECT EXISTS(
    SELECT 1 FROM core.idempotency_keys claim
     WHERE claim.org_id=organization_id
       AND claim.operation='catalog.product.activate'
       AND claim.idempotency_key_hash=idempotency_key_hash
       AND claim.status='succeeded'
       AND claim.resource_type='catalog.products'
       AND claim.resource_id=product_identifier
  ) INTO was_replayed;
  PERFORM erp_regulatory_commands.activate_product(
    organization_id,product_identifier,expected_row_version,
    manufacturer_traceability_code,idempotency_key_hash,expires_at
  );
  RETURN QUERY SELECT product.id,product.sku,product.name,product.row_version,was_replayed
    FROM catalog.products product
   WHERE product.org_id=organization_id AND product.id=product_identifier
     AND product.status='active';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='activated product readback is unavailable';
  END IF;
END
$function$;

ALTER FUNCTION erp_master_commands.product_setup_missing_fields(uuid,uuid,date)
  OWNER TO erp_migration_owner;
ALTER FUNCTION erp_master_commands.configure_product_draft(
  uuid,uuid,bigint,uuid,uuid,varchar,varchar,varchar,varchar,boolean,numeric,numeric,
  integer,varchar,jsonb,jsonb
) OWNER TO erp_migration_owner;
ALTER FUNCTION erp_master_commands.activate_configured_product(
  uuid,uuid,bigint,varchar,bytea,timestamptz
) OWNER TO erp_migration_owner;

REVOKE ALL ON FUNCTION erp_master_commands.product_setup_missing_fields(uuid,uuid,date)
  FROM PUBLIC,erp_app,erp_runtime;
REVOKE ALL ON FUNCTION erp_master_commands.configure_product_draft(
  uuid,uuid,bigint,uuid,uuid,varchar,varchar,varchar,varchar,boolean,numeric,numeric,
  integer,varchar,jsonb,jsonb
) FROM PUBLIC,erp_app,erp_runtime;
REVOKE ALL ON FUNCTION erp_master_commands.activate_configured_product(
  uuid,uuid,bigint,varchar,bytea,timestamptz
) FROM PUBLIC,erp_app,erp_runtime;
GRANT EXECUTE ON FUNCTION erp_master_commands.product_setup_missing_fields(uuid,uuid,date)
  TO erp_runtime;
GRANT EXECUTE ON FUNCTION erp_master_commands.configure_product_draft(
  uuid,uuid,bigint,uuid,uuid,varchar,varchar,varchar,varchar,boolean,numeric,numeric,
  integer,varchar,jsonb,jsonb
) TO erp_runtime;
GRANT EXECUTE ON FUNCTION erp_master_commands.activate_configured_product(
  uuid,uuid,bigint,varchar,bytea,timestamptz
) TO erp_runtime;

REVOKE INSERT,UPDATE,DELETE ON TABLE catalog.uom_conversions FROM erp_app,erp_runtime;
REVOKE INSERT,UPDATE,DELETE ON TABLE catalog.product_ingredients FROM erp_app,erp_runtime;

RESET ROLE;
