# Payment Module

**Status:** ✅ Reorganized (Jan 2026)

Clean folder structure with hooks and proper organization.

---

## 🏗️ Architecture

```
payment/
├── hooks/                          # Logic hooks
│   ├── usePaymentAnalytics.ts     # Dashboard analytics
│   ├── usePaymentTracking.ts      # Payment list + filters
│   └── index.ts                   # Barrel export
│
├── flows/                          # Financial flows
│   ├── BankReconciliationFlow.tsx
│   ├── ExpenseClaimsFlow.tsx
│   ├── FinancialJournalFlow.tsx
│   └── CreditDebitFlow.tsx
│
├── entry/                          # Payment entry forms
│   ├── ModularPaymentEntry.tsx    # Main entry (933 lines)
│   ├── EnterprisePaymentEntry.tsx # Enterprise (796 lines)
│   └── PaymentMade.tsx
│
├── tracking/                       # Payment tracking
│   ├── PaymentTracking.tsx
│   ├── PaymentHistory.tsx
│   └── PaymentDashboard.tsx
│
├── reports/                        # Financial reports
│   ├── FinancialReportsSimple.tsx
│   └── PaymentReports.tsx
│
├── shared/                         # Shared components
│   ├── EnhancedPaymentMethod.tsx
│   ├── InvoiceSelector.tsx
│   ├── PaymentFlowOptimized.tsx
│   ├── PaymentSummary.tsx
│   ├── PaymentSummaryCompact.tsx
│   ├── PaymentInvoiceAllocator.tsx
│   └── PaymentAllocationModal.tsx
│
├── FinancialHub.tsx               # Main entry point
└── index.tsx                      # Barrel export
```

## ✅ Hooks Available

```typescript
import { usePaymentAnalytics, usePaymentTracking } from './hooks';
```

## 🚀 Usage

```typescript
// Main hub
import { FinancialHub } from './payment';

// Individual components
import PaymentDashboard from './payment/tracking/PaymentDashboard';
```

---

Credit and debit note mutation screens are intentionally absent until their
reviewed canonical commands are available. `CreditDebitFlow.tsx` exposes that
boundary instead of falling back to legacy endpoints.

**Last Updated:** August 24, 2026
