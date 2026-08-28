# Master module

The master module exposes the canonical product, customer, supplier, tax, unit,
warehouse, bank-account, company-profile, role, and user-management surfaces.
`MasterHub.tsx` is the route entry point.

Create flows live in `customers/CustomerFlow.tsx`,
`suppliers/SupplierFlow.tsx`, and `products/ProductFlow.tsx`. List and detail
screens live in `masters/` and `products/`. Shared server-backed entity behavior
lives in `hooks/useEntityMaster.ts`; settings-specific behavior lives in
`hooks/useSettingsEntity.ts`.

Business identifiers, classifications, balances, commercial terms, and other
canonical facts must come from the backend. Browser forms may validate explicit
operator input, but must not generate identifiers or infer missing business
facts. Unsupported mutations fail closed.

When adding a master surface:

1. Add its canonical API contract under `services/api/modules/master/`.
2. Add the component and route it through `MasterHub.tsx`.
3. Add contract tests for authority, validation, and unavailable mutations.
4. Run `npm run typecheck` and `CI=true npm run test:ci -- --runInBand`.
