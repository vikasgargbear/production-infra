# AASOPharma ERP plugin

This package adds agent guidance to the existing canonical AASOPharma MCP
service. It does not contain a second API client, database connection, legacy
endpoint, or offline fallback.

## Codex desktop installation

The plugin packages the canonical Streamable HTTP endpoint, its public OAuth
client, the deterministic Codex loopback callback, and the ERP safety skill. It
contains no client secret or ERP credential. Install it from a terminal on the
same computer that runs the Codex desktop app:

```bash
codex plugin marketplace add vikasgargbear/production-infra --ref main
codex plugin add aasopharma-erp@aasopharma
codex mcp login aasopharma-erp
```

Complete sign-in in the system browser. Codex receives the authorization result
on a temporary `127.0.0.1` listener, stores the user token in its configured
credential store, and uses the authenticated user's ERP organization and branch
permissions. If the browser does not open or the callback is rejected, stop;
do not paste tokens into configuration files.

Restart Codex after first installation. Verify the connection with:

```bash
codex mcp get aasopharma-erp --json
codex mcp login aasopharma-erp
```

To receive a later plugin version:

```bash
codex plugin marketplace upgrade aasopharma
codex plugin remove aasopharma-erp@aasopharma
codex plugin add aasopharma-erp@aasopharma
```

The repository's exact OAuth authority and troubleshooting procedure is in
[Codex desktop MCP OAuth](../../docs/deployment/codex-desktop-mcp.md).

## ChatGPT availability boundary

Installing this plugin configures Codex on this computer. It does not install an
account-wide ChatGPT app and does not enable the connector on a phone. As of
2026-08-29, OpenAI lists custom MCP for Plus, Pro, Business, and Enterprise/Edu,
not Free or Go, and lists custom MCP apps as web-only. ChatGPT developer-mode
setup remains a separate procedure documented in
[ChatGPT MCP OAuth](../../docs/deployment/chatgpt-mcp-oauth.md).

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
