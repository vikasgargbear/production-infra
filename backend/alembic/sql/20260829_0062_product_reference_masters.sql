SET LOCAL ROLE erp_migration_owner;

-- A legal manufacturer is product identity.  It is deliberately independent
-- of the supplier account from which a pharmacy happens to buy the product.
CREATE TABLE catalog.manufacturers (
  org_id uuid NOT NULL,
  party_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  created_by_membership_id uuid NOT NULL DEFAULT current_setting('app.membership_id')::uuid,
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_by_membership_id uuid NOT NULL DEFAULT current_setting('app.membership_id')::uuid,
  row_version bigint NOT NULL DEFAULT 1,
  CONSTRAINT manufacturers_pkey PRIMARY KEY (org_id,party_id),
  CONSTRAINT manufacturers_org_fk FOREIGN KEY (org_id)
    REFERENCES core.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT manufacturers_party_fk FOREIGN KEY (org_id,party_id)
    REFERENCES parties.parties(org_id,id) ON DELETE RESTRICT,
  CONSTRAINT manufacturers_created_by_fk FOREIGN KEY (org_id,created_by_membership_id)
    REFERENCES core.memberships(org_id,id) ON DELETE RESTRICT,
  CONSTRAINT manufacturers_updated_by_fk FOREIGN KEY (org_id,updated_by_membership_id)
    REFERENCES core.memberships(org_id,id) ON DELETE RESTRICT,
  CONSTRAINT manufacturers_status_ck CHECK (status IN ('active','inactive')),
  CONSTRAINT manufacturers_row_version_ck CHECK (row_version>0)
);
ALTER TABLE catalog.manufacturers OWNER TO erp_migration_owner;
REVOKE ALL ON TABLE catalog.manufacturers FROM PUBLIC,erp_app,erp_runtime;
ALTER TABLE catalog.manufacturers ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog.manufacturers FORCE ROW LEVEL SECURITY;
CREATE POLICY manufacturers_owner_policy ON catalog.manufacturers
  FOR ALL TO erp_migration_owner
  USING (
    org_id=erp_security.current_org_id()
    AND erp_security.current_membership_id() IS NOT NULL
    AND erp_security.current_actor_is_active()
  )
  WITH CHECK (
    org_id=erp_security.current_org_id()
    AND erp_security.current_membership_id() IS NOT NULL
    AND erp_security.current_actor_is_active()
  );
CREATE POLICY manufacturers_select_policy ON catalog.manufacturers
  FOR SELECT TO erp_app,erp_runtime
  USING (
    org_id=erp_security.current_org_id()
    AND erp_security.current_actor_is_active()
  );
GRANT SELECT ON TABLE catalog.manufacturers TO erp_app,erp_runtime;
CREATE TRIGGER catalog_manufacturers_audit_trg
  AFTER INSERT OR UPDATE OR DELETE ON catalog.manufacturers
  FOR EACH ROW EXECUTE FUNCTION erp_plumbing.audit_row_mutation();

-- Preserve every manufacturer identity already referenced by a product.  We
-- intentionally do not promote every supplier into this master.
INSERT INTO catalog.manufacturers(
  org_id,party_id,status,created_by_membership_id,updated_by_membership_id
)
SELECT DISTINCT product.org_id,product.manufacturer_party_id,'active',
       product.created_by_membership_id,product.updated_by_membership_id
  FROM catalog.products product
  JOIN parties.parties party
    ON party.org_id=product.org_id AND party.id=product.manufacturer_party_id
 WHERE product.manufacturer_party_id IS NOT NULL;

-- A manufacturer's display identity lives on parties.parties, so cross-table
-- name uniqueness is enforced by the canonical command's advisory lock and
-- exact duplicate check rather than an invalid denormalized index.

