#!/usr/bin/env python3
"""Generate fail-closed canonical preflights and non-regulated seed authority.

This module is intentionally offline. It never connects to Supabase or any
other database. Regulated reference ledgers deploy empty and are populated only
through the separately reviewed effective-dated import authority.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import sys
from pathlib import Path
from typing import Any


PLATFORM_ROOT = Path(__file__).resolve().parent
CANONICAL_ROOT = PLATFORM_ROOT.parent
REPO_ROOT = CANONICAL_ROOT.parents[1]
DOMAIN_ROOT = CANONICAL_ROOT / "domains"
AUTHORITY_PATH = CANONICAL_ROOT / "model-v1.json"
BASELINE_GENERATOR_PATH = REPO_ROOT / "backend" / "scripts" / "generate_canonical_baseline.py"
DEFAULT_MANIFEST_PATH = PLATFORM_ROOT / "platform-manifest.json"
DEFAULT_MAPPING_PATH = PLATFORM_ROOT / "baseline-platform-enforcements.json"
DEFAULT_TRIGGER_PATH = PLATFORM_ROOT / "trigger-foundations.sql"


class ContractError(RuntimeError):
    """The platform contract cannot be generated safely."""


def _canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=True, separators=(",", ":"), sort_keys=True)


def _sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def _load_baseline_module():
    spec = importlib.util.spec_from_file_location(
        "canonical_baseline_for_platform", BASELINE_GENERATOR_PATH
    )
    if spec is None or spec.loader is None:
        raise ContractError(f"cannot import baseline generator: {BASELINE_GENERATOR_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def load_catalog() -> tuple[Any, dict[str, dict[str, str]], str]:
    baseline = _load_baseline_module()
    catalog = baseline.load_and_validate_catalog(DOMAIN_ROOT)
    requirements = baseline._platform_requirements(catalog)
    authority = json.loads(AUTHORITY_PATH.read_text(encoding="utf-8"))
    payload = {
        "contract": catalog.contract,
        "authority_tables": authority["canonical_tables"],
        "tables": sorted(catalog.tables, key=lambda item: item["name"]),
    }
    digest = hashlib.sha256(_canonical_json(payload).encode("utf-8")).hexdigest()
    return catalog, requirements, digest


ACCESS_ADMINISTRATION = {
    "automation.agent_grant.manage",
    "core.access.manage",
    "core.user.manage",
}
REGULATED_EXTERNAL = {
    "tax.einvoice.generate",
    "tax.eway_bill.generate",
    "tax.return.file",
}
CONSEQUENTIAL_WRITE = {
    "automation.command.approve",
    "automation.command.execute",
    "compliance.controlled_substance.post",
    "compliance.recall.execute",
    "finance.adjustment_note.manage",
    "finance.bank_reconcile",
    "finance.bank_statement.import",
    "finance.expense.manage",
    "finance.journal.post",
    "finance.payment.allocate",
    "finance.payment.manage",
    "internal.accounting.post",
    "internal.audit.append",
    "internal.bank_statement.parse",
    "internal.idempotency.claim",
    "internal.open_item.post",
    "internal.outbox.deliver",
    "internal.sequence.allocate",
    "internal.tax.portal.parse",
    "internal.tax.reconciliation.write",
    "internal.tax_document.post",
    "internal.temperature.ingest",
    "inventory.document.post",
    "inventory.projector.write",
    "procurement.invoice.post",
    "procurement.receipt.post",
    "procurement.return.post",
    "sales.dispatch.post",
    "sales.invoice.post",
    "sales.return.post",
    "tax.portal.import",
    "tax.reconciliation.run",
    "tax.return.compose",
    "tax.withholding.manage",
}
REVERSIBLE_WRITE = {
    "catalog.category.manage",
    "catalog.product.manage",
    "compliance.destruction.manage",
    "compliance.license.manage",
    "compliance.recall.manage",
    "core.attachment.manage",
    "core.branch.manage",
    "core.organization.manage",
    "core.retention.manage",
    "core.settings.manage",
    "finance.account.manage",
    "finance.adjustment_note.edit",
    "finance.bank_account.manage",
    "finance.expense.edit",
    "finance.journal.edit",
    "hr.department.manage",
    "hr.employee.manage",
    "inventory.batch.manage",
    "inventory.location.manage",
    "inventory.reservation.manage",
    "parties.customer.manage",
    "parties.party.manage",
    "parties.supplier.manage",
    "parties.tax_registration.manage",
    "procurement.order.manage",
    "sales.order.manage",
    "tax.registration.manage",
    "tax.return_period.manage",
}
PERMISSION_RISKS = {
    **{code: "access_administration" for code in ACCESS_ADMINISTRATION},
    **{code: "regulated_external" for code in REGULATED_EXTERNAL},
    **{code: "consequential_write" for code in CONSEQUENTIAL_WRITE},
    **{code: "reversible_write" for code in REVERSIBLE_WRITE},
}

UOM_ROWS = (
    ("EA", "Each", "ea", "count", 0),
    ("KG", "Kilogram", "kg", "mass", 6),
    ("G", "Gram", "g", "mass", 6),
    ("MG", "Milligram", "mg", "mass", 6),
    ("MCG", "Microgram", "mcg", "mass", 6),
    ("L", "Litre", "L", "volume", 6),
    ("ML", "Millilitre", "mL", "volume", 6),
    ("M", "Metre", "m", "length", 6),
    ("CM", "Centimetre", "cm", "length", 6),
    ("MM", "Millimetre", "mm", "length", 6),
)


def _permission_rows(catalog: Any) -> tuple[tuple[str, str, str, str, str], ...]:
    codes = {
        table["rls"]["write_permission"]
        for table in catalog.tables
        if table["rls"]["write_permission"] is not None
    }
    classified = set(PERMISSION_RISKS)
    if codes != classified:
        raise ContractError(
            "permission seed classification drift; missing="
            f"{sorted(codes - classified)}, stale={sorted(classified - codes)}"
        )
    rows = []
    for code in sorted(codes):
        domain, action = code.split(".", 1)
        rows.append(
            (
                code,
                domain,
                action,
                PERMISSION_RISKS[code],
                f"Authorize the canonical {code} operation.",
            )
        )
    return tuple(rows)


def _schema_preflight(schema: str) -> str:
    literal = _sql_literal(schema)
    return f"""DO $canonical_schema_preflight$
