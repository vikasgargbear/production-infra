# 🛍️ Purchase History - Complete Field Reference

> **Complete Documentation**: Every field, every variable, frontend to backend mapping.

---

## 🎯 Purchase History Module Overview

This module displays and manages purchase order history with filtering, bulk actions, and export capabilities.

---

## 📝 Core Data Structures

### Section 1.1: Purchase Order Fields

Each purchase order in the list (`PurchaseOrder`):

| Field | Frontend Variable | Backend Column | Type | Required | Description |
|-------|------------------|----------------|------|----------|-------------|
| **ID** | `purchase.id` | `id` | String | Auto | Unique purchase ID |
| **PO Number** | `purchase.po_number` | `po_number` | String | ✅ Auto | Purchase order number |
| **PO Date** | `purchase.po_date` | `po_date` | Date | ✅ Yes | Order creation date |
| **Supplier ID** | `purchase.supplier_id` | `supplier_id` | String | ✅ Yes | Supplier reference |
| **Supplier Name** | `purchase.supplier_name` | `supplier_name` | String | Display | Supplier display name |
| **Total Amount** | `purchase.total_amount` | `total_amount` | Decimal | Calculated | Total purchase value |
| **Paid Amount** | `purchase.paid_amount` | `paid_amount` | Decimal | Calculated | Amount already paid |
| **Pending Amount** | `purchase.pending_amount` | `pending_amount` | Decimal | Calculated | Remaining to pay |
| **Payment Status** | `purchase.payment_status` | `payment_status` | Enum | Calculated | 'paid'/'partial'/'pending'/'overdue' |
| **Status** | `purchase.status` | `status` | Enum | ✅ Yes | 'draft'/'confirmed'/'received'/'cancelled' |
| **Items Count** | `purchase.items_count` | `items_count` | Integer | Calculated | Number of line items |
| **Created At** | `purchase.created_at` | `created_at` | Timestamp | Auto | Record creation time |
| **Updated At** | `purchase.updated_at` | `updated_at` | Timestamp | Auto | Last modification time |

**Visual Flow**:
```
┌─────────────────────────────────────────────────────────────────────────┐
│ ☑ │ PO Number    │ Date       │ Supplier      │ Amount   │ Status     │
├───┼──────────────┼────────────┼───────────────┼──────────┼────────────┤
│ ☑ │ PO-240108001 │ 08-Jan-24  │ ABC Pharma    │ ₹25,000  │ 🟢 Received│
│   │              │            │               │ Paid: ₹25K│            │
├───┼──────────────┼────────────┼───────────────┼──────────┼────────────┤
│ ☐ │ PO-240107002 │ 07-Jan-24  │ XYZ Medical   │ ₹15,000  │ 🟡 Partial │
│   │              │            │               │ Paid: ₹10K│            │
├───┼──────────────┼────────────┼───────────────┼──────────┼────────────┤
│ ☐ │ PO-240105003 │ 05-Jan-24  │ MedSupply Co  │ ₹8,000   │ 🔴 Pending │
│   │              │            │               │ Paid: ₹0 │            │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### Section 1.2: Filter Fields

| Field | Frontend Variable | Type | Options | Description |
|-------|------------------|------|---------|-------------|
| **Search Query** | `filters.searchQuery` | String | - | Search PO#, supplier |
| **Date Filter** | `filters.dateFilter` | String | 'today'/'week'/'month'/'quarter'/'all' | Time period |
| **Status Filter** | `filters.statusFilter` | String | 'all'/'draft'/'confirmed'/'received'/'cancelled' | PO status |
| **Show Filters** | `ui.showFilters` | Boolean | - | Expand/collapse filters |

**Visual Flow**:
```
┌────────────────────────────────────────────────────────────────┐
│ 🔍 [Search PO or Supplier...____________]  [🔄 Refresh]      │
│                                                                │
│ [▼ Hide Filters]                                              │
│ ┌────────────────────────────────────────────────────────────┐│
│ │ Date: [This Month ▼]    Status: [All Statuses ▼]          ││
│ └────────────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────────────┘
```

---

### Section 1.3: UI State Fields

| Field | Frontend Variable | Type | Description |
|-------|------------------|------|-------------|
| **Show Filters** | `ui.showFilters` | Boolean | Filter panel visibility |
| **Refreshing** | `ui.refreshing` | Boolean | Data refresh in progress |
| **Exporting** | `ui.exporting` | Boolean | Export in progress |

---

### Section 1.4: Selection State

| Field | Frontend Variable | Type | Description |
|-------|------------------|------|-------------|
| **Selected IDs** | `selectedIds` | Set<string> | Selected PO IDs |
| **Is All Selected** | Calculated | Boolean | All visible selected |

---

### Section 1.5: Pagination Fields

| Field | Frontend Variable | Backend Field | Type | Description |
|-------|------------------|---------------|------|-------------|
| **Total** | `pagination.total` | `total` | Integer | Total records |
| **Page** | `pagination.page` | `page` | Integer | Current page (1-indexed) |
| **Per Page** | `pagination.per_page` | `per_page` | Integer | Items per page |
| **Total Pages** | `pagination.total_pages` | `total_pages` | Integer | Total page count |

---

## 📊 Complete TypeScript Interfaces

```typescript
interface PurchaseOrder {
  id: string;
  po_number: string;
  po_date: string;
  supplier_id: string;
  supplier_name: string;
  total_amount: number;
  paid_amount: number;
  pending_amount: number;
  payment_status: 'paid' | 'partial' | 'pending' | 'overdue';
  status: 'draft' | 'confirmed' | 'received' | 'cancelled';
  items_count: number;
  created_at: string;
  updated_at: string;
}

