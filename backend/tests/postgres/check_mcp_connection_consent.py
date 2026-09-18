"""Disposable PG15 proof of tenant-bound self-consent and token-hook composition."""
import json
import os
import time
from uuid import UUID, uuid4
from urllib.parse import urlparse

from sqlalchemy import create_engine, text
from sqlalchemy.exc import DBAPIError
import check_mcp_live_action_authority_runtime_role as base
import check_evidence_storage_auth_hook as evidence


def main():
    url = os.environ["DATABASE_URL"]
    assert urlparse(url).hostname in {"localhost", "127.0.0.1"}
    engine = create_engine(url)
    for name, value in list(vars(base.fixture).items()):
        if isinstance(value, UUID):
            setattr(base.fixture, name, uuid4())
    with engine.connect() as db:
        transaction = db.begin()
        try:
            base.fixture._seed(db)
            base._seed_action_grant(db)
            subject = str(base.fixture.AUTH_A)
            client = "mcp-live-action-runtime-test"
            db.exec_driver_sql('SET SESSION AUTHORIZATION erp_runtime')
            proposals = db.execute(text("SELECT erp_core_commands.mcp_connection_proposals(:s)"), {"s": subject}).scalar_one()
            assert len(proposals) == 1
            proposal = proposals[0]
            assert proposal["organization_id"] == str(base.fixture.ORG_A)
            args = {"s": subject, "o": proposal["organization_id"], "c": client,
                    "g": proposal["agent_grant_id"], "f": proposal["proposal_fingerprint"]}
            command = text("SELECT erp_core_commands.confirm_mcp_connection(:s,:o,:c,:g,:f)")
            with db.begin_nested() as rejected:
                try:
                    db.execute(command, {**args, "o": str(base.fixture.ORG_B)})
                except DBAPIError:
                    rejected.rollback()
                else:
                    raise AssertionError("cross-organization consent accepted")
            confirmed = db.execute(command, args).scalar_one()
            assert confirmed["confirmed"] is True
            assert db.execute(command, args).scalar_one()["receipt_id"] == confirmed["receipt_id"]
            db.exec_driver_sql("SET LOCAL timezone='Asia/Kolkata'")
            assert db.execute(text("SELECT erp_core_commands.mcp_connection_proposals(:s)"), {"s": subject}).scalar_one() == proposals
            db.exec_driver_sql("SET LOCAL timezone='UTC'")
            with db.begin_nested() as rejected:
                try:
                    db.execute(text("SELECT * FROM erp_security.mcp_connection_receipts"))
                except DBAPIError:
                    rejected.rollback()
                else:
                    raise AssertionError("runtime can read private receipts")
            with db.begin_nested() as rejected:
                try:
                    db.execute(text("SELECT erp_security.mcp_connection_claim(:s,:c)"), {"s": subject, "c": client})
                except DBAPIError:
                    rejected.rollback()
                else:
                    raise AssertionError("runtime can invoke Auth projector")
            db.exec_driver_sql('RESET SESSION AUTHORIZATION')
            db.exec_driver_sql('SET LOCAL ROLE supabase_auth_admin')
            now = int(time.time())
            original = {"sub": subject, "aud": "authenticated", "role": "authenticated",
                "iat": now, "exp": now + 3600, "app_metadata": {"org_id": str(uuid4())}}
            hook = text("SELECT erp_security.canonical_evidence_storage_access_token_hook(CAST(:e AS jsonb))")
            for method in ("oauth_provider/authorization_code", "token_refresh"):
                claims = {**original, "client_id": client, "erp_mcp_connection": {"forged": True}}
                event = {"user_id": subject, "authentication_method": method, "claims": claims}
                result = db.execute(hook, {"e": json.dumps(event)}).scalar_one()["claims"]
                receipt = result["erp_mcp_connection"]
                assert receipt["receipt_id"] == confirmed["receipt_id"]
                assert receipt["organization_id"] == proposal["organization_id"]
                assert result["app_metadata"] == original["app_metadata"]
                event["claims"]["client_id"] = "unconsented-client"
                assert "erp_mcp_connection" not in db.execute(hook, {"e": json.dumps(event)}).scalar_one()["claims"]
            google = {"user_id": subject, "authentication_method": "oauth", "claims": original}
            assert db.execute(hook, {"e": json.dumps(google)}).scalar_one()["claims"] == original
            for method in ("password", "token_refresh"):
                claims = db.execute(hook, {"e": json.dumps(evidence._event(method, now))}).scalar_one()["claims"]
                assert claims["role"] == evidence.SERVICE_ROLE
                assert now < claims["exp"] <= now + 900
            db.exec_driver_sql('RESET ROLE')
            db.exec_driver_sql('SET SESSION AUTHORIZATION erp_runtime')
            db.execute(text("SELECT erp_security.activate_context(:s,:o)"), args)
            matches = text("SELECT erp_core_commands.mcp_connection_receipt_matches(:s,:c,CAST(:r AS jsonb))")
            assert db.execute(matches, {"s": subject, "c": client, "r": json.dumps(receipt)}).scalar_one() is True
            assert db.execute(matches, {"s": subject, "c": "other-client", "r": json.dumps(receipt)}).scalar_one() is False
            db.exec_driver_sql('RESET SESSION AUTHORIZATION')
            db.exec_driver_sql('SET LOCAL ROLE erp_migration_owner')
            # A capability change after confirmation invalidates the receipt at
            # token refresh and each API request, rather than expanding consent.
            db.exec_driver_sql('ALTER TABLE automation.agent_grant_capabilities DISABLE TRIGGER USER')
            db.execute(text("UPDATE automation.agent_grant_capabilities SET allow_sensitive_read=true WHERE org_id=:o AND agent_grant_id=:g"), args)
            db.exec_driver_sql('ALTER TABLE automation.agent_grant_capabilities ENABLE TRIGGER USER')
            assert db.execute(text("SELECT erp_security.mcp_connection_claim(:s,:c)"), {"s": subject, "c": client}).scalar_one() is None
            db.exec_driver_sql('RESET ROLE')
        finally:
            transaction.rollback()
            db.exec_driver_sql('RESET SESSION AUTHORIZATION')
    print("MCP receipt: exact tenant/client/grant, replay, scope-change denial, hook refresh and service identity passed")


if __name__ == "__main__":
    main()
