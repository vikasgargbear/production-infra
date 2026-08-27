# Backend documentation

The FastAPI application exposes canonical reads and typed operator actions over
PostgreSQL. Business writes are prepared, reviewed, approved when required, and
executed by named database functions.

Use these entry points:

- [Runtime business-logic ownership](services/README.md)
- [Canonical API verification](api/canonical-live-verification.md)
- [Canonical architecture](../architecture/README.md)
- [Deployment runbooks](../deployment/production.md)

The executable route graph comes from `backend/app/main.py`; the 18-operation
authority map is `docs/architecture/core-operation-authority-matrix.json`.
OpenAPI, the mounted-callable graph, and contract tests decide reachability—not
an unmounted module or an old documentation example.
