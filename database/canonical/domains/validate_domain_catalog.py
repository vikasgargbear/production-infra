#!/usr/bin/env python3
"""Validate the reviewed column-level canonical domain catalogs."""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
CANONICAL_DOMAINS = (
    "core", "parties", "catalog", "inventory", "sales", "procurement",
    "finance", "tax", "compliance", "hr", "automation", "calculation",
)
GLOBAL_REFERENCES = {
    "core.permissions",
    "core.reference_data_releases",
    "catalog.units_of_measure",
    "catalog.ingredients",
    "tax.tax_code_versions",
}
SHARED_IDENTIFIER_TYPES = {
    "batch_number": "varchar(64)",
    "claim_number": "varchar(64)",
    "customer_po_number": "varchar(64)",
    "destruction_number": "varchar(64)",
    "dispatch_number": "varchar(64)",
    "document_number": "varchar(64)",
    "document_type": "varchar(64)",
    "goods_receipt_number": "varchar(64)",
    "journal_number": "varchar(64)",
    "note_number": "varchar(64)",
    "order_number": "varchar(64)",
    "payment_number": "varchar(64)",
    "purchase_order_number": "varchar(64)",
    "purchase_return_number": "varchar(64)",
    "recall_number": "varchar(64)",
    "register_number": "varchar(64)",
    "return_number": "varchar(64)",
    "supplier_challan_number": "varchar(64)",
    "supplier_invoice_number": "varchar(64)",
    "transport_document_number": "varchar(64)",
    "event_type": "varchar(128)",
    "invoice_number": "varchar(64)",
    "reason_code": "varchar(64)",
    "vehicle_number": "varchar(20)",
}


def load_catalog(root: Path = ROOT) -> tuple[dict[str, Any], dict[str, Any], list[dict[str, Any]]]:
    contract = json.loads((root / "_contract.json").read_text(encoding="utf-8"))
    authority_path = root.parents[2] / "docs/architecture/canonical-data-model.json"
    authority = json.loads(authority_path.read_text(encoding="utf-8"))
    documents = [json.loads((root / filename).read_text(encoding="utf-8")) for filename in contract["domain_files"]]
    return contract, authority, documents


def _column_map(table: dict[str, Any]) -> dict[str, list[Any]]:
    return {column[0]: column for column in table["columns"]}


def _issue(issues: list[str], table: str, message: str) -> None:
    issues.append(f"{table}: {message}")


