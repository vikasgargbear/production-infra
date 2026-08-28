# Canonical runtime security contract

Status: **reviewed, not applied**. These files do not connect to Supabase and
must not be applied before the deployable canonical baseline exists.

## Artifacts

- `generate_security_contract.py` loads all canonical domain catalogs, verifies
  the exact contract- and topology-declared table authority, and deterministically
  generates both artifacts.
- `policy-manifest.json` is the machine-readable handoff to the baseline
  generator. Its `catalog_sha256` covers the complete contract, topology, and
  ordered table definitions, not only table names.
- `baseline-platform-enforcements.json` is accepted directly by the baseline
  generator. It resolves exactly one RLS policy blocker per canonical table,
  one helper blocker,
  and four role/grant blockers. Requirement hashes come from the baseline
  generator itself and the manifest binds the mapping SHA-256 to the full
  catalog SHA-256. It deliberately leaves invariants, trigger plumbing,
  reference seeds, and deployment preflights blocked.
- The sibling `../platform/baseline-platform-enforcements.json` resolves the 12
  clean-environment preflights and two non-regulated bootstrap seed authorities.
  Both fragments compose through repeated baseline `--enforcement-map` flags.
- `canonical_rls.sql` owns schemas/tables, establishes runtime roles and grants,
  creates the session helpers, and creates every policy.
- `test_rls_negative.sql` is an executable disposable-database fixture. Run it
  only after the canonical baseline and `canonical_rls.sql`; it always rolls
  back its business fixtures.

Regenerate or check drift with:

```bash
python3 database/canonical/security/generate_security_contract.py
python3 database/canonical/security/generate_security_contract.py --check
```

The baseline still refuses deployment when this mapping is supplied on its own:

```bash
python3 backend/scripts/generate_canonical_baseline.py \
  --enforcement-map database/canonical/security/baseline-platform-enforcements.json
```

## Role boundary

`erp_migration_owner` is a `NOLOGIN BYPASSRLS` owner. PostgreSQL requires a
policy-internal lookup of `core.memberships` to bypass that table's forced RLS,
otherwise the membership policy recursively invokes itself. The bypass is
contained in static, `SECURITY DEFINER` functions with fixed qualified queries,
an empty effective search path, no dynamic SQL, and revoked `PUBLIC` execute.
The arbitrary-pair membership helper is private even to `erp_app`.

`erp_app` is a `NOLOGIN NOBYPASSRLS` privilege role. `erp_runtime` is a
`LOGIN NOBYPASSRLS` member of `erp_app`; it owns no schema, table, sequence, or
function and is never a member of the migration owner. Set its SCRAM password
and network allowlist outside source control. Do not substitute a Supabase
service role or grant `BYPASSRLS` to either runtime role.

## Request context

Every application transaction activates a transaction-local context using the
verified Supabase Auth UUID and requested organization. The helper resolves the
canonical profile and membership; callers never supply a membership ID:

```sql
BEGIN;
SELECT erp_security.activate_context(
    :verified_supabase_auth_user_id,
    :requested_organization_id
);
-- application statements
COMMIT;
```

Missing, blank, disabled, revoked, suspended, ambiguous, or cross-organization
identity bindings raise an authorization error before context activation. A
successful activation transaction-locally records the verified Auth UUID,
canonical user, resolved membership, and organization. The custom settings are
not credentials: a caller with direct SQL access could set them. Consequently
`erp_runtime` credentials belong only to the trusted backend process, never to
browsers, mobile clients, plugins, agents, the isolated MCP service, or PostgREST
clients. Pool check-in must roll back any open transaction and reset session
state; persistent `SET` is prohibited.

Active membership gives read visibility to unscoped rows in its organization.
Rows carrying `branch_id` additionally require an active organization-wide or
matching branch access grant. `core.branches.id` is treated as its branch scope.
Writes require the table's reviewed permission through relational active
`access_grants -> roles -> role_permissions`; branch-only permissions cannot
write organization-scoped rows.

`core.organizations` exposes only the current active organization.
`core.users` exposes profiles sharing the current actor's organization,
including retained former-member evidence. Global references are runtime
`SELECT` only. Organization provisioning and recovery of suspended tenants are
bounded migration/operations transactions, not runtime RLS exceptions.

There are no canonical sequences: every generated identifier is UUID and each
controlled vocabulary uses a natural code. Accordingly there is no runtime
`USAGE` or `SELECT` grant on sequences. Introducing `serial`, identity, or
`nextval` makes the security generation test fail until its grant is reviewed.

RLS answers who may attempt a command; it does not replace history rules. For
stateless facts whose reviewed invariant unconditionally rejects UPDATE and
DELETE, the manifest emits only SELECT/INSERT policies and grants. Stateful
documents and authority artifacts retain UPDATE for reviewed transitions but
never receive DELETE. The same no-DELETE rule applies to every table whose
retention contract forbids hard deletion. The only DELETE exceptions are
`core.role_permissions`, a replaceable authorization link, and
`inventory.stock_balances`, a rebuildable projection; both are explicitly
marked `hard_delete: true` in the catalog. Organization creation remains an
owner-only atomic bootstrap, so runtime receives SELECT/UPDATE only on
`core.organizations`. The baseline remains non-deployable until the independent
`trigger_plumbing:immutability` blocker and every table invariant are resolved.

The PostgreSQL fixture is a required future clean-database CI gate on server
major 15. It must never target the live Supabase project. Local static and
baseline-generator integration tests do not substitute for that execution.
