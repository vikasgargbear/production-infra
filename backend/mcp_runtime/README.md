# AASOPharma MCP Runtime

This isolated Python 3.11 service uses the official MCP SDK's stateless
Streamable HTTP transport. It exports exactly `erp_product_search`,
`erp_supplier_search`, and `erp_gst_settings_get`; it has no database connection
and exports no writes.

The planned operator action schemas live in `aasopharma_mcp/operator_actions.py`
and are governed by `docs/architecture/mcp-operator-actions.json`. They cover
sales, procurement, payments, supplier advances, and controlled inventory
movements through prepare, approve, execute, and status. They are definitions,
not registered tools: execution can eventually accept only the immutable
`command_request_id`, `preview_hash`, and `idempotency_key`.

## Configuration

Required variables are `SUPABASE_OAUTH_ISSUER`,
`MCP_RESOURCE_SERVER_URL` (HTTPS and ending `/mcp`), `ERP_API_BASE_URL`,
`MCP_INTERNAL_SERVICE_TOKEN` (at least 32 characters), and
`MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS`. Optional variables are `MCP_BIND_HOST`
(default `0.0.0.0`) and `MCP_REQUEST_TIMEOUT_SECONDS` (default `10`). JWKS and
internal grant URLs are derived. The OAuth audience is fixed to `authenticated`
in code until a reviewed custom-token hook exists. Aliases are unsupported. The service never
uses `SUPABASE_SERVICE_ROLE_KEY`, `APP_ENV`, or `ENV`. See
`service-contract.json` for the machine contract.

Only ES256/RS256 Supabase tokens with the exact issuer, `authenticated`
audience, UUID subject, pre-registered client ID, and standard `openid` plus
`offline_access` scopes are accepted. ERP permission names are not OAuth
scopes. Each tool separately checks the app-owned active grant, exact read-only
capability, role permission, expiry, tenant, and branch scope. The OAuth bearer
is never forwarded to ERP.

## Release State

The source is not hosted-ready. Supabase DCR is disabled. The hosted consent UI
and official SDK boundary are implemented, and the lock resolves
`@supabase/supabase-js` to `2.112.3`; clean Node 22 CI verifies authorization
detail loading, explicit approval, denial, scope rejection, identity binding,
type checking, build, and browser E2E. Canonical hidden reads and delegated
claims are implemented, but live OAuth approval/denial, client registration,
schema deployment, and ChatGPT/Claude staging evidence are still fail-closed.
Code-owned gates keep readiness and delegation at `503` until those external
checks exist. Do not register this endpoint with ChatGPT or Claude in that
state.

ChatGPT needs `offline_access` for refresh and controlled Business/Enterprise/
Edu admin or developer-mode rollout; tool snapshots must be frozen for review.
With Supabase DCR disabled, Claude can use a pre-registered client ID/secret and
callback `https://claude.ai/api/mcp/auth_callback` after hosted consent exists.

```bash
python3.11 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
PYTHONPATH=. .venv/bin/pytest -q tests
```

Tests inject JWKS decoding and HTTP clients and require no network.
