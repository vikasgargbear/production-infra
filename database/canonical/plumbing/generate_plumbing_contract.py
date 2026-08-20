#!/usr/bin/env python3
"""Generate catalog-bound immutability, audit, and outbox trigger plumbing."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
CANONICAL_ROOT = ROOT.parent
REPO_ROOT = CANONICAL_ROOT.parents[1]
DOMAIN_ROOT = CANONICAL_ROOT / "domains"
BASELINE_PATH = REPO_ROOT / "backend" / "scripts" / "generate_canonical_baseline.py"
MAPPING_PATH = ROOT / "baseline-plumbing-enforcements.json"
MANIFEST_PATH = ROOT / "plumbing-manifest.json"
SQL_PATH = ROOT / "canonical_plumbing.sql"

IMMUTABLE_CLASSES = {
    "allocation_append_only_posted",
    "append_only_authority_artifact",
    "append_only_decision",
    "append_only_event",
    "append_only_posting_fact",
    "append_only_reconciliation",
    "append_only_regulatory_register",
    "append_only_sensor_fact",
    "append_only_settlement",
    "auditable_allocation_append_only_after_post",
    "immutable_evidence_metadata",
    "immutable_external_import",
    "immutable_external_line",
    "immutable_import_line",
    "immutable_reconciliation_result",
    "immutable_tax_snapshot",
    "return_composition_link",
}

AUDIT_EXCLUSIONS = {
    "core.audit_events": "audit chain cannot trigger itself",
    "inventory.stock_balances": "rebuildable projection is evidenced by its stock ledger source",
}

OUTBOX_BINDINGS = {
    "automation.command_requests": ("command", ("succeeded", "failed")),
    "compliance.recalls": ("recall", ("in_progress", "closed", "cancelled")),
    "finance.journal_entries": ("journal_entry", ("posted", "reversed")),
    "finance.payments": ("payment", ("posted", "reversed", "cancelled")),
    "inventory.inventory_documents": ("inventory_document", ("posted", "reversed")),
    "procurement.purchase_returns": ("purchase_return", ("posted", "reversed")),
    "procurement.supplier_invoices": ("supplier_invoice", ("posted", "reversed")),
    "sales.invoices": ("sales_invoice", ("posted", "reversed")),
    "sales.returns": ("sales_return", ("posted", "reversed")),
    "tax.einvoices": ("einvoice", ("generated", "failed", "cancelled")),
    "tax.eway_bills": ("eway_bill", ("generated", "failed", "cancelled", "expired")),
    "tax.returns": ("tax_return", ("filed", "rejected", "superseded")),
    "tax.withholdings": ("withholding", ("deducted", "reversed")),
}


class ContractError(RuntimeError):
    pass


def _load_baseline():
    spec = importlib.util.spec_from_file_location("canonical_baseline_for_plumbing", BASELINE_PATH)
    if spec is None or spec.loader is None:
        raise ContractError("cannot import canonical baseline generator")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=True, separators=(",", ":"), sort_keys=True)


def _q(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def _table_sql_name(name: str) -> str:
    schema, table = name.split(".", 1)
    return f"{_q(schema)}.{_q(table)}"


def _catalog() -> tuple[Any, dict[str, dict[str, str]], str]:
    baseline = _load_baseline()
    catalog = baseline.load_and_validate_catalog(DOMAIN_ROOT)
    requirements = baseline._platform_requirements(catalog)
    payload = {"contract": catalog.contract, "tables": sorted(catalog.tables, key=lambda row: row["name"])}
    digest = hashlib.sha256(_canonical_json(payload).encode()).hexdigest()
    return catalog, requirements, digest


def _entry(requirements: dict[str, dict[str, str]], key: str, statements: list[str]) -> dict[str, Any]:
    requirement = requirements[key]
    return {
        "key": key,
        "category": requirement["category"],
        "requirement_sha256": hashlib.sha256(requirement["requirement"].encode()).hexdigest(),
        "reviewed": True,
        "statements": statements,
    }


def _audit_tables(catalog: Any) -> list[str]:
    return sorted(
        table["name"]
        for table in catalog.tables
        if table["tenant_class"] != "global_reference" and table["name"] not in AUDIT_EXCLUSIONS
    )


def _immutable_tables(catalog: Any) -> list[str]:
    return sorted(
        table["name"] for table in catalog.tables if table["mutation_class"] in IMMUTABLE_CLASSES
    )


def _audit_statements(tables: list[str]) -> list[str]:
    statements = [
        """DO $audit_crypto_preflight$
