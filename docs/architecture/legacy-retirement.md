# Legacy surface retirement

The canonical application is the only maintained runtime. Git retains deleted
history; the working tree should retain only current code, explicit retirement
sentinels, and evidence needed for reset/decommission review.

## Deletion rule

A legacy file may be removed only after all of these graphs show no consumer:

- mounted FastAPI routes and reachable Python callables;
- Python and frontend imports, including dynamic registries;
- MCP tool publication;
- tests and CI workflows;
- Docker, deployment, and operator scripts; and
- current canonical migration or promotion evidence.

Removing an unreachable implementation must not remove a supported capability.
Every consequential business operation must remain mapped through
`core-operation-authority-matrix.json` to a typed adapter, named PostgreSQL
prepare/approve/execute functions, REST/MCP readback, affected relations, and
current tests.

## Maintained verification

- `backend/tests/live_acceptance` owns the 18-operation browser/REST/MCP/
  PostgreSQL evidence contract and Live23 variants.
- `backend/tests/live_canonical` owns credential-gated canonical command
  journeys and exact reconciliation.
- `backend/tests/postgres` owns disposable PostgreSQL runtime-role, RLS,
  transaction, and migration checks.
- `frontend/e2e` owns visible live browser acceptance, including Stock Hub.

The former `backend/tests/live_erp` harness targeted retired integer-ID routes
and legacy `financial.*`, GRN, outstanding, and inventory-movement relations.
It is not a fallback test path and must not be restored.

## Never reintroduce

- retired schemas, endpoints, tables, or service/repository write layers;
- conversion or dual-read behavior when reset-only is the approved strategy;
- localStorage/IndexedDB/offline queues for ERP business or identity state;
- browser-owned business facts, hardcoded tenant data, or fake success; or
- compatibility aliases that bypass canonical commands or readbacks.

Historical project references may remain only in explicitly classified source
capture or decommission evidence. They are never runtime configuration.
