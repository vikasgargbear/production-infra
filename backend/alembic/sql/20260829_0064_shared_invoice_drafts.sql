SET LOCAL ROLE erp_migration_owner;

CREATE TABLE automation.invoice_drafts (
  org_id uuid NOT NULL,
  id uuid NOT NULL,
  document_kind varchar(32) NOT NULL,
  branch_id uuid NOT NULL,
  title varchar(200),
  payload jsonb NOT NULL,
  payload_sha256 bytea NOT NULL,
  lifecycle_state varchar(16) NOT NULL DEFAULT 'open',
  created_via varchar(8) NOT NULL,
  prepared_command_request_id uuid,
  prepared_draft_row_version bigint,
  prepared_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  created_by_membership_id uuid NOT NULL,
  updated_by_membership_id uuid NOT NULL,
  row_version bigint NOT NULL DEFAULT 1,
  CONSTRAINT invoice_drafts_pk PRIMARY KEY (org_id,id),
  CONSTRAINT invoice_drafts_kind_ck CHECK (
    document_kind IN ('sales_invoice','supplier_invoice')
  ),
  CONSTRAINT invoice_drafts_payload_ck CHECK (
    pg_catalog.jsonb_typeof(payload)='object'
    AND payload ? 'schema_version'
    AND payload ? 'editor_state'
    AND payload ? 'command_payload'
    AND payload->>'schema_version'='invoice-draft.v1'
    AND pg_catalog.jsonb_typeof(payload->'editor_state')='object'
    AND pg_catalog.jsonb_typeof(payload->'command_payload') IN ('null','object')
    AND pg_catalog.octet_length(pg_catalog.convert_to(payload::text,'UTF8'))
        BETWEEN 2 AND 1048576
    AND pg_catalog.octet_length(payload_sha256)=32
  ),
  CONSTRAINT invoice_drafts_lifecycle_ck CHECK (
    lifecycle_state IN ('open','abandoned')
  ),
  CONSTRAINT invoice_drafts_source_ck CHECK (created_via IN ('web','mcp')),
  CONSTRAINT invoice_drafts_version_ck CHECK (row_version>0),
  CONSTRAINT invoice_drafts_prepared_ck CHECK (
    (prepared_command_request_id IS NULL
      AND prepared_draft_row_version IS NULL
      AND prepared_at IS NULL)
    OR
    (prepared_command_request_id IS NOT NULL
      AND prepared_draft_row_version IS NOT NULL
      AND prepared_draft_row_version>0
      AND prepared_at IS NOT NULL)
  ),
  CONSTRAINT invoice_drafts_org_fk FOREIGN KEY (org_id)
    REFERENCES core.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT invoice_drafts_branch_fk FOREIGN KEY (org_id,branch_id)
    REFERENCES core.branches(org_id,id),
  CONSTRAINT invoice_drafts_creator_fk FOREIGN KEY (
    org_id,created_by_membership_id
  ) REFERENCES core.memberships(org_id,id),
  CONSTRAINT invoice_drafts_updater_fk FOREIGN KEY (
    org_id,updated_by_membership_id
  ) REFERENCES core.memberships(org_id,id),
  CONSTRAINT invoice_drafts_command_fk FOREIGN KEY (
    org_id,prepared_command_request_id
  ) REFERENCES automation.command_requests(org_id,id)
);

CREATE UNIQUE INDEX invoice_drafts_prepared_command_uq
  ON automation.invoice_drafts(org_id,prepared_command_request_id)
  WHERE prepared_command_request_id IS NOT NULL;
CREATE INDEX invoice_drafts_workspace_idx
  ON automation.invoice_drafts(org_id,document_kind,lifecycle_state,updated_at DESC,id);
CREATE INDEX invoice_drafts_branch_idx
  ON automation.invoice_drafts(org_id,branch_id,updated_at DESC,id);

ALTER TABLE automation.invoice_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation.invoice_drafts FORCE ROW LEVEL SECURITY;
CREATE POLICY invoice_drafts_owner_scope
  ON automation.invoice_drafts
  TO erp_migration_owner
  USING (
    org_id=erp_security.current_org_id()
    AND erp_security.current_actor_is_active()
    AND erp_security.can_access_branch(branch_id)
  )
  WITH CHECK (
    org_id=erp_security.current_org_id()
    AND erp_security.current_actor_is_active()
    AND erp_security.can_access_branch(branch_id)
  );

