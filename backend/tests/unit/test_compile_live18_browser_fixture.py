import hashlib
import inspect
import json
from pathlib import Path

import pytest

from scripts.compile_live18_browser_fixture import (
    AUTHORITATIVE_SELECTOR_KEYS,
    FixtureCompileError,
    MAX_SCALAR_BYTES,
    SCALAR_SCHEMA,
    TEMPLATE_SCHEMA,
    compile_fixture,
    load_authoritative_facts,
    load_reviewed_scalars,
    supplier_invoice_chain_choices,
    validate_reviewed_scalar_pack,
    _compile_value,
    _authoritative_selector_row,
    _validate_compiled_steps,
    _operation_facts,
    resolve_authoritative_facts,
)


def test_authoritative_selector_uses_named_batch_identity_after_account_fields():
    row = tuple(f"value-{index}" for index in range(len(AUTHORITATIVE_SELECTOR_KEYS))) + (
        "2026-08-28",
        "2026-08-28T12:00",
    )

    resolved = _authoritative_selector_row(row)

    assert resolved["cash_on_hand_account_name"] == "value-24"
    assert resolved["direct_issue_batch_id"] == "value-33"
    assert resolved["direct_issue_batch_id"] != resolved["cash_on_hand_account_name"]


def test_deferred_expense_claim_does_not_block_ready_fact_resolution() -> None:
    source = inspect.getsource(resolve_authoritative_facts)

    assert "expense_claim_sql" not in source
    assert "expense_claim_rows" not in source
    assert "LIVE18-EXPENSE-" not in source


def test_authoritative_fact_evidence_is_bound_to_exact_identity_and_run(
    tmp_path: Path,
) -> None:
    identities = {"branch_id": "11111111-1111-4111-8111-111111111111"}
    evidence = {
        "schema": "aasopharma.live18.authoritative-facts.v1",
        "expected_sha": "a" * 40,
        "project_ref": "abcdefghijklmnopqrst",
        "run_token": "1234-2",
        "auth_user_id": "22222222-2222-4222-8222-222222222222",
        "organization_id": "33333333-3333-4333-8333-333333333333",
        "fixture_identities": identities,
        "facts": {key: {} for key in ("identity", "display", "clock", "choice")},
    }
    path = tmp_path / "facts.json"
    path.write_text(json.dumps(evidence), encoding="utf-8")

    assert load_authoritative_facts(
        path,
        expected_sha="a" * 40,
        project_ref="abcdefghijklmnopqrst",
        run_token="1234-2",
        auth_user_id="22222222-2222-4222-8222-222222222222",
        org_id="33333333-3333-4333-8333-333333333333",
        identities=identities,
    ) == evidence["facts"]

    evidence["run_token"] = "other-run"
    path.write_text(json.dumps(evidence), encoding="utf-8")
    with pytest.raises(FixtureCompileError, match="run_token differs"):
        load_authoritative_facts(
            path,
            expected_sha="a" * 40,
            project_ref="abcdefghijklmnopqrst",
            run_token="1234-2",
            auth_user_id="22222222-2222-4222-8222-222222222222",
            org_id="33333333-3333-4333-8333-333333333333",
            identities=identities,
        )


def _matrix(path: Path, *, defer_last: bool = False) -> Path:
    operations = [
        {"id": f"operation_{number}", "approval_policy": "actor_confirmation"}
        for number in range(1, 19)
    ]
    deferred = [{
        "id": "operation_18",
        "status": "deferred",
        "blocker_code": "EXPLICIT_TEST_DEFERRAL",
        "blocker": "Test-only operation is outside the ready scope.",
    }] if defer_last else []
    path.write_text(json.dumps({
        "operation_count": 18,
        "required_operation_count": 17 if defer_last else 18,
        "deferred_operations": deferred,
        "operations": operations,
    }))
    return path


def _templates(root: Path) -> Path:
    root.mkdir()
    for number in range(1, 19):
        operation = f"operation_{number}"
        steps = {
            "missing_required_steps": [
                {"actor": "requester", "action": "expectText", "locator": {"kind": "text", "name": "Required", "exact": True}},
                {"actor": "requester", "action": "expectDisabled", "locator": {"kind": "role", "role": "button", "name": "Prepare", "exact": True}},
            ],
            "prepare_steps": [{"actor": "requester", "action": "goto", "value": "/?module={{fact.display.branch_code}}"}],
            "approval_steps": [
                {"actor": "reviewer", "action": "expectText", "locator": {"kind": "text", "name": "{{command_request_id}}", "exact": True}},
                {"actor": "reviewer", "action": "expectText", "locator": {"kind": "testId", "name": "canonical-immutable-preview"}, "value": "{{fact.display.branch_code}}"},
            ],
            "execute_steps": [{"actor": "requester", "action": "expectText", "locator": {"kind": "text", "name": "{{command_request_id}}", "exact": True}}],
        }
        if number == 1:
            steps["prepare_steps"].append({"actor": "requester", "action": "fill", "locator": {"kind": "label", "name": "Quantity", "exact": True}, "value": "{{scalar.quantity}}"})
        template = {
            "template_schema": TEMPLATE_SCHEMA,
            "operation_id": operation,
            "lifecycle_mode": "split",
            "steps": steps,
        }
        (root / f"{operation}.json").write_text(json.dumps(template))
    return root


def test_compiles_exact_18_from_facts_and_only_used_reviewed_scalars(tmp_path: Path) -> None:
    fixture = compile_fixture(
        _matrix(tmp_path / "matrix.json"), _templates(tmp_path / "templates"),
        {"display": {"branch_code": "sales"}}, {"quantity": "1.000000"},
    )
    assert fixture["fixture_schema"] == "aasopharma.live18.fixture.v1"
    assert len(fixture["operations"]) == 18
    assert fixture["operations"]["operation_1"]["prepare_steps"][1]["value"] == "1.000000"
    assert fixture["operations"]["operation_1"]["approval_steps"][0]["locator"]["name"] == "{{command_request_id}}"


def test_compiles_only_registry_ready_templates_without_claiming_deferred_work(
    tmp_path: Path,
) -> None:
    matrix = _matrix(tmp_path / "matrix.json", defer_last=True)
    templates = _templates(tmp_path / "templates")
    deferred_template = json.loads((templates / "operation_18.json").read_text())
    deferred_template["release_status"] = "deferred"
    deferred_template["release_blocker_code"] = "EXPLICIT_TEST_DEFERRAL"
    deferred_template["steps"]["prepare_steps"].append({
        "actor": "requester",
        "action": "fill",
        "locator": {"kind": "label", "name": "Deferred", "exact": True},
        "value": "{{scalar.deferred_value}}",
    })
    (templates / "operation_18.json").write_text(json.dumps(deferred_template))
    readiness = tmp_path / "readiness.json"
    readiness.write_text(json.dumps({
        "ready_count": 17,
        "deferred_count": 1,
        "operations": [
            {
                "id": f"operation_{number}",
                "status": "deferred" if number == 18 else "ready",
                **({
                    "blocker_code": "EXPLICIT_TEST_DEFERRAL",
                    "blocker": "Test-only operation is outside the ready scope.",
                } if number == 18 else {}),
            }
            for number in range(1, 19)
        ],
    }))

    fixture = compile_fixture(
        matrix,
        templates,
        {"display": {"branch_code": "sales"}},
        {"quantity": "1.000000", "deferred_value": "reviewed-later"},
        readiness,
    )

    assert len(fixture["operations"]) == 17
    assert "operation_18" not in fixture["operations"]


