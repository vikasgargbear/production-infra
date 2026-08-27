#!/usr/bin/env python3
"""Generate the narrow expense and compliance command boundary.

Only invariants fully provable from the frozen canonical catalog are mapped.
Statutory eligibility, provider authenticity, receipt policy, and Decimal-engine
proof remain explicit blockers.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
DOMAINS_ROOT = ROOT.parent / "domains"
SOURCE_MANIFEST = ROOT.parent / "commands_finance" / "finance-command-manifest.json"
MAPPING_PATH = ROOT / "baseline-compliance-command-enforcements.json"
MANIFEST_PATH = ROOT / "compliance-command-manifest.json"
SCHEMA = "erp_compliance_commands"


class ContractError(RuntimeError):
    """The reviewed command disposition no longer matches its source."""


def _invariants() -> dict[str, dict[str, str]]:
    result: dict[str, dict[str, str]] = {}
    for domain in ("finance", "tax", "compliance"):
        document = json.loads((DOMAINS_ROOT / f"{domain}.json").read_text(encoding="utf-8"))
        for table in document["tables"]:
            for invariant in table.get("cross_row_invariants", []):
                key = f"{table['name']}:{invariant['name']}"
                result[key] = {
                    "table": table["name"],
                    "invariant": invariant["name"],
                    "enforcement": invariant["enforcement"],
                    "rule": invariant["rule"],
                }
    return result


def _function(signature: str, returns: str, body: str, *, runtime: bool = False) -> list[str]:
    statements = [
        f'''CREATE FUNCTION "{SCHEMA}".{signature}
RETURNS {returns}
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
{body.strip()}
$function$''',
        f'ALTER FUNCTION "{SCHEMA}".{signature} OWNER TO "erp_migration_owner"',
        f'REVOKE ALL ON FUNCTION "{SCHEMA}".{signature} FROM PUBLIC, "erp_app", "erp_runtime"',
    ]
    if runtime:
        statements.append(
            f'GRANT EXECUTE ON FUNCTION "{SCHEMA}".{signature} TO "erp_app", "erp_runtime"'
        )
    return statements


def _trigger(name: str, events: str, table: str, function: str) -> str:
    schema, relation = table.split(".")
    return (
        f'CREATE CONSTRAINT TRIGGER "{name}" AFTER {events} ON "{schema}"."{relation}" '
        f'DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION '
        f'"{SCHEMA}"."{function}"()'
    )


def _setup() -> list[str]:
    return [
        f'CREATE SCHEMA "{SCHEMA}" AUTHORIZATION "erp_migration_owner"',
        f'REVOKE ALL ON SCHEMA "{SCHEMA}" FROM PUBLIC, "erp_app", "erp_runtime"',
        f'GRANT USAGE ON SCHEMA "{SCHEMA}" TO "erp_app", "erp_runtime"',
        f'''CREATE TABLE "{SCHEMA}"."command_scopes" (
    backend_pid integer NOT NULL,
    transaction_id bigint NOT NULL,
    scope text NOT NULL,
    org_id uuid NOT NULL,
    entity_id uuid NOT NULL,
    PRIMARY KEY (backend_pid,transaction_id,scope,org_id,entity_id)
)''',
        f'ALTER TABLE "{SCHEMA}"."command_scopes" OWNER TO "erp_migration_owner"',
        f'REVOKE ALL ON TABLE "{SCHEMA}"."command_scopes" FROM PUBLIC, "erp_app", "erp_runtime"',
        *_function(
            '"scope_active"(requested_scope text, organization_id uuid, target_id uuid)',
            "boolean",
            f'''
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM "{SCHEMA}"."command_scopes" scope
         WHERE scope.backend_pid=pg_catalog.pg_backend_pid()
           AND scope.transaction_id=pg_catalog.txid_current()
           AND scope.scope=requested_scope AND scope.org_id=organization_id
           AND scope.entity_id=target_id
    );
END
''',
        ),
        *_function(
            '"assert_context"(organization_id uuid, actor_id uuid, permission_code text, branch_id uuid)',
            "void",
            '''
BEGIN
    IF organization_id IS DISTINCT FROM erp_security.current_org_id()
       OR actor_id IS DISTINCT FROM erp_security.current_membership_id()
       OR NOT EXISTS (SELECT 1 FROM core.memberships membership
                       WHERE membership.org_id=organization_id AND membership.id=actor_id
                         AND membership.status='active')
       OR NOT erp_security.has_permission(permission_code,branch_id) THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='command context, actor, or permission is invalid';
    END IF;
END
''',
        ),
        *_function(
            '"claim"(organization_id uuid, actor_id uuid, operation_name varchar, key_hash bytea, request_hash bytea, expires_at timestamptz, OUT p_claim_id uuid, OUT p_replay_resource_id uuid)',
            "record",
            '''
DECLARE existing core.idempotency_keys%ROWTYPE;
BEGIN
    IF pg_catalog.octet_length(key_hash)<>32 OR pg_catalog.octet_length(request_hash)<>32
       OR expires_at<=pg_catalog.transaction_timestamp() THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid idempotency evidence';
    END IF;
    INSERT INTO core.idempotency_keys(
        org_id,actor_membership_id,operation,idempotency_key_hash,request_hash,expires_at
    ) VALUES(organization_id,actor_id,operation_name,key_hash,request_hash,expires_at)
    ON CONFLICT (org_id,actor_membership_id,operation,idempotency_key_hash) DO NOTHING;
    SELECT * INTO existing FROM core.idempotency_keys
     WHERE org_id=organization_id AND actor_membership_id=actor_id
       AND operation=operation_name AND idempotency_key_hash=key_hash FOR UPDATE;
    IF existing.request_hash IS DISTINCT FROM request_hash THEN
        RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='idempotency key payload mismatch';
    END IF;
    IF existing.status='succeeded' THEN
        p_claim_id:=existing.id; p_replay_resource_id:=existing.resource_id; RETURN;
    END IF;
    IF existing.status<>'claimed' OR existing.expires_at<=pg_catalog.transaction_timestamp() THEN
        RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='idempotency claim is not executable';
    END IF;
    p_claim_id:=existing.id; p_replay_resource_id:=NULL;
END
''',
        ),
        *_function(
            '"finish_claim"(organization_id uuid, p_claim_id uuid, p_resource_type varchar, p_resource_id uuid)',
            "void",
            '''
DECLARE terminal_response_body bytea;
BEGIN
    terminal_response_body := pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'resource_type',p_resource_type,'resource_id',p_resource_id
      )::text,'UTF8');
    UPDATE core.idempotency_keys SET status='succeeded',resource_type=p_resource_type,
      resource_id=p_resource_id,response_status=200,response_media_type='application/json',
      response_body=terminal_response_body,
      response_hash=extensions.digest(terminal_response_body,'sha256'),
      completed_at=pg_catalog.transaction_timestamp()
     WHERE org_id=organization_id AND id=p_claim_id AND status='claimed';
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='idempotency claim completion failed';
    END IF;
END
''',
        ),
    ]


def _controlled_substance_definition() -> list[str]:
    return [
        *_setup(),
        *_function(
            '"guard_controlled_substance_entry"()',
            "trigger",
            f'''
BEGIN
    IF TG_OP<>'INSERT' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='controlled-substance register entries are immutable';
    END IF;
    IF NOT "{SCHEMA}"."scope_active"('controlled_substance_record',NEW.org_id,NEW.id) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='controlled-substance entry requires reviewed command provenance';
    END IF;
    RETURN NEW;
END
''',
        ),
        _trigger(
            "controlled_substance_entries_command_guard_ct",
            "INSERT OR UPDATE OR DELETE",
            "compliance.controlled_substance_entries",
            "guard_controlled_substance_entry",
        ),
        *_function(
            '"record_controlled_substance_entry"(organization_id uuid, entry_id uuid, stock_entry_id uuid, actor_id uuid, register_number varchar, entry_type text, organization_license_id uuid, counterparty_party_id uuid, counterparty_license_id uuid, counterparty_license_number varchar, prescription_evidence_attachment_id uuid, authority_document_number varchar, authority_document_date date, remarks text, key_hash bytea, request_hash bytea, expires_at timestamptz)',
            "uuid",
            f'''
DECLARE ledger inventory.stock_ledger_entries%ROWTYPE; batch inventory.batches%ROWTYPE;
        product catalog.products%ROWTYPE; claim_id uuid; replay_id uuid;
        organization core.organizations%ROWTYPE;
        rule compliance.controlled_movement_rule_versions%ROWTYPE;
        entry_direction text; entry_quantity numeric(20,6); entry_day date;
        matching_license_count bigint;
BEGIN
    PERFORM "{SCHEMA}"."assert_context"(
      organization_id,actor_id,'compliance.controlled_substance.post',NULL::uuid);
    SELECT * INTO STRICT organization FROM core.organizations
     WHERE id=organization_id AND status='active' FOR SHARE;
    SELECT p_claim_id,p_replay_resource_id INTO claim_id,replay_id FROM "{SCHEMA}"."claim"(
      organization_id,actor_id,'compliance.controlled_substance.record',key_hash,request_hash,expires_at);
    IF replay_id IS NOT NULL THEN RETURN replay_id; END IF;
    SELECT * INTO ledger FROM inventory.stock_ledger_entries
     WHERE org_id=organization_id AND id=stock_entry_id FOR SHARE;
    SELECT * INTO batch FROM inventory.batches
     WHERE org_id=organization_id AND id=ledger.batch_id FOR SHARE;
    SELECT * INTO product FROM catalog.products
     WHERE org_id=organization_id AND id=ledger.product_id FOR SHARE;
    IF ledger.id IS NULL OR ledger.quantity_delta=0 OR batch.id IS NULL
       OR batch.product_id IS DISTINCT FROM ledger.product_id OR product.id IS NULL
       OR product.status<>'active'
       OR product.regulatory_ruleset_version IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='entry requires an immutable quantity-bearing ledger fact for an active controlled product';
    END IF;
    IF entry_type NOT IN ('receipt','dispatch','return_in','return_out','transfer_in','transfer_out','adjustment','destruction')
       OR (entry_type IN ('receipt','return_in','transfer_in') AND ledger.quantity_delta<=0)
       OR (entry_type IN ('dispatch','return_out','transfer_out','destruction') AND ledger.quantity_delta>=0)
       OR (entry_type='receipt' AND ledger.entry_kind<>'receipt')
       OR (entry_type='dispatch' AND ledger.entry_kind<>'issue')
       OR (entry_type='transfer_in' AND ledger.entry_kind<>'transfer_in')
       OR (entry_type='transfer_out' AND ledger.entry_kind<>'transfer_out')
       OR (entry_type='adjustment' AND ledger.entry_kind NOT IN ('count_gain','count_loss','reversal')) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='register entry type is incompatible with immutable ledger direction or kind';
    END IF;
    IF entry_type='destruction' AND NOT EXISTS (
       SELECT 1 FROM inventory.inventory_documents document
        WHERE document.org_id=organization_id AND document.id=ledger.inventory_document_id
          AND document.document_type='destruction' AND document.status IN ('posted','reversed')) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='destruction register entry requires a posted destruction document';
    END IF;
    entry_direction:=CASE WHEN ledger.quantity_delta>0 THEN 'in' ELSE 'out' END;
    entry_quantity:=pg_catalog.abs(ledger.quantity_delta);
    entry_day:=(ledger.posted_at AT TIME ZONE organization.timezone)::date;
    SELECT * INTO rule FROM compliance.controlled_movement_rule_versions candidate
     WHERE candidate.status='active' AND candidate.entry_type=entry_type
       AND candidate.drug_schedule IN ('ANY',product.drug_schedule)
       AND candidate.ndps_scope IN ('any',CASE WHEN product.ndps_regulated THEN 'regulated' ELSE 'not_regulated' END)
       AND entry_day BETWEEN candidate.effective_from AND COALESCE(candidate.effective_to,'infinity'::date)
     ORDER BY (candidate.drug_schedule=product.drug_schedule) DESC,
              (candidate.ndps_scope<>'any') DESC,candidate.effective_from DESC,candidate.id
     LIMIT 1 FOR SHARE;
    IF rule.id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='no effective reviewed controlled-movement rule applies';
    END IF;
    SELECT count(*) INTO matching_license_count
      FROM compliance.licenses license JOIN core.attachments evidence
        ON evidence.org_id=license.org_id AND evidence.id=license.evidence_attachment_id
       WHERE license.org_id=organization_id AND license.id=organization_license_id
         AND license.organization_subject_id=organization_id
         AND license.license_type_code=rule.organization_license_type_code
         AND license.status='active' AND license.valid_from<=entry_day
         AND (license.valid_until IS NULL OR license.valid_until>=entry_day)
         AND (license.next_verification_due_on IS NULL OR license.next_verification_due_on>=entry_day)
         AND evidence.status IN ('verified','retained');
    IF matching_license_count<>1 THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='movement lacks the required active verified organization license';
    END IF;
    IF (counterparty_party_id IS NULL) IS DISTINCT FROM (counterparty_license_number IS NULL) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='counterparty and license number must be supplied together';
    END IF;
    IF rule.counterparty_required AND (counterparty_party_id IS NULL OR counterparty_license_id IS NULL) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='movement rule requires a typed counterparty and license';
    END IF;
    IF counterparty_party_id IS NOT NULL THEN
        SELECT count(*) INTO matching_license_count
          FROM compliance.licenses license
          JOIN core.attachments evidence ON evidence.org_id=license.org_id
            AND evidence.id=license.evidence_attachment_id
         WHERE license.org_id=organization_id AND license.party_id=counterparty_party_id
           AND license.id=counterparty_license_id
           AND license.license_number=counterparty_license_number AND license.status='active'
           AND license.valid_from<=entry_day
           AND (license.valid_until IS NULL OR license.valid_until>=entry_day)
           AND (license.next_verification_due_on IS NULL OR license.next_verification_due_on>=entry_day)
           AND evidence.status IN ('verified','retained')
           AND license.license_type_code=rule.counterparty_license_type_code;
        IF matching_license_count<>1 THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='counterparty requires exactly one applicable active verified license on entry date';
        END IF;
    END IF;
    IF rule.prescription_evidence_required AND NOT EXISTS (
      SELECT 1 FROM core.attachments attachment WHERE attachment.org_id=organization_id
       AND attachment.id=prescription_evidence_attachment_id AND attachment.status IN ('verified','retained')) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='movement rule requires retained prescription evidence';
    END IF;
    IF rule.authority_document_required
       AND (pg_catalog.btrim(COALESCE(authority_document_number,''))='' OR authority_document_date IS NULL) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='movement rule requires authority-document evidence';
    END IF;
    INSERT INTO "{SCHEMA}"."command_scopes" VALUES
      (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'controlled_substance_record',organization_id,entry_id);
    INSERT INTO compliance.controlled_substance_entries(
      org_id,id,register_number,entry_date,batch_id,stock_ledger_entry_id,rule_version_id,
      organization_license_id,entry_type,direction,
      quantity,counterparty_party_id,counterparty_license_id,counterparty_license_number,
      prescription_evidence_attachment_id,authority_document_number,
      authority_document_date,remarks,handled_by_membership_id,created_by_membership_id)
    VALUES(organization_id,entry_id,register_number,entry_day,batch.id,ledger.id,rule.id,
      organization_license_id,entry_type,entry_direction,entry_quantity,counterparty_party_id,
      counterparty_license_id,counterparty_license_number,prescription_evidence_attachment_id,
      authority_document_number,authority_document_date,remarks,actor_id,actor_id);
    DELETE FROM "{SCHEMA}"."command_scopes" WHERE backend_pid=pg_catalog.pg_backend_pid()
      AND transaction_id=pg_catalog.txid_current() AND scope='controlled_substance_record'
      AND org_id=organization_id AND entity_id=entry_id;
    PERFORM "{SCHEMA}"."finish_claim"(
      organization_id,claim_id,'compliance.controlled_substance_entries',entry_id);
    RETURN entry_id;
END
''',
            runtime=True,
        ),
    ]


def _destruction_definition() -> list[str]:
    return [
        *_function(
            '"guard_destruction"()',
            "trigger",
            f'''
BEGIN
    IF TG_OP='INSERT' AND NEW.status<>'draft' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='destruction must start as draft';
    END IF;
    IF TG_OP='DELETE' THEN
        IF OLD.status<>'draft' THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='non-draft destruction evidence is retained';
        END IF;
        RETURN OLD;
    END IF;
    IF TG_OP='UPDATE' AND OLD.status='posted' AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='posted destruction evidence is immutable';
    END IF;
    IF TG_OP='UPDATE' AND NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status IN ('approved','posted')
       AND NOT "{SCHEMA}"."scope_active"('destruction_'||NEW.status,NEW.org_id,NEW.id) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='destruction approval and posting require reviewed command provenance';
    END IF;
    IF TG_OP='UPDATE' AND OLD.status='approved'
       AND NOT "{SCHEMA}"."scope_active"('destruction_posted',NEW.org_id,NEW.id)
       AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='approved destruction snapshot is frozen';
    END IF;
    RETURN NEW;
END
''',
        ),
        _trigger("destructions_command_guard_ct", "INSERT OR UPDATE OR DELETE", "compliance.destructions", "guard_destruction"),
        *_function(
            '"guard_destruction_inventory_snapshot"()',
            "trigger",
            f'''
DECLARE organization_id uuid; document_id uuid; linked_destruction_id uuid;
        destruction_status text; old_payload jsonb; new_payload jsonb;
BEGIN
    organization_id:=CASE WHEN TG_OP='INSERT' THEN NEW.org_id ELSE OLD.org_id END;
    IF TG_TABLE_NAME='inventory_document_lines' THEN
        IF TG_OP='INSERT' THEN
            SELECT destruction.id,destruction.status INTO linked_destruction_id,destruction_status
              FROM inventory.inventory_documents document
              JOIN compliance.destructions destruction ON destruction.org_id=document.org_id
                AND destruction.id=document.destruction_id
             WHERE document.org_id=organization_id AND document.id=NEW.inventory_document_id
               AND destruction.status IN ('approved','posted') FOR SHARE OF destruction;
        ELSIF TG_OP='DELETE' THEN
            SELECT destruction.id,destruction.status INTO linked_destruction_id,destruction_status
              FROM inventory.inventory_documents document
              JOIN compliance.destructions destruction ON destruction.org_id=document.org_id
                AND destruction.id=document.destruction_id
             WHERE document.org_id=organization_id AND document.id=OLD.inventory_document_id
               AND destruction.status IN ('approved','posted') FOR SHARE OF destruction;
        ELSE
            SELECT destruction.id,destruction.status INTO linked_destruction_id,destruction_status
              FROM inventory.inventory_documents document
              JOIN compliance.destructions destruction ON destruction.org_id=document.org_id
                AND destruction.id=document.destruction_id
             WHERE document.org_id=organization_id
               AND document.id IN (OLD.inventory_document_id,NEW.inventory_document_id)
               AND destruction.status IN ('approved','posted')
             ORDER BY destruction.id LIMIT 1 FOR SHARE OF destruction;
        END IF;
    ELSE
        IF TG_OP='DELETE' THEN
            SELECT destruction.id,destruction.status INTO linked_destruction_id,destruction_status
              FROM compliance.destructions destruction
             WHERE destruction.org_id=organization_id AND destruction.id=OLD.destruction_id
               AND destruction.status IN ('approved','posted') FOR SHARE;
        ELSE
            SELECT destruction.id,destruction.status INTO linked_destruction_id,destruction_status
              FROM compliance.destructions destruction
             WHERE destruction.org_id=organization_id
               AND destruction.id IN (OLD.destruction_id,NEW.destruction_id)
               AND destruction.status IN ('approved','posted')
             ORDER BY destruction.id LIMIT 1 FOR SHARE;
        END IF;
    END IF;
    IF linked_destruction_id IS NULL THEN
        IF TG_OP='DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
    END IF;
    IF TG_TABLE_NAME='inventory_document_lines' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='approved destruction inventory lines are immutable';
    END IF;
    IF TG_OP='DELETE' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='approved destruction inventory document is retained';
    END IF;
    old_payload:=pg_catalog.to_jsonb(OLD)-ARRAY['status','posted_at','posted_by_membership_id',
      'updated_at','updated_by_membership_id','row_version'];
    new_payload:=pg_catalog.to_jsonb(NEW)-ARRAY['status','posted_at','posted_by_membership_id',
      'updated_at','updated_by_membership_id','row_version'];
    IF old_payload IS DISTINCT FROM new_payload
       OR NOT "{SCHEMA}"."scope_active"('destruction_posted',organization_id,linked_destruction_id)
       OR OLD.status<>'approved' OR NEW.status<>'posted' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='approved destruction inventory snapshot may only be posted by its command';
    END IF;
    RETURN NEW;
END
''',
        ),
        _trigger(
            "destruction_inventory_documents_snapshot_ct",
            "UPDATE OR DELETE",
            "inventory.inventory_documents",
            "guard_destruction_inventory_snapshot",
        ),
        _trigger(
            "destruction_inventory_lines_snapshot_ct",
            "INSERT OR UPDATE OR DELETE",
            "inventory.inventory_document_lines",
            "guard_destruction_inventory_snapshot",
        ),
        *_function(
            '"approve_destruction"(organization_id uuid, destruction_id uuid, actor_id uuid, key_hash bytea, request_hash bytea, expires_at timestamptz)',
            "uuid",
            f'''
DECLARE destruction compliance.destructions%ROWTYPE; document inventory.inventory_documents%ROWTYPE;
        attachment core.attachments%ROWTYPE; claim_id uuid; replay_id uuid; line_count bigint;
        quantity_total numeric(20,6); value_total numeric(20,2); approved_time timestamptz;
BEGIN
    PERFORM "{SCHEMA}"."assert_context"(organization_id,actor_id,'compliance.destruction.manage',NULL::uuid);
    SELECT p_claim_id,p_replay_resource_id INTO claim_id,replay_id FROM "{SCHEMA}"."claim"(
      organization_id,actor_id,'compliance.destruction.approve',key_hash,request_hash,expires_at);
    IF replay_id IS NOT NULL THEN RETURN replay_id; END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(organization_id::text||':destruction:'||destruction_id::text,8164101));
    SELECT * INTO destruction FROM compliance.destructions
     WHERE org_id=organization_id AND id=destruction_id FOR UPDATE;
    IF NOT FOUND OR destruction.status<>'submitted' OR destruction.created_by_membership_id=actor_id THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='destruction must be submitted and approved by a distinct actor';
    END IF;
    SELECT * INTO document FROM inventory.inventory_documents
     WHERE org_id=organization_id AND id=destruction.inventory_document_id FOR UPDATE;
    PERFORM "{SCHEMA}"."assert_context"(organization_id,actor_id,'inventory.document.post',document.branch_id);
    IF document.id IS NULL OR document.status<>'submitted' OR document.document_type<>'destruction'
       OR document.destruction_id IS DISTINCT FROM destruction.id
       OR document.document_date IS DISTINCT FROM destruction.destruction_date THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='destruction requires its exact submitted typed inventory document';
    END IF;
    SELECT * INTO attachment FROM core.attachments WHERE org_id=organization_id
      AND id=destruction.certificate_attachment_id FOR SHARE;
    IF attachment.status NOT IN ('verified','retained') THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='destruction certificate is not verified';
    END IF;
    SELECT count(*),COALESCE(sum(pg_catalog.abs(line.base_quantity)),0),
           COALESCE(sum(pg_catalog.abs(line.extended_cost)),0)
      INTO line_count,quantity_total,value_total
      FROM inventory.inventory_document_lines line
      JOIN inventory.batches batch ON batch.org_id=line.org_id AND batch.id=line.batch_id
      JOIN inventory.locations location ON location.org_id=line.org_id AND location.id=line.from_location_id
     WHERE line.org_id=organization_id AND line.inventory_document_id=document.id
       AND line.movement_kind='issue' AND line.base_quantity>0
       AND batch.product_id=line.product_id AND location.branch_id=document.branch_id;
    IF line_count=0 OR line_count<>(SELECT count(*) FROM inventory.inventory_document_lines line
       WHERE line.org_id=organization_id AND line.inventory_document_id=document.id)
       OR document.total_abs_base_quantity IS DISTINCT FROM quantity_total
       OR document.total_value IS DISTINCT FROM value_total THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='destruction inventory snapshot is incomplete or totals do not match';
    END IF;
    approved_time:=pg_catalog.transaction_timestamp();
    INSERT INTO "{SCHEMA}"."command_scopes" VALUES
      (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'destruction_approved',organization_id,destruction_id);
    UPDATE inventory.inventory_documents SET status='approved',approved_at=approved_time,
      approved_by_membership_id=actor_id,updated_at=approved_time,updated_by_membership_id=actor_id,
      row_version=row_version+1 WHERE org_id=organization_id AND id=document.id AND status='submitted';
    UPDATE compliance.destructions SET status='approved',approved_at=approved_time,
      approved_by_membership_id=actor_id,updated_at=approved_time,updated_by_membership_id=actor_id,
      row_version=row_version+1 WHERE org_id=organization_id AND id=destruction_id AND status='submitted';
    DELETE FROM "{SCHEMA}"."command_scopes" WHERE backend_pid=pg_catalog.pg_backend_pid()
      AND transaction_id=pg_catalog.txid_current() AND scope='destruction_approved'
      AND org_id=organization_id AND entity_id=destruction_id;
    PERFORM "{SCHEMA}"."finish_claim"(organization_id,claim_id,'compliance.destructions',destruction_id);
    RETURN destruction_id;
END
''',
            runtime=True,
        ),
        *_function(
            '"post_destruction"(organization_id uuid, destruction_id uuid, actor_id uuid, key_hash bytea, request_hash bytea, expires_at timestamptz)',
            "uuid",
            f'''
DECLARE destruction compliance.destructions%ROWTYPE; document inventory.inventory_documents%ROWTYPE;
        claim_id uuid; replay_id uuid; posted_time timestamptz;
BEGIN
    PERFORM "{SCHEMA}"."assert_context"(organization_id,actor_id,'compliance.destruction.manage',NULL::uuid);
    RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE=
      'destruction posting is unavailable until typed waste-disposal authority, atomic inventory write-off, and Section 17(5)(h) treatment are implemented';
    SELECT p_claim_id,p_replay_resource_id INTO claim_id,replay_id FROM "{SCHEMA}"."claim"(
      organization_id,actor_id,'compliance.destruction.post',key_hash,request_hash,expires_at);
    IF replay_id IS NOT NULL THEN RETURN replay_id; END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(organization_id::text||':destruction:'||destruction_id::text,8164102));
    SELECT * INTO destruction FROM compliance.destructions
     WHERE org_id=organization_id AND id=destruction_id FOR UPDATE;
    SELECT * INTO document FROM inventory.inventory_documents
     WHERE org_id=organization_id AND id=destruction.inventory_document_id FOR UPDATE;
    PERFORM "{SCHEMA}"."assert_context"(organization_id,actor_id,'inventory.document.post',document.branch_id);
    IF destruction.status<>'approved' OR document.status<>'approved'
       OR document.document_type<>'destruction' OR document.destruction_id IS DISTINCT FROM destruction.id THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='only the exact approved destruction snapshot may post';
    END IF;
    IF document.recall_id IS NOT NULL AND (
       NOT EXISTS (SELECT 1 FROM compliance.recalls recall
          WHERE recall.org_id=organization_id AND recall.id=document.recall_id
            AND recall.status IN ('initiated','in_progress')
            AND document.document_date>=recall.initiated_on)
       OR EXISTS (SELECT 1 FROM inventory.inventory_document_lines line
          LEFT JOIN compliance.recall_batches target ON target.org_id=line.org_id
            AND target.recall_id=document.recall_id AND target.batch_id=line.batch_id
         WHERE line.org_id=organization_id AND line.inventory_document_id=document.id
           AND target.batch_id IS NULL)) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='recall-tagged destruction requires active recall batch provenance';
    END IF;
    posted_time:=pg_catalog.transaction_timestamp();
    INSERT INTO "{SCHEMA}"."command_scopes" VALUES
      (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'destruction_posted',organization_id,destruction_id);
    UPDATE compliance.destructions SET status='posted',posted_at=posted_time,
      posted_by_membership_id=actor_id,updated_at=posted_time,updated_by_membership_id=actor_id,
      row_version=row_version+1 WHERE org_id=organization_id AND id=destruction_id AND status='approved';
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='destruction posting lost its lock'; END IF;
    PERFORM erp_trade_commands.post_locked_document(organization_id,document.id,actor_id);
    IF document.recall_id IS NOT NULL THEN
        PERFORM "{SCHEMA}"."refresh_recall_batches"(organization_id,document.recall_id);
    END IF;
    DELETE FROM "{SCHEMA}"."command_scopes" WHERE backend_pid=pg_catalog.pg_backend_pid()
      AND transaction_id=pg_catalog.txid_current() AND scope='destruction_posted'
      AND org_id=organization_id AND entity_id=destruction_id;
    PERFORM "{SCHEMA}"."finish_claim"(organization_id,claim_id,'compliance.destructions',destruction_id);
    RETURN destruction_id;
END
''',
            runtime=True,
        ),
    ]


def _storage_rule_definition() -> list[str]:
    return [
        *_function(
            '"guard_storage_rule"()', "trigger", f'''
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='reviewed storage rules are retained'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'active' OR NOT "{SCHEMA}"."scope_active"('storage_rule_manage',NEW.org_id,NEW.id) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='storage rule requires reviewed command provenance';
    END IF;
    RETURN NEW;
  END IF;
  IF ROW(NEW.org_id,NEW.id,NEW.subject_kind,NEW.product_id,NEW.location_id,NEW.minimum_celsius,
         NEW.maximum_celsius,NEW.minimum_humidity_percent,NEW.maximum_humidity_percent,
         NEW.effective_from,NEW.effective_to,NEW.evidence_attachment_id,NEW.reviewed_by_membership_id,
         NEW.reviewed_at,NEW.created_at,NEW.created_by_membership_id)
     IS DISTINCT FROM
     ROW(OLD.org_id,OLD.id,OLD.subject_kind,OLD.product_id,OLD.location_id,OLD.minimum_celsius,
         OLD.maximum_celsius,OLD.minimum_humidity_percent,OLD.maximum_humidity_percent,
         OLD.effective_from,OLD.effective_to,OLD.evidence_attachment_id,OLD.reviewed_by_membership_id,
         OLD.reviewed_at,OLD.created_at,OLD.created_by_membership_id)
     OR OLD.status<>'active' OR NEW.status<>'retired'
     OR NOT "{SCHEMA}"."scope_active"('storage_rule_manage',OLD.org_id,OLD.id) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='storage rule may only be retired by reviewed supersession';
  END IF;
  RETURN NEW;
END
'''),
        _trigger("storage_rule_versions_command_guard_ct", "INSERT OR UPDATE OR DELETE", "compliance.storage_rule_versions", "guard_storage_rule"),
        *_function(
            '"activate_storage_rule"(organization_id uuid, rule_id uuid, actor_id uuid, reviewed_by_membership_id uuid, subject_kind text, product_id uuid, location_id uuid, minimum_celsius numeric, maximum_celsius numeric, minimum_humidity_percent numeric, maximum_humidity_percent numeric, effective_from date, effective_to date, evidence_attachment_id uuid, reviewed_at timestamptz, key_hash bytea, request_hash bytea, expires_at timestamptz)',
            "uuid", f'''
DECLARE claim_id uuid; replay_id uuid; prior_id uuid;
BEGIN
  PERFORM "{SCHEMA}"."assert_context"(organization_id,actor_id,'compliance.license.manage',NULL::uuid);
  SELECT p_claim_id,p_replay_resource_id INTO claim_id,replay_id FROM "{SCHEMA}"."claim"(
    organization_id,actor_id,'compliance.storage_rule.activate',key_hash,request_hash,expires_at);
  IF replay_id IS NOT NULL THEN RETURN replay_id; END IF;
  IF actor_id=reviewed_by_membership_id OR reviewed_at>pg_catalog.transaction_timestamp()
     OR NOT EXISTS (SELECT 1 FROM core.memberships WHERE org_id=organization_id
          AND id=reviewed_by_membership_id AND status='active')
     OR NOT EXISTS (SELECT 1 FROM core.attachments WHERE org_id=organization_id
          AND id=evidence_attachment_id AND status IN ('verified','retained')) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='storage rule requires retained evidence and distinct active reviewer';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    organization_id::text||':'||subject_kind||':'||COALESCE(product_id,location_id)::text,8164201));
  SELECT rule_row.id INTO prior_id FROM compliance.storage_rule_versions AS rule_row
   WHERE rule_row.org_id=organization_id AND rule_row.status='active'
     AND rule_row.product_id IS NOT DISTINCT FROM product_id
     AND rule_row.location_id IS NOT DISTINCT FROM location_id
     AND rule_row.effective_from<=COALESCE(effective_to,'infinity'::date)
     AND effective_from<=COALESCE(rule_row.effective_to,'infinity'::date)
   ORDER BY rule_row.effective_from DESC LIMIT 1 FOR UPDATE;
  INSERT INTO "{SCHEMA}"."command_scopes" VALUES
    (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'storage_rule_manage',organization_id,rule_id);
  IF prior_id IS NOT NULL THEN
    INSERT INTO "{SCHEMA}"."command_scopes" VALUES
      (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'storage_rule_manage',organization_id,prior_id);
    UPDATE compliance.storage_rule_versions SET status='retired' WHERE org_id=organization_id AND id=prior_id;
  END IF;
  INSERT INTO compliance.storage_rule_versions(org_id,id,subject_kind,product_id,location_id,
    minimum_celsius,maximum_celsius,minimum_humidity_percent,maximum_humidity_percent,
    effective_from,effective_to,evidence_attachment_id,reviewed_by_membership_id,reviewed_at,
    status,created_by_membership_id)
  VALUES(organization_id,rule_id,subject_kind,product_id,location_id,minimum_celsius,maximum_celsius,
    minimum_humidity_percent,maximum_humidity_percent,effective_from,effective_to,evidence_attachment_id,
    reviewed_by_membership_id,reviewed_at,'active',actor_id);
  DELETE FROM "{SCHEMA}"."command_scopes" WHERE backend_pid=pg_catalog.pg_backend_pid()
    AND transaction_id=pg_catalog.txid_current() AND scope='storage_rule_manage' AND org_id=organization_id;
  PERFORM "{SCHEMA}"."finish_claim"(organization_id,claim_id,'compliance.storage_rule_versions',rule_id);
  RETURN rule_id;
END
''', runtime=True),
    ]


def _temperature_definition() -> list[str]:
    return [
        *_function(
            '"guard_temperature_reading"()',
            "trigger",
            f'''
BEGIN
    IF TG_OP<>'INSERT' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='temperature readings are append-only';
    END IF;
    IF NOT "{SCHEMA}"."scope_active"('temperature_ingest',NEW.org_id,NEW.id) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='temperature reading requires reviewed ingestion provenance';
    END IF;
    RETURN NEW;
END
''',
        ),
        _trigger("temperature_readings_command_guard_ct", "INSERT OR UPDATE OR DELETE", "compliance.temperature_readings", "guard_temperature_reading"),
        *_function(
            '"ingest_temperature_reading"(organization_id uuid, reading_id uuid, location_id uuid, batch_id uuid, actor_id uuid, sensor_id varchar, measured_at timestamptz, temperature_celsius numeric, humidity_percent numeric, provider_name varchar, provider_event_id varchar, payload_media_type varchar, payload_bytes bytea, expected_payload_sha256 bytea, key_hash bytea, request_hash bytea, expires_at timestamptz)',
            "uuid",
            f'''
DECLARE batch inventory.batches%ROWTYPE; product catalog.products%ROWTYPE;
        location inventory.locations%ROWTYPE; claim_id uuid; replay_id uuid;
        organization core.organizations%ROWTYPE;
        product_rule compliance.storage_rule_versions%ROWTYPE;
        location_rule compliance.storage_rule_versions%ROWTYPE;
        allowed_min numeric(9,4); allowed_max numeric(9,4); actual_hash bytea; excursion boolean;
BEGIN
    PERFORM "{SCHEMA}"."assert_context"(organization_id,actor_id,'internal.temperature.ingest',NULL::uuid);
    SELECT * INTO STRICT organization FROM core.organizations
     WHERE id=organization_id AND status='active' FOR SHARE;
    SELECT p_claim_id,p_replay_resource_id INTO claim_id,replay_id FROM "{SCHEMA}"."claim"(
      organization_id,actor_id,'compliance.temperature.ingest',key_hash,request_hash,expires_at);
    IF replay_id IS NOT NULL THEN RETURN replay_id; END IF;
    IF batch_id IS NULL OR provider_name IS NULL OR pg_catalog.btrim(provider_name)=''
       OR provider_event_id IS NULL OR pg_catalog.btrim(provider_event_id)=''
       OR payload_bytes IS NULL OR payload_media_type IS NULL OR pg_catalog.btrim(payload_media_type)=''
       OR pg_catalog.octet_length(expected_payload_sha256)<>32
       OR measured_at>pg_catalog.transaction_timestamp() THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='complete batch, provider, payload, hash, and nonfuture measurement evidence is required';
    END IF;
    SELECT * INTO batch FROM inventory.batches WHERE org_id=organization_id AND id=batch_id FOR UPDATE;
    SELECT * INTO product FROM catalog.products WHERE org_id=organization_id AND id=batch.product_id FOR SHARE;
    SELECT * INTO location FROM inventory.locations WHERE org_id=organization_id AND id=location_id FOR SHARE;
    IF batch.id IS NULL OR product.id IS NULL OR location.id IS NULL OR NOT product.cold_chain_required THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='batch product and location require cold-chain authority';
    END IF;
    SELECT * INTO STRICT product_rule FROM compliance.storage_rule_versions
     WHERE org_id=organization_id AND product_id=product.id AND subject_kind='product' AND status='active'
       AND (measured_at AT TIME ZONE organization.timezone)::date BETWEEN effective_from AND COALESCE(effective_to,'infinity'::date) FOR SHARE;
    SELECT * INTO STRICT location_rule FROM compliance.storage_rule_versions
     WHERE org_id=organization_id AND location_id=location.id AND subject_kind='location' AND status='active'
       AND (measured_at AT TIME ZONE organization.timezone)::date BETWEEN effective_from AND COALESCE(effective_to,'infinity'::date) FOR SHARE;
    allowed_min:=GREATEST(product_rule.minimum_celsius,location_rule.minimum_celsius);
    allowed_max:=LEAST(product_rule.maximum_celsius,location_rule.maximum_celsius);
    IF allowed_min>=allowed_max OR NOT EXISTS (
       SELECT 1 FROM inventory.stock_ledger_entries ledger
        WHERE ledger.org_id=organization_id AND ledger.location_id=location_id
          AND ledger.batch_id=batch_id AND ledger.posted_at<=measured_at
        GROUP BY ledger.org_id,ledger.location_id,ledger.batch_id
        HAVING sum(ledger.quantity_delta)>0) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='range authorities do not overlap or batch was not in location at measurement time';
    END IF;
    actual_hash:=extensions.digest(payload_bytes,'sha256');
    IF actual_hash IS DISTINCT FROM expected_payload_sha256 THEN
        RAISE EXCEPTION USING ERRCODE='22000', MESSAGE='temperature provider envelope hash mismatch';
    END IF;
    excursion:=temperature_celsius<allowed_min OR temperature_celsius>allowed_max;
    INSERT INTO "{SCHEMA}"."command_scopes" VALUES
      (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'temperature_ingest',organization_id,reading_id);
    IF (temperature_celsius<allowed_min OR temperature_celsius>allowed_max) AND batch.status='released' THEN
      INSERT INTO "{SCHEMA}"."command_scopes" VALUES
        (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'temperature_batch_block',organization_id,batch_id);
    END IF;
    INSERT INTO compliance.temperature_readings(
      org_id,id,location_id,batch_id,product_storage_rule_version_id,location_storage_rule_version_id,
      sensor_id,measured_at,temperature_celsius,humidity_percent,
      minimum_allowed_celsius,maximum_allowed_celsius,is_excursion,provider_name,provider_event_id,
      payload_media_type,payload_bytes,payload_sha256,created_by_membership_id)
    VALUES(organization_id,reading_id,location_id,batch_id,product_rule.id,location_rule.id,
      sensor_id,measured_at,temperature_celsius,
      humidity_percent,allowed_min,allowed_max,
      excursion,
      provider_name,provider_event_id,payload_media_type,payload_bytes,actual_hash,actor_id);
    IF (temperature_celsius<allowed_min OR temperature_celsius>allowed_max) AND batch.status='released' THEN
      UPDATE inventory.batches SET status='blocked',updated_at=pg_catalog.transaction_timestamp(),
        updated_by_membership_id=actor_id,row_version=row_version+1
       WHERE org_id=organization_id AND id=batch_id AND status='released';
      IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='batch release state changed during excursion block'; END IF;
      DELETE FROM "{SCHEMA}"."command_scopes" WHERE backend_pid=pg_catalog.pg_backend_pid()
       AND transaction_id=pg_catalog.txid_current() AND scope='temperature_batch_block'
       AND org_id=organization_id AND entity_id=batch_id;
    END IF;
    DELETE FROM "{SCHEMA}"."command_scopes" WHERE backend_pid=pg_catalog.pg_backend_pid()
      AND transaction_id=pg_catalog.txid_current() AND scope='temperature_ingest'
      AND org_id=organization_id AND entity_id=reading_id;
    PERFORM "{SCHEMA}"."finish_claim"(organization_id,claim_id,'compliance.temperature_readings',reading_id);
    RETURN reading_id;
END
''',
            runtime=True,
        ),
    ]


def _recall_definition() -> list[str]:
    return [
        *_function(
            '"guard_recall_batch"()',
            "trigger",
            f'''
DECLARE organization_id uuid; target_recall_id uuid;
BEGIN
    organization_id:=CASE WHEN TG_OP='DELETE' THEN OLD.org_id ELSE NEW.org_id END;
    target_recall_id:=CASE WHEN TG_OP='DELETE' THEN OLD.recall_id ELSE NEW.recall_id END;
    IF TG_OP='DELETE' OR NOT "{SCHEMA}"."scope_active"(
       'recall_batch_derive',organization_id,target_recall_id) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='recall batch exposure and action quantities are command-derived and retained';
    END IF;
    RETURN NEW;
END
''',
        ),
        _trigger(
            "recall_batches_command_guard_ct",
            "INSERT OR UPDATE OR DELETE",
            "compliance.recall_batches",
            "guard_recall_batch",
        ),
        *_function(
            '"refresh_recall_batches"(organization_id uuid, target_recall_id uuid)',
            "void",
            f'''
DECLARE target compliance.recall_batches%ROWTYPE; quarantine_total numeric(20,6);
        recovery_total numeric(20,6); destruction_total numeric(20,6);
        release_total numeric(20,6); first_time timestamptz; last_time timestamptz;
        derived_status text; bad_count bigint;
BEGIN
    PERFORM id FROM compliance.recalls
     WHERE org_id=organization_id AND id=target_recall_id FOR UPDATE;
    INSERT INTO "{SCHEMA}"."command_scopes" VALUES
      (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'recall_batch_derive',organization_id,target_recall_id);
    FOR target IN SELECT * FROM compliance.recall_batches
       WHERE org_id=organization_id AND recall_id=target_recall_id ORDER BY batch_id FOR UPDATE
    LOOP
        SELECT count(*) INTO bad_count
          FROM inventory.inventory_documents document
          JOIN inventory.inventory_document_lines line ON line.org_id=document.org_id
            AND line.inventory_document_id=document.id
         WHERE document.org_id=organization_id AND document.recall_id=target_recall_id
           AND document.status='posted' AND line.batch_id=target.batch_id
           AND ((document.document_type IN ('recall_quarantine','recall_release')
                 AND (line.movement_kind<>'transfer' OR
                   (SELECT count(*) FROM inventory.stock_ledger_entries ledger
                     WHERE ledger.org_id=line.org_id AND ledger.inventory_document_line_id=line.id
                       AND ledger.inventory_document_id=document.id
                       AND ((ledger.entry_kind='transfer_out' AND ledger.quantity_delta=-line.base_quantity)
                         OR (ledger.entry_kind='transfer_in' AND ledger.quantity_delta=line.base_quantity)))<>2))
             OR (document.document_type='recall_recovery'
                 AND (line.movement_kind<>'receipt' OR
                   (SELECT count(*) FROM inventory.stock_ledger_entries ledger
                     WHERE ledger.org_id=line.org_id AND ledger.inventory_document_line_id=line.id
                       AND ledger.inventory_document_id=document.id AND ledger.entry_kind='receipt'
                       AND ledger.quantity_delta=line.base_quantity)<>1))
             OR (document.document_type='destruction'
                 AND (line.movement_kind<>'issue' OR
                   (SELECT count(*) FROM inventory.stock_ledger_entries ledger
                     WHERE ledger.org_id=line.org_id AND ledger.inventory_document_line_id=line.id
                       AND ledger.inventory_document_id=document.id AND ledger.entry_kind='issue'
                       AND ledger.quantity_delta=-line.base_quantity)<>1))
             OR document.document_type NOT IN ('recall_quarantine','recall_recovery','recall_release','destruction'));
        IF bad_count<>0 THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='recall action document and immutable ledger set disagree';
        END IF;
        SELECT COALESCE(sum(line.base_quantity) FILTER (WHERE document.document_type='recall_quarantine'),0),
               COALESCE(sum(line.base_quantity) FILTER (WHERE document.document_type='recall_recovery'),0),
               COALESCE(sum(line.base_quantity) FILTER (WHERE document.document_type='destruction'),0),
               COALESCE(sum(line.base_quantity) FILTER (WHERE document.document_type='recall_release'),0),
               min(document.posted_at),max(document.posted_at)
          INTO quarantine_total,recovery_total,destruction_total,release_total,first_time,last_time
          FROM inventory.inventory_documents document
          JOIN inventory.inventory_document_lines line ON line.org_id=document.org_id
            AND line.inventory_document_id=document.id
         WHERE document.org_id=organization_id AND document.recall_id=target_recall_id
           AND document.status='posted' AND line.batch_id=target.batch_id;
        IF quarantine_total>target.affected_quantity
           OR recovery_total+destruction_total+release_total>target.affected_quantity THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='posted recall actions exceed immutable batch exposure';
        END IF;
        derived_status:=CASE
          WHEN recovery_total+destruction_total+release_total=target.affected_quantity
               AND destruction_total>0 THEN 'destroyed'
          WHEN recovery_total+destruction_total+release_total=target.affected_quantity
               AND release_total>0 THEN 'released'
          WHEN recovery_total+destruction_total+release_total=target.affected_quantity
               AND recovery_total>0 THEN 'recovered'
          WHEN quarantine_total>0 THEN 'quarantined'
          ELSE 'identified' END;
        UPDATE compliance.recall_batches SET quarantined_quantity=quarantine_total,
          recovered_quantity=recovery_total,destroyed_quantity=destruction_total,
          released_quantity=release_total,first_action_at=first_time,last_action_at=last_time,
          status=derived_status,updated_at=pg_catalog.transaction_timestamp(),
          updated_by_membership_id=erp_security.current_membership_id(),row_version=row_version+1
         WHERE org_id=organization_id AND recall_id=target_recall_id AND batch_id=target.batch_id;
    END LOOP;
    DELETE FROM "{SCHEMA}"."command_scopes" WHERE backend_pid=pg_catalog.pg_backend_pid()
      AND transaction_id=pg_catalog.txid_current() AND scope='recall_batch_derive'
      AND org_id=organization_id AND entity_id=target_recall_id;
END
''',
        ),
        *_function(
            '"add_recall_batch"(organization_id uuid, target_recall_id uuid, target_batch_id uuid, actor_id uuid, key_hash bytea, request_hash bytea, expires_at timestamptz)',
            "uuid",
            f'''
DECLARE recall compliance.recalls%ROWTYPE; batch inventory.batches%ROWTYPE;
        claim_id uuid; replay_id uuid; exposure numeric(20,6); snapshot_time timestamptz;
BEGIN
    PERFORM "{SCHEMA}"."assert_context"(
      organization_id,actor_id,'compliance.recall.manage',NULL::uuid);
    SELECT p_claim_id,p_replay_resource_id INTO claim_id,replay_id FROM "{SCHEMA}"."claim"(
      organization_id,actor_id,'compliance.recall.batch.add',key_hash,request_hash,expires_at);
    IF replay_id IS NOT NULL THEN RETURN replay_id; END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(organization_id::text||':recall:'||target_recall_id::text,8164201));
    SELECT * INTO recall FROM compliance.recalls
     WHERE org_id=organization_id AND id=target_recall_id FOR UPDATE;
    SELECT * INTO batch FROM inventory.batches
     WHERE org_id=organization_id AND id=target_batch_id FOR UPDATE;
    IF recall.id IS NULL OR recall.status NOT IN ('initiated','in_progress')
       OR batch.id IS NULL OR batch.product_id IS DISTINCT FROM recall.product_id
       OR EXISTS (SELECT 1 FROM compliance.recall_batches existing
          JOIN compliance.recalls other ON other.org_id=existing.org_id AND other.id=existing.recall_id
         WHERE existing.org_id=organization_id AND existing.batch_id=target_batch_id
           AND existing.recall_id<>target_recall_id AND other.status IN ('initiated','in_progress')) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='recall batch requires matching product and no concurrent active recall';
    END IF;
    snapshot_time:=pg_catalog.transaction_timestamp();
    SELECT COALESCE(sum(ledger.quantity_delta),0) INTO exposure
      FROM inventory.stock_ledger_entries ledger
     WHERE ledger.org_id=organization_id AND ledger.batch_id=target_batch_id
       AND ledger.posted_at<=snapshot_time;
    IF exposure<=0 THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='recall batch requires positive ledger-derived stock exposure';
    END IF;
    INSERT INTO "{SCHEMA}"."command_scopes" VALUES
      (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'recall_batch_derive',organization_id,target_recall_id);
    INSERT INTO compliance.recall_batches(org_id,recall_id,batch_id,affected_quantity,
      created_at,created_by_membership_id,updated_at,updated_by_membership_id)
    VALUES(organization_id,target_recall_id,target_batch_id,exposure,snapshot_time,actor_id,snapshot_time,actor_id);
    DELETE FROM "{SCHEMA}"."command_scopes" WHERE backend_pid=pg_catalog.pg_backend_pid()
      AND transaction_id=pg_catalog.txid_current() AND scope='recall_batch_derive'
      AND org_id=organization_id AND entity_id=target_recall_id;
    PERFORM "{SCHEMA}"."finish_claim"(
      organization_id,claim_id,'compliance.recalls',target_recall_id);
    RETURN target_recall_id;
END
''',
            runtime=True,
        ),
        *_function(
            '"post_recall_inventory_action"(organization_id uuid, document_id uuid, actor_id uuid, key_hash bytea, request_hash bytea, expires_at timestamptz)',
            "uuid",
            f'''
DECLARE document inventory.inventory_documents%ROWTYPE; recall compliance.recalls%ROWTYPE;
        claim_id uuid; replay_id uuid; bad_count bigint;
BEGIN
    PERFORM "{SCHEMA}"."assert_context"(
      organization_id,actor_id,'compliance.recall.execute',NULL::uuid);
    SELECT p_claim_id,p_replay_resource_id INTO claim_id,replay_id FROM "{SCHEMA}"."claim"(
      organization_id,actor_id,'compliance.recall.action.post',key_hash,request_hash,expires_at);
    IF replay_id IS NOT NULL THEN RETURN replay_id; END IF;
    SELECT * INTO document FROM inventory.inventory_documents
     WHERE org_id=organization_id AND id=document_id FOR UPDATE;
    IF document.id IS NULL OR document.status<>'approved'
       OR document.document_type NOT IN ('recall_quarantine','recall_recovery','recall_release')
       OR document.recall_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='approved typed recall inventory action is required';
    END IF;
    PERFORM "{SCHEMA}"."assert_context"(
      organization_id,actor_id,'inventory.document.post',document.branch_id);
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(organization_id::text||':recall:'||document.recall_id::text,8164201));
    SELECT * INTO recall FROM compliance.recalls
     WHERE org_id=organization_id AND id=document.recall_id FOR UPDATE;
    SELECT count(*) INTO bad_count FROM inventory.inventory_document_lines line
      LEFT JOIN compliance.recall_batches target ON target.org_id=line.org_id
        AND target.recall_id=document.recall_id AND target.batch_id=line.batch_id
      LEFT JOIN inventory.batches batch ON batch.org_id=line.org_id AND batch.id=line.batch_id
     WHERE line.org_id=organization_id AND line.inventory_document_id=document_id
       AND (target.batch_id IS NULL OR batch.product_id IS DISTINCT FROM recall.product_id);
    IF recall.status NOT IN ('initiated','in_progress') OR document.document_date<recall.initiated_on
       OR bad_count<>0 OR NOT EXISTS (SELECT 1 FROM inventory.inventory_document_lines line
          WHERE line.org_id=organization_id AND line.inventory_document_id=document_id) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='recall action lines require active recall batch provenance';
    END IF;
    PERFORM erp_trade_commands.post_locked_document(organization_id,document_id,actor_id);
    PERFORM "{SCHEMA}"."refresh_recall_batches"(organization_id,document.recall_id);
    PERFORM "{SCHEMA}"."finish_claim"(
      organization_id,claim_id,'inventory.inventory_documents',document_id);
    RETURN document_id;
END
''',
            runtime=True,
        ),
    ]


def _expense_definition() -> list[str]:
    return [
        *_function(
            '"guard_expense_claim"()',
            "trigger",
            f'''
BEGIN
    IF TG_OP='DELETE' THEN
        IF OLD.status<>'draft' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='non-draft expense claim is retained'; END IF;
        RETURN OLD;
    END IF;
    IF TG_OP='INSERT' AND NEW.status<>'draft' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='expense claim must start as draft';
    END IF;
    IF TG_OP='UPDATE' AND OLD.status IN ('posted','reversed') AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='posted expense claim is immutable';
    END IF;
    IF TG_OP='UPDATE' AND OLD.status<>'draft' AND ROW(
       NEW.claim_number,NEW.claimant_membership_id,NEW.claim_date,NEW.period_start,NEW.period_end,
       NEW.currency_code,NEW.claimed_amount,NEW.purpose,NEW.submitted_at
    ) IS DISTINCT FROM ROW(
       OLD.claim_number,OLD.claimant_membership_id,OLD.claim_date,OLD.period_start,OLD.period_end,
       OLD.currency_code,OLD.claimed_amount,OLD.purpose,OLD.submitted_at
    ) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='submitted expense claim facts are frozen';
    END IF;
    IF TG_OP='UPDATE' AND OLD.status='submitted'
       AND NOT "{SCHEMA}"."scope_active"('expense_approved',NEW.org_id,NEW.id)
       AND ROW(NEW.approved_amount,NEW.approved_at,NEW.approved_by_membership_id)
           IS DISTINCT FROM ROW(OLD.approved_amount,OLD.approved_at,OLD.approved_by_membership_id) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='expense approval facts require reviewed command provenance';
    END IF;
    IF TG_OP='UPDATE' AND NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status IN ('submitted','approved','posted')
       AND NOT "{SCHEMA}"."scope_active"('expense_'||NEW.status,NEW.org_id,NEW.id) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='expense lifecycle requires reviewed command provenance';
    END IF;
    RETURN NEW;
END
''',
        ),
        _trigger("expense_claims_command_guard_ct", "INSERT OR UPDATE OR DELETE", "finance.expense_claims", "guard_expense_claim"),
        *_function(
            '"submit_expense_claim"(organization_id uuid, expense_claim_id uuid, actor_id uuid, key_hash bytea, request_hash bytea, expires_at timestamptz)',
            "uuid",
            f'''
DECLARE claim finance.expense_claims%ROWTYPE; claim_id uuid; replay_id uuid;
        line_count bigint; line_total numeric(20,2); submitted_time timestamptz;
BEGIN
    PERFORM "{SCHEMA}"."assert_context"(organization_id,actor_id,'finance.expense.manage',NULL::uuid);
    SELECT p_claim_id,p_replay_resource_id INTO claim_id,replay_id FROM "{SCHEMA}"."claim"(
      organization_id,actor_id,'finance.expense.submit',key_hash,request_hash,expires_at);
    IF replay_id IS NOT NULL THEN RETURN replay_id; END IF;
    SELECT * INTO claim FROM finance.expense_claims
     WHERE org_id=organization_id AND id=expense_claim_id FOR UPDATE;
    IF NOT FOUND OR claim.status<>'draft' OR claim.claimant_membership_id<>actor_id
       OR NOT EXISTS (SELECT 1 FROM core.memberships membership WHERE membership.org_id=organization_id
                       AND membership.id=claim.claimant_membership_id AND membership.status='active') THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='only the active claimant may submit a draft claim';
    END IF;
    SELECT count(*),COALESCE(sum(line.claimed_amount),0) INTO line_count,line_total
      FROM finance.expense_claim_lines line
      JOIN finance.accounts account ON account.org_id=line.org_id AND account.id=line.expense_account_id
     WHERE line.org_id=organization_id AND line.expense_claim_id=expense_claim_id
       AND line.expense_date BETWEEN claim.period_start AND claim.period_end
       AND account.status='active' AND account.account_type='expense'
       AND account.currency_code=claim.currency_code
       AND line.receipt_attachment_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM core.attachments attachment WHERE attachment.org_id=line.org_id
            AND attachment.id=line.receipt_attachment_id AND attachment.status IN ('verified','retained'));
    IF line_count=0 OR line_count<>(SELECT count(*) FROM finance.expense_claim_lines line
       WHERE line.org_id=organization_id AND line.expense_claim_id=expense_claim_id)
       OR line_total IS DISTINCT FROM claim.claimed_amount THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='claim lines, dates, active expense accounts, evidence, or total are invalid';
    END IF;
    submitted_time:=pg_catalog.transaction_timestamp();
    INSERT INTO "{SCHEMA}"."command_scopes" VALUES
      (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'expense_submitted',organization_id,expense_claim_id);
    UPDATE finance.expense_claims SET status='submitted',submitted_at=submitted_time,
      updated_at=submitted_time,updated_by_membership_id=actor_id,row_version=row_version+1
     WHERE org_id=organization_id AND id=expense_claim_id AND status='draft';
    DELETE FROM "{SCHEMA}"."command_scopes" WHERE backend_pid=pg_catalog.pg_backend_pid()
      AND transaction_id=pg_catalog.txid_current() AND scope='expense_submitted'
      AND org_id=organization_id AND entity_id=expense_claim_id;
    PERFORM "{SCHEMA}"."finish_claim"(organization_id,claim_id,'finance.expense_claims',expense_claim_id);
    RETURN expense_claim_id;
END
''',
            runtime=True,
        ),
        *_function(
            '"approve_expense_claim"(organization_id uuid, expense_claim_id uuid, actor_id uuid, decisions jsonb, key_hash bytea, request_hash bytea, expires_at timestamptz)',
            "uuid",
            f'''
DECLARE claim finance.expense_claims%ROWTYPE; claim_id uuid; replay_id uuid; item jsonb;
        line_id uuid; amount numeric; seen uuid[]:=ARRAY[]::uuid[]; updated_count bigint:=0;
        expected_count bigint; valid_count bigint; claimed_total numeric(20,2);
        approved_total numeric(20,2); approved_time timestamptz;
BEGIN
    PERFORM "{SCHEMA}"."assert_context"(organization_id,actor_id,'finance.expense.manage',NULL::uuid);
    SELECT p_claim_id,p_replay_resource_id INTO claim_id,replay_id FROM "{SCHEMA}"."claim"(
      organization_id,actor_id,'finance.expense.approve',key_hash,request_hash,expires_at);
    IF replay_id IS NOT NULL THEN RETURN replay_id; END IF;
    SELECT * INTO claim FROM finance.expense_claims
     WHERE org_id=organization_id AND id=expense_claim_id FOR UPDATE;
    IF NOT FOUND OR claim.status<>'submitted' OR claim.claimant_membership_id=actor_id
       OR pg_catalog.jsonb_typeof(decisions)<>'array' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='submitted claim, distinct approver, and decision array are required';
    END IF;
    SELECT count(*) INTO expected_count FROM finance.expense_claim_lines line
     WHERE line.org_id=organization_id AND line.expense_claim_id=expense_claim_id;
    SELECT count(*),COALESCE(sum(line.claimed_amount),0) INTO valid_count,claimed_total
      FROM finance.expense_claim_lines line
      JOIN finance.accounts account ON account.org_id=line.org_id AND account.id=line.expense_account_id
     WHERE line.org_id=organization_id AND line.expense_claim_id=expense_claim_id
       AND line.expense_date BETWEEN claim.period_start AND claim.period_end
       AND account.status='active' AND account.account_type='expense'
       AND account.currency_code=claim.currency_code
       AND line.receipt_attachment_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM core.attachments attachment WHERE attachment.org_id=line.org_id
            AND attachment.id=line.receipt_attachment_id AND attachment.status IN ('verified','retained'));
    IF expected_count=0 OR valid_count<>expected_count OR claimed_total IS DISTINCT FROM claim.claimed_amount THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='approval requires unchanged line sums and active expense accounts';
    END IF;
    INSERT INTO "{SCHEMA}"."command_scopes" VALUES
      (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'expense_approved',organization_id,expense_claim_id);
    FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(decisions) LOOP
        IF pg_catalog.jsonb_typeof(item)<>'object' OR (SELECT count(*) FROM pg_catalog.jsonb_object_keys(item))<>2
           OR NOT (item ? 'line_id' AND item ? 'approved_amount') THEN
            RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='expense decision shape is invalid';
        END IF;
        line_id:=(item->>'line_id')::uuid; amount:=(item->>'approved_amount')::numeric;
        IF line_id=ANY(seen) OR amount<0 OR amount<>pg_catalog.round(amount,2) THEN
            RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='duplicate line or invalid approved amount';
        END IF;
        seen:=pg_catalog.array_append(seen,line_id);
        UPDATE finance.expense_claim_lines line SET approved_amount=amount
         WHERE line.org_id=organization_id AND line.id=line_id
           AND line.expense_claim_id=expense_claim_id AND line.claimed_amount>=amount;
        IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='expense decision does not match a claim line'; END IF;
        updated_count:=updated_count+1;
    END LOOP;
    SELECT COALESCE(sum(line.approved_amount),0) INTO approved_total
      FROM finance.expense_claim_lines line
     WHERE line.org_id=organization_id AND line.expense_claim_id=expense_claim_id;
    IF updated_count<>expected_count OR approved_total>claim.claimed_amount THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='approval decisions must cover every line exactly once';
    END IF;
    approved_time:=pg_catalog.transaction_timestamp();
    UPDATE finance.expense_claims SET status='approved',approved_amount=approved_total,
      approved_at=approved_time,approved_by_membership_id=actor_id,updated_at=approved_time,
      updated_by_membership_id=actor_id,row_version=row_version+1
     WHERE org_id=organization_id AND id=expense_claim_id AND status='submitted';
    DELETE FROM "{SCHEMA}"."command_scopes" WHERE backend_pid=pg_catalog.pg_backend_pid()
      AND transaction_id=pg_catalog.txid_current() AND scope='expense_approved'
      AND org_id=organization_id AND entity_id=expense_claim_id;
    PERFORM "{SCHEMA}"."finish_claim"(organization_id,claim_id,'finance.expense_claims',expense_claim_id);
    RETURN expense_claim_id;
END
''',
            runtime=True,
        ),
        *_function(
            '"post_expense_claim"(organization_id uuid, expense_claim_id uuid, journal_entry_id uuid, accounting_event_id uuid, actor_id uuid, key_hash bytea, request_hash bytea, expires_at timestamptz)',
            "uuid",
            f'''
DECLARE claim finance.expense_claims%ROWTYPE; journal finance.journal_entries%ROWTYPE;
        claim_id uuid; replay_id uuid; posted_time timestamptz;
BEGIN
    PERFORM "{SCHEMA}"."assert_context"(organization_id,actor_id,'finance.expense.manage',NULL::uuid);
    PERFORM "{SCHEMA}"."assert_context"(organization_id,actor_id,'finance.journal.post',NULL::uuid);
    SELECT p_claim_id,p_replay_resource_id INTO claim_id,replay_id FROM "{SCHEMA}"."claim"(
      organization_id,actor_id,'finance.expense.post',key_hash,request_hash,expires_at);
    IF replay_id IS NOT NULL THEN RETURN replay_id; END IF;
    SELECT * INTO claim FROM finance.expense_claims
     WHERE org_id=organization_id AND id=expense_claim_id FOR UPDATE;
    SELECT * INTO journal FROM finance.journal_entries
     WHERE org_id=organization_id AND id=journal_entry_id FOR UPDATE;
    IF claim.status<>'approved' OR claim.approved_amount IS NULL OR claim.approved_amount<=0
       OR journal.status<>'draft' OR journal.reversal_of_journal_entry_id IS NOT NULL
       OR journal.transaction_currency<>claim.currency_code
       OR journal.transaction_debit_total<>claim.approved_amount
       OR journal.transaction_credit_total<>claim.approved_amount THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='approved claim and exact balanced draft journal are required';
    END IF;
    IF EXISTS (SELECT 1 FROM finance.expense_claim_lines line
       LEFT JOIN core.attachments attachment ON attachment.org_id=line.org_id
         AND attachment.id=line.receipt_attachment_id
      WHERE line.org_id=organization_id AND line.expense_claim_id=expense_claim_id
        AND (line.receipt_attachment_id IS NULL OR attachment.status NOT IN ('verified','retained'))) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='expense evidence must remain verified through posting';
    END IF;
    IF EXISTS (
      WITH expected AS (
        SELECT line.expense_account_id account_id,sum(line.approved_amount) amount
          FROM finance.expense_claim_lines line
         WHERE line.org_id=organization_id AND line.expense_claim_id=expense_claim_id
         GROUP BY line.expense_account_id
      ), actual AS (
        SELECT journal_line.account_id,sum(journal_line.transaction_debit) amount
          FROM finance.journal_lines journal_line
          JOIN finance.accounts account ON account.org_id=journal_line.org_id AND account.id=journal_line.account_id
         WHERE journal_line.org_id=organization_id AND journal_line.journal_entry_id=journal_entry_id
           AND account.account_type='expense' AND account.status='active'
           AND account.currency_code=claim.currency_code
         GROUP BY journal_line.account_id
      )
      SELECT 1 FROM expected FULL JOIN actual USING(account_id)
       WHERE expected.amount IS DISTINCT FROM actual.amount
    ) OR EXISTS (
      SELECT 1 FROM finance.journal_lines journal_line
      JOIN finance.accounts account ON account.org_id=journal_line.org_id AND account.id=journal_line.account_id
      WHERE journal_line.org_id=organization_id AND journal_line.journal_entry_id=journal_entry_id
        AND (account.status<>'active' OR account.currency_code<>claim.currency_code
          OR (journal_line.transaction_debit>0 AND account.account_type<>'expense')
          OR (journal_line.transaction_credit>0 AND account.account_type NOT IN ('asset','liability')))
    ) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='journal does not exactly map approved lines to active expense accounts';
    END IF;
    posted_time:=pg_catalog.transaction_timestamp();
    UPDATE finance.journal_entries SET status='posted',posted_at=posted_time,
      posted_by_membership_id=actor_id,updated_at=posted_time,updated_by_membership_id=actor_id,
      row_version=row_version+1 WHERE org_id=organization_id AND id=journal_entry_id AND status='draft';
    INSERT INTO "{SCHEMA}"."command_scopes" VALUES
      (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'expense_posted',organization_id,expense_claim_id);
    UPDATE finance.expense_claims SET status='posted',posted_at=posted_time,
      posted_by_membership_id=actor_id,updated_at=posted_time,updated_by_membership_id=actor_id,
      row_version=row_version+1 WHERE org_id=organization_id AND id=expense_claim_id AND status='approved';
    INSERT INTO finance.accounting_events(org_id,id,event_type,expense_claim_id,journal_entry_id,
      occurred_at,source_posted_at,created_by_membership_id)
    VALUES(organization_id,accounting_event_id,'expense_claim',expense_claim_id,journal_entry_id,
      posted_time,posted_time,actor_id);
    DELETE FROM "{SCHEMA}"."command_scopes" WHERE backend_pid=pg_catalog.pg_backend_pid()
      AND transaction_id=pg_catalog.txid_current() AND scope='expense_posted'
      AND org_id=organization_id AND entity_id=expense_claim_id;
    PERFORM "{SCHEMA}"."finish_claim"(organization_id,claim_id,'finance.expense_claims',expense_claim_id);
    RETURN expense_claim_id;
END
''',
            runtime=True,
        ),
    ]


def _expense_line_definition() -> list[str]:
    return [
        *_function(
            '"guard_expense_line"()',
            "trigger",
            f'''
DECLARE parent_status text; organization_id uuid; claim_id uuid;
BEGIN
    organization_id:=CASE WHEN TG_OP='DELETE' THEN OLD.org_id ELSE NEW.org_id END;
    claim_id:=CASE WHEN TG_OP='DELETE' THEN OLD.expense_claim_id ELSE NEW.expense_claim_id END;
    SELECT status INTO parent_status FROM finance.expense_claims
     WHERE org_id=organization_id AND id=claim_id FOR UPDATE;
    IF parent_status IS DISTINCT FROM 'draft'
       AND NOT (parent_status='submitted' AND TG_OP='UPDATE'
                AND "{SCHEMA}"."scope_active"('expense_approved',organization_id,claim_id)
                AND pg_catalog.to_jsonb(NEW)-'approved_amount'
                    IS NOT DISTINCT FROM pg_catalog.to_jsonb(OLD)-'approved_amount') THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='expense lines are frozen outside draft or reviewed approval';
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END
''',
        ),
        _trigger(
            "expense_claim_lines_command_guard_ct",
            "INSERT OR UPDATE OR DELETE",
            "finance.expense_claim_lines",
            "guard_expense_line",
        ),
    ]


def _withholding_basis_definition() -> list[str]:
    return [
        *_function(
            '"guard_withholding_basis_line"()', "trigger", f'''
BEGIN
  IF TG_OP<>'INSERT' OR NOT (
    (NEW.withholding_id IS NOT NULL AND "{SCHEMA}"."scope_active"('withholding_post',NEW.org_id,NEW.withholding_id))
    OR (NEW.withholding_id IS NULL AND "{SCHEMA}"."scope_active"('withholding_evaluation',NEW.org_id,NEW.id))
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='withholding basis is immutable and command-owned';
  END IF;
  RETURN NEW;
END
'''),
        _trigger("withholding_basis_lines_command_guard_ct", "INSERT OR UPDATE OR DELETE",
                 "tax.withholding_basis_lines", "guard_withholding_basis_line"),
    ]


def _withholding_definition() -> list[str]:
    return [
        *_function(
            '"assert_advance_withholding_reversible"(organization_id uuid, advance_allocation_id uuid)',
            "void", f'''
DECLARE basis tax.withholding_basis_lines%ROWTYPE;
BEGIN
 SELECT * INTO basis FROM tax.withholding_basis_lines
  WHERE org_id=organization_id AND purchase_order_advance_allocation_id=advance_allocation_id FOR SHARE;
 IF basis.id IS NULL THEN RETURN; END IF;
 IF EXISTS(
   SELECT 1 FROM tax.withholding_basis_lines later
    LEFT JOIN tax.withholdings withholding ON withholding.org_id=later.org_id AND withholding.id=later.withholding_id
   WHERE later.org_id=organization_id AND later.counterparty_party_id=basis.counterparty_party_id
     AND later.rule_version_id=basis.rule_version_id AND later.fiscal_year_start_year=basis.fiscal_year_start_year
     AND (later.source_event_date,later.id)>(basis.source_event_date,basis.id)
     AND (basis.contract_reference IS NULL OR later.contract_reference=basis.contract_reference)
     AND (withholding.id IS NULL OR (withholding.status='deducted' AND NOT EXISTS(
       SELECT 1 FROM tax.withholdings reversal WHERE reversal.org_id=withholding.org_id
        AND reversal.reversal_of_withholding_id=withholding.id)))
     AND (later.purchase_order_advance_allocation_id IS NULL OR NOT EXISTS(
       SELECT 1 FROM procurement.purchase_order_advance_allocations advance_reversal
        WHERE advance_reversal.org_id=later.org_id
          AND advance_reversal.reversal_of_allocation_id=later.purchase_order_advance_allocation_id))
 ) THEN
   RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='reverse later statutory basis observations before this vendor advance';
 END IF;
END
'''),
        *_function(
            '"assert_no_advance_withholding_required"(organization_id uuid, advance_allocation_id uuid)',
            "void", f'''
DECLARE advance procurement.purchase_order_advance_allocations%ROWTYPE; line procurement.purchase_order_lines%ROWTYPE;
 purchase_order procurement.purchase_orders%ROWTYPE; supplier parties.supplier_accounts%ROWTYPE; party parties.parties%ROWTYPE;
 fact tax.organization_fiscal_tax_facts%ROWTYPE; rule tax.withholding_rule_versions%ROWTYPE;
 fiscal_year smallint; candidate_count integer; cumulative numeric(20,2); deduction_basis numeric(20,2);
BEGIN
 SELECT * INTO STRICT advance FROM procurement.purchase_order_advance_allocations
  WHERE org_id=organization_id AND id=advance_allocation_id FOR UPDATE;
 SELECT * INTO STRICT line FROM procurement.purchase_order_lines
  WHERE org_id=organization_id AND id=advance.purchase_order_line_id FOR SHARE;
 IF line.withholding_nature_code IS NULL THEN RETURN; END IF;
 SELECT * INTO STRICT purchase_order FROM procurement.purchase_orders
  WHERE org_id=organization_id AND id=line.purchase_order_id FOR SHARE;
 SELECT * INTO STRICT supplier FROM parties.supplier_accounts
  WHERE org_id=organization_id AND id=purchase_order.supplier_account_id FOR SHARE;
 SELECT * INTO STRICT party FROM parties.parties WHERE org_id=organization_id AND id=supplier.party_id FOR SHARE;
 fiscal_year:=CASE WHEN extract(month FROM advance.allocation_date)>=4 THEN extract(year FROM advance.allocation_date)::smallint
                   ELSE (extract(year FROM advance.allocation_date)-1)::smallint END;
 SELECT * INTO fact FROM tax.organization_fiscal_tax_facts
  WHERE org_id=organization_id AND fiscal_year_start_year=fiscal_year AND status='active' FOR SHARE;
 IF party.status<>'active' OR party.tax_profile_verified_at IS NULL OR fact.id IS NULL THEN
  RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='classified advance requires verified party and organization fiscal facts'; END IF;
 IF line.withholding_nature_code='purchase_of_goods'
    AND party.tax_residency_status='resident' AND party.pan_verification_status='verified'
    AND party.pan IS NOT NULL AND fact.prior_fiscal_year_turnover<=100000000
    AND fact.gst_tds_notified_deductor=false THEN
   RETURN;
 END IF;
 SELECT count(*),min(candidate.id) INTO candidate_count,rule.id FROM tax.withholding_rule_versions candidate
  WHERE candidate.status='active' AND candidate.source_kind='supplier_invoice'
    AND candidate.nature_code=line.withholding_nature_code AND candidate.deduction_trigger='earlier_credit_or_payment'
    AND advance.allocation_date BETWEEN candidate.effective_from AND coalesce(candidate.effective_to,'infinity'::date)
    AND fiscal_year BETWEEN candidate.fiscal_year_start_from AND coalesce(candidate.fiscal_year_start_to,9999)
    AND candidate.deductee_residency IN ('any',party.tax_residency_status)
    AND candidate.deductee_person_type IN ('any',party.tax_person_type)
    AND candidate.deductee_pan_status IN ('any',party.pan_verification_status)
    AND candidate.deductor_person_type IN ('any',fact.organization_person_type)
    AND (candidate.tax_regime<>'gst_tds' OR fact.gst_tds_notified_deductor)
    AND (candidate.organization_prior_fy_turnover_threshold IS NULL
         OR fact.prior_fiscal_year_turnover>candidate.organization_prior_fy_turnover_threshold);
 IF candidate_count<>1 THEN
  RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='classified advance requires exactly one imported earlier-event rule'; END IF;
 SELECT * INTO rule FROM tax.withholding_rule_versions WHERE id=rule.id FOR SHARE;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  organization_id::text||party.id::text||rule.id::text||fiscal_year::text||
  CASE WHEN rule.aggregation_scope='contract' THEN purchase_order.purchase_order_number ELSE '' END,679401));
 SELECT coalesce(sum(basis.eligible_basis_amount),0) INTO cumulative
  FROM tax.withholding_basis_lines basis LEFT JOIN tax.withholdings withholding
    ON withholding.org_id=basis.org_id AND withholding.id=basis.withholding_id
 WHERE basis.org_id=organization_id AND basis.counterparty_party_id=party.id AND basis.rule_version_id=rule.id
   AND basis.fiscal_year_start_year=fiscal_year
   AND (withholding.id IS NULL OR (withholding.status='deducted'
     AND NOT EXISTS(SELECT 1 FROM tax.withholdings reversal WHERE reversal.org_id=withholding.org_id
                    AND reversal.reversal_of_withholding_id=withholding.id)))
   AND (basis.purchase_order_advance_allocation_id IS NULL OR NOT EXISTS(
     SELECT 1 FROM procurement.purchase_order_advance_allocations reversal
      WHERE reversal.org_id=basis.org_id
        AND reversal.reversal_of_allocation_id=basis.purchase_order_advance_allocation_id))
   AND (rule.aggregation_scope<>'contract' OR basis.contract_reference=purchase_order.purchase_order_number);
 deduction_basis:=CASE rule.threshold_application
  WHEN 'excess_only' THEN greatest(cumulative+advance.gross_advance_amount-rule.transaction_threshold,0)
                         -greatest(cumulative-rule.transaction_threshold,0)
  ELSE CASE WHEN cumulative+advance.gross_advance_amount>rule.transaction_threshold
            THEN advance.gross_advance_amount ELSE 0 END END;
 IF deduction_basis>0 THEN
  RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='classified gross advance crosses imported withholding threshold and must deduct atomically'; END IF;
 INSERT INTO "{SCHEMA}"."command_scopes" VALUES
   (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'withholding_evaluation',organization_id,advance.id);
 INSERT INTO tax.withholding_basis_lines(org_id,id,withholding_id,rule_version_id,
   purchase_order_advance_allocation_id,counterparty_party_id,fiscal_year_start_year,nature_code,
   contract_reference,source_event_date,source_gross_amount,excluded_gst_cess_amount,eligible_basis_amount)
 VALUES(organization_id,advance.id,NULL,rule.id,advance.id,party.id,fiscal_year,line.withholding_nature_code,
   purchase_order.purchase_order_number,advance.allocation_date,advance.gross_advance_amount,0,advance.gross_advance_amount);
 DELETE FROM "{SCHEMA}"."command_scopes" WHERE backend_pid=pg_catalog.pg_backend_pid()
   AND transaction_id=pg_catalog.txid_current() AND scope='withholding_evaluation'
   AND org_id=organization_id AND entity_id=advance.id;
END
'''),
        *_function(
            '"guard_withholding"()', "trigger", f'''
BEGIN
  IF TG_OP<>'INSERT' OR NOT "{SCHEMA}"."scope_active"('withholding_post',NEW.org_id,NEW.id) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='withholding deductions and reversals are immutable command facts';
  END IF;
  RETURN NEW;
END
'''),
        _trigger("withholdings_command_guard_ct", "INSERT OR UPDATE OR DELETE",
                 "tax.withholdings", "guard_withholding"),
        *_function(
            '"post_withholding"(organization_id uuid, withholding_id uuid, actor_id uuid, target_open_item_id uuid, target_advance_allocation_id uuid, journal_id uuid, event_id uuid, settlement_allocation_id uuid, basis_rows jsonb, key_hash bytea, request_hash bytea, expires_at timestamptz)',
            "uuid", f'''
DECLARE claim_id uuid; replay_id uuid; item jsonb; row_count integer; source_kind text;
        source_party uuid; source_date date; source_nature varchar; source_contract varchar; aggregate_contract varchar;
        gross numeric(20,2); excluded numeric(20,2); prior_advance numeric(20,2); total_basis numeric(20,2):=0;
        fiscal_year smallint; rule tax.withholding_rule_versions%ROWTYPE;
        party parties.parties%ROWTYPE; org_fact tax.organization_fiscal_tax_facts%ROWTYPE;
        open_item finance.open_items%ROWTYPE; advance procurement.purchase_order_advance_allocations%ROWTYPE;
        payment finance.payments%ROWTYPE; registration tax.registrations%ROWTYPE;
        cumulative numeric(20,2); deduction_basis numeric(20,2); withheld numeric(20,2);
        income_amount numeric(20,2); cgst_amount numeric(20,2); sgst_amount numeric(20,2); igst_amount numeric(20,2);
        deductor_id varchar; deductee_kind text; deductee_id varchar; due_date date; journal finance.journal_entries%ROWTYPE;
        source_branch uuid; debit_account uuid; credit_account uuid; journal_line_count integer;
BEGIN
  PERFORM "{SCHEMA}"."assert_context"(organization_id,actor_id,'tax.withholding.manage',NULL::uuid);
  PERFORM "{SCHEMA}"."assert_context"(organization_id,actor_id,'finance.journal.post',NULL::uuid);
  SELECT p_claim_id,p_replay_resource_id INTO claim_id,replay_id FROM "{SCHEMA}"."claim"(
    organization_id,actor_id,'tax.withholding.post',key_hash,request_hash,expires_at);
  IF replay_id IS NOT NULL THEN RETURN replay_id; END IF;
  IF pg_catalog.jsonb_typeof(basis_rows)<>'array' OR pg_catalog.jsonb_array_length(basis_rows)=0
     OR pg_catalog.num_nonnulls(target_open_item_id,target_advance_allocation_id)<>1 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='one typed commercial source and nonempty basis rows are required';
  END IF;
  IF target_open_item_id IS NOT NULL THEN
    SELECT * INTO open_item FROM finance.open_items WHERE org_id=organization_id AND id=target_open_item_id FOR UPDATE;
    IF open_item.id IS NULL OR open_item.item_side<>'payable' OR open_item.status<>'open' OR open_item.currency_code<>'INR' THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='credit deduction requires live INR payable';
    END IF;
    source_party:=open_item.party_id; source_date:=open_item.document_date; source_kind:=NULL;
  ELSE
    SELECT * INTO advance FROM procurement.purchase_order_advance_allocations
     WHERE org_id=organization_id AND id=target_advance_allocation_id FOR UPDATE;
    SELECT * INTO payment FROM finance.payments WHERE org_id=organization_id AND id=advance.payment_id FOR SHARE;
    IF advance.id IS NULL OR advance.status<>'posted' OR advance.withholding_id IS DISTINCT FROM withholding_id
       OR payment.status<>'posted' OR payment.direction<>'disbursement' THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='payment deduction requires the exact posted supplier advance';
    END IF;
    SELECT supplier.party_id INTO source_party FROM parties.supplier_accounts supplier
     WHERE supplier.org_id=organization_id AND supplier.id=advance.supplier_account_id FOR SHARE;
    source_date:=advance.allocation_date; source_kind:='supplier_invoice'; source_branch:=advance.branch_id;
  END IF;
  SELECT * INTO party FROM parties.parties WHERE org_id=organization_id AND id=source_party FOR SHARE;
  fiscal_year:=CASE WHEN extract(month FROM source_date)>=4 THEN extract(year FROM source_date)::smallint
                    ELSE (extract(year FROM source_date)-1)::smallint END;
  SELECT * INTO org_fact FROM tax.organization_fiscal_tax_facts
   WHERE org_id=organization_id AND fiscal_year_start_year=fiscal_year AND status='active' FOR SHARE;
  IF party.status<>'active' OR party.tax_profile_verified_at IS NULL OR org_fact.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='verified party and organization fiscal facts are required';
  END IF;
  FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(basis_rows) LOOP
    prior_advance:=0;
    IF target_advance_allocation_id IS NOT NULL THEN
      IF (item->>'purchase_order_advance_allocation_id')::uuid IS DISTINCT FROM advance.id THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='advance basis must name exact allocation';
      END IF;
      SELECT line.withholding_nature_code,purchase_order.purchase_order_number,
             advance.gross_advance_amount,0::numeric
        INTO source_nature,source_contract,gross,excluded
        FROM procurement.purchase_order_lines line JOIN procurement.purchase_orders purchase_order
          ON purchase_order.org_id=line.org_id AND purchase_order.id=line.purchase_order_id
       WHERE line.org_id=organization_id AND line.id=advance.purchase_order_line_id
         AND line.line_kind='product' FOR SHARE OF line,purchase_order;
    ELSIF item ? 'supplier_invoice_line_id' THEN
      source_kind:='supplier_invoice';
      SELECT line.withholding_nature_code,line.withholding_contract_reference,
             line.net_value_amount+line.cgst_amount+line.sgst_amount+line.igst_amount+line.cess_amount,
             line.cgst_amount+line.sgst_amount+line.igst_amount+line.cess_amount,invoice.branch_id
        INTO source_nature,source_contract,gross,excluded,source_branch
        FROM procurement.supplier_invoice_lines line JOIN procurement.supplier_invoices invoice
          ON invoice.org_id=line.org_id AND invoice.id=line.supplier_invoice_id
       WHERE line.org_id=organization_id AND line.id=(item->>'supplier_invoice_line_id')::uuid
         AND invoice.status='posted' FOR SHARE OF line,invoice;
      SELECT coalesce(sum(prior_basis.eligible_basis_amount),0) INTO prior_advance
       FROM procurement.supplier_invoice_lines invoice_line
        JOIN procurement.purchase_order_advance_allocations pa ON pa.org_id=invoice_line.org_id
          AND pa.purchase_order_line_id=invoice_line.purchase_order_line_id AND pa.status='posted'
        JOIN tax.withholding_basis_lines prior_basis ON prior_basis.org_id=pa.org_id
          AND prior_basis.purchase_order_advance_allocation_id=pa.id
        WHERE invoice_line.org_id=organization_id AND invoice_line.id=(item->>'supplier_invoice_line_id')::uuid
          AND NOT EXISTS(SELECT 1 FROM procurement.purchase_order_advance_allocations reversal
            WHERE reversal.org_id=pa.org_id AND reversal.reversal_of_allocation_id=pa.id);
    ELSE
      source_kind:='expense_claim';
      SELECT line.withholding_nature_code,line.withholding_contract_reference,line.approved_amount,0
        INTO source_nature,source_contract,gross,excluded
        FROM finance.expense_claim_lines line JOIN finance.expense_claims claim
          ON claim.org_id=line.org_id AND claim.id=line.expense_claim_id
       WHERE line.org_id=organization_id AND line.id=(item->>'expense_claim_line_id')::uuid
         AND claim.status='posted' AND line.counterparty_party_id=source_party FOR SHARE OF line,claim;
    END IF;
    IF source_nature IS NULL OR gross IS NULL OR gross-excluded-prior_advance<=0 THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='typed withholding source is ineligible';
    END IF;
    IF rule.id IS NULL THEN
      SELECT count(*),min(candidate.id) INTO row_count,rule.id FROM tax.withholding_rule_versions candidate
       WHERE candidate.status='active' AND candidate.source_kind=source_kind AND candidate.nature_code=source_nature
         AND source_date BETWEEN candidate.effective_from AND coalesce(candidate.effective_to,'infinity'::date)
         AND fiscal_year BETWEEN candidate.fiscal_year_start_from AND coalesce(candidate.fiscal_year_start_to,9999)
         AND candidate.deductee_residency IN ('any',party.tax_residency_status)
         AND candidate.deductee_person_type IN ('any',party.tax_person_type)
         AND candidate.deductee_pan_status IN ('any',party.pan_verification_status)
         AND candidate.deductor_person_type IN ('any',org_fact.organization_person_type)
         AND (candidate.tax_regime<>'gst_tds' OR org_fact.gst_tds_notified_deductor)
         AND (target_advance_allocation_id IS NULL OR candidate.deduction_trigger='earlier_credit_or_payment')
         AND (candidate.organization_prior_fy_turnover_threshold IS NULL
              OR org_fact.prior_fiscal_year_turnover>candidate.organization_prior_fy_turnover_threshold);
      IF row_count<>1 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='exactly one imported withholding rule must apply'; END IF;
      SELECT * INTO rule FROM tax.withholding_rule_versions WHERE id=rule.id FOR SHARE;
    ELSIF rule.source_kind<>source_kind OR rule.nature_code<>source_nature THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='all basis rows must share one deterministic rule';
    END IF;
    IF target_advance_allocation_id IS NULL AND source_kind='supplier_invoice' THEN
      IF rule.basis_mode='net_value' THEN gross:=gross-excluded; excluded:=0;
      ELSIF rule.basis_mode<>'net_excluding_gst_cess' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='imported basis mode is incompatible with supplier invoice source'; END IF;
    ELSIF source_kind='expense_claim' AND rule.basis_mode<>'approved_amount' THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='imported basis mode is incompatible with expense source';
    ELSIF target_advance_allocation_id IS NOT NULL AND rule.basis_mode NOT IN ('net_value','net_excluding_gst_cess') THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='imported basis mode is incompatible with goods advance';
    END IF;
    IF rule.aggregation_scope='contract' THEN
      IF source_contract IS NULL OR pg_catalog.btrim(source_contract)='' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='contract-scoped withholding requires immutable source contract reference'; END IF;
      IF aggregate_contract IS NULL THEN aggregate_contract:=source_contract;
      ELSIF aggregate_contract IS DISTINCT FROM source_contract THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='one deduction cannot aggregate different statutory contracts'; END IF;
    END IF;
    total_basis:=total_basis+gross-excluded-prior_advance;
  END LOOP;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    organization_id::text||source_party::text||rule.id::text||fiscal_year::text||coalesce(aggregate_contract,''),679401));
  SELECT coalesce(sum(b.eligible_basis_amount),0) INTO cumulative FROM tax.withholding_basis_lines b
   LEFT JOIN tax.withholdings w ON w.org_id=b.org_id AND w.id=b.withholding_id
   WHERE b.org_id=organization_id AND b.counterparty_party_id=source_party AND b.rule_version_id=rule.id
     AND b.fiscal_year_start_year=fiscal_year
     AND (w.id IS NULL OR (w.status='deducted'
       AND NOT EXISTS(SELECT 1 FROM tax.withholdings reversal WHERE reversal.org_id=w.org_id
                      AND reversal.reversal_of_withholding_id=w.id)))
     AND (b.purchase_order_advance_allocation_id IS NULL OR NOT EXISTS(
       SELECT 1 FROM procurement.purchase_order_advance_allocations reversal
        WHERE reversal.org_id=b.org_id AND reversal.reversal_of_allocation_id=b.purchase_order_advance_allocation_id))
     AND (rule.aggregation_scope<>'contract' OR b.contract_reference=aggregate_contract);
  deduction_basis:=CASE rule.threshold_application WHEN 'excess_only' THEN greatest(cumulative+total_basis-rule.transaction_threshold,0)-greatest(cumulative-rule.transaction_threshold,0)
                   ELSE CASE WHEN cumulative+total_basis>rule.transaction_threshold THEN total_basis ELSE 0 END END;
  IF deduction_basis<=0 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='basis does not cross imported statutory threshold'; END IF;
  income_amount:=round(deduction_basis*rule.income_tax_rate/100,2); cgst_amount:=round(deduction_basis*rule.cgst_rate/100,2);
  sgst_amount:=round(deduction_basis*rule.sgst_rate/100,2); igst_amount:=round(deduction_basis*rule.igst_rate/100,2);
  withheld:=income_amount+cgst_amount+sgst_amount+igst_amount;
  IF target_advance_allocation_id IS NOT NULL AND (advance.withheld_amount<>withheld OR advance.gross_advance_amount<>total_basis) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='gross advance cash and withholding components do not match deterministic deduction';
  END IF;
  IF rule.tax_regime='income_tax_tds' THEN deductor_id:=org_fact.tan; deductee_kind:='pan'; deductee_id:=party.pan;
  ELSE
       SELECT count(*) INTO row_count FROM tax.registrations WHERE org_id=organization_id AND registration_type='tax_deductor'
        AND status='active' AND source_date BETWEEN effective_from AND coalesce(effective_to,'infinity'::date);
       IF row_count<>1 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='exactly one active GST deductor registration is required'; END IF;
       SELECT * INTO registration FROM tax.registrations WHERE org_id=organization_id AND registration_type='tax_deductor'
        AND status='active' AND source_date BETWEEN effective_from AND coalesce(effective_to,'infinity'::date) FOR SHARE;
       deductor_id:=registration.gstin; deductee_kind:='gstin';
       SELECT count(*) INTO row_count FROM parties.tax_registrations WHERE org_id=organization_id AND party_id=party.id
        AND registration_type='gstin' AND status='active' AND verified_at IS NOT NULL
        AND source_date BETWEEN valid_from AND coalesce(valid_until,'infinity'::date);
       IF row_count<>1 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='exactly one active verified deductee GSTIN is required'; END IF;
       SELECT registration_number INTO deductee_id FROM parties.tax_registrations WHERE org_id=organization_id AND party_id=party.id
        AND registration_type='gstin' AND status='active' AND verified_at IS NOT NULL
        AND source_date BETWEEN valid_from AND coalesce(valid_until,'infinity'::date) FOR SHARE;
  END IF;
  IF deductor_id IS NULL OR deductee_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='verified statutory identifiers are missing'; END IF;
  due_date:=CASE rule.deposit_due_policy
    WHEN 'days_after_deduction' THEN source_date+rule.deposit_due_day
    WHEN 'fixed_date_after_fy_end' THEN
      (pg_catalog.make_date(fiscal_year+1,4,1)+(rule.deposit_month_offset||' month')::interval)::date
        +(rule.deposit_due_day-1)
    ELSE (pg_catalog.date_trunc('month',source_date)::date + ((rule.deposit_month_offset+1)||' month')::interval)::date + (rule.deposit_due_day-1) END;
  SELECT * INTO journal FROM finance.journal_entries WHERE org_id=organization_id AND id=journal_id FOR UPDATE;
  IF journal.status<>'draft' OR journal.transaction_currency<>'INR' OR journal.transaction_debit_total<>withheld
     OR journal.transaction_credit_total<>withheld OR journal.functional_debit_total<>withheld OR journal.functional_credit_total<>withheld THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='withholding journal must exactly balance deterministic amount';
  END IF;
  IF source_branch IS NULL THEN
    SELECT count(DISTINCT line.branch_id),(pg_catalog.array_agg(DISTINCT line.branch_id ORDER BY line.branch_id))[1]
      INTO row_count,source_branch FROM finance.journal_lines line
     WHERE line.org_id=organization_id AND line.journal_entry_id=journal_id;
    IF row_count<>1 OR source_branch IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='expense withholding journal must identify exactly one branch'; END IF;
  END IF;
  debit_account:=erp_commercial_commands.resolve_role_account(organization_id,source_branch,
    CASE WHEN target_advance_allocation_id IS NULL THEN 'accounts_payable' ELSE 'supplier_prepayment' END,
    CASE WHEN target_advance_allocation_id IS NULL THEN 'liability' ELSE 'asset' END,'INR',true);
  credit_account:=erp_commercial_commands.resolve_role_account(organization_id,source_branch,
    CASE WHEN rule.tax_regime='income_tax_tds' THEN 'income_tax_tds_payable' ELSE 'gst_tds_payable' END,
    'liability','INR',false);
  SELECT count(*) INTO journal_line_count FROM finance.journal_lines line
   WHERE line.org_id=organization_id AND line.journal_entry_id=journal_id;
  IF journal_line_count<>2
     OR NOT EXISTS(SELECT 1 FROM finance.journal_lines line WHERE line.org_id=organization_id
       AND line.journal_entry_id=journal_id AND line.account_id=debit_account AND line.branch_id=source_branch
       AND line.party_id=source_party AND line.transaction_debit=withheld AND line.transaction_credit=0
       AND line.functional_debit=withheld AND line.functional_credit=0)
     OR NOT EXISTS(SELECT 1 FROM finance.journal_lines line WHERE line.org_id=organization_id
       AND line.journal_entry_id=journal_id AND line.account_id=credit_account AND line.branch_id=source_branch
       AND line.party_id IS NULL AND line.transaction_debit=0 AND line.transaction_credit=withheld
       AND line.functional_debit=0 AND line.functional_credit=withheld) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='withholding journal lines do not match canonical account roles and components';
  END IF;
  INSERT INTO "{SCHEMA}"."command_scopes" VALUES
    (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'withholding_post',organization_id,withholding_id);
  INSERT INTO tax.withholdings(org_id,id,registration_id,open_item_id,purchase_order_advance_allocation_id,
    triggered_by_payment_id,counterparty_party_id,tax_regime,governing_act_code,provision_code,rule_version_id,
    deduction_trigger,deduction_date,gst_component_mode,basis_amount,withholding_rate,income_tax_rate,cgst_rate,
    sgst_rate,igst_rate,income_tax_amount,cgst_amount,sgst_amount,igst_amount,withheld_amount,deductor_tax_identifier,
    deductee_identifier_kind,deductee_tax_identifier,deposit_due_date,created_by_membership_id)
  VALUES(organization_id,withholding_id,registration.id,target_open_item_id,target_advance_allocation_id,
    payment.id,source_party,rule.tax_regime,rule.governing_act_code,rule.provision_code,rule.id,
    CASE WHEN target_advance_allocation_id IS NULL THEN 'credit' ELSE 'payment' END,source_date,
    CASE WHEN rule.tax_regime='income_tax_tds' THEN 'not_applicable' WHEN rule.igst_rate>0 THEN 'inter_state' ELSE 'intra_state' END,
    deduction_basis,rule.income_tax_rate+rule.cgst_rate+rule.sgst_rate+rule.igst_rate,rule.income_tax_rate,
    rule.cgst_rate,rule.sgst_rate,rule.igst_rate,income_amount,cgst_amount,sgst_amount,igst_amount,withheld,
    deductor_id,deductee_kind,deductee_id,due_date,actor_id);
  FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(basis_rows) LOOP
    prior_advance:=0;
    IF target_advance_allocation_id IS NOT NULL THEN
      SELECT line.withholding_nature_code,purchase_order.purchase_order_number,
             advance.gross_advance_amount,0::numeric
        INTO source_nature,source_contract,gross,excluded
        FROM procurement.purchase_order_lines line JOIN procurement.purchase_orders purchase_order
          ON purchase_order.org_id=line.org_id AND purchase_order.id=line.purchase_order_id
       WHERE line.org_id=organization_id AND line.id=advance.purchase_order_line_id;
    ELSIF item ? 'supplier_invoice_line_id' THEN
      SELECT line.withholding_nature_code,line.withholding_contract_reference,
             line.net_value_amount+line.cgst_amount+line.sgst_amount+line.igst_amount+line.cess_amount,
             line.cgst_amount+line.sgst_amount+line.igst_amount+line.cess_amount
        INTO source_nature,source_contract,gross,excluded
        FROM procurement.supplier_invoice_lines line WHERE line.org_id=organization_id
         AND line.id=(item->>'supplier_invoice_line_id')::uuid;
      SELECT coalesce(sum(prior_basis.eligible_basis_amount),0) INTO prior_advance
       FROM procurement.supplier_invoice_lines invoice_line
       JOIN procurement.purchase_order_advance_allocations pa ON pa.org_id=invoice_line.org_id
        AND pa.purchase_order_line_id=invoice_line.purchase_order_line_id AND pa.status='posted'
       JOIN tax.withholding_basis_lines prior_basis ON prior_basis.org_id=pa.org_id
        AND prior_basis.purchase_order_advance_allocation_id=pa.id
       WHERE invoice_line.org_id=organization_id AND invoice_line.id=(item->>'supplier_invoice_line_id')::uuid
        AND NOT EXISTS(SELECT 1 FROM procurement.purchase_order_advance_allocations reversal
          WHERE reversal.org_id=pa.org_id AND reversal.reversal_of_allocation_id=pa.id);
    ELSE
      SELECT line.withholding_nature_code,line.withholding_contract_reference,line.approved_amount,0
        INTO source_nature,source_contract,gross,excluded
        FROM finance.expense_claim_lines line WHERE line.org_id=organization_id
         AND line.id=(item->>'expense_claim_line_id')::uuid;
    END IF;
    IF target_advance_allocation_id IS NULL AND source_kind='supplier_invoice' AND rule.basis_mode='net_value' THEN
      gross:=gross-excluded; excluded:=0;
    END IF;
    INSERT INTO tax.withholding_basis_lines(org_id,id,withholding_id,rule_version_id,supplier_invoice_line_id,
      expense_claim_line_id,purchase_order_advance_allocation_id,counterparty_party_id,fiscal_year_start_year,
      nature_code,contract_reference,source_event_date,source_gross_amount,excluded_gst_cess_amount,prior_advance_basis_amount,
      eligible_basis_amount,created_by_membership_id)
    VALUES(organization_id,(item->>'id')::uuid,withholding_id,rule.id,(item->>'supplier_invoice_line_id')::uuid,
      (item->>'expense_claim_line_id')::uuid,(item->>'purchase_order_advance_allocation_id')::uuid,source_party,
      fiscal_year,source_nature,source_contract,source_date,gross,excluded,prior_advance,gross-excluded-prior_advance,actor_id);
  END LOOP;
  UPDATE finance.journal_entries SET status='posted',posted_at=pg_catalog.transaction_timestamp(),posted_by_membership_id=actor_id,
    updated_at=pg_catalog.transaction_timestamp(),updated_by_membership_id=actor_id,row_version=row_version+1 WHERE org_id=organization_id AND id=journal_id;
  INSERT INTO finance.accounting_events(org_id,id,event_type,withholding_id,journal_entry_id,occurred_at,source_posted_at,created_by_membership_id)
  VALUES(organization_id,event_id,'withholding',withholding_id,journal_id,pg_catalog.transaction_timestamp(),pg_catalog.transaction_timestamp(),actor_id);
  IF target_open_item_id IS NOT NULL THEN
    INSERT INTO finance.allocations(org_id,id,withholding_id,open_item_id,allocation_date,currency_code,amount,
      functional_amount,fx_rate,status,created_by_membership_id)
    VALUES(organization_id,settlement_allocation_id,withholding_id,target_open_item_id,source_date,'INR',withheld,withheld,1,'posted',actor_id);
  END IF;
  DELETE FROM "{SCHEMA}"."command_scopes" WHERE backend_pid=pg_catalog.pg_backend_pid() AND transaction_id=pg_catalog.txid_current()
    AND scope='withholding_post' AND org_id=organization_id AND entity_id=withholding_id;
  PERFORM "{SCHEMA}"."finish_claim"(organization_id,claim_id,'tax.withholdings',withholding_id);
  RETURN withholding_id;
END
''', runtime=True),
        *_function('"reverse_withholding"(organization_id uuid, original_withholding_id uuid, reversal_withholding_id uuid, actor_id uuid, reversal_journal_id uuid, reversal_event_id uuid, reversal_allocation_id uuid, reason text, key_hash bytea, request_hash bytea, expires_at timestamptz)',"uuid",f'''
DECLARE original tax.withholdings%ROWTYPE; original_event finance.accounting_events%ROWTYPE;
 original_journal finance.journal_entries%ROWTYPE; original_allocation finance.allocations%ROWTYPE;
 claim_id uuid; replay_id uuid; reversed_time timestamptz;
BEGIN
 PERFORM "{SCHEMA}"."assert_context"(organization_id,actor_id,'tax.withholding.manage',NULL::uuid);
 PERFORM "{SCHEMA}"."assert_context"(organization_id,actor_id,'finance.journal.post',NULL::uuid);
 SELECT p_claim_id,p_replay_resource_id INTO claim_id,replay_id FROM "{SCHEMA}"."claim"(organization_id,actor_id,'tax.withholding.reverse',key_hash,request_hash,expires_at);
 IF replay_id IS NOT NULL THEN RETURN replay_id; END IF;
 SELECT * INTO original FROM tax.withholdings WHERE org_id=organization_id AND id=original_withholding_id FOR UPDATE;
 IF original.status<>'deducted' OR original.reversal_of_withholding_id IS NOT NULL OR reason IS NULL OR pg_catalog.btrim(reason)='' OR
    EXISTS(SELECT 1 FROM tax.withholdings reversal WHERE reversal.org_id=organization_id AND reversal.reversal_of_withholding_id=original.id) OR
    EXISTS(SELECT 1 FROM tax.withholding_deposit_lines line JOIN tax.withholding_deposits deposit ON deposit.org_id=line.org_id AND deposit.id=line.deposit_id
           WHERE line.org_id=organization_id AND line.withholding_id=original.id AND deposit.status='posted'
             AND NOT EXISTS(SELECT 1 FROM tax.withholding_deposits reversal
               WHERE reversal.org_id=deposit.org_id AND reversal.reversal_of_deposit_id=deposit.id)) OR
    EXISTS(SELECT 1 FROM tax.withholding_statement_lines line WHERE line.org_id=organization_id AND line.withholding_id=original.id) THEN
  RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='withholding reversal requires undeposited unfiled original and reason'; END IF;
 SELECT event.* INTO original_event FROM finance.accounting_events event WHERE event.org_id=organization_id AND event.withholding_id=original.id FOR SHARE;
 SELECT * INTO original_journal FROM finance.journal_entries WHERE org_id=organization_id AND id=original_event.journal_entry_id FOR SHARE;
 reversed_time:=pg_catalog.transaction_timestamp();
 INSERT INTO "{SCHEMA}"."command_scopes" VALUES(pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'withholding_post',organization_id,reversal_withholding_id);
 INSERT INTO tax.withholdings(org_id,id,registration_id,open_item_id,purchase_order_advance_allocation_id,triggered_by_payment_id,counterparty_party_id,
  tax_regime,governing_act_code,provision_code,rule_version_id,deduction_trigger,deduction_date,gst_component_mode,currency_code,basis_amount,withholding_rate,
  income_tax_rate,cgst_rate,sgst_rate,igst_rate,income_tax_amount,cgst_amount,sgst_amount,igst_amount,withheld_amount,deductor_tax_identifier,
  deductee_identifier_kind,deductee_tax_identifier,deposit_due_date,reversal_of_withholding_id,reversal_reason,status,created_by_membership_id)
 SELECT org_id,reversal_withholding_id,registration_id,open_item_id,purchase_order_advance_allocation_id,triggered_by_payment_id,counterparty_party_id,
  tax_regime,governing_act_code,provision_code,rule_version_id,deduction_trigger,deduction_date,gst_component_mode,currency_code,basis_amount,withholding_rate,
  income_tax_rate,cgst_rate,sgst_rate,igst_rate,income_tax_amount,cgst_amount,sgst_amount,igst_amount,withheld_amount,deductor_tax_identifier,
  deductee_identifier_kind,deductee_tax_identifier,deposit_due_date,id,reason,'reversed',actor_id FROM tax.withholdings WHERE org_id=organization_id AND id=original.id;
 INSERT INTO finance.journal_entries(org_id,id,journal_number,posting_date,description,transaction_currency,functional_currency,fx_rate,
  transaction_debit_total,transaction_credit_total,functional_debit_total,functional_credit_total,reversal_of_journal_entry_id,reversal_reason,status,
  posted_at,posted_by_membership_id,created_by_membership_id,updated_by_membership_id)
 SELECT organization_id,reversal_journal_id,'WH-REV-'||reversal_withholding_id::text,posting_date,'Withholding reversal: '||reason,
  transaction_currency,functional_currency,fx_rate,transaction_credit_total,transaction_debit_total,functional_credit_total,functional_debit_total,
  id,reason,'posted',reversed_time,actor_id,actor_id,actor_id FROM finance.journal_entries WHERE org_id=organization_id AND id=original_journal.id;
 INSERT INTO finance.journal_lines(org_id,id,journal_entry_id,line_number,account_id,branch_id,party_id,description,transaction_debit,transaction_credit,functional_debit,functional_credit,created_by_membership_id)
 SELECT organization_id,gen_random_uuid(),reversal_journal_id,line_number,account_id,branch_id,party_id,description,transaction_credit,transaction_debit,functional_credit,functional_debit,actor_id
  FROM finance.journal_lines WHERE org_id=organization_id AND journal_entry_id=original_journal.id;
 INSERT INTO finance.accounting_events(org_id,id,event_type,withholding_id,journal_entry_id,occurred_at,source_posted_at,created_by_membership_id)
 VALUES(organization_id,reversal_event_id,'withholding',reversal_withholding_id,reversal_journal_id,reversed_time,reversed_time,actor_id);
 SELECT * INTO original_allocation FROM finance.allocations WHERE org_id=organization_id AND withholding_id=original.id FOR SHARE;
 IF original_allocation.id IS NOT NULL THEN
  INSERT INTO finance.allocations(org_id,id,withholding_id,open_item_id,allocation_date,currency_code,amount,functional_amount,fx_rate,reversal_of_allocation_id,reversal_reason,status,reversed_at,reversed_by_membership_id,created_by_membership_id)
  VALUES(organization_id,reversal_allocation_id,original_allocation.withholding_id,original_allocation.open_item_id,original.deduction_date,'INR',original_allocation.amount,
   original_allocation.functional_amount,1,original_allocation.id,reason,'reversed',reversed_time,actor_id,actor_id);
 END IF;
 DELETE FROM "{SCHEMA}"."command_scopes" WHERE backend_pid=pg_catalog.pg_backend_pid() AND transaction_id=pg_catalog.txid_current() AND scope='withholding_post' AND org_id=organization_id AND entity_id=reversal_withholding_id;
 PERFORM "{SCHEMA}"."finish_claim"(organization_id,claim_id,'tax.withholdings',reversal_withholding_id); RETURN reversal_withholding_id;
END
''',runtime=True),
    ]


def _withholding_deposit_line_definition() -> list[str]:
    return [*_function('"guard_withholding_deposit_line"()',"trigger",f'''
BEGIN
 IF TG_OP<>'INSERT' OR NOT "{SCHEMA}"."scope_active"('withholding_deposit',NEW.org_id,NEW.deposit_id) THEN
  RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='withholding deposit lines are immutable command facts'; END IF;
 RETURN NEW;
END
'''), _trigger("withholding_deposit_lines_command_guard_ct","INSERT OR UPDATE OR DELETE","tax.withholding_deposit_lines","guard_withholding_deposit_line")]


def _withholding_deposit_definition() -> list[str]:
    return [*_function('"guard_withholding_deposit"()',"trigger",f'''
BEGIN
 IF TG_OP<>'INSERT' OR NOT "{SCHEMA}"."scope_active"('withholding_deposit',NEW.org_id,NEW.id) THEN
  RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='withholding deposits are immutable command facts'; END IF;
 RETURN NEW;
END
'''), _trigger("withholding_deposits_command_guard_ct","INSERT OR UPDATE OR DELETE","tax.withholding_deposits","guard_withholding_deposit"),
    *_function('"post_withholding_deposit"(organization_id uuid, deposit_id uuid, actor_id uuid, payment_id uuid, challan_reference varchar, deposited_on date, evidence_attachment_id uuid, reversal_of_deposit_id uuid, reversal_reason text, deposit_lines jsonb, key_hash bytea, request_hash bytea, expires_at timestamptz)',"uuid",f'''
DECLARE claim_id uuid; replay_id uuid; payment finance.payments%ROWTYPE; evidence core.attachments%ROWTYPE;
 item jsonb; withholding tax.withholdings%ROWTYPE; original tax.withholding_deposits%ROWTYPE;
 original_line tax.withholding_deposit_lines%ROWTYPE;
 regime text; registration_id uuid; total numeric(20,2):=0; income_total numeric(20,2):=0;
 cgst_total numeric(20,2):=0; sgst_total numeric(20,2):=0; igst_total numeric(20,2):=0; already numeric(20,2);
BEGIN
 PERFORM "{SCHEMA}"."assert_context"(organization_id,actor_id,'tax.withholding.manage',NULL::uuid);
 SELECT p_claim_id,p_replay_resource_id INTO claim_id,replay_id FROM "{SCHEMA}"."claim"(
  organization_id,actor_id,'tax.withholding.deposit',key_hash,request_hash,expires_at);
 IF replay_id IS NOT NULL THEN RETURN replay_id; END IF;
 SELECT * INTO payment FROM finance.payments WHERE org_id=organization_id AND id=payment_id FOR UPDATE;
 SELECT * INTO evidence FROM core.attachments WHERE org_id=organization_id AND id=evidence_attachment_id FOR SHARE;
 IF payment.status<>'posted' OR payment.currency_code<>'INR' OR payment.payment_purpose<>'withholding_deposit'
    OR evidence.status NOT IN ('verified','retained')
    OR evidence.verified_at IS NULL OR pg_catalog.jsonb_typeof(deposit_lines)<>'array' OR pg_catalog.jsonb_array_length(deposit_lines)=0 THEN
  RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='deposit requires posted INR government payment and verified challan evidence'; END IF;
 IF reversal_of_deposit_id IS NULL AND payment.direction<>'disbursement' OR reversal_of_deposit_id IS NOT NULL AND payment.direction<>'receipt' THEN
  RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='deposit payment direction is invalid'; END IF;
 IF reversal_of_deposit_id IS NOT NULL THEN SELECT * INTO original FROM tax.withholding_deposits WHERE org_id=organization_id AND id=reversal_of_deposit_id FOR SHARE;
  IF original.status<>'posted' OR reversal_reason IS NULL
     OR EXISTS(SELECT 1 FROM tax.withholding_statement_lines statement_line
       JOIN tax.withholding_deposit_lines deposit_line ON deposit_line.org_id=statement_line.org_id
        AND deposit_line.id=statement_line.deposit_line_id
       WHERE deposit_line.org_id=organization_id AND deposit_line.deposit_id=original.id) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='deposit reversal requires unfiled immutable posted original and reason'; END IF; END IF;
 FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(deposit_lines) LOOP
  SELECT * INTO withholding FROM tax.withholdings WHERE org_id=organization_id AND id=(item->>'withholding_id')::uuid FOR UPDATE;
  IF withholding.status<>'deducted' OR EXISTS(SELECT 1 FROM tax.withholdings reversal
       WHERE reversal.org_id=organization_id AND reversal.reversal_of_withholding_id=withholding.id)
     OR (regime IS NOT NULL AND regime<>withholding.tax_regime)
     OR (registration_id IS NOT NULL AND registration_id IS DISTINCT FROM withholding.registration_id) THEN
   RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='challan lines must share one live regime and registration'; END IF;
  regime:=withholding.tax_regime; registration_id:=withholding.registration_id;
  SELECT coalesce(sum(line.deposited_amount),0) INTO already FROM tax.withholding_deposit_lines line
   JOIN tax.withholding_deposits deposit ON deposit.org_id=line.org_id AND deposit.id=line.deposit_id
   WHERE line.org_id=organization_id AND line.withholding_id=withholding.id AND deposit.status='posted'
     AND NOT EXISTS(SELECT 1 FROM tax.withholding_deposits reversal
       WHERE reversal.org_id=deposit.org_id AND reversal.reversal_of_deposit_id=deposit.id);
  IF reversal_of_deposit_id IS NULL THEN
    IF already<>0 OR ROW((item->>'income_tax_amount')::numeric,(item->>'cgst_amount')::numeric,
       (item->>'sgst_amount')::numeric,(item->>'igst_amount')::numeric,(item->>'deposited_amount')::numeric)
       IS DISTINCT FROM ROW(withholding.income_tax_amount,withholding.cgst_amount,withholding.sgst_amount,
       withholding.igst_amount,withholding.withheld_amount) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='challan must deposit each deduction and component exactly once'; END IF;
  ELSE
    SELECT line.* INTO original_line FROM tax.withholding_deposit_lines line
     WHERE line.org_id=organization_id AND line.deposit_id=original.id AND line.withholding_id=withholding.id FOR SHARE;
    IF original_line.id IS NULL OR ROW((item->>'income_tax_amount')::numeric,(item->>'cgst_amount')::numeric,
       (item->>'sgst_amount')::numeric,(item->>'igst_amount')::numeric,(item->>'deposited_amount')::numeric)
       IS DISTINCT FROM ROW(original_line.income_tax_amount,original_line.cgst_amount,original_line.sgst_amount,
       original_line.igst_amount,original_line.deposited_amount) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='deposit reversal must copy the original component allocation'; END IF;
  END IF;
  income_total:=income_total+(item->>'income_tax_amount')::numeric; cgst_total:=cgst_total+(item->>'cgst_amount')::numeric;
  sgst_total:=sgst_total+(item->>'sgst_amount')::numeric; igst_total:=igst_total+(item->>'igst_amount')::numeric;
  total:=total+(item->>'deposited_amount')::numeric;
 END LOOP;
 IF total<>payment.amount OR total<>income_total+cgst_total+sgst_total+igst_total THEN
  RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='challan line components must equal exact payment'; END IF;
 INSERT INTO "{SCHEMA}"."command_scopes" VALUES(pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'withholding_deposit',organization_id,deposit_id);
 INSERT INTO tax.withholding_deposits(org_id,id,tax_regime,registration_id,payment_id,challan_reference,deposited_on,
  deposited_amount,evidence_attachment_id,reversal_of_deposit_id,reversal_reason,status,created_by_membership_id)
 VALUES(organization_id,deposit_id,regime,registration_id,payment_id,challan_reference,deposited_on,total,evidence_attachment_id,
  reversal_of_deposit_id,reversal_reason,CASE WHEN reversal_of_deposit_id IS NULL THEN 'posted' ELSE 'reversed' END,actor_id);
 FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(deposit_lines) LOOP
  INSERT INTO tax.withholding_deposit_lines(org_id,id,deposit_id,withholding_id,income_tax_amount,cgst_amount,sgst_amount,igst_amount,deposited_amount,created_by_membership_id)
  VALUES(organization_id,(item->>'id')::uuid,deposit_id,(item->>'withholding_id')::uuid,(item->>'income_tax_amount')::numeric,
   (item->>'cgst_amount')::numeric,(item->>'sgst_amount')::numeric,(item->>'igst_amount')::numeric,(item->>'deposited_amount')::numeric,actor_id);
 END LOOP;
 DELETE FROM "{SCHEMA}"."command_scopes" WHERE backend_pid=pg_catalog.pg_backend_pid() AND transaction_id=pg_catalog.txid_current() AND scope='withholding_deposit' AND org_id=organization_id AND entity_id=deposit_id;
 PERFORM "{SCHEMA}"."finish_claim"(organization_id,claim_id,'tax.withholding_deposits',deposit_id); RETURN deposit_id;
END
''',runtime=True)]


def _withholding_statement_line_definition() -> list[str]:
    return [*_function('"guard_withholding_statement_line"()',"trigger",f'''
BEGIN IF TG_OP<>'INSERT' OR NOT "{SCHEMA}"."scope_active"('withholding_statement',NEW.org_id,NEW.statement_id) THEN
 RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='withholding statement lines are immutable command facts'; END IF; RETURN NEW; END
'''),_trigger("withholding_statement_lines_command_guard_ct","INSERT OR UPDATE OR DELETE","tax.withholding_statement_lines","guard_withholding_statement_line")]


def _withholding_statement_definition() -> list[str]:
    return [*_function('"guard_withholding_statement"()',"trigger",f'''
BEGIN IF TG_OP<>'INSERT' OR NOT "{SCHEMA}"."scope_active"('withholding_statement',NEW.org_id,NEW.id) THEN
 RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='withholding statements are immutable command facts'; END IF; RETURN NEW; END
'''),_trigger("withholding_statements_command_guard_ct","INSERT OR UPDATE OR DELETE","tax.withholding_statements","guard_withholding_statement"),
    *_function('"file_withholding_statement"(organization_id uuid, statement_id uuid, actor_id uuid, tax_regime text, registration_id uuid, fiscal_year_start_year smallint, period_start date, period_end date, form_code varchar, statement_reference varchar, filed_at timestamptz, acknowledgement_attachment_id uuid, revision_of_statement_id uuid, statement_lines jsonb, key_hash bytea, request_hash bytea, expires_at timestamptz)',"uuid",f'''
DECLARE claim_id uuid; replay_id uuid; evidence core.attachments%ROWTYPE; original tax.withholding_statements%ROWTYPE;
 item jsonb; deposit_line tax.withholding_deposit_lines%ROWTYPE; withholding tax.withholdings%ROWTYPE;
BEGIN
 PERFORM "{SCHEMA}"."assert_context"(organization_id,actor_id,'tax.withholding.manage',NULL::uuid);
 SELECT p_claim_id,p_replay_resource_id INTO claim_id,replay_id FROM "{SCHEMA}"."claim"(organization_id,actor_id,'tax.withholding.statement',key_hash,request_hash,expires_at);
 IF replay_id IS NOT NULL THEN RETURN replay_id; END IF;
 SELECT * INTO evidence FROM core.attachments WHERE org_id=organization_id AND id=acknowledgement_attachment_id FOR SHARE;
 IF evidence.status NOT IN ('verified','retained') OR evidence.verified_at IS NULL OR pg_catalog.jsonb_typeof(statement_lines)<>'array' OR pg_catalog.jsonb_array_length(statement_lines)=0 THEN
  RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='statement requires verified acknowledgement and exact population'; END IF;
 IF revision_of_statement_id IS NOT NULL THEN SELECT * INTO original FROM tax.withholding_statements WHERE org_id=organization_id AND id=revision_of_statement_id FOR SHARE;
  IF original.id IS NULL OR ROW(original.tax_regime,original.registration_id,original.fiscal_year_start_year,original.period_start,original.period_end,original.form_code)
   IS DISTINCT FROM ROW(tax_regime,registration_id,fiscal_year_start_year,period_start,period_end,form_code) THEN
   RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='statement revision must copy immutable filing context'; END IF; END IF;
 FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(statement_lines) LOOP
  SELECT * INTO deposit_line FROM tax.withholding_deposit_lines WHERE org_id=organization_id AND id=(item->>'deposit_line_id')::uuid FOR SHARE;
  SELECT * INTO withholding FROM tax.withholdings WHERE org_id=organization_id AND id=(item->>'withholding_id')::uuid FOR SHARE;
  IF deposit_line.withholding_id<>withholding.id OR withholding.tax_regime<>tax_regime OR withholding.registration_id IS DISTINCT FROM registration_id
     OR withholding.deduction_date NOT BETWEEN period_start AND period_end
     OR form_code IS DISTINCT FROM (SELECT rule.statement_form_code FROM tax.withholding_rule_versions rule WHERE rule.id=withholding.rule_version_id)
     OR NOT EXISTS(SELECT 1 FROM tax.withholding_deposits deposit WHERE deposit.org_id=organization_id AND deposit.id=deposit_line.deposit_id AND deposit.status='posted'
       AND NOT EXISTS(SELECT 1 FROM tax.withholding_deposits reversal WHERE reversal.org_id=deposit.org_id AND reversal.reversal_of_deposit_id=deposit.id)) THEN
   RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='statement line lacks exact active deposit coverage and period'; END IF;
 END LOOP;
 INSERT INTO "{SCHEMA}"."command_scopes" VALUES(pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'withholding_statement',organization_id,statement_id);
 INSERT INTO tax.withholding_statements(org_id,id,tax_regime,registration_id,fiscal_year_start_year,period_start,period_end,form_code,statement_reference,filed_at,acknowledgement_attachment_id,revision_of_statement_id,created_by_membership_id)
 VALUES(organization_id,statement_id,tax_regime,registration_id,fiscal_year_start_year,period_start,period_end,form_code,statement_reference,filed_at,acknowledgement_attachment_id,revision_of_statement_id,actor_id);
 FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(statement_lines) LOOP
  INSERT INTO tax.withholding_statement_lines(org_id,id,statement_id,withholding_id,deposit_line_id,created_by_membership_id)
  VALUES(organization_id,(item->>'id')::uuid,statement_id,(item->>'withholding_id')::uuid,(item->>'deposit_line_id')::uuid,actor_id); END LOOP;
 DELETE FROM "{SCHEMA}"."command_scopes" WHERE backend_pid=pg_catalog.pg_backend_pid() AND transaction_id=pg_catalog.txid_current() AND scope='withholding_statement' AND org_id=organization_id AND entity_id=statement_id;
 PERFORM "{SCHEMA}"."finish_claim"(organization_id,claim_id,'tax.withholding_statements',statement_id); RETURN statement_id;
END
''',runtime=True)]


def _withholding_certificate_line_definition() -> list[str]:
    return [*_function('"guard_withholding_certificate_line"()',"trigger",f'''
BEGIN IF TG_OP<>'INSERT' OR NOT "{SCHEMA}"."scope_active"('withholding_certificate',NEW.org_id,NEW.certificate_id) THEN
 RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='withholding certificate lines are immutable command facts'; END IF; RETURN NEW; END
'''),_trigger("withholding_certificate_lines_command_guard_ct","INSERT OR UPDATE OR DELETE","tax.withholding_certificate_lines","guard_withholding_certificate_line")]


def _withholding_certificate_definition() -> list[str]:
    return [*_function('"guard_withholding_certificate"()',"trigger",f'''
BEGIN IF TG_OP<>'INSERT' OR NOT "{SCHEMA}"."scope_active"('withholding_certificate',NEW.org_id,NEW.id) THEN
 RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='withholding certificates are immutable command facts'; END IF; RETURN NEW; END
'''),_trigger("withholding_certificates_command_guard_ct","INSERT OR UPDATE OR DELETE","tax.withholding_certificates","guard_withholding_certificate"),
    *_function('"import_withholding_certificate"(organization_id uuid, certificate_id uuid, actor_id uuid, tax_regime text, registration_id uuid, counterparty_party_id uuid, fiscal_year_start_year smallint, period_start date, period_end date, form_code varchar, certificate_reference varchar, issued_on date, evidence_attachment_id uuid, correction_of_certificate_id uuid, certificate_lines jsonb, key_hash bytea, request_hash bytea, expires_at timestamptz)',"uuid",f'''
DECLARE claim_id uuid; replay_id uuid; evidence core.attachments%ROWTYPE; original tax.withholding_certificates%ROWTYPE;
 item jsonb; statement_line tax.withholding_statement_lines%ROWTYPE; statement tax.withholding_statements%ROWTYPE; withholding tax.withholdings%ROWTYPE;
BEGIN
 PERFORM "{SCHEMA}"."assert_context"(organization_id,actor_id,'tax.withholding.manage',NULL::uuid);
 SELECT p_claim_id,p_replay_resource_id INTO claim_id,replay_id FROM "{SCHEMA}"."claim"(organization_id,actor_id,'tax.withholding.certificate',key_hash,request_hash,expires_at);
 IF replay_id IS NOT NULL THEN RETURN replay_id; END IF;
 SELECT * INTO evidence FROM core.attachments WHERE org_id=organization_id AND id=evidence_attachment_id FOR SHARE;
 IF evidence.status NOT IN ('verified','retained') OR evidence.verified_at IS NULL OR pg_catalog.jsonb_typeof(certificate_lines)<>'array' OR pg_catalog.jsonb_array_length(certificate_lines)=0 THEN
  RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='certificate requires verified retained authority artifact and lines'; END IF;
 IF correction_of_certificate_id IS NOT NULL THEN SELECT * INTO original FROM tax.withholding_certificates WHERE org_id=organization_id AND id=correction_of_certificate_id FOR SHARE;
  IF original.id IS NULL OR ROW(original.tax_regime,original.registration_id,original.counterparty_party_id,original.fiscal_year_start_year,original.period_start,original.period_end,original.form_code)
   IS DISTINCT FROM ROW(tax_regime,registration_id,counterparty_party_id,fiscal_year_start_year,period_start,period_end,form_code) THEN
   RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='certificate correction must copy immutable authority context'; END IF; END IF;
 FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(certificate_lines) LOOP
  SELECT * INTO statement_line FROM tax.withholding_statement_lines WHERE org_id=organization_id AND id=(item->>'statement_line_id')::uuid FOR SHARE;
  SELECT * INTO statement FROM tax.withholding_statements WHERE org_id=organization_id AND id=statement_line.statement_id FOR SHARE;
  SELECT * INTO withholding FROM tax.withholdings WHERE org_id=organization_id AND id=statement_line.withholding_id FOR SHARE;
  IF statement_line.withholding_id<>(item->>'withholding_id')::uuid OR withholding.counterparty_party_id<>counterparty_party_id
    OR statement.tax_regime<>tax_regime OR statement.registration_id IS DISTINCT FROM registration_id
    OR form_code IS DISTINCT FROM (SELECT rule.certificate_form_code FROM tax.withholding_rule_versions rule WHERE rule.id=withholding.rule_version_id)
    OR statement.period_start<period_start OR statement.period_end>period_end OR (item->>'certified_amount')::numeric<>withholding.withheld_amount THEN
   RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='certificate line does not match filed deductee, regime, period and exact amount'; END IF;
 END LOOP;
 INSERT INTO "{SCHEMA}"."command_scopes" VALUES(pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'withholding_certificate',organization_id,certificate_id);
 INSERT INTO tax.withholding_certificates(org_id,id,tax_regime,registration_id,counterparty_party_id,fiscal_year_start_year,period_start,period_end,form_code,certificate_reference,issued_on,evidence_attachment_id,correction_of_certificate_id,created_by_membership_id)
 VALUES(organization_id,certificate_id,tax_regime,registration_id,counterparty_party_id,fiscal_year_start_year,period_start,period_end,form_code,certificate_reference,issued_on,evidence_attachment_id,correction_of_certificate_id,actor_id);
 FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(certificate_lines) LOOP
  INSERT INTO tax.withholding_certificate_lines(org_id,id,certificate_id,statement_line_id,withholding_id,certified_amount,created_by_membership_id)
  VALUES(organization_id,(item->>'id')::uuid,certificate_id,(item->>'statement_line_id')::uuid,(item->>'withholding_id')::uuid,(item->>'certified_amount')::numeric,actor_id); END LOOP;
 DELETE FROM "{SCHEMA}"."command_scopes" WHERE backend_pid=pg_catalog.pg_backend_pid() AND transaction_id=pg_catalog.txid_current() AND scope='withholding_certificate' AND org_id=organization_id AND entity_id=certificate_id;
 PERFORM "{SCHEMA}"."finish_claim"(organization_id,claim_id,'tax.withholding_certificates',certificate_id); RETURN certificate_id;
END
''',runtime=True)]


def _organization_fiscal_tax_fact_definition() -> list[str]:
    return [
        *_function(
            '"guard_organization_fiscal_tax_fact"()',
            "trigger",
            f'''
BEGIN
    IF TG_OP='DELETE' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='verified organization fiscal tax facts are retained';
    END IF;
    IF TG_OP='INSERT' THEN
        IF NOT "{SCHEMA}"."scope_active"('organization_fiscal_tax_fact_insert',NEW.org_id,NEW.id) THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='organization fiscal tax fact requires verified command provenance';
        END IF;
        RETURN NEW;
    END IF;
    IF NOT "{SCHEMA}"."scope_active"('organization_fiscal_tax_fact_supersede',OLD.org_id,OLD.id)
       OR OLD.status<>'active' OR NEW.status<>'superseded'
       OR ROW(NEW.org_id,NEW.id,NEW.fiscal_year_start_year,NEW.effective_from,NEW.effective_to,
              NEW.organization_person_type,NEW.prior_fiscal_year_turnover,
              NEW.gst_tds_notified_deductor,NEW.tan,NEW.evidence_attachment_id,
              NEW.verified_at,NEW.verified_by_membership_id,NEW.created_at,NEW.created_by_membership_id)
          IS DISTINCT FROM
          ROW(OLD.org_id,OLD.id,OLD.fiscal_year_start_year,OLD.effective_from,OLD.effective_to,
              OLD.organization_person_type,OLD.prior_fiscal_year_turnover,
              OLD.gst_tds_notified_deductor,OLD.tan,OLD.evidence_attachment_id,
              OLD.verified_at,OLD.verified_by_membership_id,OLD.created_at,OLD.created_by_membership_id) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='fiscal tax facts are immutable except command-scoped supersession';
    END IF;
    RETURN NEW;
END
''',
        ),
        _trigger(
            "organization_fiscal_tax_facts_command_guard_ct",
            "INSERT OR UPDATE OR DELETE",
            "tax.organization_fiscal_tax_facts",
            "guard_organization_fiscal_tax_fact",
        ),
        *_function(
            '"verify_organization_fiscal_tax_fact"(organization_id uuid, fact_id uuid, actor_id uuid, fiscal_year_start_year smallint, organization_person_type varchar, prior_fiscal_year_turnover numeric, gst_tds_notified_deductor boolean, tan varchar, evidence_attachment_id uuid, key_hash bytea, request_hash bytea, expires_at timestamptz)',
            "uuid",
            f'''
DECLARE evidence core.attachments%ROWTYPE; prior tax.organization_fiscal_tax_facts%ROWTYPE;
        maker_id uuid; claim_id uuid; replay_id uuid;
BEGIN
    PERFORM "{SCHEMA}"."assert_context"(
      organization_id,actor_id,'tax.registration.manage',NULL::uuid);
    SELECT p_claim_id,p_replay_resource_id INTO claim_id,replay_id FROM "{SCHEMA}"."claim"(
      organization_id,actor_id,'tax.organization_fiscal_tax_fact.verify',key_hash,request_hash,expires_at);
    IF replay_id IS NOT NULL THEN RETURN replay_id; END IF;

    PERFORM 1 FROM core.organizations organization
     WHERE organization.id=organization_id AND organization.status='active' FOR SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='organization must be active';
    END IF;
    SELECT * INTO evidence FROM core.attachments
     WHERE org_id=organization_id AND id=evidence_attachment_id FOR SHARE;
    maker_id:=evidence.created_by_membership_id;
    IF evidence.id IS NULL OR evidence.status NOT IN ('verified','retained')
       OR evidence.verified_at IS NULL OR maker_id IS NULL OR maker_id=actor_id
       OR NOT EXISTS (SELECT 1 FROM core.memberships maker
                       WHERE maker.org_id=organization_id AND maker.id=maker_id
                         AND maker.status='active')
       OR NOT EXISTS (
          SELECT 1 FROM core.access_grants grant_row
          JOIN core.roles role ON role.org_id=grant_row.org_id AND role.id=grant_row.role_id
          JOIN core.role_permissions role_permission
            ON role_permission.org_id=role.org_id AND role_permission.role_id=role.id
          JOIN core.permissions permission ON permission.code=role_permission.permission_code
         WHERE grant_row.org_id=organization_id AND grant_row.membership_id=maker_id
           AND grant_row.status='active' AND grant_row.valid_from_at<=pg_catalog.transaction_timestamp()
           AND (grant_row.expires_at IS NULL OR grant_row.expires_at>pg_catalog.transaction_timestamp())
           AND role.status='active' AND permission.status='active'
           AND permission.code='tax.registration.manage'
           AND grant_row.scope_kind='organization'
       ) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='fact requires verified retained evidence from a distinct active maker';
    END IF;
    IF fiscal_year_start_year NOT BETWEEN 2000 AND 9999
       OR prior_fiscal_year_turnover<0
       OR organization_person_type NOT IN ('individual','huf','company','firm','llp','trust','aop','boi','government','local_authority','artificial_juridical_person','other')
       OR (tan IS NOT NULL AND tan !~ '^[A-Z]{{4}}[0-9]{{5}}[A-Z]$') THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid typed organization fiscal tax fact';
    END IF;
    SELECT * INTO prior FROM tax.organization_fiscal_tax_facts fact
     WHERE fact.org_id=organization_id
       AND fact.fiscal_year_start_year=fiscal_year_start_year
       AND fact.status='active' FOR UPDATE;
    IF prior.id IS NOT NULL THEN
        INSERT INTO "{SCHEMA}"."command_scopes" VALUES
          (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),
           'organization_fiscal_tax_fact_supersede',organization_id,prior.id);
        UPDATE tax.organization_fiscal_tax_facts SET status='superseded'
         WHERE org_id=organization_id AND id=prior.id;
        DELETE FROM "{SCHEMA}"."command_scopes" WHERE backend_pid=pg_catalog.pg_backend_pid()
          AND transaction_id=pg_catalog.txid_current()
          AND scope='organization_fiscal_tax_fact_supersede'
          AND org_id=organization_id AND entity_id=prior.id;
    END IF;
    INSERT INTO "{SCHEMA}"."command_scopes" VALUES
      (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),
       'organization_fiscal_tax_fact_insert',organization_id,fact_id);
    INSERT INTO tax.organization_fiscal_tax_facts(
      org_id,id,fiscal_year_start_year,effective_from,effective_to,
      organization_person_type,prior_fiscal_year_turnover,gst_tds_notified_deductor,
      tan,evidence_attachment_id,verified_at,verified_by_membership_id,status,
      created_by_membership_id)
    VALUES(organization_id,fact_id,fiscal_year_start_year,
      pg_catalog.make_date(fiscal_year_start_year,4,1),
      pg_catalog.make_date(fiscal_year_start_year+1,3,31),organization_person_type,
      prior_fiscal_year_turnover,gst_tds_notified_deductor,tan,evidence_attachment_id,
      pg_catalog.transaction_timestamp(),actor_id,'active',maker_id);
    DELETE FROM "{SCHEMA}"."command_scopes" WHERE backend_pid=pg_catalog.pg_backend_pid()
      AND transaction_id=pg_catalog.txid_current()
      AND scope='organization_fiscal_tax_fact_insert'
      AND org_id=organization_id AND entity_id=fact_id;
    PERFORM "{SCHEMA}"."finish_claim"(
      organization_id,claim_id,'tax.organization_fiscal_tax_facts',fact_id);
    RETURN fact_id;
END
''',
            runtime=True,
        ),
    ]


def _definitions() -> dict[str, list[str]]:
    return {
        "compliance.controlled_substance_entries:controlled_substance_entries_cross_row_guard": _controlled_substance_definition(),
        "compliance.destructions:destructions_cross_row_guard": _destruction_definition(),
        "compliance.recall_batches:recall_batches_cross_row_guard": _recall_definition(),
        "compliance.storage_rule_versions:storage_rule_versions_effective_guard": _storage_rule_definition(),
        "compliance.temperature_readings:temperature_readings_cross_row_guard": _temperature_definition(),
        "finance.expense_claim_lines:expense_claim_lines_cross_row_guard": _expense_line_definition(),
        "finance.expense_claims:expense_claims_cross_row_guard": _expense_definition(),
        "tax.organization_fiscal_tax_facts:organization_fiscal_tax_facts_evidence_guard": _organization_fiscal_tax_fact_definition(),
        "tax.withholdings:withholdings_cross_row_guard": _withholding_definition(),
        "tax.withholding_basis_lines:withholding_basis_lines_source_guard": _withholding_basis_definition(),
        "tax.withholding_deposits:withholding_deposits_cross_row_guard": _withholding_deposit_definition(),
        "tax.withholding_deposit_lines:withholding_deposit_lines_cross_row_guard": _withholding_deposit_line_definition(),
        "tax.withholding_statements:withholding_statements_cross_row_guard": _withholding_statement_definition(),
        "tax.withholding_statement_lines:withholding_statement_lines_cross_row_guard": _withholding_statement_line_definition(),
        "tax.withholding_certificates:withholding_certificates_cross_row_guard": _withholding_certificate_definition(),
        "tax.withholding_certificate_lines:withholding_certificate_lines_cross_row_guard": _withholding_certificate_line_definition(),
    }


BLOCKED_REASONS = {
    "compliance.controlled_movement_rule_versions:controlled_movement_rule_versions_release_authority": "The isolated regulatory importer owns exact official controlled-movement rule releases.",
    "finance.adjustment_note_lines:adjustment_note_lines_cross_row_guard": "The canonical Decimal engine is not database-verifiable and no immutable calculation proof binds caller totals.",
    "finance.adjustment_notes:adjustment_notes_cross_row_guard": "Exact note and tax totals cannot be certified until the canonical Decimal result has reviewed database-verifiable provenance.",
    "tax.documents:documents_cross_row_guard": "No database-verifiable canonical Decimal proof binds immutable source-line snapshots and calculation rules to the tax document.",
    "tax.einvoices:einvoices_cross_row_guard": "IRP response authenticity, signed QR verification, cancellation, and regeneration require a configured external provider and cryptographic verification boundary.",
    "tax.einvoice_rule_versions:einvoice_rule_versions_release_authority": "The isolated regulatory importer owns exact official e-invoice rule releases.",
    "tax.eway_bills:eway_bills_cross_row_guard": "E-way authority response authenticity, cancellation, and regeneration require a configured external provider and cryptographic verification boundary.",
    "tax.gst_adjustment_rule_versions:gst_adjustment_rule_versions_release_authority": "The isolated regulatory importer owns exact official GST adjustment rule releases.",
    "tax.registration_branches:registration_branches_effective_guard": "A dedicated tax registration association command and posting/provider lookup must own this boundary.",
    "tax.withholding_rule_versions:withholding_rule_versions_release_authority": "The typed rule table requires an exact-set regulated withholding_rules importer before it can be trusted.",
}


def generated_artifacts() -> tuple[str, str]:
    invariants = _invariants()
    source = json.loads(SOURCE_MANIFEST.read_text(encoding="utf-8"))
    prior = set(source["blocked_invariants"])
    definitions = _definitions()
    if set(definitions) | set(BLOCKED_REASONS) != prior or set(definitions) & set(BLOCKED_REASONS):
        raise ContractError("compliance command disposition must exactly partition finance command blockers")
    entries: list[dict[str, Any]] = []
    for key in sorted(definitions):
        invariant = invariants[key]
        entries.append({
            "table": invariant["table"],
            "invariant": invariant["invariant"],
            "enforcement": invariant["enforcement"],
            "requirement_sha256": hashlib.sha256(invariant["rule"].encode()).hexdigest(),
            "reviewed": True,
            "statements": definitions[key],
        })
    mapping = {"mapping_version": "1.0.0", "enforcements": entries, "platform_enforcements": []}
    mapping_text = json.dumps(mapping, indent=2, sort_keys=True) + "\n"
    manifest = {
        "manifest_version": "1.0.0",
        "postgresql": "15+",
        "source_manifest": "../commands_finance/finance-command-manifest.json",
        "mapping_file": MAPPING_PATH.name,
        "mapping_sha256": hashlib.sha256(mapping_text.encode()).hexdigest(),
        "resolved_count": len(definitions),
        "resolved_invariants": sorted(definitions),
        "blocked_count": len(BLOCKED_REASONS),
        "blocked_invariants": {key: {"reason": BLOCKED_REASONS[key]} for key in sorted(BLOCKED_REASONS)},
        "security": {
            "function_schema": SCHEMA,
            "fixed_empty_search_path": True,
            "dynamic_sql": False,
            "private_command_scopes": True,
            "runtime_commands": [
                "add_recall_batch",
                "activate_storage_rule",
                "approve_destruction",
                "approve_expense_claim",
                "ingest_temperature_reading",
                "post_destruction",
                "post_expense_claim",
                "post_recall_inventory_action",
                "record_controlled_substance_entry",
                "submit_expense_claim",
                "verify_organization_fiscal_tax_fact",
                "post_withholding",
                "reverse_withholding",
                "post_withholding_deposit",
                "file_withholding_statement",
                "import_withholding_certificate",
            ],
        },
        "destruction_posting": {
            "status": "blocked_fail_closed",
            "required_before_enablement": [
                "typed_biomedical_waste_or_pollution_control_authorization",
                "authorized_facility_and_manifest_chain",
                "atomic_inventory_write_off_journal_and_accounting_event",
                "section_17_5_h_itc_reversal_or_proven_zero_input_tax_lineage",
                "controlled_and_recall_register_companions_when_applicable",
            ],
        },
        "blocker_delta": {"before": len(prior), "resolved": len(definitions), "after": len(BLOCKED_REASONS)},
    }
    return mapping_text, json.dumps(manifest, indent=2, sort_keys=True) + "\n"


def main() -> int:
    mapping, manifest = generated_artifacts()
    MAPPING_PATH.write_text(mapping, encoding="utf-8")
    MANIFEST_PATH.write_text(manifest, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
