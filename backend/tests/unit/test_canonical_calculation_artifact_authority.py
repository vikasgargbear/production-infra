from copy import deepcopy
from decimal import Decimal
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

import pytest
from jsonschema import Draft202012Validator, ValidationError
from referencing import Registry, Resource

from app.domain.calculations import (
    ChargeReversalInput,
    PriorChargeReversalTotals,
    PriorProductReversalTotals,
    PriorReversalState,
    ProductReversalInput,
    ReversalInput,
    ReversalValueBasis,
    TaxAmounts,
    reversal_input_payload,
    serialize_prior_reversal_state,
)
from app.infrastructure.operator_actions.sales_order import calculation_documents
from uuid import uuid4


REPO_ROOT = Path(__file__).resolve().parents[3]
AUTHORITY_ROOT = REPO_ROOT / "database" / "canonical" / "calculation_authority"
DOMAIN_ROOT = REPO_ROOT / "database" / "canonical" / "domains"
BASELINE_PATH = REPO_ROOT / "backend" / "scripts" / "generate_canonical_baseline.py"
SECURITY_PATH = REPO_ROOT / "database" / "canonical" / "security" / "generate_security_contract.py"
GENERATOR_PATH = AUTHORITY_ROOT / "generate_calculation_authority.py"


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def output_document():
    zero = "0.00"
    return {
        "aggregate_version": 1,
        "currency_code": "INR",
        "engine_version": "decimal-engine-1",
        "gst_tax_treatment": "statutory",
        "lines": [
            {
                "cess_amount": zero,
                "cess_rate": "0",
                "cgst_amount": zero,
                "cgst_rate": "0",
                "document_discount_amount": zero,
                "document_taxable_discount_amount": zero,
                "final_residual": False,
                "gross_amount": "100.00",
                "gst_taxable_value": "100.00",
                "igst_amount": "18.00",
                "igst_rate": "18",
                "line_discount_amount": zero,
                "line_id": "018f47f0-7b5f-7cc2-98b1-6d5ae42e21e4",
                "line_kind": "product",
                "line_taxable_discount_amount": zero,
                "line_total": "118.00",
                "net_value_amount": "100.00",
                "recipient_assessed_tax_amount": zero,
                "sgst_amount": zero,
                "sgst_rate": "0",
            }
        ],
        "operation": "sales.invoice.post",
        "resource_id": "018f47ef-bbaa-7c42-8fb8-a2eeffdbcb31",
        "resource_type": "sales_invoice",
        "ruleset_version": "gst-rules-1",
        "schema": "aasopharma.trade-calculation-output",
        "schema_version": "1",
        "serializer_version": "aasopharma-jcs-decimal-v1",
        "totals": {
            "cess_total": zero,
            "cgst_total": zero,
            "charges_total": zero,
            "discount_total": zero,
            "grand_total": "118.00",
            "gst_taxable_total": "100.00",
            "igst_total": "18.00",
            "net_value_total": "100.00",
            "pre_round_total": "118.00",
            "recipient_assessed_tax_total": zero,
            "rounding_adjustment": zero,
            "sgst_total": zero,
            "subtotal": "100.00",
        },
    }


def input_document():
    return {
        "aggregate_version": 1,
        "calculation_kind": "document",
        "document": {
            "charges": [],
            "document_discount": {"basis": "price_value", "kind": "none", "value": "0"},
            "gst_tax_treatment": "statutory",
            "gst_type": "inter_state",
            "products": [
                {
                    "base_billed_quantity": "1.000000",
                    "base_free_quantity": "0.000000",
                    "billed_quantity": "1",
                    "cess_rate": "0",
                    "document_discount_eligible": True,
                    "free_quantity": "0",
                    "free_supply_tax_treatment": "excluded_from_taxable_value",
                    "gst_rate": "18",
                    "line_discount": {"basis": "price_value", "kind": "none", "value": "0"},
                    "line_id": "018f47f0-7b5f-7cc2-98b1-6d5ae42e21e4",
                    "price_basis": "tax_exclusive",
                    "quoted_unit_rate": "100.0000",
                    "tax_charge_mechanism": "normal",
                    "taxability_snapshot": "taxable",
                    "uom_conversion_factor": "1.000000",
                }
            ],
            "rounding_policy": "none",
            "tax_charge_mechanism": "normal",
            "zero_rated_mode": "not_applicable",
        },
        "operation": "sales.invoice.post",
        "original": None,
        "resource_id": "018f47ef-bbaa-7c42-8fb8-a2eeffdbcb31",
        "resource_type": "sales_invoice",
        "reversal": None,
        "schema": "aasopharma.trade-calculation-input",
        "schema_version": "1",
        "serializer_version": "aasopharma-jcs-decimal-v1",
    }


