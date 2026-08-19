# Google Cloud Run and Cloudflare Pages

This is the future production deployment shape for the portable FastAPI
container and React build. The active internal pilot uses the Render Blueprint
documented in `docs/deployment/render-pilot.md`. Repository readiness gates must
pass before promotion from the pilot.

## Backend Shape

- Google Cloud Run region: `asia-south1` (Mumbai)
- Image context: `backend/`
- Container port: platform-provided `PORT`, default `8080`
- Scaling: minimum `0`, maximum `3`
- Per-instance concurrency: `20`
- Request timeout: `300` seconds for normal REST and MCP tool requests
- CPU/memory: `1` vCPU and `1Gi`
- Process health: unauthenticated `GET /health`
- REST base: `/api`
- MCP transport: `/mcp` on the same Cloud Run origin

The bounds are intentionally conservative. Each application instance can open
up to 30 SQLAlchemy connections, so increasing `maxScale` can exhaust the
Supabase connection limit. Recalculate database capacity before changing either
autoscaling or concurrency.

`minScale=0` means both REST and MCP have cold starts. The intended MCP
transport is Streamable HTTP with JSON responses and stateless request
handling, so it needs no session affinity or separate MCP health endpoint. MCP
handlers must not depend on background work while CPU is throttled and must
tolerate reconnects. Do not put `/mcp` behind Cloudflare Pages; clients connect
directly to the Cloud Run service.

## Secrets and Identity

Use a dedicated runtime service account with only:

- Secret Manager Secret Accessor on the named runtime secrets
- Artifact Registry read access for the backend repository
- logging and monitoring permissions required by Cloud Run

The service template references Secret Manager for database, JWT, Supabase, and
SMTP credentials. Never place secret values in the YAML, Docker build arguments,
Cloud Build substitutions, React variables, or repository files. Grant each
secret to the runtime service account explicitly.

`CORS_ORIGINS` and `REACT_APP_API_BASE_URL` are public configuration, not
secrets. Set CORS to the exact production Pages/custom-domain origin because the
application sends credentials. Do not use `*`.

## Build and Review

Create an immutable image tag from the reviewed commit:

```bash
PROJECT_ID="your-gcp-project"
TAG="$(git rev-parse HEAD)"
IMAGE="asia-south1-docker.pkg.dev/${PROJECT_ID}/aasopharma/backend:${TAG}"

gcloud builds submit backend --tag "${IMAGE}"
```

Before applying `deploy/cloud-run/service.template.yaml`, replace only the
project ID, immutable image tag, service-account project, and exact frontend
origin. Review the rendered file and confirm every credential uses
`secretKeyRef`. Apply in Mumbai explicitly:

```bash
gcloud run services replace /path/to/rendered-service.yaml \
  --region asia-south1 \
  --project "$PROJECT_ID"
```

IAM policy is managed separately. Browser and MCP access require a public Cloud
Run ingress endpoint, while application JWT/OAuth authorization remains
mandatory. Do not grant unauthenticated access until authentication, tenant
isolation, schema, and transaction-readiness gates pass.

## Cloudflare Pages

Connect the repository to Pages with:

- Root directory: `frontend`
- Build command: `npm ci && npm run typecheck && npm run test:ci -- --runInBand && npm run build`
- Build output: `build`
- Node version: `20`
- Production variable: `REACT_APP_API_BASE_URL=https://your-cloud-run-origin`

No secret belongs in a `REACT_APP_*` variable; Create React App embeds these in
the browser bundle. `frontend/public/_redirects` provides the SPA fallback.

## Release Checks

```bash
PYTHONPATH=backend backend/venv/bin/pytest -q \
  backend/tests/unit/test_deployment_contract.py

docker build -f backend/Dockerfile backend

cd frontend
npm ci
npm run typecheck
npm run test:ci -- --runInBand
npm run build
```

After deployment, verify without credentials in command history:

```bash
curl --fail --silent --show-error "https://your-cloud-run-origin/health"
curl --fail --silent --show-error -X POST "https://your-cloud-run-origin/mcp" \
  -H "Authorization: Bearer ${SHORT_LIVED_TOKEN}" \
  -H "Content-Type: application/json" \
  --data @mcp-initialize-request.json
```

The `/mcp` check must fail release if the transport is absent. A successful
`/health` response alone does not prove database, tenant, calculation, or MCP
readiness.

The concrete MCP mount is currently dependency-gated: the official SDK requires
Python and package versions newer than several repository pins, and remote
ChatGPT/Claude access requires a real OAuth authorization server. Do not expose
`/mcp` publicly until those dependency and OAuth gates are implemented and
tested; Cloud Run configuration cannot substitute for them.
