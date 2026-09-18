"""Named canonical command boundary for administrator billing self-consent."""
import hashlib
from sqlalchemy import text

AUTHORIZE_SQL = text("""
    SELECT erp_automation_commands.authorize_own_web_billing(
      :org_id,:branch_id,:maximum_amount,:expires_at,:key_hash)
""")
REVOKE_SQL = text("""
    SELECT erp_automation_commands.revoke_own_web_billing(:org_id,:grant_id,:row_version)
""")


def authorize_billing(db, *, org_id, branch_id, maximum_amount, expires_at, key):
    return db.execute(AUTHORIZE_SQL, dict(org_id=org_id, branch_id=branch_id, maximum_amount=maximum_amount,
               expires_at=expires_at, key_hash=hashlib.sha256(key.encode()).digest())).scalar_one()


def revoke_billing(db, *, org_id, grant_id, row_version):
    return db.execute(REVOKE_SQL, dict(org_id=org_id, grant_id=grant_id, row_version=row_version)).scalar_one()
