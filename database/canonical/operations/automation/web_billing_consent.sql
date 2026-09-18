-- First-party administrator self-consent. Never grants role permissions.
SET LOCAL ROLE erp_migration_owner;
CREATE FUNCTION erp_automation_commands.authorize_own_web_billing(
  organization_id uuid, branch_identifier uuid, maximum_invoice_amount numeric,
  consent_expiry timestamptz, idempotency_key_hash bytea
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  actor_id uuid; grant_identifier uuid; old_grant automation.agent_grants%ROWTYPE;
  request_document jsonb; claim core.idempotency_keys%ROWTYPE; permission_code text;
BEGIN
  actor_id:=erp_core_commands.assert_context(organization_id,'automation.agent_grant.manage',NULL::uuid);
  IF branch_identifier IS NULL OR NOT erp_security.can_access_branch(branch_identifier)
     OR NOT EXISTS(SELECT 1 FROM core.branches WHERE org_id=organization_id AND id=branch_identifier AND status='active') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='billing consent requires an accessible active branch';
  END IF;
  FOREACH permission_code IN ARRAY ARRAY['sales.invoice.create','sales.invoice.post',
    'automation.command.approve','automation.command.execute','automation.command.view','inventory.document.post'] LOOP
    PERFORM erp_core_commands.assert_context(organization_id,permission_code,branch_identifier);
  END LOOP;
  PERFORM erp_core_commands.assert_context(organization_id,'finance.journal.post',NULL::uuid);
  IF maximum_invoice_amount IS NULL OR maximum_invoice_amount<=0
     OR maximum_invoice_amount<>round(maximum_invoice_amount,2)
     OR maximum_invoice_amount>=1000000000000000000
     OR consent_expiry IS NULL OR NOT isfinite(consent_expiry)
     OR consent_expiry<=transaction_timestamp() THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='choose an explicit positive invoice limit and finite future expiry';
  END IF;
  request_document:=jsonb_build_object('operation','web.billing.authorize','org_id',organization_id,
    'subject_membership_id',actor_id,'client_id','aasopharma-erp-web','branch_id',branch_identifier,
    'maximum_invoice_amount',maximum_invoice_amount,'expires_at',consent_expiry,
    'consent_version','web-billing-admin-self-v1');
  claim:=erp_core_commands.claim(organization_id,actor_id,'web.billing.authorize',
    idempotency_key_hash,request_document,consent_expiry);
  IF claim.status='succeeded' THEN RETURN claim.resource_id; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(organization_id::text||':'||actor_id::text||':web-billing',0));
  FOR old_grant IN SELECT * FROM automation.agent_grants
    WHERE org_id=organization_id AND subject_membership_id=actor_id
      AND client_id='aasopharma-erp-web' AND status IN ('active','suspended')
      AND expires_at>transaction_timestamp() FOR UPDATE LOOP
    -- Never revoke/replace an unrelated or broader operator grant implicitly.
    IF old_grant.consent_version<>'web-billing-admin-self-v1' OR old_grant.branch_id<>branch_identifier THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='review and revoke existing web authority before creating billing consent';
    END IF;
    RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='active billing consent already exists; revoke it explicitly before renewal';
  END LOOP;
  grant_identifier:=gen_random_uuid();
  INSERT INTO automation.agent_grants(org_id,id,subject_membership_id,client_id,client_display_name,
    branch_id,authorization_mode,consent_version,consent_text_hash,consented_by_membership_id,
    consented_at,granted_by_membership_id,granted_at,expires_at,status,
    created_by_membership_id,updated_by_membership_id)
  VALUES(organization_id,grant_identifier,actor_id,'aasopharma-erp-web','ERP billing',branch_identifier,
    'self_consent','web-billing-admin-self-v1',extensions.digest(convert_to(request_document::text,'UTF8'),'sha256'),
    actor_id,transaction_timestamp(),actor_id,transaction_timestamp(),consent_expiry,'active',actor_id,actor_id);
  INSERT INTO automation.agent_grant_capabilities(org_id,agent_grant_id,capability_code,
    operation_mode,risk_class,approval_policy,maximum_amount,currency_code,allow_sensitive_read,status,created_by_membership_id)
  VALUES
    (organization_id,grant_identifier,'sales.invoice.prepare','write','consequential_write','actor_confirmation',maximum_invoice_amount,'INR',false,'active',actor_id),
    (organization_id,grant_identifier,'automation.command.approve','write','consequential_write','actor_confirmation',NULL,NULL,false,'active',actor_id),
    (organization_id,grant_identifier,'automation.command.execute','write','consequential_write','actor_confirmation',NULL,NULL,false,'active',actor_id),
    (organization_id,grant_identifier,'automation.command.status.get','read','read_only','none',NULL,NULL,false,'active',actor_id);
  PERFORM erp_core_commands.finish_claim(organization_id,claim.id,'automation.agent_grants',grant_identifier,
    jsonb_build_object('grant_id',grant_identifier));
  RETURN grant_identifier;
END $function$;
ALTER FUNCTION erp_automation_commands.authorize_own_web_billing(uuid,uuid,numeric,timestamptz,bytea) OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_automation_commands.authorize_own_web_billing(uuid,uuid,numeric,timestamptz,bytea) FROM PUBLIC,erp_app;
GRANT EXECUTE ON FUNCTION erp_automation_commands.authorize_own_web_billing(uuid,uuid,numeric,timestamptz,bytea) TO erp_runtime;

CREATE FUNCTION erp_automation_commands.revoke_own_web_billing(
  organization_id uuid, grant_identifier uuid, expected_row_version bigint
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE actor_id uuid; grant_row automation.agent_grants%ROWTYPE;
BEGIN
  actor_id:=erp_core_commands.assert_context(organization_id,NULL,NULL::uuid);
  SELECT * INTO grant_row FROM automation.agent_grants WHERE org_id=organization_id AND id=grant_identifier FOR UPDATE;
  IF NOT FOUND OR grant_row.subject_membership_id<>actor_id OR grant_row.client_id<>'aasopharma-erp-web'
     OR grant_row.consent_version<>'web-billing-admin-self-v1' THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='only the billing consent subject may revoke this consent';
  END IF;
  IF grant_row.status='revoked' THEN RETURN grant_identifier; END IF;
  IF grant_row.row_version<>expected_row_version OR expected_row_version IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='billing consent version changed';
  END IF;
  UPDATE automation.agent_grants SET status='revoked',revoked_at=transaction_timestamp(),
    revoked_by_membership_id=actor_id,revocation_reason='Explicit subject revocation',
    updated_by_membership_id=actor_id,updated_at=transaction_timestamp(),row_version=row_version+1
    WHERE org_id=organization_id AND id=grant_identifier;
  UPDATE automation.agent_grant_capabilities SET status='revoked',revoked_at=transaction_timestamp(),revoked_by_membership_id=actor_id
    WHERE org_id=organization_id AND agent_grant_id=grant_identifier AND status='active';
  RETURN grant_identifier;
END $function$;
ALTER FUNCTION erp_automation_commands.revoke_own_web_billing(uuid,uuid,bigint) OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_automation_commands.revoke_own_web_billing(uuid,uuid,bigint) FROM PUBLIC,erp_app;
GRANT EXECUTE ON FUNCTION erp_automation_commands.revoke_own_web_billing(uuid,uuid,bigint) TO erp_runtime;
RESET ROLE;
