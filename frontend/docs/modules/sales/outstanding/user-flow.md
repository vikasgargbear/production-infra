# 💰 Outstanding Management - Complete Field Reference

> **Complete Documentation**: Every field, every variable, frontend to backend mapping.

---

## 🎯 Outstanding Module Overview

This module tracks customer/supplier outstanding balances, aging analysis, and payment allocation.

**Two View Modes**:
- ✅ Summary View: Party-wise outstanding list
- ✅ Aging View: Aging buckets analysis

---

## 📝 Core Data Structures

### Section 1.1: Party Outstanding Fields

Each party in the outstanding list (`PartyOutstanding`):

| Field | Frontend Variable | Backend Column | Type | Description |
|-------|------------------|----------------|------|-------------|
| **Party ID** | `party.party_id` | `party_id` | String | Unique customer/supplier ID |
| **Party Name** | `party.party_name` | `party_name` | String | Customer/supplier name |
| **Phone** | `party.party_phone` | `party_phone` | String | Contact number |
| **Email** | `party.party_email` | `party_email` | String | Email address |
| **Total Outstanding** | `party.total_outstanding` | `total_outstanding` | Decimal | Total amount owed |
| **Total Overdue** | `party.total_overdue` | `total_overdue` | Decimal | Amount past due date |
| **Invoice Count** | `party.invoice_count` | `invoice_count` | Integer | Number of pending invoices |
| **Overdue Count** | `party.overdue_count` | `overdue_count` | Integer | Number of overdue invoices |
| **Oldest Invoice Days** | `party.oldest_invoice_days` | `oldest_invoice_days` | Integer | Days since oldest unpaid |
| **Credit Limit** | `party.credit_limit` | `credit_limit` | Decimal | Customer credit limit |
| **Credit Utilization** | `party.credit_utilization` | `credit_utilization` | Decimal | % of limit used |
| **Total Advance** | `party.total_advance` | `total_advance` | Decimal | Advance payments received |
| **Net Position** | `party.customer_net_position` | `customer_net_position` | Decimal | Outstanding - Advance |

**Visual Flow**:
```
┌──────────────────────────────────────────────────────────────────┐
│ Party Name          │ Outstanding │ Overdue  │ Invoices │ Days │
├─────────────────────┼─────────────┼──────────┼──────────┼──────┤
│ ABC Pharma          │ ₹25,000     │ ₹10,000  │ 5        │ 45   │
│ 📞 +91 98765 43210  │ Limit: ₹50K │ Used: 50%│          │      │
├─────────────────────┼─────────────┼──────────┼──────────┼──────┤
│ XYZ Medical         │ ₹15,000     │ ₹0       │ 2        │ 15   │
│ 📞 +91 87654 32109  │ Limit: ₹30K │ Used: 50%│          │      │
└──────────────────────────────────────────────────────────────────┘
```

---

### Section 1.2: Invoice Detail Fields

Each invoice within party details (`InvoiceDetail`):

| Field | Frontend Variable | Backend Column | Type | Description |
|-------|------------------|----------------|------|-------------|
| **Invoice ID** | `invoice.invoice_id` | `invoice_id` | String | Invoice reference |
| **Invoice Number** | `invoice.invoice_number` | `invoice_number` | String | Invoice display number |
| **Invoice Date** | `invoice.invoice_date` | `invoice_date` | Date | When invoice was created |
| **Due Date** | `invoice.due_date` | `due_date` | Date | Payment due date |
| **Original Amount** | `invoice.original_amount` | `original_amount` | Decimal | Original invoice total |
| **Paid Amount** | `invoice.paid_amount` | `paid_amount` | Decimal | Amount already paid |
| **Current Outstanding** | `invoice.current_outstanding` | `current_outstanding` | Decimal | Remaining to pay |
| **Days Overdue** | `invoice.days_overdue` | `days_overdue` | Integer | Days past due date |
| **Aging Bucket** | `invoice.aging_bucket` | `aging_bucket` | Enum | 'current'/'1-30'/'31-60'/'61-90'/'over_90' |
| **Status** | `invoice.status` | `status` | Enum | 'pending'/'partial'/'overdue' |

