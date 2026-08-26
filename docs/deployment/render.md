# Render Deployment

The canonical Render configuration is the repository-root `render.yaml`. It
defines the internal pilot only; it does not represent a production-readiness
claim.

## Service Boundaries

- `aasopharma-api-pilot`: FastAPI Docker service in Singapore, exposing
  `/health`, `/ready`, and `/api`.
- `aasopharma-erp-pilot`: compiled React static site.
- `aasopharma-mcp-pilot`: isolated Python 3.11 MCP source contract; readiness
  remains hard-failed by its OAuth consent and canonical-read gates.
- A separately reviewed canonical PostgreSQL deployment and active Supabase Auth
  project; neither may be the retired Supabase project.

Do not create a Render database. Do not advertise `/mcp`; the transport source
exists, but hosted OAuth consent and canonical read authorization are blocked.
See `docs/deployment/render-mcp.md`.

Automatic Render deployments are disabled. Every Blueprint sync and deployment
must follow a reviewed commit and current readiness report.

The Render services use public Git URLs, so Render-native auto-deploy is kept
off. On pushes to `main`, GitHub Actions deploys the exact commit only after the
backend, frontend, dependency-audit, and MCP compatibility jobs pass. The
intentional `production-blockers` report remains fail-closed and visible while
the internal pilot is still restricted. Repository variables identify all three
service IDs and origins (`RENDER_{API,MCP,FRONTEND}_{SERVICE_ID,URL}`);
`RENDER_API_KEY` is stored only as an Actions secret.

## Required Render Values

Enter these operator-supplied values when creating or syncing the Blueprint:

Backend public configuration:

- `CORS_ORIGINS`: exact Render frontend origin, without a wildcard.
- `APP_URL`: the same frontend origin.
- `SUPABASE_URL`: exact active identity-provider origin from the reviewed
  deployment evidence.
- `SUPABASE_ANON_KEY`: Supabase publishable/anon key.
- `SMTP_HOST` and `SMTP_PORT` when email is enabled.

Backend secrets:

- `DATABASE_URL`: Supabase PostgreSQL connection URL authenticating exactly as
  the non-owner, non-superuser, non-`BYPASSRLS` `erp_runtime` role.
- `ERP_CALCULATOR_DATABASE_URL`: separate Supabase PostgreSQL URL authenticating
  exactly as the isolated `erp_calculator` role.
- `TAX_PROVIDER_DATABASE_URL`: separate Supabase PostgreSQL URL authenticating
  exactly as the isolated `erp_tax_provider` role.
- `TAX_PROVIDER_INTERNAL_SERVICE_TOKEN`: high-entropy bearer secret shared only
  with the licensed provider worker.
- `TAX_PROVIDER_INTERNAL_HMAC_SECRET`: a different high-entropy key used to sign
  the timestamp, method, path, and exact raw bytes of each worker request.
- `JWT_SECRET_KEY`: independently generated ERP signing secret.
- `SMTP_USER` and `SMTP_PASSWORD` when email is enabled.

Frontend public build values:

- `REACT_APP_API_BASE_URL`: exact Render backend origin, without `/api`.
- `REACT_APP_SUPABASE_URL`: the Supabase project URL.
- `REACT_APP_SUPABASE_ANON_KEY`: Supabase publishable/anon key.

Never place database URLs, tax-provider worker secrets, `JWT_SECRET_KEY`, or SMTP
credentials in `REACT_APP_*`. The `sbp_` Supabase management access token is
not a runtime application credential and must not be entered in Render.

## Deployment Sequence

1. Merge a reviewed revision containing `render.yaml`.
2. Sign in to Render using the business-owned account and connect
   `vikasgargbear/production-infra`.
3. Create or sync the Blueprint from `main`.
4. Enter every prompted value above directly in Render.
5. Deploy the API and wait for Render's `/ready` database check to pass.
6. Set the generated API origin as `REACT_APP_API_BASE_URL` and
   `ERP_API_BASE_URL`; set the MCP origin plus `/mcp` as
   `MCP_RESOURCE_SERVER_URL`.
7. Deploy MCP only after every MCP promotion gate passes, then require both
   `/health` and `/ready`.
8. Set the generated frontend origin as `CORS_ORIGINS` and `APP_URL`.
9. Deploy the static frontend.
10. Configure the exact frontend and MCP callback origins in Supabase Auth.
11. Run the non-destructive pilot checks below.

The detailed authentication redirects and preflight checks are documented in
`docs/deployment/render-pilot.md`.

## API Provisioning Helper

`backend/scripts/provision_render_pilot.py` provides a dry-run-first alternative
to creating the three services in the dashboard. It uses only the official Render
API and does not create a Blueprint or Render database.

The default command prints redacted create payloads and the update sequence. It
does not contact Render:

```bash
python3 backend/scripts/provision_render_pilot.py
```

For an operator-approved apply, put the required runtime values in a local file
outside the repository, export `RENDER_API_KEY`, and run:

```bash
RENDER_API_KEY="..." python3 backend/scripts/provision_render_pilot.py \
  --apply --env-file /secure/path/render-pilot.env
```

