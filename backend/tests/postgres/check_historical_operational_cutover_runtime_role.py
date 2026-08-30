"""Prove historical party/opening cutover through the restricted runtime role."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
from pathlib import Path
from uuid import UUID

from sqlalchemy import create_engine, text


HERE = Path(__file__).resolve().parent
FIXTURE_PATH = HERE / "check_canonical_master_write_function_runtime_role.py"
SPEC = importlib.util.spec_from_file_location("master_write_fixture", FIXTURE_PATH)
assert SPEC and SPEC.loader
fixture = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(fixture)

BRANCH = UUID("ed000000-0000-7000-8000-000000000030")
DATASET = "marg-operational-runtime-v1"


def _fact(
    identity: str,
    kind: str,
    record_key: str,
    payload: dict,
    *,
    party_key: str,
    party_name: str | None = None,
    event_date: str | None = None,
    amount: str | None = None,
    selection_state: str | None = None,
) -> dict:
    return {
        "id": identity,
        "dataset_id": DATASET,
        "source_kind": kind,
        "record_key": record_key,
        "branch_id": str(BRANCH),
        "event_date": event_date,
        "party_key": party_key,
        "party_name": party_name,
        "outstanding_amount": amount,
        # Deliberately reproduce the old projection defect.  The reviewed
        # payload remains authoritative for Dr/Cr normalization at cutover.
        "side": "payable" if kind == "opening_item" else None,
        "selection_state": selection_state or (
            "staged" if kind == "opening_item" else "archive-only"
        ),
        "payload": payload,
        "row_sha256": hashlib.sha256(record_key.encode("utf-8")).hexdigest(),
    }


def main() -> None:
    engine = create_engine(os.environ["DATABASE_URL"])
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            fixture._seed(connection)
            connection.exec_driver_sql('SET LOCAL ROLE "erp_migration_owner"')
            connection.execute(text(
                "SELECT pg_catalog.set_config('app.org_id',:org,true),"
                "pg_catalog.set_config('app.membership_id',:member,true),"
                "pg_catalog.set_config('app.auth_user_id',:auth,true),"
                "pg_catalog.set_config('app.request_id',pg_catalog.gen_random_uuid()::text,true)"
            ), {"org": str(fixture.ORG_A), "member": str(fixture.MEMBER_A), "auth": str(fixture.AUTH_A)})
            connection.execute(text(
                """
                INSERT INTO core.role_permissions(
                  org_id,role_id,permission_code,created_by_membership_id
                ) VALUES (:org,:role,'core.organization.manage',:member);
                INSERT INTO core.branches(
                  org_id,id,code,name,address_line1,city,state_code,postal_code,status,
                  created_by_membership_id,updated_by_membership_id
                ) VALUES (
                  :org,:branch,'CUTOVER','Cutover Branch','1 Migration Road','Mumbai',
                  '27','400001','active',:member,:member
                );
                INSERT INTO core.master_code_sequences(
                  org_id,id,code_kind,prefix,padding,next_value,status,
                  created_by_membership_id,updated_by_membership_id
                ) VALUES
                  (:org,pg_catalog.gen_random_uuid(),'customer','CUST-',6,1,'active',:member,:member),
                  (:org,pg_catalog.gen_random_uuid(),'supplier','SUP-',6,1,'active',:member,:member),
                  (:org,pg_catalog.gen_random_uuid(),'product','PROD-',6,1,'active',:member,:member);
                INSERT INTO core.settings(
                  org_id,id,scope_kind,namespace,key,value_type,value_text,status,
                  created_by_membership_id,updated_by_membership_id
                ) VALUES
                  (:org,pg_catalog.gen_random_uuid(),'organization','finance.account_roles',
                   'accounts_receivable','text',:receivable,'active',:member,:member),
                  (:org,pg_catalog.gen_random_uuid(),'organization','finance.account_roles',
                   'accounts_payable','text',:payable,'active',:member,:member);
                """
            ), {
                "org": fixture.ORG_A,
                "role": fixture.ROLE_A,
                "member": fixture.MEMBER_A,
                "auth": fixture.AUTH_A,
                "branch": BRANCH,
                "receivable": str(fixture.RECEIVABLE_A),
                "payable": str(fixture.PAYABLE_A),
            })
            connection.exec_driver_sql("RESET ROLE")
            connection.exec_driver_sql('SET SESSION AUTHORIZATION "erp_runtime"')
            connection.execute(text(
                "SELECT erp_security.activate_context(:auth,:org),"
                "pg_catalog.set_config('app.request_id',pg_catalog.gen_random_uuid()::text,true)"
            ), {"auth": fixture.AUTH_A, "org": fixture.ORG_A})

            facts = [
                _fact(
                    "ed000000-0000-7000-8000-000000000031", "party", "customer:source-existing",
                    {"source_party_id": "source-existing", "party_role": "customer", "primary_phone": "9876543210"},
                    party_key="source-existing", party_name="Party A",
                ),
                _fact(
                    "ed000000-0000-7000-8000-000000000032", "party", "customer:source-new",
                    {
                        "source_party_id": "source-new",
                        "party_role": "customer",
                        "primary_phone": "",
                    },
                    party_key="source-new", party_name="Historical Missing Phone",
                    # Reproduce the live import projection: the top-level state
                    # is quarantined and the duplicated review-state field is
                    # absent, but a retained opening item references the party.
                    selection_state="quarantined",
                ),
                _fact(
                    "ed000000-0000-7000-8000-000000000035", "party", "customer:blocked",
                    {
                        "source_party_id": "blocked",
                        "party_role": "customer",
                        "primary_phone": "",
                        "selection_state": "quarantined",
                    },
                    party_key="blocked", party_name="Genuinely Quarantined Party",
                    selection_state="quarantined",
                ),
                _fact(
                    "ed000000-0000-7000-8000-000000000033", "opening_item", "open-dr",
                    {"source_party_id": "source-new", "source_reference": "OPEN-DR", "document_date": "2026-04-01", "due_date": "2026-04-15", "side": "Dr"},
                    # Reproduce a projection alias: the top-level key differs,
                    # while the retained source row owns the stable identity.
                    party_key="projected-source-new", event_date="2026-04-15", amount="100.00",
                ),
                _fact(
                    "ed000000-0000-7000-8000-000000000034", "opening_item", "open-cr",
                    {"source_party_id": "source-existing", "source_reference": "OPEN-CR", "document_date": "2026-04-02", "due_date": "2026-04-16", "side": "Cr"},
                    party_key="projected-source-existing", event_date="2026-04-16", amount="40.00",
                ),
            ]
            imported = connection.execute(text(
                "SELECT erp_automation_commands.import_historical_migration_facts(:org,CAST(:facts AS jsonb))"
            ), {"org": fixture.ORG_A, "facts": json.dumps(facts)}).scalar_one()
            assert imported == {"inserted": 5, "replayed": 0, "accepted": 5}

            diagnostic = connection.execute(text(
                "SELECT erp_automation_reads.historical_operational_cutover_unmatched(:org,:dataset,20)"
            ), {"org": fixture.ORG_A, "dataset": DATASET}).scalar_one()
            assert diagnostic["unmatched_openings"] == 0
            assert diagnostic["unmatched_sample"] == []
            assert len(diagnostic["party_sample"]) == 3

            result = connection.execute(text(
                "SELECT erp_automation_commands.promote_historical_operational_batch(:org,:dataset,10)"
            ), {"org": fixture.ORG_A, "dataset": DATASET}).scalar_one()
            assert result == {
                "parties_promoted": 1, "parties_bound": 1, "parties_remaining": 0,
                "openings_promoted": 2, "openings_remaining": 0, "complete": True,
            }
            status = connection.execute(text(
                "SELECT erp_automation_reads.historical_operational_cutover_status(:org,:dataset)"
            ), {"org": fixture.ORG_A, "dataset": DATASET}).scalar_one()
            assert status == {
                "source_parties": 2, "bound_parties": 2, "source_openings": 2,
                "posted_openings": 2, "receivable": "100.00", "payable": "40.00",
            }
            assert connection.execute(text(
                "SELECT count(*) FROM parties.contacts contact JOIN parties.parties party "
                "ON party.org_id=contact.org_id AND party.id=contact.party_id "
                "WHERE party.org_id=:org AND party.legal_name='Historical Missing Phone'"
            ), {"org": fixture.ORG_A}).scalar_one() == 0
            assert connection.execute(text(
                "SELECT count(*) FROM finance.journal_entries journal WHERE journal.org_id=:org "
                "AND journal.status='posted' AND journal.transaction_debit_total=journal.transaction_credit_total"
            ), {"org": fixture.ORG_A}).scalar_one() == 2
            replay = connection.execute(text(
                "SELECT erp_automation_commands.promote_historical_operational_batch(:org,:dataset,10)"
            ), {"org": fixture.ORG_A, "dataset": DATASET}).scalar_one()
            assert replay["complete"] is True
            assert replay["parties_promoted"] == replay["openings_promoted"] == 0
        finally:
            transaction.rollback()
            connection.exec_driver_sql("RESET SESSION AUTHORIZATION")
            engine.dispose()


if __name__ == "__main__":
    main()
