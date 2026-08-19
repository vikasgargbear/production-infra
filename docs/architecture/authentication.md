# Authentication Boundary

## Pilot Flow

Supabase Auth is the identity provider for email/password and Google PKCE
login. The browser persists and refreshes the Supabase session through
`@supabase/supabase-js`. It sends only the Supabase access token to
`POST /api/auth/oauth/supabase/session`; the ERP API verifies that token through
Supabase `/auth/v1/user` and never accepts a browser-supplied email or user ID.

The verified `auth.users.id` must match `master.org_users.auth_user_id`. The
exchange fails closed when the membership is absent, ambiguous, inactive, or
has a different normalized email. It then issues a one-hour ERP access token
containing the organization, branches, role, and permissions. Supabase
`SIGNED_IN` and `TOKEN_REFRESHED` events repeat the exchange, so ordinary users
remain signed in without a long-lived ERP refresh token.

The ERP token bridge is a pilot boundary, not the final identity model. It must
validate `iss`, `aud`, `sub`, `exp`, `iat`, `jti`, and `token_use=access` on
every protected path. Refresh-like tokens, unsigned organization headers,
default tenant fallbacks, and email-only account linking are prohibited.

## API Boundary

The former ERP password endpoints `POST /api/auth/login` and
`POST /api/auth/check-user` are retired. They had no frontend callers, exposed
an OAuth2 password-flow contract that production rejected, and queried a
`master.org_users.password_hash` column absent from the checked schema. Password
verification and recovery remain Supabase responsibilities.

The supported ERP authentication endpoints are:

- `POST /api/auth/oauth/supabase/session`: exchange a verified Supabase bearer
  token for a one-hour, tenant-scoped ERP token.
- `POST /api/auth/logout`: revoke the ERP token by `jti` and clear local state.
- `GET /api/auth/verify-token`: validate an ERP bearer token and its revocation
  state.

OpenAPI advertises HTTP Bearer authentication only. It must not contain an
OAuth2 password grant or a token URL pointing to the retired login endpoint.

## Target Data Model

The live schema baseline must be reviewed before migrations are authored. The
target separates these concepts:

- `user_accounts`: one immutable Supabase identity per human
- `organization_memberships`: many organization memberships per identity
- `membership_branches`: normalized branch grants per membership
- `organization_invitations`: hashed token, inviter, role, expiry, status
- `session_contexts`: explicit active organization and branch selection
- `mcp_grants`: client-specific, consented ERP capabilities

The checked-in `master.org_users` currently combines identity and membership,
uses a unique `auth_user_id`, and stores branch IDs as an array. That is usable
for a single-organization pilot but cannot represent one user belonging to
multiple organizations. Do not silently relax its uniqueness constraint or
auto-link by email.

## Operator Gates

1. Capture project `jfrairkkzxwkhbtqejnz` with the fail-closed read-only command
   in `docs/operations/supabase-live-schema-capture.md`; do not use CLI `db pull`
   or `db push`, and never commit or share operator credentials.
2. Reconcile the reviewed capture with the checked-in bootstrap before any
   identity or membership DDL.
3. Enable email confirmation and Google in Supabase. Google redirects to
   `https://jfrairkkzxwkhbtqejnz.supabase.co/auth/v1/callback`; Supabase redirects
   back to the exact Render frontend origin.
4. Link pilot identities to existing ERP memberships by immutable UUID only.
5. Verify sign-in, reload persistence, automatic refresh, sign-out, inactive
   membership denial, cross-tenant denial, and Google/email convergence.

For MCP, Supabase OAuth does not currently express the ERP capability names in
the API registry. Store consented capabilities in `mcp_grants` and authorize
each tool call against the active organization. Do not advertise an `/mcp`
transport until it is implemented and its OAuth/resource-server tests pass.
