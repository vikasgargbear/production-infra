# Live Supabase Verification

This document records the current live-verification setup for Pharma ERP and the latest results against the actual Supabase database.

## Scope

The verification layer now checks both read contracts and write contracts.

For each ERP action, it defines:

1. which tables should be touched
2. which invariants should hold across those tables
3. which live IDs and values can be audited afterward in Supabase

The source of truth is:

- `backend/tests/live_erp/action_matrix.json`

## Automation Layers

### 1. Live DB and API contract tests

Location:

- `backend/tests/live_erp/`

Coverage:

- table existence validation from the action matrix
- high-risk live read contracts
- write contracts for:
  - stock receive
  - stock transfer
  - stock adjustment
  - stock writeoff
  - purchase order commitment
  - direct purchase entry
  - purchase receipt against PO
  - purchase return create and cancel
  - sales invoice creation
  - invoice cancellation and stock reversal
  - invoice trigger contracts
  - sales return restock
  - payment receipt

Run:

```bash
cd backend
./venv/bin/pytest tests/live_erp -q
```

Required env:

```bash
export PHARMA_LIVE_API_BASE_URL="http://127.0.0.1:8000"
export PHARMA_LIVE_DATABASE_URL="postgresql://..."
export PHARMA_LIVE_JWT_SECRET_KEY="..."
export PHARMA_LIVE_TEST_ORG_ID="e78d6777-35f6-4b19-994f-caaede2f021a"
export PHARMA_LIVE_TEST_USER_ID="8"
export PHARMA_LIVE_TEST_BRANCH_ID="5"
export PHARMA_LIVE_TEST_EMAIL="aasopharmaceuticals@gmail.com"

# Optional when the DB hostname resolves unreliably from the shell:
# export PHARMA_LIVE_DATABASE_HOSTADDR="x.x.x.x"
```

### 2. Headed browser smoke against actual Supabase

Location:

- `frontend/e2e/live-production-smoke.spec.ts`

Purpose:

- boot the frontend in a real browser
- hit the local backend that is connected to actual Supabase
- verify the browser runtime can call ERP APIs successfully

Run:

```bash
cd frontend
PHARMA_LIVE_API_BASE_URL="http://127.0.0.1:8000" \
PHARMA_LIVE_JWT="..." \
npm run test:e2e:live:headed
```

### 3. Local backend against actual Supabase

Run:

```bash
cd backend
DATABASE_URL="postgresql://..." \
JWT_SECRET_KEY="..." \
TEST_MODE=true \
ENV=development \
CORS_ORIGINS="http://127.0.0.1:5173,http://localhost:5173" \
PORT=8000 \
./venv/bin/python start.py
```

This is the fallback validation path when the public Railway hostname is not reachable from the shell but the real database is reachable.

## Current Verified State

Verified on April 14, 2026 against:

- Supabase project: `jfrairkkzxwkhbtqejnz`
- org: `e78d6777-35f6-4b19-994f-caaede2f021a`
- local backend pointed at the actual Supabase database

### Passing backend contract suite

Command:

```bash
PHARMA_LIVE_API_BASE_URL="http://127.0.0.1:8000" ./venv/bin/pytest tests/live_erp -q
```

Result:

- `19 passed`

### Passing headed browser smoke

Command:

```bash
PHARMA_LIVE_API_BASE_URL="http://127.0.0.1:8000" PHARMA_LIVE_JWT="..." npm run test:e2e:live:headed
```

Result:

- `2 passed`

Note:

- use a freshly generated `PHARMA_LIVE_JWT` for headed reruns
- expired JWTs correctly land on the login page, which can look like a smoke failure if the token is stale

## Latest Production Defect Found and Fixed

### Sales return restock was not updating `inventory.location_wise_stock`

Symptoms:

- `sales.sales_returns` row was created
- `sales.sales_return_items` row was created
- `inventory.batches.quantity_available` increased
- `inventory.inventory_movements` row was created
- `inventory.location_wise_stock.quantity_available` did not increase

Root cause:

- `ReturnService.bulk_record_stock_movements()` inserted the return movement but did not apply the matching location-wise stock increment for restocked items

Fix:

- `backend/app/api/services/returns/return_service.py`

Verification:

- the failing sales-return live contract now passes against the actual Supabase database
- full `tests/live_erp` suite is green on the patched backend

### Invoice creation was duplicating `financial.customer_outstanding`

Symptoms:

- a new invoice created two outstanding rows for the same invoice
- one row used `document_type = 'INVOICE'`
- one row used `document_type = 'invoice'`

Root cause:

- the database trigger created the uppercase row
- the app service also inserted and updated a second lowercase row

Fixes:

- removed app-side invoice outstanding writes
- removed app-side payment update of the lowercase outstanding row
- new invoices now rely on the trigger-owned row only

Verification:

