# Finance, tax, and compliance invariant contract

This directory owns only executable cross-row controls for the canonical
`finance`, `tax`, and `compliance` domains. Run the generator after any owned
catalog rule changes:

```bash
python3 database/canonical/invariants_finance/generate_finance_contract.py
```

`baseline-finance-enforcements.json` composes with the other canonical mapping
fragments through repeated `--enforcement-map` arguments. The manifest records
every owned invariant as either reviewed executable SQL or an explicit blocker.
Blocked requirements are intentionally not represented by partial controls.

All trigger functions are `SECURITY INVOKER`, use an empty fixed search path,
are owned by the migration role, and have no runtime execute grant. Aggregate
caps use row or tenant-scoped advisory locks. The SQL does not claim external
authority verification, statutory rule data, parser transaction provenance, or
application posting commands that are absent from the model.
