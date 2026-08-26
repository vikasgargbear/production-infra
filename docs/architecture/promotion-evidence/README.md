# Canonical application promotion evidence

The checked-in `canonical-application-promotion-evidence.json` remains
incomplete until a reviewer commits completed copies of the three templates in
this directory and the exact deployed commit passes the dedicated
`Canonical application promotion evidence` workflow.

The workflow is read-only against the disposable canonical staging project. It
does not query the retired project, deploy services, change readiness fields, or
write business data. It proves one common project and commit binding across:

- the effective mounted FastAPI route graph and its reachable local import
  graph;
- one exact successful Render or Railway deployment artifact and the scrubbed exact-run
  Live18 evidence for all 18 browser, REST, MCP, RLS, and PostgreSQL paths;
- the deployed Alembic revision, runtime role posture, every tenant table's
  forced-RLS catalog state, a same-tenant read, and a cross-tenant denial;
- exact row counts and exact PostgreSQL `NUMERIC` sums before and after a
  logical backup restore into PostgreSQL 15; and
- reviewed reset, rollback, and retired-project decommission inputs.

The workflow uploads a candidate manifest and its hashable artifacts. It does
not upload the raw logical dump and does not modify the repository. The
reconciliation artifact retains the dump hash and size after the PostgreSQL 15
restore succeeds. Promotion still requires a separate review commit
that places the artifacts at the manifest paths, updates the manifest hash in
`app-data-contract.json`, and then runs both application-contract gates. Any
draft input, stale deployment, incomplete Live18 run, wrong project, mixed commit, missing tenant,
RLS gap, restore difference, or altered artifact stops the workflow.

The source-disposition review must reference the exact
`canonical-staging-reset.json` emitted by the successful canonical-staging run.
That receipt is created only after the workflow proves that Supabase Auth was
preserved, the Alembic marker was removed, and the canonical schemas were
absent. The promotion collector verifies both the receipt bytes and the
reviewed run URL/timestamp before embedding it into the immutable evidence.

Backup reconciliation hashes every complete canonical row as canonical JSONB
text with explicit length framing and deterministic PostgreSQL session
settings. Row counts and exact `NUMERIC` sums remain useful diagnostics, but
they are not sufficient on their own: UUID, text, timestamp, JSON, array, and
binary changes also fail the restore proof.

Until this workflow is present on the repository default branch, invoke it only
through the already-registered `Production readiness` workflow with
`capture_canonical_promotion_evidence=true`. The caller delegates to the same
reusable workflow; it does not duplicate its evidence logic.

The retired project reference may appear only as the target of the reviewed
decommission plan. It is never an evidence source or database connection.
