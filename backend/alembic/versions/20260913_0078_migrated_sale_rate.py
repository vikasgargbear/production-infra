"""Resolve reviewed imported selling rates without rewriting business records."""
import hashlib
from pathlib import Path
from alembic import context, op
from migration_support.canonical_baseline import CanonicalBaselineError

revision = "20260913_0078"
down_revision = "20260907_0077"
branch_labels = None
depends_on = None
SQL_PATH = Path(__file__).resolve().parents[1] / "sql/20260913_0078_migrated_sale_rate.sql"
EXPECTED_SQL_SHA256 = "5e0eb9242d9bb130ed94a300346b409f906fb70fa3a18b8aa93e47a55c5a998d"


def upgrade():
    if context.is_offline_mode():
        raise CanonicalBaselineError("migrated sale rates require online reviewed authority")
    sql = SQL_PATH.read_text()
    if hashlib.sha256(sql.encode()).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError("migrated sale-rate source hash differs")
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(sql)
    finally:
        cursor.close()


def downgrade():
    raise CanonicalBaselineError("migrated sale-rate read authority requires a forward revision")
