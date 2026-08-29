"""Prove live MCP action authority revalidation executes as erp_runtime."""

from __future__ import annotations

import importlib.util
import os
from pathlib import Path

from sqlalchemy import create_engine, text

from app.api.routes.internal import mcp_agent_grants
from app.api.routes.internal.mcp_master_contract import master_write_policy_for
from app.domain.operator_actions import ActionContext


HERE = Path(__file__).resolve().parent
FIXTURE_PATH = HERE / "check_canonical_master_write_function_runtime_role.py"
SPEC = importlib.util.spec_from_file_location("master_write_fixture", FIXTURE_PATH)
assert SPEC and SPEC.loader
fixture = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(fixture)


def _context(**changes) -> ActionContext:
    values = {
        "auth_user_id": fixture.AUTH_A,
        "user_id": fixture.USER_A,
        "organization_id": fixture.ORG_A,
        "membership_id": fixture.MEMBER_A,
        "agent_grant_id": fixture.GRANT_A,
        "client_id": "mcp-live-action-runtime-test",
        "operation_key": "catalog.product.activate",
        "permission": "catalog.product.manage",
        "branch_ids": (),
        "organization_scope": True,
        "delegated_command_request_id": None,
    }
    values.update(changes)
    return ActionContext(**values)


def _seed_action_grant(connection) -> None:
    connection.exec_driver_sql('SET LOCAL ROLE "erp_migration_owner"')
    connection.exec_driver_sql(
        "ALTER TABLE automation.agent_grants DISABLE TRIGGER USER"
    )
    connection.exec_driver_sql(
        "ALTER TABLE automation.agent_grant_capabilities DISABLE TRIGGER USER"
    )
    connection.execute(
        text(
            """
            INSERT INTO automation.agent_grants(
              org_id,id,subject_membership_id,client_id,client_display_name,
              authorization_mode,consent_version,consent_text_hash,
              consented_by_membership_id,consented_at,granted_by_membership_id,
              granted_at,expires_at,status,created_by_membership_id,
              updated_by_membership_id)
            VALUES (
              :org_id,:grant_id,:membership_id,:client_id,
              'MCP live action runtime test','self_consent','runtime-test-v1',
              pg_catalog.decode(repeat('61',32),'hex'),:membership_id,
              transaction_timestamp(),:membership_id,transaction_timestamp(),
              transaction_timestamp()+interval '1 hour','active',:membership_id,
              :membership_id);
            INSERT INTO automation.agent_grant_capabilities(
              org_id,agent_grant_id,capability_code,operation_mode,risk_class,
              approval_policy,allow_sensitive_read,status,created_by_membership_id)
            VALUES (
              :org_id,:grant_id,'catalog.product.activate','write',
              'consequential_write','actor_confirmation',false,'active',
              :membership_id)
            """
        ),
        {
            "org_id": fixture.ORG_A,
            "grant_id": fixture.GRANT_A,
            "membership_id": fixture.MEMBER_A,
            "client_id": "mcp-live-action-runtime-test",
        },
    )
    connection.exec_driver_sql(
        "ALTER TABLE automation.agent_grant_capabilities ENABLE TRIGGER USER"
    )
    connection.exec_driver_sql(
        "ALTER TABLE automation.agent_grants ENABLE TRIGGER USER"
    )
    connection.exec_driver_sql("RESET ROLE")


def main() -> None:
    engine = create_engine(os.environ["DATABASE_URL"])
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            fixture._seed(connection)
            _seed_action_grant(connection)
            connection.exec_driver_sql('SET SESSION AUTHORIZATION "erp_runtime"')
            policy = master_write_policy_for("catalog.product.activate")
            assert policy is not None

            assert mcp_agent_grants.live_operator_action_authority_is_active(
                connection, context=_context(), policy=policy
            ) is True
            assert mcp_agent_grants.live_operator_action_authority_is_active(
                connection,
                context=_context(client_id="wrong-client"),
                policy=policy,
            ) is False
            missing_policy = master_write_policy_for(
                "catalog.product_draft.configure"
            )
            assert missing_policy is not None
            assert mcp_agent_grants.live_operator_action_authority_is_active(
                connection,
                context=_context(
                    operation_key="catalog.product_draft.configure"
                ),
                policy=missing_policy,
            ) is False
        finally:
            transaction.rollback()
            connection.exec_driver_sql("RESET SESSION AUTHORIZATION")
            engine.dispose()


if __name__ == "__main__":
    main()
