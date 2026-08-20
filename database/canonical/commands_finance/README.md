# Finance command boundaries

This directory owns PostgreSQL 15 command and parser boundaries that close
eight explicit blockers in `invariants_finance`. Generate the
reviewed mapping and manifest with:

```bash
python3 database/canonical/commands_finance/generate_finance_commands.py
```

The mapping composes with the canonical baseline through the same repeated
`--enforcement-map` interface as every other fragment. It does not change the
canonical business-table topology.

Runtime commands are `SECURITY DEFINER`, have an empty fixed search path,
validate the active organization and permission through `erp_security`, and
are executable only by `erp_app`. Terminal row transitions are guarded by a
private `(backend_pid, transaction_id, scope, org_id, entity_id)` token. The
token exists only inside the command transaction and the runtime roles have no
access to its table or helper.

`run_tax_reconciliation` deliberately refuses `READ COMMITTED`; callers must
start a `REPEATABLE READ` or `SERIALIZABLE` transaction. The return-document
guard permits membership changes only on draft returns, requires the same
active registration and period, derives adjustment population roles from
immutable tax-document effects, and applies the catalog's typed return
direction and period-kind vocabulary. Provider signatures, statutory datasets
outside that closed vocabulary, and absent calculation proof remain blockers.
