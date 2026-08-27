CREATE FUNCTION erp_master_commands.update_product_draft(
  organization_id uuid,
  product_identifier uuid,
  expected_row_version bigint,
  set_name boolean,
  product_name text,
  set_generic_name boolean,
  generic_name text,
  set_product_kind boolean,
  product_kind text
)
RETURNS TABLE(
  product_id uuid,
  product_code text,
  updated_product_name text,
  new_row_version bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
#variable_conflict use_variable
DECLARE actor_id uuid; current_product catalog.products%ROWTYPE;
BEGIN
  actor_id:=erp_core_commands.assert_context(
    organization_id,'catalog.product.manage',NULL::uuid
  );
  IF product_identifier IS NULL OR expected_row_version IS NULL
     OR expected_row_version<=0 OR NOT (set_name OR set_generic_name OR set_product_kind)
     OR (set_name AND (product_name IS NULL OR pg_catalog.btrim(product_name)=''))
     OR (set_product_kind AND product_kind NOT IN ('medicine','medical_device','consumable')) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='product draft update is invalid';
  END IF;
  SELECT * INTO current_product FROM catalog.products product
   WHERE product.org_id=organization_id AND product.id=product_identifier FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='product draft not found';
  END IF;
  IF current_product.status<>'draft' OR current_product.first_used_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='only an unused product draft can be edited';
  END IF;
  IF current_product.row_version<>expected_row_version THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='product draft row version changed';
  END IF;
  IF set_name THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      organization_id::text||':product-name:'||pg_catalog.lower(pg_catalog.btrim(product_name)),8727002
    ));
    IF EXISTS(
      SELECT 1 FROM catalog.products product
       WHERE product.org_id=organization_id AND product.id<>product_identifier
         AND pg_catalog.lower(pg_catalog.btrim(product.name))=
             pg_catalog.lower(pg_catalog.btrim(product_name))
         AND product.status IN ('draft','active','blocked')
    ) THEN
      RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='product name already exists';
    END IF;
  END IF;
  RETURN QUERY
  UPDATE catalog.products product
     SET name=CASE WHEN set_name THEN pg_catalog.btrim(product_name) ELSE product.name END,
         generic_name=CASE WHEN set_generic_name THEN NULLIF(pg_catalog.btrim(generic_name),'') ELSE product.generic_name END,
         product_kind=CASE WHEN set_product_kind THEN product_kind ELSE product.product_kind END,
         updated_at=pg_catalog.transaction_timestamp(),updated_by_membership_id=actor_id,
         row_version=product.row_version+1
   WHERE product.org_id=organization_id AND product.id=product_identifier
  RETURNING product.id,product.sku::text,product.name,product.row_version;
END
$function$;

CREATE FUNCTION erp_master_commands.delete_product_draft(
  organization_id uuid,
  product_identifier uuid,
  expected_row_version bigint
)
RETURNS TABLE(product_id uuid,product_code text,product_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
#variable_conflict use_variable
DECLARE current_product catalog.products%ROWTYPE;
BEGIN
  PERFORM erp_core_commands.assert_context(
    organization_id,'catalog.product.manage',NULL::uuid
  );
  IF product_identifier IS NULL OR expected_row_version IS NULL OR expected_row_version<=0 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='product draft deletion is invalid';
  END IF;
  SELECT * INTO current_product FROM catalog.products product
   WHERE product.org_id=organization_id AND product.id=product_identifier FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='product draft not found';
  END IF;
  IF current_product.status<>'draft' OR current_product.first_used_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='only an unused product draft can be deleted';
  END IF;
  IF current_product.row_version<>expected_row_version THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='product draft row version changed';
  END IF;
  RETURN QUERY
  DELETE FROM catalog.products product
   WHERE product.org_id=organization_id AND product.id=product_identifier
  RETURNING product.id,product.sku::text,product.name;
END
$function$;

ALTER FUNCTION erp_master_commands.update_product_draft(
  uuid,uuid,bigint,boolean,text,boolean,text,boolean,text
) OWNER TO erp_migration_owner;
ALTER FUNCTION erp_master_commands.delete_product_draft(uuid,uuid,bigint)
  OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_master_commands.update_product_draft(
  uuid,uuid,bigint,boolean,text,boolean,text,boolean,text
) FROM PUBLIC,erp_app,erp_runtime;
REVOKE ALL ON FUNCTION erp_master_commands.delete_product_draft(uuid,uuid,bigint)
  FROM PUBLIC,erp_app,erp_runtime;
GRANT EXECUTE ON FUNCTION erp_master_commands.update_product_draft(
  uuid,uuid,bigint,boolean,text,boolean,text,boolean,text
) TO erp_runtime;
GRANT EXECUTE ON FUNCTION erp_master_commands.delete_product_draft(uuid,uuid,bigint)
  TO erp_runtime;
