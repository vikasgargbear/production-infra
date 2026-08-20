# Render MCP Service Contract

`aasopharma-mcp-pilot` is a separate Python 3.11 Docker service declared by
`render.yaml`. Auto-deploy is off. Render probes `/health` for process liveness;
`/ready` remains the separate release-readiness gate.

Use the six required variables in
`backend/mcp_runtime/service-contract.json`. The REST and MCP services share
only the independently generated internal service token, exact Supabase issuer,
and reviewed pre-registered client IDs. Never add the Supabase service-role key
to MCP.

Current stop-ship blockers:

1. Supabase DCR is disabled; hosted clients need reviewed pre-registration.
2. The fail-closed OAuth consent UI exists at `/oauth/consent`, but the locked
   frontend still has `@supabase/supabase-js` `2.57.4`. The official OAuth
   consent API is absent from that build. Install and lock exact version
   `2.112.3` through a reviewed Node dependency update, then run the hosted
   consent flow before setting the code-owned SDK verification gate.
3. The canonical schema and internal read endpoints are not deployment-verified.
4. MCP Inspector and real ChatGPT/Claude staging verification are incomplete.

`/ready` therefore returns `503`; a healthy `/health` response does not make the
service ready for operator use. Claude's
DCR-disabled path uses a pre-registered client and callback
`https://claude.ai/api/mcp/auth_callback`. ChatGPT rollout additionally requires
`offline_access`, admin/developer-mode review, and a frozen tool snapshot.

The consent client uses only the official SDK methods
`getAuthorizationDetails`, `approveAuthorization`, and `denyAuthorization`.
Approval and denial pass `skipBrowserRedirect: true`, validate the result, and
then follow Supabase's returned `redirect_url`; Supabase owns OAuth state, PKCE,
authorization codes, and CSRF validation. The adapter never substitutes raw
OAuth REST calls. With an older SDK it renders an unavailable state.

Render needs no new frontend secret. Keep the existing public
`REACT_APP_SUPABASE_URL` and `REACT_APP_SUPABASE_ANON_KEY`; the backend remains
the authority for `MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS`. The static-service
catch-all rewrite must continue serving `index.html` for `/oauth/consent`.

In Supabase Authentication configuration:

1. Set the Site URL to the exact Render frontend origin.
2. Set OAuth Server Authorization Path to `/oauth/consent`.
3. Add the exact frontend origin and `/oauth/consent` Google return URL to the
   allowed redirect URLs.
4. Keep dynamic client registration disabled and register ChatGPT/Claude
   clients and callbacks explicitly.
5. Confirm that each registered client name exactly matches
   `automation.agent_grants.client_display_name` and has one active reviewed
   grant for the signed-in subject.

Contract sources: [Supabase OAuth server setup](https://supabase.com/docs/guides/auth/oauth-server/getting-started),
[authorization details API](https://supabase.com/docs/reference/javascript/oauth-server-getauthorizationdetails),
and [supabase-js releases](https://github.com/supabase/supabase-js/releases).
