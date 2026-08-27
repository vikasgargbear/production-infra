# Frontend documentation

The frontend documentation describes maintained code and test boundaries. It
is not an end-user help center and must not advertise screens, contacts, or
workflows that are not verified in the deployed product.

## Maintained references

- [Architecture](02-architecture/README.md)
- [Components](03-components/README.md)
- [State management](04-state-management/README.md)
- [Canonical API integration](05-api-integration/README.md)
- [Engineering conventions](06-guides/README.md)
- [Testing](07-testing/README.md)
- [Security](08-security/README.md)
- [Deployment](09-deployment/README.md)
- [Accessibility](10-accessibility/README.md)
- [Design system](design-system.md)
- [Keyboard behavior](KEYBOARD_SHORTCUTS.md)

Core transaction ownership is defined outside this directory in
[`docs/architecture/core-operation-authority-matrix.json`](../../docs/architecture/core-operation-authority-matrix.json).
Browser acceptance is defined in `frontend/e2e/` and
`backend/tests/live_acceptance/operation_matrix.json`.

Module notes under `modules/` are explanatory only. Confirm every selector,
route, identifier, and state against current source and executable contracts
before changing product code.
