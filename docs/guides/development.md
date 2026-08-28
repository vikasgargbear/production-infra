# Development workflow

## Trace before editing

For any of the 18 core operations, begin with
[`core-operation-authority-matrix.json`](../architecture/core-operation-authority-matrix.json).
Do not infer ownership from filenames or add a second service/repository path.

The canonical mutation path is:

```text
frontend CTA or MCP tool
  -> typed operator-action adapter
  -> PostgreSQL prepare / distinct-user approve / execute
  -> canonical REST and MCP readback
```

Calculation helpers may validate or preview inputs, but PostgreSQL owns
transactional inventory, accounting, tax, allocation, and idempotency
invariants. Tenant and branch identity come only from authenticated context.

## Change a command safely

1. Identify the operation and named SQL owner in the authority matrix.
2. Change its reviewed source under `database/canonical/`.
3. Regenerate the source artifact and inspect its deterministic diff.
4. Add a new hash-bound Alembic revision; never edit existing history.
5. Update the typed adapter and REST/MCP readback contract if necessary.
6. Add validation, stale-preview, replay, cross-tenant, rollback, and exact-value
   tests at the affected boundaries.
7. Run canonical artifact, unit, PostgreSQL runtime/RLS, MCP, and frontend gates
   in proportion to the change.

Missing canonical behavior must return an explicit error or disabled CTA. Do
not add a legacy endpoint, direct table write, offline/local fallback, UUID
conversion, browser date, blank-to-zero coercion, first-pending lookup, or fake
success.

## Local setup

Use Python 3.11, Node supported by `frontend/package.json`, and PostgreSQL 15.
Environment names and security requirements are defined by
[`runtime-environment-contract.json`](../architecture/runtime-environment-contract.json)
and the checked-in `.env.example` files. Never copy production secrets into a
local file or commit them.

Backend:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt -r backend/requirements-dev.txt
PYTHONPATH=backend uvicorn app.main:app --reload --port 8000
```

Frontend:

```bash
cd frontend
npm ci
npm start
```

Local development is useful for implementation. When acceptance explicitly
requires the deployed application, use the exact live URL and verify its build
metadata; localhost is not equivalent evidence.

## Review discipline

Keep commits ownership-separated and small. Preserve unrelated worktree
changes. Never deploy, merge, change readiness state, or write live business
data as a side effect of development or testing.
