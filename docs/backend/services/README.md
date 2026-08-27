# Runtime business-logic ownership

Consequential ERP writes do not use a parallel route → service → repository
stack. Their maintained path is:

```text
frontend CTA
  → /api/web/actions or internal MCP command route
  → backend/app/infrastructure/operator_actions
  → named erp_* PostgreSQL prepare/approve/execute function
  → canonical readback route and MCP tool
```

Start debugging an operation in
[`core-operation-authority-matrix.json`](../../architecture/core-operation-authority-matrix.json).
Each of its 18 entries names the operation key, REST context/readback, MCP
prepare tool, PostgreSQL functions, and affected canonical relations.

The remaining `backend/app/api/services` modules are deliberately narrow:

- authenticated ERP claim construction;
- sales, purchase, return, and adjustment-note calculations;
- effective-dated sales tax resolution; and
- parse-only purchase invoice upload helpers.

They are not alternative write authorities. New business mutations must extend
the typed operator-action boundary and a canonical database command. Do not add
legacy table writes, compatibility services, browser-owned business facts, or
offline fallbacks.

For current verification, use:

- `backend/tests/unit/test_core_operation_authority_matrix.py`;
- `backend/tests/unit/test_mcp_operator_action_contract.py`;
- `backend/tests/unit/test_deferred_surface_retirement.py`;
- the PostgreSQL runtime-role checks under `backend/tests/postgres`; and
- the Live18 contract in `backend/tests/live_acceptance/operation_matrix.json`.
