# 🛒 Sales Order - Complete Field Reference

> **Complete Documentation**: Every field, every variable, frontend to backend mapping.

---

## 🎯 Sales Order Creation: 2-Step Process

### ✅ Step 1: Customer & Items Selection
### ✅ Step 2: Review & Confirm

---

## 📝 STEP 1: Sales Order Items & Customer

### Section 1.1: Order Header Fields

| Field | Frontend Variable | Backend Column | Type | Required | Description |
|-------|------------------|----------------|------|----------|-------------|
| **Order Number** | `order.order_number` | `order_number` | String | ✅ Auto | Auto-generated (e.g., SO-240108001) |
| **Order Date** | `order.order_date` | `order_date` | Date | ✅ Yes | Date order created |
| **Expected Delivery** | `order.expected_delivery_date` | `expected_delivery_date` | Date | ❌ No | When customer expects delivery |
| **Status** | `order.status` | `status` | Enum | ✅ Auto | DRAFT/CONFIRMED/DISPATCHED/DELIVERED/CANCELLED |
| **Salesperson** | `order.salesperson_id` | `salesperson_id` | Integer | ❌ No | Employee ID of salesperson |

**Visual Flow**:
```
┌──────────────────────────────────────────┐
│ Order #: SO-240108001                   │ ← order.order_number (auto)
│ Order Date: [08-Jan-2024] 📅            │ ← order.order_date
│ Expected Delivery: [12-Jan-2024] 📅     │ ← order.expected_delivery_date
│ Salesperson: [Rahul Sharma ▼]           │ ← order.salesperson_id
│ Status: DRAFT                            │ ← order.status
└──────────────────────────────────────────┘
```

**Backend Mapping**:
```python
# orders table
order_number: VARCHAR(50) UNIQUE NOT NULL
order_date: DATE NOT NULL
expected_delivery_date: DATE
status: VARCHAR(20) DEFAULT 'DRAFT' CHECK IN ('DRAFT', 'CONFIRMED', 'DISPATCHED', 'DELIVERED', 'CANCELLED')
salesperson_id: INTEGER FOREIGN KEY -> employees.employee_id
```

---

### Section 1.2: Customer Selection

| Field | Frontend Variable | Backend Column | Type | Required | Description |
|-------|------------------|----------------|------|----------|-------------|
| **Customer** | `selectedCustomer` | `customer_id` | Integer | ✅ Yes | Selected customer object |
| **Customer Name** | `selectedCustomer.customer_name` | Joined | String | Display | Customer name |
| **Customer Code** | `selectedCustomer.customer_code` | Joined | String | Display | Unique customer code |
| **Phone** | `selectedCustomer.primary_phone` | Joined | String | Display | Primary contact |
| **GST Number** | `selectedCustomer.gst_number` | Joined | String | Display | For B2B orders |
| **Address** | `selectedCustomer.address` | Joined | Text | Autofill | Default billing address |
| **City** | `selectedCustomer.city` | Joined | String | Autofill | City |
| **State** | `selectedCustomer.state` | Joined | String | Autofill | State (for GST) |
| **Pincode** | `selectedCustomer.pincode` | Joined | String | Autofill | PIN code |

**Visual Flow**:
```
┌────────────────────────────────────────────┐
│ 🔍 Search or Select Customer              │
│ ┌────────────────────────────────────────┐│
│ │ ABC Pharma Distributors                ││ ← customer_name
│ │ Code: CUST-001                         ││ ← customer_code
│ │ Phone: +91 98765 43210                 ││ ← primary_phone
│ │ GST: 29AABCT1332L1ZN                   ││ ← gst_number
│ │ Address: Shop 5, Main Road, Mumbai     ││ ← address
│ └────────────────────────────────────────┘│
│ [+ Create New Customer]                   │
└────────────────────────────────────────────┘
```

---

### Section 1.3: Order Item Fields

Each item in `order.items[]` array:

| Field | Frontend Variable | Backend Column | Type | Required | Description |
|-------|------------------|----------------|------|----------|-------------|
| **Product ID** | `item.product_id` | `product_id` | Integer | ✅ Yes | Product reference |
| **Product Name** | `item.product_name` | Joined | String | Display | Product name |
| **Batch ID** | `item.batch_id` | `batch_id` | Integer | Conditional | If batch tracking enabled |
| **Batch Number** | `item.batch_number` | `batch_number` | String | Conditional | Batch identifier |
| **Expiry Date** | `item.expiry_date` | `expiry_date` | Date | Display | Batch expiry |
| **Quantity** | `item.quantity` | `quantity` | Decimal | ✅ Yes | Ordered quantity |
| **Unit** | `item.unit` / `item.uom` | `unit` | String | ✅ Yes | Unit of measurement |
| **Pack Size** | `item.pack_size` | Joined | String | Display | Pack information |
| **MRP** | `item.mrp` | Joined | Decimal | Display | Maximum Retail Price |
| **Rate** | `item.unit_price` / `item.sale_price` | `unit_price` | Decimal | ✅ Yes | Sale price per unit |
| **Discount %** | `item.discount_percent` | `discount_percent` | Decimal | ❌ No | Item discount |
| **Tax Rate** | `item.tax_percent` / `item.gst_percent` | `gst_percent` | Decimal | ✅ Yes | GST rate |
| **Line Amount** | `item.amount` | `amount` | Decimal | Calculated | Final line total |

