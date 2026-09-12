"""Batch selling-price review through the existing durable command lifecycle."""
import hashlib
from datetime import datetime, timedelta, timezone
from uuid import NAMESPACE_URL, UUID, uuid4, uuid5

from sqlalchemy import text

from ...domain.operator_actions.models import PreparedCommand
from .sales_order import canonical_json_bytes

EXECUTE_BATCH_SALE_RATE_SQL = text("SELECT erp_automation_commands.execute_batch_sale_rate(:org_id,:command_request_id)")
SET_REQUEST_SQL = text("SELECT set_config('app.request_id',:request_id,true)")
PERSIST_BATCH_SALE_RATE_SQL = text("SELECT erp_automation_commands.persist_batch_sale_rate_prepare("
                                 ":org,:grant,:command,:key,:request,:expiry)")


def prepare_batch_sale_rate(service, policy, payload, idempotency_key, context):
    command_id = uuid5(NAMESPACE_URL, f"{context.organization_id}:{context.agent_grant_id}:batch-sale-rate:{idempotency_key}")
    # Validation has already parsed the shared strict schema. The serializer
    # preserves decimal strings; PostgreSQL owns resolution and preview bytes.
    from .service import _json_value
    request_bytes = canonical_json_bytes({key: _json_value(value) for key, value in payload.items()})
    with service._session_factory() as session:
        with session.begin():
            service._authorize(session, context, policy)
            session.execute(SET_REQUEST_SQL, {"request_id": str(uuid4())})
            result = session.execute(PERSIST_BATCH_SALE_RATE_SQL, {
                "org": context.organization_id, "grant": context.agent_grant_id, "command": command_id,
                "key": hashlib.sha256(idempotency_key.encode()).digest(), "request": request_bytes,
                "expiry": datetime.now(timezone.utc) + timedelta(minutes=15),
            }).scalar_one()
            preview = result["preview"]
            return PreparedCommand(
                command_request_id=UUID(result["command_request_id"]), command_type="inventory.batch_sale_rate.record",
                preview_hash="sha256:" + result["preview_hash"], expires_at=datetime.fromisoformat(result["expires_at"]),
                resolved_references=tuple(preview["selling_rates"]), source_versions=tuple(preview["source_versions"]),
                calculation_ruleset=(), inventory_impact=(), financial_impact=(), tax_impact=(),
                required_approvals=({"policy": "actor_confirmation", "count": 1},),
            )