def validate_catalog(
    contract: dict[str, Any], authority: dict[str, Any], documents: list[dict[str, Any]]
) -> list[str]:
    issues: list[str] = []
    tables = [table for document in documents for table in document.get("tables", [])]
    names = [table.get("name", "<missing>") for table in tables]
    by_name = {table["name"]: table for table in tables}
    expected = {
        name
        for domain in CANONICAL_DOMAINS
        for name in authority["canonical_tables"][domain]
    }

    if sum(document.get("table_count", -1) for document in documents) != contract["table_count"]:
        issues.append("catalog: per-domain counts do not equal _contract.table_count")
    if len(tables) != contract["table_count"]:
        issues.append("catalog: physical table count does not equal _contract.table_count")
    if set(names) != expected:
        issues.append(f"catalog: authority drift missing={sorted(expected - set(names))} extra={sorted(set(names) - expected)}")
    for name, count in Counter(names).items():
        if count != 1:
            _issue(issues, name, f"declared {count} times")

    required_keys = set(contract["required_table_keys"])
    allowed_sensitivity = set(contract["column_rules"]["sensitivity"])
    forbidden_types = {item.lower() for item in contract["column_rules"]["forbidden_types"]}
    bounded_json_purposes = set(contract["bounded_json_purposes"])
    denylist = tuple(contract["json_business_fact_denylist"])

    for table in tables:
        name = table.get("name", "<missing>")
        missing_keys = required_keys - set(table)
        if missing_keys:
            _issue(issues, name, f"missing required keys {sorted(missing_keys)}")
            continue
        if not isinstance(table["fact_owner"], str) or not table["fact_owner"].strip():
            _issue(issues, name, "fact_owner must name one authoritative fact")
        if table["tenant_class"] not in contract["tenant_classes"]:
            _issue(issues, name, f"unknown tenant_class {table['tenant_class']}")
        if table["rls"].get("class") not in contract["rls_classes"]:
            _issue(issues, name, "unknown RLS class")
        if table["tenant_class"] in {"tenant_direct", "tenant_association", "tenant_projection", "global_identity_root"} and not table["rls"].get("force"):
            _issue(issues, name, "tenant and global identity tables require FORCE RLS")
        if table["tenant_class"] == "global_reference" and table["rls"].get("write_permission") is not None:
            _issue(issues, name, "global reference runtime writes are forbidden")
        if table["tenant_class"] == "global_reference":
            population_modes = set(contract["global_reference_population_modes"])
            if table.get("population_mode") not in population_modes:
                _issue(issues, name, "global reference requires a reviewed population_mode")
        elif "population_mode" in table:
            _issue(issues, name, "population_mode is only valid for global references")

        columns = table["columns"]
        column_names = [column[0] for column in columns if isinstance(column, list) and column]
        if len(column_names) != len(set(column_names)):
            _issue(issues, name, "duplicate column name")
        for column in columns:
            if not isinstance(column, list) or len(column) not in {5, 6}:
                _issue(issues, name, "column tuple must have five fields or six when bounded JSON purpose is present")
                continue
            col_name, pg_type, nullable, default_sql, sensitivity = column[:5]
            bounded_purpose = column[5] if len(column) == 6 else None
            if not isinstance(nullable, bool):
                _issue(issues, name, f"{col_name} nullable must be Boolean")
            if default_sql is not None and not isinstance(default_sql, str):
                _issue(issues, name, f"{col_name} default_sql must be a string or null")
            if sensitivity not in allowed_sensitivity:
                _issue(issues, name, f"{col_name} has unknown sensitivity {sensitivity}")
            normalized_type = str(pg_type).lower()
            if normalized_type in forbidden_types or normalized_type in {"any", "object"}:
                _issue(issues, name, f"{col_name} uses forbidden type {pg_type}")
            if default_sql and "uuidv7()" in default_sql.lower():
                _issue(issues, name, f"{col_name} uses unavailable Supabase PostgreSQL 15 uuidv7() default")
            if normalized_type == "jsonb":
                if bounded_purpose not in bounded_json_purposes:
                    _issue(issues, name, f"{col_name} JSONB lacks an allowed bounded_json_purpose")
                if any(token in col_name.lower() for token in denylist):
                    _issue(issues, name, f"{col_name} hides a relational or fiscal business fact in JSONB")
            elif bounded_purpose is not None:
                _issue(issues, name, f"{col_name} declares bounded_json_purpose but is not JSONB")
            if col_name == "quantity" or col_name.endswith("_quantity") or col_name.endswith("_qty"):
                if normalized_type != "numeric(20,6)":
                    _issue(issues, name, f"{col_name} must use canonical quantity numeric(20,6)")
            money_field = col_name == "amount" or col_name.endswith(("_amount", "_total", "_price", "_limit")) or col_name in {"inventory_value", "total_value"}
            if money_field:
                expected_money_type = "numeric(20,4)" if col_name in {"unit_price", "unit_cost", "average_unit_cost"} else "numeric(20,2)"
                if normalized_type != expected_money_type:
                    _issue(issues, name, f"{col_name} must use canonical {expected_money_type}")
            if col_name in {"unit_rate", "quoted_unit_rate"} and normalized_type != "numeric(20,4)":
                _issue(issues, name, f"{col_name} must use canonical calculation numeric(20,4)")
            if col_name.endswith("_rate") and col_name not in {"unit_rate", "quoted_unit_rate"} and normalized_type != "numeric(9,6)":
                _issue(issues, name, f"{col_name} must use canonical rate numeric(9,6)")
            if col_name.endswith("_at") and normalized_type != "timestamptz":
                _issue(issues, name, f"{col_name} must use timestamptz")
            if col_name == "row_version" and normalized_type != "bigint":
                _issue(issues, name, "row_version must use bigint")
            shared_identifier_type = SHARED_IDENTIFIER_TYPES.get(col_name)
            if shared_identifier_type and normalized_type != shared_identifier_type:
                _issue(
                    issues,
                    name,
                    f"{col_name} must use shared identifier type {shared_identifier_type}",
                )

        column_map = _column_map(table)
        primary_key = table["primary_key"]
        if not primary_key or any(column not in column_map for column in primary_key):
            _issue(issues, name, "primary key is empty or references an absent column")
        for column in primary_key:
            if column in column_map and column_map[column][2]:
                _issue(issues, name, f"primary-key column {column} is nullable")

        tenant_class = table["tenant_class"]
        if tenant_class == "tenant_direct" and primary_key != ["org_id", "id"]:
            _issue(issues, name, "tenant_direct primary key must be (org_id,id)")
        if tenant_class in {"tenant_association", "tenant_projection"}:
            if primary_key[0:1] != ["org_id"] or "id" in column_map:
                _issue(issues, name, "association/projection must use an org-leading natural key and no surrogate id")
        if tenant_class.startswith("tenant_"):
            if "org_id" not in column_map or column_map["org_id"][1:4] != ["uuid", False, None]:
                _issue(issues, name, "tenant table requires caller-supplied non-null UUID org_id")

        fk_names: set[str] = set()
        fk_signatures: set[tuple[tuple[str, ...], str, tuple[str, ...]]] = set()
        membership_actor_columns: set[str] = set()
        for fk in table["foreign_keys"]:
            missing_fk_keys = set(contract["foreign_key_shape"]["required_keys"]) - set(fk)
            if missing_fk_keys:
                _issue(issues, name, f"FK {fk.get('name')} missing {sorted(missing_fk_keys)}")
                continue
            if fk["name"] in fk_names:
                _issue(issues, name, f"duplicate FK name {fk['name']}")
            fk_names.add(fk["name"])
            signature = (
                tuple(fk["columns"]),
                fk["references"],
                tuple(fk["referenced_columns"]),
            )
            if signature in fk_signatures:
                _issue(
                    issues,
                    name,
                    f"duplicate FK signature for {fk['columns']} -> {fk['references']}",
                )
            fk_signatures.add(signature)
            if any(column not in column_map for column in fk["columns"]):
                _issue(issues, name, f"FK {fk['name']} references absent local columns")
            if len(fk["columns"]) != len(fk["referenced_columns"]):
                _issue(issues, name, f"FK {fk['name']} arity mismatch")
            if fk["on_delete"] not in contract["foreign_key_shape"]["allowed_on_delete"]:
                _issue(issues, name, f"FK {fk['name']} has unsupported delete action")
            target = by_name.get(fk["references"])
            target_is_tenant = target is not None and target.get("tenant_class", "").startswith("tenant_")
            if tenant_class.startswith("tenant_") and target_is_tenant:
                if fk["columns"][0:1] != ["org_id"] or fk["referenced_columns"][0:1] != ["org_id"]:
                    _issue(issues, name, f"FK {fk['name']} is not tenant-safe")
            if target is None and fk["references"] != "auth.users":
                _issue(issues, name, f"FK {fk['name']} targets missing canonical table {fk['references']}")
            elif target is not None:
                target_columns = _column_map(target)
                if any(column not in target_columns for column in fk["referenced_columns"]):
                    _issue(issues, name, f"FK {fk['name']} targets absent columns on {fk['references']}")
                eligible_keys = [target["primary_key"]] + [
                    unique["columns"] for unique in target["uniques"] if unique.get("where") is None
                ]
                if fk["referenced_columns"] not in eligible_keys:
                    _issue(issues, name, f"FK {fk['name']} target columns are not an unconditional primary/unique key")
                for local_column, remote_column in zip(fk["columns"], fk["referenced_columns"]):
                    if local_column in column_map and remote_column in target_columns and column_map[local_column][1] != target_columns[remote_column][1]:
                        _issue(issues, name, f"FK {fk['name']} type mismatch {local_column}->{remote_column}")
            if fk["references"] == "core.memberships" and len(fk["columns"]) == 2 and fk["columns"][0] == "org_id":
                membership_actor_columns.add(fk["columns"][1])
            if name == "core.organizations" and fk["references"] == "core.memberships" and fk["columns"][0] == "id":
                membership_actor_columns.add(fk["columns"][1])

        for column in column_names:
            if column.endswith("_membership_id") and column not in membership_actor_columns:
                _issue(issues, name, f"actor column {column} lacks composite core.memberships FK")

        for unique in table["uniques"]:
            if any(column not in column_map for column in unique["columns"]):
                _issue(issues, name, f"unique {unique['name']} references absent column")
            if unique["columns"] == primary_key:
                _issue(issues, name, f"unique {unique['name']} duplicates primary key")
            if tenant_class.startswith("tenant_") and unique["columns"][0:1] != ["org_id"]:
                _issue(issues, name, f"unique {unique['name']} is not tenant-leading")
            nullable_columns = [column for column in unique["columns"] if column in column_map and column_map[column][2]]
            predicate = unique.get("where") or ""
            for column in nullable_columns:
                if f"{column} IS NOT NULL" not in predicate:
                    _issue(issues, name, f"unique {unique['name']} has nullable {column} without explicit NULL semantics")

        constraint_names = [fk["name"] for fk in table["foreign_keys"]]
        constraint_names.extend(unique["name"] for unique in table["uniques"])
        constraint_names.extend(check.get("name", "") for check in table["checks"])
        for constraint_name, count in Counter(constraint_names).items():
            if not constraint_name:
                _issue(issues, name, "constraint name is empty")
            elif count != 1:
                _issue(issues, name, f"constraint name {constraint_name} occurs {count} times")

        index_names: set[str] = set()
        for index in table["indexes"]:
            missing_index_keys = set(contract["index_shape"]["required_keys"]) - set(index)
            if missing_index_keys:
                _issue(issues, name, f"index {index.get('name')} missing {sorted(missing_index_keys)}")
                continue
            if index["name"] in index_names:
                _issue(issues, name, f"duplicate index name {index['name']}")
            index_names.add(index["name"])
            if any(column not in column_map for column in index["columns"]):
                _issue(issues, name, f"index {index['name']} references absent column")
            if tenant_class.startswith("tenant_") and index["columns"][0:1] != ["org_id"]:
                _issue(issues, name, f"index {index['name']} is not tenant-leading")
            if not index["purpose"].strip():
                _issue(issues, name, f"index {index['name']} lacks access-path justification")

        lifecycle = table["lifecycle"]
        if set(contract["lifecycle_shape"]["required_keys"]) - set(lifecycle):
            _issue(issues, name, "lifecycle shape is incomplete")
        state_column = lifecycle.get("state_column")
        if state_column is not None and state_column not in column_map:
            _issue(issues, name, "lifecycle state column is absent")
        if state_column is not None:
            state_checks = [
                check.get("expression", "")
                for check in table["checks"]
                if state_column in check.get("expression", "") and " IN " in check.get("expression", "")
            ]
            if not any(all(f"'{state}'" in expression for state in lifecycle["states"]) for expression in state_checks):
                _issue(issues, name, "lifecycle states are not all constrained by one SQL CHECK")
        if state_column is None and any((lifecycle.get("states"), lifecycle.get("terminal"), lifecycle.get("transitions"), lifecycle.get("initial"))):
            _issue(issues, name, "stateless lifecycle must be empty")

        invariants = table.get("cross_row_invariants")
        if not isinstance(invariants, list):
            _issue(issues, name, "cross_row_invariants must be a list")
            invariants = []
        if "trigger_invariants" in table:
            _issue(issues, name, "trigger_invariants is obsolete; normalize it to cross_row_invariants")
        complex_tokens = ("append", "event", "ledger", "idempot", "temporal", "command", "counter", "claim", "immutable", "document", "projection")
        mutation_class = table["mutation_class"].lower()
        nontrivial_lifecycle = len(lifecycle.get("states", [])) > 2
        if (any(token in mutation_class for token in complex_tokens) or nontrivial_lifecycle or tenant_class == "tenant_projection") and not invariants:
            _issue(issues, name, "nontrivial lifecycle/mutation class requires a structured cross-row invariant")
        for invariant in invariants:
            missing_invariant_keys = set(contract["cross_row_invariant_shape"]["required_keys"]) - set(invariant)
            if missing_invariant_keys:
                _issue(issues, name, f"cross-row invariant missing {sorted(missing_invariant_keys)}")
                continue
            if invariant["enforcement"] not in contract["cross_row_invariant_shape"]["allowed_enforcement"]:
                _issue(issues, name, f"cross-row invariant {invariant['name']} has unknown enforcement")
            if not invariant["rule"].strip():
                _issue(issues, name, f"cross-row invariant {invariant['name']} has no rule")
        for check in table["checks"]:
            if check.get("expression", "").startswith("TRIGGER_REQUIRED"):
                _issue(issues, name, f"check {check.get('name')} contains a non-SQL trigger placeholder")

        serialized = json.dumps(table).lower()
        if any(token in serialized for token in ("todo", "placeholder", "tbd")):
            _issue(issues, name, "contains unresolved placeholder text")

    index_locations: list[tuple[str, str]] = []
    for table in tables:
        schema = table["name"].split(".", 1)[0]
        index_locations.extend((schema, index["name"]) for index in table["indexes"])
    for (schema, index_name), count in Counter(index_locations).items():
        if count != 1:
            issues.append(f"{schema}.{index_name}: index name occurs {count} times in one schema")
    if by_name.get("core.organizations", {}).get("rls", {}).get("class") != "organization_membership":
        issues.append("core.organizations: visibility must be membership-gated")
    if by_name.get("core.users", {}).get("rls", {}).get("class") != "user_shared_membership":
        issues.append("core.users: visibility must be shared-membership-gated")
    for reference, expected_pk in (("core.permissions", ["code"]), ("catalog.units_of_measure", ["code"])):
        if by_name.get(reference, {}).get("primary_key") != expected_pk:
            issues.append(f"{reference}: controlled vocabulary must use stable code primary key")
    for reference in GLOBAL_REFERENCES:
        if by_name.get(reference, {}).get("tenant_class") != "global_reference":
            issues.append(f"{reference}: declared global FK target must remain a global_reference")
    product = by_name.get("catalog.products", {})
    if not any(fk.get("name") == "products_manufacturer_party_fk" for fk in product.get("foreign_keys", [])):
        issues.append("catalog.products: manufacturer_party FK is required")
    product_columns = _column_map(product)
    expected_product_regulatory = {
        "drug_schedule": ["text", True, None],
        "requires_prescription": ["boolean", True, None],
        "ndps_regulated": ["boolean", True, None],
        "regulatory_ruleset_version": ["varchar(64)", True, None],
        "schedule_h2_applicable_from": ["date", True, None],
        "traceability_product_code": ["varchar(128)", True, None],
    }
    for column_name, expected_shape in expected_product_regulatory.items():
        if column_name not in product_columns or product_columns[column_name][1:4] != expected_shape:
            issues.append(f"catalog.products: {column_name} must have explicit regulatory shape {expected_shape}")
    if "controlled_substance" in product_columns:
        issues.append("catalog.products: controlled_substance conflates Drugs Rules and NDPS classification")
    product_checks = " ".join(item.get("expression", "") for item in product.get("checks", []))
    for fragment in (
        "drug_schedule IN ('NONE','G','H','H1','X')",
        "drug_schedule NOT IN ('H','H1','X') OR requires_prescription",
        "COALESCE(drug_schedule,'NONE')='NONE' AND NOT COALESCE(requires_prescription,false) AND NOT COALESCE(ndps_regulated,false) AND schedule_h2_applicable_from IS NULL AND traceability_product_code IS NULL",
        "btrim(regulatory_ruleset_version) <> ''",
        "status <> 'active' OR num_nonnulls(drug_schedule,requires_prescription,ndps_regulated,regulatory_ruleset_version)=4",
        "schedule_h2_applicable_from IS NULL OR product_kind='medicine'",
        "traceability_product_code IS NULL OR btrim(traceability_product_code) <> ''",
    ):
        if fragment not in product_checks:
            issues.append(f"catalog.products: missing regulatory constraint fragment {fragment}")
    product_invariants = {item.get("name") for item in product.get("cross_row_invariants", [])}
    if "products_regulatory_classification" not in product_invariants:
        issues.append("catalog.products: ingredient-derived regulatory classification invariant is required")
    ingredient = by_name.get("catalog.ingredients", {})
    ingredient_columns = _column_map(ingredient)
    expected_ingredient_regulatory = {
        "drugs_rules_schedule": ["text", False, None],
        "ndps_classification": ["text", False, None],
        "classification_ruleset_version": ["varchar(64)", False, None],
    }
    for column_name, expected_shape in expected_ingredient_regulatory.items():
        if column_name not in ingredient_columns or ingredient_columns[column_name][1:4] != expected_shape:
            issues.append(f"catalog.ingredients: {column_name} must be explicit and non-null without a default")
    if "controlled_schedule" in ingredient_columns:
        issues.append("catalog.ingredients: controlled_schedule conflates independent legal classifications")
    ingredient_checks = " ".join(item.get("expression", "") for item in ingredient.get("checks", []))
    if "drugs_rules_schedule IN ('NONE','G','H','H1','X')" not in ingredient_checks:
        issues.append("catalog.ingredients: incomplete Drugs Rules schedule vocabulary")
    if "ndps_classification IN ('NONE','NARCOTIC_DRUG','PSYCHOTROPIC_SUBSTANCE','CONTROLLED_SUBSTANCE')" not in ingredient_checks:
        issues.append("catalog.ingredients: incomplete NDPS classification vocabulary")
    if "btrim(classification_ruleset_version) <> ''" not in ingredient_checks:
        issues.append("catalog.ingredients: missing classification ruleset provenance")
    if any("price_list" in name for name in names):
        issues.append("catalog: deferred price-list tables are forbidden")
    for association in ("core.role_permissions", "catalog.product_ingredients", "automation.agent_grant_capabilities"):
        if by_name.get(association, {}).get("tenant_class") != "tenant_association":
            issues.append(f"{association}: pure association must not use a surrogate id")
    required_automation_columns = {
        "automation.agent_grants": {"consent_text_hash", "expires_at", "revoked_at", "revoked_by_membership_id"},
        "automation.command_requests": {
            "idempotency_key_hash", "request_hash", "preview_hash", "calculation_hash",
            "aggregate_version_hash", "operation_mode", "branch_id", "requested_amount",
            "currency_code", "requests_sensitive_read", "target_resource_type",
            "target_resource_id", "target_row_version", "request_reason",
            "serializer_version", "expires_at",
        },
        "automation.command_approvals": {"approver_membership_id", "preview_hash", "valid_until_at"},
    }
    for table_name, required_columns in required_automation_columns.items():
        actual = set(_column_map(by_name.get(table_name, {"columns": []})))
        if required_columns - actual:
            issues.append(f"{table_name}: missing consent/approval binding columns {sorted(required_columns - actual)}")
    approval_invariants = {item["name"] for item in by_name.get("automation.command_approvals", {}).get("cross_row_invariants", [])}
    if "command_approval_separation_of_duties" not in approval_invariants or "command_approval_exact_preview" not in approval_invariants:
        issues.append("automation.command_approvals: exact-preview binding and separation-of-duties invariants are required")

    audit = by_name.get("core.audit_events", {"columns": [], "checks": []})
    audit_columns = _column_map(audit)
    expected_audit_columns = {
        "chain_sequence": ["bigint", False, None],
        "mutation_kind": ["text", False, None],
        "evidence_version": ["varchar(32)", False, None],
        "before_state_hash": ["bytea", True, None],
        "after_state_hash": ["bytea", True, None],
        "evidence_hash": ["bytea", False, None],
        "previous_event_hash": ["bytea", True, None],
    }
    for column_name, expected_shape in expected_audit_columns.items():
        if column_name not in audit_columns or audit_columns[column_name][1:4] != expected_shape:
            issues.append(f"core.audit_events: {column_name} must have audit-evidence shape {expected_shape}")
    audit_checks = " ".join(item.get("expression", "") for item in audit.get("checks", []))
    for fragment in (
        "chain_sequence > 0",
        "mutation_kind IN ('insert','update','delete','command')",
        "mutation_kind='insert' AND before_state_hash IS NULL AND after_state_hash IS NOT NULL",
        "mutation_kind='delete' AND before_state_hash IS NOT NULL AND after_state_hash IS NULL",
        "evidence_version='pg-jsonb-sha256-v1'",
        "octet_length(before_state_hash) = 32",
        "octet_length(after_state_hash) = 32",
    ):
        if fragment not in audit_checks:
            issues.append(f"core.audit_events: missing audit constraint fragment {fragment}")
    if not any(
        unique.get("columns") == ["org_id", "chain_sequence"] and unique.get("where") is None
        for unique in audit.get("uniques", [])
    ):
        issues.append("core.audit_events: organization chain sequence must be uniquely constrained")
    outbox = by_name.get("core.outbox_events", {"columns": [], "checks": []})
    outbox_columns = _column_map(outbox)
    if "event_version" not in outbox_columns or outbox_columns["event_version"][1:4] != ["bigint", False, "1"]:
        issues.append("core.outbox_events: event_version must align with bigint aggregate row_version")
    if "event_version > 0" not in " ".join(
        item.get("expression", "") for item in outbox.get("checks", [])
    ):
        issues.append("core.outbox_events: positive event_version constraint is required")

    commercial_calculation_lines = {
        "sales.order_lines",
        "sales.invoice_lines",
        "procurement.purchase_order_lines",
        "procurement.supplier_invoice_lines",
    }
    commercial_shapes = {
        "quoted_unit_rate": ["numeric(20,4)", True, None],
        "price_basis": ["text", False, None],
        "free_supply_tax_treatment": ["text", True, None],
        "uom_conversion_factor": ["numeric(20,6)", True, None],
        "line_discount_kind": ["text", False, None],
        "line_discount_basis": ["text", False, None],
        "line_discount_value": ["numeric(20,6)", False, None],
        "document_discount_eligible": ["boolean", False, None],
        "line_discount_amount": ["numeric(20,2)", False, None],
        "line_taxable_discount_amount": ["numeric(20,2)", False, None],
        "document_discount_amount": ["numeric(20,2)", False, None],
        "document_taxable_discount_amount": ["numeric(20,2)", False, None],
        "net_value_amount": ["numeric(20,2)", False, None],
        "gst_taxable_value": ["numeric(20,2)", False, None],
        "taxability_snapshot": ["text", False, None],
        "tax_charge_mechanism": ["text", False, None],
    }
    for table_name in commercial_calculation_lines:
        table = by_name.get(table_name, {"columns": [], "checks": []})
        columns = _column_map(table)
        checks = " ".join(item.get("expression", "") for item in table.get("checks", []))
        for column_name, expected_shape in commercial_shapes.items():
            if column_name not in columns or columns[column_name][1:4] != expected_shape:
                issues.append(
                    f"{table_name}: {column_name} must have calculation-authority shape {expected_shape}"
                )
        required_check_fragments = (
            "price_basis IN ('tax_exclusive','tax_inclusive')",
            "free_supply_tax_treatment IN ('excluded_from_taxable_value','included_at_unit_rate')",
            "uom_conversion_factor>0",
            "base_billed_quantity=round(billed_quantity*uom_conversion_factor,6)",
            "base_free_quantity=round(free_quantity*uom_conversion_factor,6)",
            "line_kind='charge' AND free_supply_tax_treatment IS NULL",
            "billed_quantity>=0",
            "billed_quantity+free_quantity>0",
            "base_billed_quantity>=0",
            "base_billed_quantity+base_free_quantity>0",
            "line_discount_kind IN ('none','percent','amount')",
            "line_discount_basis IN ('taxable_value','price_value')",
            "line_discount_kind='none' AND line_discount_value=0",
            "document_discount_amount>=0",
            "taxability_snapshot IN ('taxable','zero_rated','exempt','nil_rated','non_gst')",
            "gst_taxable_value=net_value_amount",
            "taxability_snapshot IN ('exempt','nil_rated','non_gst') AND gst_taxable_value=0",
            "tax_charge_mechanism IN ('normal','reverse_charge')",
            "tax_charge_mechanism='reverse_charge' AND line_total=net_value_amount",
            "price_basis='tax_exclusive'",
            "cgst_rate=sgst_rate AND cgst_amount=sgst_amount",
        )
        for fragment in required_check_fragments:
            if fragment not in checks:
                issues.append(f"{table_name}: missing calculation CHECK fragment {fragment}")

    return_calculation_lines = {
        "sales.return_lines",
        "procurement.purchase_return_lines",
    }
    return_shapes = {
        "quoted_unit_rate": ["numeric(20,4)", False, None],
        "price_basis": ["text", False, None],
        "free_supply_tax_treatment": ["text", False, None],
        "reversal_value_basis": ["text", False, None],
        "billed_quantity": ["numeric(20,6)", False, None],
        "free_quantity": ["numeric(20,6)", False, None],
        "uom_conversion_factor": ["numeric(20,6)", False, None],
        "net_value_amount": ["numeric(20,2)", False, None],
        "gst_taxable_value": ["numeric(20,2)", False, None],
        "taxability_snapshot": ["text", False, None],
        "tax_charge_mechanism": ["text", False, None],
    }
    for table_name in return_calculation_lines:
        table = by_name.get(table_name, {"columns": [], "checks": []})
        columns = _column_map(table)
        checks = " ".join(item.get("expression", "") for item in table.get("checks", []))
        for column_name, expected_shape in return_shapes.items():
            if column_name not in columns or columns[column_name][1:4] != expected_shape:
                issues.append(
                    f"{table_name}: {column_name} must have reversal-authority shape {expected_shape}"
                )
        for fragment in (
            "price_basis IN ('tax_exclusive','tax_inclusive')",
            "free_supply_tax_treatment IN ('excluded_from_taxable_value','included_at_unit_rate')",
            "reversal_value_basis IN ('billed_quantity','base_quantity')",
            "base_billed_quantity=round(billed_quantity*uom_conversion_factor,6)",
            "base_free_quantity=round(free_quantity*uom_conversion_factor,6)",
            "reversal_value_basis<>'billed_quantity' OR billed_quantity>0",
            "taxability_snapshot IN ('taxable','zero_rated','exempt','nil_rated','non_gst')",
            "gst_taxable_value=net_value_amount",
            "tax_charge_mechanism IN ('normal','reverse_charge')",
            "tax_charge_mechanism='reverse_charge' AND line_total=net_value_amount",
            "cgst_rate=sgst_rate AND cgst_amount=sgst_amount",
        ):
            if fragment not in checks:
                issues.append(f"{table_name}: missing reversal CHECK fragment {fragment}")

    for table_name in commercial_calculation_lines | return_calculation_lines:
        columns = _column_map(by_name.get(table_name, {"columns": []}))
        legacy_columns = {"unit_rate", "unit_rate_snapshot", "price_mode", "discount_rate", "discount_amount", "taxable_amount"}
        if legacy_columns & columns.keys():
            issues.append(f"{table_name}: legacy ambiguous calculation field is forbidden")

    commercial_calculation_headers = {
        "sales.orders",
        "sales.invoices",
        "procurement.purchase_orders",
        "procurement.supplier_invoices",
    }
    header_shapes = {
        "document_discount_kind": ["text", False, None],
        "document_discount_basis": ["text", False, None],
        "document_discount_value": ["numeric(20,6)", False, None],
        "net_value_total": ["numeric(20,2)", False, "0"],
        "gst_taxable_total": ["numeric(20,2)", False, "0"],
        "supply_type": ["text", False, None],
        "zero_rated_payment_mode": ["text", False, None],
        "tax_charge_mechanism": ["text", False, None],
        "recipient_assessed_tax_total": ["numeric(20,2)", False, "0"],
        "rounding_policy": ["text", False, None],
    }
    for table_name in commercial_calculation_headers:
        table = by_name.get(table_name, {"columns": [], "checks": []})
        columns = _column_map(table)
        checks = " ".join(item.get("expression", "") for item in table.get("checks", []))
        for column_name, expected_shape in header_shapes.items():
            if column_name not in columns or columns[column_name][1:4] != expected_shape:
                issues.append(
                    f"{table_name}: {column_name} must have document-calculation shape {expected_shape}"
                )
        fragments = [
            "document_discount_kind IN ('none','percent','amount')",
            "document_discount_basis IN ('taxable_value','price_value')",
            "document_discount_kind='none' AND document_discount_value=0",
            "gst_taxable_total<=net_value_total",
            "zero_rated_payment_mode IN ('not_applicable','without_payment','with_igst')",
            "tax_charge_mechanism IN ('normal','reverse_charge')",
            "tax_charge_mechanism='reverse_charge' AND recipient_assessed_tax_total=cgst_total+sgst_total+igst_total+cess_total",
            "rounding_policy IN ('none','nearest_rupee')",
            "rounding_adjustment=grand_total-",
        ]
        fragments.append(
            "supply_type IN ('export','sez') AND zero_rated_payment_mode IN ('without_payment','with_igst')"
            if table_name.startswith("sales.")
            else "supply_type='sez' AND zero_rated_payment_mode IN ('without_payment','with_igst')"
        )
        for fragment in fragments:
            if fragment not in checks:
                issues.append(f"{table_name}: missing document calculation CHECK fragment {fragment}")

    for table_name in return_calculation_lines:
        columns = _column_map(by_name.get(table_name, {"columns": []}))
        if columns.get("base_billed_quantity", [None, None, None, "missing"])[3] is not None:
            issues.append(f"{table_name}: base_billed_quantity must have no default")
        if columns.get("base_free_quantity", [None, None, None, "missing"])[3] is not None:
            issues.append(f"{table_name}: base_free_quantity must have no default")

    for table_name in {"sales.returns", "procurement.purchase_returns"}:
        columns = _column_map(by_name.get(table_name, {"columns": []}))
        return_header_shapes = {
            "net_value_total": ["numeric(20,2)", False, "0"],
            "gst_taxable_total": ["numeric(20,2)", False, "0"],
            "zero_rated_payment_mode": ["text", False, None],
            "tax_charge_mechanism": ["text", False, None],
            "recipient_assessed_tax_total": ["numeric(20,2)", False, "0"],
            "rounding_policy": ["text", False, None],
        }
        for column_name, expected_shape in return_header_shapes.items():
            if column_name not in columns or columns[column_name][1:4] != expected_shape:
                issues.append(
                    f"{table_name}: {column_name} must have return-calculation shape {expected_shape}"
                )

    inventory_header = by_name.get("inventory.inventory_documents", {"columns": [], "checks": [], "foreign_keys": []})
    inventory_header_columns = _column_map(inventory_header)
    for column_name, expected_shape in {
        "costing_method_snapshot": ["text", False, None],
        "supplier_invoice_id": ["uuid", True, None],
    }.items():
        if column_name not in inventory_header_columns or inventory_header_columns[column_name][1:4] != expected_shape:
            issues.append(f"inventory.inventory_documents: {column_name} has invalid landed-cost shape")
    inventory_header_checks = " ".join(item.get("expression", "") for item in inventory_header.get("checks", []))
    for fragment in ("costing_method_snapshot='moving_weighted_average'", "document_type='cost_adjustment'", "supplier_invoice_id IS NOT NULL"):
        if fragment not in inventory_header_checks:
            issues.append(f"inventory.inventory_documents: missing landed-cost CHECK fragment {fragment}")

    inventory_line = by_name.get("inventory.inventory_document_lines", {"columns": [], "checks": []})
    inventory_line_columns = _column_map(inventory_line)
    landed_cost_line_shapes = {
        "supplier_invoice_line_id": ["uuid", True, None],
        "cost_allocation_method": ["text", True, None],
        "cost_allocation_basis_quantity": ["numeric(20,6)", True, None],
        "cost_allocation_basis_value": ["numeric(20,2)", True, None],
        "cost_allocation_weight": ["numeric(20,12)", True, None],
    }
    for column_name, expected_shape in landed_cost_line_shapes.items():
        if column_name not in inventory_line_columns or inventory_line_columns[column_name][1:4] != expected_shape:
            issues.append(f"inventory.inventory_document_lines: {column_name} has invalid landed-cost shape")
    inventory_line_checks = " ".join(item.get("expression", "") for item in inventory_line.get("checks", []))
    for fragment in ("movement_kind='value_adjustment'", "cost_allocation_method IN ('direct','quantity_weighted','value_weighted')", "cost_allocation_weight>0"):
        if fragment not in inventory_line_checks:
            issues.append(f"inventory.inventory_document_lines: missing landed-cost CHECK fragment {fragment}")

    ledger_checks = " ".join(item.get("expression", "") for item in by_name.get("inventory.stock_ledger_entries", {}).get("checks", []))
    for fragment in ("entry_kind='value_adjustment' AND quantity_delta=0 AND value_delta<>0", "quantity_delta=0 AND entry_kind IN ('value_adjustment','reversal')"):
        if fragment not in ledger_checks:
            issues.append(f"inventory.stock_ledger_entries: missing value-adjustment CHECK fragment {fragment}")

    supplier_invoice_line_columns = _column_map(by_name.get("procurement.supplier_invoice_lines", {"columns": []}))
    if supplier_invoice_line_columns.get("inventory_cost_treatment", [None, None, None, None])[1:4] != ["text", False, None]:
        issues.append("procurement.supplier_invoice_lines: inventory_cost_treatment must be explicit")

    optional_scope_tables = {
        "core.access_grants",
        "core.settings",
        "core.document_sequences",
        "automation.agent_grants",
    }
    for table_name in optional_scope_tables:
        table = by_name.get(table_name, {})
        partial_unique_predicates = [
            index.get("where", "")
            for index in table.get("indexes", [])
            if index.get("unique")
        ]
        if not any("branch_id IS NULL" in predicate for predicate in partial_unique_predicates) or not any(
            "branch_id IS NOT NULL" in predicate for predicate in partial_unique_predicates
        ):
            issues.append(f"{table_name}: optional branch scope requires separate NULL/non-NULL partial unique indexes")
    return issues


def main() -> int:
    contract, authority, documents = load_catalog()
    issues = validate_catalog(contract, authority, documents)
    if issues:
        print(json.dumps({"valid": False, "issues": issues}, indent=2))
        return 1
    print(json.dumps({"valid": True, "tables": contract["table_count"], "domains": list(CANONICAL_DOMAINS)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
