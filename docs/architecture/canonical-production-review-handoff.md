# Canonical ERP Production Review Handoff

## Review objective

Perform an independent, findings-first review of the canonical ERP branch before
any production mutation. Determine whether the staging evidence is credible,
whether each supported business operation persists to the correct canonical
relations, and what must be completed before production cutover.

Do not modify or deploy production as part of this review. In particular, do not
run a migration, reset, seed, `supabase db push`, or write query against project
`jfrairkkzxwkhbtqejnz`.

## Repository state

- Repository: `vikasgargbear/production-infra`
- Branch: `feat/canonical-erp-data-model`
- Reviewed head: `306292527d722363a9adf52753dcbcfd36318ac6`
- Canonical staging project: `rgihahbmkrmhitjdjvev`
- Legacy production target: `jfrairkkzxwkhbtqejnz`
- Pilot UI: `https://aasopharma-erp-pilot.onrender.com`
- Pilot API: `https://aasopharma-api-pilot.onrender.com`
- Pilot MCP: `https://aasopharma-mcp-pilot.onrender.com/mcp`

The staging project is disposable and contains synthetic data. The production
project is not disposable unless the owner explicitly chooses that outcome after
reviewing the inventory below.

## Claims to verify

1. The canonical baseline contains 110 tables with one Alembic authority and
   forced tenant RLS.
2. Twelve supported operator actions use prepare, approval, execute, immutable
   preview hashes, idempotency, audit evidence, and stable replay results.
3. The disposable journey reconciles all relations contractually affected by
   the supported operations. It does not claim that every canonical table must
   receive a row.
4. Customer and supplier master fixtures now create canonical contacts and
   verify them through the runtime RLS path.
5. Production has a legacy mixed schema and cannot safely receive the canonical
   reset baseline in place while existing rows must be preserved.
6. External e-invoice/e-way-bill provider submission is disabled and fail-closed.
   Internal GST calculations and tax documents remain enabled. Legal e-invoice
   applicability is still unresolved.

Treat these as claims requiring verification, not conclusions.

## Staging evidence

The latest full disposable run is GitHub Actions run `32656310594` at commit
`30629252`. The `canonical-free-staging / baseline` job passed. The overall run
is red only because the `production-blockers` job intentionally remains closed.

The journey exercises these operations, including original and replayed
prepare/approve/execute calls:

| Operation | Primary expected persistence |
| --- | --- |
| Purchase order | purchase order header/lines, frozen calculation and tax snapshots |
| Supplier advance | payment, allocation, accounting event, journal and open-item effect |
| Goods receipt | GRN and lines, supplier challan, batches, inventory document/lines, stock ledger/balance and valuation event |
| Supplier invoice | invoice/lines, GRN allocations, tax document, journal/event and payable open item |
| Supplier payment | payment/allocation, journal/event and payable settlement |
| Sales order | order/lines, discount/tax calculation artifact and document sequence |
| Sales dispatch | dispatch/lines, delivery challan evidence, batch lineage, inventory issue and valuation event |
| Sales invoice | invoice/lines, dispatch allocations, tax document, journal/event and receivable open item |
| Customer receipt | payment/allocation, journal/event and receivable settlement |
| Sales return | return/lines, credit effect, tax adjustment, inventory receipt and accounting evidence |
| Purchase return | return/lines, debit effect, tax adjustment, inventory issue, challan and accounting evidence |
| Inventory adjustment | inventory count document/line, ledger/balance, journal and accounting event |

Inventory transfer and destruction are declared unavailable and must return 503
without persisting command requests. Confirm they are not represented as
supported operations.

The final cross-table audit requires:

- exactly 12 unique succeeded and audited command requests with result IDs;
- matching approvals bound to preview and aggregate hashes;
- consumed calculation artifacts with valid hashes;
- balanced posted journal headers and lines;
- open items consistent with posted allocations;
- positive INR allocations with exactly one source owner;
- stock ledger sums equal to stock balance projections; and
- valid intra-state/inter-state GST component shapes and source hashes.

Relevant implementation:

- `backend/scripts/provision_canonical_demo.py`
- `backend/app/infrastructure/operator_actions/`
- `backend/app/api/routes/internal/mcp_actions.py`
- `database/canonical/commands_automation/`
- `database/canonical/commands_commercial/`
- `database/canonical/commands_trade/`
- `docs/architecture/mcp-operator-actions.json`

## Contact-table finding

Production read-only inspection found:

- 140 customers and 9 suppliers;
- zero rows in `parties.customer_contacts` and
  `parties.supplier_contacts`;
- all 140 customer rows contain embedded contact name and phone fields;
- 134 customers contain embedded contact email fields;
- 5 suppliers contain embedded contact names and 8 contain embedded phones.

Therefore, contact data is mostly present but denormalized in legacy master
rows. The canonical conversion must create `parties.contacts` from nonblank
embedded fields and also merge any separate legacy contact rows that appear
before cutover.

Review these changes closely:

- contact seeding and `reconcile_party_master` in
  `backend/scripts/provision_canonical_demo.py`;
- source mappings in `docs/architecture/canonical-data-model.json`;
- legacy ownership mappings in `docs/architecture/app-data-contract.json`; and
- captured facts in `database/live-row-count-evidence.json`.

