# Frontend documentation

The frontend documentation describes maintained code and test boundaries. It
is not an end-user help center and must not advertise screens, contacts, or
workflows that are not verified in the deployed product.

## Maintained references

- [Canonical API integration](05-api-integration/README.md)
- [Cloud-session security](08-security/README.md)
- [Frontend architecture](../../docs/frontend/README.md)
- [UI design standards](../../docs/guides/ui-design-standards.md)
- [Testing](../../docs/guides/testing.md)
- [Deployment](../../docs/deployment/production.md)

Core transaction ownership is defined outside this directory in
[`docs/architecture/core-operation-authority-matrix.json`](../../docs/architecture/core-operation-authority-matrix.json).
Browser acceptance is defined in `frontend/e2e/` and
`backend/tests/live_acceptance/operation_matrix.json`.

Confirm every selector, route, identifier, and state against current source and
executable contracts before changing product code. Historical module snapshots,
invented shortcut plans, and copied framework guides are intentionally absent.