def test_combined_actor_confirmation_lifecycle_is_explicit_and_policy_bound(tmp_path: Path) -> None:
    matrix = _matrix(tmp_path / "matrix.json")
    templates = _templates(tmp_path / "templates")
    path = templates / "operation_1.json"
    template = json.loads(path.read_text())
    template["lifecycle_mode"] = "combined_actor_confirmation"
    path.write_text(json.dumps(template))
    fixture = compile_fixture(
        matrix, templates, {"display": {"branch_code": "sales"}}, {"quantity": "1.000000"},
    )
    assert fixture["operations"]["operation_1"]["lifecycle_mode"] == "combined_actor_confirmation"

    matrix_value = json.loads(matrix.read_text())
    matrix_value["operations"][0]["approval_policy"] = "separate_approver"
    matrix.write_text(json.dumps(matrix_value))
    with pytest.raises(FixtureCompileError, match="requires actor_confirmation"):
        compile_fixture(
            matrix, templates, {"display": {"branch_code": "sales"}}, {"quantity": "1.000000"},
        )


def test_missing_template_and_unused_scalar_fail_closed(tmp_path: Path) -> None:
    matrix = _matrix(tmp_path / "matrix.json")
    templates = _templates(tmp_path / "templates")
    (templates / "operation_18.json").unlink()
    with pytest.raises(FixtureCompileError, match="missing evidence-backed UI template"):
        compile_fixture(matrix, templates, {"display": {"branch_code": "sales"}}, {})
    _templates(tmp_path / "other")
    with pytest.raises(FixtureCompileError, match="unused scalar"):
        compile_fixture(
            matrix,
            tmp_path / "other",
            {"display": {"branch_code": "sales"}},
            {"quantity": "1.000000", "surprise": "1"},
        )


def test_cross_operation_resource_tokens_only_reference_earlier_matrix_rows(tmp_path: Path) -> None:
    matrix = _matrix(tmp_path / "matrix.json")
    templates = _templates(tmp_path / "templates")
    second = templates / "operation_2.json"
    template = json.loads(second.read_text())
    template["steps"]["prepare_steps"].append({
        "actor": "requester",
        "action": "fill",
        "locator": {"kind": "label", "name": "Source resource", "exact": True},
        "value": "{{resource_operation_1}}",
    })
    second.write_text(json.dumps(template))
    compile_fixture(
        matrix, templates, {"display": {"branch_code": "sales"}},
        {"quantity": "1.000000"},
    )

    first = templates / "operation_1.json"
    template = json.loads(first.read_text())
    template["steps"]["prepare_steps"].append({
        "actor": "requester",
        "action": "fill",
        "locator": {"kind": "label", "name": "Future resource", "exact": True},
        "value": "{{resource_operation_2}}",
    })
    first.write_text(json.dumps(template))
    with pytest.raises(FixtureCompileError, match="unavailable prior operation resources"):
        compile_fixture(
            matrix, templates, {"display": {"branch_code": "sales"}},
            {"quantity": "1.000000"},
        )


def test_scalar_pack_rejects_identity_authority_and_size(tmp_path: Path) -> None:
    path = tmp_path / "scalars.json"
    path.write_text(json.dumps({"schema": SCALAR_SCHEMA, "values": {"product_id": "not-even-a-uuid"}}))
    with pytest.raises(FixtureCompileError, match="identity/time authority"):
        load_reviewed_scalars(path)
    path.write_bytes(b" " * (MAX_SCALAR_BYTES + 1))
    with pytest.raises(FixtureCompileError, match="exceeds"):
        load_reviewed_scalars(path)


def test_compiler_rejects_template_that_does_not_target_exact_command(tmp_path: Path) -> None:
    matrix = _matrix(tmp_path / "matrix.json")
    templates = _templates(tmp_path / "templates")
    path = templates / "operation_1.json"
    template = json.loads(path.read_text())
    template["steps"]["execute_steps"][0]["locator"]["name"] = "First pending"
    path.write_text(json.dumps(template))
    with pytest.raises(FixtureCompileError, match="does not target captured command"):
        compile_fixture(
            matrix,
            templates,
            {"display": {"branch_code": "sales"}},
            {"quantity": "1.000000"},
        )


def test_compiler_requires_visible_negative_boundary_and_immutable_preview_fact(
    tmp_path: Path,
) -> None:
    matrix = _matrix(tmp_path / "matrix.json")
    templates = _templates(tmp_path / "templates")
    path = templates / "operation_1.json"
    template = json.loads(path.read_text())
    template["steps"]["missing_required_steps"] = [
        template["steps"]["missing_required_steps"][0]
    ]
    path.write_text(json.dumps(template))
    with pytest.raises(FixtureCompileError, match="write-boundary CTA"):
        compile_fixture(
            matrix, templates, {"display": {"branch_code": "sales"}},
            {"quantity": "1.000000"},
        )

    templates = _templates(tmp_path / "other-templates")
    path = templates / "operation_1.json"
    template = json.loads(path.read_text())
    template["steps"]["approval_steps"] = [
        template["steps"]["approval_steps"][0]
    ]
    path.write_text(json.dumps(template))
    with pytest.raises(FixtureCompileError, match="immutable preview fact"):
        compile_fixture(
            matrix, templates, {"display": {"branch_code": "sales"}},
            {"quantity": "1.000000"},
        )


def test_customer_search_text_is_not_mistaken_for_a_communication_action(tmp_path: Path) -> None:
    matrix = _matrix(tmp_path / "matrix.json")
    templates = _templates(tmp_path / "templates")
    path = templates / "operation_1.json"
    template = json.loads(path.read_text())
    template["steps"]["prepare_steps"].append({
        "actor": "requester",
        "action": "fill",
        "locator": {"kind": "placeholder", "name": "Search by name or phone", "exact": True},
        "value": "Canonical Customer",
    })
    path.write_text(json.dumps(template))
    compile_fixture(
        matrix,
        templates,
        {"display": {"branch_code": "sales"}},
        {"quantity": "1.000000"},
    )

    template["steps"]["prepare_steps"].append({
        "actor": "requester",
        "action": "click",
        "locator": {"kind": "role", "role": "button", "name": "Send WhatsApp", "exact": True},
    })
    path.write_text(json.dumps(template))
    with pytest.raises(FixtureCompileError, match="targets communication"):
        compile_fixture(
            matrix,
            templates,
            {"display": {"branch_code": "sales"}},
            {"quantity": "1.000000"},
        )


def test_template_readiness_names_all_18_operations_without_false_ready_claims() -> None:
    root = Path(__file__).resolve().parents[3]
    matrix = json.loads(
        (root / "backend/tests/live_acceptance/operation_matrix.json").read_text()
    )
    readiness = json.loads(
        (root / "docs/testing/live18-ui-template-readiness.json").read_text()
    )
    assert readiness["schema"] == "aasopharma.live18.ui-template-readiness.v1"
    assert {row["id"] for row in readiness["operations"]} == {
        row["id"] for row in matrix["operations"]
    }
    assert readiness["ready_count"] == sum(
        row["status"] == "ready" for row in readiness["operations"]
    )
    assert readiness["ready_count"] == matrix["required_operation_count"] == 17
    assert readiness["deferred_count"] == len(matrix["deferred_operations"]) == 1
    assert all(
        row["status"] in {"ready", "blocked", "deferred"}
        for row in readiness["operations"]
    )
    assert all(
        (row["status"] == "ready" and not row["missing"])
        or (row["status"] in {"blocked", "deferred"} and row["missing"])
        for row in readiness["operations"]
    )
    deferred = next(row for row in readiness["operations"] if row["status"] == "deferred")
    assert deferred["id"] == "expense_claim"
    assert deferred["blocker_code"] == "EXPENSE_EVIDENCE_STORAGE_DEFERRED"
    assert all(
        all((root / source).is_file() for source in row["evidence_sources"])
        for row in readiness["operations"]
    )


