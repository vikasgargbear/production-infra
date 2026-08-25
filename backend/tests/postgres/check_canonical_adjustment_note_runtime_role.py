"""Verify the standalone adjustment-note command boundary on PostgreSQL 15.

The disposable baseline database has no tenant fixtures, so this gate verifies
the executable runtime/calculator split, dispatcher-to-commercial-poster
composition, idempotency constraints, forced RLS, and that both authenticated
read projections compile under ``erp_app``. Business-effect lifecycle coverage
is supplied by the rollback commercial-command checks plus the live scenario
matrix after a demo fixture pack is provisioned.
"""

from __future__ import annotations

import os
from uuid import UUID

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session


ORG_ID = UUID("d3900000-0000-7000-8000-000000000001")
MEMBERSHIP_ID = UUID("d3900000-0000-7000-8000-000000000002")
AUTH_USER_ID = UUID("d3900000-0000-7000-8000-000000000003")
NOTE_ID = UUID("d3900000-0000-7000-8000-000000000004")


def _function(session: Session, schema_name: str, function_name: str) -> dict:
    rows = session.execute(
        text(
            """
            SELECT procedure.oid,
                   procedure.prosecdef AS security_definer,
                   pg_get_functiondef(procedure.oid) AS body,
                   has_function_privilege('erp_runtime', procedure.oid, 'EXECUTE') AS runtime_execute,
                   has_function_privilege('erp_calculator', procedure.oid, 'EXECUTE') AS calculator_execute,
                   has_function_privilege('erp_app', procedure.oid, 'EXECUTE') AS app_execute
              FROM pg_proc AS procedure
              JOIN pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
             WHERE namespace.nspname=:schema_name AND procedure.proname=:function_name
            """
        ),
        {"schema_name": schema_name, "function_name": function_name},
    ).mappings().all()
    assert len(rows) == 1, f"missing or overloaded {schema_name}.{function_name}"
    return dict(rows[0])


