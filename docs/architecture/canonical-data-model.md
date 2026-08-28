# Canonical data authority

The ERP database is created only by the current Alembic chain. The retired
Supabase project is not a schema source, data source, fallback, or conversion
input. Staging and test environments are rebuilt from an empty PostgreSQL 15
database and disposable data is provisioned through supported canonical
commands.

## Authoritative sources

- `backend/alembic/versions/` owns immutable migration order and hashes.
- `backend/alembic/sql/` contains the SQL packaged by those revisions.
- `database/canonical/` owns reviewed canonical definitions, domain catalogs,
  generators, and drift checks.
- `docs/architecture/canonical-data-model.json` lists the baseline canonical
  relations and product-scope decisions.
- `docs/architecture/app-data-contract.json` maps reachable application
  surfaces to canonical relations and retains explicit negative sentinels for
  retired relation names.
- `docs/architecture/core-operation-authority-matrix.json` maps each core
  operation through command, PostgreSQL, REST, MCP, and readback ownership.

Generated or packaged SQL is not edited as an alternate source. Its generator
and hash check identify the reviewed owner. Existing Alembic revisions remain
immutable.

## Runtime boundary

Every tenant-owned relation uses an organization-leading identity and forced
RLS. The runtime role is a non-owner without `BYPASSRLS`; authenticated
organization and branch context is activated inside the request transaction.
Client-provided tenant, actor, approval, or permission fields never grant
authority.

Writes use typed canonical prepare, immutable review, distinct approval where
required, and execute commands. Posted records are corrected by typed reversal
or adjustment commands, not generic update/delete paths. Idempotency,
calculation evidence, inventory effects, tax documents, open items, accounting
events, and balanced journals remain PostgreSQL invariants.

## Reset-only lifecycle

There is no backfill, dual-read/write, compatibility schema, or legacy project
capture step. A disposable environment is accepted only when the exact
Alembic head, runtime roles, forced-RLS tenant isolation, mounted-route graph,
canonical reconciliation, exact deployed SHA, and Live18 evidence all agree.
Promotion remains fail closed until the reviewed, hash-bound evidence manifest
contains those facts.

Git history preserves earlier design archaeology. It is intentionally not kept
as callable tooling or a second database authority in the working tree.
