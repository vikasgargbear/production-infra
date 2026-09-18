"""Bind permission checks to the requested capability, not a joined column."""
import hashlib
from pathlib import Path
from alembic import context, op
from migration_support.canonical_baseline import CanonicalBaselineError

revision = "20260918_0081"
down_revision = "20260917_0080"
branch_labels = None
depends_on = None
SQL_PATH = Path(__file__).resolve().parents[1] / "sql/20260918_0081_permission_argument_scope.sql"
EXPECTED_SQL_SHA256 = "73d113ac21f82862d3a16a0c7a07367e05b2ccb925c67968e3ddca0263fe582d"


def upgrade():
    if context.is_offline_mode():
        raise CanonicalBaselineError("permission repair requires online reviewed authority")
    sql = SQL_PATH.read_text()
    if hashlib.sha256(sql.encode()).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError("permission repair source hash differs")
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(sql)
    finally:
        cursor.close()


def downgrade():
    raise CanonicalBaselineError("permission safety requires a forward revision")
