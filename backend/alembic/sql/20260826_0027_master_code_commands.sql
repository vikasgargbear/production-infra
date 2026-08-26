CREATE SCHEMA erp_master_commands AUTHORIZATION erp_migration_owner;
REVOKE ALL ON SCHEMA erp_master_commands FROM PUBLIC, erp_app, erp_runtime;

SET LOCAL ROLE erp_migration_owner;

CREATE TABLE core.master_code_sequences (
    org_id uuid NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code_kind varchar(32) NOT NULL,
    prefix varchar(16) NOT NULL,
    suffix varchar(8) DEFAULT ''::text NOT NULL,
    padding smallint NOT NULL,
    next_value bigint NOT NULL,
    last_allocated_at timestamptz,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamptz DEFAULT transaction_timestamp() NOT NULL,
    created_by_membership_id uuid DEFAULT current_setting('app.membership_id')::uuid NOT NULL,
    updated_at timestamptz DEFAULT transaction_timestamp() NOT NULL,
    updated_by_membership_id uuid DEFAULT current_setting('app.membership_id')::uuid NOT NULL,
    row_version bigint DEFAULT 1 NOT NULL,
    CONSTRAINT master_code_sequences_pkey PRIMARY KEY (org_id,id),
    CONSTRAINT master_code_sequences_kind_uq UNIQUE (org_id,code_kind),
    CONSTRAINT master_code_sequences_org_fk FOREIGN KEY (org_id)
      REFERENCES core.organizations(id) ON DELETE RESTRICT,
    CONSTRAINT master_code_sequences_created_by_fk FOREIGN KEY (
      org_id,created_by_membership_id
    ) REFERENCES core.memberships(org_id,id) ON DELETE RESTRICT,
    CONSTRAINT master_code_sequences_updated_by_fk FOREIGN KEY (
      org_id,updated_by_membership_id
    ) REFERENCES core.memberships(org_id,id) ON DELETE RESTRICT,
    CONSTRAINT master_code_sequences_kind_ck CHECK (
      code_kind IN ('customer','supplier','product')
    ),
    CONSTRAINT master_code_sequences_format_ck CHECK (
      prefix = upper(btrim(prefix))
      AND suffix = upper(btrim(suffix))
      AND prefix ~ '^[A-Z0-9._/-]+$'
      AND suffix ~ '^[A-Z0-9._/-]*$'
      AND padding BETWEEN 1 AND 18
      AND pg_catalog.length(prefix)+padding+pg_catalog.length(suffix) <= 32
    ),
    CONSTRAINT master_code_sequences_value_ck CHECK (next_value > 0),
    CONSTRAINT master_code_sequences_status_ck CHECK (status IN ('active','closed')),
    CONSTRAINT master_code_sequences_row_version_ck CHECK (row_version > 0)
);
ALTER TABLE core.master_code_sequences OWNER TO erp_migration_owner;
REVOKE ALL ON TABLE core.master_code_sequences FROM PUBLIC, erp_app, erp_runtime;
ALTER TABLE core.master_code_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.master_code_sequences FORCE ROW LEVEL SECURITY;
CREATE POLICY master_code_sequences_owner_policy
  ON core.master_code_sequences
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

CREATE FUNCTION erp_master_commands.guard_master_code_sequence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='master code sequences cannot be deleted';
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'active' OR NEW.next_value<1 OR NEW.row_version<>1 THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='new master code sequence is invalid';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status='closed' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='closed master code sequence is immutable';
  END IF;
  IF OLD.status='active' AND NEW.status NOT IN ('active','closed') THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='invalid master code sequence lifecycle';
  END IF;
  IF ROW(NEW.org_id,NEW.id,NEW.code_kind,NEW.prefix,NEW.suffix,NEW.padding,
         NEW.created_at,NEW.created_by_membership_id)
     IS DISTINCT FROM
     ROW(OLD.org_id,OLD.id,OLD.code_kind,OLD.prefix,OLD.suffix,OLD.padding,
         OLD.created_at,OLD.created_by_membership_id) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='master code sequence identity and format are immutable';
  END IF;
  IF NEW.next_value IS DISTINCT FROM OLD.next_value THEN
    IF NOT erp_core_commands.scope_active('master_code_allocate',NEW.org_id,NEW.id)
       OR NEW.next_value<>OLD.next_value+1
       OR NEW.last_allocated_at IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='master codes allocate exactly once through the canonical command';
    END IF;
  ELSIF NEW.last_allocated_at IS DISTINCT FROM OLD.last_allocated_at THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='master code allocation evidence cannot change independently';
  END IF;
  IF NEW.row_version<>OLD.row_version+1 THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='master code sequence row version must advance exactly once';
  END IF;
  RETURN NEW;
