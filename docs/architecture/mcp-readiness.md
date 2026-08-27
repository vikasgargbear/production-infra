# MCP readiness architecture

## Boundary

The MCP adapter is a separately deployable Python 3.11 Streamable HTTP service.
It never connects to PostgreSQL or imports FastAPI route implementations. It
verifies the OAuth bearer, requests a bounded internal delegation from the API,
and calls only canonical internal API contracts.

```text
ChatGPT/Codex → OAuth-protected MCP → canonical internal REST → PostgreSQL
```

The backend owns tenant/branch resolution, permissions, validation,
calculations, numbering, transactions, idempotency, audit, and side effects. MCP
owns protocol transport and model-readable tool schemas. The frontend owns
presentation. Missing context or authority fails closed at every boundary.

## Sources of truth

- `backend/mcp_runtime/service-contract.json`: transport, environment, OAuth,
  current tool inventory, and readiness gates.
- `docs/architecture/mcp-operator-actions.json`: reviewed prepare/resolution/
  lifecycle publication contract.
- `backend/mcp_runtime/aasopharma_mcp/server.py`: actual SDK tool registration.
- `backend/app/infrastructure/operator_actions/registry.py`: canonical adapter
  availability.
- `docs/architecture/app-data-contract.json`: mounted REST/MCP ownership map.

Do not copy tool lists into prose. Contract tests must reject drift between
these sources and the published MCP registry.

## Authentication and tenant context

Remote MCP uses OAuth 2.1 discovery with standard `openid` and
`offline_access`. The OAuth subject authenticates the person and client; it does
not authorize an ERP operation. The API resolves the subject through active
`core.users`, `core.memberships`, live role permissions, branch access, and the
bounded `automation.agent_grants` capability.

An argument, header, prompt, saved resource, or model memory can never select a
tenant. Every call revalidates organization and branch context before activating
forced RLS. The Supabase bearer is not forwarded as an internal service token.

## Reads and writes

Read tools resolve bounded canonical records and return opaque UUIDs plus human
references. They never expose generic SQL, arbitrary report builders, file
paths, raw audit payloads, or auth administration.

Consequential operations use the shared lifecycle:

```text
resolve facts → prepare → immutable review → approve → execute → readback
```

Preparation does not mean success. Approval and execution target the captured
command UUID and preview hash; stale sources, changed inputs, replay conflicts,
cross-tenant access, and missing distinct-reviewer authority fail closed. A tool
must not search for an arbitrary pending command or fabricate a successful
business record.

Money and quantities remain exact decimal strings with their currency/UOM;
dates and periods are explicit; canonical UUIDs are never converted to integer
IDs. Communications and regulated external submissions are not implicit side
effects.

## Release gates

MCP is usable only when all of the following are true for the same reviewed SHA:

1. API, MCP, and frontend deployment metadata match.
2. API and MCP `/health` and `/ready` pass.
3. OAuth protected-resource and issuer discovery work, including refresh.
4. Published tool names, descriptions, schemas, annotations, and adapter
   availability match the checked-in contracts.
5. Representative read, validation, authorization, confirmation, and canonical
   readback evaluations pass through MCP Inspector and the target host.
6. No unavailable, legacy, offline, direct-database, or fake-success path is
   reachable.

The ChatGPT/Codex package lives under `plugins/aasopharma-erp`. ChatGPT must
first register the public `/mcp` connection in developer mode and supply its real
technical app ID; the repository must never ship another connection's ID or a
placeholder.