BEGIN
    IF pg_catalog.to_regnamespace({literal}) IS NOT NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = 'duplicate_schema',
            MESSAGE = 'canonical baseline refused: schema {schema} already exists';
    END IF;
END
$canonical_schema_preflight$;"""


def _auth_preflight() -> str:
    return """DO $canonical_auth_preflight$
DECLARE
    users_oid oid := pg_catalog.to_regclass('auth.users');
BEGIN
    IF users_oid IS NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = 'undefined_table',
            MESSAGE = 'canonical baseline refused: Supabase-owned auth.users is absent';
    END IF;
    IF (SELECT class.relkind NOT IN ('r', 'p')
        FROM pg_catalog.pg_class AS class
        WHERE class.oid = users_oid) THEN
        RAISE EXCEPTION USING
            ERRCODE = 'wrong_object_type',
            MESSAGE = 'canonical baseline refused: auth.users must be a table or partitioned table';
    END IF;
    IF (SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid = users_oid
          AND attribute.attname = 'id'
          AND attribute.atttypid = 'pg_catalog.uuid'::pg_catalog.regtype
          AND attribute.attnotnull
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped) = 0 THEN
        RAISE EXCEPTION USING
            ERRCODE = 'datatype_mismatch',
            MESSAGE = 'canonical baseline refused: auth.users.id must be NOT NULL uuid';
    END IF;
    IF (SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_index AS index_row
        JOIN pg_catalog.pg_attribute AS attribute
          ON attribute.attrelid = index_row.indrelid
         AND attribute.attnum = index_row.indkey[0]
        WHERE index_row.indrelid = users_oid
          AND index_row.indisunique
          AND index_row.indisvalid
          AND index_row.indisready
          AND index_row.indimmediate
          AND index_row.indpred IS NULL
          AND index_row.indexprs IS NULL
          AND index_row.indnkeyatts = 1
          AND attribute.attname = 'id') = 0 THEN
        RAISE EXCEPTION USING
            ERRCODE = 'invalid_foreign_key',
            MESSAGE = 'canonical baseline refused: auth.users.id needs a valid unqualified unique key';
    END IF;
