# ChatGPT developer-mode MCP OAuth

Use a predefined public OAuth client while Supabase dynamic client registration
and Client ID Metadata Documents are unavailable. The client uses authorization
code plus PKCE S256, has no client secret, and is valid only for the reviewed
ChatGPT and Codex desktop redirect URIs.

## Prerequisites

Before changing OAuth authority, verify that the public deployment is one exact
reviewed SHA and that all of these checks are green:

- MCP `/health` and `/ready`;
- `/.well-known/oauth-protected-resource` for the canonical `/mcp` resource;
- Supabase OAuth discovery with `code_challenge_methods_supported` containing
  `S256`;
- authorization and token requests preserve the canonical MCP `resource`
  parameter, and issued tokens use that value as their audience;
- unauthenticated `/mcp` returns `401` with its protected-resource challenge.

Do not create a ChatGPT connection if any check fails.

## Register the exact callback

1. In ChatGPT on the web, enable Developer mode under **Settings → Security and
   login**.
2. Open the ChatGPT Plugins app-management page, add the public MCP URL including
   `/mcp`, and choose predefined/static OAuth client registration.
3. Confirm that the production redirect URI displayed by that page is the
   currently reviewed exact value
   `https://chatgpt.com/connector/oauth/_MPTGhIZ1AcM`. Do not type a callback ID
   from memory and do not use the `{callback_id}` placeholder. A different
   syntactically valid callback requires a reviewed repository change.
4. In a reviewed administrative environment, set the existing provisioning
   inputs plus:

   ```bash
   export CHATGPT_MCP_OAUTH_CALLBACK_URI='https://chatgpt.com/connector/oauth/_MPTGhIZ1AcM'
   export CODEX_DESKTOP_MCP_OAUTH_CALLBACK_URI='http://127.0.0.1/callback/T0CM3qq1LGS-'
   export REVIEWED_SHA='the-exact-40-character-deployed-sha'
   export GITHUB_ENV='an-empty-temporary-output-file'
   export CANONICAL_DEMO_EVIDENCE_DIR='an-empty-evidence-directory'
   python3 backend/scripts/provision_staging_mcp_oauth.py \
     --mode chatgpt-client-authority-only
   ```

   The existing required inputs are `CANONICAL_STAGING_PROJECT_REF`,
   `SUPABASE_URL`, and `SUPABASE_ACCESS_TOKEN`. The mode rejects a missing,
   placeholder, non-HTTPS, non-ChatGPT, query-bearing, or fragment-bearing
   callback before contacting Supabase. It also requires the exact deterministic
   Codex desktop loopback callback and preserves both callbacks on the reviewed
   public client. It does not create an Auth user, bind an ERP grant, access the
   database, or generate a client secret.

   After this workflow has been merged to the default branch, the same bounded
   operation is available under **Actions → Register ChatGPT and Codex MCP OAuth
   callbacks → Run workflow**. Select the exact branch/commit to provision and
   enter `REGISTER_CHATGPT_STATIC_OAUTH_CLIENT`. The workflow uses that selected
   commit as `REVIEWED_SHA`, the existing `SUPABASE_ACCESS_TOKEN` repository
   secret, the pinned callbacks above, and runner-temporary environment/evidence
   files. It has `contents: read` permission, calls only
   `--mode chatgpt-client-authority-only`, uploads a seven-day secret-free
   receipt containing both callbacks, and has no database, user/grant, Railway,
   or deployment authority.
5. Review `canonical-staging-oauth-client.json`. Copy its `client_id` into the
   ChatGPT predefined-client field, select token endpoint authentication method
   `none`, and leave the client secret empty. Confirm that the evidence contains
   both callbacks and the reviewed SHA.
6. Promote the returned client ID to both API and MCP
   `MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS` through the normal reviewed deployment
   workflow. Do not replace any separately reviewed client IDs in a multi-client
   allowlist.
7. Finish the connection in ChatGPT, authenticate as a real organization user,
   review the requested capabilities, and then test in a new chat.

The callback may be the stable
`https://chatgpt.com/connector_platform_oauth_redirect` or a callback-ID-specific
`https://chatgpt.com/connector/oauth/<real-id>`. The app-management page is the
authority for which exact value applies. The stable callback is valid only when
the authorization server satisfies issuer-identification requirements and the
page actually displays it.

## Acceptance

Run MCP Inspector first, then repeat through ChatGPT:

- OAuth discovery and protected-resource discovery;
- authorization code exchange with PKCE S256 and the exact resource/audience;
- refresh, reauthorization, logout, and revoked-token failure;
- tool inventory, schemas, annotations, and confirmation prompts;
- one tenant-safe read and one prepared write that is cancelled before execute;
- wrong audience, unknown client, missing grant, cross-tenant identifier, stale
  command, and malformed input failures.

Never expose access tokens, refresh tokens, the Supabase management token, or
authorization codes in evidence or logs.
