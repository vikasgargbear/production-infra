# Authentication and tenant boundary

Supabase Auth supplies the external user identity. The ERP API verifies the
provider access token server-side and resolves that immutable subject through
canonical `core.users`, `core.memberships`, `core.access_grants`, `core.roles`,
`core.role_permissions`, and `core.permissions`.

The browser never chooses its authoritative organization, branch, role,
permission, actor, or approver. Organization and branch headers select only
among grants already proven for the verified identity. Missing, disabled,
ambiguous, or cross-tenant membership resolution fails before a business
query.

## Supported browser flow

1. The browser completes email/password or Google PKCE with the configured
   identity provider.
2. It sends the provider access token to the canonical ERP session exchange.
3. The API verifies issuer, audience, subject, expiry, and token type.
4. The API resolves one active canonical user and membership, then activates
   tenant context inside the request transaction.
5. Business routes use the non-owner runtime role under forced RLS.

ERP credentials and refresh tokens are not stored in `localStorage`,
IndexedDB, an offline queue, or a compatibility database. Failed identity or
tenant resolution cannot create a local session or fall back to a retired
schema.

## Hosted MCP consent

Standard identity scopes identify the human session. Canonical agent grants
and grant capabilities authorize individual ERP operations. Consent must show
the exact registered client and resolved canonical organization/branch
context. Approval is revalidated immediately before provider consent; there is
no auto-consent, dynamic registration, first-membership fallback, or browser
service credential.

## Acceptance evidence

For an exact deployed SHA, test sign-in, reload and token refresh, sign-out,
inactive membership denial, multiple-organization selection, branch denial,
cross-tenant denial, and browser/API/MCP identity equality. Identity readiness
is not inferred from a provider login alone: the canonical user, membership,
access grants, runtime context, and forced-RLS checks must all pass.
