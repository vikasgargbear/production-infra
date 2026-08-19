# Render Deployment

The canonical Render configuration is the repository-root `render.yaml`. It
defines the internal pilot only; it does not represent a production-readiness
claim.

## Service Boundaries

- `aasopharma-api-pilot`: FastAPI Docker service in Singapore, exposing
  `/health` and `/api`.
- `aasopharma-erp-pilot`: compiled React static site.
- Supabase project `jfrairkkzxwkhbtqejnz`: PostgreSQL and Supabase Auth.

Do not create a Render database. Do not advertise `/mcp`; the MCP transport and
hosted OAuth grant flow are not implemented yet.

Automatic Render deployments are disabled. Every Blueprint sync and deployment
must follow a reviewed commit and current readiness report.

## Required Render Values

Enter these operator-supplied values when creating or syncing the Blueprint:

Backend public configuration:

- `CORS_ORIGINS`: exact Render frontend origin, without a wildcard.
- `APP_URL`: the same frontend origin.
- `SUPABASE_URL`: `https://jfrairkkzxwkhbtqejnz.supabase.co`.
- `SUPABASE_ANON_KEY`: Supabase publishable/anon key.
- `SMTP_HOST` and `SMTP_PORT` when email is enabled.

Backend secrets:

- `DATABASE_URL`: Supabase PostgreSQL connection URL.
- `JWT_SECRET_KEY`: independently generated ERP signing secret.
- `SUPABASE_SERVICE_ROLE_KEY`: backend only.
- `SMTP_USER` and `SMTP_PASSWORD` when email is enabled.

Frontend public build values:

- `REACT_APP_API_BASE_URL`: exact Render backend origin, without `/api`.
- `REACT_APP_SUPABASE_URL`: the Supabase project URL.
- `REACT_APP_SUPABASE_ANON_KEY`: Supabase publishable/anon key.

Never place `DATABASE_URL`, `JWT_SECRET_KEY`, the service-role key, or SMTP
credentials in `REACT_APP_*`. The `sbp_` Supabase management access token is
not a runtime application credential and must not be entered in Render.

## Deployment Sequence

1. Merge a reviewed revision containing `render.yaml`.
2. Sign in to Render using the business-owned account and connect
   `vikasgargbear/production-infra`.
3. Create or sync the Blueprint from `main`.
4. Enter every prompted value above directly in Render.
5. Deploy the API and wait for `/health` to pass.
6. Set the generated API origin as `REACT_APP_API_BASE_URL`.
7. Set the generated frontend origin as `CORS_ORIGINS` and `APP_URL`.
8. Deploy the static frontend.
9. Configure the exact frontend origin in Supabase Auth URL settings.
10. Run the non-destructive pilot checks below.

The detailed authentication redirects and preflight checks are documented in
`docs/deployment/render-pilot.md`.

## Non-Destructive Pilot Verification

Check both services:

```bash
curl --fail --silent --show-error https://your-backend.onrender.com/health
curl --fail --silent --show-error https://your-frontend.onrender.com/
```

Then run only the read-only finance/GST audit:

```bash
cd backend
PHARMA_LIVE_API_BASE_URL="https://your-backend.onrender.com" \
PHARMA_LIVE_DATABASE_URL="postgresql://..." \
PHARMA_LIVE_ACCESS_TOKEN="short-lived-erp-access-token" \
PHARMA_LIVE_TEST_ORG_ID="dedicated-test-org-uuid" \
PHARMA_LIVE_TEST_BRANCH_ID="dedicated-test-branch-id" \
./venv/bin/pytest -q tests/live_erp/test_live_finance_gst_audit.py
```

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
