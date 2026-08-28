-- Generated from the reviewed database/canonical/operations sources.
-- Existing Alembic migrations are immutable.

SET LOCAL ROLE erp_migration_owner;

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

CREATE FUNCTION erp_master_commands.create_party_address(
  organization_id uuid,
  party_identifier uuid,
  address_kind text,
  address_line1 text,
  address_line2 text,
  landmark text,
  city text,
  state_code text,
  postal_code text,
  make_primary boolean
)
RETURNS TABLE(address_id uuid,row_version bigint,idempotency_replayed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
#variable_conflict use_variable
DECLARE actor_id uuid; country_code text; business_date date; existing parties.addresses%ROWTYPE;
BEGIN
  actor_id:=erp_core_commands.assert_context(
    organization_id,'parties.party.manage',NULL::uuid
  );
  IF party_identifier IS NULL OR address_kind NOT IN ('billing','shipping','other')
     OR address_line1 IS NULL OR pg_catalog.btrim(address_line1)=''
     OR city IS NULL OR pg_catalog.btrim(city)=''
     OR state_code !~ '^[0-9]{2}$' OR postal_code !~ '^[0-9]{6}$'
     OR make_primary IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='party address is invalid';
  END IF;
  SELECT organization.country_code,
         (pg_catalog.transaction_timestamp() AT TIME ZONE organization.timezone)::date
    INTO STRICT country_code,business_date
    FROM core.organizations organization
   WHERE organization.id=organization_id AND organization.status='active' FOR SHARE;
  PERFORM 1 FROM parties.parties party
   WHERE party.org_id=organization_id AND party.id=party_identifier
     AND party.status IN ('draft','active') FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='party not found';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    organization_id::text||':'||party_identifier::text||':address:'||address_kind,8727003
  ));
  SELECT * INTO existing FROM parties.addresses address
   WHERE address.org_id=organization_id AND address.party_id=party_identifier
     AND address.address_kind=address_kind AND address.status='active'
     AND address.valid_until IS NULL
     AND address.line1=pg_catalog.btrim(address_line1)
     AND address.line2 IS NOT DISTINCT FROM NULLIF(pg_catalog.btrim(address_line2),'')
     AND address.landmark IS NOT DISTINCT FROM NULLIF(pg_catalog.btrim(landmark),'')
     AND address.city=pg_catalog.btrim(city) AND address.state_code=state_code
     AND address.postal_code=postal_code AND address.country_code=country_code
     AND (NOT make_primary OR address.is_primary)
   ORDER BY address.id LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    address_id:=existing.id; row_version:=existing.row_version;
    idempotency_replayed:=true; RETURN NEXT; RETURN;
  END IF;
  IF make_primary OR NOT EXISTS(
    SELECT 1 FROM parties.addresses address
     WHERE address.org_id=organization_id AND address.party_id=party_identifier
       AND address.address_kind=address_kind AND address.status='active'
       AND address.valid_until IS NULL AND address.is_primary
  ) THEN
    make_primary:=true;
    UPDATE parties.addresses address
       SET is_primary=false,updated_at=pg_catalog.transaction_timestamp(),
           updated_by_membership_id=actor_id,row_version=address.row_version+1
     WHERE address.org_id=organization_id AND address.party_id=party_identifier
       AND address.address_kind=address_kind AND address.status='active'
       AND address.valid_until IS NULL AND address.is_primary;
  END IF;
  address_id:=gen_random_uuid();
  INSERT INTO parties.addresses(
    org_id,id,party_id,address_kind,line1,line2,landmark,city,state_code,
    postal_code,country_code,is_primary,valid_from,status,
    created_by_membership_id,updated_by_membership_id
  ) VALUES(
    organization_id,address_id,party_identifier,address_kind,pg_catalog.btrim(address_line1),
    NULLIF(pg_catalog.btrim(address_line2),''),NULLIF(pg_catalog.btrim(landmark),''),
    pg_catalog.btrim(city),state_code,postal_code,country_code,make_primary,
    business_date,'active',actor_id,actor_id
  );
  row_version:=1; idempotency_replayed:=false; RETURN NEXT;
END
$function$;