def main() -> None:
    engine = create_engine(os.environ["DATABASE_URL"])
    try:
        with Session(engine) as session, session.begin():
            assert int(session.scalar(text("SHOW server_version_num"))) // 10000 == 15
            resolve = _function(
                session, "erp_automation_commands", "resolve_adjustment_note_prepare"
            )
            persist = _function(
                session, "erp_automation_commands", "persist_adjustment_note_prepare"
            )
            execute = _function(
                session, "erp_automation_commands", "execute_approved_command"
            )
            command_guard = _function(
                session, "erp_automation_commands", "guard_command_request_match"
            )
            command_prepare = _function(
                session, "erp_automation_commands", "prepare_operator_command"
            )
            issue = _function(
                session, "erp_calculation_authority", "issue_artifact"
            )
            post = _function(
                session, "erp_commercial_commands", "post_adjustment_note"
            )

            assert resolve["security_definer"] is True
            assert resolve["runtime_execute"] is True
            assert resolve["calculator_execute"] is True
            assert resolve["app_execute"] is False
            assert persist["security_definer"] is True
            assert persist["runtime_execute"] is False
            assert persist["calculator_execute"] is True
            assert persist["app_execute"] is False
            assert execute["runtime_execute"] is True
            assert post["runtime_execute"] is True
            assert command_guard["security_definer"] is True
            assert command_guard["app_execute"] is False
            assert command_prepare["security_definer"] is True
            assert command_prepare["runtime_execute"] is False
            assert issue["security_definer"] is True
            assert issue["app_execute"] is False
            assert "actual_status='draft' AND p_command_request_id IS NOT NULL" in issue[
                "body"
            ]
            assert (
                "adjustment note is neither approved nor a command-bound draft"
                in issue["body"]
            )

            assert (
                "WHEN 'finance.adjustment_note.prepare' THEN 'adjustment_note'"
                in command_guard["body"]
            )
            assert (
                "WHEN 'finance.adjustment_note.prepare' THEN "
                "'finance.adjustment_note.post'"
                in command_guard["body"]
            )
            assert command_guard["body"].count("'finance.adjustment_note.prepare'") >= 6
            assert (
                "WHEN 'finance.adjustment_note.prepare' THEN 'adjustment_note'"
                in command_prepare["body"]
            )
            assert (
                "WHEN 'finance.adjustment_note.prepare' THEN "
                "'finance.adjustment_note.post'"
                in command_prepare["body"]
            )

            for fragment in (
                "side='sales' AND direction='credit'",
                "side='purchase' AND direction='debit'",
                "original_open_item",
                "allocation_state_hash",
                "sales credit quantity exceeds remaining",
                "purchase debit quantity exceeds remaining",
                "gst_adjustment_rule_versions",
            ):
                assert fragment in resolve["body"]
            for fragment in (
                "finance.adjustment_notes",
                "finance.adjustment_note_lines",
                "prepare_operator_command",
                "erp_calculation_authority.issue_artifact",
                "adjustment-note idempotency key has different exact input",
            ):
                assert fragment in persist["body"]
            for fragment in (
                "WHEN 'finance.adjustment_note.post'",
                "approved_by_membership_id=approving_membership_id",
                "erp_commercial_commands.post_adjustment_note",
            ):
                assert fragment in execute["body"]
            for fragment in (
                "adjustment journal is not balanced",
                "INSERT INTO finance.allocations",
                "INSERT INTO finance.open_items",
                "INSERT INTO tax.documents",
                "INSERT INTO finance.accounting_events",
                "finish_claim",
            ):
                assert fragment in post["body"]

            protected = session.execute(
                text(
                    """
                    SELECT namespace.nspname AS schema_name, relation.relname AS table_name,
                           relation.relrowsecurity, relation.relforcerowsecurity
                      FROM pg_class AS relation
                      JOIN pg_namespace AS namespace ON namespace.oid=relation.relnamespace
                     WHERE (namespace.nspname,relation.relname) IN (
                       ('finance','adjustment_notes'),('finance','adjustment_note_lines'),
                       ('finance','allocations'),('finance','open_items'),
                       ('finance','journal_entries'),('finance','journal_lines'),
                       ('finance','accounting_events'),('tax','documents'),
                       ('automation','command_requests'),('automation','command_approvals'),
                       ('calculation','artifacts'))
                    """
                )
            ).mappings().all()
            assert len(protected) == 11
            assert all(row["relrowsecurity"] and row["relforcerowsecurity"] for row in protected)

            idempotency = session.execute(
                text(
                    """
                    SELECT indexdef FROM pg_indexes
                     WHERE schemaname='automation' AND tablename='command_requests'
                       AND indexdef LIKE '%agent_grant_id%capability_code%idempotency_key_hash%'
                    """
                )
            ).scalars().all()
            assert idempotency, "command prepare idempotency uniqueness is missing"

            session.execute(text('SET LOCAL ROLE "erp_app"'))
            session.execute(
                text(
                    """
                    SELECT set_config('app.org_id', :org_id, true),
                           set_config('app.membership_id', :membership_id, true),
                           set_config('app.auth_user_id', :auth_user_id, true)
                    """
                ),
                {
                    "org_id": str(ORG_ID),
                    "membership_id": str(MEMBERSHIP_ID),
                    "auth_user_id": str(AUTH_USER_ID),
                },
            )
            assert session.execute(
                text(
                    """
                    SELECT note.id, note.status, event.journal_entry_id,
                           allocation.open_item_id, tax_document.id AS tax_document_id
                      FROM finance.adjustment_notes AS note
                      LEFT JOIN finance.accounting_events AS event
                        ON event.org_id=note.org_id AND event.adjustment_note_id=note.id
                      LEFT JOIN finance.allocations AS allocation
                        ON allocation.org_id=note.org_id AND allocation.adjustment_note_id=note.id
                      LEFT JOIN tax.documents AS tax_document
                        ON tax_document.org_id=note.org_id AND tax_document.adjustment_note_id=note.id
                     WHERE note.org_id=:org_id AND note.id=:note_id
                    """
                ),
                {"org_id": ORG_ID, "note_id": NOTE_ID},
            ).fetchall() == []
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