def validators():
    input_schema = json.loads((AUTHORITY_ROOT / "calculation-input-v1.schema.json").read_text())
    output_schema = json.loads((AUTHORITY_ROOT / "calculation-output-v1.schema.json").read_text())
    registry = Registry().with_resources(
        [
            (input_schema["$id"], Resource.from_contents(input_schema)),
            (output_schema["$id"], Resource.from_contents(output_schema)),
        ]
    )
    return (
        Draft202012Validator(input_schema, registry=registry),
        Draft202012Validator(output_schema, registry=registry),
    )


def test_fixed_schemas_accept_canonical_envelopes_and_reject_drift():
    input_validator, output_validator = validators()
    input_validator.validate(input_document())
    output_validator.validate(output_document())

    extra = output_document()
    extra["client_hash"] = "trusted"
    with pytest.raises(ValidationError):
        output_validator.validate(extra)
    number_instead_of_decimal = output_document()
    number_instead_of_decimal["totals"]["grand_total"] = 118.0
    with pytest.raises(ValidationError):
        output_validator.validate(number_instead_of_decimal)
    missing_input = input_document()
    del missing_input["document"]["products"][0]["taxability_snapshot"]
    with pytest.raises(ValidationError):
        input_validator.validate(missing_input)


def test_sales_order_adapter_emits_fixed_authority_envelopes() -> None:
    line_id = uuid4()
    product_id = uuid4()
    request = {
        "rounding_policy": "none",
        "zero_rated_payment_mode": "not_applicable",
        "document_discount": {
            "document_discount_kind": "none",
            "document_discount_basis": "price_value",
            "document_discount_value": "0",
        },
    }
    resolution = {
        "branch_state_code": "27",
        "shipping_state_code": "29",
        "supply_type": "inter_state",
        "ruleset_version": "gst-rules-1",
        "lines": [{
                "line_id": str(line_id),
                "line_kind": "product",
            "product_id": str(product_id),
            "multiplier": "10.000000",
            "gst_rate": "18.000000",
            "cess_rate": "0.000000",
            "taxability": "taxable",
            "input": {
                "billed_quantity": "2.000000",
                    "free_quantity": "0.000000",
                    "free_supply_tax_treatment": "excluded_from_taxable_value",
                "quoted_unit_rate": "100.0000",
                "price_basis": "tax_exclusive",
                "line_discount": {
                    "line_discount_kind": "none",
                    "line_discount_basis": "price_value",
                    "line_discount_value": "0",
                },
                "document_discount_eligible": True,
            },
        }],
    }
    calculation_input, calculation_output = calculation_documents(
        request, resolution, order_id=uuid4()
    )
    input_validator, output_validator = validators()
    input_validator.validate(calculation_input)
    output_validator.validate(calculation_output)
    assert calculation_input["operation"] == "sales.order.approve"
    assert calculation_output["totals"]["grand_total"] == "236.00"


def _zero_mode_sales_order(mode: str, *, supply_type: str, taxability: str, rate: str):
    request = {
        "rounding_policy": "none",
        "zero_rated_payment_mode": mode,
        "document_discount": {
            "document_discount_kind": "none",
            "document_discount_basis": "price_value",
            "document_discount_value": "0",
        },
    }
    resolution = {
        "supply_type": supply_type,
        "ruleset_version": "gst-rules-1",
        "lines": [{
            "line_id": str(uuid4()),
            "line_kind": "product",
            "product_id": str(uuid4()),
            "multiplier": "1.000000",
            "gst_rate": rate,
            "cess_rate": "0.000000",
            "taxability": taxability,
            "input": {
                "billed_quantity": "1.000000",
                "free_quantity": "0.000000",
                "free_supply_tax_treatment": "excluded_from_taxable_value",
                "quoted_unit_rate": "100.0000",
                "price_basis": "tax_exclusive",
                "line_discount": {
                    "line_discount_kind": "none",
                    "line_discount_basis": "price_value",
                    "line_discount_value": "0",
                },
                "document_discount_eligible": True,
            },
        }],
    }
    return calculation_documents(request, resolution, order_id=uuid4())


