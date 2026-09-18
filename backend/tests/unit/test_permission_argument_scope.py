"""Bind forward repair bytes to the single generated security helper owner."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[3]


def test_permission_repair_matches_generated_helper():
    source = (ROOT / 'database/canonical/security/canonical_rls.sql').read_text()
    helper = re.search(r'CREATE FUNCTION "erp_security"\."has_permission".*?\$function\$;', source, re.S).group()
    assert 'role_permission.permission_code = $1' in helper
    assert 'role_permission.permission_code = permission_code' not in helper
    migration = (ROOT / 'backend/alembic/sql/20260918_0081_permission_argument_scope.sql').read_text()
    assert helper.replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION', 1) in migration
    assert migration.count('CREATE OR REPLACE FUNCTION') == 1