interface PurchaseListHistoryState {
  purchases: PurchaseOrder[];
  selectedIds: Set<string>;
  filters: {
    searchQuery: string;
    dateFilter: string;
    statusFilter: string;
  };
  ui: {
    showFilters: boolean;
    refreshing: boolean;
    exporting: boolean;
  };
  pagination: {
    total: number;
    page: number;
    per_page: number;
    total_pages: number;
  };
  loading: boolean;
  error: string | null;
}
```

---

## 🔄 API Endpoints

### GET /api/purchases

**Query Parameters**:
```
page: number (1-indexed)
per_page: number (default: 20)
search: string (optional)
date_filter: 'today' | 'week' | 'month' | 'quarter' | 'all'
status: 'all' | 'draft' | 'confirmed' | 'received' | 'cancelled'
```

**Response**:
```json
{
  "purchases": [
    {
      "id": "123",
      "po_number": "PO-240108001",
      "po_date": "2024-01-08",
      "supplier_id": "456",
      "supplier_name": "ABC Pharma Distributors",
      "total_amount": 25000.00,
      "paid_amount": 25000.00,
      "pending_amount": 0.00,
      "payment_status": "paid",
      "status": "received",
      "items_count": 10,
      "created_at": "2024-01-08T10:30:00Z",
      "updated_at": "2024-01-08T15:45:00Z"
    }
  ],
  "pagination": {
    "total": 150,
    "page": 1,
    "per_page": 20,
    "total_pages": 8
  }
}
```

---

## ⌨️ Actions Available

| Action | Frontend Handler | Description |
|--------|------------------|-------------|
| **View Purchase** | `onViewPurchase(purchase)` | Open PO details |
| **Toggle Select** | `onToggleSelect(id)` | Select/deselect single PO |
| **Select All** | `onToggleSelectAll()` | Select/deselect all visible |
| **Export** | `onExport()` | Export selected to Excel |
| **Clear Selection** | `onClear()` | Clear all selections |
| **Refresh** | `onRefresh()` | Reload data |

---

## 🔄 State Management (Refactored)

**Before Refactoring**: 15 useState calls  
**After Refactoring**: 1 useReducer via `usePurchaseListHistoryState` hook

**Reduction**: 1,073 → 380 lines (65%)

---

**Last Updated**: 2026-01-08  
**Component**: `PurchaseListHistory.tsx` (REFACTORED)  
**Types**: `purchasehistory.types.ts` (77 lines)