**Visual Flow**:
```
┌─────────────────────────────────────────────────────────────────┐
│ # │ Product           │ Batch    │ Qty │ Unit │ Rate   │ Amount│
├───┼───────────────────┼──────────┼─────┼──────┼────────┼───────┤
│ 1 │ Paracetamol 500mg │ B2024001 │ 100 │ TAB  │ ₹5.00  │ ₹500  │
│   │ HSN: 3004         │ Dec-2025 │     │      │        │       │
├───┼───────────────────┼──────────┼─────┼──────┼────────┼───────┤
│ 2 │ Crocin Advance    │ B2024002 │ 50  │ TAB  │ ₹12.00 │ ₹600  │
│   │ HSN: 3004         │ Nov-2025 │     │      │        │       │
└─────────────────────────────────────────────────────────────────┘
```

---

### Section 1.4: Address Details

| Field | Frontend Variable | Backend Column | Type | Required | Description |
|-------|------------------|----------------|------|----------|-------------|
| **Billing Address** | `order.billing_address` | `billing_address` | Text | ✅ Yes | Invoice address |
| **Shipping Address** | `order.shipping_address` | `shipping_address` | Text | ❌ No | Delivery address |
| **Same as Billing** | `sameAsBilling` (UI state) | Not stored | Boolean | UI Only | Checkbox to copy |

---

### Section 1.5: Order Totals

| Field | Frontend Variable | Backend Column | Type | Description |
|-------|------------------|----------------|------|-------------|
| **Subtotal** | `order.subtotal` | `subtotal` | Decimal | Sum before discount |
| **Discount** | `order.discount_amount` | `discount_amount` | Decimal | Total discount |
| **Taxable Amount** | `order.taxable_amount` | `taxable_amount` | Decimal | After discount |
| **CGST** | `order.total_cgst` | `total_cgst` | Decimal | Central GST |
| **SGST** | `order.total_sgst` | `total_sgst` | Decimal | State GST |
| **Total Tax** | `order.total_tax` | `total_tax` | Decimal | Sum of all GST |
| **Final Amount** | `order.final_amount` | `final_amount` | Decimal | Grand total |

---

## 📤 Step 2: Review & Actions

### Section 2.1: Bank Account Selection (for Payment)

| Field | Frontend Variable | Backend Column | Type | Required | Description |
|-------|------------------|----------------|------|----------|-------------|
| **Bank Account** | `selectedBankAccount` | `bank_account_id` | Integer | ❌ No | For payment reference |
| **Account Name** | `selectedBankAccount.account_name` | Joined | String | Display | Account holder |
| **Bank Name** | `selectedBankAccount.bank_name` | Joined | String | Display | Bank name |
| **Account Number** | `selectedBankAccount.account_number` | Joined | String | Display | Account number |

### Section 2.2: Notes & Terms

| Field | Frontend Variable | Backend Column | Type | Required | Description |
|-------|------------------|----------------|------|----------|-------------|
| **Order Notes** | `order.notes` | `notes` | Text | ❌ No | Internal notes |
| **Terms** | `order.terms` | `terms` | Text | ❌ No | Payment/delivery terms |

---

## 📊 Complete TypeScript Interface

```typescript
interface Order {
  // Header
  id?: number;
  order_number: string;
  order_date: string;
  expected_delivery_date?: string;
  status: 'DRAFT' | 'CONFIRMED' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED';
  salesperson_id?: number;
  
  // Customer
  customer_id: number;
  customer_name?: string;
  customer_details?: Customer;
  
  // Addresses
  billing_address: string;
  shipping_address?: string;
  
  // Items
  items: OrderItem[];
  
  // Totals
  subtotal: number;
  discount_amount: number;
  taxable_amount: number;
  total_cgst: number;
  total_sgst: number;
  total_tax: number;
  final_amount: number;
  
  // Additional
  notes?: string;
  terms?: string;
  bank_account_id?: number;
  
  // System
  created_by?: number;
  created_at?: string;
  updated_at?: string;
  company_id?: number;
}

interface OrderItem {
  id?: number;
  order_id?: number;
  product_id: number;
  product_name: string;
  batch_id?: number;
  batch_number?: string;
  expiry_date?: string;
  quantity: number;
  unit: string;
  pack_size?: string;
  mrp?: number;
  unit_price: number;
  discount_percent?: number;
  gst_percent: number;
  amount: number;
}
```

---

## 🔄 API Endpoints

### POST /api/sales/orders
**Request Body**:
```json
{
  "order_date": "2024-01-08",
  "expected_delivery_date": "2024-01-12",
  "customer_id": 123,
  "salesperson_id": 5,
  "billing_address": "Shop 5, Main Road, Mumbai - 400001",
  "shipping_address": "Same as billing",
  "items": [
    {
      "product_id": 456,
      "batch_id": 789,
      "quantity": 100,
      "unit_price": 5.00,
      "gst_percent": 18
    }
  ],
  "notes": "Urgent order"
}
```

**Response**:
```json
{
  "success": true,
  "order_id": 101,
  "order_number": "SO-240108001",
  "final_amount": 590.00,
  "status": "DRAFT"
}
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | New Customer |
| `Ctrl+I` | Import from document |
| `Ctrl+F` | Focus product search |
| `Ctrl+S` | Save order |
| `Ctrl+P` | Print order |
| `Esc` | Close/Go back |

---

**Last Updated**: 2026-01-08  
**Component**: `SalesOrderFlow.tsx`  
**Hook**: `useSalesOrderLogic.ts` (749 lines)
