# Testing guide

Tests prove boundaries; mocks and successful HTTP status codes do not establish
canonical business correctness.

## Fast local gates

From the repository root:

```bash
PYTHONPATH=backend pytest -q backend/tests/unit
PYTHONPATH=backend/mcp_runtime pytest -q backend/mcp_runtime/tests
python3 backend/scripts/check_canonical_artifacts.py
python3 backend/scripts/schema_readiness.py --validate-authority
python3 backend/scripts/audit/app_data_contract_gate.py
python3 backend/scripts/audit_schema.py
```

For frontend changes:

```bash
cd frontend
npm run typecheck
npm run lint:critical
npm run test:ci -- --runInBand
CI=false npm run build
```

## Command acceptance

A supported core operation requires evidence for:

```text
UI input/CTA
  -> authenticated REST prepare
  -> immutable review
  -> distinct-user approval when required
  -> execute
  -> authoritative REST readback
  -> MCP readback
  -> PostgreSQL identity and exact-value reconciliation
```

Cover missing required fields, valid input, permissions, tenant and branch
isolation, stale preview/source version, duplicate/replay idempotency, injected
failure rollback, reload/readback, and precise inventory, tax, accounting, and
allocation effects relevant to the operation.

PostgreSQL integration tests use a disposable PostgreSQL 15 database migrated
from empty state through the current Alembic head. Exercise the runtime
non-owner role, forced RLS, positive tenant access, and cross-tenant denial. Do
not use a retired project or company database.

## Browser acceptance

Live browser suites are under `frontend/e2e/`; the 18-operation contract is in
`backend/tests/live_acceptance/operation_matrix.json`. Live writes are guarded
and require disposable identities and unique `CODEX-E2E-<timestamp>` records.
Do not enable them casually, send communications, or claim a pass unless the
frontend, API, MCP, database, and tested Git SHA are identical.

## Release evidence

Promotion evidence is hash-bound and exact-SHA. Follow
[`promotion-evidence/README.md`](../architecture/promotion-evidence/README.md).
Never edit decision or readiness fields to make a test green; capture the
missing artifact or leave the release fail-closed.
