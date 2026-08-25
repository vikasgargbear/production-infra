import json
from decimal import Decimal
from pathlib import Path

import pytest

from tests.live_canonical import conftest as live_fixtures
from tests.live_canonical.config import (
    DEFAULT_COMMAND_PATH,
    DEFAULT_PREPARE_PATH,
    DEFAULT_READY_PATH,
    LiveGateError,
    load_live_config,
)
from tests.live_canonical.oracle import (
    calculate_document,
    calculate_reversal,
    calculate_withholding,
)
from tests.live_canonical.reconciliation import RESOURCE_TABLES
from app.api.routes.internal.mcp_actions import (
    ACTION_POLICIES,
    ApprovalRequest,
    CommandExecutionResponse,
    PreparedCommandResponse,
    router as canonical_action_router,
)
from app.infrastructure.operator_actions.registry import ACTION_ADAPTER_BINDINGS


PROJECT_REF = "abcdefghijklmnopqrst"
AUTOMATION_MANIFEST = (
    Path(__file__).resolve().parents[3]
    / "database/canonical/commands_automation/automation-command-manifest.json"
)


def valid_env():
    return {
        "PHARMA_CANONICAL_LIVE_WRITE_ACK": "true",
        "PHARMA_CANONICAL_LIVE_TARGET_KIND": "disposable_test",
        "PHARMA_CANONICAL_LIVE_PROJECT_REF": PROJECT_REF,
        "PHARMA_CANONICAL_LIVE_ALLOWED_PROJECT_REF": PROJECT_REF,
        "PHARMA_CANONICAL_PRODUCTION_PROJECT_REFS": "zyxwvutsrqponmlkjihg",
        "PHARMA_CANONICAL_LIVE_DATABASE_URL": (
            f"postgresql://erp_runtime:secret@db.{PROJECT_REF}.supabase.co/postgres"
        ),
        "PHARMA_CANONICAL_LIVE_API_BASE_URL": "https://canonical-test.example.com",
        "PHARMA_CANONICAL_LIVE_SERVICE_TOKEN": "private-service-token",
        "PHARMA_CANONICAL_LIVE_DELEGATED_TOKEN_PATH": "/tmp/private-tokens.json",
        "PHARMA_CANONICAL_MCP_URL": "https://mcp-test.example.com/mcp",
        "PHARMA_CANONICAL_MCP_ACCESS_TOKEN": "private-mcp-token",
        "PHARMA_CANONICAL_LIVE_TEST_ORG_ID": "11111111-1111-4111-8111-111111111111",
        "PHARMA_CANONICAL_LIVE_TEST_AUTH_USER_ID": "33333333-3333-4333-8333-333333333333",
        "PHARMA_CANONICAL_LIVE_TEST_BRANCH_ID": "22222222-2222-4222-8222-222222222222",
        "PHARMA_CANONICAL_LIVE_DENIAL_ORG_ID": "44444444-4444-4444-8444-444444444444",
        "PHARMA_CANONICAL_LIVE_FIXTURE_INPUT_PATH": "/tmp/canonical-fixtures.json",
    }


@pytest.mark.parametrize(
    "name",
    [
        "PHARMA_CANONICAL_LIVE_WRITE_ACK",
        "PHARMA_CANONICAL_LIVE_TARGET_KIND",
        "PHARMA_CANONICAL_LIVE_PROJECT_REF",
        "PHARMA_CANONICAL_LIVE_ALLOWED_PROJECT_REF",
        "PHARMA_CANONICAL_PRODUCTION_PROJECT_REFS",
        "PHARMA_CANONICAL_LIVE_DATABASE_URL",
        "PHARMA_CANONICAL_LIVE_SERVICE_TOKEN",
        "PHARMA_CANONICAL_LIVE_DELEGATED_TOKEN_PATH",
        "PHARMA_CANONICAL_MCP_URL",
        "PHARMA_CANONICAL_MCP_ACCESS_TOKEN",
        "PHARMA_CANONICAL_LIVE_TEST_AUTH_USER_ID",
        "PHARMA_CANONICAL_LIVE_DENIAL_ORG_ID",
    ],
)
def test_live_gate_rejects_missing_values_before_clients_exist(name):
    env = valid_env()
    env.pop(name)
    with pytest.raises(LiveGateError):
        load_live_config(env)


def test_live_config_repr_redacts_all_secrets():
    config = load_live_config(valid_env())
    rendered = repr(config)
    assert "secret" not in rendered
    assert "private-service-token" not in rendered
    assert "private-mcp-token" not in rendered


