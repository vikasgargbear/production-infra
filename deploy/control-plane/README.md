# Deployment control plane

`canonical-staging.json` is the checked-in authority for the disposable
canonical environment: Supabase project identity, the sole active Render
services, retired Railway services, configuration names, and phase ordering.
It never contains secret values.

The database contract is also authoritative: certification uses the exact
`db.<project-ref>.supabase.co:5432` direct IPv4 endpoint with plain PostgreSQL
role names. Shared Supavisor fallback is explicitly prohibited. The helper in
`backend/scripts/canonical_staging_database.py` builds redacted-safe DSNs and
verifies caller-side IPv4 DNS resolution plus role and RLS posture.

Use one entrypoint for deployment diagnosis:

```bash
python backend/scripts/deployment_control.py validate
python backend/scripts/deployment_control.py preflight \
  --expected-sha "$(git rev-parse HEAD)" \
  --repository vikasgargbear/production-infra
python backend/scripts/deployment_control.py status \
  --expected-sha "$(git rev-parse HEAD)" \
  --fence open
```

The command emits `aasopharma.deployment-diagnostic.v1` JSON. A failure names
the phase, stable error code, exact subject, retryability, and next action. It
does not print configuration values, contact provider mutation APIs, deploy,
or change the canonical write fence.

Provider mutation remains in the existing reviewed scripts while they are
incrementally moved behind this authority. Both mutation workflows run the
preflight before their first provider or database change.
