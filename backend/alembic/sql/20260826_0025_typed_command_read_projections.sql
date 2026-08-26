CREATE SCHEMA IF NOT EXISTS erp_automation_reads AUTHORIZATION erp_migration_owner;

SET LOCAL ROLE erp_migration_owner;

CREATE OR REPLACE FUNCTION erp_automation_reads._command_facts(
    organization_id uuid,
    command_request_id uuid
)
RETURNS TABLE (
    org_id uuid,
    id uuid,
    agent_grant_id uuid,
    requested_by_membership_id uuid,
    capability_code varchar(128),
    operation varchar(128),
    operation_mode text,
    branch_id uuid,
    destination_branch_id uuid,
    target_resource_type varchar(64),
    target_resource_id uuid,
    target_row_version bigint,
    serializer_version varchar(64),
    preview_media_type varchar(128),
    preview_hash bytea,
    request_hash bytea,
    aggregate_version_hash bytea,
    risk_class text,
    approval_policy text,
    required_approval_count smallint,
    status text,
    expires_at timestamptz,
    completed_at timestamptz,
    result_resource_type varchar(64),
    result_resource_id uuid,
    response_status smallint,
    failure_code varchar(128),
    failure_message text,
    created_at timestamptz,
    row_version bigint
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
            MESSAGE = 'command read context is invalid';
    END IF;

    RETURN QUERY
    SELECT request.org_id, request.id, request.agent_grant_id,
           request.requested_by_membership_id, request.capability_code,
           request.operation, request.operation_mode, request.branch_id,
           request.destination_branch_id, request.target_resource_type,
           request.target_resource_id, request.target_row_version,
           request.serializer_version, request.preview_media_type,
           request.preview_hash, request.request_hash,
           request.aggregate_version_hash, request.risk_class,
           request.approval_policy, request.required_approval_count,
           request.status, request.expires_at, request.completed_at,
           request.result_resource_type, request.result_resource_id,
           request.response_status, request.failure_code,
           request.failure_message, request.created_at, request.row_version
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
           command.status, command.preview_hash, command.expires_at,
           command.completed_at, command.result_resource_type,
           command.result_resource_id, command.failure_code,
           command.failure_message, approval.approved_at
      FROM erp_automation_reads._command_facts(
               organization_id, command_request_id
           ) AS command
      LEFT JOIN LATERAL (
          SELECT max(decided_at) AS approved_at
            FROM automation.command_approvals
           WHERE org_id = command.org_id
             AND command_request_id = command.id
             AND decision = 'approved'
             AND preview_hash = command.preview_hash
             AND aggregate_version_hash = command.aggregate_version_hash
      ) AS approval ON true
     WHERE organization_id = erp_security.current_org_id()
       AND requester_membership_id = erp_security.current_membership_id()
       AND command.id = command_request_id
       AND command.agent_grant_id = grant_id
       AND command.requested_by_membership_id = requester_membership_id
$function$;

CREATE OR REPLACE FUNCTION erp_automation_reads._review_authority_matches(
    organization_id uuid,
    command_request_id uuid,
    reviewer_grant_id uuid,
    reviewer_client_id varchar(255),
    actor_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
    SELECT count(*) = 1
      FROM automation.command_requests AS request
      JOIN automation.agent_grants AS reviewer_grant
        ON reviewer_grant.org_id = request.org_id
       AND reviewer_grant.id = reviewer_grant_id
      JOIN automation.agent_grant_capabilities AS reviewer_capability
        ON reviewer_capability.org_id = reviewer_grant.org_id
       AND reviewer_capability.agent_grant_id = reviewer_grant.id
     WHERE organization_id = erp_security.current_org_id()
       AND actor_id = erp_security.current_membership_id()
       AND request.org_id = organization_id
       AND request.id = command_request_id
       AND reviewer_grant.client_id = reviewer_client_id
       AND reviewer_grant.subject_membership_id = actor_id
       AND reviewer_grant.consented_by_membership_id = actor_id
       AND reviewer_grant.status = 'active'
       AND reviewer_grant.expires_at > pg_catalog.transaction_timestamp()
       AND reviewer_capability.capability_code = 'automation.command.approve'
       AND reviewer_capability.status = 'active'
       AND (
            reviewer_grant.branch_id IS NULL
            OR (
                 reviewer_grant.branch_id = request.branch_id
                 AND (
                      request.destination_branch_id IS NULL
                      OR reviewer_grant.branch_id = request.destination_branch_id
                 )
            )
       )
       AND erp_security.can_access_branch(request.branch_id)
       AND erp_security.can_access_branch(request.destination_branch_id)
       AND erp_security.has_permission(
              'automation.command.approve', request.branch_id
           )
       AND (
            request.destination_branch_id IS NULL
            OR erp_security.has_permission(
                   'automation.command.approve', request.destination_branch_id
               )
       )
$function$;

CREATE OR REPLACE FUNCTION erp_automation_reads.reviewable_command(
    organization_id uuid,
    command_request_id uuid,
    reviewer_grant_id uuid,
    reviewer_client_id varchar(255)
)
RETURNS TABLE (
    id uuid,
    operation varchar(128),
    capability_code varchar(128),
    status text,
    requested_by_membership_id uuid,
    branch_id uuid,
    destination_branch_id uuid,
    target_resource_type varchar(64),
    target_resource_id uuid,
    target_row_version bigint,
    serializer_version varchar(64),
    preview_media_type varchar(128),
    preview_bytes bytea,
    preview_hash bytea,
    request_hash bytea,
    aggregate_version_hash bytea,
    approval_policy text,
    required_approval_count smallint,
    expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
DECLARE
    actor_id uuid := erp_security.current_membership_id();
BEGIN
    IF organization_id IS DISTINCT FROM erp_security.current_org_id()
       OR actor_id IS NULL
       OR erp_security.current_actor_is_active() IS DISTINCT FROM true THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'command review context is invalid';
    END IF;

    RETURN QUERY
    SELECT request.id, request.operation, request.capability_code,
           request.status, request.requested_by_membership_id,
           request.branch_id, request.destination_branch_id,
           request.target_resource_type, request.target_resource_id,
           request.target_row_version, request.serializer_version,
           request.preview_media_type, request.preview_bytes,
           request.preview_hash, request.request_hash,
           request.aggregate_version_hash, request.approval_policy,
           request.required_approval_count, request.expires_at
      FROM automation.command_requests AS request
     WHERE request.org_id = organization_id
       AND request.id = command_request_id
       AND request.status IN ('prepared', 'pending_approval')
       AND request.expires_at > pg_catalog.transaction_timestamp()
       AND (
            request.approval_policy = 'actor_confirmation'
            OR request.requested_by_membership_id <> actor_id
       )
       AND erp_automation_reads._review_authority_matches(
              organization_id, command_request_id, reviewer_grant_id,
              reviewer_client_id, actor_id
           )
       AND request.request_hash = pg_catalog.sha256(request.request_bytes)
       AND request.preview_hash = pg_catalog.sha256(request.preview_bytes)
     FOR SHARE OF request;
END
$function$;

CREATE OR REPLACE FUNCTION erp_automation_reads.lock_requester_command(
    organization_id uuid,
    command_request_id uuid,
    grant_id uuid,
    requester_membership_id uuid
)
RETURNS TABLE (
    operation varchar(128),
    status text,
    preview_hash bytea,
    result_resource_type varchar(64),
    result_resource_id uuid,
    completed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
BEGIN
    IF organization_id IS DISTINCT FROM erp_security.current_org_id()
       OR requester_membership_id IS DISTINCT FROM erp_security.current_membership_id()
       OR erp_security.current_actor_is_active() IS DISTINCT FROM true THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'command execution read context is invalid';
    END IF;

    RETURN QUERY
    SELECT request.operation, request.status, request.preview_hash,
           request.result_resource_type, request.result_resource_id,
           request.completed_at
      FROM automation.command_requests AS request
     WHERE request.org_id = organization_id
       AND request.id = command_request_id
       AND request.agent_grant_id = grant_id
       AND request.requested_by_membership_id = requester_membership_id
       AND erp_security.can_access_branch(request.branch_id)
       AND erp_security.can_access_branch(request.destination_branch_id)
       AND request.request_hash = pg_catalog.sha256(request.request_bytes)
       AND request.preview_hash = pg_catalog.sha256(request.preview_bytes)
     FOR UPDATE OF request;
END
$function$;

CREATE OR REPLACE FUNCTION erp_automation_reads.approval_result(
    organization_id uuid,
    command_request_id uuid,
    approval_idempotency_key_hash bytea
)
RETURNS TABLE (
    operation varchar(128),
    status text,
    preview_hash bytea,
    result_resource_type varchar(64),
    result_resource_id uuid,
    approval_id uuid,
    decided_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
    SELECT request.operation, request.status, request.preview_hash,
           request.result_resource_type, request.result_resource_id,
           approval.id, approval.decided_at
      FROM erp_automation_reads._command_facts(
               organization_id, command_request_id
           ) AS request
      JOIN automation.command_approvals AS approval
        ON approval.org_id = request.org_id
       AND approval.command_request_id = request.id
     WHERE organization_id = erp_security.current_org_id()
       AND erp_security.current_actor_is_active()
       AND request.id = command_request_id
       AND approval.approver_membership_id = erp_security.current_membership_id()
       AND approval.idempotency_key_hash = approval_idempotency_key_hash
       AND approval.decision = 'approved'
       AND approval.preview_hash = request.preview_hash
       AND approval.aggregate_version_hash = request.aggregate_version_hash
$function$;

CREATE OR REPLACE FUNCTION erp_automation_reads.approval_deadline(
    organization_id uuid,
    command_request_id uuid,
    reviewer_grant_id uuid,
    reviewer_client_id varchar(255),
    approval_idempotency_key_hash bytea
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
DECLARE
    actor_id uuid := erp_security.current_membership_id();
    deadline timestamptz;
BEGIN
    IF organization_id IS DISTINCT FROM erp_security.current_org_id()
       OR actor_id IS NULL
       OR erp_security.current_actor_is_active() IS DISTINCT FROM true THEN
        RAISE EXCEPTION USING ERRCODE = '42501',
            MESSAGE = 'command approval deadline context is invalid';
    END IF;

    SELECT LEAST(
               request.expires_at,
               pg_catalog.transaction_timestamp() + interval '15 minutes'
           )
      INTO deadline
      FROM automation.command_requests AS request
     WHERE request.org_id = organization_id
       AND request.id = command_request_id
       AND request.expires_at > pg_catalog.transaction_timestamp()
       AND (
            request.status IN ('prepared', 'pending_approval')
            OR (
                request.status = 'approved'
                AND EXISTS (
                    SELECT 1
                      FROM automation.command_approvals AS prior
                     WHERE prior.org_id = request.org_id
                       AND prior.command_request_id = request.id
                       AND prior.approver_membership_id = actor_id
                       AND prior.idempotency_key_hash = approval_idempotency_key_hash
                       AND prior.decision = 'approved'
                       AND prior.preview_hash = request.preview_hash
                       AND prior.aggregate_version_hash = request.aggregate_version_hash
                )
            )
       )
       AND (
            request.approval_policy = 'actor_confirmation'
            OR request.requested_by_membership_id <> actor_id
       )
       AND erp_automation_reads._review_authority_matches(
              organization_id, command_request_id, reviewer_grant_id,
              reviewer_client_id, actor_id
           )
       AND request.request_hash = pg_catalog.sha256(request.request_bytes)
       AND request.preview_hash = pg_catalog.sha256(request.preview_bytes);

    RETURN deadline;
END
$function$;

CREATE OR REPLACE FUNCTION erp_automation_reads.sales_order_address_provenance(
    organization_id uuid,
    document_branch_id uuid,
    sales_order_id uuid
)
RETURNS TABLE (
    command_request_id uuid,
    delivery_address_id uuid,
    delivery_address_row_version bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
BEGIN
    IF organization_id IS DISTINCT FROM erp_security.current_org_id()
       OR erp_security.can_access_branch(document_branch_id) IS DISTINCT FROM true THEN
        RAISE EXCEPTION USING ERRCODE = '42501',
            MESSAGE = 'sales order provenance context is invalid';
    END IF;

    RETURN QUERY
    WITH candidates AS (
        SELECT request.id AS command_request_id,
               (evidence.document->>'delivery_address_id')::uuid
                 AS delivery_address_id,
               (evidence.document->>'delivery_address_row_version')::bigint
                 AS delivery_address_row_version,
               count(*) OVER () AS candidate_count
          FROM automation.command_requests AS request
          JOIN sales.orders AS sales_order
            ON sales_order.org_id = request.org_id
           AND sales_order.id = request.target_resource_id
           AND sales_order.branch_id = request.branch_id
          CROSS JOIN LATERAL (
              SELECT pg_catalog.convert_from(request.request_bytes, 'UTF8')::jsonb
                     AS document
          ) AS evidence
         WHERE request.org_id = organization_id
           AND request.branch_id = document_branch_id
           AND request.capability_code = 'sales.order.prepare'
           AND request.operation = 'sales.order.approve'
           AND request.target_resource_type = 'sales_order'
           AND request.target_resource_id = sales_order_id
           AND request.status = 'succeeded'
           AND request.result_resource_type = 'sales_order'
           AND request.result_resource_id = sales_order_id
           AND request.response_status = 200
           AND request.request_hash = pg_catalog.sha256(request.request_bytes)
           AND evidence.document->>'delivery_address_id'
                 = sales_order.shipping_address_id::text
           AND evidence.document->>'delivery_address_row_version' ~ '^[1-9][0-9]{0,18}$'
    )
    SELECT candidate.command_request_id, candidate.delivery_address_id,
           candidate.delivery_address_row_version
      FROM candidates AS candidate
     WHERE candidate.candidate_count = 1;
END
$function$;

CREATE OR REPLACE FUNCTION erp_automation_reads.sales_invoice_address_provenance(
    organization_id uuid,
    document_branch_id uuid,
    sales_invoice_id uuid
)
RETURNS TABLE (
    command_request_id uuid,
    delivery_address_id uuid,
    delivery_address_row_version bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
    WITH candidates AS (
        SELECT request.id AS command_request_id,
               (evidence.document->>'delivery_address_id')::uuid
                 AS delivery_address_id,
               (evidence.document->>'delivery_address_row_version')::bigint
                 AS delivery_address_row_version,
               count(*) OVER () AS candidate_count
          FROM automation.command_requests AS request
          CROSS JOIN LATERAL (
              SELECT pg_catalog.convert_from(request.request_bytes, 'UTF8')::jsonb
                     AS document
          ) AS evidence
         WHERE organization_id = erp_security.current_org_id()
           AND erp_security.current_actor_is_active()
           AND erp_security.can_access_branch(document_branch_id)
           AND request.org_id = organization_id
           AND request.branch_id = document_branch_id
           AND request.capability_code = 'sales.invoice.prepare'
           AND request.operation = 'sales.invoice.post'
           AND request.target_resource_type = 'sales_invoice'
           AND request.target_resource_id = sales_invoice_id
           AND request.status = 'succeeded'
           AND request.result_resource_type = 'sales_invoice'
           AND request.result_resource_id = sales_invoice_id
           AND request.response_status = 200
           AND request.request_hash = pg_catalog.sha256(request.request_bytes)
           AND evidence.document->>'delivery_address_id'
                 ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
           AND evidence.document->>'delivery_address_row_version' ~ '^[1-9][0-9]{0,18}$'
    )
    SELECT candidate.command_request_id, candidate.delivery_address_id,
           candidate.delivery_address_row_version
      FROM candidates AS candidate
     WHERE candidate.candidate_count = 1
$function$;

CREATE OR REPLACE FUNCTION erp_automation_reads.sales_invoice_direct_issue_provenance(
    organization_id uuid,
    document_branch_id uuid,
    sales_invoice_id uuid
)
RETURNS TABLE (
    command_request_id uuid,
    invoice_line_id uuid,
    inventory_document_line_id uuid,
    batch_id uuid,
    billed_quantity numeric(20,6),
    free_quantity numeric(20,6),
    evidenced_allocation_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
    WITH commands AS (
        SELECT request.id,
               pg_catalog.convert_from(request.request_bytes, 'UTF8')::jsonb
                 AS document,
               count(*) OVER () AS command_count
          FROM automation.command_requests AS request
         WHERE organization_id = erp_security.current_org_id()
           AND erp_security.current_actor_is_active()
           AND erp_security.can_access_branch(document_branch_id)
           AND request.org_id = organization_id
           AND request.branch_id = document_branch_id
           AND request.capability_code = 'sales.invoice.prepare'
           AND request.operation = 'sales.invoice.post'
           AND request.target_resource_type = 'sales_invoice'
           AND request.target_resource_id = sales_invoice_id
           AND request.status = 'succeeded'
           AND request.result_resource_type = 'sales_invoice'
           AND request.result_resource_id = sales_invoice_id
           AND request.response_status = 200
           AND request.request_hash = pg_catalog.sha256(request.request_bytes)
    ), lines AS (
        SELECT command.id AS command_request_id,
               line.value,
               command.command_count,
               count(*) OVER (
                   PARTITION BY command.id, line.value->>'line_id'
               ) AS request_line_count
          FROM commands AS command
          CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
              COALESCE(command.document->'lines', '[]'::jsonb)
          ) AS line(value)
    ), payload AS (
        SELECT line.command_request_id,
               (line.value->>'line_id')::uuid AS invoice_line_id,
               (allocation.value->>'inventory_line_id')::uuid
                 AS inventory_document_line_id,
               (allocation.value->>'batch_id')::uuid AS batch_id,
               (allocation.value->>'billed_quantity')::numeric(20,6)
                 AS billed_quantity,
               (allocation.value->>'free_quantity')::numeric(20,6)
                 AS free_quantity,
               pg_catalog.jsonb_array_length(line.value->'batch_allocations')
                 AS evidenced_allocation_count,
               line.command_count,
               line.request_line_count
          FROM lines AS line
          CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
              COALESCE(line.value->'batch_allocations', '[]'::jsonb)
          ) AS allocation(value)
         WHERE line.value->>'fulfillment_source' = 'direct_issue'
           AND line.value->>'line_id'
                 ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
           AND allocation.value->>'inventory_line_id'
                 ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
           AND allocation.value->>'batch_id'
                 ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
           AND allocation.value->>'billed_quantity'
                 ~ '^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$'
           AND allocation.value->>'free_quantity'
                 ~ '^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$'
    ), unique_payload AS (
        SELECT payload.*,
               count(*) OVER (
                   PARTITION BY invoice_line_id, inventory_document_line_id, batch_id
               ) AS payload_count
          FROM payload
    )
    SELECT command_request_id, invoice_line_id, inventory_document_line_id,
           batch_id, billed_quantity, free_quantity,
           evidenced_allocation_count
      FROM unique_payload
     WHERE command_count = 1
       AND request_line_count = 1
       AND payload_count = 1
$function$;

CREATE OR REPLACE FUNCTION erp_automation_reads.purchase_order_uom_provenance(
    organization_id uuid,
    purchase_order_id uuid
)
RETURNS TABLE (
    command_request_id uuid,
    purchase_order_line_id uuid,
    uom_conversion_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
    WITH commands AS (
        SELECT request.id,
               pg_catalog.convert_from(request.request_bytes, 'UTF8')::jsonb
                 AS document,
               count(*) OVER () AS command_count
          FROM automation.command_requests AS request
         WHERE organization_id = erp_security.current_org_id()
           AND erp_security.current_actor_is_active()
           AND request.org_id = organization_id
           AND request.capability_code = 'procurement.purchase_order.prepare'
           AND request.operation = 'procurement.purchase_order.approve'
           AND request.target_resource_type = 'purchase_order'
           AND request.target_resource_id = purchase_order_id
           AND request.status = 'succeeded'
           AND request.result_resource_type = 'purchase_order'
           AND request.result_resource_id = purchase_order_id
           AND request.response_status = 200
           AND request.request_hash = pg_catalog.sha256(request.request_bytes)
           AND erp_security.can_access_branch(request.branch_id)
    ), payload AS (
        SELECT command.id AS command_request_id,
               (line.value->>'line_id')::uuid AS purchase_order_line_id,
               NULLIF(line.value->>'uom_conversion_id', '')::uuid
                 AS uom_conversion_id,
               command.command_count
          FROM commands AS command
          CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
              COALESCE(command.document->'lines', '[]'::jsonb)
              || COALESCE(command.document->'charge_lines', '[]'::jsonb)
          ) AS line(value)
         WHERE line.value->>'line_id'
                 ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
           AND (
                NULLIF(line.value->>'uom_conversion_id', '') IS NULL
                OR line.value->>'uom_conversion_id'
                     ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
           )
    ), unique_payload AS (
        SELECT payload.*,
               count(*) OVER (PARTITION BY purchase_order_line_id) AS payload_count
          FROM payload
    )
    SELECT command_request_id, purchase_order_line_id, uom_conversion_id
      FROM unique_payload
     WHERE command_count = 1 AND payload_count = 1
$function$;

CREATE OR REPLACE FUNCTION erp_automation_reads.supplier_invoice_portal_provenance(
    organization_id uuid,
    supplier_invoice_id uuid
)
RETURNS TABLE (
    command_request_id uuid,
    portal_document_line_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
    WITH candidates AS (
        SELECT request.id AS command_request_id,
               (evidence.document->>'portal_document_line_id')::uuid
                 AS portal_document_line_id,
               count(*) OVER () AS candidate_count
          FROM automation.command_requests AS request
          CROSS JOIN LATERAL (
              SELECT pg_catalog.convert_from(request.request_bytes, 'UTF8')::jsonb
                     AS document
          ) AS evidence
         WHERE organization_id = erp_security.current_org_id()
           AND erp_security.current_actor_is_active()
           AND request.org_id = organization_id
           AND request.capability_code = 'procurement.supplier_invoice.prepare'
           AND request.operation = 'procurement.supplier_invoice.post'
           AND request.target_resource_type = 'supplier_invoice'
           AND request.target_resource_id = supplier_invoice_id
           AND request.status = 'succeeded'
           AND request.result_resource_type = 'supplier_invoice'
           AND request.result_resource_id = supplier_invoice_id
           AND request.response_status = 200
           AND request.request_hash = pg_catalog.sha256(request.request_bytes)
           AND erp_security.can_access_branch(request.branch_id)
           AND evidence.document->>'portal_document_line_id'
                 ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    )
    SELECT command_request_id, portal_document_line_id
      FROM candidates
     WHERE candidate_count = 1
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

CREATE TYPE erp_automation_reads.return_command_fact AS (
    id uuid,
    operation varchar(128),
    capability_code varchar(128),
    status text,
    branch_id uuid,
    requested_by_membership_id uuid,
    requester_name text,
    created_at timestamptz,
    expires_at timestamptz,
    completed_at timestamptz,
    result_resource_type varchar(64),
    result_resource_id uuid,
    failure_code varchar(128),
    failure_message text,
    preview_hash bytea,
    preview jsonb,
    approved_at timestamptz,
    approval_policy text
);

CREATE OR REPLACE FUNCTION erp_automation_reads._return_command_facts(
    organization_id uuid,
    requester_membership_filter uuid,
    reviewable_only boolean
)
RETURNS SETOF erp_automation_reads.return_command_fact
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
    SELECT request.id, request.operation, request.capability_code,
           request.status, request.branch_id,
           request.requested_by_membership_id,
           COALESCE(NULLIF(user_row.display_name, ''), 'ERP member'),
           request.created_at, request.expires_at, request.completed_at,
           request.result_resource_type, request.result_resource_id,
           request.failure_code, request.failure_message,
           request.preview_hash,
           pg_catalog.convert_from(request.preview_bytes, 'UTF8')::jsonb,
           approval.approved_at, request.approval_policy
      FROM automation.command_requests AS request
      JOIN core.memberships AS requester
        ON requester.org_id = request.org_id
       AND requester.id = request.requested_by_membership_id
      JOIN core.users AS user_row ON user_row.id = requester.user_id
      LEFT JOIN LATERAL (
          SELECT max(decided_at) AS approved_at
            FROM automation.command_approvals
           WHERE org_id = request.org_id
             AND command_request_id = request.id
             AND decision = 'approved'
             AND preview_hash = request.preview_hash
             AND aggregate_version_hash = request.aggregate_version_hash
      ) AS approval ON true
     WHERE organization_id = erp_security.current_org_id()
       AND erp_security.current_actor_is_active()
       AND request.org_id = organization_id
       AND request.capability_code IN (
            'sales.return.prepare',
            'procurement.purchase_return.prepare'
       )
       AND request.approval_policy = 'separate_approver'
       AND (
            (
                NOT reviewable_only
                AND request.requested_by_membership_id = requester_membership_filter
            )
            OR (
                reviewable_only
                AND request.status IN ('prepared', 'pending_approval')
                AND request.expires_at > pg_catalog.transaction_timestamp()
                AND request.requested_by_membership_id
                      <> erp_security.current_membership_id()
                AND erp_security.has_permission(
                       'automation.command.approve', NULL::uuid
                    )
                AND erp_security.has_permission(
                       'automation.command.approve', request.branch_id
                    )
            )
       )
       AND erp_security.can_access_branch(request.branch_id)
       AND request.request_hash = pg_catalog.sha256(request.request_bytes)
       AND request.preview_hash = pg_catalog.sha256(request.preview_bytes)
$function$;

CREATE OR REPLACE FUNCTION erp_automation_reads.requester_return_commands(
    organization_id uuid
)
RETURNS SETOF erp_automation_reads.return_command_fact
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
    SELECT command.*
      FROM erp_automation_reads._return_command_facts(
               organization_id, erp_security.current_membership_id(), false
           ) AS command
$function$;

CREATE OR REPLACE FUNCTION erp_automation_reads.reviewable_return_commands(
    organization_id uuid,
    client_id varchar(255)
)
RETURNS SETOF erp_automation_reads.return_command_fact
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
    SELECT command.*
      FROM erp_automation_reads._return_command_facts(
               organization_id, NULL::uuid, true
           ) AS command
     WHERE 1 = (
            SELECT count(*)
              FROM automation.agent_grants AS reviewer_grant
              JOIN automation.agent_grant_capabilities AS reviewer_capability
                ON reviewer_capability.org_id = reviewer_grant.org_id
               AND reviewer_capability.agent_grant_id = reviewer_grant.id
             WHERE reviewer_grant.org_id = organization_id
               AND reviewer_grant.client_id = client_id
               AND reviewer_grant.subject_membership_id = erp_security.current_membership_id()
               AND reviewer_grant.consented_by_membership_id = erp_security.current_membership_id()
               AND reviewer_grant.status = 'active'
               AND reviewer_grant.expires_at > pg_catalog.transaction_timestamp()
               AND reviewer_capability.capability_code = 'automation.command.approve'
               AND reviewer_capability.status = 'active'
               AND (
                    reviewer_grant.branch_id IS NULL
                    OR reviewer_grant.branch_id = command.branch_id
               )
       )
$function$;

REVOKE ALL ON FUNCTION erp_automation_reads._command_facts(uuid,uuid) FROM PUBLIC, erp_runtime;
REVOKE ALL ON FUNCTION erp_automation_reads._review_authority_matches(uuid,uuid,uuid,varchar,uuid) FROM PUBLIC, erp_runtime;
REVOKE ALL ON FUNCTION erp_automation_reads.requester_command_status(uuid,uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION erp_automation_reads.reviewable_command(uuid,uuid,uuid,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION erp_automation_reads.lock_requester_command(uuid,uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION erp_automation_reads.approval_result(uuid,uuid,bytea) FROM PUBLIC;
REVOKE ALL ON FUNCTION erp_automation_reads.approval_deadline(uuid,uuid,uuid,varchar,bytea) FROM PUBLIC;
REVOKE ALL ON FUNCTION erp_automation_reads.sales_order_address_provenance(uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION erp_automation_reads.sales_invoice_address_provenance(uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION erp_automation_reads.sales_invoice_direct_issue_provenance(uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION erp_automation_reads.purchase_order_uom_provenance(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION erp_automation_reads.supplier_invoice_portal_provenance(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION erp_automation_reads.active_command_evidence_in_use(uuid,varchar,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION erp_automation_reads._return_command_facts(uuid,uuid,boolean) FROM PUBLIC, erp_runtime;
REVOKE ALL ON FUNCTION erp_automation_reads.requester_return_commands(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION erp_automation_reads.reviewable_return_commands(uuid,varchar) FROM PUBLIC;
GRANT USAGE ON SCHEMA erp_automation_reads TO erp_runtime;
GRANT EXECUTE ON FUNCTION erp_automation_reads.requester_command_status(uuid,uuid,uuid,uuid) TO erp_runtime;
GRANT EXECUTE ON FUNCTION erp_automation_reads.reviewable_command(uuid,uuid,uuid,varchar) TO erp_runtime;
GRANT EXECUTE ON FUNCTION erp_automation_reads.lock_requester_command(uuid,uuid,uuid,uuid) TO erp_runtime;
GRANT EXECUTE ON FUNCTION erp_automation_reads.approval_result(uuid,uuid,bytea) TO erp_runtime;
GRANT EXECUTE ON FUNCTION erp_automation_reads.approval_deadline(uuid,uuid,uuid,varchar,bytea) TO erp_runtime;
GRANT EXECUTE ON FUNCTION erp_automation_reads.sales_order_address_provenance(uuid,uuid,uuid) TO erp_runtime;
GRANT EXECUTE ON FUNCTION erp_automation_reads.sales_invoice_address_provenance(uuid,uuid,uuid) TO erp_runtime;
GRANT EXECUTE ON FUNCTION erp_automation_reads.sales_invoice_direct_issue_provenance(uuid,uuid,uuid) TO erp_runtime;
GRANT EXECUTE ON FUNCTION erp_automation_reads.purchase_order_uom_provenance(uuid,uuid) TO erp_runtime;
GRANT EXECUTE ON FUNCTION erp_automation_reads.supplier_invoice_portal_provenance(uuid,uuid) TO erp_runtime;
GRANT EXECUTE ON FUNCTION erp_automation_reads.active_command_evidence_in_use(uuid,varchar,text,uuid) TO erp_runtime;
GRANT EXECUTE ON FUNCTION erp_automation_reads.requester_return_commands(uuid) TO erp_runtime;
GRANT EXECUTE ON FUNCTION erp_automation_reads.reviewable_return_commands(uuid,varchar) TO erp_runtime;

RESET ROLE;
