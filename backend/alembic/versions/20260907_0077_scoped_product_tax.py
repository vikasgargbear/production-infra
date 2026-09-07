"""Preserve reviewed tenant product tax without replacing shared reference data."""
import hashlib
from pathlib import Path

from alembic import context, op
from migration_support.canonical_baseline import CanonicalBaselineError

revision = "20260907_0077"
down_revision = "20260901_0076"
branch_labels = None
depends_on = None
SQL_PATH = Path(__file__).resolve().parents[1] / "sql/20260907_0077_scoped_product_tax.sql"
EXPECTED_SQL_SHA256 = "dc8e27492776b3ef8fed2963a3207803d173d37b8704f79e93e2853227a36771"


def upgrade():
    if context.is_offline_mode():
        raise CanonicalBaselineError("scoped product tax requires online reviewed authority")
    sql = SQL_PATH.read_text()
    if hashlib.sha256(sql.encode()).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError("scoped product tax migration source hash differs")
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(sql)
    finally:
        cursor.close()


def downgrade():
    raise CanonicalBaselineError("scoped product tax snapshots are retained")
