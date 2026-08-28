# Canonical SQL authority

The canonical PostgreSQL model is reviewed here and installed only through the
immutable Alembic chain under `backend/alembic`. This directory is source; an
installed migration is deployment history. Existing migration SQL and revision
files must never be regenerated or edited in place.

## Source ownership

- `domains/*.json` owns table, column, constraint, lifecycle, retention, and RLS
  requirements.
- Each `baseline-*-enforcements.json` owns the current reviewed body for its
  named functions, triggers, grants, or invariants. Its sibling `generate*.py`
  owns deterministic generation of that artifact.
- `security/`, `platform/`, and `plumbing/` own roles, RLS, tenant context, and
  cross-domain enforcement. Business operation directories must not duplicate
  those definitions.
- `backend/alembic/sql` packages reviewed source for installation. Hash-bound
  revision files prove the package bytes that were reviewed.
- Typed Python command adapters call named PostgreSQL functions. REST and MCP
  readbacks may use parameterized read SQL, but business writes require a named
  canonical command boundary. A missing command must fail closed.

`backend/tests/unit/test_canonical_sql_source_ownership.py` rejects a function
signature with more than one reviewed source owner and rejects an enforcement
directory without exactly one generator. Operation-to-adapter, database
function, affected-relation, REST readback, and MCP ownership remains published
in `docs/architecture/core-operation-authority-matrix.json` and guarded by its
contract tests.

## Safe workflow

1. Change the relevant canonical catalog or enforcement generator.
2. Regenerate only its reviewed source artifact and inspect the diff.
3. Add a new Alembic revision that packages the reviewed bytes and pins their
   SHA-256. Never rewrite an existing revision.
4. Run the canonical artifact, migration, PostgreSQL runtime-role, RLS, tenant,
   REST, and MCP gates.

The legacy numbered SQL trees and unmounted Python services are not authority.
They must not be imported, mounted, executed, or used as fallback. Delete them
only after runtime, import, test/CI, deployment, and MCP reachability all prove
that they have no consumer.
