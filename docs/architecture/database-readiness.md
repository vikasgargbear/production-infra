# Database readiness authority

`database/schema-authority.json` declares the repository's database readiness
state. `backend/alembic` is the sole executable database creation and migration
authority. The approved strategy is reset-only: there is no conversion,
backfill, compatibility schema, legacy fallback, or dual read/write phase.

The checked-in state remains `migrating`. Do not change it to
`production_ready` until exact-SHA canonical staging evidence has been captured,
hash-bound, and reviewed.

## Checks

Run from the repository root:

```bash
python3 backend/scripts/schema_readiness.py
python3 backend/scripts/schema_readiness.py --json
python3 backend/scripts/schema_readiness.py --validate-authority
```

The default command intentionally exits nonzero while promotion evidence is
missing. `--validate-authority` proves only that the repository does not contain
an unclassified competing DDL source, that canonical Alembic/model hashes agree,
and that the current non-ready claim is honest.

## Promotion evidence

`canonical_transaction_integrity_evidence` remains `null` until a reviewed
read-only capture exists. Its replacement must bind:

- the disposable canonical staging project, not the retired project;
- the exact 40-character deployed commit and exact Alembic head;
- an artifact path and recomputed SHA-256;
- a named reviewer and timezone-aware review time;
- non-owner/non-`BYPASSRLS` runtime-role behavior, forced RLS and cross-tenant
  denial;
- canonical idempotency, allocation ownership, immutable balanced journals, and
  command-owned order/invoice/GRN/inventory effects.

Missing, stale, cross-project, unreviewed, or hash-mismatched evidence fails
closed. No legacy SQL source may be reintroduced as a shortcut.
