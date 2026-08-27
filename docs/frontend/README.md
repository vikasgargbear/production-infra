# Frontend documentation

The React/TypeScript frontend is organized by reachable product flows under
`frontend/src/components` and typed API clients under
`frontend/src/services/api`.

Current guidance:

- [API integration](../../frontend/docs/05-api-integration/)
- [Security](../../frontend/docs/08-security/)
- [UI design patterns](ui-design-patterns.md)
- [UI/UX principles](ui_ux_design_principles.md)
- live browser specifications under `frontend/e2e`

For a consequential CTA, start with the component, follow its typed client to a
mounted canonical route, then use the operation authority matrix and readback
tests. Do not infer current behavior from an orphan component or historical
user guide.
