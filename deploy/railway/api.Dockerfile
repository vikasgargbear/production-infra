FROM python:3.11-slim AS migration-contract

WORKDIR /review

# Validate the immutable migration package from only its reviewed inputs.  This
# stage is deliberately separate from the runtime filesystem so tests, local
# tools, and release-only scripts cannot leak into the API image.
COPY backend/alembic ./backend/alembic
COPY backend/migration_support ./backend/migration_support
COPY backend/scripts/canonical_migration_contract.py ./backend/scripts/canonical_migration_contract.py
COPY backend/scripts/package_canonical_baseline_migration.py ./backend/scripts/package_canonical_baseline_migration.py
COPY database/schema-authority.json ./database/schema-authority.json
COPY database/canonical/domains/_contract.json ./database/canonical/domains/_contract.json

RUN python backend/scripts/canonical_migration_contract.py --print-head \
    && python backend/scripts/package_canonical_baseline_migration.py --verify-package \
    && touch /review/.canonical-migration-contract-verified


FROM python:3.11-slim AS runtime

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080

RUN apt-get update && apt-get install -y --no-install-recommends gcc \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Runtime contains the API plus the narrowly enumerated Live18 database-phase
# harness used by production-readiness through `railway ssh`.  Ordinary unit
# tests, development tools, repository documentation, and the MCP transport are
# deliberately not image inputs. The two files below are the shared canonical
# operator-action contract imported by the REST API; they contain no transport.
COPY backend/app ./app
COPY backend/mcp_runtime/aasopharma_mcp/__init__.py ./mcp_runtime/aasopharma_mcp/__init__.py
COPY backend/mcp_runtime/aasopharma_mcp/operator_actions.py ./mcp_runtime/aasopharma_mcp/operator_actions.py
COPY backend/alembic.ini ./alembic.ini
COPY backend/alembic ./alembic
COPY backend/migration_support ./migration_support
COPY backend/scripts/apply_reviewed_historical_inventory.py ./scripts/apply_reviewed_historical_inventory.py
COPY backend/scripts/canonical_data_reset_authority.py ./scripts/canonical_data_reset_authority.py
COPY backend/scripts/canonical_demo_ids.py ./scripts/canonical_demo_ids.py
COPY backend/scripts/canonical_migration_contract.py ./scripts/canonical_migration_contract.py
COPY backend/scripts/canonical_staging_database.py ./scripts/canonical_staging_database.py
COPY backend/scripts/cleanup_staging_evidence_storage.py ./scripts/cleanup_staging_evidence_storage.py
COPY backend/scripts/compile_live18_browser_fixture.py ./scripts/compile_live18_browser_fixture.py
COPY backend/scripts/deployment_control.py ./scripts/deployment_control.py
COPY backend/scripts/exercise_staging_mcp_oauth.py ./scripts/exercise_staging_mcp_oauth.py
COPY backend/scripts/live18_evidence_contract.py ./scripts/live18_evidence_contract.py
COPY backend/scripts/live18_railway_database_phase.py ./scripts/live18_railway_database_phase.py
COPY backend/scripts/manage_canonical_write_fence.py ./scripts/manage_canonical_write_fence.py
COPY backend/scripts/provision_canonical_demo.py ./scripts/provision_canonical_demo.py
COPY backend/scripts/provision_ephemeral_browser_identities.py ./scripts/provision_ephemeral_browser_identities.py
COPY backend/scripts/provision_ephemeral_canonical_live.py ./scripts/provision_ephemeral_canonical_live.py
COPY backend/scripts/provision_staging_mcp_oauth.py ./scripts/provision_staging_mcp_oauth.py
COPY backend/scripts/railway_canonical_reset.py ./scripts/railway_canonical_reset.py
COPY backend/scripts/railway_reset_control_plane.py ./scripts/railway_reset_control_plane.py
COPY backend/scripts/supabase_auth_admin.py ./scripts/supabase_auth_admin.py
COPY backend/tests/live_acceptance ./tests/live_acceptance
COPY backend/tests/live_canonical ./tests/live_canonical
COPY docs/architecture/mcp-operator-actions.json ./docs/architecture/mcp-operator-actions.json
COPY database/schema-authority.json ./database/schema-authority.json
COPY database/canonical/domains/_contract.json ./database/canonical/domains/_contract.json
COPY deploy/control-plane/canonical-staging.json ./deploy/control-plane/canonical-staging.json
COPY deploy/control-plane/control-plane-v1.schema.json ./deploy/control-plane/control-plane-v1.schema.json
COPY --from=migration-contract /review/.canonical-migration-contract-verified /tmp/.canonical-migration-contract-verified
COPY deploy/railway/api.force-deploy /app/.railway-deployment-provenance

RUN test -f /tmp/.canonical-migration-contract-verified \
    && rm /tmp/.canonical-migration-contract-verified \
    && test -f /app/alembic.ini \
    && python -c "from mcp_runtime.aasopharma_mcp.operator_actions import PREPARE_ACTIONS; assert PREPARE_ACTIONS" \
    && python scripts/railway_reset_control_plane.py --help >/dev/null

RUN useradd --create-home --shell /usr/sbin/nologin appuser \
    && chown -R appuser:appuser /app

USER appuser

EXPOSE 8080

CMD ["sh", "-c", "exec python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1 --timeout-graceful-shutdown 30"]
