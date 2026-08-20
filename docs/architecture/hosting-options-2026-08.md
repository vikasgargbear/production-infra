# Hosting Options, August 2026

Status: internal-pilot decision record and production promotion guide

This assessment uses vendor pricing and platform documentation available on
2026-08-19. Prices exclude taxes and can change. A billing account and hard
budget alerts are required even where a free allowance should cover normal use.

## Decision

| Concern | Service | Region rule |
| --- | --- | --- |
| React static frontend | Render Static Site Free | Global CDN |
| FastAPI application API | Render Web Service Free | Singapore |
| Remote MCP endpoint | Same Render web service at `/mcp` when implemented | Same as API |
| Scheduled work | Disabled for pilot; run supervised tasks manually | N/A |
| Database, Auth, Storage | Existing Supabase project | Singapore preferred to match Render |
| DNS and edge TLS | Render-generated hostnames initially | Managed TLS |

The user has accepted Render's cold start for a small, internal pilot. The
checked-in `render.yaml` correctly keeps REST and the future MCP endpoint in one
free web service, so MCP does not consume a second 750-hour service allowance.
It also hosts the static frontend separately without adding a second backend.

This is not the production compliance posture. Render says free web services
are not for production, sleep after 15 idle minutes, can take about a minute to
wake, have ephemeral filesystems, and cannot run free background workers or
cron jobs. Supabase Free can also pause after seven days of low activity. Before
external customers, regulated workflows, or an availability commitment, move
the same container to Render Starter or Cloud Run and promote Supabase to Pro.
The application remains portable because it requires only a Docker container,
`PORT`, HTTPS, environment secrets, and PostgreSQL/Supabase services.

## Why This Shape

The frontend is a Create React App static build. A Render Static Site preserves
the frontend/backend boundary and uses the same Blueprint as the API. Its only
runtime configuration is the public API base URL. No business rule belongs in
the static host.

The backend Dockerfile runs FastAPI on the platform `PORT`, writes no durable
state to the container, and works on Render or Cloud Run without a runtime
rewrite. Render Singapore should use Supabase Singapore to avoid unnecessary
cross-region database traffic. All generated documents belong in Supabase
Storage, never the Render filesystem.

Do not hide a scheduler or queue consumer inside the pilot web process. Periodic
reports, compliance checks, cleanup, and imports need a supervised manual run
during the pilot, then a paid Render cron/worker or Cloud Run Job before
production. Render Free provides neither a free background worker nor cron.

## MCP Hosting

The current code is not a remote MCP server. It has a reviewed operation
registry and OpenAPI risk metadata, but `x-erp-contract` deliberately reports
`mcp_transport_implemented: false`; there is no `/mcp` transport route. Hosting
the current container does not by itself enable ChatGPT or Claude integration.

For the first implementation, add a stateless Streamable HTTP `/mcp` route to
the FastAPI application and host it in the same Render web service as the REST
API. Keep it as a separate backend module, but reuse the same application
services, tenant context, permission checks, audit sink, and database pool. The
MCP 2026-07-28 protocol core supports stateless operation, so the planned
`json_response` and stateless configuration needs no sticky sessions or second
host. This also avoids another free-service allowance, another set of
service-role credentials, and contract drift.

The remote endpoint must provide:

1. Public HTTPS using Streamable HTTP. Do not build a new SSE-only transport.
2. OAuth 2.0/OIDC discovery and protected-resource metadata, per-user consent,
   short-lived access tokens, refresh-token rotation, revocation, PKCE, and
   `offline_access` where supported.
3. Dynamic Client Registration or explicitly registered client credentials.
   Claude supports DCR and also permits a configured client ID/secret. Its OAuth
   callback is `https://claude.ai/api/mcp/auth_callback`.
4. Scopes mapped to the existing ERP permissions, with organization and branch
   derived from the grant rather than MCP arguments.
5. The reviewed allowlist only. Do not publish every OpenAPI operation as a
   tool. Keep writes disabled until preview, approval, idempotency, and atomic
   audit gates are implemented.
6. MCP Inspector tests plus real connection tests in ChatGPT and Claude. ChatGPT
   custom apps require a remote endpoint; Claude custom connectors support
   Streamable HTTP and OAuth.

ChatGPT warns that without `offline_access` and refresh tokens it can lose the
connection when the initial grant expires. Claude supports access-token expiry
and refresh and recommends implementing both. Store grants by ERP user and
client, hash refresh tokens, and make disconnect/revocation immediate.

