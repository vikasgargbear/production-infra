"""Record reviewed batch selling rates through the canonical command lifecycle."""
import hashlib
from pathlib import Path
from alembic import context, op
from migration_support.canonical_baseline import CanonicalBaselineError

revision = "20260913_0079"
down_revision = "20260913_0078"
branch_labels = None
depends_on = None
SQL_PATH = Path(__file__).resolve().parents[1] / "sql/20260913_0079_batch_sale_rate_evidence.sql"
EXPECTED_SQL_SHA256 = "72f083789e5b4f365375f15f3ade6d7dd6baba3f80c561d992d16c4ff44f5bc6"


def upgrade():
    if context.is_offline_mode():
        raise CanonicalBaselineError("batch selling rates require online reviewed authority")
    sql = SQL_PATH.read_text()
    if hashlib.sha256(sql.encode()).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError("batch selling-rate source hash differs")
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(sql)
    finally:
        cursor.close()


def downgrade():
    raise CanonicalBaselineError("selling-rate evidence requires a forward revision")
