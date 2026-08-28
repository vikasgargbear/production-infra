from __future__ import annotations

import importlib.util
import base64
import json
from pathlib import Path
from uuid import uuid4

import psycopg2
import pytest
import requests


SCRIPT = Path(__file__).parents[2] / "scripts" / "exercise_staging_mcp_oauth.py"
SPEC = importlib.util.spec_from_file_location("exercise_staging_mcp_oauth", SCRIPT)
assert SPEC and SPEC.loader
exercise = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(exercise)


def _unsigned_token(claims: dict) -> str:
    def part(value: dict) -> str:
        return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")

    return f"{part({'alg': 'ES256', 'kid': 'test'})}.{part(claims)}.{part({'signature': 'test'})}"


def _oauth_claims(**overrides) -> dict:
    claims = {
        "iss": exercise.ISSUER,
        "aud": "authenticated",
        "client_id": "reviewed-client",
        "scope": "openid offline_access",
        "app_metadata": {"org_id": exercise.DEMO_ORG_ID},
    }
    claims.update(overrides)
    return claims


def test_deployment_mcp_url_overrides_a_stale_manifest_endpoint(monkeypatch) -> None:
    deployed_url = "https://deployed-mcp.example.test/mcp"
    monkeypatch.setattr(exercise, "MCP_URL", "https://stale.example.test/mcp")
    monkeypatch.setenv("PHARMA_CANONICAL_MCP_URL", deployed_url)

    assert exercise._deployment_mcp_url() == deployed_url


@pytest.mark.parametrize(
    "value",
    [
        "http://mcp.example.test/mcp",
        "https://mcp.example.test",
        "https://mcp.example.test/mcp/",
        "https://mcp.example.test/mcp?target=other",
        "https://user:password@mcp.example.test/mcp",
    ],
)
def test_deployment_mcp_url_rejects_ambiguous_or_unsafe_bindings(
    monkeypatch, value: str
) -> None:
    monkeypatch.setenv("PHARMA_CANONICAL_MCP_URL", value)

    with pytest.raises(exercise.ExerciseError, match="one HTTPS origin"):
        exercise._deployment_mcp_url()


def test_oauth_claim_preflight_accepts_canonical_web_metadata_shape() -> None:
    claims = _oauth_claims()

    assert exercise._validate_oauth_access_token_claims(
        _unsigned_token(claims),
        client_id="reviewed-client",
        organization_id=exercise.DEMO_ORG_ID,
    ) == claims


@pytest.mark.parametrize(
    "app_metadata",
    [
        {},
        {"org_id": "not-a-uuid"},
        {"organization_id": exercise.DEMO_ORG_ID},
    ],
)
def test_oauth_claim_preflight_rejects_missing_invalid_or_retired_org_key(
    app_metadata: dict,
) -> None:
    with pytest.raises(exercise.ExerciseError, match="app_metadata.org_id"):
        exercise._validate_oauth_access_token_claims(
            _unsigned_token(_oauth_claims(app_metadata=app_metadata)),
            client_id="reviewed-client",
            organization_id=exercise.DEMO_ORG_ID,
        )


def test_http_and_provider_failures_never_echo_response_bodies() -> None:
    response = requests.Response()
    response.status_code = 503
    response._content = b"provider-secret-token-and-customer-data"

    failure = exercise._http_error("MCP request", response)

    assert str(failure) == "MCP request returned HTTP 503"
    assert "secret" not in str(failure)


def test_safe_failure_detail_reduces_external_errors_to_fixed_classes() -> None:
    assert exercise._safe_failure_detail(
        requests.ConnectionError("provider-secret")
    ) == "network_error class=ConnectionError"
    assert exercise._safe_failure_detail(
        psycopg2.OperationalError("database-secret")
    ) == "database_error"
    assert exercise._safe_failure_detail(KeyError("customer-secret")) == (
        "validation_error class=KeyError"
    )


def test_jsonrpc_error_exposes_only_numeric_protocol_code() -> None:
    response = requests.Response()
    response.status_code = 200
    response.headers["content-type"] = "application/json"
    response._content = (
        b'{"jsonrpc":"2.0","error":{"code":-32000,'
        b'"message":"provider-secret"}}'
    )

    with pytest.raises(exercise.ExerciseError, match=r"^MCP JSON-RPC error code=-32000$"):
        exercise._jsonrpc_response(response)


def test_exercise_source_has_no_raw_external_failure_rendering() -> None:
    source = SCRIPT.read_text(encoding="utf-8")

    assert "response.text[:500]" not in source
    assert "json.dumps(result)[:1000]" not in source
    assert 'f"Live command did not succeed: {status}"' not in source
    assert 'f"Database did not reconcile the live MCP sales order: {row}"' not in source
    assert 'detail = str(exc)' not in source


def _customer_resolution(addresses):
    return {
        "match_state": "exact_match",
        "requires_selection": False,
        "exact_match_count": 1,
        "results": [
            {
                "customer_account_id": exercise.DEMO_CUSTOMER_ACCOUNT_ID,
                "primary_delivery_addresses": addresses,
            }
        ],
    }


def test_customer_delivery_address_uses_one_authoritative_resolved_identity() -> None:
    address_id = str(uuid4())

    assert exercise._customer_delivery_address(
        _customer_resolution(
            [{
                "delivery_address_id": address_id,
                "delivery_address_row_version": 7,
                "address_kind": "shipping",
                "is_primary": True,
            }]
        )
    ) == (address_id, "7")


