"""Explicit administrator self-consent for first-party invoice billing."""
import hashlib
from pathlib import Path
from alembic import context, op
from migration_support.canonical_baseline import CanonicalBaselineError

revision = "20260918_0082"
down_revision = "20260918_0081"
branch_labels = None
depends_on = None
SQL_PATH = Path(__file__).resolve().parents[1] / "sql/20260918_0082_web_billing_consent.sql"
EXPECTED_SQL_SHA256 = "cca261b6d4645414acd444448834831141c88e3e6cb7a1052d411dc06b591a26"


def upgrade():
    if context.is_offline_mode():
        raise CanonicalBaselineError("billing consent requires online reviewed authority")
    sql = SQL_PATH.read_text()
    if hashlib.sha256(sql.encode()).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError("billing consent source hash differs")
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(sql)
    finally:
        cursor.close()


def downgrade():
    raise CanonicalBaselineError("billing consent requires a forward revision")
