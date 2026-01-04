# GST Module

**Status:** 🚧 Under Optimization (Jan 2026)

GST compliance, reporting, and filing module.

---

## 🚨 Critical Optimization

This module is undergoing **critical optimization** due to:
- **GSTReports.tsx**: 2,350 lines (largest file in codebase)
- **80%+ code duplication** across reports
- **Business-critical** GST compliance functionality

**Target:** Reduce to 7 focused report files (~250 lines each) + shared infrastructure

---

## 🏗️ New Architecture (In Progress)

```
gst/
├── README.md                    # This file
├── GSTHub.tsx                   # Entry point
│
├── reports/                     # [NEW] Reports sub-module
│   ├── GSTReports.tsx           # [TEMP] Being decomposed
│   ├── GSTR1Report.tsx          # [TODO] Outward Supplies
│   ├── GSTR2BReport.tsx         # [TODO] Input Credit
│   ├── GSTR3BReport.tsx         # [TODO] Summary Return
│   ├── HSNSummaryReport.tsx     # [TODO] HSN-wise
│   ├── PartyWiseReport.tsx      # [TODO] Party-wise
│   ├── GSTPayableReport.tsx     # [TODO] Tax liability
│   └── InputCreditReport.tsx    # [TODO] ITC details
│
├── dashboard/                   # [NEW] Dashboard sub-module
│   └── GSTDashboard.tsx         # [MOVED]
│
├── types/                       # [NEW] ✅ Shared types
│   ├── gstSharedTypes.ts        # Comprehensive types
│   └── index.ts
│
├── utils/                       # [NEW] ✅ Shared utilities
│   ├── gstCalculations.ts       # Tax calculations
│   ├── gstTransforms.ts         # Data transforms
│   └── index.ts
│
└── hooks/                       # [TODO] Shared hooks
    ├── useGSTReport.ts          # Generic report loader
    └── index.ts
```

---

## 📊 GST Report Types

### 1. GSTR-1 (Outward Supplies)
Tax on sales (B2B and B2C)

### 2. GSTR-2B (Input Tax Credit)
Tax paid on purchases - ITC available

### 3. GSTR-3B (Summary Return)
Monthly summary: Output tax - Input credit = Payable

### 4. HSN Summary
Product/HSN code-wise tax summary

### 5. Party-wise GST
Customer-wise tax details

### 6. GST Payable
Tax liability calculation

### 7. Input Credit Report
Detailed ITC analysis

---

## 🎯 Optimization Goals

### Code Reduction
- **Before:** 2,350 lines in 1 file
- **After:** ~1,750 lines across 7 files (25% reduction)
- **Shared:** ~400 lines reusable infrastructure

### Maintainability
- **Before:** Impossible to navigate
- **After:** Each report self-contained (~250 lines)

### Reusability
- Shared calculations
- Shared transforms
- Shared types

---

## 🚀 Usage (After Optimization)

### Using Shared Utilities
```typescript
import { calculateGSTSummary, transformInvoicesToGSTR1 } from '../utils';

const summary = calculateGSTSummary(invoices);
const gstr1Data = transformInvoicesToGSTR1(invoices, customerData);
```

### Using Report Hook
```typescript
import { useGSTReport } from '../hooks';

const { data, loading, refresh } = useGSTReport('gstr-1', dateRange);
```

---

## ⚠️ Work in Progress

**Phase 1:** ✅ Create shared infrastructure (types, utils)  
**Phase 2:** 🚧 Decompose GSTReports.tsx into 7 reports  
**Phase 3:** Create shared hooks  
**Phase 4:** Documentation & verification

**Estimated completion:** 15-22 hours total

---

## 📖 Compliance Notes

### GST Return Filing Deadlines
- **GSTR-1:** 11th of next month
- **GSTR-3B:** 20th of next month  
- **Annual:** 31st December

### Important
- All amounts in INR
- Financial Year: April 1 - March 31
- B2C threshold: ₹2.5 lakhs

---

**Last Updated:** January 4, 2026  
**Status:** Under active optimization
