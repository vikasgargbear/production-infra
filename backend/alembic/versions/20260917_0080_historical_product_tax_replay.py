"""Repair pre-scoped-tax imported products through bounded canonical replay."""
import hashlib
from pathlib import Path
from alembic import context, op
from migration_support.canonical_baseline import CanonicalBaselineError

revision = "20260917_0080"
down_revision = "20260913_0079"
branch_labels = None
depends_on = None
SQL_PATH = Path(__file__).resolve().parents[1] / "sql/20260917_0080_historical_product_tax_replay.sql"
EXPECTED_SQL_SHA256 = "b6ae62e6d35a8eef7a434a1fa05a7694cc37c654e5f9d88b5232db8cf52aa471"


def upgrade():
    if context.is_offline_mode():
        raise CanonicalBaselineError("product tax replay requires online reviewed authority")
    sql = SQL_PATH.read_text()
    if hashlib.sha256(sql.encode()).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError("product tax replay source hash differs")
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(sql)
    finally:
        cursor.close()


def downgrade():
    raise CanonicalBaselineError("source tax snapshots require a forward revision")
