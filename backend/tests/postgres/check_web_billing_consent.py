"""Executable first-party consent boundaries on disposable PG15; always rolls back."""
import hashlib
import os
from uuid import uuid4

from sqlalchemy import create_engine, text
from sqlalchemy.exc import DBAPIError
from fastapi import HTTPException
from app.api.routes import web_billing_consent, web_operator_actions
from app.infrastructure.operator_actions.service import _AUTHORIZE_SQL


def main():
    engine = create_engine(os.environ['DATABASE_URL'])
    with engine.connect() as c:
        transaction = c.begin()
        try:
            auth = uuid4()
            c.execute(text('INSERT INTO auth.users(id) VALUES(:auth)'), {'auth': auth})
            c.execute(text("SELECT set_config('app.request_id',:id,true)"), {'id': str(uuid4())})
            org, member = c.execute(text("""SELECT * FROM erp_core_commands.onboard_organization(
                :auth,'billing@example.test','Billing Test','Billing Test',NULL,
                '1 Test Road','Jaipur','08','302001')"""), {'auth': auth}).one()
            branch = c.execute(text('SELECT id FROM core.branches WHERE org_id=:org'), {'org': org}).scalar_one()
            user_id = c.execute(text('SELECT user_id FROM core.memberships WHERE org_id=:org AND id=:member'), {'org':org,'member':member}).scalar_one()
            user = {'org_id':str(org),'auth_user_id':str(auth),'user_id':str(user_id)}
            params = {'org': org, 'branch': branch, 'amount': '1000.00',
                      'key': hashlib.sha256(b'first-consent').digest()}
            c.exec_driver_sql('SET SESSION AUTHORIZATION erp_runtime')
            c.execute(text("SELECT erp_security.activate_context(:auth,:org),set_config('app.request_id',:id,true)"),
                      {'auth': auth, 'org': org, 'id': str(uuid4())})
            query = "SELECT erp_automation_commands.authorize_own_web_billing(:org,:branch,CAST(:amount AS numeric),transaction_timestamp()+interval '1 hour',:key)"

            def denied(statement, args, states):
                savepoint = c.begin_nested()
                try:
                    c.execute(text(statement), args)
                except DBAPIError as error:
                    assert error.orig.pgcode in states, error.orig.pgcode
                    savepoint.rollback()
                else:
                    savepoint.rollback()
                    raise AssertionError('Unauthorized operation succeeded')

            for amount in ('0', '-1', 'NaN', 'Infinity', '1.001'):
                denied(query, {**params, 'amount': amount}, {'22023'})
            denied(query.replace("interval '1 hour'", "interval '-1 second'"), params, {'22023'})
            denied(query, {**params, 'org': uuid4()}, {'42501'})
            denied(query, {**params, 'branch': uuid4()}, {'42501'})
            grant = c.execute(text(query), params).scalar_one()
            snapshot = web_billing_consent._snapshot(c, org)
            assert snapshot['can_manage'] is True
            assert [row['id'] for row in snapshot['grants']] == [grant]
            context = web_operator_actions._resolve_context(c,user,'sales.invoice.prepare',branch_ids=(branch,))
            assert context.agent_grant_id == grant
            auth_params = dict(org_id=org,agent_grant_id=grant,membership_id=member,
                client_id='aasopharma-erp-web',user_id=user_id,auth_user_id=auth,
                operation_key='sales.invoice.prepare',operation_mode='write',risk_class='consequential_write',
                approval_policy='actor_confirmation',permission_code='sales.invoice.create')
            assert len(c.execute(_AUTHORIZE_SQL,auth_params).all()) == 1
            for change in ('other_branch','expired'):
                scope_savepoint = c.begin_nested()
                c.exec_driver_sql('RESET SESSION AUTHORIZATION')
                # Disposable negative authority fixture only: immutable grant shape is
                # installed by the test administrator, then all guards are restored.
                c.exec_driver_sql('ALTER TABLE core.access_grants DISABLE TRIGGER USER')
                if change == 'other_branch':
                    other = uuid4()
                    c.execute(text("INSERT INTO core.branches(org_id,id,code,name,address_line1,city,state_code,postal_code) VALUES(:org,:other,'OTHER','Other','2 Test Road','Jaipur','08','302001')"), {'org':org,'other':other})
                    c.execute(text("UPDATE core.access_grants SET scope_kind='branch',branch_id=:other,row_version=row_version+1 WHERE org_id=:org AND membership_id=:member"), {'org':org,'member':member,'other':other})
                else:
                    c.execute(text("UPDATE core.access_grants SET valid_from_at=transaction_timestamp()-interval '2 hours',expires_at=transaction_timestamp()-interval '1 hour',row_version=row_version+1 WHERE org_id=:org AND membership_id=:member"), {'org':org,'member':member})
                c.exec_driver_sql('ALTER TABLE core.access_grants ENABLE TRIGGER USER')
                c.exec_driver_sql('SET SESSION AUTHORIZATION erp_runtime')
                assert not c.execute(_AUTHORIZE_SQL,auth_params).all(), change
                scope_savepoint.rollback()
                c.exec_driver_sql('SET SESSION AUTHORIZATION erp_runtime')
            try:
                web_operator_actions._resolve_context(c,user,'automation.command.execute',command_request_id=uuid4())
            except HTTPException as error:
                assert error.status_code == 403
            else:
                raise AssertionError('Unrelated command accepted by invoice consent')
            assert c.execute(text(query), params).scalar_one() == grant
            caps = c.execute(text('SELECT capability_code,maximum_amount FROM automation.agent_grant_capabilities WHERE org_id=:org AND agent_grant_id=:grant'), {'org': org, 'grant': grant}).all()
            assert {r[0] for r in caps} == {'sales.invoice.prepare', 'automation.command.approve', 'automation.command.execute', 'automation.command.status.get'}
            assert str(dict(caps)['sales.invoice.prepare']) == '1000.00'
            denied(query, {**params, 'amount': '2000.00'}, {'23505', '22023'})
            denied(query, {**params, 'key': hashlib.sha256(b'new-consent').digest()}, {'23505'})
            denied('SELECT erp_automation_commands.revoke_own_web_billing(:org,:grant,2)', {'org': org, 'grant': grant}, {'40001'})
            denied('SELECT erp_automation_commands.revoke_own_web_billing(:org,:grant,1)', {'org': uuid4(), 'grant': grant}, {'42501'})
            # Removing manage permission cannot be bypassed by retaining a session or old receipt.
            c.exec_driver_sql('RESET SESSION AUTHORIZATION')
            c.execute(text("DELETE FROM core.role_permissions WHERE org_id=:org AND permission_code='automation.agent_grant.manage'"), {'org': org})
            c.exec_driver_sql('SET SESSION AUTHORIZATION erp_runtime')
            assert c.execute(text("SELECT erp_security.has_permission('automation.agent_grant.manage',NULL::uuid)")).scalar_one() is False, 'Removed permission still resolves true'
            assert web_billing_consent._snapshot(c,org)['can_manage'] is False
            denied(query, params, {'42501'})
            # Revocation remains available after administrator permission withdrawal.
            revoke = text('SELECT erp_automation_commands.revoke_own_web_billing(:org,:grant,1)')
            assert c.execute(revoke, {'org': org, 'grant': grant}).scalar_one() == grant
            try:
                web_operator_actions._resolve_context(c,user,'sales.invoice.prepare',branch_ids=(branch,))
            except HTTPException as error:
                assert error.status_code == 403
            else:
                raise AssertionError('Revoked consent accepted by web context')
            assert c.execute(revoke, {'org': org, 'grant': grant}).scalar_one() == grant
            assert c.execute(text("SELECT count(*) FROM automation.agent_grant_capabilities WHERE org_id=:org AND agent_grant_id=:grant AND status='active'"), {'org': org, 'grant': grant}).scalar_one() == 0
            c.exec_driver_sql('RESET SESSION AUTHORIZATION')
            denied('SET ROLE erp_app; SELECT erp_automation_commands.authorize_own_web_billing(:org,:branch,1000,now()+interval \'1 hour\',:key)', params, {'42501'})
            print('PASS: finite consent, exact scope, replay, invalid inputs, cross-org, role withdrawal, revocation and role fence')
        finally:
            transaction.rollback()
            c.exec_driver_sql('RESET SESSION AUTHORIZATION')


if __name__ == '__main__':
    main()
