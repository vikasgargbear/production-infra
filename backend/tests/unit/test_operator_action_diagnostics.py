import json
import logging
from uuid import uuid4

from fastapi.routing import APIRoute

from app.api.routes import web_operator_actions as web
from app.core.logging_config import JSONFormatter, request_id_var
from app.core.operator_action_diagnostics import record_operator_action


class _Capture(logging.Handler):
    def __init__(self) -> None:
        super().__init__()
        self.records: list[logging.LogRecord] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.records.append(record)


def test_operator_action_diagnostic_is_correlated_and_payload_free():
    logger = logging.getLogger("app.operator_actions")
    capture = _Capture()
    logger.addHandler(capture)
    logger.setLevel(logging.INFO)
    token = request_id_var.set("request-123")
    organization_id = uuid4()
    command_id = uuid4()
    try:
        record_operator_action(
            operation="sales.invoice.prepare",
            outcome="accepted",
            organization_id=organization_id,
            command_request_id=command_id,
            command_status="prepared",
            idempotency_replayed=False,
        )
        assert len(capture.records) == 1
        payload = json.loads(JSONFormatter().format(capture.records[0]))
    finally:
        request_id_var.reset(token)
        logger.removeHandler(capture)

    assert payload["request_id"] == "request-123"
    assert payload["org_id"] == str(organization_id)
    assert payload["operation"] == "sales.invoice.prepare"
    assert payload["command_request_id"] == str(command_id)
    assert payload["command_status"] == "prepared"
    assert payload["idempotency_replayed"] is False
    serialized = json.dumps(payload)
    for forbidden in (
        "idempotency_key",
        "preview_hash",
        "authorization",
        "raw_payload",
        "request_json",
    ):
        assert forbidden not in serialized


def test_json_formatter_drops_unreviewed_extra_fields():
    record = logging.LogRecord(
        "test",
        logging.INFO,
        __file__,
        1,
        "safe",
        (),
        None,
    )
    record.raw_payload = {"secret": "business-data"}
    record.authorization = "Bearer secret"

    payload = json.loads(JSONFormatter().format(record))

    assert "raw_payload" not in payload
    assert "authorization" not in payload
    assert "business-data" not in json.dumps(payload)


def test_command_diagnostics_do_not_change_public_route_contracts():
    routes = {
        route.path: route
        for route in web.router.routes
        if isinstance(route, APIRoute)
    }
    expected = {
        "/web/actions/{command_type}/prepare": (
            {"POST"},
            web.prepare_action,
            web.PreparedResponse,
        ),
        "/web/actions/commands/{command_request_id}/review": (
            {"GET"},
            web.command_review,
            web.CommandReviewResponse,
        ),
        "/web/actions/commands/{command_request_id}/approve": (
            {"POST"},
            web.approve_command,
            web.ExecutionResponse,
        ),
        "/web/actions/commands/{command_request_id}/execute": (
            {"POST"},
            web.execute_command,
            web.ExecutionResponse,
        ),
        "/web/actions/commands/{command_request_id}": (
            {"GET"},
            web.get_command_status,
            web.CommandStatusResponse,
        ),
    }

    for path, (methods, endpoint, response_model) in expected.items():
        route = routes[path]
        assert route.methods == methods
        assert route.endpoint is endpoint
        assert route.response_model is response_model
