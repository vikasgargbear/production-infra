# 🔄 Sales Return - Complete Field Reference

> **Complete Documentation**: Every field, every variable, frontend to backend mapping.

---

## 🎯 Sales Return Flow: 2-Step Process

### ✅ Step 1: Customer, Invoice & Items Selection
### ✅ Step 2: Review & Generate Credit Note

---

## 📝 STEP 1: Return Details & Items

### Section 1.1: Return Header Fields

| Field | Frontend Variable | Backend Column | Type | Required | Description |
|-------|------------------|----------------|------|----------|-------------|
| **Return Number** | `returnData.return_no` | `return_no` | String | ✅ Auto | Auto-generated (e.g., SR-24010800123) |
| **Return Date** | `returnData.return_date` | `return_date` | Date | ✅ Yes | Date of return |
| **Credit Note No** | `returnData.credit_note_no` | `credit_note_no` | String | ✅ Auto | Generated on save |
| **Status** | `returnData.status` | `status` | Enum | ✅ Auto | DRAFT/PENDING/APPROVED/COMPLETED |

**Visual Flow**:
```
┌──────────────────────────────────────────┐
│ Return #: SR-24010800123                │ ← return_no (auto)
│ Return Date: [08-Jan-2024] 📅           │ ← return_date
│ Credit Note: CN-24010800123             │ ← credit_note_no (auto on save)
│ Status: PENDING                          │ ← status
└──────────────────────────────────────────┘
```

---

### Section 1.2: Customer Selection

| Field | Frontend Variable | Backend Column | Type | Required | Description |
|-------|------------------|----------------|------|----------|-------------|
| **Customer** | `selectedCustomer` | `customer_id` | Integer | ✅ Yes | Customer who is returning |
| **Customer Name** | `returnData.customer_details.customer_name` | Joined | String | Display | Customer name |
| **Customer Phone** | `returnData.customer_details.primary_phone` | Joined | String | Display | Contact number |
| **Customer GST** | `returnData.customer_details.gst_number` | Joined | String | Display | For GST credit note |
| **Customer Dues** | `customerDues` (UI state) | Calculated | Decimal | Display | Outstanding amount |

**Visual Flow**:
```
┌────────────────────────────────────────────┐
│ 🔍 Search Customer                        │
│ ┌────────────────────────────────────────┐│
│ │ ABC Pharma Distributors                ││ ← customer_name
│ │ Phone: +91 98765 43210                 ││ ← primary_phone
│ │ GST: 29AABCT1332L1ZN                   ││ ← gst_number
│ │ Current Dues: ₹25,000                  ││ ← customerDues
│ └────────────────────────────────────────┘│
└────────────────────────────────────────────┘
```

---

### Section 1.3: Original Invoice Selection

| Field | Frontend Variable | Backend Column | Type | Required | Description |
|-------|------------------|----------------|------|----------|-------------|
| **Invoice** | `selectedInvoice` | `invoice_id` | Integer | Conditional | Original sale invoice |
| **Invoice Number** | `returnData.invoice_number` | `invoice_number` | String | For reference | Invoice being returned |
| **Invoice Date** | `returnData.invoice_date` | `invoice_date` | Date | For reference | Original sale date |
| **Original Invoice** | `returnData.original_invoice` | Joined | Object | For items | Full invoice data |

**Visual Flow**:
```
┌────────────────────────────────────────────┐
│ 🔍 Select Invoice to Return Against       │
│                                            │
│ [Search by Invoice Number...]             │
│                                            │
│ Recent Invoices:                           │
│ ┌────────────────────────────────────────┐│
│ │ INV-240105001 | 05-Jan-2024 | ₹5,450  ││
│ │ INV-240102003 | 02-Jan-2024 | ₹12,300 ││
│ │ INV-231228001 | 28-Dec-2023 | ₹3,200  ││
│ └────────────────────────────────────────┘│
│                                            │
│ [Skip - Manual Entry Instead]             │
└────────────────────────────────────────────┘
```

---

### Section 1.4: Return Item Fields

Each item in `returnData.items[]` array:

| Field | Frontend Variable | Backend Column | Type | Required | Description |
|-------|------------------|----------------|------|----------|-------------|
| **ID** | `item.id` | `id` | String/Number | Auto | Unique item identifier |
| **Product ID** | `item.product_id` | `product_id` | Integer | ✅ Yes | Product reference |
| **Product Name** | `item.product_name` | `product_name` | String | Display | Product name |
| **HSN Code** | `item.hsn_code` | `hsn_code` | String | For GST | Tax code |
| **Batch ID** | `item.batch_id` | `batch_id` | Integer | ❌ No | Batch reference |
| **Batch Number** | `item.batch_number` | `batch_number` | String | ❌ No | Batch identifier |
| **Mfg Date** | `item.manufacturing_date` | `manufacturing_date` | Date | Display | Manufacturing date |
| **Expiry Date** | `item.expiry_date` | `expiry_date` | Date | Display | Expiry date |
| **Original Qty (Paid)** | `item.paid_quantity` | `paid_quantity` | Decimal | Display | Qty in original invoice |
| **Original Qty (Free)** | `item.free_quantity` | `free_quantity` | Decimal | Display | Free qty in original |
| **Total Original** | `item.quantity` | `quantity` | Decimal | Display | Total original qty |
| **Return Quantity** | `item.return_quantity` | `return_quantity` | Decimal | ✅ Yes | Qty being returned |
| **Max Returnable** | `item.max_returnable_qty` | Not stored | Decimal | Validation | Maximum allowed |
| **Unit Price** | `item.unit_price` | `unit_price` | Decimal | Display | Original sale price |
| **Discount %** | `item.discount_percent` | `discount_percent` | Decimal | Display | Original discount |
| **Tax %** | `item.tax_percent` | `tax_percent` | Decimal | For credit | GST rate |
| **Selected** | `item.selected` | Not stored | Boolean | UI Only | Checkbox state |
| **Unit** | `item.unit` / `item.uom` | `unit` | String | Display | Unit of measurement |
| **Manufacturer** | `item.manufacturer` | Joined | String | Display | Manufacturer name |
| **Return Reason** | `item.return_reason` | `return_reason` | String | ✅ Yes | Why returning |
| **Disposition** | `item.disposition` | `disposition` | String | ❌ No | What to do with stock |
| **Invoice Item ID** | `item.invoice_item_id` | `invoice_item_id` | Integer | For reference | Link to original item |
| **Is Manual** | `item.is_manual` | Not stored | Boolean | UI Only | Manually added item |
| **Available Stock** | `item.available_stock` | Calculated | Decimal | Display | Current stock available |
| **Requires Approval** | `item.requires_approval` | `requires_approval` | Boolean | Workflow | Needs manager approval |
| **Verification Status** | `item.verification_status` | `verification_status` | String | Workflow | PENDING/VERIFIED/REJECTED |

**Visual Flow**:
```
┌─────────────────────────────────────────────────────────────────────────┐
│ ☑ │ Product           │ Batch    │ Orig Qty │ Return │ Reason        │
├───┼───────────────────┼──────────┼──────────┼────────┼───────────────┤
│ ☑ │ Paracetamol 500mg │ B2024001 │ 100      │ [20]   │ [Expired ▼]   │
│   │ HSN: 3004         │ Dec-2024 │ (Paid)   │        │               │
├───┼───────────────────┼──────────┼──────────┼────────┼───────────────┤
│ ☐ │ Crocin Advance    │ B2024002 │ 50       │ [-]    │ [-]           │
│   │ HSN: 3004         │ Nov-2025 │          │        │               │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### Section 1.5: Return Reasons

| Field | Frontend Variable | Backend Column | Type | Options |
|-------|------------------|----------------|------|---------|
| **Return Reason** | `item.return_reason` | `return_reason` | Enum | See below |

**Available Reasons** (`returnReasons[]`):
```typescript
const RETURN_REASONS = [
  { value: 'EXPIRED', label: 'Expired Product' },
  { value: 'DAMAGED', label: 'Damaged Product' },
  { value: 'WRONG_PRODUCT', label: 'Wrong Product Delivered' },
  { value: 'QUALITY_ISSUE', label: 'Quality Issue' },
  { value: 'NOT_REQUIRED', label: 'Not Required' },
  { value: 'EXCESS_STOCK', label: 'Excess Stock' },
  { value: 'RATE_DIFFERENCE', label: 'Rate Difference' },
  { value: 'CUSTOMER_RETURN', label: 'Customer Return' },
  { value: 'OTHER', label: 'Other' }
];
```

---

### Section 1.6: Return Settings

| Field | Frontend Variable | Backend Column | Type | Required | Description |
|-------|------------------|----------------|------|----------|-------------|
| **Return Reason (Overall)** | `returnData.return_reason` | `return_reason` | String | ❌ No | Default reason |
| **Reason Notes** | `returnData.return_reason_notes` | `return_reason_notes` | Text | ❌ No | Additional notes |
| **Return Method** | `returnData.return_method` | `return_method` | String | ❌ No | How goods returned |
| **Include GST** | `returnData.include_gst` | `include_gst` | Boolean | ❌ No | Include tax in credit |
| **Credit Adjustment** | `returnData.credit_adjustment_type` | `credit_adjustment_type` | Enum | ❌ No | 'future' or 'existing_dues' |

---

### Section 1.7: Return Totals

| Field | Frontend Variable | Backend Column | Type | Description |
|-------|------------------|----------------|------|-------------|
| **Subtotal** | `returnData.subtotal_amount` | `subtotal_amount` | Decimal | Sum before tax |
| **Tax Amount** | `returnData.tax_amount` | `tax_amount` | Decimal | GST on return |
| **Total Amount** | `returnData.total_amount` | `total_amount` | Decimal | Credit note value |

---

## 📊 Complete TypeScript Interface

```typescript
interface ReturnFormData {
  return_no: string;
  return_date: string;
  customer_id: string | number;
  customer_details: Customer | null;
  invoice_id: string | number;
  invoice_number: string;
  invoice_date: string;
  original_invoice: Invoice | null;
  items: ReturnFormItem[];
  return_reason: string;
  return_reason_notes: string;
  return_method: string;
  subtotal_amount: number;
  tax_amount: number;
  total_amount: number;
  credit_note_no: string;
  status: string;
  include_gst: boolean;
  credit_adjustment_type: 'future' | 'existing_dues';
}

