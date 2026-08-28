# Runtime observation

Use the deployed provider logs and the checked-in service endpoints; do not
assume an unprovisioned Prometheus, Grafana, Loki, Sentry, Redis, Slack, or
PagerDuty stack exists.

For an exact-SHA release, reconcile:

- API `/health` and `/ready`;
- MCP `/health` and `/ready`;
- frontend `/health` and `/build-metadata.json`;
- the same reviewed SHA across all three services;
- migration head and runtime database identity; and
- request IDs, HTTP failures, and browser console/network evidence for the
  acceptance flow.

Health is necessary but not sufficient. A healthy process may still have the
wrong commit, database, tenant mapping, or command contract. Follow
[production deployment](production.md) and keep readiness fail-closed until all
hash-bound evidence validates.

Never print authorization headers, cookies, database URLs, service credentials,
or user data while collecting logs. Redact before storing an evidence artifact.
