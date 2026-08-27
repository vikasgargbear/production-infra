# Frontend API integration

All browser requests go through `frontend/src/services/api`. The canonical API
base URL is deployment configuration; components must not construct alternate
legacy, localhost, or database URLs.

Rules:

- use the typed domain client and its response decoder;
- let the authenticated session attach credentials;
- never send organization identity or browser-owned business defaults;
- treat 401, 403, 409, 422, and 5xx responses as explicit failures;
- never convert a failed write into local success, IndexedDB, or an offline
  queue; and
- reconcile consequential writes through their canonical history/readback.

The 18-operation ownership map is
`docs/architecture/core-operation-authority-matrix.json`. Request contracts are
tested beside the corresponding client and flow components.
