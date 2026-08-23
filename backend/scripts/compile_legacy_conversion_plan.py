#!/usr/bin/env python3
"""Compile a fail-closed legacy-to-canonical shadow conversion plan.

This command never connects to a database. It binds the reviewed source schema,
source-to-target disposition map, and aggregate-only production evidence into a
deterministic plan for a separate canonical target.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any
from uuid import NAMESPACE_URL, uuid5


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CAPTURE = (
    REPO_ROOT
    / "artifacts/live-schema-captures"
    / "supabase-jfrairkkzxwkhbtqejnz-20260819T143728Z.json"
)
DEFAULT_EVIDENCE = REPO_ROOT / "database/live-conversion-preflight-evidence.json"
DEFAULT_MODEL = REPO_ROOT / "docs/architecture/canonical-data-model.json"

SOURCE_PROJECT_REF = "jfrairkkzxwkhbtqejnz"
DISPOSABLE_STAGING_PROJECT_REF = "rgihahbmkrmhitjdjvev"
NON_BUSINESS_SCHEMAS = {"auth"}
VALID_DISPOSITIONS = {
    "archive_drop",
    "drop_partition",
    "drop_view",
    "merge",
    "replace_projection",
    "retain",
}
COUNT_RELATIONS = {
    "organizations": "master.organizations",
    "customers": "parties.customers",
    "suppliers": "parties.suppliers",
    "products": "inventory.products",
    "batches": "inventory.batches",
    "sales_orders": "sales.orders",
    "sales_order_lines": "sales.order_items",
    "dispatches": "sales.delivery_challans",
    "dispatch_lines": "sales.delivery_challan_items",
    "sales_invoices": "sales.invoices",
    "sales_invoice_lines": "sales.invoice_items",
    "sales_returns": "sales.sales_returns",
    "sales_return_lines": "sales.sales_return_items",
    "purchase_orders": "procurement.purchase_orders",
    "purchase_order_lines": "procurement.purchase_order_items",
    "goods_receipts": "procurement.goods_receipt_notes",
    "goods_receipt_lines": "procurement.grn_items",
    "supplier_invoices": "procurement.supplier_invoices",
    "supplier_invoice_lines": "procurement.supplier_invoice_items",
    "purchase_returns": "procurement.purchase_returns",
    "purchase_return_lines": "procurement.purchase_return_items",
    "payments": "financial.payments",
    "allocations": "financial.allocations",
    "inventory_movements": "inventory.inventory_movements",
    "stock_positions": "inventory.location_wise_stock",
}


class PlanError(ValueError):
    """Raised when reviewed conversion evidence is incomplete or unsafe."""


def load_json(path: Path) -> dict[str, Any]:
    def reject_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for key, value in pairs:
            if key in result:
                raise PlanError(f"{path}: duplicate JSON key {key!r}")
            result[key] = value
        return result

    try:
        with path.open(encoding="utf-8") as handle:
            value = json.load(handle, object_pairs_hook=reject_duplicates)
    except (OSError, json.JSONDecodeError) as exc:
        raise PlanError(f"cannot load {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise PlanError(f"{path}: root must be an object")
    return value


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=True,
        allow_nan=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("ascii")


def deterministic_target_id(source_relation: str, source_primary_key: object) -> str:
    if not source_relation or source_primary_key in (None, ""):
        raise PlanError("deterministic target IDs require relation and source key")
    source_identity = f"{SOURCE_PROJECT_REF}:{source_relation}:{source_primary_key}"
    return str(uuid5(NAMESPACE_URL, source_identity))


def canonical_relations(model: dict[str, Any]) -> set[str]:
    groups = model.get("canonical_tables")
    if not isinstance(groups, dict):
        raise PlanError("canonical model has no canonical_tables object")
    relations = {
        relation
        for values in groups.values()
        if isinstance(values, list)
        for relation in values
        if isinstance(relation, str)
    }
    if len(relations) != 110:
        raise PlanError(f"expected 110 canonical relations, found {len(relations)}")
    return relations


def validate_mapping(
    capture: dict[str, Any], model: dict[str, Any]
) -> list[dict[str, Any]]:
    mapping = model.get("source_mapping")
    if not isinstance(mapping, dict):
        raise PlanError("canonical model has no source_mapping object")
    targets = canonical_relations(model)
    source_relations = {
        f"{table['table_schema']}.{table['table_name']}"
        for table in capture.get("tables", [])
        if table.get("table_schema") not in NON_BUSINESS_SCHEMAS
    }
    missing = sorted(source_relations - set(mapping))
    unknown = sorted(set(mapping) - source_relations)
    if missing:
        raise PlanError(f"unclassified source relations: {', '.join(missing)}")
    if unknown:
        raise PlanError(f"mapping names absent source relations: {', '.join(unknown)}")

    dispositions: list[dict[str, Any]] = []
    for source_relation in sorted(source_relations):
        decision = mapping[source_relation]
        action = decision.get("action")
        target_relations = decision.get("targets")
        if action not in VALID_DISPOSITIONS:
            raise PlanError(f"{source_relation}: invalid disposition {action!r}")
        if not isinstance(target_relations, list):
            raise PlanError(f"{source_relation}: targets must be an array")
        invalid_targets = sorted(set(target_relations) - targets)
        if invalid_targets:
            raise PlanError(
                f"{source_relation}: unknown targets {', '.join(invalid_targets)}"
            )
        if action in {"retain", "merge"} and not target_relations:
            raise PlanError(f"{source_relation}: {action} requires a canonical target")
        dispositions.append(
            {
                "source_relation": source_relation,
                "action": action,
                "target_relations": target_relations,
                "coverage_rule": "every_source_row_gets_one_row_disposition",
            }
        )
    return dispositions


def decimal_totals(value: Any, path: str = "exact_totals") -> None:
    if not isinstance(value, dict) or not value:
        raise PlanError(f"{path} must be a non-empty object")
    for key, item in value.items():
        item_path = f"{path}.{key}"
        if isinstance(item, dict):
            decimal_totals(item, item_path)
            continue
        if not isinstance(item, str):
            raise PlanError(f"{item_path} must be an exact decimal string")
        try:
            decimal = Decimal(item)
        except InvalidOperation as exc:
            raise PlanError(f"{item_path} is not decimal: {item!r}") from exc
        if not decimal.is_finite():
            raise PlanError(f"{item_path} must be finite")


def validate_evidence(evidence: dict[str, Any]) -> None:
    if evidence.get("project_ref") != SOURCE_PROJECT_REF:
        raise PlanError("evidence does not belong to the pinned production source")
    if evidence.get("transaction_read_only") != "on":
        raise PlanError("production evidence was not captured read-only")
    if evidence.get("evidence_version") != "1.1.0":
        raise PlanError("conversion evidence version 1.1.0 is required")

    counts = evidence.get("source_counts")
    if not isinstance(counts, dict) or set(counts) != set(COUNT_RELATIONS):
        raise PlanError("source count evidence does not cover the conversion contract")
    if any(not isinstance(value, int) or value < 0 for value in counts.values()):
        raise PlanError("source counts must be non-negative integers")

    duplicates = evidence.get("duplicate_document_number_groups", {})
    if any(value != 0 for value in duplicates.values()):
        raise PlanError("duplicate document numbers require an explicit resolution ledger")
    validation = evidence.get("validation_counts", {})
    hard_validation_keys = {
        "invalid_customer_gstin",
        "invalid_supplier_gstin",
        "invalid_customer_pan",
        "invalid_supplier_pan",
        "duplicate_auth_identity",
        "nonpositive_inventory_movements",
        "negative_stock_positions",
    }
    failed_validation = sorted(
        key for key in hard_validation_keys if validation.get(key) != 0
    )
    if failed_validation:
        raise PlanError(f"unresolved validation failures: {', '.join(failed_validation)}")

    orphans = evidence.get("orphan_counts", {})
    unexplained_orphans = {
        key: value
        for key, value in orphans.items()
        if key != "inventory_movements_without_batch" and value != 0
    }
    if unexplained_orphans:
        raise PlanError(f"unresolved source orphans: {unexplained_orphans}")
    decimal_totals(evidence.get("exact_totals"))

    payments = evidence["exact_totals"]["payments"]
    if Decimal(payments["amount"]) != (
        Decimal(payments["allocated"]) + Decimal(payments["unallocated"])
    ):
        raise PlanError("payment allocation totals do not reconcile")


def compile_plan(
    *,
    capture: dict[str, Any],
    evidence: dict[str, Any],
    model: dict[str, Any],
    target_project_ref: str,
) -> dict[str, Any]:
    if target_project_ref == SOURCE_PROJECT_REF:
        raise PlanError("source and target project refs must differ")
    if target_project_ref != DISPOSABLE_STAGING_PROJECT_REF:
        raise PlanError("target is not the reviewed disposable canonical staging project")
    if capture.get("transaction_read_only") != "on":
        raise PlanError("schema capture was not performed in a read-only transaction")

    validate_evidence(evidence)
    dispositions = validate_mapping(capture, model)
    counts = evidence["source_counts"]
    missing_batch_count = evidence["orphan_counts"][
        "inventory_movements_without_batch"
    ]
    users_without_auth = evidence["validation_counts"]["users_without_auth_identity"]
    zero_line_headers = evidence["zero_line_headers"]
    contact_counts = evidence["contact_counts"]

    return {
        "plan_version": "1.0.0",
        "status": "ready_for_row_extraction",
        "source": {
            "project_ref": SOURCE_PROJECT_REF,
            "mode": "read_only",
            "evidence_sha256": hashlib.sha256(canonical_bytes(evidence)).hexdigest(),
        },
        "target": {
            "project_ref": target_project_ref,
            "mode": "separate_canonical_shadow",
            "production_write_allowed": False,
        },
        "identity_contract": {
            "algorithm": "uuid5_url_namespace",
            "input": "source_project_ref:source_relation:source_primary_key",
            "sample": deterministic_target_id("sales.invoices", 1),
        },
        "row_coverage": {
            "counted_source_rows": sum(counts.values()),
            "counted_relations": [
                {
                    "evidence_key": key,
                    "source_relation": COUNT_RELATIONS[key],
                    "source_count": counts[key],
                    "required_disposition_count": counts[key],
                }
                for key in COUNT_RELATIONS
            ],
            "all_schema_relations": dispositions,
            "unexplained_rows_allowed": 0,
        },
        "exception_dispositions": [
            {
                "kind": "header_without_lines",
                "counts": zero_line_headers,
                "disposition": "preserve_header_and_legacy_status; do_not_fabricate_lines",
            },
            {
                "kind": "inventory_movement_missing_batch",
                "count": missing_batch_count,
                "disposition": "map_to_deterministic_untracked_system_batch_and_audit_event",
            },
            {
                "kind": "user_without_auth_identity",
                "count": users_without_auth,
                "disposition": "import_disabled_profile_with_null_auth_user_id",
            },
        ],
        "contact_contract": {
            "source_counts": contact_counts,
            "identity": "source_relation:source_primary_key:contact_role",
            "normalization": "trim endpoints for comparison; retain original display value",
            "shared_email_policy": "allowed_across_parties_and_contact_roles",
            "unexplained_contacts_allowed": 0,
        },
        "phases": [
            "read_only_source_snapshot_and_hash",
            "organization_identity_and_membership",
            "accounting_tax_and_document_number_reference_data",
            "party_contact_address_and_registration_master",
            "product_uom_location_and_batch_master",
            "purchase_sales_challan_return_and_payment_history",
            "inventory_ledger_and_stock_projection",
            "audit_attachment_and_compliance_lineage",
            "exact_reconciliation_and_application_cutover_evidence",
        ],
        "reconciliation_contract": {
            "source_counts": counts,
            "source_exact_totals": evidence["exact_totals"],
            "duplicate_document_number_groups": evidence[
                "duplicate_document_number_groups"
            ],
            "requirements": [
                "every source row has exactly one converted, archived, or exception disposition",
                "all target foreign keys resolve inside the same organization",
                "money and tax values compare as Decimal without float conversion",
                "signed stock ledger sums equal target stock projections",
                "payment allocations equal payment allocated amounts and open-item effects",
                "contacts reconcile by deterministic source identity, not email uniqueness",
            ],
        },
        "destructive_action": {
            "authorized": False,
            "required_confirmation": "separate explicit user confirmation immediately before reset or cutover",
        },
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--capture", type=Path, default=DEFAULT_CAPTURE)
    parser.add_argument("--evidence", type=Path, default=DEFAULT_EVIDENCE)
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL)
    parser.add_argument("--target-project-ref", required=True)
    parser.add_argument("--output", type=Path)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        plan = compile_plan(
            capture=load_json(args.capture),
            evidence=load_json(args.evidence),
            model=load_json(args.model),
            target_project_ref=args.target_project_ref,
        )
    except PlanError as exc:
        print(f"canonical conversion plan: BLOCKED: {exc}", file=sys.stderr)
        return 2
    rendered = json.dumps(plan, indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.write_text(rendered, encoding="utf-8")
    else:
        print(rendered, end="")
    print(
        "canonical conversion plan: OK "
        f"({len(plan['row_coverage']['all_schema_relations'])} source relations, "
        f"{plan['row_coverage']['counted_source_rows']} counted rows)",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
