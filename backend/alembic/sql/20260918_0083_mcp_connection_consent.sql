SET LOCAL ROLE erp_migration_owner;
-- Explicit connection selection is a receipt, never a permission grant.
CREATE TABLE erp_security.mcp_connection_receipts (
    subject_auth_user_id uuid NOT NULL,
    client_id varchar(255) NOT NULL,
    org_id uuid NOT NULL,
    agent_grant_id uuid NOT NULL,
    receipt_id uuid NOT NULL DEFAULT gen_random_uuid(),
    proposal_fingerprint text NOT NULL CHECK (proposal_fingerprint ~ '^[0-9a-f]{64}$'),
    consented_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    PRIMARY KEY (subject_auth_user_id, client_id),
    FOREIGN KEY (org_id, agent_grant_id) REFERENCES automation.agent_grants(org_id,id) ON DELETE CASCADE
);
ALTER TABLE erp_security.mcp_connection_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_security.mcp_connection_receipts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON erp_security.mcp_connection_receipts FROM PUBLIC, erp_app, erp_runtime;

CREATE FUNCTION erp_core_commands.mcp_connection_proposals(verified_subject uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' SET row_security=off SET timezone='UTC'
AS $function$
SELECT COALESCE(jsonb_agg(proposal ORDER BY proposal->>'organization_name',proposal->>'client_id',proposal->>'agent_grant_id'),'[]'::jsonb)
FROM (
 SELECT visible || jsonb_build_object('proposal_fingerprint',
   encode(extensions.digest(convert_to((visible || private_snapshot)::text,'UTF8'),'sha256'),'hex')) AS proposal
 FROM (
  SELECT jsonb_build_object(
    'subject',user_row.auth_user_id,'organization_id',g.org_id,'organization_name',o.legal_name,
    'membership_id',m.id,'agent_grant_id',g.id,'client_id',g.client_id,
    'client_display_name',g.client_display_name,'branch_id',g.branch_id,'branch_name',b.name,
    'consent_version',g.consent_version,'expires_at',g.expires_at,'capabilities',caps.visible
  ) AS visible,
  jsonb_build_object('grant_snapshot',to_jsonb(g),'capability_snapshot',caps.snapshot) AS private_snapshot
  FROM automation.agent_grants g
  JOIN core.memberships m ON m.org_id=g.org_id AND m.id=g.subject_membership_id
  JOIN core.users user_row ON user_row.id=m.user_id
  JOIN core.organizations o ON o.id=g.org_id
  LEFT JOIN core.branches b ON b.org_id=g.org_id AND b.id=g.branch_id
  CROSS JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
      'capability_code',c.capability_code,'operation_mode',c.operation_mode,
      'risk_class',c.risk_class,'approval_policy',c.approval_policy,
      'maximum_amount',c.maximum_amount::text,'currency_code',c.currency_code,
      'allow_sensitive_read',c.allow_sensitive_read) ORDER BY c.capability_code) AS visible,
      jsonb_agg(to_jsonb(c) ORDER BY c.capability_code) AS snapshot
    FROM automation.agent_grant_capabilities c
    WHERE c.org_id=g.org_id AND c.agent_grant_id=g.id AND c.status='active'
  ) caps
  WHERE user_row.auth_user_id=verified_subject AND user_row.status='active'
    AND m.status='active' AND m.joined_at IS NOT NULL AND m.revoked_at IS NULL
    AND o.status='active' AND (g.branch_id IS NULL OR b.status='active')
    AND g.status='active' AND g.consented_by_membership_id=m.id
    AND g.expires_at>transaction_timestamp() AND caps.visible IS NOT NULL
    AND EXISTS (SELECT 1 FROM core.access_grants a
      WHERE a.org_id=m.org_id AND a.membership_id=m.id AND a.status='active'
      AND a.valid_from_at<=transaction_timestamp()
      AND (a.expires_at IS NULL OR a.expires_at>transaction_timestamp())
      AND ((a.scope_kind='organization' AND a.branch_id IS NULL)
        OR (g.branch_id IS NOT NULL AND a.scope_kind='branch' AND a.branch_id=g.branch_id)))
 ) facts
) proposals;
$function$;
REVOKE ALL ON FUNCTION erp_core_commands.mcp_connection_proposals(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erp_core_commands.mcp_connection_proposals(uuid) TO erp_app;

CREATE FUNCTION erp_core_commands.confirm_mcp_connection(
 verified_subject uuid, requested_org uuid, requested_client text,
 requested_grant uuid, reviewed_fingerprint text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET row_security=off
AS $function$
DECLARE selected jsonb; receipt uuid;
BEGIN
 PERFORM erp_security.activate_context(verified_subject,requested_org);
 -- Lock the existing grant; never create, activate, or expand one.
 PERFORM 1 FROM automation.agent_grants g
  WHERE g.org_id=requested_org AND g.id=requested_grant FOR SHARE;
 SELECT proposal INTO selected
 FROM jsonb_array_elements(erp_core_commands.mcp_connection_proposals(verified_subject)) proposal
 WHERE proposal->>'organization_id'=requested_org::text
   AND proposal->>'agent_grant_id'=requested_grant::text
   AND proposal->>'client_id'=requested_client
   AND proposal->>'proposal_fingerprint'=reviewed_fingerprint;
 IF selected IS NULL THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='reviewed MCP connection proposal changed or is unavailable';
 END IF;
 INSERT INTO erp_security.mcp_connection_receipts AS saved
  (subject_auth_user_id,client_id,org_id,agent_grant_id,proposal_fingerprint)
 VALUES (verified_subject,requested_client,requested_org,requested_grant,reviewed_fingerprint)
 ON CONFLICT (subject_auth_user_id,client_id) DO UPDATE
 SET org_id=EXCLUDED.org_id,agent_grant_id=EXCLUDED.agent_grant_id,
     proposal_fingerprint=EXCLUDED.proposal_fingerprint,
     receipt_id=CASE WHEN (saved.org_id,saved.agent_grant_id,saved.proposal_fingerprint)
       IS NOT DISTINCT FROM (EXCLUDED.org_id,EXCLUDED.agent_grant_id,EXCLUDED.proposal_fingerprint)
       THEN saved.receipt_id ELSE gen_random_uuid() END,
     consented_at=transaction_timestamp()
 RETURNING receipt_id INTO receipt;
 RETURN jsonb_build_object('confirmed',true,'receipt_id',receipt,
   'organization_id',requested_org,'agent_grant_id',requested_grant,'client_id',requested_client);
END;
$function$;
REVOKE ALL ON FUNCTION erp_core_commands.confirm_mcp_connection(uuid,uuid,text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erp_core_commands.confirm_mcp_connection(uuid,uuid,text,uuid,text) TO erp_app;

CREATE FUNCTION erp_security.mcp_connection_claim(verified_subject uuid, verified_client text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' SET row_security=off
AS $function$
 SELECT jsonb_build_object('version','erp_mcp_connection_v1','receipt_id',r.receipt_id,
   'organization_id',r.org_id,'agent_grant_id',r.agent_grant_id,
   'consent_version',p->>'consent_version','proposal_fingerprint',r.proposal_fingerprint)
 FROM erp_security.mcp_connection_receipts r
 CROSS JOIN LATERAL jsonb_array_elements(erp_core_commands.mcp_connection_proposals(verified_subject)) p
 WHERE r.subject_auth_user_id=verified_subject AND r.client_id=verified_client
   AND p->>'client_id'=r.client_id AND p->>'organization_id'=r.org_id::text
   AND p->>'agent_grant_id'=r.agent_grant_id::text
   AND p->>'proposal_fingerprint'=r.proposal_fingerprint;
$function$;
REVOKE ALL ON FUNCTION erp_security.mcp_connection_claim(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erp_security.mcp_connection_claim(uuid,text) TO supabase_auth_admin;

CREATE FUNCTION erp_core_commands.mcp_connection_receipt_matches(
 verified_subject uuid,verified_client text,supplied_receipt jsonb
) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET row_security=off
AS $function$
BEGIN
 IF verified_subject::text IS DISTINCT FROM current_setting('app.auth_user_id',true)
    OR supplied_receipt->>'organization_id' IS DISTINCT FROM current_setting('app.org_id',true) THEN
   RETURN false;
 END IF;
 RETURN COALESCE(erp_security.mcp_connection_claim(verified_subject,verified_client)=supplied_receipt,false);
END;
$function$;
REVOKE ALL ON FUNCTION erp_core_commands.mcp_connection_receipt_matches(uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION erp_core_commands.mcp_connection_receipt_matches(uuid,text,jsonb) TO erp_app;

-- Keep the configured provider URI and original service hook implementation.
ALTER FUNCTION erp_security.canonical_evidence_storage_access_token_hook(jsonb)
 RENAME TO evidence_storage_access_token_hook_v1;
CREATE FUNCTION erp_security.canonical_evidence_storage_access_token_hook(event jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=''
AS $function$
DECLARE result jsonb; claims jsonb; receipt jsonb; client text; subject uuid;
BEGIN
 result := erp_security.evidence_storage_access_token_hook_v1(event);
 claims := (result->'claims')-'erp_mcp_connection';
 client := claims->>'client_id';
 IF client IS NOT NULL THEN
   IF event->>'user_id' IS DISTINCT FROM claims->>'sub' THEN
     RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='OAuth token subject differs from Auth event';
   END IF;
   subject := (claims->>'sub')::uuid;
   receipt := erp_security.mcp_connection_claim(subject,client);
   IF receipt IS NOT NULL THEN
     claims := jsonb_set(claims,ARRAY['erp_mcp_connection'],receipt,true);
   END IF;
 END IF;
 RETURN jsonb_build_object('claims',claims);
END;
$function$;
REVOKE ALL ON FUNCTION erp_security.canonical_evidence_storage_access_token_hook(jsonb) FROM PUBLIC,erp_app,erp_runtime;
GRANT EXECUTE ON FUNCTION erp_security.canonical_evidence_storage_access_token_hook(jsonb) TO supabase_auth_admin;

RESET ROLE;
