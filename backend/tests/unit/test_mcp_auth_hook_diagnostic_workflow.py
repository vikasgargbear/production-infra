import ast
import io
import json
from pathlib import Path
import textwrap
from unittest.mock import patch

import pytest

WORKFLOW = Path(__file__).resolve().parents[3] / '.github/workflows/canonical-web-authority-reconcile.yml'


def management_source():
    section = WORKFLOW.read_text().split('- name: Inspect hosted MCP token hook', 1)[1]
    return textwrap.dedent(section.split("python3 - <<'PY'", 1)[1].split('\n          PY', 1)[0])


@pytest.mark.parametrize('enabled,uri,matches', [
    (True, 'pg-functions://postgres/erp_security/canonical_evidence_storage_access_token_hook', True),
    (False, 'pg-functions://postgres/erp_security/canonical_evidence_storage_access_token_hook', False),
    (True, 'https://unexpected.example/?secret=hidden', False),
])
def test_hosted_attestation_only_gets_safe_fields(tmp_path, monkeypatch, enabled, uri, matches):
    target = tmp_path / 'receipt.json'
    monkeypatch.setenv('SUPABASE_ACCESS_TOKEN', 'do-not-print-management-secret')
    monkeypatch.setenv('CANONICAL_STAGING_PROJECT_REF', 'reviewed-project')
    monkeypatch.setenv('REVIEWED_SHA', 'a' * 40)
    monkeypatch.setenv('AUTHORITY_RECEIPT_PATH', str(target))
    body = json.dumps(dict(hook_custom_access_token_enabled=enabled,
        hook_custom_access_token_uri=uri, unrelated_secret='never-disclose'))
    output = io.StringIO()
    with patch('urllib.request.urlopen', return_value=io.StringIO(body)) as request, patch('sys.stdout', output):
        exec(compile(management_source(), str(WORKFLOW), 'exec'), {})
    assert request.call_args.args[0].method == 'GET'
    assert request.call_args.args[0].data is None
    receipt = json.loads(target.read_text())
    assert receipt['hook_matches_expected'] is matches
    for secret in ('do-not-print-management-secret', 'never-disclose', 'secret=hidden'):
        assert secret not in output.getvalue() + target.read_text()


def test_sql_diagnostic_has_no_mutating_statement_or_token_extraction():
    source = WORKFLOW.read_text().split('diagnostic_code=$(python3', 1)[1].split('""")', 1)[0].split('print(r"""', 1)[1]
    source = textwrap.dedent(source)
    tree = ast.parse(source)
    statements = [node.args[0].value for node in ast.walk(tree)
        if isinstance(node,ast.Call) and isinstance(node.func,ast.Attribute)
        and node.func.attr=='execute' and isinstance(node.args[0],ast.Constant)]
    assert statements and statements[0] == 'SET TRANSACTION READ ONLY'
    assert all(sql.startswith(('SELECT', 'SET TRANSACTION READ ONLY')) for sql in statements)
    for forbidden in ('_enter_migration_owner', 'SET ROLE', 'GRANT ', 'access_token', 'raw_app_meta_data'):
        assert forbidden not in source.replace('canonical_evidence_storage_access_token_hook', 'hook')
    assert "result['synthetic_hook_has_receipt']" in source
    assert "result['synthetic_hook_exact_org']" in source


def test_diagnostic_skips_grant_and_metadata_reconciliation():
    source=WORKFLOW.read_text()
    assert "- name: Reconcile one bounded reviewed web grant\n        if: env.AUTHORITY_SCOPE != 'mcp_auth_diagnostic'" in source
    metadata=source.split('- name: Bind the exact MCP subject',1)[1]
    assert "if: env.AUTHORITY_SCOPE == 'mcp'\n" in metadata
    assert 'INSPECT_CANONICAL_STAGING_MCP_AUTH' in source
