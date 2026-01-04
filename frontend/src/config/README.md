# Config Directory

Application-wide configuration files.

## Structure

| File | Lines | Description |
|------|-------|-------------|
| api.config.ts | 275 | API endpoints, auth tokens (single source of truth) |
| app.config.ts | 269 | App settings, features, locale |
| apiBase.ts | 113 | Base URL resolution |
| constants.ts | 89 | Business constants (ORDER_STATUS, PAYMENT_STATUS, etc.) |
| design-system.config.ts | 217 | Design tokens & spacing |
| fieldAliases.ts | 257 | Backend→Frontend field mappings |
| gstRates.ts | 177 | GST rate configurations |
| invoice.config.ts | 331 | Invoice settings |
| purchase.config.ts | 239 | Purchase settings |
| theme.config.ts | 402 | Colors, typography |
| userRoles.config.ts | 201 | Role permissions |

**Total:** ~2,570 lines

## Duplication Cleanup

✅ Removed duplicate `API_CONFIG` from `constants.ts` (now re-exports from `api.config.ts`)

**Note:** `formatCurrency` exists in both `app.config.ts` and `purchase.config.ts` - intentionally different implementations:
- `app.config.ts`: Uses `Intl.NumberFormat` for proper locale formatting
- `purchase.config.ts`: Uses simple string concat with config-based symbol

## Usage

```typescript
import { APP_CONFIG, API_CONFIG, INVOICE_CONFIG } from '@/config';
```

## Status

✅ All TypeScript  
✅ Barrel export (index.ts)  
✅ Duplicate API_CONFIG cleaned up
