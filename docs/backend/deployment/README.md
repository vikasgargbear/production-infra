# Backend deployment boundary

Backend deployment is part of an exact-SHA release, not an independent quick
deploy. The API, MCP runtime, frontend, Alembic head, runtime role, RLS/tenant
checks, and build metadata must all reconcile to the reviewed commit.

Maintained references:

- [Production release](../../deployment/production.md)
- [Docker images](../../deployment/docker.md)
- [Monitoring](../../deployment/monitoring.md)
- [Backup and restore](../../deployment/backup.md)
- [Canonical evidence storage](../../deployment/canonical-evidence-storage.md)

Do not run an unqualified deployment command, print secrets, bypass migration
or evidence gates, or treat `/health` alone as production readiness.
