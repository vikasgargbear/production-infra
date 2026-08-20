# Render Internal Pilot

`render.yaml` is the active deployment Blueprint for the internal pilot. It
declares three manually deployed services:

- `aasopharma-api-pilot`: the existing FastAPI Docker image
- `aasopharma-erp-pilot`: the compiled React static site
- `aasopharma-mcp-pilot`: isolated MCP service contract, currently not ready

This is not the production-readiness claim. Render free services sleep, have
cold starts, and provide limited scaling controls. The Google Cloud Run template
remains the future bounded production option after schema, transaction, OAuth,
and MCP gates pass.

Automatic deploys are disabled in the Blueprint. Pilot revisions require an
explicit Blueprint sync/deploy after CI results and the current blocker report
have been reviewed.

## Backend

The API Docker service builds with context `backend/`, runs as a non-root user,
binds the platform `PORT`, and exposes `GET /health` for process liveness and
`GET /ready` for its database-backed Render health gate. REST lives under
`/api`. The isolated Python 3.11 MCP service uses `GET /health` as Render's
liveness check and keeps `GET /ready` as a stricter release gate. Do not
advertise it to ChatGPT or Claude while `/ready` reports the blockers documented
in `render-mcp.md`.

## Configuration

Set these public values in the Blueprint prompt or Render dashboard:

- Backend `CORS_ORIGINS`: the exact static-site origin, with no wildcard
- Backend `APP_URL`: the same exact static-site origin used in invitations
- Backend `SUPABASE_URL`: the project URL
- Backend `SUPABASE_ANON_KEY`: the Supabase publishable/anon key
- Frontend `REACT_APP_API_BASE_URL`: the exact backend origin, without `/api`
- Frontend `REACT_APP_SUPABASE_URL`: the same project URL as backend `SUPABASE_URL`
- Frontend `REACT_APP_SUPABASE_ANON_KEY`: the Supabase publishable/anon key
- `SMTP_HOST` and `SMTP_PORT` when email is enabled

Set these as secret values only in Render, never in Git, Blueprint values,
Docker build arguments, or frontend variables:

- `DATABASE_URL`
- `TAX_PROVIDER_DATABASE_URL`
- `TAX_PROVIDER_INTERNAL_SERVICE_TOKEN`
- `TAX_PROVIDER_INTERNAL_HMAC_SECRET`
- `JWT_SECRET_KEY`
- `SMTP_USER`
- `SMTP_PASSWORD`

`SUPABASE_URL` is not a credential, but the Blueprint keeps it operator-supplied
alongside the Supabase settings. Every `sync: false` entry intentionally requires
deployment-time input and contains no repository value.

`REACT_APP_SUPABASE_ANON_KEY` is intentionally public and still relies on
Supabase RLS. Never put the database URL, JWT signing key, or
any other secret in `REACT_APP_*`; Create React App embeds those variables in
browser JavaScript.

## Supabase Email And Google Auth

Both email/password and Google sign-in authenticate with Supabase in the
browser. The browser sends only the resulting Supabase bearer token to
`POST /api/auth/oauth/supabase/session`. The backend resolves that token through
Supabase, requires a confirmed email, and maps the immutable Supabase user ID to
`master.org_users.auth_user_id` before issuing an ERP tenant-scoped token. Do
not restore an email-only lookup or accept browser-provided identity fields.

Configure the two redirect layers separately:

- Supabase Authentication URL configuration: set the site URL to the exact
  Render frontend origin and allow that exact origin as a redirect URL.
- Supabase Google provider / Google Cloud OAuth client: set the authorized
  redirect URI to
  `https://<project-ref>.supabase.co/auth/v1/callback`.

For local development, allow `http://localhost:3000` in Supabase.
Do not use wildcard production redirects. Email confirmation and password-reset
redirects must also target an allowlisted frontend route before those workflows
are enabled for pilot users.

Before inviting a pilot user, verify through an approved read-only database
query that their `master.org_users.auth_user_id` equals their Supabase Auth user
ID, their normalized emails match, and both the ERP user and organization are
active. Existing email-only ERP users require an explicit reviewed linkage; the
login exchange intentionally does not auto-link or auto-provision accounts.

The service-role key is not used for interactive session verification. Keep it
backend-only for explicitly authorized administrative provisioning operations.

## Blueprint Review

From the repository root:

```bash
PYTHONPATH=backend backend/venv/bin/pytest -q \
  backend/tests/unit/test_deployment_contract.py

docker build -f backend/Dockerfile backend

cd frontend
npm run typecheck
npm run test:ci -- --runInBand
npm run build
```

Docker daemon availability is required only for the image build. The static
contract test checks the Dockerfile, Blueprint, secret placeholders, health
path, React publish directory, and SPA rewrite without contacting Render.

## Pilot Checks

After a manually approved Blueprint deployment:

```bash
curl --fail --silent --show-error https://your-backend.onrender.com/health
curl --fail --silent --show-error https://your-backend.onrender.com/ready
curl --fail --silent --show-error https://your-frontend.onrender.com/
```

Then perform authenticated tenant-scoped API reads with a short-lived pilot-user
token. Do not run the mutating `tests/live_erp` suite against a real organization.
The read-only finance/GST audit is the only existing live suite suitable for a
non-destructive pilot check.

When `/mcp` is eventually mounted, verify it on the backend origin. Until then,
a missing `/mcp` is expected and remains a release blocker, not a reason to add
a placeholder success route.
