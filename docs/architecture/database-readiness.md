# Database Readiness Authority

`database/schema-authority.json` is the machine-readable source for database
migration readiness. It currently declares the repository `migrating`. That
state must not change without exact-SHA live evidence.

The default audit derives its target relation and RLS inventory from the
hash-bound canonical field model plus every hash-bound Alembic SQL revision. It
has one creation authority: `backend/alembic`. The approved strategy is
reset-only; conversion, backfill, compatibility, fallback, and dual read/write
are prohibited. The source graph and effective mounted callable relation graph
must fail closed on every unclassified or reachable competing source.

Run the fail-closed audit from the repository root:

```bash
python3 backend/scripts/schema_readiness.py
python3 backend/scripts/schema_readiness.py --json
```

The normal command exits nonzero until the database is production-ready. CI can
validate that the authority does not overstate readiness while remediation is in
progress:

```bash
python3 backend/scripts/schema_readiness.py --validate-claim
```

## Promotion Procedure

1. Apply the reviewed `backend/alembic` chain to an empty disposable PostgreSQL
   15 database and repeat the migration gate from another empty database.
2. Resolve every blocker reported by `schema_readiness.py`, including any
   unclassified/reachable competing source, canonical model/Alembic drift,
   canonical tenant isolation, and `FORCE RLS` coverage.
3. Bind runtime-role, tenant, backup/restore, reconciliation, and transaction
   evidence to the exact deployed SHA and Alembic head.
4. Change `readiness_state` to `production_ready` only in the same change that
   makes the default audit exit zero.

After the baseline is established, only `backend/alembic` may contain new
production migrations. Git history preserves retired source archaeology; it is
not retained in the working tree as a compatibility or migration path.

## Canonical Transaction Evidence Binding

`canonical_transaction_integrity_evidence` remains `null` until a reviewed
read-only capture exists. Promotion requires replacing it with an object that
binds all of the following facts:

```json
{
  "artifact": "repository/relative/canonical-transaction-integrity.json",
  "artifact_sha256": "64 lowercase hexadecimal characters",
  "project_ref": "canonical staging project reference",
  "git_commit": "exact 40-character deployed release SHA",
  "alembic_revision": "exact observed canonical head",
  "reviewer": "accountable reviewer",
  "reviewed_at": "timezone-aware ISO-8601 timestamp"
}
```

The artifact hash is recomputed, the binding fields must equal its payload, and
the payload must prove the isolated `erp_runtime` role, no RLS bypass or
business-relation ownership, canonical transaction ownership, idempotency,
immutable journals, and forced finance RLS. A path without its exact hash, a
stale SHA/revision, the retired project, or an unreviewed artifact fails closed.
