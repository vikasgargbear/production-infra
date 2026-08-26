# Finance/GST Hardening Audit

Last updated: April 15, 2026

This document is the current audit summary for taking finance and GST flows live without silent data drift.

## Verified in repo

- Frontend `npm run typecheck` is green after fixing:
  - GST dashboard Axios response parsing
  - stock transfer branch lookup/document type mismatch
  - sales order address type mismatch
- Finance note create/list/detail/cancel now target the canonical finance tables:
  - `financial.credit_notes`
  - `financial.debit_notes`
- Allocation service reads now use `financial.allocations` directly instead of the `financial.payment_allocations` compatibility view.

## Local blockers not verified here

- Live ERP tests were not runnable in this shell on April 15, 2026 because:
  - `backend/venv` does not exist in this worktree
  - `python3 -m pytest` is unavailable because `pytest` is not installed
  - required `PHARMA_LIVE_*` environment variables are not present

Do not mark production as verified until the live suite is rerun with real credentials and a runnable Python test environment.

## Canonical schema decisions

Use these as the single source of truth:

- Allocations:
  - canonical base table: `financial.allocations`
  - compatibility surface only: `financial.payment_allocations`
- Credit/debit notes:
  - canonical tables: `financial.credit_notes`, `financial.debit_notes`
  - deprecated legacy tables: `sales.credit_notes`, `sales.debit_notes`
  - deprecated legacy linkage table: `sales.credit_note_applications`

## Current schema risks

1. Allocation schema drift still exists in SQL assets.
   - Some migrations and docs still define or reference `financial.payment_allocations` as if it were the base table.
   - Runtime services now mix `financial.allocations` and the compatibility view across the codebase.

2. Credit/debit note schema drift still exists in SQL assets.
   - Legacy table definitions still exist under `sales.*`.
   - Runtime finance code is now aligned to `financial.*`, but migration and trigger assets still contain older sales-schema paths.

3. GST routes currently scope several calculations to the default branch.
   - `backend/app/api/routes/compliance/gst.py` uses `get_default_branch_id(...)` for dashboard and return calculations.
   - This is a correctness risk if users expect org-wide GST values across multiple branches.

4. Outstanding tables remain denormalized.
   - `financial.customer_outstanding` and `financial.supplier_outstanding` are explicitly maintained alongside source documents and allocations.
   - They need regular reconciliation queries in production because multiple services and triggers can affect them.

## Production audit queries

Run the SQL in:

- `database/schema-docs/finance_gst_audit_queries.sql`

These checks are meant to answer:

- Are legacy note tables still populated?
- Are allocations split between base and compatibility structures?
- Are there orphan or duplicate outstanding rows?
- Do GST totals reconcile against invoices and supplier invoices?
- Do branch-scoped GST totals differ materially from org-wide totals?

## Required before live sign-off

1. Rerun `backend/tests/live_erp` with real credentials.
2. Run the finance/GST audit queries against the production-like database.
3. Decide whether GST dashboards are branch-scoped or org-scoped and enforce that consistently.
4. Finish migration off deprecated note/allocation tables and compatibility views.
5. Bind the audit results and exact pass/fail timestamps into the exact-SHA
   canonical application-promotion evidence artifact.