def test_stock_transfer_template_compiles_only_reviewed_choices() -> None:
    root = Path(__file__).resolve().parents[3]
    template = json.loads(
        (root / "frontend/e2e/live18/templates/stock_transfer.json").read_text()
    )
    facts = {
        "identity": {
            "branch_id": "d3000000-0000-7000-8000-000000000005",
            "product_id": "d3000000-0000-7000-8000-000000000007",
            "direct_issue_batch_id": "d3000000-0000-7000-8000-000000000008",
            "saleable_location_id": "d3200000-0000-7000-8000-000000000006",
            "transfer_destination_branch_id": "d3000000-0000-7000-8000-000000000028",
            "transfer_destination_location_id": "d3200000-0000-7000-8000-00000000000f",
        },
        "display": {"product_code": "DEMO-PRODUCT", "product_name": "Demo Product"},
    }
    used: set[str] = set()
    operation = _compile_value(
        {"lifecycle_mode": template["lifecycle_mode"], **template["steps"]},
        facts,
        {"stock_transfer_quantity": "1.000000", "stock_transfer_distance_km": "12.50"},
        used,
    )
    _validate_compiled_steps("stock_transfer", operation, "actor_confirmation")
    assert used == {"stock_transfer_quantity", "stock_transfer_distance_km"}
    assert operation["prepare_steps"][5]["value"] == "12.50"
    assert operation["prepare_steps"][9]["value"] == "1.000000"


def test_sales_order_delivery_date_is_derived_from_canonical_clock_and_reviewed_offset() -> None:
    used: set[str] = set()
    facts = _operation_facts(
        "sales_order",
        {"clock": {"business_date": "2026-08-25"}},
        {"sales_order_delivery_offset_days": "2"},
        used,
    )
    assert facts["choice"]["sales_order_requested_delivery_date"] == "2026-08-27"
    assert used == {"sales_order_delivery_offset_days"}

    with pytest.raises(FixtureCompileError, match="integer from 1 through 30"):
        _operation_facts(
            "sales_order",
            {"clock": {"business_date": "2026-08-25"}},
            {"sales_order_delivery_offset_days": "0"},
            set(),
        )


def test_sales_invoice_template_compiles_exact_canonical_selectors_and_reviewed_choices() -> None:
    root = Path(__file__).resolve().parents[3]
    template = json.loads(
        (root / "frontend/e2e/live18/templates/sales_invoice.json").read_text()
    )
    scalars = {
        "sales_invoice_quantity": "1.125000",
        "sales_invoice_rate": "84.1250",
        "sales_invoice_discount_percent": "0.000000",
        "sales_invoice_free_quantity": "1.000000",
        "sales_invoice_free_supply_tax_treatment": "excluded_from_taxable_value",
        "sales_invoice_distance_km": "1.25",
        "sales_order_quantity": "1.125000",
        "sales_order_rate": "84.1250",
    }
    facts = {
        "identity": {
            "customer_account_id": "d3000000-0000-7000-8000-000000000040",
            "product_id": "d3000000-0000-7000-8000-000000000043",
            "delivery_address_id": "d3000000-0000-7000-8000-000000000041",
            "delivery_address_row_version": "7",
            "direct_issue_batch_id": "d3000000-0000-7000-8000-000000000042",
        },
        "display": {
            "customer_code": "DEMO-CUSTOMER",
            "customer_name": "Demo Customer",
            "product_code": "DEMO-PRODUCT",
            "product_name": "Demo Product",
            "direct_issue_available_base_quantity": "100.000000",
            "sales_uom_multiplier": "10.000000",
        },
    }
    used: set[str] = set()
    operation_facts = _operation_facts(
        "sales_invoice", facts, scalars, used,
    )
    operation = _compile_value(
        {"lifecycle_mode": template["lifecycle_mode"], **template["steps"]},
        operation_facts,
        scalars,
        used,
    )
    _validate_compiled_steps("sales_invoice", operation, "actor_confirmation")
    assert used == {
        "sales_invoice_quantity",
        "sales_invoice_rate",
        "sales_invoice_discount_percent",
        "sales_invoice_free_quantity",
        "sales_invoice_distance_km",
    }
    assert operation["prepare_steps"][1]["locator"]["name"] == (
        "Import posted delivery challan"
    )
    assert operation["prepare_steps"][2]["locator"]["name"] == (
        "Select canonical challan {{resource_delivery_challan}}"
    )
    assert operation["prepare_steps"][3]["locator"]["name"] == "Import Selected"
    assert operation["prepare_steps"][6]["locator"]["name"] == (
        "select-address-d3000000-0000-7000-8000-000000000041-v7"
    )

    bad_scalars = {**scalars, "sales_invoice_free_quantity": "0.000000"}
    with pytest.raises(FixtureCompileError, match="free_quantity must be greater than"):
        _operation_facts("sales_invoice", facts, bad_scalars, set())
    bad_treatment = {
        **scalars,
        "sales_invoice_free_supply_tax_treatment": "implicit-default",
    }
    with pytest.raises(FixtureCompileError, match="explicit canonical treatment"):
        _operation_facts("sales_invoice", facts, bad_treatment, set())
    mismatched_rate = {**scalars, "sales_invoice_rate": "84.1251"}
    with pytest.raises(FixtureCompileError, match="rate must equal"):
        _operation_facts("sales_invoice", facts, mismatched_rate, set())
    insufficient_stock = {
        **scalars,
        "sales_invoice_quantity": "10.000000",
        "sales_order_quantity": "10.000000",
    }
    with pytest.raises(FixtureCompileError, match="exceed the exact selected batch stock"):
        _operation_facts("sales_invoice", facts, insufficient_stock, set())


def test_stock_adjustment_runs_before_mutating_sales_and_uses_authoritative_stock() -> None:
    root = Path(__file__).resolve().parents[3]
    matrix = json.loads(
        (root / "backend/tests/live_acceptance/operation_matrix.json").read_text()
    )
    template = json.loads(
        (root / "frontend/e2e/live18/templates/stock_adjustment.json").read_text()
    )
    scalars = {
        "sales_invoice_quantity": "1.000000",
        "sales_invoice_free_quantity": "0.500000",
        "sales_order_quantity": "2.000000",
        "stock_adjustment_loss_quantity": "1.000000",
    }
    facts = {
        "identity": {
            "product_id": "d3000000-0000-7000-8000-000000000041",
            "direct_issue_batch_id": "d3000000-0000-7000-8000-000000000042",
            "count_uom_conversion_id": "d3000000-0000-7000-8000-000000000043",
            "cycle_count_evidence_attachment_id": "d3000000-0000-7000-8000-000000000044",
        },
        "display": {
            "product_code": "DEMO-PRODUCT",
            "product_name": "Demo Product",
            "cycle_count_system_base_quantity": "100.000000",
            "sales_uom_multiplier": "10.000000",
            "cycle_count_uom_multiplier": "10.000000",
            "cycle_count_uom_code": "PK",
            "cycle_count_evidence_label": "retained · 2026-08-25 · d3000000",
        },
        "clock": {
            "business_date": "2026-08-25",
            "cycle_count_completed_at_utc": "2026-08-25T10:15:30.000Z",
        },
    }
    used: set[str] = set()
    operation_facts = _operation_facts(
        "stock_adjustment", facts, scalars, used,
    )
    operation = _compile_value(
        {"lifecycle_mode": template["lifecycle_mode"], **template["steps"]},
        operation_facts,
        scalars,
        used,
    )
    _validate_compiled_steps("stock_adjustment", operation, "separate_approver")
    assert used == {"stock_adjustment_loss_quantity"}
    operation_ids = [row["id"] for row in matrix["operations"]]
    assert operation_ids.index("stock_adjustment") < operation_ids.index("sales_order")
    assert operation_ids.index("sales_order") < operation_ids.index("delivery_challan")
    assert operation_ids.index("delivery_challan") < operation_ids.index("sales_invoice")
    assert operation_facts["choice"] == {
        "stock_adjustment_counted_quantity": "9.000000",
        "stock_adjustment_expected_system_base_quantity": "100.000000",
    }
    assert operation["prepare_steps"][5]["locator"]["name"] == (
        "select-batch-d3000000-0000-7000-8000-000000000042"
    )
    assert operation["prepare_steps"][9]["value"] == "100.000000"
    assert operation["approval_steps"][3]["value"] == "{{command_request_id}}"
    assert operation["execute_steps"][2]["locator"]["name"] == (
        "Post Approved Cycle Count Once"
    )

    with pytest.raises(FixtureCompileError, match="greater than zero"):
        _operation_facts(
            "stock_adjustment",
            facts,
            {**scalars, "stock_adjustment_loss_quantity": "0.000000"},
            set(),
        )


