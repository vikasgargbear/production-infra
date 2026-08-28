# Browser acceptance suites

`live-canonical-core-api.spec.ts` and `live-canonical-core-ui.spec.ts` are two
different authorities and must not be reported interchangeably:

- `core-api` uses the authenticated browser token to exercise the public API,
  exact prepare/approve/execute/readback contracts, idempotent GET-only
  recovery, and independent-approval denial.
- `core-ui` drives visible desktop controls from form through review and the
  final CTA, captures screenshots, and then independently GETs canonical
  readback for successful writes.

Both files skip unless all existing live settings are present:

```bash
export PLAYWRIGHT_LIVE_BASE_URL="https://the-live-erp.example.com"
export PLAYWRIGHT_LIVE_EMAIL="existing-disposable-demo-user@example.com"
export PLAYWRIGHT_LIVE_PASSWORD="..."
export PLAYWRIGHT_LIVE_WRITES=true
export PLAYWRIGHT_SALES_CHAIN_FIXTURE='{"branch_id":"...","customer_account_id":"...","product_id":"...","uom_conversion_id":"...","expected_fefo_batch_id":"...","billed_quantity":"1.000000","free_quantity":"0.000000","unit_rate":"84.0000","place_of_supply_state_code":"27"}'
npm run test:e2e:live:core
```

The unified `test:e2e:live:writes` gate fails configuration when the sales-chain
fixture is absent or malformed. It does not silently skip that API lifecycle in
an explicitly enabled live-write run. Document dates come from the authenticated
organization business-context API; the fixture must identify data identities and
expected FEFO behavior, not a workstation-calendar date.

The suite is desktop-only and single-worker. It never invokes communication
CTAs. Created records use `CODEX-E2E-20260825` where the form/API exposes an
operator reference. Do not claim the skipped suite as a live pass, and do not
clean up posted accounting or stock records unless the canonical API supplies
a reviewed reversal command.

Supplier-payment acceptance takes the organization date, posted invoice
payable, branch, and paired INR bank/settlement ledger from the canonical
context. The visible UI journey verifies automatic FIFO is the default while
manual per-invoice allocation remains available; all amount decisions and
readback comparisons use exact decimal strings/BigInt rather than floats.
