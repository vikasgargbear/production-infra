# Canonical trade command boundary

This directory owns the PostgreSQL 15 command fragment for inventory posting,
sales dispatch posting, and goods-receipt posting. The boundary claims an
idempotency key, locks the source and stock identities, validates typed source
evidence, emits one immutable ledger set, projects balances synchronously, and
completes the claim in the same transaction.

Runtime roles can execute only the three public command functions recorded in
`trade-commands-manifest.json`. Private helpers and trigger functions have
`PUBLIC`, `erp_app`, and `erp_runtime` execution revoked. Ledger and balance
writes are rejected unless they occur below the migration-owner command.

Generate or check the deterministic artifacts with:

```bash
python3 database/canonical/commands_trade/generate_trade_commands_contract.py
python3 -m pytest backend/tests/unit/test_canonical_trade_commands_contract.py
```

Compose `baseline-trade-command-enforcements.json` alongside the stable,
trade-invariant, finance, platform, and security fragments. The generator
fails if this fragment duplicates a key already owned by another mapping.

## Deliberate blockers

- Landed-cost adjustments need persisted, approved eligible variance and
  capitalized-charge pools. Invoice totals are not allocation authority.
- Pricing/tax commands need a reviewed PostgreSQL implementation of the
  canonical Decimal engine or a database-recomputable digest. An app-supplied
  digest alone is not proof.
- Partial returns need explicit final-residual intent and persisted original
  component allocation authority before the database can prove every residual.

`test_trade_commands_rollback.sql` is metadata-only and always rolls back. It
can run after a composed baseline in a disposable PostgreSQL 15 database.
