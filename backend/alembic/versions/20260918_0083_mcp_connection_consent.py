"""Explicit reviewed organization consent for OAuth MCP connections."""
import hashlib
from pathlib import Path
from alembic import context, op
from migration_support.canonical_baseline import CanonicalBaselineError

revision = "20260918_0083"
down_revision = "20260918_0082"
branch_labels = None
depends_on = None
SQL_PATH = Path(__file__).resolve().parents[1] / "sql/20260918_0083_mcp_connection_consent.sql"
EXPECTED_SQL_SHA256 = "8124d7535c07d93b3c532640349524b2b260f769feffff98db603258e8672f8e"


def upgrade():
    if context.is_offline_mode():
        raise CanonicalBaselineError("MCP connection consent requires online reviewed authority")
    sql = SQL_PATH.read_text()
    if hashlib.sha256(sql.encode()).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError("MCP connection consent source hash differs")
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(sql)
    finally:
        cursor.close()


def downgrade():
    raise CanonicalBaselineError("MCP connection consent requires a forward revision")