def test_delivery_challan_proves_ordered_selected_batch_stock_prerequisite() -> None:
    facts = {
        "display": {
            "direct_issue_available_base_quantity": "100.000000",
            "cycle_count_system_base_quantity": "100.000000",
            "sales_uom_multiplier": "10.000000",
            "cycle_count_uom_multiplier": "10.000000",
        },
    }
    scalars = {
        "stock_adjustment_loss_quantity": "1.000000",
        "sales_invoice_quantity": "7.000000",
        "sales_invoice_free_quantity": "1.000000",
        "sales_order_quantity": "7.000000",
    }

    assert _operation_facts(
        "delivery_challan", facts, scalars, set()
    ) is facts

    with pytest.raises(FixtureCompileError, match="stock remaining"):
        _operation_facts(
            "delivery_challan",
            facts,
            {
                **scalars,
                "sales_invoice_quantity": "11.000001",
                "sales_order_quantity": "11.000001",
            },
            set(),
        )

    with pytest.raises(FixtureCompileError, match="must equal"):
        _operation_facts(
            "delivery_challan",
            facts,
            {**scalars, "sales_order_quantity": "1.000001"},
            set(),
        )

    with pytest.raises(FixtureCompileError, match="exact cycle-count"):
        _operation_facts(
            "delivery_challan",
            {
                "display": {
                    **facts["display"],
                    "cycle_count_system_base_quantity": "99.000000",
                },
            },
            scalars,
            set(),
        )


def test_bank_reconciliation_template_targets_exact_run_scoped_pair() -> None:
    root = Path(__file__).resolve().parents[3]
    template = json.loads(
        (root / "frontend/e2e/live18/templates/bank_reconciliation.json").read_text()
    )
    facts = {
        "identity": {
            "bank_reconciliation_statement_line_id": (
                "d3000000-0000-7000-8000-000000000041"
            ),
            "bank_reconciliation_journal_entry_id": (
                "d3000000-0000-7000-8000-000000000042"
            ),
        },
        "display": {
            "bank_reconciliation_candidate_label": (
                "2026-08-25 · Demo Bank · DEMO-UI-BANK-32840459528-1 "
                "line 1 · JV-2026-001 · ₹1.00"
            ),
        },
        "choice": {"bank_reconciliation_match_method": "reference_exact"},
    }
    used: set[str] = set()
    operation = _compile_value(
        {"lifecycle_mode": template["lifecycle_mode"], **template["steps"]},
        facts,
        {},
        used,
    )
    _validate_compiled_steps(
        "bank_reconciliation", operation, "separate_approver"
    )
    assert not used
    exact_pair = (
        "d3000000-0000-7000-8000-000000000041:"
        "d3000000-0000-7000-8000-000000000042"
    )
    assert operation["missing_required_steps"][1]["value"] == exact_pair
    assert operation["prepare_steps"][1]["value"] == exact_pair
    assert operation["prepare_steps"][3]["value"] == "reference_exact"
    assert operation["approval_steps"][2]["value"] == "{{command_request_id}}"
    assert operation["execute_steps"][1]["value"] == "{{command_request_id}}"


def test_destruction_template_targets_exact_gst_lineage_and_split_review() -> None:
    root = Path(__file__).resolve().parents[3]
    compiler = (
        root / "backend/scripts/compile_live18_browser_fixture.py"
    ).read_text()
    template = json.loads(
        (root / "frontend/e2e/live18/templates/destruction.json").read_text()
    )
    facts = {
        "identity": {
            "destruction_batch_id": "d3000000-0000-7000-8000-000000000041",
            "destruction_uom_conversion_id": "d3000000-0000-7000-8000-000000000042",
            "destruction_certificate_attachment_id": "d3000000-0000-7000-8000-000000000043",
            "destruction_itc_reversal_evidence_attachment_id": "d3000000-0000-7000-8000-000000000044",
        },
        "display": {
            "destruction_reason": "Certified destruction of quarantined goods",
            "destruction_authority_reference": "certificate.pdf · sha256:abcd",
            "destruction_witness_name": "Independent Reviewer",
            "destruction_witness_credential": "canonical-membership:reviewer",
        },
        "clock": {"destruction_confirmed_at_utc": "2026-08-25T10:00:00.000Z"},
        "choice": {"destruction_reason_code": "quality_rejected"},
    }
    used: set[str] = set()
    operation = _compile_value(
        {"lifecycle_mode": template["lifecycle_mode"], **template["steps"]},
        facts,
        {},
        used,
    )
    _validate_compiled_steps("destruction", operation, "separate_approver")
    assert not used
    assert operation["prepare_steps"][1]["value"] == (
        "d3000000-0000-7000-8000-000000000041:"
        "d3000000-0000-7000-8000-000000000042"
    )
    assert operation["prepare_steps"][2]["value"].endswith("43")
    assert operation["prepare_steps"][3]["value"].endswith("44")
    assert operation["prepare_steps"][9]["value"] == "2026-08-25T10:00:00.000Z"
    assert operation["approval_steps"][2]["value"] == "{{command_request_id}}"
    assert operation["execute_steps"][1]["value"] == "{{command_request_id}}"
    assert "count(DISTINCT lot.id)=1" in compiler
    assert (
        "sum(lot.remaining_cgst_amount)*balance.on_hand_quantity/"
        in compiler
    )


def test_customer_credit_note_targets_exact_invoice_and_post_return_ceiling() -> None:
    root = Path(__file__).resolve().parents[3]
    template = json.loads(
        (root / "frontend/e2e/live18/templates/customer_credit_note.json").read_text()
    )
    scalars = {
        "sales_invoice_quantity": "12.000000",
        "sales_invoice_free_quantity": "2.000000",
        "sales_return_billed_quantity": "4.000000",
        "sales_return_free_quantity": "1.000000",
        "customer_credit_note_billed_quantity": "2.000000",
        "customer_credit_note_free_quantity": "1.000000",
        "customer_credit_note_reason": "Reviewed post-sale price correction",
    }
    facts = {
        "identity": {
            "sales_adjustment_rule_id": "d3000000-0000-7000-8000-000000000050",
            "recipient_itc_evidence_attachment_id": "d3000000-0000-7000-8000-000000000051",
        },
        "display": {"product_name": "Demo Product"},
        "clock": {"recipient_itc_confirmed_at_utc": "2026-08-25T10:15:30.000Z"},
    }
    used: set[str] = set()
    operation = _compile_value(
        {"lifecycle_mode": template["lifecycle_mode"], **template["steps"]},
        _operation_facts("customer_credit_note", facts, scalars, used),
        scalars,
        used,
    )
    _validate_compiled_steps(
        "customer_credit_note", operation, "separate_approver"
    )
    assert used == {
        "customer_credit_note_billed_quantity",
        "customer_credit_note_free_quantity",
        "customer_credit_note_reason",
    }
    assert operation["prepare_steps"][1]["value"] == "{{resource_sales_invoice}}"
    assert operation["prepare_steps"][6]["value"] == (
        "d3000000-0000-7000-8000-000000000051"
    )

    with pytest.raises(FixtureCompileError, match="post-return source ceiling"):
        _operation_facts(
            "customer_credit_note",
            facts,
            {**scalars, "customer_credit_note_billed_quantity": "9.000000"},
            set(),
        )


