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

## Required Environment

```bash
export PHARMA_LIVE_API_BASE_URL="https://pharma-backend-production-0c09.up.railway.app"
export PHARMA_LIVE_DATABASE_URL="postgresql://..."
export PHARMA_LIVE_JWT_SECRET_KEY="..."
export PHARMA_LIVE_TEST_ORG_ID="e78d6777-35f6-4b19-994f-caaede2f021a"
export PHARMA_LIVE_TEST_USER_ID="8"
export PHARMA_LIVE_TEST_BRANCH_ID="5"
export PHARMA_LIVE_TEST_EMAIL="aasopharmaceuticals@gmail.com"

# Optional when DNS to the DB hostname is flaky in the shell:
# export PHARMA_LIVE_DATABASE_HOSTADDR="x.x.x.x"
```

## Run

```bash
cd backend
./venv/bin/pytest tests/live_erp -q

# or, if you are using a non-venv Python with pytest installed
python3 -m pytest tests/live_erp -q
```

## Why This Exists

The older shell E2E scripts already captured a large amount of business knowledge, but that knowledge was split across many files and depended on `railway` + `psql`.

This directory turns that knowledge into a reusable, Python-based live verification layer that can be extended action by action until the full ERP is automated.