def test_sales_order_sez_with_igst_is_explicit_and_uses_igst() -> None:
    calculation_input, calculation_output = _zero_mode_sales_order(
        "with_igst", supply_type="sez", taxability="zero_rated", rate="18.000000"
    )
    assert calculation_input["document"]["zero_rated_mode"] == "with_igst"
    assert calculation_output["totals"]["igst_total"] == "18.00"
    assert calculation_output["totals"]["grand_total"] == "118.00"


@pytest.mark.parametrize(
    ("mode", "supply_type", "taxability", "rate"),
    [
        ("not_applicable", "sez", "zero_rated", "0.000000"),
        ("with_igst", "inter_state", "taxable", "18.000000"),
    ],
)
def test_sales_order_zero_rated_mode_never_silently_falls_back(
    mode: str, supply_type: str, taxability: str, rate: str
) -> None:
    with pytest.raises(ValueError):
        _zero_mode_sales_order(
            mode, supply_type=supply_type, taxability=taxability, rate=rate
        )


def test_prior_state_schema_matches_decimal_engine_serializer_without_losing_money() -> None:
    tax = TaxAmounts(
        Decimal("1.11"), Decimal("1.11"), Decimal("0.00"), Decimal("0.05"), Decimal("2.27")
    )
    state = PriorReversalState(
        (
            PriorProductReversalTotals(
                "018f47f0-7b5f-7cc2-98b1-6d5ae42e21e4",
                ReversalValueBasis.BASE_QUANTITY,
                Decimal("2"), Decimal("1"), Decimal("20"), Decimal("10"),
                Decimal("50.00"), Decimal("2.00"), Decimal("3.00"),
                Decimal("45.00"), Decimal("45.00"), tax,
            ),
        ),
        (
            PriorChargeReversalTotals(
                "018f47f0-7b5f-7cc2-98b1-6d5ae42e21e5",
                Decimal("0.4"),
                Decimal("10.00"),
                Decimal("1.00"),
                Decimal("9.00"),
                Decimal("9.00"),
                tax,
            ),
        ),
        Decimal("-0.13"),
    )
    prior = serialize_prior_reversal_state(state)
    assert prior["products"][0]["net_value_amount"] == "45.00"
    assert prior["products"][0]["cgst_amount"] == "1.11"
    assert prior["products"][0]["reversed_base_free_quantity"] == "10"
    assert prior["products"][0]["gross_price_amount"] == "50.00"
    assert set(prior["products"][0]) == {
        "cess_amount", "cgst_amount", "document_discount_amount",
        "gross_price_amount", "gst_taxable_value", "igst_amount",
        "line_discount_amount", "line_id", "net_value_amount",
        "reversed_base_billed_quantity", "reversed_base_free_quantity",
        "reversed_billed_quantity", "reversed_free_quantity", "sgst_amount",
        "value_basis",
    }
    assert prior["charges"][0]["reversed_ratio"] == "0.4"
    assert set(prior["charges"][0]) == {
        "cess_amount", "cgst_amount", "document_discount_amount",
        "gross_price_amount", "gst_taxable_value", "igst_amount", "line_id",
        "net_value_amount", "reversed_ratio", "sgst_amount",
    }
    assert prior["rounding_adjustment"] == "-0.13"

    request = ReversalInput(
        (
            ProductReversalInput(
                "018f47f0-7b5f-7cc2-98b1-6d5ae42e21e4",
                Decimal("1"), Decimal("0"), Decimal("1"), Decimal("0"),
                ReversalValueBasis.BASE_QUANTITY, True,
            ),
        ),
        (
            ChargeReversalInput(
                "018f47f0-7b5f-7cc2-98b1-6d5ae42e21e5", Decimal("0.6"), True
            ),
        ),
        state,
    )

    envelope = input_document()
    envelope.update(
        {
            "calculation_kind": "reversal",
            "document": None,
            "original": output_document(),
            "reversal": reversal_input_payload(request),
        }
    )
    validators()[0].validate(envelope)
    assert envelope["reversal"]["products"][0]["final_residual"] is True
    assert envelope["reversal"]["charges"][0]["ratio"] == "0.6"

    drift = deepcopy(envelope)
    del drift["reversal"]["prior_state"]["products"][0]["cgst_amount"]
    with pytest.raises(ValidationError):
        validators()[0].validate(drift)


