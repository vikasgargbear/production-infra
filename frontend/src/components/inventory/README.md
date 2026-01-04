# Inventory Module

Enterprise inventory management module for stock tracking, adjustments, and batch management.

## Structure

```
inventory/
├── StockHub.tsx           # Main hub with navigation
├── StockListHistory.tsx   # Stock movement history
├── index.ts               # Barrel exports
│
├── stock/                 # Stock sub-module (6 components)
│   ├── CurrentStock.tsx   # Current stock view
│   ├── BatchTracking.tsx  # Batch management
│   └── StockAdjustment.tsx# Adjustments
│
├── hooks/                 # Shared hooks
│
├── types/                 # Type definitions
│   └── inventorySharedTypes.ts
│
└── utils/                 # Utilities (5 files)
    ├── inventoryCalculations.ts
    └── inventoryTransforms.ts
```

## Components

| Component | Description |
|-----------|-------------|
| StockHub | Main navigation hub |
| CurrentStock | Real-time stock levels |
| StockAdjustment | Make adjustments |
| BatchTracking | Batch/lot management |
| StockListHistory | Movement history |

## Usage

```typescript
import { StockHub, CurrentStock, BatchTracking } from '@/components/inventory';
```

## Status

✅ Module optimized with shared infrastructure (types, hooks, utils)
