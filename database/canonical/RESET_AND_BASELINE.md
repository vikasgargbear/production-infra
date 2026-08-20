# Canonical schema reset and baseline gate

The 110-table column and relationship catalog and all of its executable
enforcement mappings are reviewed. The default generator emits deployable,
transaction-wrapped PostgreSQL DDL only when every cross-row invariant, RLS
policy, session helper, runtime role/grant set, population mode, preflight
check, and immutable audit/outbox trigger control has an exact hash-bound
mapping. `--draft` remains review-only and must never be applied when any
blocker exists.

Reviewed controls are split into disjoint mapping authorities. The security
mapping owns RLS, roles, and grants; the platform mapping owns clean-environment
preflights plus exact application-owned permission and unit seeds. Regulated
ingredient, HSN/SAC, withholding, e-invoice, GST-adjustment,
controlled-movement, and storage authorities intentionally deploy empty and
can be populated only through their reviewed release-import commands. Example
legal values are never seeded.

Production gates compose mappings with
`--enforcement-root database/canonical`. The generator recursively discovers
every checked-in `baseline-*-enforcements.json` fragment, sorts the paths, and
rejects empty roots, malformed fragments, duplicate authorities, stale hashes,
and unresolved requirements. The PostgreSQL 15 gate likewise runs every
checked-in `test_*.sql` fixture in sorted order; fixtures that mutate state must
end in `ROLLBACK` so the next authority is tested against the clean baseline.

This directory describes the deterministic DDL source and must not be applied
directly in production. The first reviewed authority is
`backend/alembic/versions/20260820_0001_canonical_v1.py`, with the exact
generator output and SHA-256 manifest under `backend/alembic/sql`. The direct
generated-SQL and Alembic paths both run every rollback fixture in isolated
PostgreSQL 15 CI jobs. A disposable Supabase deployment rehearsal is still
required before any live reset.

Regenerate the package only after all catalog-bound artifacts are current, then
review and verify the checked output:

```bash
python3 backend/scripts/check_canonical_artifacts.py
python3 backend/scripts/package_canonical_baseline_migration.py --write
python3 backend/scripts/package_canonical_baseline_migration.py
export CANONICAL_BASELINE_APPROVED_SHA256="$(python3 backend/scripts/package_canonical_baseline_migration.py --print-sha256)"
```

`--write` is a review-time repository operation, never a deploy hook. The image
contains only the checked SQL, manifest, revision, and package verifier; its
build cannot regenerate from paths outside the backend Docker context.

The live ERP rows are disposable, but Supabase Auth, Storage, secrets and project
configuration are not. A schema reset must preserve every Supabase-owned schema.

## Boundary

The v1 contract mirrors the final 110-table topology in
`docs/architecture/canonical-data-model.json` across 12 physical schemas:

| Schema | Tables | Canonical responsibility |
|---|---:|---|
| `core` | 16 | tenants, identity mapping, authorization, reviewed reference releases, privacy retention, numbering, evidence and platform events |
| `parties` | 6 | legal parties, customer/supplier roles, contacts and registrations |
| `catalog` | 6 | products, units, conversions and relational ingredient composition |
| `inventory` | 7 | locations, batches, immutable movements, reservations and balance projection |
| `sales` | 9 | orders, dispatch, invoices, returns and invoice/dispatch allocation |
| `procurement` | 10 | purchase orders, typed goods advances, receipts, supplier invoices, returns and receipt/invoice allocation |
| `finance` | 15 | accounting events, ledger, payments, open items, adjustments, expenses and bank reconciliation |
| `tax` | 25 | GST rules/documents, registration-to-branch authority, e-invoice and adjustment rules, normalized withholding rules, bases, deposits, statements, certificates, portal evidence, IRN and reconciliation |
| `compliance` | 8 | licences, effective controlled-movement and storage rules, recall membership, temperature, controlled substances and destruction |
| `hr` | 2 | departments and employees used by active ERP workflows |
| `automation` | 4 | revocable agent grants/capabilities, command requests and approvals |
| `calculation` | 1 | immutable canonical calculation artifacts and one-time posting consumption |

The table count is a consequence of cardinality and lifecycle, not a target.
Header/line, batch, tax, allocation, journal, filing and audit records stay
relational. Analytics caches, API logs, report builders, scheduler internals,
notification inboxes and observability data do not belong in the ERP schema.

Sales and procurement use separate typed aggregates. Orders, dispatch/receipt,
invoices and returns have different required fields, posting rules, immutability
and state machines, so they are not forced into a discriminator mega-table.
Header/line 1:M relationships remain explicit. MCP exposes stable operation and
resource names per aggregate rather than manufacturing a universal database ID.

