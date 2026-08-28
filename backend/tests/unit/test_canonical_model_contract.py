from copy import deepcopy
from pathlib import Path

from scripts import validate_canonical_model


REPO_ROOT = Path(__file__).resolve().parents[3]


def _model_and_topology():
    model = validate_canonical_model.load_model(REPO_ROOT)
    return model, validate_canonical_model.load_topology(model, REPO_ROOT)


def test_candidate_contract_matches_canonical_topology_exactly():
    model, topology = _model_and_topology()

    assert validate_canonical_model.validate_model(model, topology) == []


def test_inventory_is_unique_qualified_and_counted():
    model, _ = _model_and_topology()
    names = validate_canonical_model.flattened_tables(model["canonical_tables"])

    assert len(names) == model["canonical_physical_table_count"] == 110
    assert len(names) == len(set(names))
    assert all(name.count(".") == 1 and not name.startswith("public.") for name in names)


def test_typed_aggregates_replace_generic_commerce_documents():
    model, _ = _model_and_topology()
    names = set(validate_canonical_model.flattened_tables(model["canonical_tables"]))

    assert "commerce.documents" not in names
    assert {"sales.orders", "sales.invoices", "sales.returns"} <= names
    assert {"procurement.purchase_orders", "procurement.supplier_invoices"} <= names


def test_lean_core_defers_unowned_features_but_retains_operational_workflows():
    model, _ = _model_and_topology()
    names = set(validate_canonical_model.flattened_tables(model["canonical_tables"]))

    assert model["topology_overlay"]["deferred_tables"]
    assert set(model["topology_overlay"]["deferred_tables"]) == validate_canonical_model.DEFERRED_TABLES
    assert not (names & validate_canonical_model.DEFERRED_TABLES)
    assert {"hr.departments", "hr.employees"} <= names
    assert {"finance.expense_claims", "finance.expense_claim_lines"} <= names
    assert {
        "automation.agent_grants",
        "automation.agent_grant_capabilities",
        "automation.command_requests",
        "automation.command_approvals",
    } <= names
    assert {"core.permissions", "core.attachments"} <= names


def test_required_canonical_facts_are_locked():
    model, topology = _model_and_topology()
    names = set(validate_canonical_model.flattened_tables(model["canonical_tables"]))
    authority_names = set(validate_canonical_model.flattened_tables(topology["canonical_tables"]))

    assert set(model["topology_overlay"]["required_tables"]) == validate_canonical_model.REQUIRED_REPLACEMENT_TABLES
    assert validate_canonical_model.REQUIRED_REPLACEMENT_TABLES <= names
    assert names == authority_names


def test_corrected_cardinality_and_regulated_invariants_are_explicit():
    model, _ = _model_and_topology()
    cardinality = "\n".join(model["cardinality_contract"])
    invariants = "\n".join(model["regulated_invariants"])

    assert "invoice_dispatch_allocations" in cardinality
    assert "supplier_invoice_receipt_allocations" in cardinality
    assert "accounting_event" in cardinality
    assert "portal document 1:M" in cardinality
    assert "product m:n ingredient" in cardinality.lower()
    assert "recall m:n batch" in cardinality.lower()
    assert "on-hand quantity" in invariants
    assert "available quantity" in invariants
    assert "never journal entries" in invariants
    assert "stock_count" in invariants


def test_auth_profile_multi_org_and_relational_permissions_are_explicit():
    model, _ = _model_and_topology()
    identity = model["identity_contract"]

    assert "globally unique auth_user_id" in identity["profile"]
    assert "(org_id,user_id)" in identity["membership"]
    assert "relational" in identity["authorization"]
    assert "JSON" in identity["authorization"]


def test_uuid_type_is_uniform_but_generation_is_uuidv7_preferred():
    model, _ = _model_and_topology()
    types = model["type_contract"]

    assert types["resource_id"] == "uuid"
    assert "UUIDv7" in types["id_generation"]
    assert "gen_random_uuid()" in types["id_generation"]
    assert "public_id" in types["id_generation"]
    assert types["money_intermediate"] == "numeric(20,4)"
    assert types["money_posted"] == "numeric(20,2)"
    assert types["quantity"] == "numeric(20,6)"
    assert types["rate"] == "numeric(9,6)"


def test_tenant_primary_keys_are_composite_without_redundant_identity_index():
    model, _ = _model_and_topology()
    tenant = model["tenant_contract"]

    assert "PRIMARY KEY (org_id, id)" in tenant["tenant_primary_key"]
    assert "non-addressable associations" in tenant["tenant_primary_key"]
    assert "rebuildable projections" in tenant["tenant_primary_key"]
    assert "natural composite primary key without id" in tenant["tenant_primary_key"]
    assert "global core.users" in tenant["global_primary_key"]
    assert "redundant UNIQUE (org_id,id)" in tenant["index_rule"]
    assert tenant["actor_setting"] == "app.membership_id"
    assert "core.memberships" in tenant["child_fk"]
    assert "core.organizations" in tenant["rls"]
    assert "core.users" in tenant["rls"]


def test_validator_rejects_topology_drift():
    model, topology = _model_and_topology()
    changed = deepcopy(model)
    changed["canonical_tables"]["sales"].remove("sales.invoices")

    issues = validate_canonical_model.validate_model(changed, topology)

    assert any(issue.code == "topology_drift" for issue in issues)
    assert any(issue.code == "missing_required_fact" and issue.table == "sales.invoices" for issue in issues)


def test_validator_rejects_deferred_and_missing_replacement_tables():
    model, topology = _model_and_topology()
    changed = deepcopy(model)
    changed["canonical_tables"]["sales"].append("sales.schemes")
    changed["canonical_tables"]["tax"].remove("tax.documents")

    issues = validate_canonical_model.validate_model(changed, topology)

    assert any(issue.code == "deferred_table_present" and issue.table == "sales.schemes" for issue in issues)
    assert any(issue.code == "missing_required_replacement" and issue.table == "tax.documents" for issue in issues)


def test_baseline_remains_fail_closed_until_executable_controls_are_reviewed():
    model, _ = _model_and_topology()

    assert model["state"] == "candidate_not_deployed"
    assert model["baseline_generation_gates"]["current_result"] == (
        "blocked_pending_executable_invariants_rls_and_platform_controls"
    )