**Visual Flow**:
```
┌─────────────────────────────────────────────────────────────────────┐
│ 🧾 INVOICE DETAILS - ABC Pharma                                    │
├────────┬────────────┬───────────┬──────────┬────────────┬──────────┤
│ Inv #  │ Date       │ Original  │ Paid     │ Outstanding│ Overdue  │
├────────┼────────────┼───────────┼──────────┼────────────┼──────────┤
│ INV-001│ 01-Dec-24  │ ₹10,000   │ ₹0       │ ₹10,000    │ 38 days  │
│ INV-005│ 15-Dec-24  │ ₹8,000    │ ₹3,000   │ ₹5,000     │ 24 days  │
│ INV-012│ 28-Dec-24  │ ₹10,000   │ ₹0       │ ₹10,000    │ 11 days  │
└────────┴────────────┴───────────┴──────────┴────────────┴──────────┘
```

---

### Section 1.3: Aging Summary Fields

`OutstandingSummary` aggregate data:

| Field | Frontend Variable | Backend Column | Type | Description |
|-------|------------------|----------------|------|-------------|
| **Total Receivable** | `summary.total_receivable` | `total_receivable` | Decimal | Total amount to receive |
| **Total Payable** | `summary.total_payable` | `total_payable` | Decimal | Total amount to pay |
| **Total Overdue** | `summary.total_overdue` | `total_overdue` | Decimal | Total overdue amount |
| **Party Count** | `summary.party_count` | `party_count` | Integer | Total parties with outstanding |
| **Overdue Party Count** | `summary.overdue_party_count` | `overdue_party_count` | Integer | Parties with overdue balances |

**Aging Buckets** (`summary.aging_summary`):

| Bucket | Frontend Path | Description |
|--------|---------------|-------------|
| **Current** | `aging_summary.current` | Not yet due |
| **1-30 Days** | `aging_summary['1-30']` | 1-30 days overdue |
| **31-60 Days** | `aging_summary['31-60']` | 31-60 days overdue |
| **61-90 Days** | `aging_summary['61-90']` | 61-90 days overdue |
| **Over 90 Days** | `aging_summary.over_90` | 90+ days overdue |

Each aging bucket has:
- `count`: Number of invoices
- `amount`: Total amount in bucket

**Visual Flow**:
```
┌──────────────────────────────────────────────────────────────┐
│ 📊 AGING ANALYSIS                                           │
├──────────────┬────────────────┬─────────────────────────────┤
│ Bucket       │ Invoices       │ Amount                      │
├──────────────┼────────────────┼─────────────────────────────┤
│ Current      │ 15             │ ₹1,25,000 ████████████     │
│ 1-30 Days    │ 8              │ ₹75,000   ████████         │
│ 31-60 Days   │ 5              │ ₹45,000   █████            │
│ 61-90 Days   │ 3              │ ₹30,000   ███              │
│ Over 90 Days │ 2              │ ₹25,000   ██               │
├──────────────┼────────────────┼─────────────────────────────┤
│ TOTAL        │ 33             │ ₹3,00,000                  │
└──────────────┴────────────────┴─────────────────────────────┘
```

---

## 🔍 Filter & UI State

### Section 2.1: Filter Fields

| Field | Frontend Variable | Type | Options |
|-------|------------------|------|---------|
| **Status Filter** | `filters.status` | String | 'all'/'overdue'/'current'/'partial' |
| **Search Query** | `filters.searchQuery` | String | Search by name/phone |
| **View Mode** | `ui.viewMode` | Enum | 'summary'/'aging' |
| **Party Type** | `props.partyType` | Enum | 'customer'/'supplier' |

### Section 2.2: UI State