BEGIN
    IF pg_catalog.to_regprocedure('extensions.digest(bytea,text)') IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'undefined_function', MESSAGE = 'extensions.digest(bytea,text) from pgcrypto is required';
    END IF;
END
$audit_crypto_preflight$""",
        'CREATE SCHEMA "erp_plumbing" AUTHORIZATION "erp_migration_owner"',
        'REVOKE ALL ON SCHEMA "erp_plumbing" FROM PUBLIC, "erp_app", "erp_runtime"',
        """CREATE FUNCTION "erp_plumbing"."audit_row_mutation"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $audit_function$
DECLARE
    before_row jsonb;
    after_row jsonb;
    resource_row jsonb;
    event_org_id uuid;
    event_resource_id uuid;
    event_actor_id uuid;
    event_request_id uuid;
    event_command_id uuid;
    event_actor_kind text;
    event_source_ip inet;
    regulatory_import_scope boolean;
    provider_completion_scope boolean;
    before_hash bytea;
    after_hash bytea;
    prior_hash bytea;
    next_chain_sequence bigint;
    canonical_event jsonb;
BEGIN
    before_row := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN pg_catalog.to_jsonb(OLD) ELSE NULL END;
    after_row := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN pg_catalog.to_jsonb(NEW) ELSE NULL END;
    resource_row := COALESCE(after_row, before_row);
    event_org_id := COALESCE(
        NULLIF(resource_row ->> 'org_id', '')::uuid,
        CASE WHEN TG_TABLE_SCHEMA = 'core' AND TG_TABLE_NAME = 'organizations'
             THEN NULLIF(resource_row ->> 'id', '')::uuid END,
        NULLIF(pg_catalog.current_setting('app.org_id', true), '')::uuid
    );
    IF event_org_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'audited mutation lacks organization context';
    END IF;
    event_request_id := NULLIF(pg_catalog.current_setting('app.request_id', true), '')::uuid;
    IF event_request_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'audited mutation lacks request id';
    END IF;
    event_actor_id := NULLIF(pg_catalog.current_setting('app.membership_id', true), '')::uuid;
    regulatory_import_scope := SESSION_USER = 'erp_regulatory_importer'
      AND event_request_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM erp_regulatory_commands.command_scopes AS scope
         WHERE scope.backend_pid=pg_catalog.pg_backend_pid()
           AND scope.transaction_id=pg_catalog.txid_current()
           AND scope.scope='reference_import'
      );
    provider_completion_scope := SESSION_USER = 'erp_tax_provider'
      AND event_request_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM erp_tax_provider_commands.command_scopes AS scope
         WHERE scope.backend_pid=pg_catalog.pg_backend_pid()
           AND scope.transaction_id=pg_catalog.txid_current()
           AND scope.scope='provider_complete'
      );
    IF event_actor_id IS NULL
       AND NOT pg_catalog.pg_has_role(SESSION_USER, 'erp_migration_owner', 'MEMBER')
       AND NOT regulatory_import_scope
       AND NOT provider_completion_scope THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'runtime audited mutation lacks actor membership';
    END IF;
    event_actor_kind := CASE
      WHEN event_actor_id IS NOT NULL THEN 'membership'
      WHEN regulatory_import_scope THEN 'system'
      WHEN provider_completion_scope THEN 'system'
      ELSE 'migration'
    END;
    event_command_id := NULLIF(pg_catalog.current_setting('app.command_request_id', true), '')::uuid;
    event_source_ip := NULLIF(pg_catalog.current_setting('app.source_ip', true), '')::inet;
    event_resource_id := CASE
        WHEN COALESCE(resource_row ->> 'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN (resource_row ->> 'id')::uuid ELSE NULL END;
    before_hash := CASE WHEN before_row IS NULL THEN NULL ELSE extensions.digest(pg_catalog.convert_to(before_row::text, 'UTF8'), 'sha256') END;
    after_hash := CASE WHEN after_row IS NULL THEN NULL ELSE extensions.digest(pg_catalog.convert_to(after_row::text, 'UTF8'), 'sha256') END;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(event_org_id::text, 9042026));
    SELECT event.chain_sequence + 1, event.evidence_hash INTO next_chain_sequence, prior_hash
      FROM core.audit_events AS event
     WHERE event.org_id = event_org_id
     ORDER BY event.chain_sequence DESC
     LIMIT 1
     FOR UPDATE;
    next_chain_sequence := COALESCE(next_chain_sequence, 1);
    canonical_event := pg_catalog.jsonb_build_object(
        'version', 'pg-jsonb-sha256-v1', 'org_id', event_org_id,
        'chain_sequence', next_chain_sequence, 'request_id', event_request_id,
        'command_request_id', event_command_id, 'actor_membership_id', event_actor_id,
        'actor_kind', event_actor_kind, 'event_type', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME || '.' || pg_catalog.lower(TG_OP),
        'resource_type', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, 'resource_id', event_resource_id,
        'mutation_kind', pg_catalog.lower(TG_OP), 'before_state_hash', pg_catalog.encode(before_hash, 'hex'),
        'after_state_hash', pg_catalog.encode(after_hash, 'hex'), 'previous_event_hash', pg_catalog.encode(prior_hash, 'hex')
    );
    INSERT INTO core.audit_events (
        org_id, chain_sequence, actor_membership_id, actor_kind, event_type, resource_type, resource_id,
        request_id, command_request_id, mutation_kind, summary, evidence_version,
        before_state_hash, after_state_hash, evidence_hash, previous_event_hash, source_ip, user_agent
    ) VALUES (
        event_org_id, next_chain_sequence, event_actor_id, event_actor_kind,
        TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME || '.' || pg_catalog.lower(TG_OP),
        TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, event_resource_id, event_request_id,
        event_command_id, pg_catalog.lower(TG_OP), pg_catalog.lower(TG_OP) || ' ' || TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,
        'pg-jsonb-sha256-v1', before_hash, after_hash,
        extensions.digest(pg_catalog.convert_to(canonical_event::text, 'UTF8'), 'sha256'),
        prior_hash, event_source_ip, NULLIF(pg_catalog.current_setting('app.user_agent', true), '')
    );
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END
$audit_function$""",
        'ALTER FUNCTION "erp_plumbing"."audit_row_mutation"() OWNER TO "erp_migration_owner"',
        'REVOKE ALL ON FUNCTION "erp_plumbing"."audit_row_mutation"() FROM PUBLIC, "erp_app", "erp_runtime"',
    ]
    for name in tables:
        trigger = name.replace(".", "_") + "_audit_trg"
        statements.append(
            f"CREATE TRIGGER {_q(trigger)} AFTER INSERT OR UPDATE OR DELETE ON {_table_sql_name(name)} "
            'FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"()'
        )
    return statements


def _immutability_statements(tables: list[str]) -> list[str]:
    statements = [
        """CREATE FUNCTION "erp_plumbing"."reject_row_mutation"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $immutable_function$
