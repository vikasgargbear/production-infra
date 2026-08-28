SET LOCAL ROLE erp_migration_owner;

CREATE INDEX idempotency_keys_invitation_lookup_idx
  ON core.idempotency_keys(org_id,operation,idempotency_key_hash,id)
  WHERE status='claimed';

-- Initial organization creation and invitation acceptance have a verified Auth
-- subject but, by definition, no executable ERP membership yet.  Admit only the
-- two ungrantable command scopes below as system actors; erp_app cannot write the
-- scope table directly, so ordinary runtime writes still require a membership.
CREATE OR REPLACE FUNCTION erp_plumbing.audit_row_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $audit_function$
DECLARE
    before_row jsonb;
    after_row jsonb;
    resource_row jsonb;
    event_org_id uuid;
    event_resource_id uuid;
    event_actor_id uuid;
    event_request_id uuid;
    event_command_id uuid;
    event_actor_kind text;
    event_source_ip inet;
    regulatory_import_scope boolean;
    provider_completion_scope boolean;
    authenticated_onboarding_scope boolean;
    before_hash bytea;
    after_hash bytea;
    prior_hash bytea;
    next_chain_sequence bigint;
    canonical_event jsonb;
BEGIN
    before_row := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN pg_catalog.to_jsonb(OLD) ELSE NULL END;
    after_row := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN pg_catalog.to_jsonb(NEW) ELSE NULL END;
    resource_row := COALESCE(after_row, before_row);
    event_org_id := COALESCE(
        NULLIF(resource_row ->> 'org_id', '')::uuid,
        CASE WHEN TG_TABLE_SCHEMA = 'core' AND TG_TABLE_NAME = 'organizations'
             THEN NULLIF(resource_row ->> 'id', '')::uuid END,
        NULLIF(pg_catalog.current_setting('app.org_id', true), '')::uuid
    );
    IF event_org_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'audited mutation lacks organization context';
    END IF;
    event_request_id := NULLIF(pg_catalog.current_setting('app.request_id', true), '')::uuid;
    IF event_request_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'audited mutation lacks request id';
    END IF;
    event_actor_id := NULLIF(pg_catalog.current_setting('app.membership_id', true), '')::uuid;
    regulatory_import_scope := SESSION_USER = 'erp_regulatory_importer'
      AND EXISTS (
        SELECT 1 FROM erp_regulatory_commands.command_scopes AS scope
         WHERE scope.backend_pid=pg_catalog.pg_backend_pid()
           AND scope.transaction_id=pg_catalog.txid_current()
           AND scope.scope='reference_import'
      );
    provider_completion_scope := SESSION_USER = 'erp_tax_provider'
      AND EXISTS (
        SELECT 1 FROM erp_tax_provider_commands.command_scopes AS scope
         WHERE scope.backend_pid=pg_catalog.pg_backend_pid()
           AND scope.transaction_id=pg_catalog.txid_current()
           AND scope.scope='provider_complete'
      );
    authenticated_onboarding_scope := EXISTS (
        SELECT 1 FROM erp_core_commands.command_scopes AS scope
         WHERE scope.backend_pid=pg_catalog.pg_backend_pid()
           AND scope.transaction_id=pg_catalog.txid_current()
           AND scope.scope IN ('authenticated_organization_onboard','authenticated_invitation_accept')
           AND scope.org_id=event_org_id
           AND scope.entity_id=event_org_id
      );
    IF event_actor_id IS NULL
       AND NOT pg_catalog.pg_has_role(SESSION_USER, 'erp_migration_owner', 'MEMBER')
       AND NOT regulatory_import_scope
       AND NOT provider_completion_scope
       AND NOT authenticated_onboarding_scope THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'runtime audited mutation lacks actor membership';
    END IF;
    event_actor_kind := CASE
      WHEN event_actor_id IS NOT NULL THEN 'membership'
      WHEN regulatory_import_scope OR provider_completion_scope OR authenticated_onboarding_scope THEN 'system'
      ELSE 'migration'
    END;
    event_command_id := NULLIF(pg_catalog.current_setting('app.command_request_id', true), '')::uuid;
    event_source_ip := NULLIF(pg_catalog.current_setting('app.source_ip', true), '')::inet;
    event_resource_id := CASE
        WHEN COALESCE(resource_row ->> 'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN (resource_row ->> 'id')::uuid ELSE NULL END;
    before_hash := CASE WHEN before_row IS NULL THEN NULL ELSE extensions.digest(pg_catalog.convert_to(before_row::text, 'UTF8'), 'sha256') END;
    after_hash := CASE WHEN after_row IS NULL THEN NULL ELSE extensions.digest(pg_catalog.convert_to(after_row::text, 'UTF8'), 'sha256') END;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(event_org_id::text, 9042026));
    SELECT event.chain_sequence + 1, event.evidence_hash INTO next_chain_sequence, prior_hash
      FROM core.audit_events AS event
     WHERE event.org_id = event_org_id
     ORDER BY event.chain_sequence DESC
     LIMIT 1
     FOR UPDATE;
    next_chain_sequence := COALESCE(next_chain_sequence, 1);
    canonical_event := pg_catalog.jsonb_build_object(
        'version', 'pg-jsonb-sha256-v1', 'org_id', event_org_id,
        'chain_sequence', next_chain_sequence, 'request_id', event_request_id,
        'command_request_id', event_command_id, 'actor_membership_id', event_actor_id,
        'actor_kind', event_actor_kind, 'event_type', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME || '.' || pg_catalog.lower(TG_OP),
        'resource_type', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, 'resource_id', event_resource_id,
        'mutation_kind', pg_catalog.lower(TG_OP), 'before_state_hash', pg_catalog.encode(before_hash, 'hex'),
        'after_state_hash', pg_catalog.encode(after_hash, 'hex'), 'previous_event_hash', pg_catalog.encode(prior_hash, 'hex')
    );
    INSERT INTO core.audit_events (
        org_id, chain_sequence, actor_membership_id, actor_kind, event_type, resource_type, resource_id,
        request_id, command_request_id, mutation_kind, summary, evidence_version,
        before_state_hash, after_state_hash, evidence_hash, previous_event_hash, source_ip, user_agent
    ) VALUES (
        event_org_id, next_chain_sequence, event_actor_id, event_actor_kind,
        TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME || '.' || pg_catalog.lower(TG_OP),
        TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, event_resource_id, event_request_id,
        event_command_id, pg_catalog.lower(TG_OP), pg_catalog.lower(TG_OP) || ' ' || TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,
        'pg-jsonb-sha256-v1', before_hash, after_hash,
        extensions.digest(pg_catalog.convert_to(canonical_event::text, 'UTF8'), 'sha256'),
        prior_hash, event_source_ip, NULLIF(pg_catalog.current_setting('app.user_agent', true), '')
    );
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END
$audit_function$;
ALTER FUNCTION erp_plumbing.audit_row_mutation() OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_plumbing.audit_row_mutation() FROM PUBLIC,erp_app,erp_runtime;