def test_supplier_debit_note_reuses_portal_reconciled_return_quantities() -> None:
    root = Path(__file__).resolve().parents[3]
    template = json.loads(
        (root / "frontend/e2e/live18/templates/supplier_debit_note.json").read_text()
    )
    scalars = {
        "goods_receipt_accepted_quantity": "50.000000",
        "goods_receipt_free_quantity": "2.500000",
        "purchase_return_billed_quantity": "10.000000",
        "purchase_return_free_quantity": "0.000000",
        "supplier_debit_note_reason": "Supplier-issued price correction",
    }
    facts = {
        "identity": {
            "purchase_adjustment_rule_id": "d3000000-0000-7000-8000-000000000052",
            "supplier_credit_note_portal_line_id": "d3000000-0000-7000-8000-000000000053",
        },
        "display": {"product_name": "Demo Product"},
    }
    used: set[str] = set()
    operation_facts = _operation_facts(
        "supplier_debit_note", facts, scalars, used,
    )
    operation = _compile_value(
        {"lifecycle_mode": template["lifecycle_mode"], **template["steps"]},
        operation_facts,
        scalars,
        used,
    )
    _validate_compiled_steps(
        "supplier_debit_note", operation, "separate_approver"
    )
    assert used == {"supplier_debit_note_reason"}
    assert operation_facts["choice"] == {
        "supplier_debit_note_billed_quantity": "10.000000",
        "supplier_debit_note_free_quantity": "0.000000",
    }
    assert operation["prepare_steps"][2]["value"] == "{{resource_supplier_invoice}}"
    assert operation["prepare_steps"][7]["value"] == (
        "d3000000-0000-7000-8000-000000000053"
    )

    with pytest.raises(FixtureCompileError, match="post-return source ceiling"):
        _operation_facts(
            "supplier_debit_note",
            facts,
            {
                **scalars,
                "goods_receipt_accepted_quantity": "15.000000",
            },
            set(),
        )


def test_expense_claim_uploads_exact_pdf_and_targets_reviewed_accounts_and_amount(
    tmp_path: Path,
) -> None:
    root = Path(__file__).resolve().parents[3]
    template = json.loads(
        (root / "frontend/e2e/live18/templates/expense_claim.json").read_text()
    )
    receipt_path = tmp_path / "reviewed-expense-receipt.pdf"
    receipt_path.write_bytes(b"%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n")
    scalars = {
        "expense_claim_amount": "168.00",
        "expense_claim_purpose": "Reviewed customer-site visit",
        "expense_claim_merchant": "Reviewed Taxi Private Limited",
        "expense_claim_description": "Taxi from branch to customer site",
        "expense_receipt_pdf_path": str(receipt_path),
    }
    facts = {
        "identity": {
            "branch_id": "d3000000-0000-7000-8000-000000000005",
            "expense_reimbursement_account_id": "d3000000-0000-7000-8000-000000000060",
            "expense_receipt_attachment_id": "d3000000-0000-7000-8000-000000000061",
            "expense_account_id": "d3000000-0000-7000-8000-000000000062",
        },
        "clock": {"expense_receipt_document_date": "2026-08-25"},
    }
    used: set[str] = set()
    operation = _compile_value(
        {"lifecycle_mode": template["lifecycle_mode"], **template["steps"]},
        _operation_facts("expense_claim", facts, scalars, used),
        scalars,
        used,
    )
    _validate_compiled_steps("expense_claim", operation, "separate_approver")
    assert used == set(scalars)
    assert operation["prepare_steps"][1]["value"] == (
        "d3000000-0000-7000-8000-000000000005"
    )
    assert operation["prepare_steps"][3]["action"] == "setInputFiles"
    assert operation["prepare_steps"][3]["value"] == str(receipt_path)
    assert operation["prepare_steps"][10]["value"] == (
        "d3000000-0000-7000-8000-000000000062"
    )
    assert operation["prepare_steps"][13]["value"] == "168.00"

    with pytest.raises(FixtureCompileError, match="greater than zero"):
        _operation_facts(
            "expense_claim",
            facts,
            {**scalars, "expense_claim_amount": "0.00"},
            set(),
        )

def test_sales_order_template_compiles_reviewed_commercial_choices() -> None:
    root = Path(__file__).resolve().parents[3]
    template = json.loads(
        (root / "frontend/e2e/live18/templates/sales_order.json").read_text()
    )
    scalars = {
        "sales_order_delivery_offset_days": "2",
        "sales_order_quantity": "1.125000",
        "sales_order_rate": "84.1250",
        "sales_invoice_discount_percent": "5.000000",
        "sales_invoice_free_quantity": "0.250000",
        "sales_invoice_free_supply_tax_treatment": "included_at_unit_rate",
    }
    used: set[str] = set()
    facts = _operation_facts(
        "sales_order",
        {
            "clock": {"business_date": "2026-08-25"},
            "identity": {
                "customer_account_id": "d3000000-0000-7000-8000-000000000041",
                "delivery_address_id": "d3000000-0000-7000-8000-000000000044",
                "delivery_address_row_version": "7",
                "product_id": "d3000000-0000-7000-8000-000000000042",
                "direct_issue_batch_id": "d3000000-0000-7000-8000-000000000043",
            },
            "display": {
                "customer_code": "DEMO-CUSTOMER",
                "customer_name": "Demo Customer",
                "product_code": "DEMO-PRODUCT",
                "product_name": "Demo Product",
            },
        },
        scalars,
        used,
    )
    operation = _compile_value(
        {"lifecycle_mode": template["lifecycle_mode"], **template["steps"]},
        facts,
        scalars,
        used,
    )
    _validate_compiled_steps("sales_order", operation, "actor_confirmation")
    assert used == set(scalars)
    assert operation["prepare_steps"][1]["value"] == "2026-08-27"
    assert operation["prepare_steps"][4] == {
        "actor": "requester",
        "action": "expectText",
        "locator": {
            "kind": "testId",
            "name": "sales-order-delivery-address-d3000000-0000-7000-8000-000000000044-v7",
        },
        "value": "Delivery address ready",
    }
    assert operation["prepare_steps"][7]["action"] == "click"
    assert operation["prepare_steps"][7]["locator"] == {
        "kind": "testId",
        "name": "select-batch-d3000000-0000-7000-8000-000000000043",
    }
    assert operation["prepare_steps"][8]["value"] == "1.125000"
    assert operation["prepare_steps"][9]["value"] == "84.1250"
    assert operation["prepare_steps"][10]["value"] == "5.000000"
    assert operation["prepare_steps"][11]["value"] == "0.250000"
    assert operation["prepare_steps"][12]["action"] == "press"
    assert operation["prepare_steps"][12]["value"] == "Tab"
    assert operation["prepare_steps"][13]["value"] == "included_at_unit_rate"