| Field | Frontend Variable | Type | Description |
|-------|------------------|------|-------------|
| **Expanded Parties** | `expandedParties` | Set<string> | Parties with expanded invoice list |
| **Show Details View** | `ui.showDetailsView` | Boolean | Party detail modal open |
| **Selected Party** | `selectedParty` | Object | Currently selected party |
| **Allocation Modal** | `allocationModal` | Object | Payment allocation state |

---

## 📊 Complete TypeScript Interfaces

```typescript
interface PartyOutstanding {
  party_id: string;
  party_name: string;
  party_phone: string;
  party_email: string;
  total_outstanding: number;
  total_overdue: number;
  invoice_count: number;
  overdue_count: number;
  oldest_invoice_days: number;
  credit_limit?: number;
  credit_utilization?: number;
  invoices?: InvoiceDetail[];
  total_advance?: number;
  customer_net_position?: number;
}

interface InvoiceDetail {
  invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  original_amount: number;
  paid_amount: number;
  current_outstanding: number;
  days_overdue: number;
  aging_bucket: 'current' | '1-30' | '31-60' | '61-90' | 'over_90';
  status: 'pending' | 'partial' | 'overdue';
}

interface OutstandingSummary {
  total_receivable: number;
  total_payable: number;
  total_overdue: number;
  party_count: number;
  overdue_party_count: number;
  aging_summary: {
    current: { count: number; amount: number };
    '1-30': { count: number; amount: number };
    '31-60': { count: number; amount: number };
    '61-90': { count: number; amount: number };
    over_90: { count: number; amount: number };
  };
}

interface OutstandingState {
  expandedParties: Set<string>;
  filters: {
    status: string;
    searchQuery: string;
  };
  ui: {
    viewMode: 'summary' | 'aging';
    showDetailsView: boolean;
  };
  selectedParty: PartyOutstanding | null;
  allocationModal: {
    isOpen: boolean;
    customerId: number | null;
    customerName: string;
  };
}
```

---

## 🔄 API Endpoints

### GET /api/ledger/outstanding

**Query Parameters**:
```
party_type: 'customer' | 'supplier'
status: 'all' | 'overdue' | 'current'
search: string (optional)
```

**Response**:
```json
{
  "parties": [
    {
      "party_id": "123",
      "party_name": "ABC Pharma",
      "party_phone": "+91 98765 43210",
      "total_outstanding": 25000.00,
      "total_overdue": 10000.00,
      "invoice_count": 5,
      "oldest_invoice_days": 45,
      "credit_limit": 50000.00,
      "invoices": [
        {
          "invoice_id": "456",
          "invoice_number": "INV-240101001",
          "original_amount": 10000.00,
          "current_outstanding": 10000.00,
          "days_overdue": 38,
          "aging_bucket": "31-60"
        }
      ]
    }
  ],
  "summary": {
    "total_receivable": 300000.00,
    "total_overdue": 75000.00,
    "party_count": 25,
    "aging_summary": {
      "current": { "count": 15, "amount": 125000 },
      "1-30": { "count": 8, "amount": 75000 },
      "31-60": { "count": 5, "amount": 45000 },
      "61-90": { "count": 3, "amount": 30000 },
      "over_90": { "count": 2, "amount": 25000 }
    }
  },
  "total_advances": 15000.00,
  "net_position": 285000.00
}
```

---

## ⌨️ Actions Available

| Action | Frontend Handler | Description |
|--------|------------------|-------------|
| **View Details** | `onPartyClick(party)` | Open party detail view |
| **Allocate Payment** | `onAllocateClick(party)` | Open payment allocation modal |
| **Export** | `onExport()` | Export to Excel/CSV |
| **Refresh** | `onRefresh()` | Reload data |
| **Toggle Expand** | `onToggleExpand(partyId)` | Show/hide invoices |

---

**Last Updated**: 2026-01-08  
**Component**: `Outstanding.tsx` (1,214 → 510 lines, REFACTORED)  
**Types**: `outstanding.types.ts` (141 lines)
