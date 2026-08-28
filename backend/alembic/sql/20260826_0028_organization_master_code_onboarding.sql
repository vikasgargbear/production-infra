SET LOCAL ROLE erp_migration_owner;

ALTER TABLE core.master_code_sequences
  ADD CONSTRAINT master_code_sequences_capacity_ck CHECK (
    next_value <= pg_catalog.power(10::numeric,padding)
  );

DROP POLICY master_code_sequences_owner_policy ON core.master_code_sequences;
CREATE POLICY master_code_sequences_owner_policy
  ON core.master_code_sequences
  FOR ALL TO erp_migration_owner
  USING (
    (
      org_id=erp_security.current_org_id()
      AND erp_security.current_membership_id() IS NOT NULL
      AND erp_security.current_actor_is_active()
    )
    OR erp_core_commands.scope_active(
      'organization_master_code_onboard',org_id,org_id
    )
  )
  WITH CHECK (
    (
      org_id=erp_security.current_org_id()
      AND erp_security.current_membership_id() IS NOT NULL
      AND erp_security.current_actor_is_active()
    )
    OR erp_core_commands.scope_active(
      'organization_master_code_onboard',org_id,org_id
    )
  );

CREATE OR REPLACE FUNCTION erp_master_commands.allocate_code(
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
  IF pg_catalog.length(sequence_row.next_value::text)>sequence_row.padding THEN
    RAISE EXCEPTION USING ERRCODE='22003',
      MESSAGE='master code sequence is exhausted or invalid';
  END IF;
  allocated_code:=sequence_row.prefix
    || pg_catalog.lpad(sequence_row.next_value::text,sequence_row.padding,'0')
    || sequence_row.suffix;
  IF pg_catalog.length(allocated_code)>32
     OR allocated_code !~ '^[A-Z0-9][A-Z0-9._/-]*$' THEN
    RAISE EXCEPTION USING ERRCODE='22003',
      MESSAGE='master code sequence is exhausted or invalid';
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
    RAISE EXCEPTION USING ERRCODE='40001',
      MESSAGE='master code sequence changed before allocation';
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

CREATE FUNCTION erp_master_commands.assigned_code_conflicts(
  organization_id uuid,
  requested_code_kind text,
  requested_prefix text,
  requested_suffix text,
  requested_padding smallint,
  requested_next_value bigint
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
  WITH assigned(code) AS (
    SELECT account.customer_code
      FROM parties.customer_accounts account
     WHERE requested_code_kind='customer' AND account.org_id=organization_id
    UNION ALL
    SELECT account.supplier_code
      FROM parties.supplier_accounts account
     WHERE requested_code_kind='supplier' AND account.org_id=organization_id
    UNION ALL
    SELECT product.sku
      FROM catalog.products product
     WHERE requested_code_kind='product' AND product.org_id=organization_id
  ), matching AS (
    SELECT pg_catalog.substring(
             code,pg_catalog.length(requested_prefix)+1,requested_padding
           ) AS numeric_part
      FROM assigned
     WHERE pg_catalog.length(code)=
             pg_catalog.length(requested_prefix)+requested_padding+
             pg_catalog.length(requested_suffix)
       AND pg_catalog.left(code,pg_catalog.length(requested_prefix))=
             requested_prefix
       AND pg_catalog.right(code,pg_catalog.length(requested_suffix))=
             requested_suffix
  )
  SELECT EXISTS (
    SELECT 1
      FROM matching
     WHERE numeric_part ~ '^[0-9]+$'
       AND numeric_part::numeric >= requested_next_value
  )
$function$;
ALTER FUNCTION erp_master_commands.assigned_code_conflicts(
  uuid,text,text,text,smallint,bigint
) OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_master_commands.assigned_code_conflicts(
  uuid,text,text,text,smallint,bigint
) FROM PUBLIC,erp_app,erp_runtime;

CREATE FUNCTION erp_master_commands.provision_organization_code_sequences(
  organization_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  actor_id uuid;
  configuration record;
  sequence_row core.master_code_sequences%ROWTYPE;
  sequence_found boolean;
  provisioned_count integer;
BEGIN
  IF erp_core_commands.scope_active(
       'organization_master_code_onboard',organization_id,organization_id
     ) THEN
    actor_id:=erp_security.current_membership_id();
    IF actor_id IS NULL OR NOT erp_security.current_actor_is_active() THEN
      RAISE EXCEPTION USING ERRCODE='42501',
        MESSAGE='organization onboarding requires an active membership';
    END IF;
  ELSE
    actor_id:=erp_core_commands.assert_context(
      organization_id,'core.organization.manage',NULL::uuid
    );
  END IF;

  PERFORM 1
    FROM core.organizations organization
   WHERE organization.id=organization_id
     AND organization.status IN ('provisioning','active')
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002',
      MESSAGE='organization is not available for canonical onboarding';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    organization_id::text||':master-code-onboarding',8728001
  ));

  FOR configuration IN
    SELECT *
      FROM (VALUES
        ('customer'::text,'CUST-'::text,''::text,6::smallint),
        ('supplier'::text,'SUP-'::text,''::text,6::smallint),
        ('product'::text,'PROD-'::text,''::text,6::smallint)
      ) AS reviewed(code_kind,prefix,suffix,padding)
  LOOP
    IF configuration.prefix<>pg_catalog.upper(pg_catalog.btrim(configuration.prefix))
       OR configuration.suffix<>pg_catalog.upper(pg_catalog.btrim(configuration.suffix))
       OR configuration.prefix !~ '^[A-Z0-9._/-]+$'
       OR configuration.suffix !~ '^[A-Z0-9._/-]*$'
       OR configuration.padding NOT BETWEEN 1 AND 18
       OR pg_catalog.length(configuration.prefix)+configuration.padding+
            pg_catalog.length(configuration.suffix)>32 THEN
      RAISE EXCEPTION USING ERRCODE='22023',
        MESSAGE='reviewed master code default format is invalid';
    END IF;

    sequence_row:=NULL;
    SELECT * INTO sequence_row
      FROM core.master_code_sequences sequence
     WHERE sequence.org_id=organization_id
       AND sequence.code_kind=configuration.code_kind
     FOR UPDATE;
    sequence_found:=FOUND;

    IF sequence_found THEN
      IF sequence_row.status<>'active'
         OR sequence_row.prefix<>pg_catalog.upper(pg_catalog.btrim(sequence_row.prefix))
         OR sequence_row.suffix<>pg_catalog.upper(pg_catalog.btrim(sequence_row.suffix))
         OR sequence_row.prefix !~ '^[A-Z0-9._/-]+$'
         OR sequence_row.suffix !~ '^[A-Z0-9._/-]*$'
         OR sequence_row.padding NOT BETWEEN 1 AND 18
         OR pg_catalog.length(sequence_row.prefix)+sequence_row.padding+
              pg_catalog.length(sequence_row.suffix)>32
         OR sequence_row.next_value<1
         OR sequence_row.next_value>
              pg_catalog.power(10::numeric,sequence_row.padding) THEN
        RAISE EXCEPTION USING ERRCODE='23514',
          MESSAGE='existing master code sequence is not an active valid configuration';
      END IF;
      IF erp_master_commands.assigned_code_conflicts(
           organization_id,sequence_row.code_kind,sequence_row.prefix,
           sequence_row.suffix,sequence_row.padding,sequence_row.next_value
         ) THEN
        RAISE EXCEPTION USING ERRCODE='23505',
          MESSAGE='master code sequence collides with an assigned code';
      END IF;
    ELSE
      IF erp_master_commands.assigned_code_conflicts(
           organization_id,configuration.code_kind,configuration.prefix,
           configuration.suffix,configuration.padding,1
         ) THEN
        RAISE EXCEPTION USING ERRCODE='23505',
          MESSAGE='reviewed master code default collides with an assigned code';
      END IF;
      INSERT INTO core.master_code_sequences(
        org_id,code_kind,prefix,suffix,padding,next_value,status,
        created_by_membership_id,updated_by_membership_id
      ) VALUES (
        organization_id,configuration.code_kind,configuration.prefix,
        configuration.suffix,configuration.padding,1,'active',actor_id,actor_id
      );
    END IF;
  END LOOP;

  SELECT count(*) INTO provisioned_count
    FROM core.master_code_sequences sequence
   WHERE sequence.org_id=organization_id AND sequence.status='active'
     AND sequence.code_kind IN ('customer','supplier','product');
  IF provisioned_count<>3 THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='canonical organization onboarding requires exactly three active master code sequences';
  END IF;
  RETURN provisioned_count;
END
$function$;
ALTER FUNCTION erp_master_commands.provision_organization_code_sequences(uuid)
  OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_master_commands.provision_organization_code_sequences(uuid)
  FROM PUBLIC,erp_app,erp_runtime;
GRANT EXECUTE ON FUNCTION erp_master_commands.provision_organization_code_sequences(uuid)
  TO erp_runtime;

CREATE FUNCTION erp_master_commands.onboard_active_membership_master_codes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  previous_org text;
  previous_membership text;
  previous_auth_user text;
  previous_request text;
  auth_user_id uuid;
BEGIN
  IF NEW.status<>'active' THEN
    RETURN NEW;
  END IF;
  IF TG_OP='UPDATE' AND OLD.status='active' THEN
    RETURN NEW;
  END IF;

  previous_org:=pg_catalog.current_setting('app.org_id',true);
  previous_membership:=pg_catalog.current_setting('app.membership_id',true);
  previous_auth_user:=pg_catalog.current_setting('app.auth_user_id',true);
  previous_request:=pg_catalog.current_setting('app.request_id',true);
  SELECT canonical_user.auth_user_id INTO auth_user_id
    FROM core.users canonical_user
   WHERE canonical_user.id=NEW.user_id;

  PERFORM pg_catalog.set_config('app.org_id',NEW.org_id::text,true);
  PERFORM pg_catalog.set_config('app.membership_id',NEW.id::text,true);
  PERFORM pg_catalog.set_config('app.auth_user_id',coalesce(auth_user_id::text,''),true);
  PERFORM pg_catalog.set_config(
    'app.request_id',coalesce(nullif(previous_request,''),gen_random_uuid()::text),true
  );
  INSERT INTO erp_core_commands.command_scopes(
    backend_pid,transaction_id,scope,org_id,entity_id
  ) VALUES (
    pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),
    'organization_master_code_onboard',NEW.org_id,NEW.org_id
  ) ON CONFLICT DO NOTHING;
  PERFORM erp_master_commands.provision_organization_code_sequences(NEW.org_id);
  DELETE FROM erp_core_commands.command_scopes
   WHERE backend_pid=pg_catalog.pg_backend_pid()
     AND transaction_id=pg_catalog.txid_current()
     AND scope='organization_master_code_onboard'
     AND org_id=NEW.org_id AND entity_id=NEW.org_id;
  PERFORM pg_catalog.set_config('app.org_id',coalesce(previous_org,''),true);
  PERFORM pg_catalog.set_config('app.membership_id',coalesce(previous_membership,''),true);
  PERFORM pg_catalog.set_config('app.auth_user_id',coalesce(previous_auth_user,''),true);
  PERFORM pg_catalog.set_config('app.request_id',coalesce(previous_request,''),true);
  RETURN NEW;
