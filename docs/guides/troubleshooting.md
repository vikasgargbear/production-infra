# Troubleshooting

Diagnose the canonical application from the outside in. Do not repair failures
by editing business tables, creating schemas manually, resetting document
numbers, storing tokens in browser persistence, or enabling a legacy endpoint.

## Hosted service identity

Check the exact deployed SHA before investigating product behavior:

```bash
curl --fail --silent --show-error "$API_ORIGIN/health"
curl --fail --silent --show-error "$API_ORIGIN/ready"
curl --fail --silent --show-error "$MCP_ORIGIN/health"
curl --fail --silent --show-error "$MCP_ORIGIN/ready"
curl --fail --silent --show-error "$FRONTEND_ORIGIN/build-metadata.json"
```

All services must expose the reviewed SHA. A liveness response is not database,
authentication, or promotion readiness.

## Authentication and organization linkage

For “identity is not linked to an active ERP organization”:

1. Confirm the Supabase access token is current without printing it.
2. Inspect the session-exchange request and response status.
3. Resolve the immutable Supabase subject only through active
   `core.users.auth_user_id` → `core.memberships` → `core.organizations` rows.
4. Confirm the requested organization matches the active membership.
5. Retry the exchange after correcting canonical provisioning through the
   supported operator workflow.

The browser keeps ERP credentials in memory/session scope only. Never add an
email-only identity match, local token fallback, or client-provided organization
authority.

## Database and migrations

Use the sole migration authority:

```bash
cd backend
alembic heads
alembic current
alembic upgrade head
python3 scripts/schema_readiness.py --validate-authority
python3 scripts/check_canonical_artifacts.py
```

Run upgrades only against a disposable or operator-approved target. Do not run
`downgrade base` on a shared environment, apply standalone SQL, or change
canonical tables by hand. A missing relation or column means the deployed SHA
and Alembic head must be reconciled; it is not permission to create a substitute.

## API failures

- `401`: verify OAuth discovery, token issuer/audience, expiry, and exact service
  environment.
- `403`: verify active membership, branch access, permission, and forced-RLS
  context.
- `409`: preserve the original command UUID and inspect idempotency, replay, or
  stale source-version evidence.
- `422`: display the server validation details and correct the form input; never
  coerce blanks to zero or invent identifiers.
- `5xx`: record request ID, route, deployed SHA, and sanitized server error, then
  verify the matching canonical migration/function exists.

For stock, tax, allocation, or journal mismatches, use the operation's canonical
REST/MCP readback and PostgreSQL acceptance fixture. Do not patch balances,
allocations, journal lines, GST totals, or document status directly.

## MCP and ChatGPT

Require a public HTTPS Streamable HTTP endpoint ending in `/mcp`, working OAuth
discovery, and successful `/ready`. Use MCP Inspector before registering the
connection in ChatGPT developer mode. Missing tools, authentication failures, or
readiness failures must remain visible; do not add placeholder tools or fake
success responses.

## Evidence to capture

Record the deployed SHA, organization/branch UUIDs, route or tool, HTTP status,
request ID, command UUID, expected/actual result, and sanitized logs. Never put
access tokens, database URLs, secret keys, or customer data in issue reports.
