from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace

import pytest


REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPT = REPO_ROOT / "backend/scripts/provision_canonical_demo.py"
WORKFLOW = REPO_ROOT / ".github/workflows/canonical-staging.yml"


def _load_script():
    spec = importlib.util.spec_from_file_location("provision_canonical_demo_gstr1", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class _Cursor:
    def __init__(self, rows=()) -> None:
        self.executions = []
        self.rows = list(rows)

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, query, parameters=()):
        self.executions.append((query, parameters))

    def fetchone(self):
        return self.rows.pop(0)

    def fetchall(self):
        return self.rows.pop(0)


class _Connection:
    def __init__(self, rows=()) -> None:
        self.cursor_value = _Cursor(rows)

    def cursor(self):
        return self.cursor_value


def test_official_pdf_bytes_must_attest_both_transition_boundaries(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    module = _load_script()
    assert module.GSTR1_REPORTING_SOURCE_SHA256 == (
        "b151edf26c1c159e24eb53083fe0e42addbf0c297a4d6defd02bd8a127163003"
    )
    source = b"%PDF-1.7\n" + b"x" * 10_000 + b"\n%%EOF"
    response = SimpleNamespace(content=source, raise_for_status=lambda: None)
    page = SimpleNamespace(extract_text=lambda: (
        "As per amended rules from August 2024 tax return period onwards, "
        "invoice value is more than Rs. 1 lakh and up to July 2024 tax return "
        "period, the invoice value should be more than Rs. 2.5 lakhs."
    ))

    class _Document:
        pages = [page]
        metadata = {"CreationDate": "D:20251229230222+05'30'"}

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

    monkeypatch.setattr(module.requests, "get", lambda *args, **kwargs: response)
    monkeypatch.setattr(module.pdfplumber, "open", lambda *_args, **_kwargs: _Document())
    monkeypatch.setattr(module, "GSTR1_REPORTING_SOURCE_SHA256", hashlib.sha256(source).hexdigest())
    assert module.fetch_gstr1_reporting_source(tmp_path) == source
    assert (tmp_path / "gstn-returns-offline-tool-gstr1.pdf").read_bytes() == source

    monkeypatch.setattr(module, "GSTR1_REPORTING_SOURCE_SHA256", "00" * 32)
    with pytest.raises(RuntimeError, match="unexpected envelope"):
        module.fetch_gstr1_reporting_source(tmp_path)
    monkeypatch.setattr(module, "GSTR1_REPORTING_SOURCE_SHA256", hashlib.sha256(source).hexdigest())
    page.extract_text = lambda: "From August 2024, use one lakh."
    with pytest.raises(RuntimeError, match="transition evidence"):
        module.fetch_gstr1_reporting_source(tmp_path)


def test_dataset_is_one_contiguous_exact_set_canonicalized_by_postgres() -> None:
    module = _load_script()
    canonical = "canonical-jsonb-text"
    connection = _Connection(rows=[(canonical,)])
    assert module.gstr1_reporting_dataset_bytes(connection) == canonical.encode()
    supplied = json.loads(connection.cursor_value.executions[0][1][0])
    assert supplied == [
        {
            "id": module.IDS["gstr1_reporting_legacy_rule"],
            "rule_code": "b2cl_invoice_value_threshold",
            "rule_version": "gstn-through-2024-07",
            "b2cl_threshold_amount": "250000.00",
            "effective_from": "2017-07-01",
            "effective_to": "2024-07-31",
        },
        {
            "id": module.IDS["gstr1_reporting_current_rule"],
            "rule_code": "b2cl_invoice_value_threshold",
            "rule_version": "gstn-from-2024-08",
            "b2cl_threshold_amount": "100000.00",
            "effective_from": "2024-08-01",
            "effective_to": "",
        },
    ]
    assert date.fromisoformat(supplied[1]["effective_from"]).toordinal() == (
        date.fromisoformat(supplied[0]["effective_to"]).toordinal() + 1
    )


def test_import_uses_0004_twice_with_distinct_captured_attestation() -> None:
    module = _load_script()
    release_id = module.IDS["gstr1_reporting_release"]
    activation_timestamp = datetime(2026, 8, 25, 6, 0, tzinfo=timezone.utc)
    connection = _Connection(rows=[(activation_timestamp,), (release_id,), (release_id,)])
    module.import_gstr1_reporting_release(connection, b"official", b"canonical")
    assert connection.cursor_value.executions[0][0] == "SELECT transaction_timestamp()"
    assert len(connection.cursor_value.executions) == 3
    for query, parameters in connection.cursor_value.executions[1:]:
        assert "erp_regulatory_commands.import_gstr1_reporting_release" in query
        assert parameters[0] == release_id
        assert parameters[2:4] == ("gst_portal", module.GSTR1_REPORTING_SOURCE_URI)
        assert parameters[16] == module.IDS["reviewer_user"]
        assert parameters[17] == activation_timestamp
        assert parameters[18] == module.IDS["operator_user"]
        assert parameters[19] == activation_timestamp
        assert parameters[16] != parameters[18]
        assert parameters[20] == module.IDS["gstr1_reporting_activation_request"]


def test_existing_release_is_detected_without_claiming_a_new_activation() -> None:
    module = _load_script()
    existing = _Connection(rows=[(True,)])
    missing = _Connection(rows=[(False,)])
    assert module.demo_gstr1_reporting_release_exists(existing) is True
    assert module.demo_gstr1_reporting_release_exists(missing) is False


def test_exact_release_readback_reconciles_hashes_rules_and_identities() -> None:
    module = _load_script()
    source = b"official"
    dataset = b"canonical"
    attested_at = datetime(2026, 8, 25, 6, 0, tzinfo=timezone.utc)
    common = (
        module.IDS["gstr1_reporting_release"], module.GSTR1_REPORTING_RULESET_VERSION,
        "active", "gst_portal", module.GSTR1_REPORTING_SOURCE_URI,
        hashlib.sha256(source).hexdigest(), hashlib.sha256(dataset).hexdigest(), 2,
        module.IDS["reviewer_user"], attested_at,
    )
    rows = [
        common + (
            module.IDS["gstr1_reporting_legacy_rule"], "gstn-through-2024-07",
            Decimal("250000.00"), date(2017, 7, 1), date(2024, 7, 31), "active",
            module.IDS["operator_user"], attested_at,
            module.IDS["gstr1_reporting_activation_request"],
        ),
        common + (
            module.IDS["gstr1_reporting_current_rule"], "gstn-from-2024-08",
            Decimal("100000.00"), date(2024, 8, 1), None, "active",
            module.IDS["operator_user"], attested_at,
            module.IDS["gstr1_reporting_activation_request"],
        ),
    ]
    result = module.reconcile_gstr1_reporting_release(
        _Connection(rows=[rows]), source, dataset,
        initial_activation_replayed=True,
    )
    assert result["initial_activation_replayed"] is True
    assert result["existing_exact_release_reconciled"] is False
    assert result["record_count"] == 2
    assert result["reviewed_by_user_id"] != result["activated_by_user_id"]


def test_activation_remains_inside_explicit_demo_opt_in() -> None:
    workflow = WORKFLOW.read_text(encoding="utf-8")
    provision_step = workflow[workflow.index("- name: Provision and exercise the disposable demo organization"):]
    provision_step = provision_step[:provision_step.index("\n      - name:", 10)]
    assert "if: inputs.provision_demo_data == true" in provision_step
    assert "python3 backend/scripts/provision_canonical_demo.py" in provision_step
    assert "provision_canonical_demo" not in (
        REPO_ROOT / "backend/app/main.py"
    ).read_text(encoding="utf-8")
