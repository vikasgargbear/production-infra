-- One domain-owned selling-rate history shared by import and operator review.
-- Historical source facts, stock valuation and posted documents are never rewritten.
CREATE TABLE inventory.batch_sale_rate_evidence (
  org_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  version bigint NOT NULL CHECK (version>0),
  sale_rate numeric(20,4) NOT NULL CHECK (sale_rate>=0 AND sale_rate<'Infinity'::numeric),
  uom_code varchar(16) NOT NULL,
  price_basis text NOT NULL CHECK (price_basis='tax_exclusive'),
  effective_from date NOT NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('operator_review','migration_source')),
  source_evidence jsonb NOT NULL CHECK (jsonb_typeof(source_evidence)='object'),
  command_request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  created_by_membership_id uuid NOT NULL,
  PRIMARY KEY (org_id,id),
  UNIQUE (org_id,branch_id,batch_id,version),
  UNIQUE (org_id,command_request_id,batch_id),
  FOREIGN KEY (org_id) REFERENCES core.organizations(id),
  FOREIGN KEY (org_id,branch_id) REFERENCES core.branches(org_id,id),
  FOREIGN KEY (org_id,batch_id) REFERENCES inventory.batches(org_id,id),
  FOREIGN KEY (org_id,command_request_id) REFERENCES automation.command_requests(org_id,id),
  FOREIGN KEY (org_id,created_by_membership_id) REFERENCES core.memberships(org_id,id)
);
ALTER TABLE inventory.batch_sale_rate_evidence OWNER TO erp_migration_owner;
ALTER TABLE inventory.batch_sale_rate_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory.batch_sale_rate_evidence FORCE ROW LEVEL SECURITY;
CREATE POLICY batch_sale_rate_owner ON inventory.batch_sale_rate_evidence TO erp_migration_owner
 USING (org_id=erp_security.current_org_id() AND erp_security.can_access_branch(branch_id))
 WITH CHECK (org_id=erp_security.current_org_id() AND erp_security.can_access_branch(branch_id));
REVOKE ALL ON inventory.batch_sale_rate_evidence FROM PUBLIC,erp_app,erp_runtime;
CREATE TRIGGER batch_sale_rate_immutable BEFORE UPDATE OR DELETE ON inventory.batch_sale_rate_evidence
 FOR EACH ROW EXECUTE FUNCTION erp_plumbing.reject_row_mutation();
CREATE TRIGGER batch_sale_rate_audit AFTER INSERT ON inventory.batch_sale_rate_evidence
 FOR EACH ROW EXECUTE FUNCTION erp_plumbing.audit_row_mutation();