The forbidden deferred set is exactly seven payroll tables, three loyalty
tables, four sales-scheme tables, two price-list tables,
`inventory.quality_tests`, and the three unowned
inspection/finding/corrective-action tables. Their API/UI surfaces must be
removed or disabled before cutover. Expense approval, bank reconciliation, GST
reconciliation, cold-chain, regulated stock and agent approval remain in scope.

The twenty-seven mandatory replacement facts are
`core.reference_data_releases`, `core.data_retention_cases`,
`catalog.ingredients`,
`catalog.product_ingredients`, `sales.invoice_dispatch_allocations`,
`procurement.supplier_invoice_receipt_allocations`,
`finance.accounting_events`, `tax.documents`, `tax.withholdings`,
`tax.withholding_rule_versions`, `tax.organization_fiscal_tax_facts`,
`tax.withholding_basis_lines`, `tax.withholding_deposits`,
`tax.withholding_deposit_lines`, `tax.withholding_statements`,
`tax.withholding_statement_lines`, `tax.withholding_certificates`,
`tax.withholding_certificate_lines`,
`tax.portal_document_lines`, `tax.registration_branches`,
`tax.einvoice_rule_versions`, `tax.gst_adjustment_rule_versions`,
`compliance.recall_batches`, `compliance.controlled_movement_rule_versions`,
`compliance.storage_rule_versions`, and
`calculation.artifacts`. Each represents
an M:N relationship, immutable external fact, or cross-domain uniqueness
invariant that fields on one existing row cannot enforce.

`inventory.inventory_documents` with `document_type = 'stock_count'` owns the
count lifecycle. Its lines snapshot system quantity, counted quantity and
approved variance; only the variance posts ledger entries. Separate stock-count
header/line tables are therefore forbidden in v1. In contrast, a
`journal_entry_id` column repeated across domain tables cannot prevent one
journal from being claimed by two different document types, so the unique
`finance.accounting_events` source registry is required.

The tax roles are deliberately distinct: `tax.documents` is the immutable
internal statutory-document identity; `tax.return_documents` is its M:N filing
population junction; `tax.portal_documents` records an imported file/API
envelope; and `tax.portal_document_lines` records immutable parsed invoice/note
rows. Reconciliation results reference those line facts rather than overwriting
the import or treating a journal entry as GST evidence.

## Baseline revision requirements

The first Alembic revision is generated from the complete domain catalog plus
every enforcement mapping, reviewed as static DDL, and tested on a clean
PostgreSQL 15 instance. It performs these steps in order:

1. Assert none of the 12 canonical physical schemas already contains objects.
2. Create only required extensions, schemas, enum/check domains and functions.
3. Create parents before children. Addressable tenant aggregates, events and
   ledger facts use composite `PRIMARY KEY (org_id, id)` and tenant child FKs
   reference that key. Pure non-addressable associations and rebuildable
   projections use an `org_id`-leading natural composite primary key without a
   surrogate `id`. Only the organization root, global user profile and global
   references use a single-column primary key. Do not create a redundant tenant
   unique index.
4. Create every child foreign key with `org_id`, normally `ON DELETE RESTRICT`.
5. Add tenant-first access indexes and partial indexes for open/active states.
6. Add posting validation, immutable-row, journal-balance, accounting-event
   uniqueness, allocation-limit and stock-conservation constraint triggers.
7. Add `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` to every direct
   tenant table and every tenant child.
8. Grant global reference reads and tenant-table CRUD to `erp_app`; never grant
   DDL, `TRUNCATE`, ownership or `BYPASSRLS`.
9. Add immutable audit/outbox triggers after business constraints so failed
   writes produce neither audit facts nor integration events.
10. Seed only reviewed application-owned UOM and permission codes. Keep every
    regulated legal reference table empty until its signed release import.

The revision must not use `IF NOT EXISTS`: an unexpected object is a deployment
failure, not permission to accept drift. The migration owner is not a runtime
credential. No application table is created in `public`.

### Column rules

- IDs: PostgreSQL `uuid` everywhere. Application-generated UUIDv7 is preferred
  because it is sortable and improves B-tree locality while remaining an opaque
  UUID for REST, MCP and Supabase. `gen_random_uuid()` is the database fallback,
  so client and server generation are type-compatible. Do not add parallel
  integer IDs or `public_id` columns. Human document numbers are alternate keys.
- Time: `TIMESTAMPTZ` in UTC. A business `DATE` is used for document date,
  accounting date, manufacturing date, expiry date and filing period boundaries.
