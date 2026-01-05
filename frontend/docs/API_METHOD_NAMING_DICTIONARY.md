# API Method Naming Dictionary

> **See also**: [TYPESCRIPT_ERROR_REMEDIATION.md](./TYPESCRIPT_ERROR_REMEDIATION.md) for remaining cleanup work


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

| Domain | Canonical Export | Status |
|--------|-----------------|--------|
| Customers | `customersApi` | ✅ Active |
| Products | `productsApi` | ✅ Active |
| Suppliers | `suppliersApi` | ✅ Active |
| Invoices | `invoicesApi` | ✅ Active |
| Orders | `ordersApi` | ✅ Active |
| Purchases | `purchasesApi` | ✅ Active |
| Payments | `paymentsApi` | ✅ Active |
| Challans | `challansApi` | ✅ Active |
| Sales Orders | `salesOrdersApi` | ✅ Active |
| Users | `usersApi` | ✅ Active |
| Employees | `employeesApi` | ✅ Active |
| Bank Accounts | `bankAccountsApi` | ✅ Active |
| Batches | `batchesApi` | ✅ Active |
| Company | `companyApi` | ✅ Active |
| Party Ledger | `partyLedgerApi` | ✅ Active |

### Removed Aliases (2026-01-05)

The following legacy aliases have been **completely removed** from `services/api/index.ts`:

| ❌ Removed Alias | → Canonical Name |
|-----------------|------------------|
| `customerAPI` | `customersApi` |
| `productAPI` | `productsApi` |
| `supplierAPI` | `suppliersApi` |
| `invoiceAPI` | `invoicesApi` |
| `ordersAPI` | `ordersApi` |
| `purchasesAPI` | `purchasesApi` |
| `paymentAPI` | `paymentsApi` |
| `challansAPI` | `challansApi` |
| `salesOrdersAPI` | `salesOrdersApi` |
| `employeesAPI` | `employeesApi` |
| `bankAccountsAPI` | `bankAccountsApi` |
| `batchAPI` | `batchesApi` |
| `companyAPI` | `companyApi` |
| `partyLedgerAPI` | `partyLedgerApi` |
| `purchaseApi` | `purchasesApi` |
| `invoiceApi` | `invoicesApi` |

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
