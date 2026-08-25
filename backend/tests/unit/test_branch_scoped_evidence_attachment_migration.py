from __future__ import annotations

import hashlib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SQL_PATH = ROOT / "backend/alembic/sql/20260825_0022_branch_scoped_evidence_attachments.sql"
REVISION_PATH = ROOT / "backend/alembic/versions/20260825_0022_branch_scoped_evidence_attachments.py"
RUNTIME_CHECK = ROOT / "backend/tests/postgres/check_canonical_evidence_attachment_runtime_role.py"
POSTGRES_GATE = ROOT / "database/canonical/ci/run_alembic_postgres15_gate.sh"


def test_evidence_attachment_migration_is_hash_bound_and_linear_after_0021():
    sql = SQL_PATH.read_text(encoding="utf-8")
    revision = REVISION_PATH.read_text(encoding="utf-8")

    assert hashlib.sha256(sql.encode("utf-8")).hexdigest() in revision
    assert 'revision = "20260825_0022"' in revision
    assert 'down_revision = "20260825_0021"' in revision
    assert "CanonicalBaselineError" in revision.split("def downgrade", 1)[1]


def test_private_evidence_metadata_is_branch_scoped_and_forced_rls_remains_enabled():
    sql = SQL_PATH.read_text(encoding="utf-8")

    assert "ADD COLUMN branch_id uuid" in sql
    assert "FOREIGN KEY (org_id,branch_id)" in sql
    assert "branch_id IS NOT NULL" in sql
    assert "erp_security.can_access_branch(branch_id)" in sql
    assert "erp_security.has_permission('core.attachment.manage',branch_id)" in sql
    assert "DISABLE ROW LEVEL SECURITY" not in sql
    assert "NO FORCE ROW LEVEL SECURITY" not in sql


def test_attachment_lifecycle_is_narrow_and_verified_identity_stays_immutable():
    sql = SQL_PATH.read_text(encoding="utf-8")

    assert "OLD.status='pending_upload' AND NEW.status IN ('verified','rejected')" in sql
    assert "OLD.status='verified' AND NEW.status='retained'" in sql
    assert "attachment evidence identity is immutable" in sql
    assert "legal hold release requires a future reviewed command" in sql
    assert "attachment retention may only be extended" in sql
    assert "verified, retained, or held attachment evidence cannot be deleted" in sql


def test_private_object_path_is_exact_content_addressed_pdf_identity():
    sql = SQL_PATH.read_text(encoding="utf-8")

    assert "storage_bucket<>'canonical-evidence-private-v1'" in sql
    assert "evidence_kind='expense_receipt'" in sql
    assert "media_type='application/pdf'" in sql
    assert "pg_catalog.encode(sha256,'hex') || '.pdf'" in sql
    assert "attachments_branch_hash_uq" in sql


def test_runtime_role_check_covers_lifecycle_branch_and_tenant_denial():
    source = RUNTIME_CHECK.read_text(encoding="utf-8")

    assert 'SET SESSION AUTHORIZATION "erp_runtime"' in source
    assert "relforcerowsecurity" in source
    assert "BRANCH_A_HIDDEN" in source
    assert "ORG_B" in source
    assert "status='verified'" in source
    assert "status='rejected'" in source
    assert "legal_hold=true" in source


def test_runtime_role_check_is_part_of_the_postgresql_15_gate():
    gate = POSTGRES_GATE.read_text(encoding="utf-8")

    assert "check_canonical_evidence_attachment_runtime_role.py" in gate
