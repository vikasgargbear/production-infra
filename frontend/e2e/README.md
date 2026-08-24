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
npm run test:e2e:live:core
```

The suite is desktop-only and single-worker. It never invokes communication
CTAs. Created records use `CODEX-E2E-20260825` where the form/API exposes an
operator reference. Do not claim the skipped suite as a live pass, and do not
clean up posted accounting or stock records unless the canonical API supplies
a reviewed reversal command.