CREATE FUNCTION erp_master_commands.create_product_category(
  organization_id uuid,
  category_name text,
  idempotency_key_hash bytea,
  idempotency_expires_at timestamptz
)
RETURNS TABLE(
  category_id uuid,category_code varchar,created_category_name text,
  row_version bigint,idempotency_replayed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE actor_id uuid; claim core.idempotency_keys%ROWTYPE;
        normalized_name text; generated_code varchar; identifier uuid;
        request_document jsonb;
BEGIN
  actor_id:=erp_core_commands.assert_context(
    organization_id,'catalog.product.manage',NULL::uuid
  );
  normalized_name:=pg_catalog.btrim(category_name);
  IF normalized_name IS NULL OR normalized_name='' OR pg_catalog.length(normalized_name)>120 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='category name is required and must not exceed 120 characters';
  END IF;
  request_document:=pg_catalog.jsonb_build_object(
    'operation','catalog.product_category.create','category_name',normalized_name
  );
  claim:=erp_core_commands.claim(
    organization_id,actor_id,'catalog.product_category.create',idempotency_key_hash,
    request_document,idempotency_expires_at
  );
  IF claim.status='succeeded' THEN
    SELECT category.id,category.code,category.name,category.row_version,true
      INTO STRICT category_id,category_code,created_category_name,row_version,idempotency_replayed
      FROM catalog.categories category
     WHERE category.org_id=organization_id AND category.id=claim.resource_id
       AND claim.resource_type='catalog.categories';
    RETURN NEXT; RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    organization_id::text||':product-category:'||pg_catalog.lower(normalized_name),8727061
  ));
  IF EXISTS(
    SELECT 1 FROM catalog.categories category
     WHERE category.org_id=organization_id AND category.status='active'
       AND pg_catalog.lower(pg_catalog.btrim(category.name))=pg_catalog.lower(normalized_name)
  ) THEN RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='product category already exists'; END IF;
  generated_code:=pg_catalog.upper(pg_catalog.regexp_replace(normalized_name,'[^[:alnum:]]+','-','g'));
  generated_code:=pg_catalog.btrim(generated_code,'-');
  IF generated_code='' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='category name must contain letters or numbers';
  END IF;
  generated_code:=pg_catalog.left(generated_code,48);
  IF EXISTS(SELECT 1 FROM catalog.categories category WHERE category.org_id=organization_id AND category.code=generated_code) THEN
    generated_code:=pg_catalog.left(generated_code,39)||'-'||pg_catalog.substr(pg_catalog.encode(idempotency_key_hash,'hex'),1,8);
  END IF;
  identifier:=pg_catalog.gen_random_uuid();
  INSERT INTO catalog.categories(
    org_id,id,code,name,status,created_by_membership_id,updated_by_membership_id
  ) VALUES (
    organization_id,identifier,generated_code,normalized_name,'active',actor_id,actor_id
  );
  PERFORM erp_core_commands.finish_claim(
    organization_id,claim.id,'catalog.categories',identifier,
    pg_catalog.jsonb_build_object('category_id',identifier,'category_code',generated_code,'category_name',normalized_name)
  );
  category_id:=identifier; category_code:=generated_code;
  created_category_name:=normalized_name; row_version:=1; idempotency_replayed:=false;
  RETURN NEXT;
END
$function$;

