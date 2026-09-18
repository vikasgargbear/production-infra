"""Permission withdrawal regression on a disposable PG15 database; always rolls back."""
import os
from urllib.parse import urlparse
from uuid import uuid4

from sqlalchemy import create_engine, text


def main():
    url = os.environ['DATABASE_URL']
    parsed = urlparse(url)
    if (os.environ.get('CANONICAL_CI_ALLOW_DISPOSABLE') != '1'
            or parsed.hostname not in {'127.0.0.1', 'localhost'}
            or parsed.path != '/canonical_alembic_ci'):
        raise RuntimeError('Only the explicitly disposable local PG15 database is allowed')
    engine = create_engine(url)
    with engine.connect() as c:
        transaction = c.begin()
        try:
            auth = uuid4()
            c.execute(text('INSERT INTO auth.users(id) VALUES(:auth)'), {'auth': auth})
            c.execute(text("SELECT set_config('app.request_id',:id,true)"), {'id': str(uuid4())})
            org, member = c.execute(text("""SELECT * FROM erp_core_commands.onboard_organization(
                :auth,'permission@example.test','CODEX-E2E Permission','CODEX-E2E Permission',NULL,
                '1 Test Road','Jaipur','08','302001')"""), {'auth': auth}).one()
            branch = c.execute(text('SELECT id FROM core.branches WHERE org_id=:org'), {'org': org}).scalar_one()
            c.exec_driver_sql('SET SESSION AUTHORIZATION erp_runtime')
            c.execute(text('SELECT erp_security.activate_context(:auth,:org)'), {'auth': auth, 'org': org})

            def allowed(code, branch_id=None):
                return c.execute(text('SELECT erp_security.has_permission(:code,CAST(:branch AS uuid))'),
                                 {'code': code, 'branch': branch_id}).scalar_one()

            assert allowed('automation.agent_grant.manage') is True
            assert allowed('not.a.real.permission') is False
            assert allowed(None) is False
            assert allowed('sales.invoice.create', branch) is True
            c.exec_driver_sql('RESET SESSION AUTHORIZATION')
            c.execute(text("DELETE FROM core.role_permissions WHERE org_id=:org AND permission_code='automation.agent_grant.manage'"), {'org': org})
            c.exec_driver_sql('SET SESSION AUTHORIZATION erp_runtime')
            assert allowed('automation.agent_grant.manage') is False
            assert allowed('automation.agent_grant.manage', branch) is False
            assert allowed('sales.invoice.create', branch) is True
            c.execute(text("SELECT set_config('app.org_id',:org,true)"), {'org': str(uuid4())})
            assert allowed('sales.invoice.create', branch) is False
            print('PASS: exact permission, unknown/null denial, withdrawn permission, unchanged valid permission, cross-org denial')
        finally:
            c.exec_driver_sql('RESET SESSION AUTHORIZATION')
            transaction.rollback()


if __name__ == '__main__':
    main()
