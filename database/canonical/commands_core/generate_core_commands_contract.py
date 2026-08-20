#!/usr/bin/env python3
"""Generate reviewed core and party command boundaries.

This fragment uses only canonical facts already present in PostgreSQL.  It
does not treat opaque agent payloads as typed authorization evidence and does
not invent regulatory reference data.
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
CANONICAL_ROOT = ROOT.parent
REPO_ROOT = CANONICAL_ROOT.parents[1]
DOMAINS_ROOT = CANONICAL_ROOT / "domains"
BASELINE_PATH = REPO_ROOT / "backend" / "scripts" / "generate_canonical_baseline.py"
SOURCE_MANIFEST = CANONICAL_ROOT / "invariants_agent" / "invariants-agent-manifest.json"
MAPPING_PATH = ROOT / "baseline-core-command-enforcements.json"
MANIFEST_PATH = ROOT / "core-commands-manifest.json"
SCHEMA = "erp_core_commands"


class ContractError(RuntimeError):
    """The reviewed command contract no longer matches the catalog."""


def _load_baseline():
    spec = importlib.util.spec_from_file_location("canonical_baseline_for_core_commands", BASELINE_PATH)
    if spec is None or spec.loader is None:
        raise ContractError("cannot import canonical baseline generator")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _catalog_hash() -> str:
    catalog = _load_baseline().load_and_validate_catalog(DOMAINS_ROOT)
    payload = {"contract": catalog.contract, "tables": sorted(catalog.tables, key=lambda row: row["name"])}
    canonical = json.dumps(payload, ensure_ascii=True, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(canonical.encode()).hexdigest()


def _invariants() -> dict[str, dict[str, str]]:
    found: dict[str, dict[str, str]] = {}
    for path in sorted(DOMAINS_ROOT.glob("*.json")):
        if path.name.startswith("_"):
            continue
        document = json.loads(path.read_text(encoding="utf-8"))
        for table in document["tables"]:
            for invariant in table.get("cross_row_invariants", []):
                key = f"{table['name']}:{invariant['name']}"
                found[key] = {
                    "table": table["name"],
                    "invariant": invariant["name"],
                    "enforcement": invariant["enforcement"],
                    "rule": invariant["rule"],
                }
    return found


def _function(
    signature: str,
    returns: str,
    body: str,
    *,
    security_definer: bool = True,
    runtime_callable: bool = False,
) -> list[str]:
    security = "DEFINER" if security_definer else "INVOKER"
    statements = [
        f'''CREATE FUNCTION "{SCHEMA}".{signature}
RETURNS {returns}
LANGUAGE plpgsql
SECURITY {security}
SET search_path = ''
AS $function$
#variable_conflict use_variable
{body.strip()}
$function$''',
        f'ALTER FUNCTION "{SCHEMA}".{signature} OWNER TO "erp_migration_owner"',
        f'REVOKE ALL ON FUNCTION "{SCHEMA}".{signature} FROM PUBLIC, "erp_app", "erp_runtime"',
    ]
    if runtime_callable:
        statements.append(f'GRANT EXECUTE ON FUNCTION "{SCHEMA}".{signature} TO "erp_app"')
    return statements


def _trigger(name: str, events: str, table: str, function: str) -> str:
    schema, relation = table.split(".")
    return (
        f'CREATE TRIGGER "{name}" BEFORE {events} ON "{schema}"."{relation}" '
        f'FOR EACH ROW EXECUTE FUNCTION "{SCHEMA}"."{function}"()'
    )


def _setup() -> list[str]:
    return [
        f'CREATE SCHEMA "{SCHEMA}" AUTHORIZATION "erp_migration_owner"',
        f'REVOKE ALL ON SCHEMA "{SCHEMA}" FROM PUBLIC, "erp_app", "erp_runtime"',
        f'GRANT USAGE ON SCHEMA "{SCHEMA}" TO "erp_app"',
        f'''CREATE TABLE "{SCHEMA}"."command_scopes" (
    backend_pid integer NOT NULL,
    transaction_id bigint NOT NULL,
    scope text NOT NULL,
    org_id uuid NOT NULL,
    entity_id uuid NOT NULL,
    PRIMARY KEY (backend_pid, transaction_id, scope, org_id, entity_id)
)''',
        f'ALTER TABLE "{SCHEMA}"."command_scopes" OWNER TO "erp_migration_owner"',
        f'REVOKE ALL ON TABLE "{SCHEMA}"."command_scopes" FROM PUBLIC, "erp_app", "erp_runtime"',
        *_function(
            '"scope_active"(requested_scope text, organization_id uuid, target_id uuid)',
            "boolean",
            f'''
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM "{SCHEMA}"."command_scopes" AS token
         WHERE token.backend_pid=pg_catalog.pg_backend_pid()
           AND token.transaction_id=pg_catalog.txid_current()
           AND token.scope=requested_scope
           AND token.org_id=organization_id
           AND token.entity_id=target_id
    );
END
''',
        ),
        *_function(
            '"assert_context"(organization_id uuid, permission_code text, branch_id uuid)',
            "uuid",
            '''
DECLARE actor_id uuid;
BEGIN
    actor_id := erp_security.current_membership_id();
    IF organization_id IS DISTINCT FROM erp_security.current_org_id()
       OR actor_id IS NULL
       OR NULLIF(pg_catalog.current_setting('app.request_id', true), '')::uuid IS NULL
       OR (permission_code IS NOT NULL AND NOT erp_security.has_permission(permission_code,branch_id)) THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='core command context, request id, or permission is invalid';
    END IF;
    RETURN actor_id;
END
''',
        ),
        *_function(
            '"claim"(organization_id uuid, actor_id uuid, operation_name varchar, key_hash bytea, request_document jsonb, expires_at timestamptz)',
            "core.idempotency_keys",
            '''
DECLARE claim core.idempotency_keys%ROWTYPE; request_hash bytea;
BEGIN
    IF pg_catalog.octet_length(key_hash)<>32 OR expires_at<=pg_catalog.transaction_timestamp() THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid idempotency key or expiry';
    END IF;
    request_hash := extensions.digest(pg_catalog.convert_to(request_document::text,'UTF8'),'sha256');
    claim := core.claim_idempotency_key(
        organization_id,actor_id,operation_name,key_hash,request_hash,expires_at
    );
    IF claim.status='succeeded' THEN RETURN claim; END IF;
    IF claim.status<>'claimed' OR claim.expires_at<=pg_catalog.transaction_timestamp() THEN
        RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='idempotency claim is not executable';
    END IF;
    RETURN claim;
END
''',
        ),
        *_function(
            '"finish_claim"(organization_id uuid, claim_id uuid, resource_type varchar, resource_id uuid, response_document jsonb)',
            "void",
            '''
DECLARE response_body bytea;
BEGIN
    response_body := pg_catalog.convert_to(response_document::text,'UTF8');
    UPDATE core.idempotency_keys
       SET status='succeeded',resource_type=resource_type,resource_id=resource_id,
           response_status=200,response_media_type='application/json',response_body=response_body,
           response_hash=extensions.digest(response_body,'sha256'),
           completed_at=pg_catalog.transaction_timestamp()
     WHERE org_id=organization_id AND id=claim_id AND status='claimed';
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='idempotency claim could not be completed exactly once';
    END IF;
END
''',
        ),
    ]


def _access_grant_definition() -> list[str]:
    return [
        *_setup(),
        *_function(
            '"guard_access_grant"()',
            "trigger",
            '''
BEGIN
    IF TG_OP='DELETE' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='access-grant evidence cannot be deleted';
    END IF;
    IF TG_OP='INSERT' AND NEW.status<>'active' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='new access grant must start active';
    END IF;
    IF TG_OP='INSERT' AND NEW.expires_at IS NOT NULL
       AND NEW.expires_at<=pg_catalog.transaction_timestamp() THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='new access grant validity window has already ended';
    END IF;
    IF TG_OP='INSERT' AND (NEW.revoked_at IS NOT NULL OR NEW.revoked_by_membership_id IS NOT NULL
       OR NEW.revocation_reason IS NOT NULL) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='active access grant cannot carry revocation evidence';
    END IF;
    IF TG_OP='UPDATE' THEN
        IF OLD.status IN ('revoked','expired') AND NEW IS DISTINCT FROM OLD THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='terminal access grant is immutable';
        END IF;
        IF OLD.status='active' AND NEW.status NOT IN ('active','revoked','expired') THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='invalid access-grant lifecycle transition';
        END IF;
        IF ROW(NEW.org_id,NEW.id,NEW.membership_id,NEW.role_id,NEW.scope_kind,NEW.branch_id,
               NEW.valid_from_at,NEW.expires_at,NEW.created_at,NEW.created_by_membership_id)
           IS DISTINCT FROM
           ROW(OLD.org_id,OLD.id,OLD.membership_id,OLD.role_id,OLD.scope_kind,OLD.branch_id,
               OLD.valid_from_at,OLD.expires_at,OLD.created_at,OLD.created_by_membership_id) THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='access-grant identity and validity window are immutable';
        END IF;
        IF NEW.status='expired' AND (NEW.expires_at IS NULL OR NEW.expires_at>pg_catalog.transaction_timestamp()) THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='access grant cannot expire before its validity window ends';
        END IF;
        IF NEW.status<>'revoked' AND (NEW.revoked_at IS NOT NULL OR NEW.revoked_by_membership_id IS NOT NULL
           OR NEW.revocation_reason IS NOT NULL) THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='non-revoked access grant cannot carry revocation evidence';
        END IF;
        IF NEW.status='revoked' AND (NEW.revoked_at<NEW.valid_from_at
           OR NEW.revoked_at>pg_catalog.transaction_timestamp()) THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='access-grant revocation timestamp is invalid';
        END IF;
        IF NEW.row_version<>OLD.row_version+1 THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='access-grant row version must advance exactly once';
        END IF;
    END IF;
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END
''',
            security_definer=False,
        ),
        _trigger("access_grants_lifecycle_guard", "INSERT OR UPDATE OR DELETE", "core.access_grants", "guard_access_grant"),
    ]


def _document_sequence_definition() -> list[str]:
    return [
        *_function(
            '"guard_document_sequence"()',
            "trigger",
            f'''
BEGIN
    IF TG_OP='DELETE' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='document sequences cannot be deleted';
    END IF;
    IF TG_OP='INSERT' THEN
        IF NEW.status<>'active' THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='new document sequence must start active';
        END IF;
        RETURN NEW;
    END IF;
    IF TG_OP='UPDATE' THEN
        IF OLD.status='closed' AND NEW IS DISTINCT FROM OLD THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='closed document sequence is immutable';
        END IF;
        IF OLD.status='active' AND NEW.status NOT IN ('active','closed') THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='invalid document-sequence lifecycle transition';
        END IF;
        IF ROW(NEW.org_id,NEW.id,NEW.branch_id,NEW.document_type,NEW.fiscal_year_start,
               NEW.prefix,NEW.suffix,NEW.padding,NEW.created_at,NEW.created_by_membership_id)
           IS DISTINCT FROM
           ROW(OLD.org_id,OLD.id,OLD.branch_id,OLD.document_type,OLD.fiscal_year_start,
               OLD.prefix,OLD.suffix,OLD.padding,OLD.created_at,OLD.created_by_membership_id) THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='document-sequence identity and format are immutable';
        END IF;
        IF (NEW.next_value IS DISTINCT FROM OLD.next_value
            OR NEW.last_allocated_at IS DISTINCT FROM OLD.last_allocated_at)
           AND NOT "{SCHEMA}"."scope_active"('sequence_allocate',NEW.org_id,NEW.id) THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='document numbers allocate only through the canonical command';
        END IF;
        IF NEW.next_value IS DISTINCT FROM OLD.next_value AND NEW.next_value<>OLD.next_value+1 THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='document sequence must advance exactly once';
        END IF;
        IF NEW.row_version<>OLD.row_version+1 THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='document-sequence row version must advance exactly once';
        END IF;
    END IF;
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END
''',
        ),
        _trigger("document_sequences_command_guard", "INSERT OR UPDATE OR DELETE", "core.document_sequences", "guard_document_sequence"),
        *_function(
            '"allocate_document_number"(organization_id uuid, sequence_id uuid, idempotency_key_hash bytea, idempotency_expires_at timestamptz)',
            "text",
            f'''
DECLARE actor_id uuid; sequence core.document_sequences%ROWTYPE; claim core.idempotency_keys%ROWTYPE;
        request_document jsonb; response_document jsonb; allocated_number text;
BEGIN
    actor_id := "{SCHEMA}"."assert_context"(organization_id,NULL,NULL::uuid);
    SELECT * INTO sequence FROM core.document_sequences
     WHERE org_id=organization_id AND id=sequence_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='document sequence not found'; END IF;
    PERFORM "{SCHEMA}"."assert_context"(organization_id,'internal.sequence.allocate',sequence.branch_id);
    request_document := pg_catalog.jsonb_build_object(
        'operation','core.document_sequence.allocate','organization_id',organization_id,'sequence_id',sequence_id
    );
    claim := "{SCHEMA}"."claim"(organization_id,actor_id,'core.document_sequence.allocate',
        idempotency_key_hash,request_document,idempotency_expires_at);
    IF claim.status='succeeded' THEN
        RETURN (pg_catalog.convert_from(claim.response_body,'UTF8')::jsonb->>'document_number');
    END IF;
    IF sequence.status<>'active' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='document sequence is not active';
    END IF;
    allocated_number := sequence.prefix || pg_catalog.lpad(
        sequence.next_value::text,
        pg_catalog.greatest(sequence.padding::integer,pg_catalog.length(sequence.next_value::text)),
        '0'
    ) || sequence.suffix;
    INSERT INTO "{SCHEMA}"."command_scopes" VALUES
      (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'sequence_allocate',organization_id,sequence_id);
    UPDATE core.document_sequences
       SET next_value=next_value+1,last_allocated_at=pg_catalog.transaction_timestamp(),
           updated_at=pg_catalog.transaction_timestamp(),updated_by_membership_id=actor_id,row_version=row_version+1
     WHERE org_id=organization_id AND id=sequence_id AND status='active';
    DELETE FROM "{SCHEMA}"."command_scopes" WHERE backend_pid=pg_catalog.pg_backend_pid()
      AND transaction_id=pg_catalog.txid_current() AND scope='sequence_allocate'
      AND org_id=organization_id AND entity_id=sequence_id;
    response_document := pg_catalog.jsonb_build_object(
        'document_number',allocated_number,'sequence_id',sequence_id,'allocated_value',sequence.next_value
    );
    PERFORM "{SCHEMA}"."finish_claim"(organization_id,claim.id,'core.document_sequences',sequence_id,response_document);
    RETURN allocated_number;
END
''',
            runtime_callable=True,
        ),
    ]


def _settings_definition() -> list[str]:
    return [
        *_function(
            '"guard_setting"()',
            "trigger",
            f'''
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='setting versions cannot be deleted'; END IF;
    IF TG_OP='INSERT' THEN
        IF NEW.status<>'active' THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='new setting version must start active';
        END IF;
        RETURN NEW;
    END IF;
    IF TG_OP='UPDATE' THEN
        IF OLD.status='retired' AND NEW IS DISTINCT FROM OLD THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='retired setting version is immutable';
        END IF;
        IF OLD.status='active' AND NEW.status NOT IN ('active','retired') THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='invalid setting lifecycle transition';
        END IF;
        IF ROW(NEW.org_id,NEW.id,NEW.scope_kind,NEW.branch_id,NEW.namespace,NEW.key,NEW.value_type,
               NEW.value_text,NEW.value_numeric,NEW.value_boolean,NEW.value_date,NEW.value_timestamptz,
               NEW.created_at,NEW.created_by_membership_id)
           IS DISTINCT FROM
           ROW(OLD.org_id,OLD.id,OLD.scope_kind,OLD.branch_id,OLD.namespace,OLD.key,OLD.value_type,
               OLD.value_text,OLD.value_numeric,OLD.value_boolean,OLD.value_date,OLD.value_timestamptz,
               OLD.created_at,OLD.created_by_membership_id) THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='setting values are replaced by a new version, never updated in place';
        END IF;
        IF NEW.status='retired' AND OLD.status='active'
           AND NOT "{SCHEMA}"."scope_active"('setting_replace',NEW.org_id,NEW.id) THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='setting retirement requires atomic replacement command lineage';
        END IF;
        IF NEW.row_version<>OLD.row_version+1 THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='setting row version must advance exactly once';
        END IF;
    END IF;
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END
''',
        ),
        _trigger("settings_version_guard", "INSERT OR UPDATE OR DELETE", "core.settings", "guard_setting"),
        *_function(
            '"replace_setting"(organization_id uuid, setting_id uuid, replacement_id uuid, expected_row_version bigint, value_type text, value_text text, value_numeric numeric, value_boolean boolean, value_date date, value_timestamptz timestamptz, idempotency_key_hash bytea, idempotency_expires_at timestamptz)',
            "uuid",
            f'''
DECLARE actor_id uuid; source core.settings%ROWTYPE; claim core.idempotency_keys%ROWTYPE;
        request_document jsonb; response_document jsonb;
BEGIN
    actor_id := "{SCHEMA}"."assert_context"(organization_id,NULL,NULL::uuid);
    SELECT * INTO source FROM core.settings WHERE org_id=organization_id AND id=setting_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='setting version not found'; END IF;
    PERFORM "{SCHEMA}"."assert_context"(organization_id,'core.settings.manage',source.branch_id);
    request_document := pg_catalog.jsonb_build_object(
      'operation','core.setting.replace','organization_id',organization_id,'setting_id',setting_id,
      'replacement_id',replacement_id,'expected_row_version',expected_row_version,'value_type',value_type,
      'value_text',value_text,'value_numeric',value_numeric,'value_boolean',value_boolean,
      'value_date',value_date,'value_timestamptz',value_timestamptz
    );
    claim := "{SCHEMA}"."claim"(organization_id,actor_id,'core.setting.replace',idempotency_key_hash,
      request_document,idempotency_expires_at);
    IF claim.status='succeeded' THEN RETURN claim.resource_id; END IF;
    IF source.status<>'active' OR expected_row_version IS NULL
       OR source.row_version<>expected_row_version OR replacement_id=setting_id
       OR pg_catalog.num_nonnulls(value_text,value_numeric,value_boolean,value_date,value_timestamptz)<>1
       OR NOT ((value_type='text')=(value_text IS NOT NULL)
           AND (value_type='numeric')=(value_numeric IS NOT NULL)
           AND (value_type='boolean')=(value_boolean IS NOT NULL)
           AND (value_type='date')=(value_date IS NOT NULL)
           AND (value_type='timestamptz')=(value_timestamptz IS NOT NULL)) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='setting replacement version or typed value is invalid';
    END IF;
    INSERT INTO "{SCHEMA}"."command_scopes" VALUES
      (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'setting_replace',organization_id,setting_id);
    UPDATE core.settings SET status='retired',updated_at=pg_catalog.transaction_timestamp(),
      updated_by_membership_id=actor_id,row_version=row_version+1
      WHERE org_id=organization_id AND id=setting_id AND status='active' AND row_version=expected_row_version;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='setting version changed before replacement';
    END IF;
    INSERT INTO core.settings(org_id,id,scope_kind,branch_id,namespace,key,value_type,value_text,
      value_numeric,value_boolean,value_date,value_timestamptz,created_by_membership_id,
      updated_by_membership_id)
    VALUES(organization_id,replacement_id,source.scope_kind,source.branch_id,source.namespace,source.key,
      value_type,value_text,value_numeric,value_boolean,value_date,value_timestamptz,actor_id,actor_id);
    DELETE FROM "{SCHEMA}"."command_scopes" WHERE backend_pid=pg_catalog.pg_backend_pid()
      AND transaction_id=pg_catalog.txid_current() AND scope='setting_replace'
      AND org_id=organization_id AND entity_id=setting_id;
    response_document := pg_catalog.jsonb_build_object('setting_id',replacement_id,'replaces_setting_id',setting_id);
    PERFORM "{SCHEMA}"."finish_claim"(organization_id,claim.id,'core.settings',replacement_id,response_document);
    RETURN replacement_id;
END
''',
            runtime_callable=True,
        ),
    ]


def _party_definition() -> list[str]:
    return [
        *_function(
            '"guard_party"()',
            "trigger",
            '''
DECLARE identity_used boolean;
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='party identity cannot be deleted'; END IF;
    IF TG_OP='INSERT' THEN
        IF NEW.status<>'draft' THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='new party must start draft';
        END IF;
        RETURN NEW;
    END IF;
    IF OLD.status='draft' AND NEW.status NOT IN ('draft','active','archived')
       OR OLD.status='active' AND NEW.status NOT IN ('active','blocked','archived')
       OR OLD.status='blocked' AND NEW.status NOT IN ('blocked','active','archived')
       OR OLD.status='archived' AND NEW.status IS DISTINCT FROM 'archived' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='invalid party lifecycle transition';
    END IF;
    IF OLD.status='archived' AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='archived party is immutable';
    END IF;
    IF ROW(NEW.party_kind,NEW.legal_name,NEW.trade_name,NEW.pan,NEW.tax_residency_status,
           NEW.tax_person_type,NEW.pan_verification_status,NEW.tax_profile_evidence_attachment_id,
           NEW.tax_profile_verified_at,NEW.date_of_birth)
       IS DISTINCT FROM ROW(OLD.party_kind,OLD.legal_name,OLD.trade_name,OLD.pan,OLD.tax_residency_status,
           OLD.tax_person_type,OLD.pan_verification_status,OLD.tax_profile_evidence_attachment_id,
           OLD.tax_profile_verified_at,OLD.date_of_birth) THEN
        SELECT EXISTS (
          SELECT 1 FROM sales.invoices invoice
          JOIN parties.customer_accounts account ON account.org_id=invoice.org_id AND account.id=invoice.customer_account_id
          WHERE account.org_id=OLD.org_id AND account.party_id=OLD.id AND invoice.status IN ('posted','reversed')
          UNION ALL
          SELECT 1 FROM procurement.supplier_invoices invoice
          JOIN parties.supplier_accounts account ON account.org_id=invoice.org_id AND account.id=invoice.supplier_account_id
          WHERE account.org_id=OLD.org_id AND account.party_id=OLD.id AND invoice.status IN ('posted','reversed')
          UNION ALL
          SELECT 1 FROM tax.documents document
          WHERE document.org_id=OLD.org_id AND document.counterparty_party_id=OLD.id
          UNION ALL
          SELECT 1 FROM tax.withholdings withholding
          WHERE withholding.org_id=OLD.org_id AND withholding.counterparty_party_id=OLD.id
        ) INTO identity_used;
        IF identity_used AND NOT "erp_core_commands"."scope_active"('privacy_anonymize',OLD.org_id,OLD.id) THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='party identity used by a posted document is immutable; create a corrected party version';
        END IF;
    END IF;
    IF NEW.row_version<>OLD.row_version+1 THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='party row version must advance exactly once';
    END IF;
    RETURN NEW;
END
''',
        ),
        _trigger("parties_lifecycle_identity_guard", "INSERT OR UPDATE OR DELETE", "parties.parties", "guard_party"),
    ]


def _customer_definition() -> list[str]:
    return [
        *_function(
            '"guard_customer_account"()',
            "trigger",
            f'''
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='customer account cannot be deleted'; END IF;
    IF TG_OP='INSERT' THEN
        IF NEW.status<>'active' THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='new customer account must start active';
        END IF;
        RETURN NEW;
    END IF;
    IF OLD.status='active' AND NEW.status NOT IN ('active','on_hold','closed')
       OR OLD.status='on_hold' AND NEW.status NOT IN ('on_hold','active','closed')
       OR OLD.status='closed' AND NEW.status IS DISTINCT FROM 'closed' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='invalid customer-account lifecycle transition';
    END IF;
    IF OLD.status='closed' AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='closed customer account is immutable';
    END IF;
    IF ROW(NEW.credit_limit,NEW.credit_days) IS DISTINCT FROM ROW(OLD.credit_limit,OLD.credit_days)
       AND NOT "{SCHEMA}"."scope_active"('customer_terms',NEW.org_id,NEW.id) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='customer credit terms require the audited canonical command';
    END IF;
    IF NEW.row_version<>OLD.row_version+1 THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='customer-account row version must advance exactly once';
    END IF;
    RETURN NEW;
END
''',
        ),
        _trigger("customer_accounts_lifecycle_guard", "INSERT OR UPDATE OR DELETE", "parties.customer_accounts", "guard_customer_account"),
        *_function(
            '"change_customer_terms"(organization_id uuid, customer_account_id uuid, expected_row_version bigint, credit_limit numeric, credit_days integer, idempotency_key_hash bytea, idempotency_expires_at timestamptz)',
            "uuid",
            f'''
DECLARE actor_id uuid; account parties.customer_accounts%ROWTYPE; claim core.idempotency_keys%ROWTYPE; request_document jsonb;
BEGIN
    actor_id := "{SCHEMA}"."assert_context"(organization_id,'parties.customer.manage',NULL::uuid);
    request_document := pg_catalog.jsonb_build_object('operation','parties.customer_terms.change',
      'organization_id',organization_id,'customer_account_id',customer_account_id,
      'expected_row_version',expected_row_version,'credit_limit',credit_limit,'credit_days',credit_days);
    claim := "{SCHEMA}"."claim"(organization_id,actor_id,'parties.customer_terms.change',
      idempotency_key_hash,request_document,idempotency_expires_at);
    IF claim.status='succeeded' THEN RETURN claim.resource_id; END IF;
    SELECT * INTO account FROM parties.customer_accounts
      WHERE org_id=organization_id AND id=customer_account_id FOR UPDATE;
    IF NOT FOUND OR account.status='closed' OR expected_row_version IS NULL
       OR account.row_version<>expected_row_version OR credit_limit IS NULL OR credit_days IS NULL
       OR credit_limit<0 OR credit_days NOT BETWEEN 0 AND 3650 THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='customer account or requested credit terms are invalid';
    END IF;
    INSERT INTO "{SCHEMA}"."command_scopes" VALUES
      (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'customer_terms',organization_id,customer_account_id);
    UPDATE parties.customer_accounts SET credit_limit=change_customer_terms.credit_limit,
      credit_days=change_customer_terms.credit_days,updated_at=pg_catalog.transaction_timestamp(),
      updated_by_membership_id=actor_id,row_version=row_version+1
      WHERE org_id=organization_id AND id=customer_account_id AND row_version=expected_row_version;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='customer account changed before term update';
    END IF;
    DELETE FROM "{SCHEMA}"."command_scopes" WHERE backend_pid=pg_catalog.pg_backend_pid()
      AND transaction_id=pg_catalog.txid_current() AND scope='customer_terms'
      AND org_id=organization_id AND entity_id=customer_account_id;
    PERFORM "{SCHEMA}"."finish_claim"(organization_id,claim.id,'parties.customer_accounts',customer_account_id,
      pg_catalog.jsonb_build_object('customer_account_id',customer_account_id,'row_version',expected_row_version+1));
    RETURN customer_account_id;
END
''',
            runtime_callable=True,
        ),
    ]


def _supplier_definition() -> list[str]:
    return [
        *_function(
            '"guard_supplier_account"()',
            "trigger",
            f'''
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier account cannot be deleted'; END IF;
    IF TG_OP='INSERT' THEN
        IF NEW.status<>'active' THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='new supplier account must start active';
        END IF;
        RETURN NEW;
    END IF;
    IF OLD.status='active' AND NEW.status NOT IN ('active','on_hold','closed')
       OR OLD.status='on_hold' AND NEW.status NOT IN ('on_hold','active','closed')
       OR OLD.status='closed' AND NEW.status IS DISTINCT FROM 'closed' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='invalid supplier-account lifecycle transition';
    END IF;
    IF OLD.status='closed' AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='closed supplier account is immutable';
    END IF;
    IF NEW.payment_days IS DISTINCT FROM OLD.payment_days
       AND NOT "{SCHEMA}"."scope_active"('supplier_terms',NEW.org_id,NEW.id) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier payment terms require the audited canonical command';
    END IF;
    IF NEW.row_version<>OLD.row_version+1 THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier-account row version must advance exactly once';
    END IF;
    RETURN NEW;
END
''',
        ),
        _trigger("supplier_accounts_lifecycle_guard", "INSERT OR UPDATE OR DELETE", "parties.supplier_accounts", "guard_supplier_account"),
        *_function(
            '"change_supplier_terms"(organization_id uuid, supplier_account_id uuid, expected_row_version bigint, payment_days integer, idempotency_key_hash bytea, idempotency_expires_at timestamptz)',
            "uuid",
            f'''
DECLARE actor_id uuid; account parties.supplier_accounts%ROWTYPE; claim core.idempotency_keys%ROWTYPE; request_document jsonb;
BEGIN
    actor_id := "{SCHEMA}"."assert_context"(organization_id,'parties.supplier.manage',NULL::uuid);
    request_document := pg_catalog.jsonb_build_object('operation','parties.supplier_terms.change',
      'organization_id',organization_id,'supplier_account_id',supplier_account_id,
      'expected_row_version',expected_row_version,'payment_days',payment_days);
    claim := "{SCHEMA}"."claim"(organization_id,actor_id,'parties.supplier_terms.change',
      idempotency_key_hash,request_document,idempotency_expires_at);
    IF claim.status='succeeded' THEN RETURN claim.resource_id; END IF;
    SELECT * INTO account FROM parties.supplier_accounts
      WHERE org_id=organization_id AND id=supplier_account_id FOR UPDATE;
    IF NOT FOUND OR account.status='closed' OR expected_row_version IS NULL
       OR account.row_version<>expected_row_version OR payment_days IS NULL
       OR payment_days NOT BETWEEN 0 AND 3650 THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier account or requested payment terms are invalid';
    END IF;
    INSERT INTO "{SCHEMA}"."command_scopes" VALUES
      (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'supplier_terms',organization_id,supplier_account_id);
    UPDATE parties.supplier_accounts SET payment_days=change_supplier_terms.payment_days,
      updated_at=pg_catalog.transaction_timestamp(),updated_by_membership_id=actor_id,row_version=row_version+1
      WHERE org_id=organization_id AND id=supplier_account_id AND row_version=expected_row_version;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='supplier account changed before term update';
    END IF;
    DELETE FROM "{SCHEMA}"."command_scopes" WHERE backend_pid=pg_catalog.pg_backend_pid()
      AND transaction_id=pg_catalog.txid_current() AND scope='supplier_terms'
      AND org_id=organization_id AND entity_id=supplier_account_id;
    PERFORM "{SCHEMA}"."finish_claim"(organization_id,claim.id,'parties.supplier_accounts',supplier_account_id,
      pg_catalog.jsonb_build_object('supplier_account_id',supplier_account_id,'row_version',expected_row_version+1));
    RETURN supplier_account_id;
END
''',
            runtime_callable=True,
        ),
    ]


def _retention_definition() -> list[str]:
    return [
        *_function(
            '"guard_retention_case"()', "trigger", f'''
BEGIN
  IF TG_OP='DELETE' OR NOT "{SCHEMA}"."scope_active"('privacy_retention',COALESCE(NEW.org_id,OLD.org_id),COALESCE(NEW.id,OLD.id)) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='retention case requires reviewed privacy command provenance';
  END IF;
  IF TG_OP='UPDATE' AND (OLD.status<>'reviewed' OR NEW.status<>'completed'
     OR ROW(NEW.org_id,NEW.id,NEW.subject_kind,NEW.membership_id,NEW.employee_id,NEW.party_id,NEW.contact_id,
            NEW.purpose_ended_on,NEW.statutory_retention_until,NEW.legal_hold,NEW.legal_hold_reason,
            NEW.evidence_attachment_id,NEW.reviewed_at,NEW.reviewed_by_membership_id,NEW.created_at,NEW.created_by_membership_id)
        IS DISTINCT FROM
        ROW(OLD.org_id,OLD.id,OLD.subject_kind,OLD.membership_id,OLD.employee_id,OLD.party_id,OLD.contact_id,
            OLD.purpose_ended_on,OLD.statutory_retention_until,OLD.legal_hold,OLD.legal_hold_reason,
            OLD.evidence_attachment_id,OLD.reviewed_at,OLD.reviewed_by_membership_id,OLD.created_at,OLD.created_by_membership_id)) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='retention case transition or reviewed evidence is immutable';
  END IF;
  RETURN NEW;
END
'''),
        _trigger("data_retention_cases_command_guard", "INSERT OR UPDATE OR DELETE", "core.data_retention_cases", "guard_retention_case"),
        *_function(
            '"complete_retention_case"(organization_id uuid, case_id uuid, subject_kind text, membership_id uuid, employee_id uuid, party_id uuid, contact_id uuid, purpose_ended_on date, statutory_retention_until date, evidence_attachment_id uuid, reviewed_by_membership_id uuid, reviewed_at timestamptz)',
            "uuid", f'''
DECLARE actor_id uuid:=erp_security.current_membership_id(); target_user_id uuid; ineligible_memberships integer;
BEGIN
  IF organization_id IS DISTINCT FROM erp_security.current_org_id() OR actor_id IS NULL
     OR NULLIF(pg_catalog.current_setting('app.request_id',true),'')::uuid IS NULL
     OR NOT erp_security.has_permission('core.retention.manage',NULL::uuid)
     OR pg_catalog.num_nonnulls(membership_id,employee_id,party_id,contact_id)<>1
     OR subject_kind NOT IN ('membership','employee','party','contact')
     OR purpose_ended_on>CURRENT_DATE OR statutory_retention_until>=CURRENT_DATE
     OR reviewed_at>pg_catalog.transaction_timestamp()
     OR reviewed_by_membership_id IS NOT DISTINCT FROM membership_id THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='retention eligibility, subject or authorization is invalid';
  END IF;
  PERFORM 1 FROM core.memberships WHERE org_id=organization_id AND id=reviewed_by_membership_id AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='retention reviewer is not active'; END IF;
  PERFORM 1 FROM core.attachments WHERE org_id=organization_id AND id=evidence_attachment_id AND status IN ('verified','retained') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='retention evidence is not verified and retained'; END IF;
  INSERT INTO "{SCHEMA}"."command_scopes" VALUES
    (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'privacy_retention',organization_id,case_id),
    (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'privacy_anonymize',organization_id,COALESCE(party_id,employee_id,contact_id,membership_id));
  INSERT INTO core.data_retention_cases(org_id,id,subject_kind,membership_id,employee_id,party_id,contact_id,
    purpose_ended_on,statutory_retention_until,legal_hold,evidence_attachment_id,reviewed_at,
    reviewed_by_membership_id,status,created_by_membership_id)
  VALUES(organization_id,case_id,subject_kind,membership_id,employee_id,party_id,contact_id,
    purpose_ended_on,statutory_retention_until,false,evidence_attachment_id,reviewed_at,
    reviewed_by_membership_id,'reviewed',actor_id);
  IF subject_kind='employee' THEN
    UPDATE hr.employees SET legal_name='Retained employee '||id::text,display_name='Retained employee',
      work_email=NULL,work_phone=NULL,updated_at=pg_catalog.transaction_timestamp(),updated_by_membership_id=actor_id,row_version=row_version+1
     WHERE org_id=organization_id AND id=employee_id;
  ELSIF subject_kind='party' THEN
    UPDATE parties.parties SET legal_name='Retained party '||id::text,trade_name=NULL,pan=NULL,date_of_birth=NULL,
      tax_residency_status=NULL,tax_person_type=NULL,pan_verification_status='not_available',
      tax_profile_evidence_attachment_id=NULL,tax_profile_verified_at=NULL,
      updated_at=pg_catalog.transaction_timestamp(),updated_by_membership_id=actor_id,row_version=row_version+1
     WHERE org_id=organization_id AND id=party_id;
  ELSIF subject_kind='contact' THEN
    UPDATE parties.contacts SET name='Retained contact',designation=NULL,email=NULL,phone=NULL,is_primary=false,
      status='inactive',updated_at=pg_catalog.transaction_timestamp(),updated_by_membership_id=actor_id,row_version=row_version+1
     WHERE org_id=organization_id AND id=contact_id;
  ELSE
    SELECT user_id INTO STRICT target_user_id FROM core.memberships
     WHERE org_id=organization_id AND id=membership_id FOR UPDATE;
    SELECT count(*) INTO ineligible_memberships
      FROM core.memberships other WHERE other.user_id=target_user_id AND other.status='active'
       AND NOT (other.org_id=organization_id AND other.id=membership_id)
       AND NOT EXISTS (SELECT 1 FROM core.data_retention_cases eligible
         WHERE eligible.org_id=other.org_id AND eligible.membership_id=other.id AND eligible.status='completed');
    IF ineligible_memberships=0 THEN
      UPDATE core.users SET auth_user_id=NULL,display_name='Retained user',phone=NULL,status='disabled',
        updated_at=pg_catalog.transaction_timestamp(),row_version=row_version+1 WHERE id=target_user_id;
    END IF;
  END IF;
  UPDATE core.data_retention_cases SET status='completed',completed_at=pg_catalog.transaction_timestamp(),
    completed_by_membership_id=actor_id WHERE org_id=organization_id AND id=case_id AND status='reviewed';
  DELETE FROM "{SCHEMA}"."command_scopes" WHERE backend_pid=pg_catalog.pg_backend_pid()
    AND transaction_id=pg_catalog.txid_current() AND org_id=organization_id
    AND scope IN ('privacy_retention','privacy_anonymize');
  RETURN case_id;
END
''', runtime_callable=True),
    ]


def _definitions() -> dict[str, list[str]]:
    return {
        "core.access_grants:access_grants_state_transition": _access_grant_definition(),
        "core.document_sequences:document_sequences_atomic_allocation": _document_sequence_definition(),
        "core.data_retention_cases:data_retention_cases_command_guard": _retention_definition(),
        "core.settings:settings_state_transition": _settings_definition(),
        "parties.customer_accounts:customer_accounts_state_transition": _customer_definition(),
        "parties.parties:parties_state_transition": _party_definition(),
        "parties.supplier_accounts:supplier_accounts_state_transition": _supplier_definition(),
    }


BLOCKED_REASONS = {
    "automation.agent_grant_capabilities:agent_grant_capabilities_revocation": (
        "Revocation lifecycle is locally enforceable, but automation.agent_grants has no typed risk, approval, "
        "amount, currency, or sensitive-read ceilings. Enforcing a derived ceiling would invent consent facts."
    ),
    "automation.command_requests:command_execution_guard": (
        "The row stores calculation_hash and aggregate_version_hash without calculation bytes, a serializer version, "
        "or a reviewed operation dispatcher. PostgreSQL cannot re-hash absent evidence or execute every shared "
        "application command exactly once through this isolated core boundary."
    ),
    "automation.command_requests:command_request_matches_grant": (
        "The request persists no typed branch, amount, currency, or sensitive-read intent, and capability_code does "
        "not identify a reviewed operation registry entry. Opaque request_bytes cannot safely establish those bounds."
    ),
    "catalog.products:products_regulatory_classification": (
        "No reviewed effective-dated CDSCO and NDPS ingredient classification authority is present. Core commands "
        "must not fabricate legal classifications or weaken the existing activation preflight."
    ),
}


def generated_artifacts() -> tuple[str, str]:
    invariants = _invariants()
    source = json.loads(SOURCE_MANIFEST.read_text(encoding="utf-8"))
    prior = set(source["blocked_invariants"])
    definitions = _definitions()
    disposition = set(definitions) | set(BLOCKED_REASONS)
    if set(definitions) & set(BLOCKED_REASONS) or disposition != prior:
        raise ContractError(
            "core command disposition must exactly partition prior blockers: "
            f"missing={sorted(prior-disposition)}, extra={sorted(disposition-prior)}"
        )
    entries: list[dict[str, Any]] = []
    for key in sorted(definitions):
        invariant = invariants[key]
        entries.append(
            {
                "enforcement": invariant["enforcement"],
                "invariant": invariant["invariant"],
                "requirement_sha256": hashlib.sha256(invariant["rule"].encode()).hexdigest(),
                "reviewed": True,
                "statements": definitions[key],
                "table": invariant["table"],
            }
        )
    mapping = {"mapping_version": "1.0.0", "enforcements": entries, "platform_enforcements": []}
    mapping_text = json.dumps(mapping, indent=2, sort_keys=True) + "\n"
    manifest = {
        "manifest_version": "1.0.0",
        "postgresql": "15+",
        "catalog_sha256": _catalog_hash(),
        "source_manifest": "../invariants_agent/invariants-agent-manifest.json",
        "mapping_file": MAPPING_PATH.name,
        "mapping_sha256": hashlib.sha256(mapping_text.encode()).hexdigest(),
        "resolved_count": len(definitions),
        "resolved_invariants": sorted(definitions),
        "blocked_count": len(BLOCKED_REASONS),
        "blocked_invariants": {key: {"reason": BLOCKED_REASONS[key]} for key in sorted(BLOCKED_REASONS)},
        "security": {
            "function_schema": SCHEMA,
            "dynamic_sql": False,
            "fixed_empty_search_path": True,
            "explicit_context_and_permission_checks": True,
            "runtime_callable_functions": [
                "allocate_document_number(uuid,uuid,bytea,timestamptz)",
                "change_customer_terms(uuid,uuid,bigint,numeric,integer,bytea,timestamptz)",
                "change_supplier_terms(uuid,uuid,bigint,integer,bytea,timestamptz)",
                "replace_setting(uuid,uuid,uuid,bigint,text,text,numeric,boolean,date,timestamptz,bytea,timestamptz)",
            ],
        },
        "dependencies": {
            "authorization": "erp_security.has_permission evaluates grant valid_from_at/expires_at at transaction time",
            "audit": "erp_plumbing.audit_row_mutation binds each mutation to app.request_id and optional app.command_request_id",
            "idempotency": "core.claim_idempotency_key plus immutable terminal response evidence",
        },
    }
    return mapping_text, json.dumps(manifest, indent=2, sort_keys=True) + "\n"


def main() -> int:
    mapping, manifest = generated_artifacts()
    ROOT.mkdir(parents=True, exist_ok=True)
    MAPPING_PATH.write_text(mapping, encoding="utf-8")
    MANIFEST_PATH.write_text(manifest, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