def test_live_gate_binds_exact_project_and_denies_production():
    env = valid_env()
    env["PHARMA_CANONICAL_LIVE_ALLOWED_PROJECT_REF"] = "00000000000000000000"
    with pytest.raises(LiveGateError, match="allowed ref"):
        load_live_config(env)

    env = valid_env()
    env["PHARMA_CANONICAL_PRODUCTION_PROJECT_REFS"] = PROJECT_REF
    with pytest.raises(LiveGateError, match="production"):
        load_live_config(env)

    env = valid_env()
    env["PHARMA_CANONICAL_LIVE_DENIAL_ORG_ID"] = env[
        "PHARMA_CANONICAL_LIVE_TEST_ORG_ID"
    ]
    with pytest.raises(LiveGateError, match="must differ"):
        load_live_config(env)


def test_live_gate_requires_database_url_to_prove_project_ref():
    env = valid_env()
    env["PHARMA_CANONICAL_LIVE_DATABASE_URL"] = (
        "postgresql://postgres:secret@db.otherproject00000000.supabase.co/postgres"
    )
    with pytest.raises(LiveGateError, match="does not prove"):
        load_live_config(env)

    env = valid_env()
    env["PHARMA_CANONICAL_LIVE_DATABASE_URL"] = (
        f"postgresql://erp_runtime.{PROJECT_REF}:secret@"
        "aws-0-ap-south-1.pooler.supabase.com:5432/postgres"
    )
    assert load_live_config(env).project_ref == PROJECT_REF

    env["PHARMA_CANONICAL_LIVE_DATABASE_URL"] = (
        f"postgresql://postgres.{PROJECT_REF}:secret@"
        "aws-0-ap-south-1.pooler.supabase.com:5432/postgres"
    )
    with pytest.raises(LiveGateError, match="erp_runtime role"):
        load_live_config(env)


def test_internal_paths_cannot_drift_from_reviewed_action_registry():
    config = load_live_config(valid_env())
    assert config.prepare_path == DEFAULT_PREPARE_PATH
    assert config.command_path == DEFAULT_COMMAND_PATH
    assert config.ready_path == DEFAULT_READY_PATH
    env = valid_env()
    env["PHARMA_CANONICAL_LIVE_PREPARE_PATH"] = "/invented"
    with pytest.raises(LiveGateError, match="reviewed"):
        load_live_config(env)


def test_harness_paths_and_envelopes_match_checked_in_action_api():
    methods_by_path = {
        route.path: route.methods
        for route in canonical_action_router.routes
        if hasattr(route, "methods")
    }
    assert methods_by_path["/internal/mcp/actions/{command_type}/prepare"] == {"POST"}
    assert methods_by_path["/internal/mcp/commands/{command_request_id}/approve"] == {"POST"}
    assert methods_by_path["/internal/mcp/commands/{command_request_id}/execute"] == {"POST"}
    assert methods_by_path["/internal/mcp/commands/{command_request_id}"] == {"GET"}
    assert methods_by_path["/internal/mcp/actions/ready"] == {"GET"}
    assert set(PreparedCommandResponse.model_fields) == {
        "command_request_id", "command_type", "status", "preview_hash", "expires_at",
        "operation_policy", "resolved_references", "source_versions",
        "calculation_ruleset", "inventory_impact", "financial_impact", "tax_impact",
        "policy_warnings", "required_approvals",
    }
    assert set(CommandExecutionResponse.model_fields) == {
        "command_request_id", "command_type", "status", "preview_hash",
        "resource_type", "resource_id", "approved_at", "executed_at",
        "idempotency_replayed",
    }
    assert ApprovalRequest.model_fields["approval_intent"].annotation.__args__ == ("approve",)
    assert {
        f"{operation}.prepare" for operation in RESOURCE_TABLES
    } <= set(ACTION_POLICIES)


def test_client_payload_cannot_override_backend_tax_authority():
    with pytest.raises(AssertionError, match="backend-owned tax"):
        live_fixtures._scan_forbidden(
            {"lines": [{"product_ref": "ABC", "gst_rate": "18.000000"}]}
        )
    live_fixtures._scan_forbidden(
        {
            "lines": [
                {
                    "product_ref": "ABC",
                    "billed_quantity": "2.000000",
                    "quoted_unit_rate": "100.0000",
                    "price_basis": "tax_exclusive",
                }
            ]
        }
    )