- Money: intermediate values `NUMERIC(20,4)`, posted totals `NUMERIC(20,2)` and
  quantities `NUMERIC(20,6)`. `REAL`, `DOUBLE PRECISION` and floating JSON values
  are prohibited for regulated calculations.
- Mutable tenant rows: `org_id`, `created_at`, `created_by_membership_id`,
  `updated_at`, `updated_by_membership_id` and `row_version`. Actor evidence uses
  composite `(org_id, membership_id)` FKs to retained `core.memberships` rows.
- Posted/event rows: `posted_at`, `posted_by_membership_id`, `reversal_of_id` where applicable;
  correction uses a linked reversal or adjustment, never an update or delete.
- JSONB: bounded provider payloads, configuration values and audit context only.
  Money, tax, quantities, permissions, allocations and foreign-ID collections
  remain typed relational columns.

## Runtime role and RLS

Create roles with an administrative connection, not with application secrets in
migration files:

```sql
CREATE ROLE erp_migration_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT BYPASSRLS;
CREATE ROLE erp_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS;
CREATE ROLE erp_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS;
GRANT erp_app TO erp_runtime;
REVOKE erp_migration_owner FROM erp_app, erp_runtime;
```

The migration owner's `BYPASSRLS` is limited to ownership of the reviewed,
static membership helper and forced-RLS tables. Runtime roles never receive it.

The `erp_runtime` password is generated and installed through the deployment
secret store. The role owns no schema, table, sequence, function or policy and
receives no direct table grants. Every request transaction executes:

```sql
BEGIN;
SELECT erp_security.activate_context(
    :verified_auth_user_id,
    :requested_org_id
);
-- application statements
COMMIT;
```

`erp_security.activate_context` is a tightly scoped `SECURITY DEFINER` function
owned by the migration role. It accepts no membership identifier. From the
verified Supabase Auth UUID and requested organization it resolves exactly one
active `core.users` profile and joined, non-revoked `core.memberships` row in an
active organization. It then sets `app.auth_user_id`, `app.user_id`,
`app.membership_id` and `app.org_id` with transaction-local `set_config`, uses a
fixed `search_path`, and has `PUBLIC` execution revoked. Missing or ambiguous
identity bindings fail with an authorization error before context is activated.
Policies compare tenant rows to `erp_security.current_org_id()`. The API never
trusts an organization header or caller-supplied membership ID. REST and MCP
enter through the same unit-of-work helper.

Global reference tables grant `SELECT` only. `core.users.auth_user_id`
is globally unique and references `auth.users.id`; credentials remain solely in
Supabase Auth. The application profile keeps its own opaque UUIDv7 resource ID.
The profile and `core.organizations` use membership-based forced RLS despite
their global primary keys. The profile is accessible only by membership
activation and narrow self-profile operations. `core.memberships` permits one Auth user in multiple organizations
but only once per organization. Supabase
`auth`, `storage`, `realtime`, `extensions`, `vault`, `supabase_migrations` and
other managed schemas are never altered by this baseline.

## Mutation ownership

- The application service owns commands and transaction boundaries.
- Database constraints and triggers reject invalid states but do not create
  invoices, GRNs, payments or stock transactions behind the application's back.
- REST and MCP adapters invoke the same command/query handlers.
- Configurable roles use `core.roles`, `core.permissions` and relational
  `core.role_permissions`; permissions are not arrays or JSON claims.
- Agent clients receive revocable user+client+organization grants with optional
  branch and relational capabilities. Approval requests and decisions are
  durable rows, separate from audit history and idempotency storage.
- Projection tables (`inventory.stock_balances`) are trigger-maintained or
  rebuilt by one named projector and are never direct API/MCP write targets.
- One command writes its document, accounting event, journal, stock movements,
  audit event and outbox event in one database transaction.

### Idempotency

Acquire `core.idempotency_keys` before allocating a document number or
performing any side effect. Its unique key is
`(org_id, actor_membership_id, operation, idempotency_key)`.
Persist a canonical request hash, state, command name, actor membership, lock expiry and
result resource ID. A retry with the same hash returns the original result; the
same key with a different hash is a conflict. An expired in-progress lock can be
claimed atomically. Failed database transactions do not leave a completed key.

### Document numbering

`core.document_sequences` is unique by organization, branch, document
type and fiscal year. An allocation function locks exactly one sequence row,
validates that its prefix/rule has not changed after first use, increments and
returns the formatted number. The document's unique constraint is the final
guard. Issued numbers are never reused; cancellation retains the original row
and number. Number allocation and document insert occur inside the same command
transaction after idempotency acquisition.