END
$canonical_auth_preflight$;"""


def _values(rows: tuple[tuple[Any, ...], ...]) -> str:
    rendered = []
    for row in rows:
        rendered.append(
            "(" + ", ".join(str(value) if isinstance(value, int) else _sql_literal(value) for value in row) + ")"
        )
    return ",\n    ".join(rendered)


def _permission_seed_statements(rows: tuple[tuple[str, str, str, str, str], ...]) -> list[str]:
    values = _values(rows)
    return [
        f"""INSERT INTO core.permissions
    (code, domain, action, risk_class, description)
VALUES
    {values};""",
        f"""DO $canonical_permission_seed_verify$
BEGIN
    IF EXISTS (
        (SELECT code, domain, action, risk_class, description, status FROM core.permissions
         EXCEPT
         SELECT code, domain, action, risk_class, description, 'active'::text
         FROM (VALUES {values}) AS expected(code, domain, action, risk_class, description))
        UNION ALL
        (SELECT code, domain, action, risk_class, description, 'active'::text
         FROM (VALUES {values}) AS expected(code, domain, action, risk_class, description)
         EXCEPT
         SELECT code, domain, action, risk_class, description, status FROM core.permissions)
    ) THEN
        RAISE EXCEPTION 'core.permissions does not exactly match canonical-permissions-v1.0.0';
    END IF;
END
$canonical_permission_seed_verify$;""",
    ]


def _uom_seed_statements() -> list[str]:
    values = _values(UOM_ROWS)
    return [
        f"""INSERT INTO catalog.units_of_measure
    (code, name, symbol, dimension, decimal_places)
VALUES
    {values};""",
        f"""DO $canonical_uom_seed_verify$
BEGIN
    IF EXISTS (
        (SELECT code, name, symbol, dimension, decimal_places, status FROM catalog.units_of_measure
         EXCEPT
         SELECT code, name, symbol, dimension, decimal_places, 'active'::text
         FROM (VALUES {values}) AS expected(code, name, symbol, dimension, decimal_places))
        UNION ALL
        (SELECT code, name, symbol, dimension, decimal_places, 'active'::text
         FROM (VALUES {values}) AS expected(code, name, symbol, dimension, decimal_places)
         EXCEPT
         SELECT code, name, symbol, dimension, decimal_places, status FROM catalog.units_of_measure)
    ) THEN
        RAISE EXCEPTION 'catalog.units_of_measure does not exactly match canonical-uom-v1.0.0';
    END IF;
END
$canonical_uom_seed_verify$;""",
    ]


def _mapping_entry(
    requirements: dict[str, dict[str, str]], key: str, statements: list[str]
) -> dict[str, Any]:
    requirement = requirements[key]
    return {
        "key": key,
        "category": requirement["category"],
        "requirement_sha256": hashlib.sha256(
            requirement["requirement"].encode("utf-8")
        ).hexdigest(),
        "reviewed": True,
        "statements": statements,
    }


def _trigger_foundations_sql(catalog_hash: str) -> str:
    return f"""-- Canonical trigger-plumbing foundations
-- REVIEWED FOUNDATION ONLY: no trigger_plumbing blocker is resolved by this file.
-- canonical_catalog_sha256: {catalog_hash}
-- Apply only after a disposable canonical baseline and security contract exist.

BEGIN;

CREATE SCHEMA erp_plumbing AUTHORIZATION erp_migration_owner;
REVOKE ALL ON SCHEMA erp_plumbing FROM PUBLIC, erp_app, erp_runtime;

