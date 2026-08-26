SET LOCAL ROLE erp_migration_owner;

CREATE OR REPLACE FUNCTION erp_automation_reads.requester_command_by_idempotency(
    organization_id uuid,
    expected_capability_code varchar(128),
    requester_client_id varchar(255),
    expected_idempotency_key_hash bytea
)
RETURNS TABLE (
    id uuid,
    status text,
    preview_hash bytea,
    completed_at timestamptz,
    result_resource_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
DECLARE
    actor_id uuid := erp_security.current_membership_id();
BEGIN
    IF organization_id IS DISTINCT FROM erp_security.current_org_id()
       OR actor_id IS NULL
       OR erp_security.current_actor_is_active() IS DISTINCT FROM true
       OR expected_capability_code IS NULL
       OR expected_capability_code = ''
       OR requester_client_id IS NULL
       OR requester_client_id = ''
       OR expected_idempotency_key_hash IS NULL
       OR pg_catalog.octet_length(expected_idempotency_key_hash) <> 32 THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'command idempotency read context is invalid';
    END IF;

    RETURN QUERY
    WITH candidates AS (
        SELECT request.id, request.status, request.preview_hash,
               request.completed_at,
               request.result_resource_id,
               count(*) OVER () AS candidate_count
          FROM automation.command_requests AS request
          JOIN automation.agent_grants AS agent_grant
            ON agent_grant.org_id = request.org_id
           AND agent_grant.id = request.agent_grant_id
          JOIN automation.agent_grant_capabilities AS capability
            ON capability.org_id = agent_grant.org_id
           AND capability.agent_grant_id = agent_grant.id
           AND capability.capability_code = request.capability_code
         WHERE request.org_id = organization_id
           AND request.requested_by_membership_id = actor_id
           AND request.capability_code = expected_capability_code
           AND request.idempotency_key_hash = expected_idempotency_key_hash
           AND agent_grant.subject_membership_id = actor_id
           AND agent_grant.consented_by_membership_id = actor_id
           AND agent_grant.client_id = requester_client_id
           AND agent_grant.status = 'active'
           AND agent_grant.expires_at > pg_catalog.transaction_timestamp()
           AND capability.status = 'active'
           AND request.operation_mode = capability.operation_mode
           AND request.risk_class = capability.risk_class
           AND request.approval_policy = capability.approval_policy
           AND (
                capability.maximum_amount IS NULL
                OR request.requested_amount IS NULL
                OR request.requested_amount <= capability.maximum_amount
           )
           AND (
                capability.currency_code IS NULL
                OR request.currency_code = capability.currency_code
           )
           AND (
                NOT request.requests_sensitive_read
                OR capability.allow_sensitive_read
           )
           AND (
                agent_grant.branch_id IS NULL
                OR (
                     agent_grant.branch_id = request.branch_id
                     AND (
                          request.destination_branch_id IS NULL
                          OR agent_grant.branch_id = request.destination_branch_id
                     )
                )
           )
           AND erp_security.can_access_branch(request.branch_id)
           AND (
                request.destination_branch_id IS NULL
                OR erp_security.can_access_branch(request.destination_branch_id)
           )
           AND request.request_hash = pg_catalog.sha256(request.request_bytes)
           AND request.preview_hash = pg_catalog.sha256(request.preview_bytes)
           AND (
                request.response_bytes IS NULL
                OR request.response_hash = pg_catalog.sha256(request.response_bytes)
           )
    )
    SELECT candidate.id, candidate.status, candidate.preview_hash,
           candidate.completed_at,
           candidate.result_resource_id
      FROM candidates AS candidate
     WHERE candidate.candidate_count = 1;
END
$function$;

CREATE OR REPLACE FUNCTION erp_automation_reads.active_command_evidence_in_use(
    organization_id uuid,
    expected_capability_code varchar(128),
    evidence_field text,
    attachment_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
BEGIN
    IF organization_id IS DISTINCT FROM erp_security.current_org_id()
       OR erp_security.current_actor_is_active() IS DISTINCT FROM true
       OR (expected_capability_code, evidence_field) NOT IN (
            ('procurement.supplier_invoice.prepare', 'portal_document_line_id'),
            ('inventory.adjustment.prepare', 'evidence_attachment_id'),
            ('inventory.destruction.prepare', 'certificate_attachment_id')
       ) THEN
        RAISE EXCEPTION USING ERRCODE = '42501',
            MESSAGE = 'command evidence context is invalid';
    END IF;

    RETURN EXISTS (
        SELECT 1
          FROM automation.command_requests AS request
         WHERE request.org_id = organization_id
           AND request.capability_code = expected_capability_code
           AND request.status NOT IN ('failed', 'expired', 'cancelled')
           AND erp_security.can_access_branch(request.branch_id)
           AND request.request_hash = pg_catalog.sha256(request.request_bytes)
           AND pg_catalog.convert_from(request.request_bytes, 'UTF8')::jsonb
                 ->>evidence_field = attachment_id::text
    );
END
$function$;

REVOKE ALL ON FUNCTION erp_automation_reads.requester_command_by_idempotency(
    uuid,varchar,varchar,bytea
) FROM PUBLIC;
REVOKE ALL ON FUNCTION erp_automation_reads.active_command_evidence_in_use(
    uuid,varchar,text,uuid
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION erp_automation_reads.requester_command_by_idempotency(
    uuid,varchar,varchar,bytea
) TO erp_runtime;
GRANT EXECUTE ON FUNCTION erp_automation_reads.active_command_evidence_in_use(
    uuid,varchar,text,uuid
) TO erp_runtime;

REVOKE ALL ON TABLE automation.command_requests FROM erp_app, erp_runtime;

RESET ROLE;
