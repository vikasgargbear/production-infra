# Backend API

The mounted FastAPI application and generated OpenAPI document are the endpoint
authority. Do not use hand-maintained endpoint lists as an implementation
contract.

Trace a supported business operation through:

1. `docs/architecture/core-operation-authority-matrix.json`;
2. the mounted route in `backend/app/main.py`;
3. `backend/app/infrastructure/operator_actions`;
4. the named canonical PostgreSQL function; and
5. its REST and MCP readback tests.

Current verification guidance is in
[`canonical-live-verification.md`](canonical-live-verification.md). Historical
Supabase verification notes are retained temporarily only for explicit
retirement review; they are not current endpoint or deployment instructions.

Authentication derives organization and branch authority from the verified
identity and canonical membership. Clients must not send tenant identity,
business facts, or fallback state from browser storage.
