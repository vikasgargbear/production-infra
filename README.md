# AASOPharma ERP

Cloud-authoritative pharmaceutical distribution ERP built with React,
FastAPI, PostgreSQL, and an authenticated MCP runtime.

The maintained business-write path is:

```text
frontend CTA or MCP tool
  -> typed operator-action adapter
  -> PostgreSQL prepare / approve / execute command
  -> canonical REST and MCP readback
```

There is no legacy database, offline queue, browser-owned business state, or
fallback write authority. A missing canonical command or tenant context must
fail closed.

## Start here

- [Architecture](docs/architecture/README.md)
- [18-operation authority matrix](docs/architecture/core-operation-authority-matrix.json)
- [Runtime business-logic ownership](docs/backend/services/README.md)
- [Canonical SQL ownership](database/canonical/README.md)
- [Live18 acceptance](docs/testing/canonical-live18-acceptance.md)
- [Development](docs/guides/development.md)
- [Testing](docs/guides/testing.md)
- [Deployment](docs/deployment/production.md)
- [Codex/ChatGPT plugin package](plugins/aasopharma-erp/README.md)

Machine-readable contracts and executable gates take precedence over narrative
documentation. A successful build or healthy endpoint alone does not establish
production readiness; exact-SHA promotion evidence must validate.

## Repository map

```text
backend/app/                         FastAPI runtime and typed adapters
backend/alembic/                     immutable PostgreSQL migration history
backend/mcp_runtime/                 authenticated MCP server
backend/tests/                       unit, contract, PostgreSQL, and live gates
database/canonical/                  reviewed canonical SQL source ownership
docs/architecture/                   operation and application contracts
frontend/src/                        React product
frontend/e2e/                        Playwright acceptance
plugins/aasopharma-erp/              Codex/ChatGPT plugin package
deploy/railway/                      service-specific Railway builds
```

## Fast verification

From the repository root:

```bash
PYTHONPATH=backend pytest -q backend/tests/unit
PYTHONPATH=backend/mcp_runtime pytest -q backend/mcp_runtime/tests
python3 backend/scripts/check_canonical_artifacts.py
python3 backend/scripts/schema_readiness.py --validate-authority

cd frontend
npm run typecheck
npm run lint:critical
npm run test:ci -- --runInBand
CI=false npm run build
```

PostgreSQL runtime/RLS and live browser tests require their documented
disposable or deployed environments. Never point destructive fixtures at a
company database.

## Release boundary

Deployment is an explicit exact-SHA workflow. Do not run an unqualified local `railway up`,
change readiness fields by hand, or claim a live pass from a different commit.
See [production deployment](docs/deployment/production.md)
for the current health, build-metadata, migration, runtime-role, RLS, tenant,
reconciliation, backup/restore, and browser evidence requirements.