BEGIN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME || ' is immutable; append a reversal or supersession';
END
$immutable_function$""",
        'ALTER FUNCTION "erp_plumbing"."reject_row_mutation"() OWNER TO "erp_migration_owner"',
        'REVOKE ALL ON FUNCTION "erp_plumbing"."reject_row_mutation"() FROM PUBLIC, "erp_app", "erp_runtime"',
    ]
    for name in tables:
        trigger = name.replace(".", "_") + "_immutable_trg"
        statements.append(
            f"CREATE TRIGGER {_q(trigger)} BEFORE UPDATE OR DELETE ON {_table_sql_name(name)} "
            'FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."reject_row_mutation"()'
        )
    return statements


def _outbox_statements(bindings: dict[str, tuple[str, tuple[str, ...]]]) -> list[str]:
    statements = [
        """CREATE FUNCTION "erp_plumbing"."enqueue_state_outbox"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $outbox_function$
DECLARE
    row_data jsonb := pg_catalog.to_jsonb(NEW);
    old_data jsonb := CASE WHEN TG_OP = 'UPDATE' THEN pg_catalog.to_jsonb(OLD) ELSE NULL END;
    row_status text := row_data ->> 'status';
    outbox_aggregate_id uuid := (row_data ->> 'id')::uuid;
    outbox_event_version bigint := COALESCE(NULLIF(row_data ->> 'row_version', '')::bigint, 1);
    outbox_event_type text;
    outbox_payload bytea;