CREATE FUNCTION erp_automation_commands.resolve_batch_sale_rate(
 organization_id uuid, grant_id uuid, request_document jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=on AS $function$
#variable_conflict use_variable
DECLARE actor uuid; branch uuid:=(request_document->>'branch_id')::uuid;
 item jsonb; batch inventory.batches%ROWTYPE; product catalog.products%ROWTYPE;
 fact automation.historical_migration_facts%ROWTYPE; sale automation.historical_migration_facts%ROWTYPE; latest_version bigint;
 versions jsonb:='[]'; seen uuid[]:='{}'; evidence jsonb;
BEGIN
 actor:=erp_core_commands.assert_context(organization_id,'catalog.product.manage',branch);
 IF SESSION_USER<>'erp_runtime' OR branch IS NULL OR
    jsonb_typeof(request_document->'lines') IS DISTINCT FROM 'array' OR
    jsonb_array_length(request_document->'lines') NOT BETWEEN 1 AND 100 THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Selling-rate review requires 1–100 exact batches';
 END IF;
 PERFORM 1 FROM automation.agent_grants g JOIN automation.agent_grant_capabilities c
 ON c.org_id=g.org_id AND c.agent_grant_id=g.id
 WHERE g.org_id=organization_id AND g.id=grant_id AND g.subject_membership_id=actor
 AND g.status='active' AND g.expires_at>transaction_timestamp()
 AND (g.branch_id IS NULL OR g.branch_id=branch) AND c.status='active'
 AND c.capability_code='inventory.batch_sale_rate.prepare' AND c.operation_mode='write'
 AND c.risk_class='consequential_write' AND c.approval_policy='actor_confirmation' FOR SHARE OF g,c;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Selling-rate capability is not active'; END IF;
 PERFORM 1 FROM core.branches WHERE org_id=organization_id AND id=branch AND status='active';
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Selling-rate branch is unavailable'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(request_document->'lines') ORDER BY value->>'batch_id' LOOP
   IF (item->>'batch_id')::uuid=ANY(seen) OR
      COALESCE(item->>'sale_rate','') !~ '^(0|[1-9][0-9]{0,15})([.][0-9]{1,4})?$' OR
      item->>'price_basis' IS DISTINCT FROM 'tax_exclusive' OR
      COALESCE(item->>'expected_rate_version','') !~ '^[0-9]+$' OR
      COALESCE(item->>'batch_row_version','') !~ '^[1-9][0-9]*$' OR
      NULLIF(item->>'effective_from','') IS NULL OR
      COALESCE(item->>'effective_from','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR
      item->>'source_kind' NOT IN ('operator_review','migration_source') OR item->>'source_kind' IS NULL THEN
     RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Selling-rate value, version or basis is invalid';
   END IF;
   seen:=array_append(seen,(item->>'batch_id')::uuid);
   PERFORM pg_advisory_xact_lock(hashtextextended(organization_id::text||':'||branch::text||':'||(item->>'batch_id'),7909));
   SELECT * INTO STRICT batch FROM inventory.batches WHERE org_id=organization_id AND id=(item->>'batch_id')::uuid FOR SHARE;
   SELECT * INTO STRICT product FROM catalog.products WHERE org_id=organization_id AND id=batch.product_id FOR SHARE;
   IF batch.row_version IS DISTINCT FROM (item->>'batch_row_version')::bigint OR
      product.base_uom_code IS DISTINCT FROM item->>'uom_code' THEN
     RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Selling-rate batch or base unit changed';
   END IF;
   SELECT COALESCE(max(version),0) INTO latest_version FROM inventory.batch_sale_rate_evidence
   WHERE org_id=organization_id AND branch_id=branch AND batch_id=batch.id;
   IF latest_version<>(item->>'expected_rate_version')::bigint THEN
     RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Selling-rate version changed; review the latest rate';
   END IF;
   evidence:=item->'source_evidence';
   IF jsonb_typeof(evidence) IS DISTINCT FROM 'object' OR COALESCE(btrim(evidence->>'reason'),'')='' THEN
     RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Selling-rate review reason is required';
   END IF;
   IF item->>'source_kind'='migration_source' THEN
     -- Imported-source provenance means an authenticated operator reviewed the
     -- supplied source unit/basis and corroborating immutable sale. External
     -- file digests are audit references, not server-verified file attestations.
     IF (item->>'sale_rate')::numeric<=0 THEN
       RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Imported selling rates must be positive';
     END IF;
     SELECT f.* INTO STRICT fact FROM automation.historical_batch_bindings b
     JOIN automation.historical_migration_facts f ON f.org_id=b.org_id AND f.id=b.source_batch_fact_id
     WHERE b.org_id=organization_id AND b.batch_id=batch.id
       AND f.id=(evidence->>'source_batch_fact_id')::uuid AND f.branch_id=branch;
     IF encode(fact.row_sha256,'hex') IS DISTINCT FROM evidence->>'source_batch_row_sha256' OR
        COALESCE(evidence->>'source_file_sha256','') !~ '^[0-9a-f]{64}$' OR
        COALESCE(btrim(evidence->>'source_record_key'),'')='' OR
        fact.selection_state NOT IN ('reviewed','included') THEN
       RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Selling-rate source must match the immutable imported batch evidence';
     END IF;
     SELECT l.* INTO STRICT sale FROM automation.historical_migration_facts l
       JOIN automation.historical_migration_facts invoice ON invoice.org_id=l.org_id AND invoice.dataset_id=l.dataset_id
        AND invoice.branch_id=l.branch_id AND invoice.source_kind='sales_invoice'
        AND invoice.event_date=l.event_date
        AND invoice.record_key=l.payload->>'source_invoice_id' AND invoice.selection_state IN ('reviewed','included')
       WHERE l.org_id=organization_id AND l.dataset_id=fact.dataset_id AND l.branch_id=branch
        AND l.source_kind='sales_invoice_line' AND l.record_key=evidence->>'source_sales_line_record_key'
        AND l.id=(evidence->>'source_sales_line_fact_id')::uuid
        AND l.product_code=fact.product_code AND l.batch_number=fact.batch_number
        AND l.selection_state IN ('reviewed','included') AND l.event_date<=(item->>'effective_from')::date;
     IF encode(sale.row_sha256,'hex') IS DISTINCT FROM evidence->>'source_sales_line_row_sha256' OR
        sale.payload->>'quoted_unit_rate' IS NULL OR (sale.payload->>'quoted_unit_rate')::numeric<>(item->>'sale_rate')::numeric OR
        (sale.payload->>'billed_quantity')::numeric IS NULL OR (sale.payload->>'billed_quantity')::numeric<=0 OR
        (sale.payload->>'gross_amount')::numeric IS DISTINCT FROM round((sale.payload->>'billed_quantity')::numeric*(item->>'sale_rate')::numeric,2) OR
        (sale.payload->>'line_discount')::numeric IS NULL OR (sale.payload->>'line_discount')::numeric<0 OR
        (sale.payload->>'line_discount')::numeric>(sale.payload->>'gross_amount')::numeric OR
        (sale.payload->>'tax_rate')::numeric IS NULL OR (sale.payload->>'tax_rate')::numeric<0 OR
        (sale.payload->>'tax_amount')::numeric IS DISTINCT FROM round(((sale.payload->>'gross_amount')::numeric-(sale.payload->>'line_discount')::numeric)*(sale.payload->>'tax_rate')::numeric/100,2) OR
        (sale.payload->>'line_total')::numeric IS DISTINCT FROM (sale.payload->>'gross_amount')::numeric-(sale.payload->>'line_discount')::numeric+(sale.payload->>'tax_amount')::numeric THEN
       RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Selling-rate source must match an exact tax-exclusive historical sale line';
     END IF;
   END IF;
   versions:=versions||jsonb_build_array(jsonb_build_object('resource_type','batch','id',batch.id,
       'row_version',batch.row_version,'rate_version',latest_version,'product_id',product.id,'uom_code',product.base_uom_code));
 END LOOP;
 RETURN jsonb_build_object('source_versions',versions,'lines',request_document->'lines','branch_id',branch);
END $function$;

CREATE FUNCTION erp_automation_commands.persist_batch_sale_rate_prepare(
 organization_id uuid, grant_id uuid, command_id uuid, key_hash bytea, request_bytes bytea, expires_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=on AS $function$
#variable_conflict use_variable
DECLARE request_document jsonb:=convert_from(request_bytes,'UTF8')::jsonb; resolved jsonb; preview jsonb;
 old automation.command_requests%ROWTYPE; result_id uuid;
BEGIN
 PERFORM erp_core_commands.assert_context(organization_id,'catalog.product.manage',(request_document->>'branch_id')::uuid);
 PERFORM pg_advisory_xact_lock(hashtextextended(organization_id::text||':'||grant_id::text||':'||encode(key_hash,'hex'),7910));
 SELECT * INTO old FROM automation.command_requests WHERE org_id=organization_id AND agent_grant_id=grant_id
 AND capability_code='inventory.batch_sale_rate.prepare' AND idempotency_key_hash=key_hash;
 IF FOUND THEN
   IF old.requested_by_membership_id IS DISTINCT FROM erp_security.current_membership_id() OR
      old.request_hash IS DISTINCT FROM extensions.digest(request_bytes,'sha256') THEN
     RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='Selling-rate replay input differs';
   END IF;
   RETURN jsonb_build_object('command_request_id',old.id,'preview_hash',encode(old.preview_hash,'hex'),
       'expires_at',old.expires_at,'preview',convert_from(old.preview_bytes,'UTF8')::jsonb);
 END IF;
 resolved:=erp_automation_commands.resolve_batch_sale_rate(organization_id,grant_id,request_document);
 preview:=jsonb_build_object('command_request_id',command_id,'capability_code','inventory.batch_sale_rate.prepare',
   'operation','inventory.batch_sale_rate.record','organization_id',organization_id,'branch_id',request_document->>'branch_id',
   'target_resource_type','batch_sale_rate_review','target_resource_id',command_id,
   'source_versions',resolved->'source_versions','resolved_references',resolved->'lines',
   'request_hash',encode(extensions.digest(request_bytes,'sha256'),'hex'),'calculation_ruleset','[]'::jsonb,
   'inventory_impact','[]'::jsonb,'financial_impact','[]'::jsonb,'tax_impact','[]'::jsonb,'selling_rates',resolved->'lines');
 result_id:=erp_automation_commands.prepare_operator_command(organization_id,command_id,grant_id,
   'inventory.batch_sale_rate.prepare',(request_document->>'branch_id')::uuid,NULL,command_id,NULL,NULL,
   key_hash,request_bytes,convert_to(preview::text,'UTF8'),NULL,
   extensions.digest(convert_to((resolved->'source_versions')::text,'UTF8'),'sha256'),expires_at);
 RETURN jsonb_build_object('command_request_id',result_id,'preview_hash',encode(extensions.digest(convert_to(preview::text,'UTF8'),'sha256'),'hex'),
   'expires_at',expires_at,'preview',preview);
END $function$;

CREATE FUNCTION erp_automation_commands.execute_batch_sale_rate(organization_id uuid, command_request_id uuid)
RETURNS bytea LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=on AS $function$
#variable_conflict use_variable
DECLARE request automation.command_requests%ROWTYPE; resolved jsonb; item jsonb; response bytea; reviewed jsonb;
BEGIN
 IF SESSION_USER<>'erp_runtime' OR organization_id IS DISTINCT FROM erp_security.current_org_id() OR
    NULLIF(current_setting('app.command_request_id',true),'')::uuid IS DISTINCT FROM command_request_id THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Selling-rate execution context differs';
 END IF;
 SELECT * INTO STRICT request FROM automation.command_requests WHERE org_id=organization_id AND id=command_request_id FOR UPDATE;
 IF request.operation<>'inventory.batch_sale_rate.record' OR request.capability_code<>'inventory.batch_sale_rate.prepare' OR
    request.requested_by_membership_id IS DISTINCT FROM erp_security.current_membership_id() THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Selling-rate command is not owned by this actor';
 END IF;
 PERFORM erp_core_commands.assert_context(organization_id,'automation.command.execute',request.branch_id);
 IF request.status='succeeded' THEN RETURN request.response_bytes; END IF;
 IF request.status NOT IN ('prepared','approved') OR request.expires_at<=transaction_timestamp() OR
    request.request_hash IS DISTINCT FROM extensions.digest(request.request_bytes,'sha256') OR
    request.preview_hash IS DISTINCT FROM extensions.digest(request.preview_bytes,'sha256') THEN
   RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Selling-rate command expired or changed';
 END IF;
 resolved:=erp_automation_commands.resolve_batch_sale_rate(organization_id,request.agent_grant_id,convert_from(request.request_bytes,'UTF8')::jsonb);
 reviewed:=convert_from(request.preview_bytes,'UTF8')::jsonb;
 IF resolved->'source_versions' IS DISTINCT FROM reviewed->'source_versions' OR
    request.aggregate_version_hash IS DISTINCT FROM extensions.digest(convert_to((resolved->'source_versions')::text,'UTF8'),'sha256') OR
    resolved->'lines' IS DISTINCT FROM reviewed->'selling_rates' THEN
   RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Selling-rate evidence changed after review';
 END IF;
 PERFORM 1 FROM automation.command_approvals a WHERE a.org_id=organization_id AND a.command_request_id=command_request_id
 AND a.decision='rejected' AND a.preview_hash=request.preview_hash AND a.aggregate_version_hash=request.aggregate_version_hash;
 IF FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Selling-rate review was rejected'; END IF;
 PERFORM 1 FROM automation.command_approvals a WHERE a.org_id=organization_id AND a.command_request_id=command_request_id
 AND a.decision='approved' AND a.preview_hash=request.preview_hash AND a.aggregate_version_hash=request.aggregate_version_hash
 AND a.approver_membership_id=request.requested_by_membership_id AND request.required_approval_count=1
 AND request.approval_policy='actor_confirmation' AND a.valid_until_at>transaction_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Selling-rate exact review approval is required'; END IF;
 INSERT INTO erp_automation_commands.execution_scopes VALUES(pg_backend_pid(),txid_current(),organization_id,command_request_id);
 IF request.status='prepared' THEN
   UPDATE automation.command_requests SET status='approved',row_version=row_version+1 WHERE org_id=organization_id AND id=command_request_id;
 END IF;
 UPDATE automation.command_requests SET status='executing',execution_started_at=transaction_timestamp(),row_version=row_version+1
 WHERE org_id=organization_id AND id=command_request_id;
 FOR item IN SELECT value FROM jsonb_array_elements(resolved->'lines') LOOP
   INSERT INTO inventory.batch_sale_rate_evidence(org_id,branch_id,batch_id,version,sale_rate,uom_code,price_basis,
      effective_from,source_kind,source_evidence,command_request_id,created_by_membership_id)
   VALUES(organization_id,request.branch_id,(item->>'batch_id')::uuid,(item->>'expected_rate_version')::bigint+1,
      (item->>'sale_rate')::numeric,item->>'uom_code',item->>'price_basis',(item->>'effective_from')::date,
      item->>'source_kind',item->'source_evidence',command_request_id,request.requested_by_membership_id);
 END LOOP;
 response:=convert_to(jsonb_build_object('command_request_id',command_request_id,'operation',request.operation,
   'resource_id',command_request_id,'resource_type','batch_sale_rate_review','status','succeeded')::text,'UTF8');
 UPDATE automation.command_requests SET status='succeeded',completed_at=transaction_timestamp(),result_resource_type='batch_sale_rate_review',
   result_resource_id=command_request_id,response_status=200,response_media_type='application/vnd.aasopharma.command-result+json',
   response_bytes=response,response_hash=extensions.digest(response,'sha256'),row_version=row_version+1
 WHERE org_id=organization_id AND id=command_request_id;
 DELETE FROM erp_automation_commands.execution_scopes s WHERE s.backend_pid=pg_backend_pid() AND s.transaction_id=txid_current()
 AND s.org_id=organization_id AND s.command_request_id=command_request_id;
 RETURN response;
END $function$;

CREATE FUNCTION erp_automation_reads.batch_sale_rate_review(organization_id uuid, command_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET row_security=on AS $function$
BEGIN
 PERFORM erp_core_commands.assert_context(organization_id,'catalog.product.manage',NULL);
 RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'batch_id',batch_id,'branch_id',branch_id,
 'version',version,'sale_rate',sale_rate::text,'uom_code',uom_code,'price_basis',price_basis,
 'effective_from',effective_from,'source_kind',source_kind,'source_evidence',source_evidence) ORDER BY batch_id)
 FROM inventory.batch_sale_rate_evidence WHERE org_id=organization_id AND command_request_id=command_id),'[]'::jsonb);