## Disposable-data reset workflow

No reset runs from application startup or Render deploy hooks.

1. Pin the current application and database revisions; disable deploys and enter
   maintenance mode.
2. Take and restore-test a Supabase logical backup. Record counts and hashes of
   Auth users and Storage objects separately from ERP rows.
3. Run the baseline and all gates first on an isolated Supabase branch/project.
4. Build a release containing the canonical repositories and migration. Do not
   point legacy application code at the canonical database.
5. In one administrator transaction, rename the legacy ERP schemas to timestamped
   archive names. Move only `public.document_number_sequences` to the archive.
   Do not drop `public` or any Supabase-owned schema.
6. Set `CANONICAL_BASELINE_APPROVED_SHA256` to the reviewed manifest hash and
   run `alembic upgrade head` with the approved bootstrap administrator. The
   first revision must create `erp_migration_owner`, so this one bootstrap
   connection needs `CREATEROLE`; the revision rejects runtime principals and
   assigns canonical ownership to the non-login migration owner. Verify the
   schema hash, grants, owners, RLS policies and all application tables before
   commit.
7. Seed the organization, branches, memberships and global references; do not
   copy dummy transactional rows.
8. Provision `erp_runtime`, update Render's database secret and deploy the same
   release SHA with auto-deploy gated by CI.
9. Run cross-tenant, calculation, transaction and MCP/REST parity smoke suites
   using the exact Render runtime role. Open writes only after every gate passes.
10. Retain archived schemas for the rollback window, then export and drop them
    in a separately approved migration. Never leave the runtime role with access
    to the archive.

Before the reset transaction commits, rollback is ordinary PostgreSQL rollback.
After commit, rollback means maintenance mode, restore the verified backup or
drop the new canonical schemas and rename archived schemas back, then redeploy
the pinned legacy SHA. Do not attempt partial table-by-table rollback.

## Required test gates

1. Empty bootstrap: upgrade a clean PostgreSQL 15 database and introspect an
   exact match to the manifest (tables, columns, types, constraints and indexes).
2. Repeatability: a second `alembic upgrade head` is a no-op; unexpected objects
   make the initial revision fail.
3. Role ownership: `erp_runtime` owns nothing, cannot DDL/TRUNCATE, cannot bypass
   RLS and cannot access a tenant before activation.
4. Tenant matrix: two organizations, two branches and two users exercise every
   table with same-tenant positive and cross-tenant negative reads/writes.
5. Parent integrity: every attempted cross-tenant foreign key fails even when a
   UUID from another tenant is known.
6. Money/GST matrix: inclusive/exclusive discounts and charges, intra/inter-state
   tax, cess, exempt/nil/non-GST, credit/debit notes, returns and every half-paise
   rounding boundary using independently calculated golden results. Filed
   populations reference `tax.documents`, portal matching references immutable
   `tax.portal_document_lines`, and neither path uses journal entries as tax evidence.
7. Posting invariants: totals reconcile, functional-currency journal debit equals
   credit, every journal has one accounting event, closed periods reject posts
   and filed returns reject mutation.
8. Inventory matrix: batches, packs/UOM conversion, free quantity, transfers,
   expiry, M:N recall membership, reservation, typed stock-count documents and
   concurrent negative-stock attempts reconcile on-hand exactly to the movement
   ledger; availability subtracts reservations only in the read model.
9. Payment matrix: partial, multi-document, over-allocation, reversal and racing
   allocations; no path can write a second allocation representation.
10. Fulfilment lineage: partial and consolidated dispatch/invoice and
    receipt/supplier-invoice allocations cannot exceed either source line and
    preserve exact base quantity under concurrent writes.
11. Concurrency: at least 100 parallel requests prove one idempotent result and
    unique monotonic document numbers without duplicate side effects.
12. Failure injection: abort after each document/accounting-event/journal/stock/audit/outbox step
    and prove the whole unit of work rolls back.
13. Immutability: direct update/delete of every posted/event/filing table fails
    using the exact runtime role; approved reversal commands succeed.
14. Contract parity: each mutation produces identical database results through
    REST and MCP, with stable opaque IDs and no direct projection writes.
15. Restore drill: restore the pre-reset backup and prove the pinned legacy SHA
    can serve its health and read-only smoke tests before the rollback window ends.

The production authority is `migrating`: the reviewed revision and PostgreSQL
15 gates exist, but the disposable Supabase rehearsal, runtime cutover, live
stress evidence, and remaining gates above have not passed. A packaged baseline
is not permission to enable writes.