CREATE FUNCTION erp_master_commands.update_party_address(
  organization_id uuid,
  party_identifier uuid,
  address_identifier uuid,
  expected_row_version bigint,
  address_kind text,
  address_line1 text,
  address_line2 text,
  landmark text,
  city text,
  state_code text,
  postal_code text,
  make_primary boolean
)
RETURNS TABLE(address_id uuid,row_version bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
#variable_conflict use_variable
DECLARE actor_id uuid; current_address parties.addresses%ROWTYPE;
BEGIN
  actor_id:=erp_core_commands.assert_context(
    organization_id,'parties.party.manage',NULL::uuid
  );
  IF party_identifier IS NULL OR address_identifier IS NULL
     OR expected_row_version IS NULL OR expected_row_version<=0
     OR address_kind NOT IN ('billing','shipping','other')
     OR address_line1 IS NULL OR pg_catalog.btrim(address_line1)=''
     OR city IS NULL OR pg_catalog.btrim(city)=''
     OR state_code !~ '^[0-9]{2}$' OR postal_code !~ '^[0-9]{6}$'
     OR make_primary IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='party address update is invalid';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    organization_id::text||':'||party_identifier::text||':address:'||address_kind,8727003
  ));
  SELECT * INTO current_address FROM parties.addresses address
   WHERE address.org_id=organization_id AND address.party_id=party_identifier
     AND address.id=address_identifier AND address.status='active'
     AND address.valid_until IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='party address not found';
  END IF;
  IF current_address.row_version<>expected_row_version THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='party address row version changed';
  END IF;
  IF make_primary OR NOT EXISTS(
    SELECT 1 FROM parties.addresses address
     WHERE address.org_id=organization_id AND address.party_id=party_identifier
       AND address.address_kind=address_kind AND address.id<>address_identifier
       AND address.status='active' AND address.valid_until IS NULL AND address.is_primary
  ) THEN
    make_primary:=true;
    UPDATE parties.addresses address
       SET is_primary=false,updated_at=pg_catalog.transaction_timestamp(),
           updated_by_membership_id=actor_id,row_version=address.row_version+1
     WHERE address.org_id=organization_id AND address.party_id=party_identifier
       AND address.address_kind=address_kind AND address.id<>address_identifier
       AND address.status='active' AND address.valid_until IS NULL AND address.is_primary;
  END IF;
  RETURN QUERY
  UPDATE parties.addresses address
     SET address_kind=address_kind,line1=pg_catalog.btrim(address_line1),
         line2=NULLIF(pg_catalog.btrim(address_line2),''),
         landmark=NULLIF(pg_catalog.btrim(landmark),''),city=pg_catalog.btrim(city),
         state_code=state_code,postal_code=postal_code,is_primary=make_primary,
         updated_at=pg_catalog.transaction_timestamp(),updated_by_membership_id=actor_id,
         row_version=address.row_version+1
   WHERE address.org_id=organization_id AND address.party_id=party_identifier
     AND address.id=address_identifier
  RETURNING address.id,address.row_version;
END
$function$;

ALTER FUNCTION erp_master_commands.create_party_address(
  uuid,uuid,text,text,text,text,text,text,text,boolean
) OWNER TO erp_migration_owner;
ALTER FUNCTION erp_master_commands.update_party_address(
  uuid,uuid,uuid,bigint,text,text,text,text,text,text,text,boolean
) OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_master_commands.create_party_address(
  uuid,uuid,text,text,text,text,text,text,text,boolean
) FROM PUBLIC,erp_app,erp_runtime;
REVOKE ALL ON FUNCTION erp_master_commands.update_party_address(
  uuid,uuid,uuid,bigint,text,text,text,text,text,text,text,boolean
) FROM PUBLIC,erp_app,erp_runtime;
GRANT EXECUTE ON FUNCTION erp_master_commands.create_party_address(
  uuid,uuid,text,text,text,text,text,text,text,boolean
) TO erp_runtime;
GRANT EXECUTE ON FUNCTION erp_master_commands.update_party_address(
  uuid,uuid,uuid,bigint,text,text,text,text,text,text,text,boolean
) TO erp_runtime;

CREATE FUNCTION erp_core_commands.initiate_expense_receipt_attachment(
  organization_id uuid,
  branch_identifier uuid,
  attachment_identifier uuid,
  storage_bucket text,
  storage_object_path text,
  original_filename text,
  byte_size bigint,
  sha256 bytea,
  document_date date,
  retention_until date
)
RETURNS TABLE(attachment_id uuid,attachment_status text,idempotency_replayed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
#variable_conflict use_variable
DECLARE actor_id uuid; existing core.attachments%ROWTYPE; existing_count bigint;
BEGIN
  actor_id:=erp_core_commands.assert_context(
    organization_id,'core.attachment.manage',branch_identifier
  );
  IF erp_security.has_permission('finance.expense.manage',branch_identifier) IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='expense evidence permission denied';
  END IF;
  IF attachment_identifier IS NULL OR branch_identifier IS NULL
     OR storage_bucket<>'canonical-evidence-private-v1'
     OR storage_object_path IS DISTINCT FROM organization_id::text||'/'||branch_identifier::text
        ||'/expense_receipt/'||pg_catalog.encode(sha256,'hex')||'.pdf'
     OR original_filename IS NULL OR pg_catalog.btrim(original_filename)=''
     OR byte_size IS NULL OR byte_size<=0
     OR sha256 IS NULL OR pg_catalog.octet_length(sha256)<>32
     OR document_date IS NULL OR retention_until IS NULL
     OR retention_until<document_date THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='expense receipt metadata is invalid';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    organization_id::text||':evidence-object:'||storage_bucket||':'||storage_object_path,
    8727004
  ));
  SELECT count(*) INTO existing_count FROM core.attachments attachment
   WHERE attachment.org_id=organization_id AND attachment.branch_id=branch_identifier
     AND attachment.storage_bucket=storage_bucket
     AND attachment.storage_object_path=storage_object_path;
  IF existing_count>1 THEN
    RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='evidence object identity is duplicated';
  END IF;
  IF existing_count=1 THEN
    SELECT * INTO STRICT existing FROM core.attachments attachment
     WHERE attachment.org_id=organization_id AND attachment.branch_id=branch_identifier
       AND attachment.storage_bucket=storage_bucket
       AND attachment.storage_object_path=storage_object_path FOR SHARE;
    IF existing.evidence_kind<>'expense_receipt'
       OR existing.sha256 IS DISTINCT FROM sha256 OR existing.byte_size<>byte_size
       OR existing.original_filename<>original_filename
       OR existing.document_date<>document_date OR existing.retention_until<>retention_until THEN
      RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='evidence object identity conflicts with canonical metadata';
    END IF;
    attachment_id:=existing.id; attachment_status:=existing.status;
    idempotency_replayed:=true; RETURN NEXT; RETURN;
  END IF;
  INSERT INTO core.attachments(
    org_id,branch_id,id,storage_bucket,storage_object_path,original_filename,
    media_type,byte_size,sha256,evidence_kind,document_date,retention_until,
    legal_hold,status,created_by_membership_id
  ) VALUES(
    organization_id,branch_identifier,attachment_identifier,storage_bucket,
    storage_object_path,original_filename,'application/pdf',byte_size,sha256,
    'expense_receipt',document_date,retention_until,false,'pending_upload',actor_id
  );
  attachment_id:=attachment_identifier; attachment_status:='pending_upload';
  idempotency_replayed:=false; RETURN NEXT;