Split MCP into its own service only after there is evidence for an
independent failure domain, scaling profile, release cadence, or OAuth gateway.
At that point it becomes a thin protocol adapter that calls the versioned
backend API with delegated user authorization. It must not import repositories
or connect directly to Postgres. This preserves the backend as the only business
boundary. A Cloudflare Worker MCP gateway is credible for a future stateless
TypeScript adapter, but moving business tools there now would duplicate Python
authorization and audit logic.

## MCP Implementation Gate

There is deliberately no `/mcp` route in the current application. Do not make
the conditional Render release probe pass, publish it to ChatGPT or Claude, or change
`mcp_transport_implemented` to true until the transport and OAuth integration
below are implemented and tested.

The official Python MCP SDK remains isolated from the API even where selected
dependency versions overlap. The current stable `mcp==2.0.0` requires at least
`pydantic>=2.12.0`, `PyJWT[crypto]>=2.13.0`, `python-multipart>=0.0.9`, and
`uvicorn>=0.31.1`. The API now pins reviewed patched Pydantic, PyJWT, and
python-multipart releases, but still has an independent FastAPI lifecycle and
does not carry the MCP SDK or its transport dependencies. The workstation interpreter
and existing virtual environment remain Python 3.9.6, while Render/Docker and
CI target Python 3.11. The `mcp-sdk-compatibility` CI job installs the official
SDK from `backend/mcp_runtime/requirements.txt` in an isolated Python 3.11 job,
constructs its stateless JSON Streamable HTTP ASGI application, and compares
the installed SDK metadata to the backend pins. This validates the SDK itself
without claiming the shared runtime upgrade is safe. Treat that upgrade as a
separate tested dependency migration, not a pilot hotfix.

Supabase now supplies the OAuth 2.1 authorization server needed by remote MCP,
but it does not supply an MCP server. Its OAuth server is beta and free during
the beta period. Complete these gates in order:

1. Create a Python 3.11 test environment, upgrade the MCP transitive pins, and
   run the complete backend suite plus an image build and Render smoke test.
2. Enable the Supabase OAuth 2.1 server. Set the issuer to
   `https://<project-ref>.supabase.co/auth/v1` and verify its discovery, token,
   revocation, and JWKS endpoints.
3. Migrate Supabase signing to RS256 or ES256. The current ERP authentication
   code signs its own HS256 JWT using `JWT_SECRET_KEY`; define one authoritative
   identity flow and validate Supabase tokens by signature, issuer, audience,
   expiry, and client before mapping them to ERP membership. Do not share the
   symmetric ERP secret with MCP clients.
4. Configure the Supabase authorization path as `/oauth/consent` and implement
   the frontend consent UI using `getAuthorizationDetails`,
   `approveAuthorization`, and `denyAuthorization`. Show the requesting client
   and requested scopes, preserve login redirects, and provide revocation.
5. Pre-register the pilot clients, or enable Dynamic Client Registration only
   with redirect-URI validation, mandatory user approval, rate limiting, and
   monitoring. Validate ChatGPT and Claude callbacks explicitly.
6. Implement the SDK token verifier and protected-resource metadata. A valid
   OAuth scope is only an outer ceiling: every tool still resolves the ERP user,
   organization, and active membership and executes the existing route/service
   permission check.
7. Mount the stateless transport at exactly `/mcp` and export only
   `erp_product_search`, `erp_supplier_search`, and `erp_gst_settings_get` from
   `OPERATION_REGISTRY`. Tool calls must use the bounded backend application
   operations and must never query Postgres directly.
8. Add unauthenticated, expired-token, wrong-issuer, wrong-audience,
   wrong-organization, missing-permission, pagination-bound, and registry-drift
   tests. Then run MCP Inspector and real ChatGPT/Claude connection tests before
   setting `mcp_transport_implemented` to true.

## Supabase Rules

Production requires Supabase Pro, currently starting at $25 per month. Free
projects can pause after a low-activity seven-day period, include only a 500 MiB
database and 5 GB egress, and lack the production backup posture this ERP needs.
Pro currently includes one Micro compute project, 8 GB database disk, 250 GB
uncached egress, 100,000 MAU, and seven days of daily backups.