END $function$;

ALTER FUNCTION erp_automation_commands.resolve_batch_sale_rate(uuid,uuid,jsonb) OWNER TO erp_migration_owner;
ALTER FUNCTION erp_automation_commands.persist_batch_sale_rate_prepare(uuid,uuid,uuid,bytea,bytea,timestamptz) OWNER TO erp_migration_owner;
ALTER FUNCTION erp_automation_commands.execute_batch_sale_rate(uuid,uuid) OWNER TO erp_migration_owner;
ALTER FUNCTION erp_automation_reads.batch_sale_rate_review(uuid,uuid) OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_automation_commands.resolve_batch_sale_rate(uuid,uuid,jsonb) FROM PUBLIC,erp_app,erp_runtime;
REVOKE ALL ON FUNCTION erp_automation_commands.persist_batch_sale_rate_prepare(uuid,uuid,uuid,bytea,bytea,timestamptz) FROM PUBLIC,erp_app,erp_runtime;
REVOKE ALL ON FUNCTION erp_automation_commands.execute_batch_sale_rate(uuid,uuid) FROM PUBLIC,erp_app,erp_runtime;
REVOKE ALL ON FUNCTION erp_automation_reads.batch_sale_rate_review(uuid,uuid) FROM PUBLIC,erp_app,erp_runtime;
GRANT EXECUTE ON FUNCTION erp_automation_commands.persist_batch_sale_rate_prepare(uuid,uuid,uuid,bytea,bytea,timestamptz),
 erp_automation_commands.execute_batch_sale_rate(uuid,uuid),erp_automation_reads.batch_sale_rate_review(uuid,uuid) TO erp_runtime;