CREATE FUNCTION erp_master_commands.create_product_manufacturer(
  organization_id uuid,
  legal_manufacturer_name text,
  idempotency_key_hash bytea,
  idempotency_expires_at timestamptz
)
RETURNS TABLE(
  manufacturer_party_id uuid,legal_name text,row_version bigint,
  idempotency_replayed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE actor_id uuid; claim core.idempotency_keys%ROWTYPE;
        normalized_name text; identifier uuid; request_document jsonb;
BEGIN
  actor_id:=erp_core_commands.assert_context(
    organization_id,'catalog.product.manage',NULL::uuid
  );
  normalized_name:=pg_catalog.btrim(legal_manufacturer_name);
  IF normalized_name IS NULL OR normalized_name='' OR pg_catalog.length(normalized_name)>255 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='manufacturer legal name is required and must not exceed 255 characters';
  END IF;
  request_document:=pg_catalog.jsonb_build_object(
    'operation','catalog.product_manufacturer.create','legal_name',normalized_name
  );
  claim:=erp_core_commands.claim(
    organization_id,actor_id,'catalog.product_manufacturer.create',idempotency_key_hash,
    request_document,idempotency_expires_at
  );
  IF claim.status='succeeded' THEN
    SELECT party.id,party.legal_name,manufacturer.row_version,true
      INTO STRICT manufacturer_party_id,legal_name,row_version,idempotency_replayed
      FROM catalog.manufacturers manufacturer
      JOIN parties.parties party
        ON party.org_id=manufacturer.org_id AND party.id=manufacturer.party_id
     WHERE manufacturer.org_id=organization_id AND manufacturer.party_id=claim.resource_id
       AND claim.resource_type='catalog.manufacturers';
    RETURN NEXT; RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    organization_id::text||':product-manufacturer:'||pg_catalog.lower(normalized_name),8727062
  ));
  IF EXISTS(
    SELECT 1 FROM catalog.manufacturers manufacturer
    JOIN parties.parties party
      ON party.org_id=manufacturer.org_id AND party.id=manufacturer.party_id
     WHERE manufacturer.org_id=organization_id AND manufacturer.status='active'
       AND party.status='active'
       AND pg_catalog.lower(pg_catalog.btrim(party.legal_name))=pg_catalog.lower(normalized_name)
  ) THEN RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='product manufacturer already exists'; END IF;
  identifier:=pg_catalog.gen_random_uuid();
  INSERT INTO parties.parties(
    org_id,id,party_kind,legal_name,status,created_by_membership_id,updated_by_membership_id
  ) VALUES (
    organization_id,identifier,'organization',normalized_name,'draft',actor_id,actor_id
  );
  UPDATE parties.parties AS party
     SET status='active',updated_at=transaction_timestamp(),
         updated_by_membership_id=actor_id,
         row_version=party.row_version+1
   WHERE party.org_id=organization_id AND party.id=identifier AND party.status='draft';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='manufacturer identity could not be activated';
  END IF;
  INSERT INTO catalog.manufacturers(
    org_id,party_id,status,created_by_membership_id,updated_by_membership_id
  ) VALUES (organization_id,identifier,'active',actor_id,actor_id);
  PERFORM erp_core_commands.finish_claim(
    organization_id,claim.id,'catalog.manufacturers',identifier,
    pg_catalog.jsonb_build_object('manufacturer_party_id',identifier,'legal_name',normalized_name)
  );
  manufacturer_party_id:=identifier; legal_name:=normalized_name;
  row_version:=1; idempotency_replayed:=false;
  RETURN NEXT;
END
$function$;

-- Every runtime-configured product references the distinct manufacturer
-- master. Reviewed migration-owner fixtures remain able to reproduce historic
-- product states; application writes already require SESSION_USER=erp_runtime.
CREATE FUNCTION erp_master_commands.guard_product_manufacturer_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
BEGIN
  IF SESSION_USER='erp_runtime'
     AND NEW.manufacturer_party_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM catalog.manufacturers manufacturer
     WHERE manufacturer.org_id=NEW.org_id
       AND manufacturer.party_id=NEW.manufacturer_party_id
       AND manufacturer.status='active'
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23503', MESSAGE='selected legal manufacturer is unavailable';
  END IF;
  RETURN NEW;
END
$function$;
CREATE TRIGGER products_manufacturer_reference_guard
  BEFORE INSERT OR UPDATE OF manufacturer_party_id ON catalog.products
  FOR EACH ROW EXECUTE FUNCTION erp_master_commands.guard_product_manufacturer_reference();

ALTER FUNCTION erp_master_commands.create_product_category(uuid,text,bytea,timestamptz)
  OWNER TO erp_migration_owner;
ALTER FUNCTION erp_master_commands.create_product_manufacturer(uuid,text,bytea,timestamptz)
  OWNER TO erp_migration_owner;
ALTER FUNCTION erp_master_commands.guard_product_manufacturer_reference()
  OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_master_commands.create_product_category(uuid,text,bytea,timestamptz)
  FROM PUBLIC,erp_app,erp_runtime;
REVOKE ALL ON FUNCTION erp_master_commands.create_product_manufacturer(uuid,text,bytea,timestamptz)
  FROM PUBLIC,erp_app,erp_runtime;
REVOKE ALL ON FUNCTION erp_master_commands.guard_product_manufacturer_reference()
  FROM PUBLIC,erp_app,erp_runtime;
GRANT EXECUTE ON FUNCTION erp_master_commands.create_product_category(uuid,text,bytea,timestamptz)
  TO erp_runtime;
GRANT EXECUTE ON FUNCTION erp_master_commands.create_product_manufacturer(uuid,text,bytea,timestamptz)
  TO erp_runtime;

-- Category/manufacturer writes are available only through the functions above.
REVOKE INSERT,UPDATE,DELETE ON TABLE catalog.categories FROM erp_app,erp_runtime;

RESET ROLE;