END
$function$;
ALTER FUNCTION erp_master_commands.onboard_active_membership_master_codes()
  OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_master_commands.onboard_active_membership_master_codes()
  FROM PUBLIC,erp_app,erp_runtime;
CREATE TRIGGER zz_memberships_master_code_onboarding_trg
  AFTER INSERT OR UPDATE OF status ON core.memberships
  FOR EACH ROW EXECUTE FUNCTION
    erp_master_commands.onboard_active_membership_master_codes();

DO $backfill$
DECLARE candidate record;
BEGIN
  FOR candidate IN
    SELECT organization.id AS org_id,membership.id AS membership_id,
           canonical_user.auth_user_id
      FROM core.organizations organization
      JOIN LATERAL (
        SELECT active_membership.id,active_membership.user_id
          FROM core.memberships active_membership
         WHERE active_membership.org_id=organization.id
           AND active_membership.status='active'
         ORDER BY active_membership.joined_at NULLS LAST,active_membership.id
         LIMIT 1
      ) membership ON true
      JOIN core.users canonical_user ON canonical_user.id=membership.user_id
     WHERE organization.status IN ('provisioning','active')
     ORDER BY organization.id
  LOOP
    PERFORM pg_catalog.set_config('app.org_id',candidate.org_id::text,true);
    PERFORM pg_catalog.set_config('app.membership_id',candidate.membership_id::text,true);
    PERFORM pg_catalog.set_config(
      'app.auth_user_id',coalesce(candidate.auth_user_id::text,''),true
    );
    PERFORM pg_catalog.set_config('app.request_id',gen_random_uuid()::text,true);
    INSERT INTO erp_core_commands.command_scopes(
      backend_pid,transaction_id,scope,org_id,entity_id
    ) VALUES (
      pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),
      'organization_master_code_onboard',candidate.org_id,candidate.org_id
    );
    PERFORM erp_master_commands.provision_organization_code_sequences(candidate.org_id);
    DELETE FROM erp_core_commands.command_scopes
     WHERE backend_pid=pg_catalog.pg_backend_pid()
       AND transaction_id=pg_catalog.txid_current()
       AND scope='organization_master_code_onboard'
       AND org_id=candidate.org_id AND entity_id=candidate.org_id;
  END LOOP;
  PERFORM pg_catalog.set_config('app.org_id','',true);
  PERFORM pg_catalog.set_config('app.membership_id','',true);
  PERFORM pg_catalog.set_config('app.auth_user_id','',true);
  PERFORM pg_catalog.set_config('app.request_id','',true);
END
$backfill$;

RESET ROLE;