CREATE FUNCTION erp_core_commands.resolve_auth_organization(
  verified_auth_user_id uuid
)
RETURNS TABLE(org_id uuid,resolution text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE organization_count integer;
BEGIN
  IF verified_auth_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='verified Auth subject is required';
  END IF;
  SELECT count(DISTINCT membership.org_id)
    INTO organization_count
    FROM core.users canonical_user
    JOIN core.memberships membership ON membership.user_id=canonical_user.id
    JOIN core.organizations organization ON organization.id=membership.org_id
   WHERE canonical_user.auth_user_id=verified_auth_user_id
     AND canonical_user.status='active'
     AND membership.status='active' AND membership.joined_at IS NOT NULL
     AND membership.revoked_at IS NULL AND organization.status='active';
  resolution:=CASE organization_count
    WHEN 0 THEN 'no_active_membership'
    WHEN 1 THEN 'exactly_one_active_membership'
    ELSE 'multiple_active_memberships'
  END;
  IF organization_count=1 THEN
    SELECT membership.org_id INTO STRICT org_id
      FROM core.users canonical_user
      JOIN core.memberships membership ON membership.user_id=canonical_user.id
      JOIN core.organizations organization ON organization.id=membership.org_id
     WHERE canonical_user.auth_user_id=verified_auth_user_id
       AND canonical_user.status='active' AND membership.status='active'
       AND membership.joined_at IS NOT NULL AND membership.revoked_at IS NULL
       AND organization.status='active'
     ORDER BY membership.org_id LIMIT 1;
  ELSE
    org_id:=NULL;
  END IF;
  RETURN NEXT;
END
$function$;
ALTER FUNCTION erp_core_commands.resolve_auth_organization(uuid) OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_core_commands.resolve_auth_organization(uuid) FROM PUBLIC,erp_runtime;
GRANT EXECUTE ON FUNCTION erp_core_commands.resolve_auth_organization(uuid) TO erp_app;

CREATE FUNCTION erp_core_commands.onboard_organization(
  verified_auth_user_id uuid,
  verified_email text,
  display_name text,
  legal_name text,
  trade_name text,
  address_line1 text,
  city text,
  state_code text,
  postal_code text
)
RETURNS TABLE(org_id uuid,membership_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
#variable_conflict use_variable
DECLARE
  canonical_user_id uuid;
  owner_role_id uuid:=gen_random_uuid();
  main_branch_id uuid:=gen_random_uuid();
  owner_grant_id uuid:=gen_random_uuid();
  existing_count integer;
  request_id uuid;
BEGIN
  request_id:=NULLIF(pg_catalog.current_setting('app.request_id',true),'')::uuid;
  IF request_id IS NULL OR verified_auth_user_id IS NULL
     OR pg_catalog.btrim(coalesce(verified_email,''))=''
     OR pg_catalog.btrim(coalesce(display_name,''))=''
     OR pg_catalog.btrim(coalesce(legal_name,''))=''
     OR pg_catalog.btrim(coalesce(address_line1,''))=''
     OR pg_catalog.btrim(coalesce(city,''))=''
     OR pg_catalog.btrim(coalesce(state_code,'')) !~ '^[0-9]{2}$'
     OR pg_catalog.btrim(coalesce(postal_code,'')) !~ '^[1-9][0-9]{5}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='verified identity and complete Indian organization address are required';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(verified_auth_user_id::text,470001));
  SELECT count(*) INTO existing_count
    FROM core.users canonical_user
    JOIN core.memberships membership ON membership.user_id=canonical_user.id
    JOIN core.organizations organization ON organization.id=membership.org_id
   WHERE canonical_user.auth_user_id=verified_auth_user_id
     AND canonical_user.status='active' AND membership.status='active'
     AND organization.status='active';
  IF existing_count=1 THEN
    SELECT membership.org_id,membership.id INTO STRICT org_id,membership_id
      FROM core.users canonical_user
      JOIN core.memberships membership ON membership.user_id=canonical_user.id
      JOIN core.organizations organization ON organization.id=membership.org_id
     WHERE canonical_user.auth_user_id=verified_auth_user_id
       AND canonical_user.status='active' AND membership.status='active'
       AND organization.status='active';
    RETURN NEXT; RETURN;
  END IF;
  IF existing_count>1 THEN
    RAISE EXCEPTION USING ERRCODE='21000',MESSAGE='verified Auth subject has multiple active ERP memberships';
  END IF;
  SELECT id INTO canonical_user_id FROM core.users
   WHERE auth_user_id=verified_auth_user_id FOR UPDATE;
  IF canonical_user_id IS NULL THEN canonical_user_id:=gen_random_uuid(); END IF;
  org_id:=gen_random_uuid();
  membership_id:=gen_random_uuid();
  PERFORM pg_catalog.set_config('app.org_id',org_id::text,true);
  PERFORM pg_catalog.set_config('app.auth_user_id',verified_auth_user_id::text,true);
  PERFORM pg_catalog.set_config('app.user_id',canonical_user_id::text,true);
  PERFORM pg_catalog.set_config('app.membership_id','',true);
  INSERT INTO erp_core_commands.command_scopes(
    backend_pid,transaction_id,scope,org_id,entity_id
  ) VALUES (
    pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),
    'authenticated_organization_onboard',org_id,org_id
  );
  SET CONSTRAINTS ALL DEFERRED;
  INSERT INTO core.organizations(
    id,legal_name,trade_name,registered_address_line1,registered_city,
    registered_state_code,registered_postal_code,status,
    created_by_membership_id,updated_by_membership_id
  ) VALUES (
    org_id,pg_catalog.btrim(legal_name),NULLIF(pg_catalog.btrim(trade_name),''),
    pg_catalog.btrim(address_line1),pg_catalog.btrim(city),
    pg_catalog.btrim(state_code),pg_catalog.btrim(postal_code),
    'active',membership_id,membership_id
  );
  IF EXISTS(SELECT 1 FROM core.users WHERE id=canonical_user_id) THEN
    UPDATE core.users SET display_name=pg_catalog.btrim(display_name),status='active',
      updated_at=pg_catalog.transaction_timestamp(),row_version=row_version+1
     WHERE id=canonical_user_id AND auth_user_id=verified_auth_user_id;
  ELSE
    INSERT INTO core.users(id,auth_user_id,display_name,status)
    VALUES(canonical_user_id,verified_auth_user_id,pg_catalog.btrim(display_name),'active');
  END IF;
  INSERT INTO core.memberships(
    org_id,id,user_id,status,joined_at,created_by_membership_id,updated_by_membership_id
  ) VALUES (
    org_id,membership_id,canonical_user_id,'active',pg_catalog.transaction_timestamp(),
    membership_id,membership_id
  );
  PERFORM pg_catalog.set_config('app.membership_id',membership_id::text,true);
  DELETE FROM erp_core_commands.command_scopes AS command_scope
   WHERE command_scope.backend_pid=pg_catalog.pg_backend_pid()
     AND command_scope.transaction_id=pg_catalog.txid_current()
     AND command_scope.scope='authenticated_organization_onboard'
     AND command_scope.org_id=org_id AND command_scope.entity_id=org_id;
  INSERT INTO core.roles(
    org_id,id,code,name,description,is_system,status,
    created_by_membership_id,updated_by_membership_id
  ) VALUES (
    org_id,owner_role_id,'organization_owner','Organization Owner',
    'Initial organization owner with all active canonical permissions.',true,'active',
    membership_id,membership_id
  );
  INSERT INTO core.role_permissions(org_id,role_id,permission_code,created_by_membership_id)
  SELECT org_id,owner_role_id,permission.code,membership_id
    FROM core.permissions permission WHERE permission.status='active';
  INSERT INTO core.access_grants(
    org_id,id,membership_id,role_id,scope_kind,branch_id,status,created_by_membership_id
  ) VALUES (
    org_id,owner_grant_id,membership_id,owner_role_id,'organization',NULL,'active',membership_id
  );
  INSERT INTO core.branches(
    org_id,id,code,name,address_line1,city,state_code,postal_code,status,
    created_by_membership_id,updated_by_membership_id
  ) VALUES (
    org_id,main_branch_id,'MAIN','Main Branch',pg_catalog.btrim(address_line1),
    pg_catalog.btrim(city),pg_catalog.btrim(state_code),
    pg_catalog.btrim(postal_code),'active',membership_id,membership_id
  );
  RETURN NEXT;
END
$function$;
ALTER FUNCTION erp_core_commands.onboard_organization(uuid,text,text,text,text,text,text,text,text) OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_core_commands.onboard_organization(uuid,text,text,text,text,text,text,text,text) FROM PUBLIC,erp_runtime;
GRANT EXECUTE ON FUNCTION erp_core_commands.onboard_organization(uuid,text,text,text,text,text,text,text,text) TO erp_app;

CREATE FUNCTION erp_core_commands.create_organization_invitation(
  requested_invitation_id uuid,
  organization_id uuid,
  actor_membership_id uuid,
  target_email text,
  requested_role_id uuid,
  requested_scope_kind text,
  requested_branch_id uuid,
  token_digest bytea,
  requested_issued_at timestamptz,
  requested_expires_at timestamptz
)
RETURNS TABLE(invitation_id uuid,org_id uuid,email text,expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
#variable_conflict use_variable
DECLARE actor_id uuid; normalized_email text; request_document jsonb; request_hash bytea;
        invitation core.idempotency_keys%ROWTYPE;
BEGIN
  actor_id:=erp_core_commands.assert_context(organization_id,'core.user.manage',NULL::uuid);
  IF NOT erp_security.has_permission('core.access.manage',NULL::uuid) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='organization invitation requires access administration';
  END IF;
  normalized_email:=pg_catalog.lower(pg_catalog.btrim(coalesce(target_email,'')));
  requested_issued_at:=pg_catalog.date_trunc('second',requested_issued_at);
  requested_expires_at:=pg_catalog.date_trunc('second',requested_expires_at);
  IF actor_id IS DISTINCT FROM actor_membership_id OR requested_invitation_id IS NULL
     OR normalized_email='' OR pg_catalog.length(normalized_email)>320
     OR pg_catalog.octet_length(token_digest)<>32
     OR requested_issued_at<pg_catalog.transaction_timestamp()-interval '5 minutes'
     OR requested_issued_at>pg_catalog.transaction_timestamp()+interval '1 minute'
     OR requested_expires_at<=pg_catalog.transaction_timestamp()
     OR requested_expires_at>requested_issued_at+interval '30 days'
     OR requested_scope_kind NOT IN ('organization','branch')
     OR (requested_scope_kind='organization')<>(requested_branch_id IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='organization invitation claims are invalid';
  END IF;
  PERFORM 1 FROM core.roles role
   WHERE role.org_id=organization_id AND role.id=requested_role_id AND role.status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='invitation role is unavailable'; END IF;
  IF requested_branch_id IS NOT NULL THEN
    PERFORM 1 FROM core.branches branch
     WHERE branch.org_id=organization_id AND branch.id=requested_branch_id AND branch.status='active' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='invitation branch is unavailable'; END IF;
  END IF;
  request_document:=pg_catalog.jsonb_build_object(
    'version','aasopharma-organization-invitation-v1',
    'audience','aasopharma-erp-onboarding','purpose','organization_invitation',
    'invitation_id',requested_invitation_id,'organization_id',organization_id,
    'inviting_membership_id',actor_membership_id,'email',normalized_email,
    'role_id',requested_role_id,'scope_kind',requested_scope_kind,
    'branch_id',requested_branch_id,'issued_at',requested_issued_at,
    'expires_at',requested_expires_at
  );
  request_hash:=extensions.digest(pg_catalog.convert_to(request_document::text,'UTF8'),'sha256');
  INSERT INTO core.idempotency_keys(
    org_id,id,actor_membership_id,operation,idempotency_key_hash,request_hash,expires_at
  ) VALUES (
    organization_id,requested_invitation_id,actor_membership_id,'core.organization.invitation',
    token_digest,request_hash,requested_expires_at
  ) ON CONFLICT ON CONSTRAINT idempotency_keys_scope_uq DO NOTHING;
  SELECT * INTO STRICT invitation FROM core.idempotency_keys claim
   WHERE claim.org_id=organization_id AND claim.id=requested_invitation_id
     AND claim.actor_membership_id=actor_membership_id
     AND claim.operation='core.organization.invitation'
     AND claim.idempotency_key_hash=token_digest FOR UPDATE;
  IF invitation.request_hash IS DISTINCT FROM request_hash
     OR invitation.expires_at IS DISTINCT FROM requested_expires_at
     OR invitation.status<>'claimed' THEN
    RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='invitation identity was claimed by a different request';
  END IF;
  create_organization_invitation.invitation_id:=invitation.id;
  org_id:=organization_id;
  email:=normalized_email;
  create_organization_invitation.expires_at:=invitation.expires_at;
  RETURN NEXT;
END
$function$;
ALTER FUNCTION erp_core_commands.create_organization_invitation(uuid,uuid,uuid,text,uuid,text,uuid,bytea,timestamptz,timestamptz) OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_core_commands.create_organization_invitation(uuid,uuid,uuid,text,uuid,text,uuid,bytea,timestamptz,timestamptz) FROM PUBLIC,erp_runtime;
GRANT EXECUTE ON FUNCTION erp_core_commands.create_organization_invitation(uuid,uuid,uuid,text,uuid,text,uuid,bytea,timestamptz,timestamptz) TO erp_app;

CREATE FUNCTION erp_core_commands.accept_organization_invitation(
  verified_auth_user_id uuid,
  verified_email text,
  display_name text,
  invitation_id uuid,
  inviting_org_id uuid,
  inviting_membership_id uuid,
  requested_role_id uuid,
  requested_scope_kind text,
  requested_branch_id uuid,
  token_digest bytea,
  issued_at timestamptz,
  expires_at timestamptz
)
RETURNS TABLE(org_id uuid,membership_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
#variable_conflict use_variable
DECLARE normalized_email text; request_document jsonb; request_hash bytea;
        invitation core.idempotency_keys%ROWTYPE; canonical_user_id uuid;
        existing_membership core.memberships%ROWTYPE; grant_id uuid:=gen_random_uuid();
BEGIN
  normalized_email:=pg_catalog.lower(pg_catalog.btrim(coalesce(verified_email,'')));
  issued_at:=pg_catalog.date_trunc('second',issued_at);
  expires_at:=pg_catalog.date_trunc('second',expires_at);
  IF NULLIF(pg_catalog.current_setting('app.request_id',true),'')::uuid IS NULL
     OR verified_auth_user_id IS NULL OR invitation_id IS NULL OR normalized_email=''
     OR pg_catalog.btrim(coalesce(display_name,''))=''
     OR pg_catalog.octet_length(token_digest)<>32
     OR requested_scope_kind NOT IN ('organization','branch')
     OR (requested_scope_kind='organization')<>(requested_branch_id IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='verified invitation acceptance claims are invalid';
  END IF;
  request_document:=pg_catalog.jsonb_build_object(
    'version','aasopharma-organization-invitation-v1',
    'audience','aasopharma-erp-onboarding','purpose','organization_invitation',
    'invitation_id',invitation_id,'organization_id',inviting_org_id,
    'inviting_membership_id',inviting_membership_id,'email',normalized_email,
    'role_id',requested_role_id,'scope_kind',requested_scope_kind,
    'branch_id',requested_branch_id,'issued_at',issued_at,'expires_at',expires_at
  );
  request_hash:=extensions.digest(pg_catalog.convert_to(request_document::text,'UTF8'),'sha256');
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(invitation_id::text,470002));
  SELECT * INTO invitation FROM core.idempotency_keys claim
   WHERE claim.org_id=inviting_org_id AND claim.id=invitation_id
     AND claim.actor_membership_id=inviting_membership_id
     AND claim.operation='core.organization.invitation'
     AND claim.idempotency_key_hash=token_digest FOR UPDATE;
  IF invitation.id IS NULL OR invitation.request_hash IS DISTINCT FROM request_hash
     OR invitation.expires_at IS DISTINCT FROM expires_at THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='invitation token claims are invalid';
  END IF;
  IF invitation.status='succeeded' THEN
    SELECT membership.org_id,membership.id INTO org_id,membership_id
      FROM core.memberships membership JOIN core.users canonical_user ON canonical_user.id=membership.user_id
     WHERE membership.org_id=inviting_org_id AND membership.id=invitation.resource_id
       AND membership.status='active' AND canonical_user.auth_user_id=verified_auth_user_id;
    IF membership_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='invitation was consumed by another identity';
    END IF;
    RETURN NEXT; RETURN;
  END IF;
  IF invitation.status<>'claimed' OR invitation.expires_at<=pg_catalog.transaction_timestamp()
     OR expires_at<=issued_at OR expires_at>issued_at+interval '30 days' THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='invitation is expired or already terminal';
  END IF;
  PERFORM 1 FROM core.memberships membership
    JOIN core.organizations organization ON organization.id=membership.org_id
   WHERE membership.org_id=inviting_org_id AND membership.id=inviting_membership_id
     AND membership.status='active' AND organization.status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='inviting membership is no longer active'; END IF;
  PERFORM 1 FROM core.roles role
   WHERE role.org_id=inviting_org_id AND role.id=requested_role_id AND role.status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='invitation role is unavailable'; END IF;
  IF requested_branch_id IS NOT NULL THEN
    PERFORM 1 FROM core.branches branch
     WHERE branch.org_id=inviting_org_id AND branch.id=requested_branch_id AND branch.status='active' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='invitation branch is unavailable'; END IF;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(verified_auth_user_id::text,470001));
  PERFORM pg_catalog.set_config('app.org_id',inviting_org_id::text,true);
  PERFORM pg_catalog.set_config('app.auth_user_id',verified_auth_user_id::text,true);
  PERFORM pg_catalog.set_config('app.membership_id','',true);
  INSERT INTO erp_core_commands.command_scopes(
    backend_pid,transaction_id,scope,org_id,entity_id
  ) VALUES (
    pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),
    'authenticated_invitation_accept',inviting_org_id,inviting_org_id
  );
  SELECT id INTO canonical_user_id FROM core.users
   WHERE auth_user_id=verified_auth_user_id FOR UPDATE;
  IF canonical_user_id IS NULL THEN
    canonical_user_id:=gen_random_uuid();
    INSERT INTO core.users(id,auth_user_id,display_name,status)
    VALUES(canonical_user_id,verified_auth_user_id,pg_catalog.btrim(display_name),'active');
  ELSE
    PERFORM 1 FROM core.users WHERE id=canonical_user_id AND status='active';
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='canonical user is not active'; END IF;
  END IF;
  SELECT * INTO existing_membership FROM core.memberships membership
   WHERE membership.org_id=inviting_org_id AND membership.user_id=canonical_user_id FOR UPDATE;
  IF existing_membership.id IS NULL THEN
    membership_id:=gen_random_uuid();
    INSERT INTO core.memberships(
      org_id,id,user_id,status,joined_at,created_by_membership_id,updated_by_membership_id
    ) VALUES (
      inviting_org_id,membership_id,canonical_user_id,'active',pg_catalog.transaction_timestamp(),
      inviting_membership_id,inviting_membership_id
    );
  ELSIF existing_membership.status='invited' THEN
    membership_id:=existing_membership.id;
    UPDATE core.memberships SET status='active',joined_at=pg_catalog.transaction_timestamp(),
      updated_at=pg_catalog.transaction_timestamp(),updated_by_membership_id=inviting_membership_id,
      row_version=row_version+1
     WHERE org_id=inviting_org_id AND id=membership_id AND status='invited';
  ELSIF existing_membership.status='active' THEN
    membership_id:=existing_membership.id;
  ELSE
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='existing membership is not eligible for invitation acceptance';
  END IF;
  PERFORM pg_catalog.set_config('app.user_id',canonical_user_id::text,true);
  PERFORM pg_catalog.set_config('app.membership_id',membership_id::text,true);
  IF NOT EXISTS (
    SELECT 1 FROM core.access_grants access_grant
     WHERE access_grant.org_id=inviting_org_id
       AND access_grant.membership_id=membership_id
       AND access_grant.role_id=requested_role_id
       AND access_grant.scope_kind=requested_scope_kind
       AND access_grant.branch_id IS NOT DISTINCT FROM requested_branch_id
       AND access_grant.status='active'
  ) THEN
    INSERT INTO core.access_grants(
      org_id,id,membership_id,role_id,scope_kind,branch_id,status,created_by_membership_id
    ) VALUES (
      inviting_org_id,grant_id,membership_id,requested_role_id,requested_scope_kind,
      requested_branch_id,'active',inviting_membership_id
    );
  END IF;
  DELETE FROM erp_core_commands.command_scopes AS command_scope
   WHERE command_scope.backend_pid=pg_catalog.pg_backend_pid()
     AND command_scope.transaction_id=pg_catalog.txid_current()
     AND command_scope.scope='authenticated_invitation_accept'
     AND command_scope.org_id=inviting_org_id
     AND command_scope.entity_id=inviting_org_id;
  PERFORM erp_core_commands.finish_claim(
    inviting_org_id,invitation_id,'core.memberships',membership_id,
    pg_catalog.jsonb_build_object('organization_id',inviting_org_id,'membership_id',membership_id)
  );
  org_id:=inviting_org_id;
  RETURN NEXT;
END
$function$;
ALTER FUNCTION erp_core_commands.accept_organization_invitation(uuid,text,text,uuid,uuid,uuid,uuid,text,uuid,bytea,timestamptz,timestamptz) OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_core_commands.accept_organization_invitation(uuid,text,text,uuid,uuid,uuid,uuid,text,uuid,bytea,timestamptz,timestamptz) FROM PUBLIC,erp_runtime;
GRANT EXECUTE ON FUNCTION erp_core_commands.accept_organization_invitation(uuid,text,text,uuid,uuid,uuid,uuid,text,uuid,bytea,timestamptz,timestamptz) TO erp_app;

RESET ROLE;
