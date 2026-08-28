# Canonical trigger plumbing

This directory is a generated, catalog-bound authority for the three shared
trigger controls required by the canonical baseline:

- immutable insert-only facts reject `UPDATE` and `DELETE`;
- audited tenant mutations append an organization-serialized SHA-256 chain with
  explicit before/after row hashes and `pg-jsonb-sha256-v1` evidence version;
- reviewed aggregate state transitions append idempotent transactional outbox
  events containing identifiers and status only.

Generate and verify artifacts with:

```bash
python3 database/canonical/plumbing/generate_plumbing_contract.py
python3 database/canonical/plumbing/generate_plumbing_contract.py --check
```

The audit function requires `extensions.digest(bytea,text)` from `pgcrypto` and
fails before creating plumbing when it is unavailable. It never stores row JSON;
only canonical hashes are retained. `core.audit_events` is excluded to prevent
recursion, and `inventory.stock_balances` is excluded because its immutable stock
ledger source is the evidence authority. Every other non-reference canonical
table is explicitly trigger-bound.

Outbox payloads contain only organization, aggregate, version, event type and
status. A rollback removes both the business mutation and its audit/outbox rows.
No trigger publishes externally; delivery occurs only after commit through the
bounded outbox worker.

This mapping is reviewed but not applied. It must be composed with every domain
invariant mapping and executed only by the disposable PostgreSQL 15 gate before
an Alembic baseline is authorized.