END
$function$;

CREATE FUNCTION erp_core_commands.transition_expense_receipt_attachment(
  organization_id uuid,
  branch_identifier uuid,
  attachment_identifier uuid,
  target_status text
)
RETURNS TABLE(attachment_id uuid,attachment_status text,idempotency_replayed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
#variable_conflict use_variable
DECLARE current_attachment core.attachments%ROWTYPE;
BEGIN
  PERFORM erp_core_commands.assert_context(
    organization_id,'core.attachment.manage',branch_identifier
  );
  IF erp_security.has_permission('finance.expense.manage',branch_identifier) IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='expense evidence permission denied';
  END IF;
  IF target_status IS NULL OR target_status NOT IN ('verified','rejected') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='expense evidence transition is invalid';
  END IF;
  SELECT * INTO current_attachment FROM core.attachments attachment
   WHERE attachment.org_id=organization_id AND attachment.branch_id=branch_identifier
     AND attachment.id=attachment_identifier AND attachment.evidence_kind='expense_receipt'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='expense receipt attachment not found';
  END IF;
  IF current_attachment.status=target_status THEN
    attachment_id:=current_attachment.id; attachment_status:=current_attachment.status;
    idempotency_replayed:=true; RETURN NEXT; RETURN;
  END IF;
  IF current_attachment.status<>'pending_upload' THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='evidence lifecycle changed before integrity finalization';
  END IF;
  UPDATE core.attachments attachment
     SET status=target_status,
         verified_at=CASE WHEN target_status='verified'
                          THEN pg_catalog.transaction_timestamp() ELSE NULL END
   WHERE attachment.org_id=organization_id AND attachment.branch_id=branch_identifier
     AND attachment.id=attachment_identifier;
  attachment_id:=attachment_identifier; attachment_status:=target_status;
  idempotency_replayed:=false; RETURN NEXT;
END
$function$;

ALTER FUNCTION erp_core_commands.initiate_expense_receipt_attachment(
  uuid,uuid,uuid,text,text,text,bigint,bytea,date,date
) OWNER TO erp_migration_owner;
ALTER FUNCTION erp_core_commands.transition_expense_receipt_attachment(
  uuid,uuid,uuid,text
) OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_core_commands.initiate_expense_receipt_attachment(
  uuid,uuid,uuid,text,text,text,bigint,bytea,date,date
) FROM PUBLIC,erp_app,erp_runtime;
REVOKE ALL ON FUNCTION erp_core_commands.transition_expense_receipt_attachment(
  uuid,uuid,uuid,text
) FROM PUBLIC,erp_app,erp_runtime;
GRANT EXECUTE ON FUNCTION erp_core_commands.initiate_expense_receipt_attachment(
  uuid,uuid,uuid,text,text,text,bigint,bytea,date,date
) TO erp_runtime;
GRANT EXECUTE ON FUNCTION erp_core_commands.transition_expense_receipt_attachment(
  uuid,uuid,uuid,text
) TO erp_runtime;

REVOKE UPDATE ON TABLE catalog.products FROM erp_app,erp_runtime;
REVOKE INSERT,UPDATE ON TABLE parties.addresses FROM erp_app,erp_runtime;
REVOKE INSERT,UPDATE ON TABLE core.attachments FROM erp_app,erp_runtime;

RESET ROLE;
