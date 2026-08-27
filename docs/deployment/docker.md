# Container builds

Checked-in Dockerfiles and service manifests are the only maintained container
definitions:

- `backend/Dockerfile`
- `frontend/Dockerfile`
- `deploy/railway/api.Dockerfile`
- `deploy/railway/mcp.Dockerfile`
- `deploy/railway/*.railway.json`

Build context is part of each deployment contract. Do not copy Dockerfile
snippets into an alternate Compose or Nginx stack; validate the checked-in path
and context instead. In particular, MCP source paths are relative to the
repository-root build context.

Production and staging releases are exact-SHA workflows. A local image proves
only that its build completed. Release evidence additionally requires matching
build metadata, API/MCP/frontend health and readiness, Alembic head, runtime
role, RLS/tenant isolation, and acceptance artifacts. See
[production deployment](production.md).

The root `docker-compose.yml` is for local disposable development. It is not a
production deployment authority and must not be used to generate promotion
evidence.