- new invoices now produce exactly one outstanding row
- the remaining row is the trigger-owned `document_type = 'INVOICE'` row

### Invoice creation was leaving `sales.orders.order_status = 'draft'`

Symptoms:

- invoices were posted successfully
- linked sales orders stayed in `draft` instead of `invoiced`

Root cause:

- the intended invoice-trigger-based order sync did not leave the order in the correct state on the create path

Fix:

- added an application-side order-sync backstop in invoice creation

Verification:

- new posted invoices now leave the linked order in `order_status = 'invoiced'`

Invoice trigger details:

- `docs/backend/api/sales/invoice-trigger-contracts.md`

### Purchase return create/cancel was leaving supplier-side state inconsistent

Symptoms:

- purchase return creation changed stock, but cancel did not fully reverse all related tables
- supplier outstanding stayed open
- debit note status stayed approved
- location-wise stock was not restored
- source document `quantity_returned` counters were not fully synchronized

Root causes:

- purchase return reversal targeted `financial.supplier_outstanding.document_id = return_id`, but the real row is keyed by `debit_note_id`
- purchase return reversal did not restore `inventory.location_wise_stock`
- source document return counters were not fully reversed on cancel

Fixes:

- `apps/pharma-erp/backend/app/api/routes/returns/purchase/routes.py`
- `apps/pharma-erp/backend/app/api/services/returns/purchase_return/service.py`

Verification:

- the live purchase return create/cancel contract now passes
- verified tables:
  - `procurement.purchase_returns`
  - `procurement.purchase_return_items`
  - `procurement.supplier_invoice_items`
  - `procurement.grn_items`
  - `inventory.batches`
  - `inventory.inventory_movements`
  - `inventory.location_wise_stock`
  - `financial.debit_notes`
  - `financial.supplier_outstanding`

### Invoice cancellation was broken against the live Supabase schema

Symptoms:

- `POST /api/invoices/{id}/cancel` returned HTTP 500
- cancellation did not restore all inventory-side tables
- outstanding cancellation targeted only lowercase `document_type = 'invoice'`

Root causes:

- the route queried `sales.invoices.gstr1_reported_date`, which does not exist in the live schema
- the service updated `cancelled_at` and `cancelled_by`, which do not exist in the live schema
- location-wise stock reversal was missing
- cancellation only handled lowercase invoice outstanding rows, while new trigger-owned rows use `INVOICE`

Fixes:

- `apps/pharma-erp/backend/app/api/routes/sales/invoices/routes.py`
- `apps/pharma-erp/backend/app/api/services/sales/invoice/invoice_service.py`

Verification:

- the live invoice cancel contract now passes
- verified outcomes:
  - `sales.invoices.invoice_status = 'cancelled'`
  - invoice stock movements are deleted
  - `inventory.batches.quantity_available` is restored
  - `inventory.location_wise_stock.quantity_available` is restored
  - the single `financial.customer_outstanding` row is marked `cancelled` with `outstanding_amount = 0`

## Current External Blocker

Direct public-host re-verification through Railway is currently blocked from this shell by DNS failures for Railway domains.

Observed failures:

- `pharma-backend-production-0c09.up.railway.app`
- `backboard.railway.com`

Impact:

- code deployment can still be initiated when DNS is healthy
- direct post-deploy verification against the public Railway hostname is temporarily blocked from this machine

Fallback used:

- local backend with production-like code
- actual Supabase database
- headed browser validation against local frontend plus local backend

## How To Audit Created Rows Manually

The live contract tests create business rows with stable prefixes:

- purchase entry invoices: `LIVE-PE-...`
- purchase entry batches: `LIVE-PE-BATCH-...`
- PO receipt invoices: `LIVE-PO-RECEIPT-...`
- PO receipt batches: `LIVE-PO-BATCH-...`
- invoice notes: `LIVE ERP invoice verification ...`
- return notes and reasons: `LIVE ERP return verification ...`

You can audit them with queries like:

```sql
SELECT supplier_invoice_id, supplier_invoice_number
FROM procurement.supplier_invoices
WHERE supplier_invoice_number LIKE 'LIVE-PE-%'
ORDER BY supplier_invoice_id DESC;
```

```sql
SELECT invoice_id, invoice_number, notes
FROM sales.invoices
WHERE notes LIKE 'LIVE ERP invoice verification%'
ORDER BY invoice_id DESC;
```

```sql
SELECT return_id, return_number, notes
FROM sales.sales_returns
WHERE notes LIKE 'LIVE ERP return verification%'
ORDER BY return_id DESC;
```

## Next Extension Work

Next high-value additions to `tests/live_erp`:

1. invoice credit-note-from-cancellation path
2. payment reversal and invoice re-open contracts
3. deeper stock-transfer multi-location scenarios
4. physical-count and shrinkage flows
5. broader finance and ledger reconciliation contracts
