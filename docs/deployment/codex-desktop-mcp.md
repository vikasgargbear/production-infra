# Codex desktop AASOPharma MCP

This is the supported manual desktop route for users who cannot install a
custom MCP app in ChatGPT. It configures one computer; it is not an account-wide
ChatGPT installation and it does not enable the connector in the ChatGPT mobile
app.

## Reviewed public contract

- MCP URL and discovered OAuth resource:
  `https://aasopharma-mcp-pilot-production.up.railway.app/mcp`
- OAuth client ID: `830faf90-83da-4221-90c8-bb533cc2ed21`
- OAuth client type: public
- Token endpoint authentication: `none`
- PKCE: S256
- Registered Codex callback:
  `http://127.0.0.1/callback/T0CM3qq1LGS-`
- Default tool approval mode: prompt for writes

The client ID and loopback URI are public identifiers, not secrets. Never add a
client secret. Codex derives the callback suffix from the exact MCP resource URL.
For a portless `127.0.0.1` callback, Codex inserts the active local listener port
during authorization. Supabase must accept that variable loopback port while
matching the host and path exactly.

## Authority prerequisite

Before distributing or testing the plugin, run the bounded
`Register ChatGPT and Codex MCP OAuth callbacks` workflow from the exact reviewed
commit. Its receipt must show both reviewed callbacks on the existing public
client. The workflow changes OAuth client authority only; it does not deploy,
create users, bind ERP grants, or access business data.

Also require all of the following:

- public `/health` returns `200` and the expected deployed SHA;
- public `/ready` returns `200`;
- protected-resource and authorization-server discovery return `200`;
- unauthenticated `/mcp` returns the expected `401` OAuth challenge;
- the API and MCP allowlists contain the receipt's exact public client ID.

Stop if any prerequisite is not green.

## Install

Install the current Codex desktop app or Codex CLI and sign in with ChatGPT.
Then run:

```bash
codex plugin marketplace add vikasgargbear/production-infra --ref main
codex plugin add aasopharma-erp@aasopharma
codex mcp login aasopharma-erp
```

Complete Google sign-in in the system browser. The browser returns to the local
Codex callback; it is not an embedded OAuth WebView. Restart Codex after the
first installation, open a new chat, and ask for a read-only ERP search before
trying a write.

## Verify without exposing credentials

```bash
codex mcp get aasopharma-erp --json
codex mcp list --json
```

The server must show Streamable HTTP, the exact Railway `/mcp` URL, and enabled
state. OAuth discovery must identify the same URL as the protected resource. Do
not print or copy the credential store.
Verify one tenant-safe read, then prepare one reversible write and cancel before
execution. A real write must still follow prepare, review, explicit approval,
execute, and canonical readback.

## Update or remove

Plugin changes are not silently applied. Refresh the marketplace snapshot and
reinstall the plugin:

```bash
codex plugin marketplace upgrade aasopharma
codex plugin remove aasopharma-erp@aasopharma
codex plugin add aasopharma-erp@aasopharma
```

Reauthenticate only when prompted or after an intentional logout/revocation:

```bash
codex mcp login aasopharma-erp
```

To remove it completely:

```bash
codex plugin remove aasopharma-erp@aasopharma
codex mcp logout aasopharma-erp
```

## Current product limits

As of 2026-08-29, ChatGPT Free includes limited Codex access for quick coding
tasks, but OpenAI does not publish one fixed message quota. ChatGPT's plan table
does not list custom MCP for Free or Go, and OpenAI documents custom MCP apps as
web-only. Do not promise that this desktop workaround enables ChatGPT mobile or
that its free usage allowance will be sufficient for routine pharmacy work.

Official references:

- <https://learn.chatgpt.com/docs/pricing>
- <https://learn.chatgpt.com/docs/extend/mcp>
- <https://help.openai.com/en/articles/11487775-connectors-in>
- <https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt>
