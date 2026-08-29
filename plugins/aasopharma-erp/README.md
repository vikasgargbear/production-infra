# AASOPharma ERP plugin

This package adds agent guidance to the existing canonical AASOPharma MCP
service. It does not contain a second API client, database connection, legacy
endpoint, or offline fallback.

## Developer connection

Complete the repository's
[ChatGPT predefined OAuth procedure](../../docs/deployment/chatgpt-mcp-oauth.md)
before creating the connection when the authorization server has neither CIMD
nor DCR. Never invent or commit a ChatGPT callback ID.

1. Deploy one reviewed SHA for the API, MCP, frontend, and canonical database.
2. Require both `/health` and `/ready` to pass on the public MCP origin.
3. In ChatGPT on the web, enable Developer mode under **Settings → Security and
   login**.
4. In the ChatGPT Plugins page, register the public HTTPS MCP URL including its
   `/mcp` path and complete OAuth with a disposable organization user.
5. Copy the generated technical ID from the connection URL. It starts with
   `plugin_asdk_app` (or the current `asdk_app` compatibility prefix).
6. Add `.app.json` with that real ID and add `"apps": "./.app.json"` to
   `.codex-plugin/plugin.json`:

   ```json
   {
     "apps": {
       "aasopharma-erp": {
         "id": "plugin_asdk_app_generated_by_chatgpt",
         "required": true
       }
     }
   }
   ```

Do not commit the example value or reuse another app's ID. The package remains
skills-only and fail-closed until ChatGPT creates the connection. After wiring
the ID, validate the package and test it in a new chat before trying the same
account on another ChatGPT surface.

## Acceptance

- The public MCP endpoint supports Streamable HTTP and OAuth discovery.
- The authenticated subject resolves exactly one active ERP organization and
  authorized branch context.
- Read tools return canonical UUIDs and authoritative records.
- Write requests use prepare → review → approve → execute and expose the command
  UUID; no direct or apparent-success write path is accepted.
- Reversible product create/setup tools share the browser's canonical setup
  contract and require explicit user confirmation. Consequential product
  activation requires a separate reviewed confirmation, calls the same
  canonical activation command as **Add product**, and is verified through
  exact setup readback before the product is treated as transaction-ready.
- Customer and supplier creates are generated from the browser/API canonical
  contracts, require one reviewed confirmation, and are verified with exact
  post-create readback. Missing optional facts remain explicit and required
  facts are never guessed or silently skipped.
- Cross-tenant, stale, duplicate, and unauthorized requests fail closed.
- No WhatsApp, email, SMS, or telephone action is sent by this plugin.

The runtime tool inventory remains owned by
`backend/mcp_runtime/service-contract.json`; do not copy it into this package.