def test_live18_templates_use_only_canonical_hash_routes() -> None:
    root = Path(__file__).resolve().parents[3]
    allowed = {
        "/#/sales/invoice",
        "/#/sales/sales-order",
        "/#/sales/challan",
        "/#/purchase/purchase-order",
        "/#/purchase/purchase-history",
        "/#/purchase/supplier-invoice",
        "/#/payment/payment-entry",
        "/#/payment/supplier-payment",
        "/#/payment/supplier-advance",
        "/#/payment/bank-reconciliation",
        "/#/payment/expense-claims",
        "/#/returns/sales-return",
        "/#/returns/purchase-return",
        "/#/returns/approval-inbox",
            "/#/returns/resume-post",
        "/#/stock-management/stock-adjustment",
        "/#/stock-management/stock-transfer",
        "/#/stock-management/inventory-destruction",
        "/#/credit-debit-note",
    }
    observed: set[str] = set()
    phases = (
        "missing_required_steps",
        "prepare_steps",
        "approval_steps",
        "execute_steps",
    )
    for template_path in sorted(
        (root / "frontend/e2e/live18/templates").glob("*.json")
    ):
        template = json.loads(template_path.read_text())
        for phase in phases:
            observed.update(
                step["value"]
                for step in template["steps"][phase]
                if step["action"] == "goto"
            )
    assert observed == allowed


def test_purchase_order_template_compiles_reviewed_commercial_choices() -> None:
    root = Path(__file__).resolve().parents[3]
    template = json.loads(
        (root / "frontend/e2e/live18/templates/purchase_order.json").read_text()
    )
    scalars = {
        "purchase_order_quantity": "2.000000",
        "purchase_order_delivery_offset_days": "3",
        "purchase_order_rate": "84.0000",
        "purchase_order_line_discount_percent": "0.000000",
        "purchase_order_free_quantity": "0.000000",
        "purchase_order_document_discount": "0.00",
        "purchase_order_freight_charge": "0.00",
    }
    used: set[str] = set()
    facts = _operation_facts(
        "purchase_order",
        {
            "clock": {"business_date": "2026-08-25"},
            "identity": {
                "branch_id": "d3000000-0000-7000-8000-000000000040",
                "supplier_account_id": "d3000000-0000-7000-8000-000000000041",
                "product_id": "d3000000-0000-7000-8000-000000000042",
            },
            "display": {
                "supplier_code": "DEMO-SUPPLIER",
                "supplier_name": "Demo Supplier",
                "product_code": "DEMO-PRODUCT",
                "product_name": "Demo Product",
            },
        },
        scalars,
        used,
    )
    operation = _compile_value(
        {"lifecycle_mode": template["lifecycle_mode"], **template["steps"]},
        facts,
        scalars,
        used,
    )
    _validate_compiled_steps("purchase_order", operation, "actor_confirmation")
    assert used == set(scalars)
    assert operation["prepare_steps"][1]["value"] == (
        "d3000000-0000-7000-8000-000000000040"
    )
    assert operation["prepare_steps"][2]["value"] == "2026-08-28"
    assert operation["prepare_steps"][7]["value"] == "2.000000"
    assert operation["prepare_steps"][8]["value"] == "84.0000"


def test_supplier_invoice_template_uses_run_scoped_authority_and_reviewed_attestation() -> None:
    root = Path(__file__).resolve().parents[3]
    template = json.loads(
        (root / "frontend/e2e/live18/templates/supplier_invoice.json").read_text()
    )
    attestation = (
        "I confirm taxable resale business use and that no Section 17 "
        "blocked-credit condition applies to these goods."
    )
    scalars = {"supplier_invoice_itc_attestation": attestation}
    facts = {
        "identity": {},
        "display": {"product_name": "Demo Product"},
        "choice": {
            "supplier_invoice_number": "DEMO-UI-SUP-32840459528-1",
            "supplier_invoice_date": "2026-08-25",
            "supplier_invoice_received_date": "2026-08-25",
        },
    }
    used: set[str] = set()
    operation = _compile_value(
        {"lifecycle_mode": template["lifecycle_mode"], **template["steps"]},
        facts,
        scalars,
        used,
    )
    _validate_compiled_steps("supplier_invoice", operation, "actor_confirmation")
    assert used == set(scalars)
    assert operation["prepare_steps"][1]["value"] == "{{resource_goods_receipt}}"
    assert operation["prepare_steps"][2]["value"] == facts["choice"]["supplier_invoice_number"]
    assert operation["prepare_steps"][6]["locator"]["name"] == (
        "Landed-cost basis for Demo Product"
    )
    assert operation["prepare_steps"][6]["value"] == "direct"
    assert operation["prepare_steps"][7]["locator"]["name"] == attestation


def test_supplier_invoice_chain_normalizes_exact_reviewed_economics() -> None:
    values = {
        "purchase_order_quantity": "2.000000",
        "purchase_order_delivery_offset_days": "3",
        "purchase_order_rate": "84.0000",
        "purchase_order_line_discount_percent": "5.000000",
        "purchase_order_free_quantity": "0.000000",
        "purchase_order_document_discount": "0.60",
        "purchase_order_freight_charge": "0.00",
        "goods_receipt_received_quantity": "2.000000",
        "goods_receipt_accepted_quantity": "2.000000",
        "goods_receipt_rejected_quantity": "0.000000",
        "goods_receipt_free_quantity": "0.000000",
        "goods_receipt_mrp": "150.00",
        "goods_receipt_qc_status": "accepted",
    }
    pack = {"schema": SCALAR_SCHEMA, "values": values}

    validated = validate_reviewed_scalar_pack(
        pack, byte_size=len(json.dumps(pack).encode("utf-8"))
    )

    assert supplier_invoice_chain_choices(validated) == values


def test_supplier_invoice_facts_require_scalar_bound_portal_economics() -> None:
    values = {
        "purchase_order_quantity": "2.000000",
        "purchase_order_delivery_offset_days": "3",
        "purchase_order_rate": "84.0000",
        "purchase_order_line_discount_percent": "5.000000",
        "purchase_order_free_quantity": "0.000000",
        "purchase_order_document_discount": "0.60",
        "purchase_order_freight_charge": "0.00",
        "goods_receipt_received_quantity": "2.000000",
        "goods_receipt_accepted_quantity": "2.000000",
        "goods_receipt_rejected_quantity": "0.000000",
        "goods_receipt_free_quantity": "0.000000",
        "goods_receipt_mrp": "150.00",
        "goods_receipt_qc_status": "accepted",
    }
    invoice_number = "DEMO-UI-SUP-1234-1"
    economics = {
        "gst_taxable_total": "159.06",
        "cgst_total": "9.54",
        "sgst_total": "9.54",
        "igst_total": "0.00",
        "cess_total": "0.00",
        "grand_total": "178.14",
    }
    source_hash = hashlib.sha256(json.dumps({
        "invoice_number": invoice_number,
        "reviewed_chain": supplier_invoice_chain_choices(values),
        "economics": economics,
    }, separators=(",", ":"), sort_keys=True).encode()).hexdigest()
    facts = {
        "choice": {
            "supplier_invoice_number": invoice_number,
            "supplier_invoice_portal_taxable_amount": economics["gst_taxable_total"],
            "supplier_invoice_portal_cgst_amount": economics["cgst_total"],
            "supplier_invoice_portal_sgst_amount": economics["sgst_total"],
            "supplier_invoice_portal_igst_amount": economics["igst_total"],
            "supplier_invoice_portal_cess_amount": economics["cess_total"],
            "supplier_invoice_portal_total_amount": economics["grand_total"],
            "supplier_invoice_portal_source_row_hash": source_hash,
        }
    }

    assert _operation_facts("supplier_invoice", facts, values, set()) == facts

    facts["choice"]["supplier_invoice_portal_source_row_hash"] = "0" * 64
    with pytest.raises(FixtureCompileError, match="not bound"):
        _operation_facts("supplier_invoice", facts, values, set())