CREATE TABLE erp_plumbing.trigger_bindings (
    source_table regclass NOT NULL,
    binding_kind text NOT NULL CHECK (binding_kind IN ('immutability','audit','outbox')),
    trigger_name name NOT NULL,
    contract_sha256 varchar(64) NOT NULL CHECK (contract_sha256 ~ '^[0-9a-f]{{64}}$'),
    installed_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    PRIMARY KEY (source_table, binding_kind, trigger_name)
);
ALTER TABLE erp_plumbing.trigger_bindings OWNER TO erp_migration_owner;
REVOKE ALL ON TABLE erp_plumbing.trigger_bindings FROM PUBLIC, erp_app, erp_runtime;

CREATE FUNCTION erp_plumbing.reject_row_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $reject_row_mutation$
BEGIN
    RAISE EXCEPTION USING
        ERRCODE = 'integrity_constraint_violation',
        MESSAGE = pg_catalog.format('%s rejects %s; use its reviewed reversal or supersession command', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, TG_OP);
END
$reject_row_mutation$;

CREATE FUNCTION erp_plumbing.enqueue_outbox_event(
    p_organization_id uuid,
    p_event_type varchar(128),
    p_aggregate_type varchar(64),
    p_aggregate_id uuid,
    p_event_version integer,
    p_media_type varchar(128),
    p_payload_bytes bytea,
    p_payload_hash bytea,
    p_available_at timestamptz DEFAULT transaction_timestamp()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $enqueue_outbox_event$
DECLARE
    event_id uuid;
    existing core.outbox_events%ROWTYPE;
BEGIN
    INSERT INTO core.outbox_events (
        org_id, event_type, aggregate_type, aggregate_id, event_version,
        media_type, payload_bytes, payload_hash, available_at
    ) VALUES (
        p_organization_id, p_event_type, p_aggregate_type, p_aggregate_id, p_event_version,
        p_media_type, p_payload_bytes, p_payload_hash, p_available_at
    )
    ON CONFLICT ON CONSTRAINT outbox_events_aggregate_version_uq DO NOTHING
    RETURNING id INTO event_id;

    IF event_id IS NOT NULL THEN
        RETURN event_id;
    END IF;

    SELECT * INTO STRICT existing
    FROM core.outbox_events AS event
    WHERE event.org_id = p_organization_id
      AND event.aggregate_type = p_aggregate_type
      AND event.aggregate_id = p_aggregate_id
      AND event.event_type = p_event_type
      AND event.event_version = p_event_version;

    IF existing.media_type IS DISTINCT FROM p_media_type
       OR existing.payload_bytes IS DISTINCT FROM p_payload_bytes
       OR existing.payload_hash IS DISTINCT FROM p_payload_hash THEN
        RAISE EXCEPTION USING
            ERRCODE = 'unique_violation',
            MESSAGE = 'outbox aggregate version was reused with a different payload';
    END IF;
    RETURN existing.id;
END
$enqueue_outbox_event$;

ALTER FUNCTION erp_plumbing.reject_row_mutation() OWNER TO erp_migration_owner;
ALTER FUNCTION erp_plumbing.enqueue_outbox_event(uuid, varchar, varchar, uuid, integer, varchar, bytea, bytea, timestamptz) OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_plumbing.reject_row_mutation() FROM PUBLIC, erp_app, erp_runtime;
REVOKE ALL ON FUNCTION erp_plumbing.enqueue_outbox_event(uuid, varchar, varchar, uuid, integer, varchar, bytea, bytea, timestamptz) FROM PUBLIC, erp_app, erp_runtime;

COMMIT;
"""


def generated_artifacts() -> tuple[str, str, str]:
    catalog, requirements, catalog_hash = load_catalog()
    schemas = [Path(filename).stem for filename in catalog.contract["domain_files"]]
    permission_rows = _permission_rows(catalog)
    entries = [
        *(
            _mapping_entry(
                requirements,
                f"preflight:schema:{schema}",
                [_schema_preflight(schema)],
            )
            for schema in schemas
        ),
        _mapping_entry(requirements, "preflight:auth.users", [_auth_preflight()]),
        _mapping_entry(
            requirements,
            "global_reference_seed:core.permissions",
            _permission_seed_statements(permission_rows),
        ),
        _mapping_entry(
            requirements,
            "global_reference_seed:catalog.units_of_measure",
            _uom_seed_statements(),
        ),
    ]
    mapping = {
        "mapping_version": "1.0.0",
        "enforcements": [],
        "platform_enforcements": sorted(entries, key=lambda item: item["key"]),
    }
    mapping_text = json.dumps(mapping, indent=2, sort_keys=True) + "\n"
    unresolved = {
        "trigger_plumbing:immutability": {
            "reason": "The generic rejection helper exists, but the exact catalog-audited trigger binding registry is intentionally empty until invariant mappings are reviewed.",
        },
        "trigger_plumbing:audit": {
            "reason": "core.audit_events has no explicit before_hash/after_hash fields or reviewed canonical row-serialization and tenant-chain concurrency contract.",
        },
        "trigger_plumbing:outbox": {
            "reason": "The transactional idempotent enqueue helper exists, but owned event types and aggregate-version bindings are not yet declared in the canonical catalog.",
        },
    }
    manifest = {
        "manifest_version": "1.0.0",
        "catalog_sha256": catalog_hash,
        "resolved_platform_blocker_count": len(entries),
        "resolved_platform_blockers": {"preflight": 13, "global_reference_seed": 2},
        "unresolved_platform_blocker_count": len(unresolved),
        "unresolved_platform_blockers": unresolved,
        "seed_authorities": {
            "core.permissions": {
                "authority": "canonical-permissions-v1.0.0",
                "authority_kind": "application_contract",
                "dataset_sha256": hashlib.sha256(
                    _canonical_json(permission_rows).encode("utf-8")
                ).hexdigest(),
                "row_count": len(permission_rows),
                "exact_codes": [row[0] for row in permission_rows],
            },
            "catalog.units_of_measure": {
                "authority": "canonical-uom-v1.0.0",
                "authority_kind": "application_bootstrap_vocabulary",
                "dataset_sha256": hashlib.sha256(
                    _canonical_json(UOM_ROWS).encode("utf-8")
                ).hexdigest(),
                "row_count": len(UOM_ROWS),
                "exact_codes": [row[0] for row in UOM_ROWS],
            },
            "core.reference_data_releases": {
                "authority": "erp_regulatory_commands import ledger",
                "population_mode": "regulated_import",
                "baseline_rows": 0,
            },
            "catalog.ingredients": {
                "authority": "reviewed ingredient release import",
                "population_mode": "regulated_import",
                "baseline_rows": 0,
            },
            "tax.tax_code_versions": {
                "authority": "reviewed HSN/SAC tax release import",
                "population_mode": "regulated_import",
                "baseline_rows": 0,
            },
        },
        "trigger_foundations": {
            "mapping_status": "no_trigger_plumbing_blockers_resolved",
            "binding_registry": "erp_plumbing.trigger_bindings",
            "immutability_helper": "erp_plumbing.reject_row_mutation()",
            "audit_helper": None,
            "outbox_helper": "erp_plumbing.enqueue_outbox_event(...) SECURITY INVOKER",
            "installed_bindings": 0,
        },
        "baseline_mapping_sha256": hashlib.sha256(mapping_text.encode("utf-8")).hexdigest(),
    }
    return (
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        mapping_text,
        _trigger_foundations_sql(catalog_hash),
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args(argv)
    try:
        manifest, mapping, triggers = generated_artifacts()
    except (ContractError, OSError, KeyError, json.JSONDecodeError) as exc:
        print(f"platform-contract: ERROR: {exc}", file=sys.stderr)
        return 2
    artifacts = {
        DEFAULT_MANIFEST_PATH: manifest,
        DEFAULT_MAPPING_PATH: mapping,
        DEFAULT_TRIGGER_PATH: triggers,
    }
    if args.check:
        drift = [path for path, expected in artifacts.items() if not path.exists() or path.read_text(encoding="utf-8") != expected]
        if drift:
            print("platform-contract: drift: " + ", ".join(str(path) for path in drift), file=sys.stderr)
            return 1
    else:
        for path, content in artifacts.items():
            path.write_text(content, encoding="utf-8")
    print("platform-contract: OK (15 resolved, 3 deliberately unresolved platform blockers)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
