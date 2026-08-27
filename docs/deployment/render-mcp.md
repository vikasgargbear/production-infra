# Render MCP service contract

`aasopharma-mcp-pilot` is the separate Python 3.11 Streamable HTTP service
declared by `render.yaml`. `backend/mcp_runtime/service-contract.json` owns its
mount path, exact tool inventory, OAuth contract, required environment, and
release gates. Do not duplicate those facts in deployment documentation.

## Runtime boundary

- `/health` proves only that the process is alive.
- `/ready` is the release gate and must expose the reviewed deployed SHA.
- `/mcp` is the authenticated public Streamable HTTP resource.
- The MCP service has no database URL or Supabase service-role key. It calls the
  API through its bounded internal token and forwards the authenticated subject.
- Customer-specific reads and every write require OAuth. Missing identity,
  organization context, grant, canonical API readiness, or readback fails closed.

The API and MCP share only the independently generated internal service token,
the exact OAuth issuer, and reviewed pre-registered client IDs. Do not copy ERP
JWT signing, database, tax-provider, storage, SMTP, or browser credentials into
the MCP environment.

## OAuth configuration

Configure the environment's Supabase OAuth server with:

1. the exact frontend site URL and `/oauth/consent` authorization path;
2. exact allowlisted frontend, Google-return, and OpenAI callback URLs;
3. `openid` and `offline_access` scopes;
4. reviewed client registration when dynamic registration is disabled;
5. a matching active `automation.agent_grants.client_display_name` and bounded
   capability set for the authenticated subject.

The frontend consent page uses the official Supabase OAuth SDK. If the installed
SDK cannot provide the required authorization methods, consent remains
unavailable; do not substitute raw OAuth calls or bypass PKCE/state validation.

## Release verification

Before adding the MCP URL to ChatGPT or Codex:

1. require the API, MCP, and frontend to expose the same reviewed SHA;
2. require both MCP health and readiness to pass;
3. inspect the public HTTPS `/mcp` endpoint with MCP Inspector;
4. verify protected-resource and OAuth discovery, authorization failure, token
   refresh, tool schemas, confirmation behavior, and canonical readbacks;
5. register the exact `/mcp` URL in ChatGPT developer mode and rerun the tool
   evaluation set in a new chat.

Never turn a failed probe into a placeholder success response or publish a tool
that is absent from the service contract.