def test_catalog_has_one_typed_non_client_authority_table():
    document = json.loads((DOMAIN_ROOT / "calculation.json").read_text())
    assert document["table_count"] == 1
    table = document["tables"][0]
    assert table["name"] == "calculation.artifacts"
    columns = {column[0]: column for column in table["columns"]}
    assert columns["calculator_principal"][1:4] == ["varchar(63)", False, None]
    assert columns["input_bytes"][1] == columns["output_bytes"][1] == "bytea"
    assert columns["authority_hash"][1] == "bytea"
    assert table["mutation_class"] == "issued_then_consumed_authority"
    assert len([fk for fk in table["foreign_keys"] if fk["name"].endswith(("order_fk", "invoice_fk", "return_fk"))]) == 6
    assert "client" not in table["fact_owner"].lower()


def test_generator_is_catalog_bound_and_runtime_cannot_mint_or_consume():
    generator = load_module("calculation_authority_generator_test", GENERATOR_PATH)
    sql_text, manifest_text, mapping_text = generator.generated_artifacts()
    manifest = json.loads(manifest_text)
    mapping = json.loads(mapping_text)

    assert "SESSION_USER<>'erp_calculator'" in sql_text
    assert "purchase return is not submitted" in sql_text
    assert 'TO "erp_calculator"' in sql_text
    assert 'issue_artifact"' in sql_text
    assert 'issue_artifact"' not in "\n".join(
        line for line in sql_text.splitlines() if 'TO "erp_app"' in line
    )
    assert "assert_input_schema" in sql_text and "assert_output_schema" in sql_text
    for exact_keys in (
        "ARRAY['final_residual','line_id','reversed_base_billed_quantity','reversed_base_free_quantity','reversed_billed_quantity','reversed_free_quantity','value_basis']",
        "ARRAY['final_residual','line_id','ratio']",
        "ARRAY['cess_amount','cgst_amount','document_discount_amount','gross_price_amount','gst_taxable_value','igst_amount','line_discount_amount','line_id','net_value_amount','reversed_base_billed_quantity','reversed_base_free_quantity','reversed_billed_quantity','reversed_free_quantity','sgst_amount','value_basis']",
        "ARRAY['cess_amount','cgst_amount','document_discount_amount','gross_price_amount','gst_taxable_value','igst_amount','line_id','net_value_amount','reversed_ratio','sgst_amount']",
    ):
        assert exact_keys in sql_text
    assert manifest["status"] == "blocked_pending_calculator_credential_and_execution_tests"
    assert manifest["public_boundary"]["grantee"] == "erp_calculator"
    assert manifest["proof"]["client_hash_authority"] is False
    assert manifest["schemas"]["application_codec"]["public_functions"] == [
        "reversal_input_payload",
        "serialize_prior_reversal_state",
    ]
    assert manifest["mapping_sha256"] == hashlib.sha256(mapping_text.encode()).hexdigest()
    assert mapping["enforcements"][0]["table"] == "calculation.artifacts"


def test_baseline_mapping_resolves_artifact_invariant_and_security_is_select_only():
    baseline = load_module("calculation_artifact_baseline_test", BASELINE_PATH)
    security = load_module("calculation_artifact_security_test", SECURITY_PATH)
    catalog = baseline.load_and_validate_catalog(DOMAIN_ROOT)
    reviewed = baseline._load_enforcement_mapping(
        AUTHORITY_ROOT / "baseline-calculation-authority-enforcements.json"
    )
    result = baseline.generate_baseline(
        catalog,
        enforcement_mapping=reviewed.invariants,
        platform_mapping={},
        allow_draft=True,
    )
    assert not any(
        blocker.get("table") == "calculation.artifacts"
        and blocker["category"] == "cross_row_invariant"
        for blocker in result.blockers
    )
    table = next(item for item in catalog.tables if item["name"] == "calculation.artifacts")
    policy = security._policy_mapping(deepcopy(table))
    assert policy["runtime_grants"] == ["SELECT"]
    assert policy["policies"] == ["SELECT"]
    assert policy["mutation_enforcement"] == "restricted_security_definer_commands_only"