CREATE FUNCTION erp_automation_reads.batch_sale_rate_context(organization_id uuid, selected_branch_id uuid, page_limit integer, page_offset integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET row_security=on AS $function$
BEGIN
 PERFORM erp_core_commands.assert_context(organization_id,'catalog.product.manage',selected_branch_id);
 IF selected_branch_id IS NULL OR page_limit IS NULL OR page_offset IS NULL OR page_limit NOT BETWEEN 1 AND 100 OR page_offset<0 THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Selling-rate context pagination or branch is invalid';
 END IF;
 RETURN jsonb_build_object('organization_id',organization_id,'branch_id',selected_branch_id,'rows',COALESCE((
 SELECT jsonb_agg(row_to_json(rows)) FROM (
 SELECT b.id AS batch_id,b.row_version AS batch_row_version,
   COALESCE((SELECT max(version) FROM inventory.batch_sale_rate_evidence e
      WHERE e.org_id=organization_id AND e.branch_id=selected_branch_id AND e.batch_id=b.id),0) AS expected_rate_version,
   p.base_uom_code AS uom_code,f.product_code AS source_product_code,f.batch_number AS source_batch_number,
   f.id AS source_batch_fact_id,encode(f.row_sha256,'hex') AS source_batch_row_sha256,f.dataset_id,
   COALESCE((SELECT jsonb_agg(jsonb_build_object('id',l.id,'record_key',l.record_key,'row_sha256',encode(l.row_sha256,'hex'),
     'quoted_unit_rate',l.payload->>'quoted_unit_rate','event_date',l.event_date,'payload',l.payload) ORDER BY l.event_date DESC,l.record_key)
     FROM (SELECT l.* FROM automation.historical_migration_facts l WHERE l.org_id=organization_id AND l.dataset_id=f.dataset_id
      AND l.branch_id=selected_branch_id AND l.product_code=f.product_code AND l.batch_number=f.batch_number
      AND l.source_kind='sales_invoice_line' AND l.selection_state IN ('reviewed','included')
      ORDER BY l.event_date DESC,l.record_key LIMIT 100) l),'[]'::jsonb) AS sale_proofs
 FROM inventory.batches b JOIN catalog.products p ON p.org_id=b.org_id AND p.id=b.product_id
 LEFT JOIN automation.historical_batch_bindings binding ON binding.org_id=b.org_id AND binding.batch_id=b.id
 LEFT JOIN automation.historical_migration_facts f ON f.org_id=b.org_id AND f.id=binding.source_batch_fact_id AND f.branch_id=selected_branch_id
 WHERE b.org_id=organization_id AND (f.id IS NOT NULL OR EXISTS (
    SELECT 1 FROM inventory.stock_balances balance WHERE balance.org_id=b.org_id AND balance.batch_id=b.id AND balance.branch_id=selected_branch_id))
 ORDER BY b.id LIMIT page_limit OFFSET page_offset
 ) rows),'[]'::jsonb));
END $function$;
ALTER FUNCTION erp_automation_reads.batch_sale_rate_context(uuid,uuid,integer,integer) OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_automation_reads.batch_sale_rate_context(uuid,uuid,integer,integer) FROM PUBLIC,erp_app,erp_runtime;
GRANT EXECUTE ON FUNCTION erp_automation_reads.batch_sale_rate_context(uuid,uuid,integer,integer) TO erp_runtime;