END
$function$;
ALTER FUNCTION erp_master_commands.guard_master_code_sequence() OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_master_commands.guard_master_code_sequence()
  FROM PUBLIC,erp_app,erp_runtime;
CREATE TRIGGER master_code_sequences_command_guard
  BEFORE INSERT OR UPDATE OR DELETE ON core.master_code_sequences
  FOR EACH ROW EXECUTE FUNCTION erp_master_commands.guard_master_code_sequence();

CREATE TRIGGER core_master_code_sequences_audit_trg
  AFTER INSERT OR UPDATE OR DELETE ON core.master_code_sequences
  FOR EACH ROW EXECUTE FUNCTION erp_plumbing.audit_row_mutation();

CREATE FUNCTION erp_master_commands.guard_assigned_master_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE old_code text; new_code text;
BEGIN
  IF TG_TABLE_SCHEMA='catalog' AND TG_TABLE_NAME='products' THEN
    old_code:=OLD.sku; new_code:=NEW.sku;
  ELSIF TG_TABLE_SCHEMA='parties' AND TG_TABLE_NAME='customer_accounts' THEN
    old_code:=OLD.customer_code; new_code:=NEW.customer_code;
  ELSIF TG_TABLE_SCHEMA='parties' AND TG_TABLE_NAME='supplier_accounts' THEN
    old_code:=OLD.supplier_code; new_code:=NEW.supplier_code;
  ELSE
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='master code guard is attached to an unsupported relation';
  END IF;
  IF new_code IS DISTINCT FROM old_code THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='assigned master codes are immutable';
  END IF;
  RETURN NEW;
END
$function$;
ALTER FUNCTION erp_master_commands.guard_assigned_master_code() OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_master_commands.guard_assigned_master_code()
  FROM PUBLIC,erp_app,erp_runtime;
CREATE TRIGGER products_assigned_code_guard
  BEFORE UPDATE ON catalog.products
  FOR EACH ROW EXECUTE FUNCTION erp_master_commands.guard_assigned_master_code();
CREATE TRIGGER customer_accounts_assigned_code_guard
  BEFORE UPDATE ON parties.customer_accounts
  FOR EACH ROW EXECUTE FUNCTION erp_master_commands.guard_assigned_master_code();
CREATE TRIGGER supplier_accounts_assigned_code_guard
  BEFORE UPDATE ON parties.supplier_accounts
  FOR EACH ROW EXECUTE FUNCTION erp_master_commands.guard_assigned_master_code();

