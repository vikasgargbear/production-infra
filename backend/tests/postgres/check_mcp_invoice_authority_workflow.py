"""Execute actual embedded authority SQL on disposable PG15, always rollback.

Only transport and production-only TLS attestation are substituted. Identity,
permission checks, grant insert, immutable replay and readback are actual SQL.
"""
import hashlib
import io
import json
import os
from pathlib import Path
import textwrap
from unittest.mock import patch
from uuid import uuid4

import psycopg2
from scripts import provision_staging_mcp_oauth as provision


def main():
    connection = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with connection.cursor() as cursor:
            auth = str(uuid4())
            cursor.execute("INSERT INTO auth.users(id) VALUES(%s)", (auth,))
            cursor.execute("SELECT set_config('app.request_id',%s,true)", (str(uuid4()),))
            cursor.execute("""SELECT * FROM erp_core_commands.onboard_organization(
                %s,'workflow@example.test','Workflow Test','Workflow Test',NULL,
                '1 Test Road','Jaipur','08','302001')""", (auth,))
            org, member = cursor.fetchone()
            cursor.execute("SELECT id FROM core.branches WHERE org_id=%s", (org,))
            branch = cursor.fetchone()[0]
            cursor.execute("SELECT user_id FROM core.memberships WHERE org_id=%s AND id=%s", (org, member))
            user = cursor.fetchone()[0]
            cursor.execute("SET SESSION AUTHORIZATION erp_runtime")
            cursor.execute("SELECT erp_security.activate_context(%s,%s)", (auth, org))
            cursor.execute("""SELECT erp_automation_commands.authorize_own_web_billing(
                %s,%s,1000,transaction_timestamp()+interval '2 hours',%s)""",
                (org, branch, hashlib.sha256(b"workflow-consent").digest()))
            web_grant = cursor.fetchone()[0]
            cursor.execute("RESET SESSION AUTHORIZATION")

        class Transport:
            def __enter__(self): return self
            def __exit__(self, *args): return False
            def cursor(self): return connection.cursor()
            def rollback(self): connection.rollback()

        workflow = Path(__file__).resolve().parents[3] / '.github/workflows/canonical-web-authority-reconcile.yml'
        source = textwrap.dedent(workflow.read_text().split("print(r'''", 1)[1].split("''')", 1)[0])
        client = str(uuid4())
        request = dict(expected_sha='a' * 40, project_ref='rgihahbmkrmhitjdjvev',
            production_project_refs='', password='disposable-only', auth_user_id=auth,
            authority_scope='mcp_invoice', organization_id=str(org), subject_user_id=str(user),
            branch_id=str(branch), mcp_client_id=client, mcp_reviewed_sha='a' * 40,
            mcp_tool_inventory_sha256='b' * 64, consent_receipt_id='disposable-explicit-consent-20260918')
        receipts = []
        for _ in range(2):
            output = io.StringIO()
            with patch.dict(os.environ, RAILWAY_GIT_COMMIT_SHA='a' * 40,
                            MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS=client), \
                 patch('psycopg2.connect', return_value=Transport()), \
                 patch.object(provision, '_attest_reviewed_database'), \
                 patch('sys.stdin', io.StringIO(json.dumps(request))), patch('sys.stdout', output):
                exec(compile(source, str(workflow), 'exec'), {})
            receipts.append(json.loads(output.getvalue()))
        assert [r['reconciliation_outcome'] for r in receipts] == ['created', 'unchanged']
        assert receipts[0]['grant_id'] == receipts[1]['grant_id']
        assert receipts[0]['expires_at'] == receipts[1]['expires_at']
        assert receipts[0]['capability_count'] == 10
        with connection.cursor() as cursor:
            cursor.execute("""SELECT m.expires_at=w.expires_at,m.branch_id=%s,
                m.consented_by_membership_id=%s,m.granted_by_membership_id=%s
                FROM automation.agent_grants m,automation.agent_grants w
                WHERE m.id=%s AND w.id=%s""",
                (branch,member,member,receipts[0]['grant_id'],web_grant))
            assert cursor.fetchone() == (True,True,True,True)
        print('PASS: actual workflow grant SQL, exact branch/audit identity, ten caps, clamped expiry and immutable replay')
    finally:
        connection.rollback()
        connection.close()


if __name__ == '__main__':
    main()
