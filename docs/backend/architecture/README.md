# Backend architecture

Backend architecture is maintained in [`docs/architecture`](../../architecture/README.md).
The executable boundaries are:

- `backend/app/main.py` for mounted REST reachability;
- `backend/app/infrastructure/operator_actions` for typed command adapters;
- `database/canonical` and the current Alembic chain for database authority;
- `backend/mcp_runtime` for the published MCP surface; and
- `backend/tests/live_acceptance/operation_matrix.json` for end-to-end coverage.

Do not restore the retired generic service/repository architecture, integer-ID
tenant model, direct legacy table writes, or local/offline authentication.