Point-in-Time Recovery is not included. Seven-day PITR is currently about $100
per month and also requires at least Small compute. Start with Pro daily backups
plus an encrypted, automated off-site logical dump and a quarterly restore test.
Adopt PITR when the approved recovery-point objective is less than 24 hours.

Each Supabase project has one primary region. Match the API to it:

- Existing Supabase Singapore: use Render Singapore for the pilot or Cloud Run
  `asia-southeast1` after migration.
- Existing Supabase Mumbai: the Render pilot will cross regions; migrate to
  Cloud Run `asia-south1` before latency or data-residency commitments.
- New India-first production project: prefer Mumbai unless legal or customer
  requirements select another region.

Do not place the API in Mumbai and the database in Singapore merely to simplify
domains. That adds latency and makes database response traffic cross regions.

For Render or Cloud Run, use Supavisor transaction mode on port 6543 and disable
prepared statements where the driver requires it. Supabase identifies
transaction mode as the serverless/edge connection option and recommends it for
SQLAlchemy. Bound the SQLAlchemy pool for the single Render instance; on Cloud
Run, cap maximum instances and the per-instance pool together so autoscaling
cannot exhaust Postgres connections. Use a direct or session-mode connection
only for migrations, dumps, and other session-dependent tasks.

The browser may use Supabase Auth and signed Storage URLs. It must not use the
service-role key or bypass FastAPI for ERP business writes. RLS remains defense
in depth, not a substitute for application tenant, permission, idempotency, and
audit controls.

## Backend Comparison

| Provider | Entry production cost | Sleep / persistent workers | Asia region | Egress | Custom domain | Fit |
| --- | --- | --- | --- | --- | --- | --- |
| Cloud Run | Usage based; meaningful monthly free allowance | Scales to zero; Jobs for schedules; paid worker pools for continuous consumers | Mumbai, Delhi, Singapore | Internet egress charged; Asian traffic has no North America free allowance | Production setup uses load balancer or Firebase Hosting; direct mapping is preview and region-limited | Recommended for API and stateless MCP |
| Render | Free accepted for internal pilot; Starter 0.5 CPU/512 MiB is $7/month | Free sleeps; paid web stays on; worker is another paid service; cron has $1 monthly minimum | Singapore only | Hobby includes 5 GB, then $0.15/GB under August 2026 plan | Two Hobby domains, managed TLS | Selected pilot and simplest paid promotion |
| Railway | Free has $1 monthly credit; Hobby $5 minimum; Pro $20 minimum | Optional Serverless sleeps after 10 minutes without outbound packets; leave it off for workers | Singapore only | $0.05/GB | Managed domains and TLS | Good DX; Railway labels Pro for production teams |
| Fly.io | Pay as you go; no free allowance for new accounts | Autostop optional; Machine can remain running as a worker | Mumbai and Singapore | India $0.12/GB; Asia Pacific $0.04/GB under granular pricing | Managed Let's Encrypt certificates | Capable, with more operational ownership |
| Hetzner Cloud | Low fixed-price VM, region-dependent | No sleep; any number of local processes | Singapore, not India | Singapore includes 0.5 TB | Self-managed proxy and TLS | Cheap only if the team owns operations and recovery |

### Render

Render is the selected internal pilot because the repository already has a
Blueprint. Keep REST and MCP in the one free web service while the pilot accepts
cold starts. Promotion is a one-line plan change to at least `starter` for an
always-on API, while scheduled or queue work remains a separately paid cron or
worker. Singapore aligns with Supabase Singapore and custom domains have managed
TLS. The tradeoff is one paid instance per web/worker service and only 5 GB of
Hobby bandwidth after Render's August 2026 pricing migration.

### Railway

Railway Hobby is a $5 minimum that includes $5 of resource use; excess is billed
at $10/GB-month RAM, $20/vCPU-month CPU, $0.05/GB egress, and $0.15/GB-month
volume. Its free plan includes only $1 monthly resource credit. Railway positions
Hobby for personal projects and Pro, at $20 minimum, for professional production.
A database pool or telemetry can keep a nominally serverless service awake.

### Fly.io and Hetzner

Fly.io offers Mumbai and Singapore, per-second Machines, automatic start/stop,
and custom-domain certificates. New organizations do not receive the legacy free
allowance. It is credible when regional placement and a persistent worker matter
more than managed simplicity.

