SET LOCAL ROLE erp_migration_owner;

CREATE OR REPLACE FUNCTION erp_automation_reads.requester_command_status(
    organization_id uuid,
    command_request_id uuid,
    grant_id uuid,
    requester_membership_id uuid
)
RETURNS TABLE (
    id uuid,
    operation varchar(128),
    capability_code varchar(128),
    status text,
    preview_hash bytea,
    expires_at timestamptz,
    completed_at timestamptz,
    result_resource_type varchar(64),
    result_resource_id uuid,
    failure_code varchar(128),
    failure_message text,
    approved_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
    SELECT command.id, command.operation, command.capability_code,
           CASE
               WHEN command.status NOT IN ('prepared', 'pending_approval', 'approved')
                   THEN command.status
               WHEN command.expires_at <= pg_catalog.transaction_timestamp()
                   THEN 'expired'
               WHEN approval.has_exact_rejection
                   THEN 'rejected'
               WHEN approval.valid_approval_count >= command.required_approval_count
                   THEN 'approved'
               WHEN command.status = 'approved'
                   THEN 'pending_approval'
               ELSE command.status
           END AS status,
           command.preview_hash, command.expires_at,
           command.completed_at, command.result_resource_type,
           command.result_resource_id, command.failure_code,
           command.failure_message,
           CASE
               WHEN command.status IN ('prepared', 'pending_approval', 'approved')
                AND command.expires_at > pg_catalog.transaction_timestamp()
                AND NOT approval.has_exact_rejection
                AND approval.valid_approval_count >= command.required_approval_count
                   THEN approval.approved_at
               ELSE NULL
           END AS approved_at
      FROM erp_automation_reads._command_facts(
               organization_id, command_request_id
           ) AS command
      LEFT JOIN LATERAL (
          SELECT
              count(DISTINCT evidence.approver_membership_id) FILTER (
                  WHERE evidence.decision = 'approved'
                    AND evidence.valid_until_at > pg_catalog.transaction_timestamp()
                    AND (
                         command.approval_policy <> 'actor_confirmation'
                         OR evidence.approver_membership_id =
                            command.requested_by_membership_id
                    )
                    AND (
                         command.approval_policy = 'actor_confirmation'
                         OR evidence.approver_membership_id <>
                            command.requested_by_membership_id
                    )
                    AND (
                         command.approval_policy <> 'human_compliance_approver'
                         OR evidence.authentication_strength = 'mfa'
                    )
              ) AS valid_approval_count,
              max(evidence.decided_at) FILTER (
                  WHERE evidence.decision = 'approved'
                    AND evidence.valid_until_at > pg_catalog.transaction_timestamp()
                    AND (
                         command.approval_policy <> 'actor_confirmation'
                         OR evidence.approver_membership_id =
                            command.requested_by_membership_id
                    )
                    AND (
                         command.approval_policy = 'actor_confirmation'
                         OR evidence.approver_membership_id <>
                            command.requested_by_membership_id
                    )
                    AND (
                         command.approval_policy <> 'human_compliance_approver'
                         OR evidence.authentication_strength = 'mfa'
                    )
              ) AS approved_at,
              coalesce(bool_or(evidence.decision = 'rejected'), false)
                  AS has_exact_rejection
            FROM automation.command_approvals AS evidence
           WHERE evidence.org_id = command.org_id
             AND evidence.command_request_id = command.id
             AND evidence.preview_hash = command.preview_hash
             AND evidence.aggregate_version_hash = command.aggregate_version_hash
      ) AS approval ON true
     WHERE organization_id = erp_security.current_org_id()
       AND requester_membership_id = erp_security.current_membership_id()
       AND command.id = command_request_id
       AND command.agent_grant_id = grant_id
       AND command.requested_by_membership_id = requester_membership_id
$function$;

ALTER FUNCTION erp_automation_reads.requester_command_status(
    uuid,uuid,uuid,uuid
) OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_automation_reads.requester_command_status(
    uuid,uuid,uuid,uuid
) FROM PUBLIC,erp_app,erp_runtime;
GRANT EXECUTE ON FUNCTION erp_automation_reads.requester_command_status(
    uuid,uuid,uuid,uuid
) TO erp_runtime;

RESET ROLE;
