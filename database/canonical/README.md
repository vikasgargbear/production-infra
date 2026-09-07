# Canonical SQL authority

The canonical PostgreSQL model is reviewed here and installed only through the
immutable Alembic chain under `backend/alembic`. This directory is source; an
installed migration is deployment history. Existing migration SQL and revision
files must never be regenerated or edited in place.

## Source ownership

- `domains/*.json` owns table, column, constraint, lifecycle, retention, and RLS
  requirements.
  The forward extension described below owns the later mixed-scope tax changes
  that the baseline catalog DSL cannot express.
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

## Mixed-scope tax reference extension

`operations/tax/product_tax_authority.sql` owns the forward schema and RLS
extension for `core.reference_data_releases` and `tax.tax_code_versions`.
`operations/tax/product_tax_authority.contract.json` records their effective
scope, added columns, policies and constraints. Read this extension together
with the baseline `domains/core.json` and `domains/tax.json` descriptors when
assessing the current schema.

The baseline DSL describes global references or mandatory tenant tables. These
two relations now contain both shared references (`org_id IS NULL`) and reviewed
source snapshots belonging to one organization. Both use forced RLS; scoped
rows require the current organization and an active actor, including when the
migration-owner command role reads them. Runtime writes still require named
commands. Global active-release uniqueness remains in place. Source snapshots
have separate organization/product identity and cannot activate or supersede a
global release.

The baseline descriptors and baseline RLS artifact remain installation inputs
for their original migration. The forward SQL and its hash-bound revision
install the extension. `test_product_tax_extension_contract.py` checks that the
extension metadata describes the actual forward SQL and retains tenant policy
and global-reference constraints.

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
