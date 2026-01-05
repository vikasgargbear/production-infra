# Returns Module

**Status:** ✅ Modernized (Jan 2026)

Complete sales and purchase returns management with hook-based architecture.

---

## 🏗️ Architecture

```
returns/
├── hooks/                      # Logic hooks
│   ├── useSalesReturn.ts      # Sales return workflow
│   ├── useReturnCalculations.ts
│   ├── useReturnReasons.ts
│   └── index.ts
│
├── notes/                      # Credit/Debit notes
│   ├── NotesHub.tsx
│   ├── CreditDebitNoteEntry.tsx
│   ├── CreditDebitNoteFlow.tsx
│   └── CreditDebitNoteSimple.tsx
│
├── ui/                         # Shared UI components
│   └── ...
│
├── types/                      # TypeScript types
│   └── ...
│
├── utils/                      # Utilities
│   └── returnCalculations.ts
│
├── SalesReturnFlow.tsx        # Main sales return (1,154 lines)
├── PurchaseReturnFlow.tsx     # Purchase return
├── ReturnsListHistory.tsx     # Returns history
├── ReturnsHub.tsx             # Module hub
└── index.ts
```

## ✅ Hooks Available

```typescript
import { useSalesReturn, useReturnCalculations, useReturnReasons } from './hooks';
```

## 🚀 Usage

```typescript
import { ReturnsHub } from './returns';
```

---

**Last Updated:** January 4, 2026