Add `--deploy` only after reviewing CI and the helper's resulting service IDs
and URLs. Without it, the helper creates or updates configuration but does not
trigger the post-configuration deploy endpoint. Render service creation itself
can start an initial deploy even when `autoDeploy` is `no`; the helper therefore
creates the static site first, uses its exact generated origin for backend CORS,
then creates the API and MCP service. It derives the exact API and MCP resource
origins after creation before reconciling their environment.

The helper is idempotent by exact workspace/name/type lookup. It refuses
duplicate or wrong-type matches, reconciles repo/branch/build settings, keeps
auto-deploy disabled, and compares each environment variable before updating
it. It adds the required SPA rewrite without replacing unrelated routes and
uses per-key environment updates so unrelated Render variables are not deleted.
For MCP, the helper instead refuses every environment key outside the reviewed
minimal service contract, preventing copied database or admin credentials from
being silently retained.
An existing API service in the wrong region fails closed because Render does
not safely patch service regions. API errors never include response bodies or
operator values in logs.

The repository is public, so these direct API service creations do not require
a connected GitHub account. Public-repository services cannot use Render's
GitHub-driven auto-deploys or pull-request previews; this pilot deliberately
keeps auto-deploy off and uses the explicit deploy API only with `--deploy`.

Required env-file keys are `DATABASE_URL`, `ERP_CALCULATOR_DATABASE_URL`,
`TAX_PROVIDER_DATABASE_URL`, `TAX_PROVIDER_INTERNAL_SERVICE_TOKEN`,
`TAX_PROVIDER_INTERNAL_HMAC_SECRET`,
`JWT_SECRET_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_OAUTH_ISSUER`,
`MCP_INTERNAL_SERVICE_TOKEN`, and `MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS`.
`DATABASE_URL` must authenticate as `erp_runtime`; the calculator and provider
URLs must authenticate as `erp_calculator` and `erp_tax_provider` respectively.
The provider bearer and HMAC secrets must be independently generated and must
not reuse the MCP or JWT secrets. SMTP keys are optional but must be
supplied as a complete set. `CORS_ORIGINS`, `APP_URL`,
`REACT_APP_API_BASE_URL`, `ERP_API_BASE_URL`, and `MCP_RESOURCE_SERVER_URL` are
derived from returned service origins and must not be hardcoded. MCP receives
no database, ERP JWT signing, Supabase anon, or service-role credential.

## Non-Destructive Pilot Verification

Wake and check the API using only its generated hostname. This probe performs
GET requests only, retries bounded cold-start/transient failures, and does not
print response bodies or credentials:

```bash
backend/venv/bin/python backend/scripts/verify_render_pilot_readonly.py \
  --base-url https://your-backend.onrender.com
```

Without `PHARMA_LIVE_ACCESS_TOKEN`, it checks process health and the public
Supabase auth configuration surface. Those endpoints do not prove database
connectivity, that the configured Supabase keys are valid, or tenant access.
When a short-lived ERP token is present only in the environment, the same
command also performs an authenticated GET of the GST dashboard. It never calls
the Supabase session exchange because that route updates login metadata.

Check the static frontend separately:

```bash
curl --fail --silent --show-error https://your-frontend.onrender.com/
```

Then run only the read-only finance/GST audit:

```bash
cd backend
PHARMA_LIVE_API_BASE_URL="https://your-backend.onrender.com" \
PHARMA_LIVE_DATABASE_URL="postgresql://..." \
PHARMA_LIVE_DATABASE_READ_ONLY=true \
PHARMA_LIVE_ACCESS_TOKEN="short-lived-erp-access-token" \
PHARMA_LIVE_TEST_ORG_ID="dedicated-test-org-uuid" \
PHARMA_LIVE_TEST_BRANCH_ID="dedicated-test-branch-id" \
./venv/bin/pytest -q tests/live_erp/test_live_finance_gst_audit.py
```

The read-only flag configures the established connection with psycopg's
`set_session(readonly=True, autocommit=True)`, verifies PostgreSQL reports
`transaction_read_only=on`, and makes the database reject data-changing
statements even if a future audit test is edited incorrectly. The verification
fails closed when a database pooler does not preserve the requested setting.

`PHARMA_LIVE_ACCESS_TOKEN` is the short-lived ERP bearer returned after the
Supabase session exchange. It is not the `sbp_` management token, the Supabase
anon key, or the service-role key.

## Mutating Live Verification

The rest of `tests/live_erp` creates, cancels, allocates, adjusts, and reverses
business records. It uses compensating cleanup rather than a transaction-wide
rollback. Run it only against a dedicated disposable organization and branch in
a staging Supabase project or an explicitly isolated test tenant. Never run it
against the real operating organization.

No fixed pass count is documented because the collected matrix changes with
the application. Verify collection and the exact target before every run:

```bash
cd backend
./venv/bin/pytest --collect-only -q tests/live_erp
```

Render free services are suitable for this internal pilot, with accepted cold
starts. They are not the final production hosting tier for real ERP traffic.