Hetzner provides strong raw always-on economics and substantial Singapore
traffic, but it is infrastructure rather than a managed application platform. A
single VM is not a production architecture for a compliance ERP. Use it only
with documented patching, secrets management, off-host backups, restore drills,
monitoring, and a tested replacement procedure.

## Frontend Alternatives

| Provider | Free production suitability | Limits that matter |
| --- | --- | --- |
| Cloudflare Pages | Best production free allowance for this static application | 500 builds/month; static requests free and unlimited; 100 custom domains/project |
| Render Static Site | Selected for the consolidated internal pilot | Global CDN, but counts against workspace bandwidth and pipeline minutes |
| Vercel | Free Hobby is not eligible | Hobby is personal/non-commercial only; Pro is $20/month and unnecessary for a static CRA build |

Do not add server-side business logic to Pages Functions or Vercel Functions.
Frontend hosting remains disposable static delivery; FastAPI is the business
boundary.

## Deployment Guardrails

1. Accept Render Free cold starts only for the named internal pilot. Record
   cold-start p95 and promote to a paid always-on service before an availability
   commitment.
2. Bound the pilot connection pool for its single Render instance. On an
   autoscaling production host, set a small maximum instance count from measured
   Supabase capacity. A cost ceiling and database safety ceiling are required.
3. Use separate production and staging services, identities, secrets, and
   Supabase projects. Never run destructive migrations on web container startup.
4. Store generated documents in object storage, never container filesystems.
5. Keep background work idempotent and record tenant, input digest, outcome,
   retry state, and execution identity in Postgres.
6. Put MCP under OAuth, tenant/branch context, explicit scopes, and the existing
   read-only allowlist. A hosting move must not expand tool exposure.
7. Alert on errors, p95 latency, cold starts, database connections and disk,
   backup age, egress, and spend before onboarding customers.

## Primary Sources

- [Cloudflare Pages pricing](https://developers.cloudflare.com/pages/functions/pricing/)
- [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/)
- [Cloud Run pricing](https://cloud.google.com/run/pricing)
- [Cloud Run scale-to-zero and worker pools](https://cloud.google.com/run/docs/overview/what-is-cloud-run)
- [Cloud Run request timeouts](https://cloud.google.com/run/docs/configuring/request-timeout)
- [Cloud Run custom domains](https://cloud.google.com/run/docs/mapping-custom-domains)
- [Supabase pricing](https://supabase.com/pricing)
- [Supabase regions](https://supabase.com/docs/guides/platform/regions)
- [Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase backups and PITR](https://supabase.com/docs/guides/platform/backups)
- [Supabase OAuth for MCP](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication)
- [Supabase OAuth 2.1 getting started](https://supabase.com/docs/guides/auth/oauth-server/getting-started)
- [Official Python MCP SDK package](https://pypi.org/project/mcp/)
- [Official MCP SDK 2.0 dependency metadata](https://github.com/modelcontextprotocol/python-sdk/blob/v2.0.0/pyproject.toml)
- [Render free-service limits](https://render.com/docs/free)
- [Render regions](https://render.com/docs/regions)
- [Render background workers](https://render.com/docs/background-workers)
- [Render August 2026 pricing transition](https://render.com/docs/new-workspace-plans)
- [Railway pricing](https://docs.railway.com/pricing/plans)
- [Railway regions](https://docs.railway.com/deployments/regions)
- [Railway serverless sleeping](https://docs.railway.com/deployments/serverless)
- [Fly.io pricing](https://fly.io/docs/about/pricing/)
- [Fly.io regions](https://fly.io/docs/reference/regions/)
- [Fly.io automatic start and stop](https://fly.io/docs/reference/fly-proxy-autostop-autostart/)
- [Hetzner Cloud pricing](https://www.hetzner.com/cloud/)
- [Hetzner locations](https://docs.hetzner.com/cloud/general/locations/)
- [MCP 2026-07-28 release](https://blog.modelcontextprotocol.io/posts/2026-07-28/)
- [ChatGPT developer mode and MCP apps](https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt-beta)
- [Claude remote MCP connector requirements](https://support.anthropic.com/en/articles/11503834-building-custom-integrations-via-remote-mcp-servers)
- [Cloudflare remote MCP guidance](https://developers.cloudflare.com/agents/model-context-protocol/)
- [Vercel Hobby restrictions](https://vercel.com/docs/plans/hobby)
