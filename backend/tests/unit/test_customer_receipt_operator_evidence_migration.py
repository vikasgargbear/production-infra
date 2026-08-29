import hashlib
import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SQL_PATH = ROOT / "alembic/sql/20260829_0058_customer_receipt_operator_evidence.sql"
REVISION_PATH = ROOT / "alembic/versions/20260829_0058_customer_receipt_operator_evidence.py"


def _revision():
    spec = importlib.util.spec_from_file_location("customer_receipt_evidence_revision", REVISION_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def test_customer_receipt_evidence_functions_are_typed_and_runtime_bounded():
    sql = SQL_PATH.read_text()
    assert "initiate_customer_receipt_attachment" in sql
    assert "transition_customer_receipt_attachment" in sql
    assert "'customer_receipt_evidence'" in sql
    assert "evidence_kind IN ('expense_receipt','customer_receipt_evidence')" in sql
    assert "DROP CONSTRAINT attachments_private_evidence_shape_ck" in sql
    assert "finance.payment.manage" in sql
    assert "core.attachment.manage" in sql
    assert "SECURITY DEFINER" in sql
    assert "SET search_path=''" in sql
    assert "GRANT EXECUTE" in sql and "TO erp_runtime" in sql
    assert "REVOKE ALL" in sql
    assert "application/pdf" in sql


def test_customer_receipt_evidence_revision_hash_and_lineage_are_exact():
    revision = _revision()
    assert revision.revision == "20260829_0058"
    assert revision.down_revision == "20260829_0057"
    assert revision.EXPECTED_SQL_SHA256 == hashlib.sha256(SQL_PATH.read_bytes()).hexdigest()
