# Production Readiness Ledger

This is a fail-closed status ledger for the canonical checkout at
`/Users/mini/Documents/Github/production-infra`. The former local directory
name `production-infra-manual` did not identify another Git repository; the
checkout tracks `vikasgargbear/production-infra`.

Status on 2026-08-19: **not production-ready**. Passing calculation tests do not
override the database, transaction, browser, or live-environment gates below.

## Implemented evidence

- The complete hermetic backend unit suite passes 183 tests; frontend
  type-checking and all 33 Jest tests pass. The frontend production build also
  completes, and the changed auth/API/calculation boundary passes a strict
  zero-warning lint gate.
- Money and GST calculations use validated `Decimal` inputs and commercial
  half-up rounding in the backend. Audited API money fields use canonical
  two-decimal JSON strings and strict response models.
- Invoice, sales order, purchase preview/entry, returns, credit/debit notes, and
  delivery challans use authenticated backend calculation previews online.
  Active UI components have zero direct calculator imports; the local
  calculator is restricted to explicit offline adapters and tests.
- Deterministic unit matrices cover 2,876 invoice, purchase, and return
  scenarios, including fractional quantities/prices, discounts from 0 to 100%,
  and 0/5/12/18/28% intra-state and inter-state GST.
- The credential-gated live suite adds 600 deployed preview combinations and
  two multi-item invoice persistence/reconciliation cases in Supabase.
- Payment/allocation and inventory updates now take tenant-scoped row locks in
  the reviewed service paths. Posted journal records have immutability guards.
- OpenAPI exports an explicit three-operation, read-only agent allowlist. It
  states that no MCP transport or write surface is implemented.
- Browser authentication uses persistent, auto-refreshing Supabase email or
  Google sessions. The ERP bridge verifies the Supabase bearer, resolves an
  immutable `auth_user_id`, and issues a short-lived access-only JWT. The
  frontend has one canonical ERP session store and sends no organization
  selection header.
- All eight detected sequence-reservation APIs are POST mutations with committed atomic
  reservations. Ambiguous document prefixes and every detected count/random
  reference generator were removed.
- CI runs unit, frontend, schema, transaction, consistency, idempotency, and
  optional live-ERP gates. The
  production blocker job intentionally remains red until every audit is clean.

## Stop-ship gates

1. `schema_readiness.py` reports an unbaselined database and 149 blockers.
   Competing DDL/migration sources and all 37 legacy deploy includes are now
   classified; the deploy entrypoint fails closed until a live baseline exists.
   Missing RLS or `FORCE RLS` coverage and authority conflicts remain.
2. `audit_schema.py` finds 36 application/query mismatches across 15 files. The
   checked-in schema documentation describes only 40 sales/master tables;
   finance, inventory, parties, and procurement documentation is incomplete.
3. `transaction_integrity_audit.py` reports four blockers: unverified payment
   idempotency storage, incomplete idempotency for payment mutations, the
   unbaselined allocation table, and its unreproducible roll-up trigger.
4. `contract_consistency_audit.py` reports three blockers: four live document
   targets absent from the checked-in authority, missing durable idempotency for
   standalone number reservations, and unbaselined product/HSN GST authority.
   Divergent enums, audited binary-float money responses, and generic mutation
   response contracts have been resolved.
5. `payment_idempotency_readiness.py` reports four blockers and intentionally
   disables the temporary proof backend in production.
6. Legacy `backend/tests/integration/*_critical_path.py` files with missing
   fixtures and simulated workflows were retired because they were false test
   evidence. CI rejects any reintroduced placeholders; the 37-test,
   credential-gated `tests/live_erp` suite is the real API/database integration
   path. Company-profile persistence still needs a replacement live contract.
7. Live Supabase tests have not been executed in this workspace. Supabase CLI
   login alone does not provide the isolated test organization, deployed API,
   database URL, and user access token required by the harness. The full suite
   performs real writes and must never be pointed at a production organization.
8. Playwright discovers the browser tests, but this managed workspace prevents
   Chrome/listener execution. A normal CI runner must execute them.
9. The frontend production build completes but carries a large legacy
   lint-warning debt (452 warnings after this pass) and a 1.1 MB gzip main
   bundle. The changed critical boundary is linted with zero warnings; the
   remaining application warning and performance debt still requires staged
   remediation.
10. Create React App 5 declares a TypeScript 4 peer range while this application
    is validated on TypeScript 5. Clean installs therefore use a repository
    scoped `legacy-peer-deps` policy until the frontend is migrated off CRA.
11. The 2026-08-19 GitHub clean install reported 66 npm advisories (12 low,
    14 moderate, 37 high, and 3 critical). The registry audit must be split into
    shipped runtime and build-only dependency paths, remediated without a
    forced breaking upgrade, and rerun clean before promotion.

## Required commands

Run local deterministic and contract tests:

```bash
APP_ENV=test TEST_MODE=false PYTHONPATH=backend \
  backend/venv/bin/python -m pytest -q \
  backend/tests/unit/test_money_and_gst_calculations.py \
  backend/tests/unit/test_transaction_integrity_guards.py \
  backend/tests/unit/test_api_contract.py \
  backend/tests/unit/test_database_readiness.py \
  backend/tests/unit/test_schema_audit_gate.py

cd frontend
npm run typecheck
npm run test:ci -- --runInBand
npm audit --omit=dev
```

Run all fail-closed release audits from the repository root:

```bash
PYTHONPATH=backend python backend/scripts/audit_schema.py
python backend/scripts/schema_readiness.py
python backend/scripts/audit/transaction_integrity_audit.py
python backend/scripts/audit/contract_consistency_audit.py
python backend/scripts/audit/payment_idempotency_readiness.py
```

Run the live Supabase/API matrix only against an isolated test organization:

```bash
export PHARMA_LIVE_API_BASE_URL=...
export PHARMA_LIVE_DATABASE_URL=...
export PHARMA_LIVE_ACCESS_TOKEN=...
export PHARMA_LIVE_TEST_ORG_ID=...
export PHARMA_LIVE_TEST_BRANCH_ID=...
PYTHONPATH=backend backend/venv/bin/python -m pytest -q backend/tests/live_erp
```

The live environment must contain same-state and interstate GST customers and
three disposable batches with sufficient branch/location stock. The suite
cancels the invoices it creates; use a non-production organization because the
tests intentionally exercise real transactions and audit trails.

## Database promotion evidence

Do not shrink, merge, or drop tables from the checked-in SQL alone. First export
the live Supabase schema, policies, grants, triggers, functions, indexes,
extensions, and migration history. Build the reviewed Alembic baseline and a
table catalog containing row counts, sizes, read/write callers, retention,
tenant/branch ownership, and reconciliation rules. Only then apply the
retain/merge/retire criteria in `data-model-for-agents.md`.

Promotion requires all audits to exit zero, a clean-schema bootstrap, an
upgrade from a production-like snapshot, tenant/branch isolation and concurrent
transaction tests, live calculation reconciliation, browser execution, backup
restore proof, and finance/tax/compliance sign-off on golden cases.