CREATE FUNCTION erp_master_commands.allocate_code(
  organization_id uuid,
  requested_code_kind text,
  actor_membership_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE sequence_row core.master_code_sequences%ROWTYPE; allocated_code text;
BEGIN
  SELECT * INTO STRICT sequence_row
    FROM core.master_code_sequences sequence
   WHERE sequence.org_id=organization_id
     AND sequence.code_kind=requested_code_kind
     AND sequence.status='active'
   FOR UPDATE;
  allocated_code:=sequence_row.prefix
    || pg_catalog.lpad(sequence_row.next_value::text,sequence_row.padding,'0')
    || sequence_row.suffix;
  IF pg_catalog.length(allocated_code)>32
     OR allocated_code !~ '^[A-Z0-9][A-Z0-9._/-]*$' THEN
    RAISE EXCEPTION USING ERRCODE='22003', MESSAGE='master code sequence is exhausted or invalid';
  END IF;
  INSERT INTO erp_core_commands.command_scopes(
    backend_pid,transaction_id,scope,org_id,entity_id
  ) VALUES (
    pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),
    'master_code_allocate',organization_id,sequence_row.id
  );
  UPDATE core.master_code_sequences
     SET next_value=next_value+1,
         last_allocated_at=transaction_timestamp(),
         updated_at=transaction_timestamp(),
         updated_by_membership_id=actor_membership_id,
         row_version=row_version+1
   WHERE org_id=organization_id AND id=sequence_row.id
     AND status='active' AND next_value=sequence_row.next_value;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='master code sequence changed before allocation';
  END IF;
  DELETE FROM erp_core_commands.command_scopes
   WHERE backend_pid=pg_catalog.pg_backend_pid()
     AND transaction_id=pg_catalog.txid_current()
     AND scope='master_code_allocate'
     AND org_id=organization_id AND entity_id=sequence_row.id;
  RETURN allocated_code;
END
$function$;
ALTER FUNCTION erp_master_commands.allocate_code(uuid,text,uuid)
  OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_master_commands.allocate_code(uuid,text,uuid)
  FROM PUBLIC,erp_app,erp_runtime;

