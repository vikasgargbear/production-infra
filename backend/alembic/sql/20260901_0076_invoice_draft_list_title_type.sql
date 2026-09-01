-- Keep the invoice-draft list result types identical to its declared contract.
--
-- automation.invoice_drafts.title is varchar(200), while the public read
-- function deliberately exposes title as text.  PL/pgSQL RETURN QUERY does not
-- apply that varchar-to-text coercion implicitly, so cast it at the boundary.

SET LOCAL ROLE erp_migration_owner;

CREATE OR REPLACE FUNCTION erp_automation_reads.invoice_drafts(
  organization_id uuid,
  document_kind_filter text,
  status_filter text,
  branch_ids_filter uuid[],
  row_limit integer,
  row_offset integer
)
RETURNS TABLE(
  id uuid,document_kind text,branch_id uuid,title text,payload jsonb,
  payload_sha256 text,status text,prepared_command_request_id uuid,
  posted_resource_id uuid,
  created_via text,created_at timestamptz,updated_at timestamptz,
  row_version bigint,total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path=''
AS $function$
BEGIN
  IF document_kind_filter IS NOT NULL
     AND document_kind_filter NOT IN ('sales_invoice','supplier_invoice') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invoice draft kind filter is invalid';
  END IF;
  IF status_filter IS NOT NULL
     AND status_filter NOT IN ('open','prepared','posted','abandoned') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invoice draft status filter is invalid';
  END IF;
  IF row_limit NOT BETWEEN 1 AND 100 OR row_offset<0 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invoice draft page is invalid';
  END IF;
  RETURN QUERY
  WITH visible AS (
    SELECT draft.id,draft.document_kind::text AS document_kind,draft.branch_id,
           draft.title::text AS title,draft.payload,
           pg_catalog.encode(draft.payload_sha256,'hex') AS payload_sha256,
           CASE
             WHEN draft.lifecycle_state='abandoned' THEN 'abandoned'
             WHEN command.status='succeeded' THEN 'posted'
             WHEN command.status IN (
               'prepared','pending_approval','approved','executing'
             ) THEN 'prepared'
             ELSE 'open'
           END AS status,
           draft.prepared_command_request_id,command.result_resource_id AS posted_resource_id,
           draft.created_via::text AS created_via,
           draft.created_at,draft.updated_at,draft.row_version
      FROM automation.invoice_drafts draft
      LEFT JOIN automation.command_requests command
        ON command.org_id=draft.org_id
       AND command.id=draft.prepared_command_request_id
     WHERE draft.org_id=organization_id
       AND (branch_ids_filter IS NULL OR draft.branch_id=ANY(branch_ids_filter))
       AND organization_id=erp_security.current_org_id()
       AND erp_security.current_actor_is_active()
       AND erp_security.can_access_branch(draft.branch_id)
       AND erp_security.has_permission(
         CASE draft.document_kind
           WHEN 'sales_invoice' THEN 'sales.invoice.create'
           ELSE 'procurement.supplier_invoice.create'
         END,
         draft.branch_id
       )
  ), filtered AS (
    SELECT * FROM visible
     WHERE (document_kind_filter IS NULL OR visible.document_kind=document_kind_filter)
       AND (status_filter IS NULL OR visible.status=status_filter)
  )
  SELECT filtered.id,filtered.document_kind,filtered.branch_id,filtered.title,
         filtered.payload,filtered.payload_sha256,filtered.status,
         filtered.prepared_command_request_id,filtered.posted_resource_id,
         filtered.created_via,
         filtered.created_at,filtered.updated_at,filtered.row_version,
         count(*) OVER () AS total_count
    FROM filtered
   ORDER BY filtered.updated_at DESC,filtered.id
   LIMIT row_limit OFFSET row_offset;
END
$function$;

ALTER FUNCTION erp_automation_reads.invoice_drafts(
  uuid,text,text,uuid[],integer,integer
) OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_automation_reads.invoice_drafts(
  uuid,text,text,uuid[],integer,integer
) FROM PUBLIC,erp_app,erp_runtime,erp_calculator;
GRANT EXECUTE ON FUNCTION erp_automation_reads.invoice_drafts(
  uuid,text,text,uuid[],integer,integer
) TO erp_runtime;

DO $verify$
DECLARE definition text; owner_name text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'erp_automation_reads.invoice_drafts(uuid,text,text,uuid[],integer,integer)'::regprocedure
  ) INTO definition;
  IF pg_catalog.strpos(definition,'draft.title::text AS title')=0 THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='invoice draft list title cast was not installed';
  END IF;
  SELECT pg_catalog.pg_get_userbyid(procedure.proowner)
    INTO owner_name
    FROM pg_catalog.pg_proc procedure
   WHERE procedure.oid=
     'erp_automation_reads.invoice_drafts(uuid,text,text,uuid[],integer,integer)'::regprocedure;
  IF owner_name IS DISTINCT FROM 'erp_migration_owner' THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='invoice draft list function owner changed unexpectedly';
  END IF;
  IF NOT pg_catalog.has_function_privilege(
       'erp_runtime',
       'erp_automation_reads.invoice_drafts(uuid,text,text,uuid[],integer,integer)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='runtime invoice draft list execution changed unexpectedly';
  END IF;
  IF pg_catalog.has_function_privilege(
       'erp_app',
       'erp_automation_reads.invoice_drafts(uuid,text,text,uuid[],integer,integer)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='application role unexpectedly gained invoice draft list execution';
  END IF;
END
$verify$;

RESET ROLE;
