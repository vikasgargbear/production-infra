"""The shared prepare response must show the price being approved."""
from contextlib import nullcontext
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.exc import DBAPIError

from app.infrastructure.operator_actions.batch_sale_rate import prepare_batch_sale_rate


def test_prepare_preserves_exact_reviewed_rate_and_source_evidence():
    rate = {"batch_id": str(uuid4()), "sale_rate": "29.0000", "uom_code": "PCS",
            "price_basis": "tax_exclusive", "source_kind": "operator_review",
            "source_evidence": {"reason": "Reviewed selling price"}}
    versions = {"batch_id": rate["batch_id"], "row_version": 1, "rate_version": 0}
    result = {"command_request_id": str(uuid4()), "preview_hash": "ab" * 32,
              "expires_at": "2026-09-13T10:00:00+00:00",
              "preview": {"resolved_references": [versions], "source_versions": [versions],
                          "selling_rates": [rate]}}

    class Session:
        def begin(self):
            return nullcontext()

        def execute(self, statement, params):
            return SimpleNamespace(scalar_one=lambda: result)

    service = SimpleNamespace(_session_factory=lambda: nullcontext(Session()),
                              _authorize=lambda *args: None)
    context = SimpleNamespace(organization_id=uuid4(), agent_grant_id=uuid4())
    prepared = prepare_batch_sale_rate(service, None, {"branch_id": str(uuid4()), "lines": [rate]},
                                       "review-price-1", context)
    assert prepared.resolved_references == (rate,)
    assert prepared.source_versions == (versions,)
    assert prepared.inventory_impact == prepared.financial_impact == prepared.tax_impact == ()
    assert prepared.required_approvals == ({"policy": "actor_confirmation", "count": 1},)


def test_read_scope_denial_is_403_not_database_500():
    from app.api.routes.canonical_batch_sale_rates import _read

    class Denied(Exception):
        pgcode = "42501"

    class Db:
        def execute(self, *args):
            raise DBAPIError("select", {}, Denied("denied"))

    with pytest.raises(HTTPException) as caught:
        _read(Db(), "SELECT 1", {})
    assert caught.value.status_code == 403