def test_decimal_oracle_mixed_inclusive_exclusive_discount_free_and_cess():
    result = calculate_document(
        {
            "supply_type": "intra_state",
            "rounding_policy": "nearest_rupee",
            "document_discount": {
                "document_discount_kind": "amount",
                "document_discount_value": "10.00",
                "document_discount_basis": "taxable_value",
            },
            "lines": [
                {
                    "line_key": "exclusive",
                    "billed_quantity": "2.000000",
                    "free_quantity": "1.000000",
                    "free_supply_tax_treatment": "excluded_from_taxable_value",
                    "quoted_unit_rate": "100.0000",
                    "price_basis": "tax_exclusive",
                    "line_discount": {
                        "line_discount_kind": "percent",
                        "line_discount_basis": "taxable_value",
                        "line_discount_value": "10.000000",
                    },
                    "taxability": "taxable",
                    "gst_rate": "18.000000",
                    "cess_rate": "1.000000",
                    "document_discount_eligible": True,
                },
                {
                    "line_key": "inclusive",
                    "billed_quantity": "1.000000",
                    "free_quantity": "0.000000",
                    "quoted_unit_rate": "118.0000",
                    "price_basis": "tax_inclusive",
                    "taxability": "taxable",
                    "gst_rate": "18.000000",
                    "cess_rate": "0.000000",
                    "document_discount_eligible": True,
                },
            ],
        }
    )
    assert result["subtotal"] == Decimal("318.00")
    assert result["discount_total"] == Decimal("30.00")
    assert result["cgst_total"] == result["sgst_total"]
    assert result["igst_total"] == Decimal("0.00")
    assert result["cess_total"] > 0
    assert result["grand_total"] == result["grand_total"].quantize(Decimal("1.00"))


@pytest.mark.parametrize("supply_type", ["intra_state", "inter_state"])
@pytest.mark.parametrize("price_basis", ["tax_exclusive", "tax_inclusive"])
@pytest.mark.parametrize("tax_charge_mechanism", ["normal", "reverse_charge"])
def test_decimal_oracle_tax_split_and_charge_mechanism_matrix(
    supply_type, price_basis, tax_charge_mechanism
):
    result = calculate_document(
        {
            "supply_type": supply_type,
            "lines": [
                {
                    "line_key": "matrix-line",
                    "billed_quantity": "2.000000",
                    "free_quantity": "1.000000",
                    "free_supply_tax_treatment": "included_at_unit_rate",
                    "quoted_unit_rate": "59.0000",
                    "price_basis": price_basis,
                    "tax_charge_mechanism": tax_charge_mechanism,
                    "taxability": "taxable",
                    "gst_rate": "18.000000",
                    "cess_rate": "1.000000",
                }
            ],
        }
    )
    if supply_type == "intra_state":
        assert result["cgst_total"] == result["sgst_total"]
        assert result["igst_total"] == Decimal("0.00")
    else:
        assert result["cgst_total"] == result["sgst_total"] == Decimal("0.00")
        assert result["igst_total"] > 0
    if tax_charge_mechanism == "reverse_charge":
        assert result["grand_total"] == result["net_value_total"]
    else:
        assert result["grand_total"] > result["net_value_total"]


def test_reversal_oracle_partial_then_final_telescopes_exactly():
    original = calculate_document(
        {
            "supply_type": "inter_state",
            "lines": [
                {
                    "line_key": "line-a",
                    "billed_quantity": "3.000000",
                    "quoted_unit_rate": "33.3300",
                    "price_basis": "tax_exclusive",
                    "taxability": "taxable",
                    "gst_rate": "18.000000",
                    "cess_rate": "0.000000",
                }
            ],
        }
    )
    partial, state = calculate_reversal(original, {"line-a": "0.333333"})
    final, state = calculate_reversal(original, {"line-a": "1.000000"}, state)
    for total in ("net_value_total", "igst_total", "grand_total"):
        original_key = "net_value_total" if total == "net_value_total" else total
        assert partial[total] + final[total] == original[original_key]


def test_commercial_only_return_credits_payable_without_reversing_gst():
    original = calculate_document(
        {
            "supply_type": "inter_state",
            "lines": [
                {
                    "line_key": "line-a",
                    "billed_quantity": "1.000000",
                    "quoted_unit_rate": "100.0000",
                    "price_basis": "tax_exclusive",
                    "taxability": "taxable",
                    "gst_rate": "18.000000",
                    "cess_rate": "0.000000",
                }
            ],
        }
    )
    result, _ = calculate_reversal(
        original,
        {"line-a": "1.000000"},
        gst_tax_treatment="commercial_only",
    )

    assert result["net_value_total"] == original["grand_total"]
    assert result["grand_total"] == original["grand_total"]
    assert result["gst_taxable_total"] == Decimal("0.00")
    assert result["igst_total"] == Decimal("0.00")
    assert result["gst_tax_treatment"] == "commercial_only"


