# Render Deployment

This repo includes a Render Blueprint at the repository root: `render.yaml`.

## What It Deploys

- Backend service: `production-infra-backend`
- Runtime: Docker
- Dockerfile: `backend/Dockerfile`
- Docker context: `backend`
- Health check: `/health`
- Region: `singapore`
- Plan: `free`

The database remains Supabase/Postgres. Do not create a separate Render Postgres database unless you are intentionally migrating data.

## Required Secret Values

Render prompts for these because they are marked `sync: false` in `render.yaml`:

- `DATABASE_URL`
- `JWT_SECRET_KEY`
- `SECRET_KEY`
- `CORS_ORIGINS`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASSWORD`

Production safeguards are set directly in the blueprint:

- `APP_ENV=production`
- `ENV=production`
- `DEBUG=false`
- `PORT=10000`

Do not set `TEST_MODE` on Render. The backend is designed to fail closed if test mode is enabled in production.

## Deploy Steps

1. Push the branch containing `render.yaml`.
2. In Render, create a new Blueprint from the GitHub repository.
3. Select the branch you want Render to deploy.
4. Fill the prompted secret values.
5. Wait for deploy success.
6. Open the generated `https://*.onrender.com` URL and verify `/health`.
7. Add the Render backend URL to the frontend API configuration.
8. Set `CORS_ORIGINS` to the actual frontend origin.
9. Run the live ERP verification suite against the Render URL.

## Post-Deploy Verification

From `backend/`:

```bash
PHARMA_LIVE_API_BASE_URL="https://your-render-service.onrender.com" \
PHARMA_LIVE_DATABASE_URL="postgresql://..." \
PHARMA_LIVE_JWT_SECRET_KEY="..." \
PHARMA_LIVE_TEST_ORG_ID="e78d6777-35f6-4b19-994f-caaede2f021a" \
PHARMA_LIVE_TEST_USER_ID="8" \
PHARMA_LIVE_TEST_BRANCH_ID="5" \
PHARMA_LIVE_TEST_EMAIL="aasopharmaceuticals@gmail.com" \
./venv/bin/python -m pytest tests/live_erp -q
```

Expected current result:

```text
26 passed, 1 skipped
```

## Free Plan Caveat

Render free services are useful for staging or preview. They should not be treated as final production infrastructure for real users because free instances have platform limitations such as sleeping and resource constraints.
