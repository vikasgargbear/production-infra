# CI and release lanes

The repository has three deliberately separate lanes.

## Pull request confidence

`production-readiness.yml` classifies the PR diff and runs only the affected
backend, frontend, MCP, dependency, and PostgreSQL lanes. Superseded runs for
the same PR are cancelled. `PR readiness` is the stable required check and
passes only when every selected lane passed; an intentionally skipped lane is
not treated as missing evidence.

The intentionally red production-promotion evidence gate is not a PR test. It
runs only during an explicit release certification.

## Manual pilot delivery

`railway-pilot-fast-deploy.yml` runs after a main update and uploads only the
API, MCP, or frontend whose runtime content changed. Independent services build
in parallel. This workflow never resets data, runs migrations, or changes the
database/session/write fence. Database and control-plane diffs fail closed to
the release lane instead of partially updating the pilot.

The pilot uses the `canonical-staging` GitHub environment and remains the place
for persistent manual test organizations and browser testing.

Database changes for that persistent pilot use the separate, manually
dispatched `railway-pilot-in-place-migration.yml` lane. It requires an exact
reviewed SHA and typed confirmation, validates the current revision against the
linear canonical history, captures a pre-change schema artifact, runs Alembic
twice to prove idempotency, removes temporary migration authority, and verifies
the exact new revision and runtime grants. It does not recreate the database,
clear tenant records, seed organizations, or deploy services.

The frontend container performs only the production bundle build. Typecheck,
lint, unit tests, and browser tests run against the same immutable source in PR
and release CI and are not duplicated inside Railway's image builder.

## Release certification

`production-readiness.yml` is manually dispatched with
`release_certification=true`, `run_live18=true`, and an immutable reviewed SHA.
All static lanes and Live18 run here. The Railway workflow reuses already-active
deployments when all three services publish that exact SHA; otherwise it builds
the exact release source.

Live18 uses the `canonical-certification` GitHub environment. It must point to
a separate Railway environment and a separate disposable Supabase project. Do
not copy `canonical-staging` Railway service IDs, public URLs, Supabase project
reference, database password, or role passwords into it.

The certification environment must define the same variable and secret names
as `canonical-staging`, but with certification-only values. At minimum this
includes the Railway project/environment/service names and URLs, Supabase URL,
issuer, project reference, test Auth user, database and isolated-role
credentials, OAuth keys, MCP internal token, and tax-provider internal keys.
The production project denylist remains shared.

Release runs are serialized and are not cancellation-interrupted because their
failure compensation must always restore temporary identities and database
authority. Live18 is not part of ordinary PR or pilot delivery.