BEGIN
    IF pg_catalog.strpos(',' || TG_ARGV[1] || ',', ',' || row_status || ',') = 0 THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND old_data ->> 'status' IS NOT DISTINCT FROM row_status THEN
        RETURN NEW;
    END IF;
    outbox_event_type := TG_ARGV[0] || '.' || row_status;
    outbox_payload := pg_catalog.convert_to(pg_catalog.jsonb_build_object(
        'event_type', outbox_event_type, 'aggregate_type', TG_ARGV[0],
        'aggregate_id', outbox_aggregate_id, 'event_version', outbox_event_version,
        'organization_id', row_data ->> 'org_id', 'status', row_status
    )::text, 'UTF8');
    INSERT INTO core.outbox_events (
        org_id, event_type, aggregate_type, aggregate_id, event_version,
        media_type, payload_bytes, payload_hash
    ) VALUES (
        (row_data ->> 'org_id')::uuid, outbox_event_type, TG_ARGV[0], outbox_aggregate_id,
        outbox_event_version, 'application/json', outbox_payload,
        extensions.digest(outbox_payload, 'sha256')
    ) ON CONFLICT (org_id, aggregate_type, aggregate_id, event_type, event_version) DO NOTHING;
    RETURN NEW;
END
$outbox_function$""",
        'ALTER FUNCTION "erp_plumbing"."enqueue_state_outbox"() OWNER TO "erp_migration_owner"',
        'REVOKE ALL ON FUNCTION "erp_plumbing"."enqueue_state_outbox"() FROM PUBLIC, "erp_app", "erp_runtime"',
    ]
    for name, (aggregate, statuses) in sorted(bindings.items()):
        trigger = name.replace(".", "_") + "_outbox_trg"
        args = ",".join(statuses)
        statements.append(
            f"CREATE TRIGGER {_q(trigger)} AFTER INSERT OR UPDATE OF status ON {_table_sql_name(name)} "
            f"FOR EACH ROW EXECUTE FUNCTION \"erp_plumbing\".\"enqueue_state_outbox\"('{aggregate}', '{args}')"
        )
    return statements


def generated_artifacts() -> tuple[str, str, str]:
    catalog, requirements, catalog_hash = _catalog()
    names = {table["name"] for table in catalog.tables}
    unknown = sorted(set(OUTBOX_BINDINGS) - names)
    if unknown:
        raise ContractError(f"outbox binding targets unknown tables: {unknown}")
    for name, (_aggregate, statuses) in OUTBOX_BINDINGS.items():
        table = next(table for table in catalog.tables if table["name"] == name)
        lifecycle_states = set(table["lifecycle"]["states"])
        if not set(statuses) <= lifecycle_states:
            raise ContractError(f"outbox statuses drift for {name}")
    audit_tables = _audit_tables(catalog)
    immutable_tables = _immutable_tables(catalog)
    entries = [
        _entry(requirements, "trigger_plumbing:audit", _audit_statements(audit_tables)),
        _entry(requirements, "trigger_plumbing:immutability", _immutability_statements(immutable_tables)),
        _entry(requirements, "trigger_plumbing:outbox", _outbox_statements(OUTBOX_BINDINGS)),
    ]
    mapping = {"mapping_version": "1.0.0", "platform_enforcements": entries}
    mapping_text = json.dumps(mapping, indent=2, sort_keys=True) + "\n"
    manifest = {
        "manifest_version": "1.0.0",
        "catalog_sha256": catalog_hash,
        "mapping_sha256": hashlib.sha256(mapping_text.encode()).hexdigest(),
        "resolved_blockers": [entry["key"] for entry in entries],
        "immutable_bindings": immutable_tables,
        "audit_bindings": audit_tables,
        "audit_exclusions": AUDIT_EXCLUSIONS,
        "outbox_bindings": {
            name: {"aggregate_type": aggregate, "statuses": list(statuses)}
            for name, (aggregate, statuses) in sorted(OUTBOX_BINDINGS.items())
        },
        "hash_contract": "pg-jsonb-sha256-v1",
    }
    manifest_text = json.dumps(manifest, indent=2, sort_keys=True) + "\n"
    sql = "-- Generated canonical plumbing review artifact; baseline mapping is authoritative.\nBEGIN;\n\n"
    sql += "\n\n".join(statement + ";" for entry in entries for statement in entry["statements"])
    sql += "\n\nCOMMIT;\n"
    return mapping_text, manifest_text, sql


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    mapping, manifest, sql = generated_artifacts()
    outputs = ((MAPPING_PATH, mapping), (MANIFEST_PATH, manifest), (SQL_PATH, sql))
    if args.check:
        drift = [str(path) for path, text in outputs if not path.exists() or path.read_text() != text]
        if drift:
            print("plumbing-contract: drift: " + ", ".join(drift), file=sys.stderr)
            return 1
        print("plumbing-contract: OK")
        return 0
    ROOT.mkdir(parents=True, exist_ok=True)
    for path, text in outputs:
        path.write_text(text, encoding="utf-8")
    print("plumbing-contract: OK (3 resolved)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
