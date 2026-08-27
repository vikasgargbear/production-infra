# Frontend security boundary

The browser authenticates through the configured Supabase provider and
exchanges the verified cloud identity for a short-lived ERP session. Tenant and
branch authority come from canonical server-side membership, never browser
input.

The frontend must not:

- store ERP access or refresh tokens in localStorage or IndexedDB;
- restore offline credentials or queued business writes;
- expose database, service-role, JWT-signing, SMTP, or provider secrets;
- infer permissions from visible controls; or
- report success before the canonical API confirms it.

Security-sensitive changes require the auth contract tests, frontend tests,
typecheck, production build, and live exact-SHA session verification.
