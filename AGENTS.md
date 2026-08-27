# Repository instructions for coding agents

## Authority

Start every ERP operation in
`docs/architecture/core-operation-authority-matrix.json`. It maps the reachable
frontend, REST, PostgreSQL command, affected relations, readback, MCP tool, and
Live18 contract for all 18 core operations.

Canonical schema source lives in `database/canonical/`; immutable deployment
history lives in `backend/alembic/`. Never edit an existing Alembic revision or
generated migration bytes. Change the named canonical source owner, regenerate
deterministically, and add a new hash-bound revision.

Consequential writes must use:

```text
frontend or MCP
  -> backend/app/infrastructure/operator_actions
  -> named erp_* prepare / approve / execute function
  -> authoritative REST and MCP readback
```

Do not add direct table writes, legacy endpoints or schemas, localStorage or
IndexedDB business state, offline queues, compatibility aliases, fake success,
or hardcoded organization/branch/user/business facts. Missing authority fails
closed.

## Safe working rules

- Preserve unrelated changes and use an isolated worktree for parallel work.
- Do not deploy, merge, change readiness/approval state, or write live business
  data unless the user explicitly requests that exact action.
- Never send WhatsApp, email, SMS, or telephone communications from tests.
- Use disposable organizations and `CODEX-E2E-<timestamp>` references for
  authorized write acceptance.
- Do not infer production readiness from a build or `/health`; exact deployed
  SHA and all promotion evidence must reconcile.
- Prefer deletion and one named owner over wrappers or parallel abstractions.

## Verification

Use the narrowest relevant tests while iterating, then run the affected release
gates. Core commands require unit/contract tests plus PostgreSQL 15 runtime-role,
forced-RLS, tenant, idempotency, rollback, REST, MCP, and exact readback checks.

Common repository-root gates:

```bash
PYTHONPATH=backend pytest -q backend/tests/unit
PYTHONPATH=backend/mcp_runtime pytest -q backend/mcp_runtime/tests
python3 backend/scripts/check_canonical_artifacts.py
python3 backend/scripts/schema_readiness.py --validate-authority
python3 backend/scripts/audit/app_data_contract_gate.py
python3 backend/scripts/audit_schema.py
git diff --check
```

Frontend changes also require, from `frontend/`:

```bash
npm run typecheck
npm run lint:critical
npm run test:ci -- --runInBand
CI=false npm run build
```

Live Playwright suites are opt-in. Read their environment and write guards
before running them; do not substitute localhost when a live exact-SHA test was
requested.

## Navigation

- `docs/backend/services/README.md`: runtime ownership and debugging path
- `database/canonical/README.md`: SQL ownership and generation workflow
- `docs/testing/canonical-live18-acceptance.md`: browser/REST/MCP/DB proof
- `docs/architecture/promotion-evidence/README.md`: release evidence
- `plugins/aasopharma-erp/README.md`: Codex and ChatGPT developer-mode setup
