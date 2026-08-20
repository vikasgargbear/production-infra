# Compliance and expense command boundary

This generated mapping closes seven blockers from the finance command manifest:
expense-claim header and line orchestration, temperature ingestion, destruction
approval/posting, controlled-substance register posting, and recall batch action
posting, plus maker/checker verification and supersession of organization fiscal
tax facts. It adds no command-owned table; recall provenance is an orthogonal
nullable FK on the canonical inventory document.

The runtime surface is ten idempotent `SECURITY DEFINER` functions in
`erp_compliance_commands`. Private transaction-scoped provenance prevents raw
runtime writes from impersonating approval, ingestion, or posting commands.

Fourteen blockers remain fail-closed. They require external GST provider
authenticity, remaining calculation/command authority, or complete withholding
deduction/deposit/filing commands. Recall batch exposure is snapshot from the posted
ledger, and quarantine, recovery, release, and destruction totals are refreshed
only from posted recall-tagged inventory documents and their immutable ledger
sets.

Regenerate and test with:

```sh
python3 database/canonical/commands_compliance/generate_compliance_commands.py
pytest -q backend/tests/unit/test_canonical_compliance_commands.py
```

`test_compliance_commands_rollback.sql` is executed only against the complete
PostgreSQL 15 baseline and always rolls back.
