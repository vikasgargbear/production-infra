# ERP documentation

The canonical application is the maintained product. Start with these sources:

- [Architecture](architecture/README.md) — data, command, readback, security,
  and promotion contracts.
- [Backend runtime ownership](backend/services/README.md) — where to trace a
  business operation and where new logic belongs.
- [Live18 acceptance](testing/canonical-live18-acceptance.md) — browser, REST,
  MCP, and PostgreSQL reconciliation.
- [Deployment](deployment/production.md) — exact-SHA deployment and operational
  gates.
- [Development](guides/development.md) and [testing](guides/testing.md) — local
  engineering workflows.
- [Frontend design standards](frontend/ui-design-patterns.md) — interaction and
  component conventions.

Generated or machine-reviewed contracts take precedence over narrative notes.
Do not infer runtime authority from historical filenames, old schema captures,
or Git history.