CREATE FUNCTION erp_automation_commands.create_invoice_draft(
  organization_id uuid,
  draft_id uuid,
  draft_document_kind text,
  draft_branch_id uuid,
  draft_title text,
  draft_payload jsonb,
  draft_created_via text
)
RETURNS TABLE(
  created_draft_id uuid,
  new_row_version bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
#variable_conflict use_variable
DECLARE actor_id uuid; permission_code text; payload_hash bytea;
BEGIN
  permission_code:=CASE draft_document_kind
    WHEN 'sales_invoice' THEN 'sales.invoice.create'
    WHEN 'supplier_invoice' THEN 'procurement.supplier_invoice.create'
    ELSE NULL
  END;
  IF draft_id IS NULL OR draft_branch_id IS NULL OR permission_code IS NULL
     OR draft_created_via NOT IN ('web','mcp')
     OR pg_catalog.jsonb_typeof(draft_payload)<>'object'
     OR NOT draft_payload ? 'schema_version'
     OR NOT draft_payload ? 'editor_state'
     OR NOT draft_payload ? 'command_payload'
     OR draft_payload->>'schema_version'<>'invoice-draft.v1'
     OR pg_catalog.jsonb_typeof(draft_payload->'editor_state')<>'object'
     OR pg_catalog.jsonb_typeof(draft_payload->'command_payload')
        NOT IN ('null','object')
     OR pg_catalog.octet_length(pg_catalog.convert_to(draft_payload::text,'UTF8'))
        NOT BETWEEN 2 AND 1048576 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invoice draft input is invalid';
  END IF;
  actor_id:=erp_core_commands.assert_context(
    organization_id,permission_code,draft_branch_id
  );
  payload_hash:=extensions.digest(
    pg_catalog.convert_to(draft_payload::text,'UTF8'),'sha256'
  );
  RETURN QUERY
  INSERT INTO automation.invoice_drafts(
    org_id,id,document_kind,branch_id,title,payload,payload_sha256,
    lifecycle_state,created_via,created_by_membership_id,
    updated_by_membership_id
  ) VALUES (
    organization_id,draft_id,draft_document_kind,draft_branch_id,
    NULLIF(pg_catalog.btrim(draft_title),''),draft_payload,payload_hash,
    'open',draft_created_via,actor_id,actor_id
  )
  RETURNING id,row_version;
END
$function$;

CREATE FUNCTION erp_automation_commands.update_invoice_draft(
  organization_id uuid,
  draft_id uuid,
  expected_row_version bigint,
  set_title boolean,
  draft_title text,
  draft_payload jsonb
)
RETURNS TABLE(
  updated_draft_id uuid,
  new_row_version bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
#variable_conflict use_variable
DECLARE current_draft automation.invoice_drafts%ROWTYPE;
        command_row automation.command_requests%ROWTYPE;
        actor_id uuid; permission_code text; payload_hash bytea;
BEGIN
  IF draft_id IS NULL OR expected_row_version IS NULL OR expected_row_version<=0
     OR set_title IS NULL OR pg_catalog.jsonb_typeof(draft_payload)<>'object'
     OR NOT draft_payload ? 'schema_version'
     OR NOT draft_payload ? 'editor_state'
     OR NOT draft_payload ? 'command_payload'
     OR draft_payload->>'schema_version'<>'invoice-draft.v1'
     OR pg_catalog.jsonb_typeof(draft_payload->'editor_state')<>'object'
     OR pg_catalog.jsonb_typeof(draft_payload->'command_payload')
        NOT IN ('null','object')
     OR pg_catalog.octet_length(pg_catalog.convert_to(draft_payload::text,'UTF8'))
        NOT BETWEEN 2 AND 1048576 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invoice draft update is invalid';
  END IF;
  SELECT * INTO current_draft
    FROM automation.invoice_drafts draft
   WHERE draft.org_id=organization_id AND draft.id=draft_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='invoice draft not found';
  END IF;
  permission_code:=CASE current_draft.document_kind
    WHEN 'sales_invoice' THEN 'sales.invoice.create'
    ELSE 'procurement.supplier_invoice.create'
  END;
  actor_id:=erp_core_commands.assert_context(
    organization_id,permission_code,current_draft.branch_id
  );
  IF current_draft.lifecycle_state<>'open' THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='only an open invoice draft can be edited';
  END IF;
  IF current_draft.row_version<>expected_row_version THEN
    RAISE EXCEPTION USING ERRCODE='40001',
      MESSAGE='invoice draft row version changed';
  END IF;
  IF current_draft.prepared_command_request_id IS NOT NULL THEN
    SELECT * INTO STRICT command_row
      FROM automation.command_requests request
     WHERE request.org_id=organization_id
       AND request.id=current_draft.prepared_command_request_id
     FOR UPDATE;
    IF command_row.status IN ('approved','executing','succeeded') THEN
      RAISE EXCEPTION USING ERRCODE='23514',
        MESSAGE='approved or posted invoice draft cannot be edited';
    END IF;
    IF command_row.status IN ('prepared','pending_approval') THEN
      INSERT INTO erp_automation_commands.execution_scopes(
        backend_pid,transaction_id,org_id,command_request_id
      ) VALUES (
        pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),
        organization_id,command_row.id
      );
      UPDATE automation.command_requests request
         SET status='cancelled',completed_at=pg_catalog.transaction_timestamp(),
             failure_code='INVOICE_DRAFT_REVISED',
             failure_message='Prepared invoice draft was revised',
             row_version=request.row_version+1
       WHERE request.org_id=organization_id AND request.id=command_row.id;
      DELETE FROM erp_automation_commands.execution_scopes scope
       WHERE scope.backend_pid=pg_catalog.pg_backend_pid()
         AND scope.transaction_id=pg_catalog.txid_current()
         AND scope.org_id=organization_id
         AND scope.command_request_id=command_row.id;
    END IF;
  END IF;
  payload_hash:=extensions.digest(
    pg_catalog.convert_to(draft_payload::text,'UTF8'),'sha256'
  );
  RETURN QUERY
  UPDATE automation.invoice_drafts draft
     SET title=CASE WHEN set_title
                    THEN NULLIF(pg_catalog.btrim(draft_title),'')
                    ELSE draft.title END,
         payload=draft_payload,payload_sha256=payload_hash,
         prepared_command_request_id=NULL,prepared_draft_row_version=NULL,
         prepared_at=NULL,
         updated_at=pg_catalog.transaction_timestamp(),
         updated_by_membership_id=actor_id,
         row_version=draft.row_version+1
   WHERE draft.org_id=organization_id AND draft.id=draft_id
  RETURNING draft.id,draft.row_version;
END
$function$;

CREATE FUNCTION erp_automation_commands.abandon_invoice_draft(
  organization_id uuid,
  draft_id uuid,
  expected_row_version bigint
)
RETURNS TABLE(
  abandoned_draft_id uuid,
  new_row_version bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
#variable_conflict use_variable
DECLARE current_draft automation.invoice_drafts%ROWTYPE;
        command_row automation.command_requests%ROWTYPE;
        actor_id uuid; permission_code text;
BEGIN
  SELECT * INTO current_draft
    FROM automation.invoice_drafts draft
   WHERE draft.org_id=organization_id AND draft.id=draft_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='invoice draft not found';
  END IF;
  permission_code:=CASE current_draft.document_kind
    WHEN 'sales_invoice' THEN 'sales.invoice.create'
    ELSE 'procurement.supplier_invoice.create'
  END;
  actor_id:=erp_core_commands.assert_context(
    organization_id,permission_code,current_draft.branch_id
  );
  IF current_draft.lifecycle_state<>'open' THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='only an open invoice draft can be abandoned';
  END IF;
  IF current_draft.row_version<>expected_row_version THEN
    RAISE EXCEPTION USING ERRCODE='40001',
      MESSAGE='invoice draft row version changed';
  END IF;
  IF current_draft.prepared_command_request_id IS NOT NULL THEN
    SELECT * INTO STRICT command_row
      FROM automation.command_requests request
     WHERE request.org_id=organization_id
       AND request.id=current_draft.prepared_command_request_id
     FOR UPDATE;
    IF command_row.status IN ('approved','executing','succeeded') THEN
      RAISE EXCEPTION USING ERRCODE='23514',
        MESSAGE='approved or posted invoice draft cannot be abandoned';
    END IF;
    IF command_row.status IN ('prepared','pending_approval') THEN
      INSERT INTO erp_automation_commands.execution_scopes(
        backend_pid,transaction_id,org_id,command_request_id
      ) VALUES (
        pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),
        organization_id,command_row.id
      );
      UPDATE automation.command_requests request
         SET status='cancelled',completed_at=pg_catalog.transaction_timestamp(),
             failure_code='INVOICE_DRAFT_ABANDONED',
             failure_message='Prepared invoice draft was abandoned',
             row_version=request.row_version+1
       WHERE request.org_id=organization_id AND request.id=command_row.id;
      DELETE FROM erp_automation_commands.execution_scopes scope
       WHERE scope.backend_pid=pg_catalog.pg_backend_pid()
         AND scope.transaction_id=pg_catalog.txid_current()
         AND scope.org_id=organization_id
         AND scope.command_request_id=command_row.id;
    END IF;
  END IF;
  RETURN QUERY
  UPDATE automation.invoice_drafts draft
     SET lifecycle_state='abandoned',updated_at=pg_catalog.transaction_timestamp(),
         updated_by_membership_id=actor_id,row_version=draft.row_version+1
   WHERE draft.org_id=organization_id AND draft.id=draft_id
  RETURNING draft.id,draft.row_version;
END
$function$;

CREATE FUNCTION erp_automation_commands.bind_invoice_draft_prepare(
  organization_id uuid,
  draft_id uuid,
  expected_row_version bigint,
  expected_payload_sha256 bytea,
  command_request_id uuid,
  expected_operation text,
  expected_resource_id uuid
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
#variable_conflict use_variable
DECLARE draft_row automation.invoice_drafts%ROWTYPE;
        command_row automation.command_requests%ROWTYPE;
        expected_kind text;
BEGIN
  IF SESSION_USER<>'erp_calculator' OR draft_id IS NULL
     OR expected_row_version IS NULL OR expected_row_version<=0
     OR pg_catalog.octet_length(expected_payload_sha256)<>32
     OR command_request_id IS NULL OR expected_resource_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='invoice draft prepare binding is invalid';
  END IF;
  expected_kind:=CASE expected_operation
    WHEN 'sales.invoice.post' THEN 'sales_invoice'
    WHEN 'procurement.supplier_invoice.post' THEN 'supplier_invoice'
    ELSE NULL
  END;
  IF expected_kind IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='invoice draft prepare operation is invalid';
  END IF;
  SELECT * INTO draft_row
    FROM automation.invoice_drafts draft
   WHERE draft.org_id=organization_id AND draft.id=draft_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='invoice draft not found';
  END IF;
  SELECT * INTO STRICT command_row
    FROM automation.command_requests request
   WHERE request.org_id=organization_id AND request.id=command_request_id
   FOR SHARE;
  IF draft_row.lifecycle_state<>'open'
     OR draft_row.prepared_command_request_id IS NOT NULL
     OR draft_row.document_kind<>expected_kind
     OR draft_row.row_version<>expected_row_version
     OR draft_row.payload_sha256 IS DISTINCT FROM expected_payload_sha256
     OR command_row.operation<>expected_operation
     OR command_row.capability_code<>(CASE expected_operation
          WHEN 'sales.invoice.post' THEN 'sales.invoice.prepare'
          ELSE 'procurement.supplier_invoice.prepare'
        END)
     OR command_row.target_resource_id<>expected_resource_id
     OR command_row.branch_id<>draft_row.branch_id
     OR command_row.status NOT IN ('prepared','pending_approval') THEN
    RAISE EXCEPTION USING ERRCODE='40001',
      MESSAGE='invoice draft or prepared command changed';
  END IF;
  UPDATE automation.invoice_drafts draft
     SET prepared_command_request_id=command_request_id,
         prepared_draft_row_version=expected_row_version,
         prepared_at=pg_catalog.transaction_timestamp(),
         updated_at=pg_catalog.transaction_timestamp(),
         row_version=draft.row_version+1
   WHERE draft.org_id=organization_id AND draft.id=draft_id;
  RETURN expected_row_version+1;
END
$function$;

CREATE FUNCTION erp_automation_reads.invoice_draft(
  organization_id uuid,
  draft_id uuid
)
RETURNS TABLE(
  id uuid,document_kind text,branch_id uuid,title text,payload jsonb,
  payload_sha256 text,status text,prepared_command_request_id uuid,
  posted_resource_id uuid,
  created_via text,created_at timestamptz,updated_at timestamptz,row_version bigint
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path=''
AS $function$
  SELECT draft.id,draft.document_kind::text,draft.branch_id,draft.title,
         draft.payload,pg_catalog.encode(draft.payload_sha256,'hex'),
         CASE
           WHEN draft.lifecycle_state='abandoned' THEN 'abandoned'
           WHEN command.status='succeeded' THEN 'posted'
           WHEN command.status IN (
             'prepared','pending_approval','approved','executing'
           ) THEN 'prepared'
           ELSE 'open'
         END,
         draft.prepared_command_request_id,command.result_resource_id,
         draft.created_via::text,
         draft.created_at,draft.updated_at,draft.row_version
    FROM automation.invoice_drafts draft
    LEFT JOIN automation.command_requests command
      ON command.org_id=draft.org_id
     AND command.id=draft.prepared_command_request_id
   WHERE draft.org_id=organization_id AND draft.id=draft_id
     AND organization_id=erp_security.current_org_id()
     AND erp_security.current_actor_is_active()
     AND erp_security.can_access_branch(draft.branch_id)
     AND erp_security.has_permission(
       CASE draft.document_kind
         WHEN 'sales_invoice' THEN 'sales.invoice.create'
         ELSE 'procurement.supplier_invoice.create'
       END,
       draft.branch_id
     );
$function$;

CREATE FUNCTION erp_automation_reads.invoice_drafts(
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
           draft.title,draft.payload,pg_catalog.encode(draft.payload_sha256,'hex') AS payload_sha256,
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

ALTER FUNCTION erp_automation_commands.create_invoice_draft(
  uuid,uuid,text,uuid,text,jsonb,text
) OWNER TO erp_migration_owner;
ALTER FUNCTION erp_automation_commands.update_invoice_draft(
  uuid,uuid,bigint,boolean,text,jsonb
) OWNER TO erp_migration_owner;
ALTER FUNCTION erp_automation_commands.abandon_invoice_draft(
  uuid,uuid,bigint
) OWNER TO erp_migration_owner;
ALTER FUNCTION erp_automation_commands.bind_invoice_draft_prepare(
  uuid,uuid,bigint,bytea,uuid,text,uuid
) OWNER TO erp_migration_owner;
ALTER FUNCTION erp_automation_reads.invoice_draft(uuid,uuid)
  OWNER TO erp_migration_owner;
ALTER FUNCTION erp_automation_reads.invoice_drafts(uuid,text,text,uuid[],integer,integer)
  OWNER TO erp_migration_owner;

REVOKE ALL ON TABLE automation.invoice_drafts FROM PUBLIC,erp_app,erp_runtime,erp_calculator;
REVOKE ALL ON FUNCTION erp_automation_commands.create_invoice_draft(
  uuid,uuid,text,uuid,text,jsonb,text
) FROM PUBLIC,erp_app,erp_runtime,erp_calculator;
REVOKE ALL ON FUNCTION erp_automation_commands.update_invoice_draft(
  uuid,uuid,bigint,boolean,text,jsonb
) FROM PUBLIC,erp_app,erp_runtime,erp_calculator;
REVOKE ALL ON FUNCTION erp_automation_commands.abandon_invoice_draft(
  uuid,uuid,bigint
) FROM PUBLIC,erp_app,erp_runtime,erp_calculator;
REVOKE ALL ON FUNCTION erp_automation_commands.bind_invoice_draft_prepare(
  uuid,uuid,bigint,bytea,uuid,text,uuid
) FROM PUBLIC,erp_app,erp_runtime,erp_calculator;
REVOKE ALL ON FUNCTION erp_automation_reads.invoice_draft(uuid,uuid)
  FROM PUBLIC,erp_app,erp_runtime,erp_calculator;
REVOKE ALL ON FUNCTION erp_automation_reads.invoice_drafts(uuid,text,text,uuid[],integer,integer)
  FROM PUBLIC,erp_app,erp_runtime,erp_calculator;

GRANT EXECUTE ON FUNCTION erp_automation_commands.create_invoice_draft(
  uuid,uuid,text,uuid,text,jsonb,text
) TO erp_runtime;
GRANT EXECUTE ON FUNCTION erp_automation_commands.update_invoice_draft(
  uuid,uuid,bigint,boolean,text,jsonb
) TO erp_runtime;
GRANT EXECUTE ON FUNCTION erp_automation_commands.abandon_invoice_draft(
  uuid,uuid,bigint
) TO erp_runtime;
GRANT EXECUTE ON FUNCTION erp_automation_commands.bind_invoice_draft_prepare(
  uuid,uuid,bigint,bytea,uuid,text,uuid
) TO erp_calculator;
GRANT EXECUTE ON FUNCTION erp_automation_reads.invoice_draft(uuid,uuid)
  TO erp_runtime;
GRANT EXECUTE ON FUNCTION erp_automation_reads.invoice_drafts(uuid,text,text,uuid[],integer,integer)
  TO erp_runtime;

RESET ROLE;