@pytest.mark.parametrize(
    "addresses",
    [
        [],
        [
            {
                "delivery_address_id": str(uuid4()),
                "delivery_address_row_version": 1,
            },
            {
                "delivery_address_id": str(uuid4()),
                "delivery_address_row_version": 2,
            },
        ],
    ],
)
def test_customer_delivery_address_rejects_missing_or_ambiguous_authority(addresses) -> None:
    with pytest.raises(exercise.ExerciseError, match="one exact active primary"):
        exercise._customer_delivery_address(_customer_resolution(addresses))


@pytest.mark.parametrize(
    "address_id,row_version,message",
    [
        ("not-a-uuid", 1, "invalid UUID"),
        (str(uuid4()), 0, "invalid row version"),
        (str(uuid4()), True, "invalid row version"),
        (str(uuid4()), "7", "invalid row version"),
    ],
)
def test_customer_delivery_address_rejects_malformed_authority(
    address_id, row_version, message: str
) -> None:
    with pytest.raises(exercise.ExerciseError, match=message):
        exercise._customer_delivery_address(
            _customer_resolution(
                [{
                    "delivery_address_id": address_id,
                    "delivery_address_row_version": row_version,
                    "address_kind": "shipping",
                    "is_primary": True,
                }]
            )
        )


def test_customer_delivery_address_rejects_ineligible_address() -> None:
    with pytest.raises(exercise.ExerciseError, match="ineligible primary"):
        exercise._customer_delivery_address(
            _customer_resolution(
                [{
                    "delivery_address_id": str(uuid4()),
                    "delivery_address_row_version": 1,
                    "address_kind": "warehouse",
                    "is_primary": False,
                }]
            )
        )


def test_customer_delivery_address_rejects_wrong_customer_identity() -> None:
    payload = _customer_resolution(
        [{
            "delivery_address_id": str(uuid4()),
            "delivery_address_row_version": 1,
            "address_kind": "shipping",
            "is_primary": True,
        }]
    )
    payload["results"][0]["customer_account_id"] = str(uuid4())

    with pytest.raises(exercise.ExerciseError, match="canonical demo customer"):
        exercise._customer_delivery_address(payload)


@pytest.mark.parametrize(
    "field,value",
    [
        ("match_state", "ambiguous"),
        ("exact_match_count", True),
        ("exact_match_count", 2),
        ("requires_selection", True),
    ],
)
def test_customer_delivery_address_rejects_nonexact_customer_authority(
    field: str, value
) -> None:
    payload = _customer_resolution(
        [{
            "delivery_address_id": str(uuid4()),
            "delivery_address_row_version": 1,
            "address_kind": "shipping",
            "is_primary": True,
        }]
    )
    payload[field] = value

    with pytest.raises(exercise.ExerciseError, match="one exact customer"):
        exercise._customer_delivery_address(payload)


def _documents():
    resource_id = "0198ea37-2b21-7c8d-9123-123456789abc"
    prepared = {"financial_impact": [{"currency_code": "INR", "grand_total": "1650.00"}]}
    executed = {"status": "succeeded", "resource_id": resource_id}
    status = {"status": "succeeded", "resource_id": resource_id}
    readback = {
        "match_state": "matched",
        "matched_count": 1,
        "document": {
            "sales_order_id": resource_id,
            "requested_delivery_date": "2026-08-28",
            "grand_total": "1650.00",
            "lines": [{
                "base_billed_quantity": "12.000000",
                "base_free_quantity": "2.000000",
                "quoted_unit_rate": "125.5000",
                "line_total": "1650.00",
            }],
        },
    }
    return prepared, executed, status, readback, "2026-08-28"


def test_sales_order_readback_preserves_resource_quantities_and_preview_total() -> None:
    exact = exercise._verify_sales_order_readback(*_documents())

    assert exact == {
        "sales_order_id": "0198ea37-2b21-7c8d-9123-123456789abc",
        "requested_delivery_date": "2026-08-28",
        "grand_total": "1650.00",
        "base_billed_quantity": "12.000000",
        "base_free_quantity": "2.000000",
        "quoted_unit_rate": "125.5000",
        "line_total": "1650.00",
    }


def test_sales_order_readback_compares_decimal_value_not_display_scale() -> None:
    documents = _documents()
    documents[0]["financial_impact"][0]["grand_total"] = "1650"

    exact = exercise._verify_sales_order_readback(*documents)

    assert exact["grand_total"] == "1650.00"


@pytest.mark.parametrize(
    "mutation, message",
    [
        (lambda parts: parts[3]["document"].update(grand_total="1649.99"), "total drifted"),
        (lambda parts: parts[3]["document"].update(requested_delivery_date="2026-08-29"), "requested delivery date differs"),
        (lambda parts: parts[3]["document"]["lines"][0].update(base_free_quantity="3.000000"), "differs from the command input"),
        (lambda parts: parts[2].update(resource_id="0198ea37-2b21-7c8d-9123-000000000000"), "stable sales-order resource UUID"),
    ],
)
def test_sales_order_readback_rejects_cross_boundary_drift(mutation, message: str) -> None:
    documents = _documents()
    mutation(documents)

    with pytest.raises(exercise.ExerciseError, match=message):
        exercise._verify_sales_order_readback(*documents)