def test_withholding_oracle_reconciles_gross_cash_and_tax():
    result = calculate_withholding(
        {
            "gross_basis_amount": "125000.00",
            "prior_aggregate_basis": "4900000.00",
            "transaction_threshold": "5000000.00",
            "threshold_application": "excess_only",
            "withholding_rate": "0.100000",
        }
    )
    assert result["eligible_basis_amount"] == Decimal("25000.00")
    assert result["withheld_amount"] == Decimal("25.00")
    assert result["gross_advance_amount"] == (
        result["cash_disbursed_amount"] + result["withheld_amount"]
    )


def test_scenario_matrix_matches_adapter_readiness_and_bounded_pilot_scopes():
    path = Path(__file__).resolve().parents[1] / "live_canonical" / "scenario_matrix.json"
    matrix = json.loads(path.read_text())
    steps = [step for journey in matrix["journeys"] for step in journey["steps"]]
    probes = matrix["expected_rejections"]
    supported = {f"{step['operation']}.prepare" for step in steps}
    available = {
        key
        for key, binding in ACTION_ADAPTER_BINDINGS.items()
        if key.endswith(".prepare") and binding.available
    }
    unavailable = {
        key
        for key, binding in ACTION_ADAPTER_BINDINGS.items()
        if key.endswith(".prepare") and not binding.available
    }
    assert supported == available == set(
        matrix["readiness_contract"]["supported_prepare_operations"]
    )
    assert unavailable == set(
        matrix["readiness_contract"]["unavailable_prepare_operations"]
    )
    assert {
        f"{probe['operation']}.prepare"
        for probe in probes
        if probe["phase"] == "readiness"
    } == unavailable
    assert {step["operation"] for step in steps} | {
        probe["operation"] for probe in probes if probe["phase"] == "readiness"
    } == set(RESOURCE_TABLES)
    assert len(steps) == 18
    assert len(probes) == 17
    assert sum(probe["phase"] == "readiness" for probe in probes) == 1
    assert sum(probe["phase"] == "prepare" for probe in probes) == 16
    assert len(steps) + sum(probe["phase"] == "prepare" for probe in probes) == 34
    assert len({step["id"] for step in steps}) == len(steps)
    assert len({probe["id"] for probe in probes}) == len(probes)

    manifest = json.loads(AUTOMATION_MANIFEST.read_text())["dispatcher"]
    assert set(manifest["executable_prepare_capabilities"]) == available
    assert set(manifest["blocked_prepare_capabilities"]) == unavailable
    bounded = matrix["bounded_scope_contract"]
    for operation_key, contract in bounded.items():
        scope = manifest[contract["manifest_key"]]
        assert contract["unsupported_fail_closed"] == scope["unsupported_fail_closed"]
        operation_probes = [
            probe
            for probe in probes
            if f"{probe['operation']}.prepare" == operation_key
            and probe["phase"] == "prepare"
        ]
        assert operation_probes, operation_key
        assert all(
            probe["scope_case"] in contract["unsupported_fail_closed"]
            for probe in operation_probes
        )

    assert RESOURCE_TABLES["inventory.destruction"] == (
        "compliance.destructions",
        "inventory.inventory_documents",
        "destruction_id",
    )
    coverage = {item for journey in matrix["journeys"] for item in journey["coverage"]}
    assert {
        "multi_item",
        "tax_exclusive",
        "tax_inclusive",
        "line_discount",
        "document_discount",
        "free_quantity",
        "intra_state_gst",
        "inter_state_gst",
        "cess",
        "sez_zero_rated_with_igst",
        "vendor_advance_without_withholding",
        "supplier_payment_without_withholding",
        "purchase_return_partial",
        "purchase_return_final",
        "positive_gain_only",
    } <= coverage
    assert {
        "export",
        "outward_reverse_charge",
        "sez_without_payment_without_effective_lut_bond_evidence",
        "section_194q_or_other_withholding_applicable",
        "import",
        "sez",
        "reverse_charge",
        "composition_or_unregistered_supplier",
        "fully_rejected_or_free_only_receipt",
        "zero_loss_or_mixed_variance",
        "uninvoiced_return",
        "direct_issue",
        "cash_section_269st_or_cash_account_without_authority",
    } <= {probe["scope_case"] for probe in probes}
