# Inventory module

The desktop Stock Hub reads exact, branch-scoped inventory projections from the
canonical API. `CurrentStock`, `BatchTracking`, and `StockMovement` decode every
wire field before rendering it; missing facts fail closed instead of becoming
zero, one, a made-up unit, or a price alias.

Inventory writes use reviewed canonical commands. The UI must not calculate or
infer stock valuation, MRP, selling price, reorder policy, pack configuration,
or batch-allocation policy. A user may choose a batch where a canonical command
supports manual allocation; any automatic policy must be published by the
backend as effective policy for the transaction context.

```typescript
import { StockHub, CurrentStock, BatchTracking } from '@/components/inventory';
```
