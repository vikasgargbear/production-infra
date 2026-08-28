# Getting started

## Prerequisites

- Python 3.11
- Node.js in the range declared by `frontend/package.json`
- PostgreSQL 15 for database integration work
- Git

Use an isolated worktree when another terminal is changing the same branch.
Never reuse a company database for migrations or write tests.

## Install

From the repository root:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt -r backend/requirements-dev.txt

cd frontend
npm ci
```

Runtime configuration names and trust boundaries are defined by
[`runtime-environment-contract.json`](../architecture/runtime-environment-contract.json)
and the checked-in `.env.example` files. Use local/disposable values; never copy
production secrets into the worktree.

## Run locally

Backend, from the repository root:

```bash
PYTHONPATH=backend uvicorn app.main:app --reload --port 8000
```

Frontend:

```bash
cd frontend
npm start
```

The React development server uses its configured `REACT_APP_*` variables and
proxies API traffic according to `frontend/src/setupProxy.js`. Do not add a
second `VITE_*` configuration path.

Local execution is for implementation and disposable integration testing. If
acceptance requests the live application, localhost is not valid evidence.

## Understand the product boundary

Before changing a consequential business flow, read:

1. [the 18-operation authority matrix](../architecture/core-operation-authority-matrix.json);
2. [runtime ownership](../backend/services/README.md);
3. [canonical SQL ownership](../../database/canonical/README.md); and
4. [Live18 acceptance](../testing/canonical-live18-acceptance.md).

Do not create a generic CRUD service or direct table write for a core operation.
Extend its typed operator action and named PostgreSQL command, then reconcile
REST, MCP, and database readback.

## Verify

Use the commands in [the testing guide](testing.md). PostgreSQL tests require a
disposable PostgreSQL 15 instance migrated from empty state through the current
Alembic head. Live tests have separate exact-SHA and write guards; read those
guards before enabling them.