Check endpoint validation, primary-contact uniqueness, party/account linkage,
address/GST-registration existence, RLS visibility, deterministic IDs, and
whether supplier/customer embedded fields could create duplicates.

## Production inventory

Production is PostgreSQL 17.4 with no Alembic revision table and no canonical
`parties.contacts` relation. Important exact row counts include:

| Relation | Rows |
| --- | ---: |
| `sales.orders` | 317 |
| `sales.invoices` | 302 |
| `sales.invoice_items` | 353 |
| `sales.sales_returns` | 157 |
| `procurement.purchase_orders` | 66 |
| `procurement.goods_receipt_notes` | 171 |
| `procurement.supplier_invoices` | 184 |
| `procurement.purchase_returns` | 61 |
| `financial.payments` | 94 |
| `financial.allocations` | 109 |
| `financial.credit_notes` | 141 |
| `financial.debit_notes` | 56 |
| `inventory.batches` | 189 |
| `inventory.inventory_movements` | 1,751 |
| `inventory.location_wise_stock` | 185 |
| `system_config.audit_logs` | 2,404 |

The full checked-in inventory is `database/live-row-count-evidence.json`. The
schema capture authority is `database/live-schema-evidence.json` and its linked
artifact.

Review whether the proposed retain/merge/split/retire mappings preserve legal,
financial, tax, stock, batch, challan, payment-allocation, and audit lineage.
Do not recommend an in-place baseline application unless the data-disposition
decision and a tested conversion make it safe.

## India tax posture

Review `database/canonical/commands_tax_provider/provider-operational-readiness.json`
and `backend/scripts/audit/tax_provider_operational_readiness.py`.

The external provider feature is explicitly disabled for the initial release.
Provider routes remain hidden and fail closed. Provider credentials and sandbox
evidence are therefore not claimed. The audit must still return exactly:

```text
einvoice_applicability_unreviewed
```

Confirm that disabled provider functionality cannot be invoked accidentally and
that the code does not imply that e-invoice obligations can be ignored. Legal or
finance review must classify applicability before production promotion.

## Known blockers

`canonical_promotion_readiness.py` currently returns:

```text
CANONICAL_LIVE_BASELINE_UNVERIFIED
CANONICAL_APP_CONTRACT_UNAPPROVED
```

`tax_provider_operational_readiness.py` currently returns:

```text
einvoice_applicability_unreviewed
```

The application contract intentionally remains
`proposed_app_contract_v1`. Do not approve it merely because staging tests pass.
Approval requires a credible production data-disposition and cutover plan.

## Review commands

Run from the repository root:

```bash
git fetch origin
git switch feat/canonical-erp-data-model
git rev-parse HEAD
git diff --stat 72f15a5c^..30629252

PYTHONPATH=backend backend/venv/bin/python -m pytest -q \
  backend/tests/unit/test_canonical_tax_provider_commands.py \
  backend/tests/unit/test_tax_provider_boundary.py \
  backend/tests/unit/test_deployment_contract.py

PYTHONPATH=backend/mcp_runtime backend/venv/bin/python -m pytest -q \
  backend/mcp_runtime/tests

python3 backend/scripts/validate_canonical_model.py
python3 backend/scripts/audit/mcp_operator_action_contract.py
python3 backend/scripts/audit/canonical_promotion_readiness.py
python3 backend/scripts/audit/tax_provider_operational_readiness.py

gh run view 32656310594 --json status,conclusion,jobs
```

The two readiness audits are expected to exit nonzero for the blockers listed
above. Any additional blocker or failing deterministic/staging job is a defect.

## Required review questions

1. Can any prepare, approve, execute or replay path create a duplicate business
   document, allocation, stock movement, tax document or journal?
2. Are approval hashes, aggregate versions, actor separation, amount limits,
   tenant scope and branch scope checked at the correct transaction boundary?
3. Does each reconciliation query prove the intended relation and accounting or
   stock effect, or can a false-positive join/count make it pass?
4. Are transaction timestamps and exact command IDs sufficient to isolate the
   current run from older demo data?
5. Are customer/supplier contacts converted without data loss, duplication or
   cross-party linkage?
6. Do discounts, free goods, CGST/SGST/IGST, returns, credits/debits, rounding,
   challans and open-item settlements preserve exact Decimal values?
7. Are all canonical write paths forced through tenant RLS and non-owner runtime
   roles? Identify any owner, service-role or direct-SQL bypass.
8. Is external tax-provider functionality genuinely disabled and fail-closed?
9. If production rows must be preserved, what additional conversion and
   reconciliation work is required before cutover?
10. If production rows are confirmed disposable, what backup, restore proof,
    identity/bootstrap and smoke evidence is still required before reset?

## Required response format

Return findings first, ordered by severity:

```text
[SEVERITY] Short title
File: path:line
Impact: concrete failure or data-loss mode
Evidence: why the current code/test permits it
Recommendation: smallest defensible correction
```

Then provide:

1. `Staging evidence verdict`: valid, conditionally valid, or invalid.
2. `Production verdict`: blocked, preserve-and-convert, or safe-to-reset only
   after explicit owner confirmation.
3. `Missing tests/evidence`.
4. `Open business/legal decisions`.

Do not provide a generic summary in place of concrete findings. If no code
defects are found, say so explicitly and list residual migration and legal risk.
