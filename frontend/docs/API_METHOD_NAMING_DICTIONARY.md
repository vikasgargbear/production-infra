# API Method Naming Dictionary

> **Canonical Reference**: Use ONLY these method names when calling API modules.
> 
> This document establishes naming conventions for all API method calls, eliminating aliases to maintain consistency.

---

## Principles

1. **One canonical name per operation** - No aliases
2. **Consistent naming patterns** across all API modules
3. **RESTful conventions** where applicable:
   - `getAll` for list operations (not `list`)
   - `getById` for single item retrieval (not `getDetails`)
   - `create` / `update` / `delete` for mutations

---

## Canonical Method Names

### CRUD Operations

| Operation | Canonical Name | ❌ Deprecated Aliases |
|-----------|---------------|----------------------|
| Get all items | `getAll()` | `list()`, `fetch()` |
| Get single item | `getById()` | `getDetails()`, `get()`, `fetch()` |
| Create item | `create()` | `add()`, `insert()`, `post()` |
| Update item | `update()` | `edit()`, `modify()`, `put()`, `patch()` |
| Delete item | `delete()` | `remove()`, `destroy()` |
| Search items | `search()` | `find()`, `query()` |

### Specialized Operations

| Operation | Canonical Name | ❌ Deprecated Aliases |
|-----------|---------------|----------------------|
| Get with relations | `getAllWithX()` | `listWithX()`, `fetchWithX()` |
| Get outstanding | `getOutstanding()` | `getWithOutstanding()` |
| Get by status | `getByStatus()` | `filterByStatus()` |

---

## API Module Export Names

### Canonical Exports (use these)

| Module | Canonical Export | ❌ Deprecated Aliases |
|--------|-----------------|----------------------|
| Customers | `customersApi` | `customerAPI` |
| Products | `productsApi` | `productAPI` |
| Suppliers | `suppliersApi` | `supplierAPI` |
| Invoices | `invoicesApi` | `invoiceAPI` |
| Payments | `paymentsApi` | `paymentAPI` |
| Users | `usersApi` | `userAPI` |
| Batches | `batchesApi` | `batchAPI` |
| Settings | `settingsApi` | `settingsAPI` |

> **Note**: Legacy exports with `API` suffix are maintained in `services/api/index.ts` for backward compatibility but should be migrated.

---

## Migration Examples

### Before (using aliases)

```typescript
// ❌ Using deprecated aliases
const customers = await customerAPI.list();
const product = await productAPI.getDetails(123);
```

### After (canonical)

```typescript
// ✅ Using canonical names
const customers = await customersApi.getAll();
const product = await productsApi.getById(123);
```

---

## Fixes Applied

### 2026-01-05: Initial Cleanup

| File | Change |
|------|--------|
| `customers.api.ts` | Removed `list()` and `getDetails()` aliases |
| `products.api.ts` | Removed `list()` and `getDetails()` aliases |
| `useProducts.ts` | Changed `getDetails()` → `getById()` |
| `useCustomers.ts` | Changed `getDetails()` → `getById()` |
| `SalesReturnFlow.tsx` | Changed `getDetails()` → `getById()` |
| `useSalesReturn.ts` | Changed `getDetails()` → `getById()` |

---

## Related Documentation

- [Variable Naming Dictionary](./VARIABLE_NAMING_DICTIONARY.md) - Field/property naming conventions
- [API Module Structure](../src/services/api/README.md) - API architecture overview