CREATE FUNCTION erp_master_commands.create_customer(
  organization_id uuid,
  customer_name text,
  customer_type text,
  primary_phone text,
  primary_email text,
  contact_person_name text,
  address_line1 text,
  address_line2 text,
  city text,
  state_code text,
  postal_code text,
  gstin text,
  pan text,
  credit_limit numeric,
  credit_days integer,
  idempotency_key_hash bytea,
  idempotency_expires_at timestamptz
)
RETURNS TABLE(
  customer_account_id uuid,
  party_id uuid,
  customer_code text,
  idempotency_replayed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE actor_id uuid; claim core.idempotency_keys%ROWTYPE;
        request_document jsonb; generated_code text; party_identifier uuid;
        account_identifier uuid; receivable_account_id uuid; posting_count integer;
BEGIN
  actor_id:=erp_core_commands.assert_context(
    organization_id,'parties.customer.manage',NULL::uuid
  );
  request_document:=pg_catalog.jsonb_build_object(
    'operation','parties.customer.create','customer_name',customer_name,
    'customer_type',customer_type,'primary_phone',primary_phone,
    'primary_email',primary_email,'contact_person_name',contact_person_name,
    'address_line1',address_line1,'address_line2',address_line2,'city',city,
    'state_code',state_code,'postal_code',postal_code,'gstin',gstin,'pan',pan,
    'credit_limit',credit_limit,'credit_days',credit_days
  );
  claim:=erp_core_commands.claim(
    organization_id,actor_id,'parties.customer.create',idempotency_key_hash,
    request_document,idempotency_expires_at
  );
  IF claim.status='succeeded' THEN
    SELECT account.id,account.party_id,account.customer_code,true
     INTO STRICT customer_account_id,party_id,customer_code,idempotency_replayed
      FROM parties.customer_accounts account
     WHERE account.org_id=organization_id AND account.id=claim.resource_id
       AND claim.resource_type='parties.customer_accounts';
    RETURN NEXT; RETURN;
  END IF;
  IF customer_name IS NULL OR btrim(customer_name)=''
     OR customer_type IS NULL
     OR customer_type NOT IN ('individual','organization')
     OR primary_phone IS NULL OR primary_phone !~ '^[0-9]{10}$'
     OR (primary_email IS NOT NULL AND btrim(primary_email)='')
     OR pan IS NOT NULL AND pan !~ '^[A-Z]{5}[0-9]{4}[A-Z]$'
     OR gstin IS NOT NULL AND gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'
     OR pg_catalog.num_nonnulls(address_line1,city,state_code,postal_code) NOT IN (0,4)
     OR state_code IS NOT NULL AND state_code !~ '^[0-9]{2}$'
     OR postal_code IS NOT NULL AND postal_code !~ '^[0-9]{6}$'
     OR gstin IS NOT NULL AND state_code IS DISTINCT FROM left(gstin,2)
     OR credit_limit IS NULL OR credit_limit<0
     OR credit_days IS NULL OR credit_days NOT BETWEEN 0 AND 365 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='customer master facts are invalid';
  END IF;
  SELECT count(*),(array_agg(account.id ORDER BY account.code,account.id))[1]
    INTO posting_count,receivable_account_id
    FROM finance.accounts account
   WHERE account.org_id=organization_id AND account.account_type='asset'
     AND account.allows_party_posting AND account.status='active'
     AND account.currency_code='INR';
  IF posting_count<>1 THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='exactly one customer receivable posting account is required';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    organization_id::text||':party-name:'||pg_catalog.lower(pg_catalog.btrim(customer_name)),
    8727001
  ));
  IF EXISTS (
    SELECT 1 FROM parties.parties party
     WHERE party.org_id=organization_id
       AND pg_catalog.lower(pg_catalog.btrim(party.legal_name))=
           pg_catalog.lower(pg_catalog.btrim(customer_name))
       AND party.status IN ('draft','active','blocked')
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='party legal name already exists';
  END IF;
  generated_code:=erp_master_commands.allocate_code(organization_id,'customer',actor_id);
  party_identifier:=gen_random_uuid(); account_identifier:=gen_random_uuid();
  INSERT INTO parties.parties(
    org_id,id,party_kind,legal_name,pan,status,
    created_by_membership_id,updated_by_membership_id
  ) VALUES (
    organization_id,party_identifier,customer_type,customer_name,pan,'draft',actor_id,actor_id
  );
  INSERT INTO parties.contacts(
    org_id,party_id,contact_kind,name,email,phone,is_primary,status,
    created_by_membership_id,updated_by_membership_id
  ) VALUES (
    organization_id,party_identifier,'business',
    coalesce(nullif(contact_person_name,''),customer_name),primary_email,primary_phone,
    true,'active',actor_id,actor_id
  );
  IF address_line1 IS NOT NULL THEN
    INSERT INTO parties.addresses(
      org_id,party_id,address_kind,line1,line2,city,state_code,postal_code,
      country_code,is_primary,status,created_by_membership_id,updated_by_membership_id
    ) VALUES (
      organization_id,party_identifier,'billing',address_line1,address_line2,city,
      state_code,postal_code,'IN',true,'active',actor_id,actor_id
    );
  END IF;
  IF gstin IS NOT NULL THEN
    INSERT INTO parties.tax_registrations(
      org_id,party_id,registration_type,registration_number,
      registered_legal_name,state_code,taxpayer_type,status,
      created_by_membership_id,updated_by_membership_id
    ) VALUES (
      organization_id,party_identifier,'GSTIN',gstin,customer_name,state_code,
      'regular','pending_verification',actor_id,actor_id
    );
  END IF;
  UPDATE parties.parties
     SET status='active',updated_at=transaction_timestamp(),
         updated_by_membership_id=actor_id,row_version=row_version+1
   WHERE org_id=organization_id AND id=party_identifier AND status='draft';
  INSERT INTO parties.customer_accounts(
    org_id,id,party_id,customer_code,credit_limit,credit_days,
    default_receivable_account_id,status,created_by_membership_id,updated_by_membership_id
  ) VALUES (
    organization_id,account_identifier,party_identifier,generated_code,
    credit_limit,credit_days,receivable_account_id,'active',actor_id,actor_id
  );
  PERFORM erp_core_commands.finish_claim(
    organization_id,claim.id,'parties.customer_accounts',account_identifier,
    pg_catalog.jsonb_build_object(
      'customer_account_id',account_identifier,'party_id',party_identifier,
      'customer_code',generated_code
    )
  );
  customer_account_id:=account_identifier; party_id:=party_identifier;
  customer_code:=generated_code; idempotency_replayed:=false;
  RETURN NEXT;
END
$function$;

CREATE FUNCTION erp_master_commands.create_supplier(
  organization_id uuid,
  supplier_name text,
  primary_phone text,
  primary_email text,
  contact_person_name text,
  address_line1 text,
  address_line2 text,
  city text,
  state_code text,
  postal_code text,
  gstin text,
  pan text,
  payment_days integer,
  idempotency_key_hash bytea,
  idempotency_expires_at timestamptz
)
RETURNS TABLE(
  supplier_account_id uuid,
  party_id uuid,
  supplier_code text,
  idempotency_replayed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE actor_id uuid; claim core.idempotency_keys%ROWTYPE;
        request_document jsonb; generated_code text; party_identifier uuid;
        account_identifier uuid; payable_account_id uuid; posting_count integer;
BEGIN
  actor_id:=erp_core_commands.assert_context(
    organization_id,'parties.supplier.manage',NULL::uuid
  );
  request_document:=pg_catalog.jsonb_build_object(
    'operation','parties.supplier.create','supplier_name',supplier_name,
    'primary_phone',primary_phone,'primary_email',primary_email,
    'contact_person_name',contact_person_name,'address_line1',address_line1,
    'address_line2',address_line2,'city',city,'state_code',state_code,
    'postal_code',postal_code,'gstin',gstin,'pan',pan,'payment_days',payment_days
  );
  claim:=erp_core_commands.claim(
    organization_id,actor_id,'parties.supplier.create',idempotency_key_hash,
    request_document,idempotency_expires_at
  );
  IF claim.status='succeeded' THEN
    SELECT account.id,account.party_id,account.supplier_code,true
     INTO STRICT supplier_account_id,party_id,supplier_code,idempotency_replayed
      FROM parties.supplier_accounts account
     WHERE account.org_id=organization_id AND account.id=claim.resource_id
       AND claim.resource_type='parties.supplier_accounts';
    RETURN NEXT; RETURN;
  END IF;
  IF supplier_name IS NULL OR btrim(supplier_name)=''
     OR primary_phone IS NOT NULL AND primary_phone !~ '^[0-9]{10}$'
     OR (primary_email IS NOT NULL AND btrim(primary_email)='')
     OR pan IS NOT NULL AND pan !~ '^[A-Z]{5}[0-9]{4}[A-Z]$'
     OR gstin IS NOT NULL AND gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'
     OR pg_catalog.num_nonnulls(address_line1,city,state_code,postal_code) NOT IN (0,4)
     OR state_code IS NOT NULL AND state_code !~ '^[0-9]{2}$'
     OR postal_code IS NOT NULL AND postal_code !~ '^[0-9]{6}$'
     OR gstin IS NOT NULL AND state_code IS DISTINCT FROM left(gstin,2)
     OR payment_days IS NULL OR payment_days NOT BETWEEN 0 AND 180 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='supplier master facts are invalid';
  END IF;
  SELECT count(*),(array_agg(account.id ORDER BY account.code,account.id))[1]
    INTO posting_count,payable_account_id
    FROM finance.accounts account
   WHERE account.org_id=organization_id AND account.account_type='liability'
     AND account.allows_party_posting AND account.status='active'
     AND account.currency_code='INR';
  IF posting_count<>1 THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='exactly one supplier payable posting account is required';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    organization_id::text||':party-name:'||pg_catalog.lower(pg_catalog.btrim(supplier_name)),
    8727001
  ));
  IF EXISTS (
    SELECT 1 FROM parties.parties party
     WHERE party.org_id=organization_id
       AND pg_catalog.lower(pg_catalog.btrim(party.legal_name))=
           pg_catalog.lower(pg_catalog.btrim(supplier_name))
       AND party.status IN ('draft','active','blocked')
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='party legal name already exists';
  END IF;
  generated_code:=erp_master_commands.allocate_code(organization_id,'supplier',actor_id);
  party_identifier:=gen_random_uuid(); account_identifier:=gen_random_uuid();
  INSERT INTO parties.parties(
    org_id,id,party_kind,legal_name,pan,status,
    created_by_membership_id,updated_by_membership_id
  ) VALUES (
    organization_id,party_identifier,'organization',supplier_name,pan,'draft',actor_id,actor_id
  );
  IF primary_phone IS NOT NULL OR primary_email IS NOT NULL THEN
    INSERT INTO parties.contacts(
      org_id,party_id,contact_kind,name,email,phone,is_primary,status,
      created_by_membership_id,updated_by_membership_id
    ) VALUES (
      organization_id,party_identifier,'business',
      coalesce(nullif(contact_person_name,''),supplier_name),primary_email,primary_phone,
      true,'active',actor_id,actor_id
    );
  END IF;
  IF address_line1 IS NOT NULL THEN
    INSERT INTO parties.addresses(
      org_id,party_id,address_kind,line1,line2,city,state_code,postal_code,
      country_code,is_primary,status,created_by_membership_id,updated_by_membership_id
    ) VALUES (
      organization_id,party_identifier,'billing',address_line1,address_line2,city,
      state_code,postal_code,'IN',true,'active',actor_id,actor_id
    );
  END IF;
  IF gstin IS NOT NULL THEN
    INSERT INTO parties.tax_registrations(
      org_id,party_id,registration_type,registration_number,
      registered_legal_name,state_code,taxpayer_type,status,
      created_by_membership_id,updated_by_membership_id
    ) VALUES (
      organization_id,party_identifier,'GSTIN',gstin,supplier_name,state_code,
      'regular','pending_verification',actor_id,actor_id
    );
  END IF;
  UPDATE parties.parties
     SET status='active',updated_at=transaction_timestamp(),
         updated_by_membership_id=actor_id,row_version=row_version+1
   WHERE org_id=organization_id AND id=party_identifier AND status='draft';
  INSERT INTO parties.supplier_accounts(
    org_id,id,party_id,supplier_code,payment_days,default_payable_account_id,
    status,created_by_membership_id,updated_by_membership_id
  ) VALUES (
    organization_id,account_identifier,party_identifier,generated_code,
    payment_days,payable_account_id,'active',actor_id,actor_id
  );
  PERFORM erp_core_commands.finish_claim(
    organization_id,claim.id,'parties.supplier_accounts',account_identifier,
    pg_catalog.jsonb_build_object(
      'supplier_account_id',account_identifier,'party_id',party_identifier,
      'supplier_code',generated_code
    )
  );
  supplier_account_id:=account_identifier; party_id:=party_identifier;
  supplier_code:=generated_code; idempotency_replayed:=false;
  RETURN NEXT;
END
$function$;

CREATE FUNCTION erp_master_commands.create_product_draft(
  organization_id uuid,
  product_name text,
  generic_name text,
  product_kind text,
  idempotency_key_hash bytea,
  idempotency_expires_at timestamptz
)
RETURNS TABLE(
  product_id uuid,
  product_code text,
  idempotency_replayed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE actor_id uuid; claim core.idempotency_keys%ROWTYPE;
        request_document jsonb; generated_code text; product_identifier uuid;
BEGIN
  actor_id:=erp_core_commands.assert_context(
    organization_id,'catalog.product.manage',NULL::uuid
  );
  request_document:=pg_catalog.jsonb_build_object(
    'operation','catalog.product_draft.create','product_name',product_name,
    'generic_name',generic_name,'product_kind',product_kind
  );
  claim:=erp_core_commands.claim(
    organization_id,actor_id,'catalog.product_draft.create',idempotency_key_hash,
    request_document,idempotency_expires_at
  );
  IF claim.status='succeeded' THEN
    SELECT product.id,product.sku,true
     INTO STRICT product_id,product_code,idempotency_replayed
      FROM catalog.products product
     WHERE product.org_id=organization_id AND product.id=claim.resource_id
       AND claim.resource_type='catalog.products';
    RETURN NEXT; RETURN;
  END IF;
  IF product_name IS NULL OR btrim(product_name)=''
     OR product_kind IS NULL
     OR product_kind NOT IN ('medicine','medical_device','consumable') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='product draft identity is invalid';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    organization_id::text||':product-name:'||pg_catalog.lower(pg_catalog.btrim(product_name)),
    8727002
  ));
  IF EXISTS (
    SELECT 1 FROM catalog.products product
     WHERE product.org_id=organization_id
       AND pg_catalog.lower(pg_catalog.btrim(product.name))=
           pg_catalog.lower(pg_catalog.btrim(product_name))
       AND product.status IN ('draft','active','blocked')
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='product name already exists';
  END IF;
  generated_code:=erp_master_commands.allocate_code(organization_id,'product',actor_id);
  product_identifier:=gen_random_uuid();
  INSERT INTO catalog.products(
    org_id,id,sku,product_kind,name,generic_name,base_uom_code,hsn_code,
    cold_chain_required,status,created_by_membership_id,updated_by_membership_id
  ) VALUES (
    organization_id,product_identifier,generated_code,product_kind,product_name,
    generic_name,'EA','0000',false,'draft',actor_id,actor_id
  );
  PERFORM erp_core_commands.finish_claim(
    organization_id,claim.id,'catalog.products',product_identifier,
    pg_catalog.jsonb_build_object(
      'product_id',product_identifier,'product_code',generated_code
    )
  );
  product_id:=product_identifier; product_code:=generated_code;
  idempotency_replayed:=false;
  RETURN NEXT;
END
$function$;

ALTER FUNCTION erp_master_commands.create_customer(
  uuid,text,text,text,text,text,text,text,text,text,text,text,text,numeric,integer,bytea,timestamptz
) OWNER TO erp_migration_owner;
ALTER FUNCTION erp_master_commands.create_supplier(
  uuid,text,text,text,text,text,text,text,text,text,text,text,integer,bytea,timestamptz
) OWNER TO erp_migration_owner;
ALTER FUNCTION erp_master_commands.create_product_draft(
  uuid,text,text,text,bytea,timestamptz
) OWNER TO erp_migration_owner;

REVOKE ALL ON FUNCTION erp_master_commands.create_customer(
  uuid,text,text,text,text,text,text,text,text,text,text,text,text,numeric,integer,bytea,timestamptz
) FROM PUBLIC,erp_app,erp_runtime;
REVOKE ALL ON FUNCTION erp_master_commands.create_supplier(
  uuid,text,text,text,text,text,text,text,text,text,text,text,integer,bytea,timestamptz
) FROM PUBLIC,erp_app,erp_runtime;
REVOKE ALL ON FUNCTION erp_master_commands.create_product_draft(
  uuid,text,text,text,bytea,timestamptz
) FROM PUBLIC,erp_app,erp_runtime;
GRANT USAGE ON SCHEMA erp_master_commands TO erp_runtime;
GRANT EXECUTE ON FUNCTION erp_master_commands.create_customer(
  uuid,text,text,text,text,text,text,text,text,text,text,text,text,numeric,integer,bytea,timestamptz
) TO erp_runtime;
GRANT EXECUTE ON FUNCTION erp_master_commands.create_supplier(
  uuid,text,text,text,text,text,text,text,text,text,text,text,integer,bytea,timestamptz
) TO erp_runtime;
GRANT EXECUTE ON FUNCTION erp_master_commands.create_product_draft(
  uuid,text,text,text,bytea,timestamptz
) TO erp_runtime;

REVOKE INSERT ON TABLE catalog.products FROM erp_app,erp_runtime;
REVOKE INSERT ON TABLE parties.customer_accounts FROM erp_app,erp_runtime;
REVOKE INSERT ON TABLE parties.supplier_accounts FROM erp_app,erp_runtime;

RESET ROLE;
