from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from uuid import uuid4

import pytest


ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "backend/scripts/provision_canonical_demo.py"


def _load_script():
    spec = importlib.util.spec_from_file_location(
        "provision_canonical_demo_itc_authority", SCRIPT
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class _Cursor:
    def __init__(self, rows):
        self.rows = rows
        self.execution = None

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, query, parameters=()):
        self.execution = (query, parameters)

    def fetchall(self):
        return self.rows


class _Connection:
    def __init__(self, rows):
        self.cursor_value = _Cursor(rows)

    def cursor(self):
        return self.cursor_value


def test_existing_active_authority_is_resolved_for_the_business_date() -> None:
    module = _load_script()
    release_id = uuid4()
    rule_id = uuid4()
    connection = _Connection([(release_id, rule_id)])

    assert module.resolve_active_itc_reversal_authority(connection) == (
        str(release_id),
        str(rule_id),
    )
    query, parameters = connection.cursor_value.execution
    assert "release.dataset_kind='gst_itc_reversal_rules'" in query
    assert "release.source_authority='cbic'" in query
    assert "release.status='active'" in query
    assert "rule.status='active'" in query
    assert "rule.legal_section='17(5)(h)'" in query
    assert "rule.event_kind='goods_destroyed'" in query
    assert parameters == (module.INDIA_BUSINESS_DATE,) * 4


def test_missing_authority_requires_import_and_ambiguity_fails_closed() -> None:
    module = _load_script()
    assert module.resolve_active_itc_reversal_authority(_Connection([])) is None

    rows = [(uuid4(), uuid4()), (uuid4(), uuid4())]
    with pytest.raises(RuntimeError, match="authority is ambiguous"):
        module.resolve_active_itc_reversal_authority(_Connection(rows))


def test_official_source_is_fetched_only_when_authority_is_absent() -> None:
    source = SCRIPT.read_text(encoding="utf-8")
    main = source.split("def main() -> int:", 1)[1]
    before_importer = main.split(
        'with database_connection("ERP_REGULATORY_IMPORTER_DATABASE_URL") as importer:',
        1,
    )[0]
    importer_block = main.split(
        'with database_connection("ERP_REGULATORY_IMPORTER_DATABASE_URL") as importer:',
        1,
    )[1].split('with database_connection("PSYCOPG_DATABASE_URL") as bootstrap:', 1)[0]
    absent_block = importer_block.split(
        "if active_itc_reversal_authority is None:", 1
    )[1]

    assert "fetch_itc_reversal_source(evidence_dir)" in before_importer
    assert "if active_itc_reversal_authority is None" in before_importer
    assert "fetch_itc_reversal_source(evidence_dir)" not in importer_block
    assert "itc_reversal_dataset_bytes(importer)" in absent_block
    assert "import_itc_reversal_release(" in absent_block
