SET LOCAL ROLE erp_migration_owner;

CREATE FUNCTION erp_master_commands.configure_product_draft_idempotent(
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
  composition_rows jsonb,
  idempotency_key_hash bytea,
  idempotency_expires_at timestamptz
)
RETURNS TABLE(
  product_id uuid,
  product_code varchar,
  product_name text,
  new_row_version bigint,
  idempotency_replayed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
#variable_conflict use_variable
DECLARE
  actor_id uuid;
  claim core.idempotency_keys%ROWTYPE;
  request_document jsonb;
  response_document jsonb;
  configured record;
BEGIN
  actor_id:=erp_core_commands.assert_context(
    organization_id,'catalog.product.manage',NULL::uuid
  );
  request_document:=pg_catalog.jsonb_build_object(
    'operation','catalog.product_draft.configure',
    'product_id',product_identifier,
    'expected_row_version',expected_row_version,
    'category_id',category_identifier,
    'manufacturer_party_id',manufacturer_identifier,
    'base_uom_code',base_uom,
    'dosage_form',dosage_form_value,
    'strength_display',strength_display_value,
    'hsn_code',hsn_code_value,
    'cold_chain_required',cold_chain_value,
    'minimum_storage_celsius',minimum_storage_value,
    'maximum_storage_celsius',maximum_storage_value,
    'shelf_life_days',shelf_life_days_value,
    'gtin',gtin_value,
    'pack_conversions',pack_conversions,
    'ingredients',composition_rows
  );
  claim:=erp_core_commands.claim(
    organization_id,actor_id,'catalog.product_draft.configure',
    idempotency_key_hash,request_document,idempotency_expires_at
  );
  IF claim.status='succeeded' THEN
    IF claim.resource_type<>'catalog.products'
       OR claim.resource_id IS DISTINCT FROM product_identifier THEN
      RAISE EXCEPTION USING ERRCODE='23505',
        MESSAGE='product setup idempotency key belongs to another resource';
    END IF;
    response_document:=pg_catalog.convert_from(claim.response_body,'UTF8')::jsonb;
    IF response_document->>'product_id' IS DISTINCT FROM product_identifier::text THEN
      RAISE EXCEPTION USING ERRCODE='23505',
        MESSAGE='product setup replay payload belongs to another resource';
    END IF;
    product_id:=(response_document->>'product_id')::uuid;
    product_code:=response_document->>'product_code';
    product_name:=response_document->>'product_name';
    new_row_version:=(response_document->>'row_version')::bigint;
    idempotency_replayed:=true;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT * INTO STRICT configured
    FROM erp_master_commands.configure_product_draft(
      organization_id,product_identifier,expected_row_version,
      category_identifier,manufacturer_identifier,base_uom,
      dosage_form_value,strength_display_value,hsn_code_value,
      cold_chain_value,minimum_storage_value,maximum_storage_value,
      shelf_life_days_value,gtin_value,pack_conversions,composition_rows
    );
  PERFORM erp_core_commands.finish_claim(
    organization_id,claim.id,'catalog.products',configured.product_id,
    pg_catalog.jsonb_build_object(
      'product_id',configured.product_id,
      'product_code',configured.product_code,
      'product_name',configured.product_name,
      'row_version',configured.new_row_version
    )
  );
  product_id:=configured.product_id;
  product_code:=configured.product_code;
  product_name:=configured.product_name;
  new_row_version:=configured.new_row_version;
  idempotency_replayed:=false;
  RETURN NEXT;
END
$function$;

ALTER FUNCTION erp_master_commands.configure_product_draft_idempotent(
  uuid,uuid,bigint,uuid,uuid,varchar,varchar,varchar,varchar,boolean,numeric,numeric,
  integer,varchar,jsonb,jsonb,bytea,timestamptz
) OWNER TO erp_migration_owner;

REVOKE ALL ON FUNCTION erp_master_commands.configure_product_draft_idempotent(
  uuid,uuid,bigint,uuid,uuid,varchar,varchar,varchar,varchar,boolean,numeric,numeric,
  integer,varchar,jsonb,jsonb,bytea,timestamptz
) FROM PUBLIC,erp_app,erp_runtime;
GRANT EXECUTE ON FUNCTION erp_master_commands.configure_product_draft_idempotent(
  uuid,uuid,bigint,uuid,uuid,varchar,varchar,varchar,varchar,boolean,numeric,numeric,
  integer,varchar,jsonb,jsonb,bytea,timestamptz
) TO erp_runtime;

RESET ROLE;