@pytest.mark.parametrize(
    ("key", "value", "message"),
    (
        ("purchase_order_freight_charge", "1.00", "charge-line identity"),
        ("purchase_order_free_quantity", "1.000000", "zero free quantity"),
        ("goods_receipt_accepted_quantity", "1.000000", "accepted plus rejected"),
        ("goods_receipt_free_quantity", "1.000000", "free quantity"),
        ("goods_receipt_rejected_quantity", "1.000000", "accepted plus rejected"),
        ("goods_receipt_qc_status", "partial", "accepted QC"),
    ),
)
def test_supplier_invoice_chain_rejects_unreconciled_reviewed_choices(
    key: str, value: str, message: str
) -> None:
    values = {
        "purchase_order_quantity": "2.000000",
        "purchase_order_delivery_offset_days": "3",
        "purchase_order_rate": "84.0000",
        "purchase_order_line_discount_percent": "0.000000",
        "purchase_order_free_quantity": "0.000000",
        "purchase_order_document_discount": "0.00",
        "purchase_order_freight_charge": "0.00",
        "goods_receipt_received_quantity": "2.000000",
        "goods_receipt_accepted_quantity": "2.000000",
        "goods_receipt_rejected_quantity": "0.000000",
        "goods_receipt_free_quantity": "0.000000",
        "goods_receipt_mrp": "150.00",
        "goods_receipt_qc_status": "accepted",
    }
    values[key] = value

    with pytest.raises(FixtureCompileError, match=message):
        supplier_invoice_chain_choices(values)


def test_customer_receipt_template_targets_prior_certified_invoice() -> None:
    root = Path(__file__).resolve().parents[3]
    template = json.loads(
        (root / "frontend/e2e/live18/templates/customer_receipt.json").read_text()
    )
    scalars = {
        "customer_receipt_amount": "1.00",
        "customer_receipt_payment_method_label": "Bank",
    }
    facts = {
        "identity": {
            "bank_account_id": "d3000000-0000-7000-8000-000000000040",
            "customer_account_id": "d3000000-0000-7000-8000-000000000041",
            "customer_receipt_evidence_attachment_id": "d3000000-0000-7000-8000-000000000042",
        },
        "display": {
            "customer_code": "DEMO-CUSTOMER",
            "customer_name": "Demo Customer",
        },
    }
    used: set[str] = set()
    operation = _compile_value(
        {"lifecycle_mode": template["lifecycle_mode"], **template["steps"]},
        facts,
        scalars,
        used,
    )
    _validate_compiled_steps("customer_receipt", operation, "actor_confirmation")
    assert used == set(scalars)
    assert operation["prepare_steps"][9]["locator"]["name"] == (
        "Select canonical invoice {{resource_sales_invoice}}"
    )
    assert operation["prepare_steps"][7]["value"] == "LIVE18-RCPT-{{run_token}}"


def test_supplier_payment_template_targets_prior_certified_supplier_invoice() -> None:
    root = Path(__file__).resolve().parents[3]
    template = json.loads(
        (root / "frontend/e2e/live18/templates/supplier_payment.json").read_text()
    )
    attestation = "I reviewed the exact bank, reference, amount, and allocations and authorize posting."
    scalars = {
        "supplier_payment_amount": "0.01",
        "supplier_payment_method": "bank_transfer",
        "supplier_payment_posting_attestation": attestation,
    }
    facts = {
        "identity": {
            "supplier_account_id": "d3000000-0000-7000-8000-000000000042",
            "branch_id": "d3000000-0000-7000-8000-000000000043",
            "bank_account_id": "d3000000-0000-7000-8000-000000000044",
        },
    }
    used: set[str] = set()
    operation = _compile_value(
        {"lifecycle_mode": template["lifecycle_mode"], **template["steps"]},
        facts,
        scalars,
        used,
    )
    _validate_compiled_steps("supplier_payment", operation, "actor_confirmation")
    assert used == set(scalars)
    assert operation["prepare_steps"][7]["locator"]["name"] == (
        "allocate-supplier-invoice-{{resource_supplier_invoice}}"
    )
    assert operation["execute_steps"][1]["locator"]["name"] == "Post ₹0.01"


def test_supplier_advance_template_targets_prior_purchase_order_and_split_review() -> None:
    root = Path(__file__).resolve().parents[3]
    template = json.loads(
        (root / "frontend/e2e/live18/templates/supplier_advance.json").read_text()
    )
    approval = (
        "I independently reviewed the exact PO lineage, bank, gross amount, "
        "cash, and withholding and approve this command."
    )
    execution = (
        "I am the requester and authorize one idempotent execution of this "
        "approved preview."
    )
    scalars = {
        "supplier_advance_amount": "0.01",
        "supplier_advance_method": "bank_transfer",
        "supplier_advance_approval_attestation": approval,
        "supplier_advance_execution_attestation": execution,
    }
    facts = {
        "identity": {
            "supplier_account_id": "d3000000-0000-7000-8000-000000000042",
            "bank_account_id": "d3000000-0000-7000-8000-000000000044",
        },
    }
    used: set[str] = set()
    operation = _compile_value(
        {"lifecycle_mode": template["lifecycle_mode"], **template["steps"]},
        facts,
        scalars,
        used,
    )
    _validate_compiled_steps("supplier_advance", operation, "separate_approver")
    assert used == set(scalars)
    assert operation["lifecycle_mode"] == "split"
    assert operation["prepare_steps"][2]["value"] == "{{resource_purchase_order}}"
    assert operation["prepare_steps"][3]["value"] == "{{resource_purchase_order_line}}"
    assert operation["prepare_steps"][6]["value"] == "LIVE18-SADV-{{run_token}}"
    assert operation["approval_steps"][2]["value"] == "{{command_request_id}}"
    assert operation["approval_steps"][5]["locator"]["name"] == approval
    assert operation["execute_steps"][1]["value"] == "{{command_request_id}}"
    assert operation["execute_steps"][3]["locator"]["name"] == execution


def test_delivery_challan_template_targets_prior_certified_sales_order() -> None:
    root = Path(__file__).resolve().parents[3]
    template = json.loads(
        (root / "frontend/e2e/live18/templates/delivery_challan.json").read_text()
    )
    scalars = {"delivery_challan_distance_km": "1.25"}
    used: set[str] = set()
    operation = _compile_value(
        {"lifecycle_mode": template["lifecycle_mode"], **template["steps"]},
        {},
        scalars,
        used,
    )
    _validate_compiled_steps("delivery_challan", operation, "actor_confirmation")
    assert used == set(scalars)
    assert operation["prepare_steps"][2]["locator"]["name"] == (
        "Select canonical sales order {{resource_sales_order}}"
    )
    assert operation["prepare_steps"][5]["value"] == "1.25"
    assert operation["approval_steps"][0]["value"] == "{{command_request_id}}"
    assert operation["execute_steps"][0]["value"] == "{{command_request_id}}"


