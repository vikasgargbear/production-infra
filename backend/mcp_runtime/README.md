# AASOPharma MCP Runtime

This isolated Python 3.11 service uses the official MCP SDK's stateless
Streamable HTTP transport. It has no database connection. It exports 85 tools:
27 bounded and resolution reads, 22 prepare actions, 10 reviewed master-data
writes, six shared invoice-draft lifecycle tools, four shared command lifecycle
tools, 15 exact command readbacks, and one stateless purchase-bill review through
the application-owned delegated boundary.

The operator action schemas live in `aasopharma_mcp/operator_actions.py`
and are governed by `docs/architecture/mcp-operator-actions.json`. They cover
sales, procurement, payments, supplier advances, and controlled inventory
movements through prepare, review, approve, execute, status, and exact readback.
Execution accepts only the immutable `command_request_id`, `preview_hash`, and
`idempotency_key`. Unsupported ingestion and operation variants remain absent
from the registry instead of falling back to legacy or local behavior.
Customer and supplier create schemas are generated from the canonical
application models into `aasopharma_mcp/party_create_contracts.json`; CI rejects
any generated-artifact drift. Exact party readback remains a sensitive,
tenant-scoped read with the same party-management permission as creation.

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
`offline_access` scopes are accepted. The signed tenant anchor is exactly
`app_metadata.org_id`; metadata aliases are rejected. ERP permission names are not OAuth
scopes. Each tool separately checks the app-owned active grant, exact capability,
operation mode, approval policy, permission, expiry, tenant, and branch scope.
The OAuth bearer is never forwarded to ERP.

Sales- and supplier-invoice drafts use the same canonical ERP draft authority as
the first-party UI. MCP preserves the exact `invoice-draft.v1` authoring envelope;
`editor_state` is never business authority and an incomplete draft may retain a
null `command_payload`. Draft preparation validates the complete command payload
server-side and returns only an immutable command preview. Approval and posting
remain separate explicit command-lifecycle tools.

## Release State

Supabase DCR is disabled. The hosted consent UI and official SDK boundary are
implemented, and the lock resolves
`@supabase/supabase-js` to `2.112.3`; clean Node 22 CI verifies authorization
detail loading, explicit approval, denial, scope rejection, identity binding,
type checking, build, and browser E2E. Code-owned gates and per-capability grants
keep every unapproved operation fail closed. Published posting actions always
require prepare, human approval, and execution. Draft save/update/abandon
operations create no accounting, inventory, tax, payable, or receivable posting.

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
