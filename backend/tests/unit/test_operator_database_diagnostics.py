"""Database policy logs expose identifiers, not rejected business data."""

import hashlib
import json
import logging
from types import SimpleNamespace

import pytest
from sqlalchemy.exc import IntegrityError

from app.core.logging_config import JSONFormatter
from app.infrastructure.operator_actions.service import _database_action_error


def _error(sqlstate="23514", **diagnostic):
    original = Exception("SECRET exception with rejected customer")
    original.pgcode = sqlstate
    original.diag = SimpleNamespace(**diagnostic)
    return IntegrityError("SECRET SQL statement", {"token": "SECRET"}, original)


def test_rejection_logs_safe_correlated_identifiers_without_payload(caplog):
    primary = 'new row for relation "invoice_lines" violates check constraint'
    with caplog.at_level(logging.WARNING):
        translated = _database_action_error(
            _error(
                message_primary=primary,
                constraint_name="ck_sales_invoice_lines_tax_component_shape",
                schema_name="sales",
                table_name="invoice_lines",
                message_detail="SECRET row data",
                message_hint="SECRET hint",
                context="SECRET function SQL",
            ),
            "sales.invoice.prepare",
        )
    assert translated.metadata == {
        "operation_key": "sales.invoice.prepare",
        "reason": "CANONICAL_DATABASE_POLICY_REJECTED",
        "sqlstate": "23514",
    }
    assert len(caplog.records) == 1
    record = caplog.records[0]
    serialized = JSONFormatter().format(record)
    data = json.loads(serialized)
    assert data["operation"] == "sales.invoice.prepare"
    assert data["sqlstate"] == "23514"
    assert data["db_constraint"] == "ck_sales_invoice_lines_tax_component_shape"
    assert data["db_schema"] == "sales"
    assert data["db_table"] == "invoice_lines"
    assert data["db_reason_fingerprint"] == hashlib.sha256(primary.encode()).hexdigest()
    assert "SECRET" not in serialized
    assert primary not in serialized
    assert record.exc_info is None


@pytest.mark.parametrize("invalid", ["customer@example.com", "sales\nSECRET", "x" * 64, "quoted name", "é", 123])
def test_diagnostic_identifiers_are_strictly_filtered(caplog, invalid):
    with caplog.at_level(logging.WARNING):
        _database_action_error(
            _error(message_primary="SECRET private fact", constraint_name=invalid,
                   schema_name=invalid, table_name=invalid),
            "sales.invoice.prepare\nSECRET",
        )
    serialized = JSONFormatter().format(caplog.records[0])
    data = json.loads(serialized)
    assert not {"db_constraint", "db_schema", "db_table", "operation"} & data.keys()
    assert "SECRET" not in serialized
    assert data["db_reason_fingerprint"] == hashlib.sha256(b"SECRET private fact").hexdigest()


def test_missing_diagnostic_is_safe_and_unreviewed_state_is_not_logged(caplog):
    with caplog.at_level(logging.WARNING):
        _database_action_error(_error(), "sales.invoice.prepare")
        assert _database_action_error(_error("XX000"), "sales.invoice.prepare") is None
    assert len(caplog.records) == 1
    data = json.loads(JSONFormatter().format(caplog.records[0]))
    assert "db_reason_fingerprint" not in data
