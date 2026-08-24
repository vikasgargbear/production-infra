# Live ERP Verification

This test suite is the live-system companion to the existing API and browser tests.

It is designed for the Supabase-backed Railway deployment and focuses on two things:

1. mapping each ERP action to every table that should be affected
2. verifying that the live backend and database still honor those contracts

## What Lives Here

- `action_matrix.json`
  - source of truth for ERP actions, impacted tables, and invariants
- `conftest.py`
  - live API + live Supabase fixtures
- `test_live_business_journeys.py`
  - cross-module live journeys that reconcile inventory and ledger side effects
- `test_live_write_contracts.py`
  - contract tests for stock receive, transfer, adjustment, and writeoff
  - contract tests for purchase order creation, direct purchase entry, purchase receipt, and purchase return create/cancel
  - contract tests for sales invoice creation, invoice cancellation reversal, sales return restock, and payment receipt
- `test_live_calculation_matrix.py`
  - exercises quantity, price, line discount, GST slab, and tax-regime combinations through the deployed API
  - writes representative multi-line invoices and reconciles persisted Supabase header/item totals before cancellation

## Required Environment

`PHARMA_LIVE_API_BASE_URL` is intentionally required. Do not add a default
production URL in code; these tests write live data and must point at an
explicitly selected deployment.

```bash
export PHARMA_LIVE_API_BASE_URL="https://isolated-test-api.example.com"
export PHARMA_LIVE_DATABASE_URL="postgresql://..."
export PHARMA_LIVE_ACCESS_TOKEN="short-lived-token-for-dedicated-test-user"
export PHARMA_LIVE_TEST_ORG_ID="canonical-test-organization-uuid"
export PHARMA_LIVE_TEST_BRANCH_ID="canonical-test-branch-uuid"

# Required for test_live_finance_gst_audit.py only. Do not set this for the
# explicitly mutating journey/write-contract suite.
export PHARMA_LIVE_DATABASE_READ_ONLY=true

# Optional when DNS to the DB hostname is flaky in the shell:
# export PHARMA_LIVE_DATABASE_HOSTADDR="x.x.x.x"
```

## Run

Use an isolated test organization. The suite creates and reverses real business
documents. Supply a short-lived token issued through the real authentication
flow; never give this test harness the backend JWT signing key.

Both organization and branch identities must be canonical UUIDs. The harness
rejects legacy integer IDs before opening the database or calling the API.

```bash
cd backend
./venv/bin/pytest tests/live_erp -q

# or, if you are using a non-venv Python with pytest installed
python3 -m pytest tests/live_erp -q
```

## MCP reconciliation is a separate live gate

The normal no-reset staging deploy runs
`exercise_staging_mcp_oauth.py` in `boundary_only` mode. That proves hosted
OAuth denial/approval, MCP readiness, and the advertised tool registry only;
its evidence deliberately records `live_read_tool_calls: []`. It is not proof
that an MCP write, REST readback, and PostgreSQL row agree.

Cross-boundary reconciliation requires a separately approved disposable-demo
run with `CANONICAL_STAGING_MCP_EXERCISE_MODE=business_flow` and the existing
staging OAuth/database environment. That mode creates one sales order, reads
the exact returned UUID through `erp_sales_order_get`, and compares exact
quantities and totals with the command preview and PostgreSQL. If those
credentials or the disposable demo are unavailable, record this gate as
blocked/skipped; never promote `boundary_only` evidence to data reconciliation.

## Why This Exists

The older shell E2E scripts already captured a large amount of business knowledge, but that knowledge was split across many files and depended on `railway` + `psql`.

This directory turns that knowledge into a reusable, Python-based live verification layer that can be extended action by action until the full ERP is automated.

`pytest --collect-only -q tests/live_erp` currently discovers 37 live tests.