interface ReturnFormItem {
  id?: string | number;
  product_id: number;
  product_name: string;
  batch_id?: number | string;
  batch_number: string;
  manufacturing_date?: string;
  expiry_date?: string;
  quantity: number;               // Original quantity
  paid_quantity: number;          // Paid qty from invoice
  free_quantity: number;          // Free qty from invoice
  return_quantity: number;        // Qty being returned
  max_returnable_qty: number;     // Validation limit
  unit_price: number;
  discount_percent: number;
  tax_percent: number;
  selected: boolean;              // UI checkbox state
  hsn_code?: string;
  unit?: string;
  uom?: string;
  manufacturer?: string;
  is_manual?: boolean;            // Manual entry flag
  available_stock?: number;
  return_reason?: string;
  disposition?: string;
  invoice_item_id?: number;
  requires_approval?: boolean;
  verification_status?: string;
}

interface ReturnReason {
  value: string;
  label: string;
}
```

---

## 🔄 API Endpoints

### POST /api/sales/returns
**Request Body**:
```json
{
  "return_no": "SR-24010800123",
  "return_date": "2024-01-08",
  "customer_id": 123,
  "invoice_id": 456,
  "invoice_number": "INV-240105001",
  "return_reason": "EXPIRED",
  "return_reason_notes": "Products expired before delivery",
  "include_gst": true,
  "credit_adjustment_type": "existing_dues",
  "items": [
    {
      "product_id": 789,
      "batch_id": 101,
      "batch_number": "B2024001",
      "return_quantity": 20,
      "unit_price": 50.00,
      "tax_percent": 18,
      "return_reason": "EXPIRED",
      "invoice_item_id": 111
    }
  ]
}
```

**Response**:
```json
{
  "success": true,
  "return_id": 201,
  "return_no": "SR-24010800123",
  "credit_note_no": "CN-24010800123",
  "total_amount": 1180.00,
  "status": "PENDING"
}
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+R` | Focus customer search |
| `Ctrl+I` | Focus invoice search |
| `Ctrl+S` | Save return / Proceed to review |
| `Ctrl+P` | Print credit note |
| `Esc` | Close modal / Go back |

---

## 🔄 State Management (Refactored)

**Before Refactoring**: 14 useState calls  
**After Refactoring**: 1 useReducer via `useSalesReturnState` hook

```typescript
interface ReturnState {
  ui: {
    currentStep: number;
    showCustomerModal: boolean;
    showManualEntry: boolean;
    showInvoiceSection: boolean;
  };
  returnData: ReturnFormData;
  selectedCustomer: Customer | null;
  selectedInvoice: Invoice | null;
  customerDues: number;
  returnReasons: ReturnReason[];
  manualItemCounter: number;
  availableBatches: Record<number, any[]>;
}
```

---

**Last Updated**: 2026-01-08  
**Component**: `SalesReturnFlow.tsx` (693 lines, REFACTORED)  
**Types**: `return.types.ts` (141 lines)  
**Hook**: `useSalesReturnState.ts`
