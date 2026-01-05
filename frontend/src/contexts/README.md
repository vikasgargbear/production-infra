# Contexts Directory

Global state management using React Context API.

## Files

| Context | Lines | Purpose |
|---------|-------|---------|
| AuthContext.js | 471 | Authentication, OAuth, offline login |
| CompanyContext.tsx | 227 | Company profile, org settings |
| EscapeKeyContext.tsx | 121 | ESC key modal handling |
| PaymentContext.tsx | 250 | Payment entry wizard state |
| PurchaseContext.tsx | 434 | Purchase entry wizard state |

**Total:** 5 contexts, ~1,500 lines

## Usage

```typescript
import { useAuth, useCompany, usePayment } from '@/contexts';

// In component
const { user, login, logout } = useAuth();
const { companyInfo } = useCompany();
```

## Architecture Notes

- **Auth** uses Context (correct - global state needed everywhere)
- **Payment/Purchase** still use Context (legacy, could modernize later)
- **Sales** migrated to hooks (`useSalesTransaction`) - modern pattern

## Deleted (Dead Code)

- ❌ SalesContext - replaced by `useSalesTransaction` hook
- ❌ ReturnsContext - never used
- ❌ services/auth/ - empty folder
