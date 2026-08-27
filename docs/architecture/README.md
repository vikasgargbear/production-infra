# Canonical ERP architecture

These files define the maintained application boundary. Machine-readable
contracts are authoritative; Markdown explains how to use them.

## Runtime contracts

- [`core-operation-authority-matrix.json`](core-operation-authority-matrix.json)
  maps all 18 core operations through REST, MCP, PostgreSQL functions, and
  authoritative relations.
- [`app-data-contract.json`](app-data-contract.json) records published
  application resources and promotion evidence requirements.
- [`canonical-data-model.json`](canonical-data-model.json) and
  [`canonical-field-dictionary.json`](canonical-field-dictionary.json) define
  canonical relation and field ownership.
- [`mcp-operator-actions.json`](mcp-operator-actions.json) defines the reviewed
  agent-facing command surface.
- [`runtime-environment-contract.json`](runtime-environment-contract.json)
  defines environment and secret boundaries.

## Security and release evidence

- [Authentication](authentication.md)
- [Database readiness](database-readiness.md)
- [MCP readiness](mcp-readiness.md)
- [Promotion evidence](promotion-evidence/README.md)
- [`canonical-application-promotion-evidence.json`](canonical-application-promotion-evidence.json)
- [Legacy retirement](legacy-retirement.md)

Promotion remains fail-closed until the evidence manifest validates for the
exact deployed commit. Narrative documents never change readiness or approval
state.

Historical source captures may remain referenced by classification and
decommission evidence. They are not runtime schema authority, fallback data
sources, or instructions to preserve the retired application.
