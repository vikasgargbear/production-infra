SET LOCAL ROLE erp_migration_owner;

CREATE OR REPLACE FUNCTION erp_automation_reads.command_authority_context(
    organization_id uuid,
    command_request_id uuid
)
RETURNS TABLE (
    id uuid,
    agent_grant_id uuid,
    requested_by_membership_id uuid,
    capability_code varchar(128),
    operation varchar(128),
    operation_mode text,
    branch_id uuid,
    destination_branch_id uuid,
    requested_amount numeric(20,2),
    currency_code char(3),
    risk_class text,
    approval_policy text,
    required_approval_count smallint,
    status text,
    expires_at timestamptz,
    target_resource_type varchar(64),
    target_resource_id uuid,
    result_resource_type varchar(64),
    result_resource_id uuid,
    preview_hash bytea,
    aggregate_version_hash bytea
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
BEGIN
    IF organization_id IS DISTINCT FROM erp_security.current_org_id()
       OR erp_security.current_membership_id() IS NULL
       OR erp_security.current_actor_is_active() IS DISTINCT FROM true THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'command authority context is invalid';
    END IF;

    IF command_request_id IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT request.id, request.agent_grant_id,
           request.requested_by_membership_id, request.capability_code,
           request.operation, request.operation_mode, request.branch_id,
           request.destination_branch_id, request.requested_amount,
           request.currency_code, request.risk_class,
           request.approval_policy, request.required_approval_count,
           request.status, request.expires_at,
           request.target_resource_type, request.target_resource_id,
           request.result_resource_type, request.result_resource_id,
           request.preview_hash, request.aggregate_version_hash
      FROM automation.command_requests AS request
     WHERE request.org_id = organization_id
       AND request.id = command_request_id
       AND erp_security.can_access_branch(request.branch_id)
       AND erp_security.can_access_branch(request.destination_branch_id)
       AND request.request_hash = pg_catalog.sha256(request.request_bytes)
       AND request.preview_hash = pg_catalog.sha256(request.preview_bytes)
       AND (
            request.response_bytes IS NULL
            OR request.response_hash = pg_catalog.sha256(request.response_bytes)
       );
END
$function$;

CREATE OR REPLACE FUNCTION erp_automation_reads.payment_post_provenance(
    organization_id uuid
)
RETURNS TABLE (
    command_request_id uuid,
    payment_id uuid,
    branch_id uuid,
    capability_code varchar(128)
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
    WITH candidates AS (
        SELECT request.id AS command_request_id,
               request.target_resource_id AS payment_id,
               request.branch_id, request.capability_code,
               count(*) OVER (
                   PARTITION BY request.target_resource_id
               ) AS candidate_count
          FROM automation.command_requests AS request
         WHERE organization_id = erp_security.current_org_id()
           AND erp_security.current_actor_is_active()
           AND request.org_id = organization_id
           AND request.capability_code IN (
                'finance.customer_receipt.prepare',
                'finance.supplier_payment.prepare'
           )
           AND request.operation = 'finance.payment.post'
           AND request.target_resource_type = 'payment'
           AND request.target_resource_id = request.result_resource_id
           AND request.result_resource_type = 'payment'
           AND request.status = 'succeeded'
           AND request.response_status = 200
           AND erp_security.can_access_branch(request.branch_id)
           AND request.request_hash = pg_catalog.sha256(request.request_bytes)
           AND request.preview_hash = pg_catalog.sha256(request.preview_bytes)
           AND request.response_hash = pg_catalog.sha256(request.response_bytes)
    )
    SELECT command_request_id, payment_id, branch_id, capability_code
      FROM candidates
     WHERE candidate_count = 1
$function$;

CREATE OR REPLACE FUNCTION erp_automation_reads.sales_dispatch_post_provenance(
    organization_id uuid,
    dispatch_id uuid
)
RETURNS TABLE (command_request_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
    WITH candidates AS (
        SELECT request.id AS command_request_id,
               count(*) OVER () AS candidate_count
          FROM automation.command_requests AS request
         WHERE organization_id = erp_security.current_org_id()
           AND erp_security.current_actor_is_active()
           AND request.org_id = organization_id
           AND request.capability_code = 'sales.dispatch.prepare'
           AND request.operation = 'sales.dispatch.post'
           AND request.status = 'succeeded'
           AND request.target_resource_type = 'sales_dispatch'
           AND request.target_resource_id = dispatch_id
           AND request.result_resource_type = 'sales_dispatch'
           AND request.result_resource_id = dispatch_id
           AND request.response_status = 200
           AND erp_security.can_access_branch(request.branch_id)
           AND request.request_hash = pg_catalog.sha256(request.request_bytes)
           AND request.preview_hash = pg_catalog.sha256(request.preview_bytes)
           AND request.response_hash = pg_catalog.sha256(request.response_bytes)
    )
    SELECT command_request_id
      FROM candidates
     WHERE candidate_count = 1
$function$;

CREATE OR REPLACE FUNCTION erp_automation_reads.adjustment_note_post_provenance(
    organization_id uuid,
    adjustment_note_id uuid,
    artifact_command_request_id uuid,
    artifact_request_sha256 bytea,
    approved_by_membership_id uuid,
    approved_at timestamptz
)
RETURNS TABLE (
    command_request_id uuid,
    preview_hash bytea,
    requested_by_membership_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
    WITH candidates AS (
        SELECT request.id AS command_request_id,
               request.preview_hash,
               request.requested_by_membership_id,
               count(*) OVER () AS candidate_count
          FROM automation.command_requests AS request
          JOIN automation.command_approvals AS approval
            ON approval.org_id = request.org_id
           AND approval.command_request_id = request.id
           AND approval.decision = 'approved'
           AND approval.preview_hash = request.preview_hash
           AND approval.aggregate_version_hash = request.aggregate_version_hash
           AND approval.approver_membership_id = approved_by_membership_id
           AND approval.decided_at = approved_at
           AND approval.approver_membership_id
                 <> request.requested_by_membership_id
         WHERE organization_id = erp_security.current_org_id()
           AND erp_security.current_actor_is_active()
           AND request.org_id = organization_id
           AND request.id = artifact_command_request_id
           AND request.capability_code = 'finance.adjustment_note.prepare'
           AND request.operation = 'finance.adjustment_note.post'
           AND request.status = 'succeeded'
           AND request.target_resource_type = 'adjustment_note'
           AND request.target_resource_id = adjustment_note_id
           AND request.result_resource_type = 'adjustment_note'
           AND request.result_resource_id = adjustment_note_id
           AND request.response_status = 200
           AND request.request_hash = artifact_request_sha256
           AND erp_security.can_access_branch(request.branch_id)
           AND request.request_hash = pg_catalog.sha256(request.request_bytes)
           AND request.preview_hash = pg_catalog.sha256(request.preview_bytes)
           AND request.response_hash = pg_catalog.sha256(request.response_bytes)
    )
    SELECT command_request_id, preview_hash, requested_by_membership_id
      FROM candidates
     WHERE candidate_count = 1
$function$;

REVOKE ALL ON FUNCTION erp_automation_reads.command_authority_context(uuid,uuid)
    FROM PUBLIC;
REVOKE ALL ON FUNCTION erp_automation_reads.payment_post_provenance(uuid)
    FROM PUBLIC;
REVOKE ALL ON FUNCTION erp_automation_reads.sales_dispatch_post_provenance(uuid,uuid)
    FROM PUBLIC;
REVOKE ALL ON FUNCTION erp_automation_reads.adjustment_note_post_provenance(
    uuid,uuid,uuid,bytea,uuid,timestamptz
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION erp_automation_reads.command_authority_context(uuid,uuid)
    TO erp_runtime;
GRANT EXECUTE ON FUNCTION erp_automation_reads.payment_post_provenance(uuid)
    TO erp_runtime;
GRANT EXECUTE ON FUNCTION erp_automation_reads.sales_dispatch_post_provenance(uuid,uuid)
    TO erp_runtime;
GRANT EXECUTE ON FUNCTION erp_automation_reads.adjustment_note_post_provenance(
    uuid,uuid,uuid,bytea,uuid,timestamptz
) TO erp_runtime;

REVOKE ALL ON TABLE automation.command_requests FROM erp_app, erp_runtime;

RESET ROLE;