def test_sales_invoice_template_targets_prior_certified_dispatch() -> None:
    root = Path(__file__).resolve().parents[3]
    matrix = json.loads(
        (root / "backend/tests/live_acceptance/operation_matrix.json").read_text()
    )
    template = json.loads(
        (root / "frontend/e2e/live18/templates/sales_invoice.json").read_text()
    )
    operation_ids = [row["id"] for row in matrix["operations"]]
    assert operation_ids.index("sales_order") < operation_ids.index("delivery_challan")
    assert operation_ids.index("delivery_challan") < operation_ids.index("sales_invoice")
    serialized = json.dumps(template, sort_keys=True)
    assert "{{resource_delivery_challan}}" in serialized
    assert "{{resource_sales_order}}" not in serialized
    assert template["steps"]["prepare_steps"][2]["locator"] == {
        "kind": "role",
        "role": "button",
        "name": "Select canonical challan {{resource_delivery_challan}}",
        "exact": True,
    }


def test_goods_receipt_template_derives_clock_and_expiry_and_targets_prior_po() -> None:
    root = Path(__file__).resolve().parents[3]
    template = json.loads(
        (root / "frontend/e2e/live18/templates/goods_receipt.json").read_text()
    )
    scalars = {
        "goods_receipt_expiry_offset_days": "365",
        "goods_receipt_received_quantity": "2.000000",
        "goods_receipt_accepted_quantity": "2.000000",
        "goods_receipt_rejected_quantity": "0.000000",
        "goods_receipt_free_quantity": "0.000000",
        "goods_receipt_mrp": "150.00",
        "goods_receipt_qc_status": "accepted",
    }
    facts = {
        "identity": {
            "product_id": "d3000000-0000-7000-8000-000000000041",
            "uom_conversion_id": "d3000000-0000-7000-8000-000000000042",
            "saleable_location_id": "d3000000-0000-7000-8000-000000000044",
        },
        "clock": {
            "business_date": "2026-08-25",
            "business_datetime_local": "2026-08-25T14:30",
        },
    }
    used: set[str] = set()
    operation_facts = _operation_facts("goods_receipt", facts, scalars, used)
    operation = _compile_value(
        {"lifecycle_mode": template["lifecycle_mode"], **template["steps"]},
        operation_facts,
        scalars,
        used,
    )
    _validate_compiled_steps("goods_receipt", operation, "actor_confirmation")
    assert used == set(scalars)
    assert operation["missing_required_steps"][2]["value"] == (
        "{{resource_purchase_order}}"
    )
    assert operation["missing_required_steps"][3]["locator"]["name"] == (
        "Record canonical receipt for purchase order {{resource_purchase_order}}"
    )
    assert operation["prepare_steps"][2]["value"] == "{{resource_purchase_order}}"
    assert operation["prepare_steps"][3]["locator"]["name"] == (
        "Record canonical receipt for purchase order {{resource_purchase_order}}"
    )
    assert operation["prepare_steps"][4]["value"] == "2026-08-25T14:30"
    assert operation["prepare_steps"][7]["value"] == "2027-08-25"
    assert operation["prepare_steps"][13]["value"] == facts["identity"]["uom_conversion_id"]
    assert operation["prepare_steps"][14]["value"] == facts["identity"]["saleable_location_id"]


def test_purchase_return_template_targets_prior_supplier_invoice_and_split_review() -> None:
    root = Path(__file__).resolve().parents[3]
    template = json.loads(
        (root / "frontend/e2e/live18/templates/purchase_return.json").read_text()
    )
    scalars = {
        "purchase_return_billed_quantity": "0.010000",
        "purchase_return_free_quantity": "0.000000",
        "purchase_return_reason_label": "Damaged Goods",
        "purchase_return_gst_treatment_label": "Commercial only (no GST adjustment)",
        "purchase_return_transport_mode_label": "In person / hand carried",
        "purchase_return_distance_km": "1.00",
    }
    facts = {
        "identity": {
            "supplier_account_id": "d3000000-0000-7000-8000-000000000041",
            "supplier_destination_address_id": "d3000000-0000-7000-8000-000000000042",
        },
        "display": {
            "supplier_code": "DEMO-SUPPLIER",
            "supplier_name": "Demo Supplier",
            "product_name": "Demo Product",
        },
    }
    used: set[str] = set()
    operation = _compile_value(
        {"lifecycle_mode": template["lifecycle_mode"], **template["steps"]},
        facts,
        scalars,
        used,
    )
    _validate_compiled_steps("purchase_return", operation, "separate_approver")
    assert used == set(scalars)
    assert operation["prepare_steps"][3]["locator"]["name"] == (
        "select-supplier-invoice-{{resource_supplier_invoice}}"
    )
    assert operation["prepare_steps"][11] == {
        "actor": "requester",
        "action": "select",
        "locator": {
            "kind": "label",
            "name": "Supplier destination",
            "exact": True,
        },
        "value": facts["identity"]["supplier_destination_address_id"],
    }
    assert operation["approval_steps"][2]["locator"]["name"] == (
        "review-return-{{command_request_id}}"
    )
    assert operation["execute_steps"][2]["locator"]["name"] == (
        "open-return-{{command_request_id}}"
    )


def test_sales_return_template_targets_prior_sales_invoice_and_split_review() -> None:
    root = Path(__file__).resolve().parents[3]
    template = json.loads(
        (root / "frontend/e2e/live18/templates/sales_return.json").read_text()
    )
    scalars = {
        "sales_return_billed_quantity": "0.010000",
        "sales_return_free_quantity": "0.000000",
        "sales_return_condition": "sealed_resaleable",
        "sales_return_reason_label": "Damaged Goods",
        "sales_return_gst_treatment_label": "Commercial only (no GST adjustment)",
    }
    facts = {
        "identity": {
            "customer_account_id": "d3000000-0000-7000-8000-000000000043",
            "quarantine_location_id": "d3000000-0000-7000-8000-000000000044",
        },
        "display": {
            "customer_code": "DEMO-CUSTOMER",
            "customer_name": "Demo Customer",
            "product_name": "Demo Product",
        },
    }
    used: set[str] = set()
    operation = _compile_value(
        {"lifecycle_mode": template["lifecycle_mode"], **template["steps"]},
        facts,
        scalars,
        used,
    )
    _validate_compiled_steps("sales_return", operation, "separate_approver")
    assert used == set(scalars)
    assert operation["prepare_steps"][3]["locator"]["name"] == (
        "select-sales-invoice-{{resource_sales_invoice}}"
    )
    assert operation["prepare_steps"][8]["value"] == facts["identity"]["quarantine_location_id"]
    assert operation["approval_steps"][2]["locator"]["name"] == (
        "review-return-{{command_request_id}}"
    )
    assert operation["execute_steps"][2]["locator"]["name"] == (
        "open-return-{{command_request_id}}"
    )


@pytest.mark.parametrize(
    ("operation_id", "source_operation"),
    (
        ("sales_return_reversal", "sales_return"),
        ("purchase_return_reversal", "purchase_return"),
        ("adjustment_note_reversal", "customer_credit_note"),
    ),
)
def test_commercial_reversal_templates_use_exact_prior_resources_and_split_lifecycle(
    operation_id: str,
    source_operation: str,
) -> None:
    root = Path(__file__).resolve().parents[3]
    template = json.loads(
        (root / f"frontend/e2e/live23/templates/{operation_id}.json").read_text()
    )
    assert template["template_schema"] == "aasopharma.live23.ui-variant-template.v1"
    assert template["operation_id"] == operation_id
    rendered = json.dumps(template, sort_keys=True)
    assert f"{{{{resource_{source_operation}}}}}" in rendered
    assert "row_version}}" not in rendered
    assert "intercept" not in rendered.lower()
    operation = {
        "lifecycle_mode": template["lifecycle_mode"],
        **template["steps"],
    }
    _validate_compiled_steps(operation_id, operation, "separate_approver")
