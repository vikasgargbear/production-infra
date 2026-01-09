# 📄 Invoice - Complete Field Reference

> **Complete Documentation**: Every field, every variable, frontend to backend mapping.

---

## 🎯 Invoice Module Overview

The invoice creation flow is a **3-step process**:
1. **Step 1**: Customer & Items selection
2. **Step 2**: Preview & Edit
3. **Step 3**: Confirmation & Print

**Refactoring Status**: ✅ 1,127 → 430 lines (62% reduction)

---

## 📝 Core Data Structures

### Section 1.1: Invoice Header Fields

| Field | Frontend Variable | Backend Column | Type | Required | Description |
|-------|------------------|----------------|------|----------|-------------|
| **Invoice ID** | `invoice.id` | `id` | Integer | Auto | Primary key |
| **Invoice Number** | `invoice.invoice_number` | `invoice_number` | String | ✅ Auto | Unique invoice # |
| **Invoice Date** | `invoice.invoice_date` | `invoice_date` | Date | ✅ Yes | Date created |
| **Due Date** | `invoice.due_date` | `due_date` | Date | ✅ Yes | Payment due |
| **Status** | `invoice.status` | `status` | Enum | Auto | 'draft'/'confirmed'/'paid' |
| **Delivery Type** | `invoice.delivery_type` | `delivery_type` | Enum | ✅ Yes | 'counter'/'delivery' |
| **Counter Type** | `invoice.counter_type` | `counter_type` | Enum | No | 'regular'/'express' |
| **Notes** | `invoice.notes` | `notes` | String | No | Internal notes |
| **Terms** | `invoice.terms` | `terms_conditions` | String | No | Terms & conditions |

---

### Section 1.2: Customer Fields

| Field | Frontend Variable | Backend Column | Type | Required | Description |
|-------|------------------|----------------|------|----------|-------------|
| **Customer ID** | `invoice.customer_id` | `customer_id` | Integer | ✅ Yes | FK to customers |
| **Customer Name** | `selectedCustomer.name` | `customer_name` | String | Display | Customer display name |
| **Phone** | `selectedCustomer.phone` | `customer_phone` | String | Display | Contact number |
| **GST Number** | `selectedCustomer.gst_number` | `customer_gstin` | String | No | GST registration |
| **Customer Type** | `selectedCustomer.type` | `customer_type` | Enum | No | 'B2B'/'B2C' |

---

### Section 1.3: Item Fields

Each item in `invoice.items[]`:

| Field | Frontend Variable | Backend Column | Type | Required | Description |
|-------|------------------|----------------|------|----------|-------------|
| **Product ID** | `item.product_id` | `product_id` | Integer | ✅ Yes | FK to products |
| **Product Name** | `item.product_name` | `product_name` | String | Display | Product display name |
| **Batch ID** | `item.batch_id` | `batch_id` | Integer | ✅ Yes | FK to batches |
| **Batch Number** | `item.batch_number` | `batch_number` | String | Display | Batch display |
| **Expiry Date** | `item.expiry_date` | `expiry_date` | Date | No | Batch expiry |
| **Quantity** | `item.quantity` | `quantity` | Decimal | ✅ Yes | Qty sold |
| **Free Quantity** | `item.free_qty` | `free_quantity` | Decimal | No | Free items |
| **Unit** | `item.unit` | `unit` | String | ✅ Yes | UOM |
| **MRP** | `item.mrp` | `mrp` | Decimal | ✅ Yes | Maximum retail price |
| **Rate** | `item.rate` | `rate` | Decimal | ✅ Yes | Selling price |
| **Discount %** | `item.discount_percent` | `discount_percent` | Decimal | No | % discount |
| **Discount Amount** | `item.discount_amount` | `discount_amount` | Decimal | Calculated | ₹ discount |
| **GST Rate** | `item.gst_rate` | `gst_rate` | Decimal | ✅ Yes | GST % |
| **CGST** | `item.cgst` | `cgst_amount` | Decimal | Calculated | CGST amount |
| **SGST** | `item.sgst` | `sgst_amount` | Decimal | Calculated | SGST amount |
| **IGST** | `item.igst` | `igst_amount` | Decimal | Calculated | IGST amount |
| **Item Total** | `item.total` | `line_total` | Decimal | Calculated | Line total |

---

### Section 1.4: Totals Fields

| Field | Frontend Variable | Backend Column | Type | Description |
|-------|------------------|----------------|------|-------------|
| **Subtotal** | `invoice.subtotal` | `subtotal` | Decimal | Before discounts/tax |
| **Total Discount** | `invoice.total_discount` | `total_discount` | Decimal | All discounts |
| **Taxable Amount** | `invoice.taxable_amount` | `taxable_amount` | Decimal | After discounts |
| **Total CGST** | `invoice.total_cgst` | `total_cgst` | Decimal | Sum of CGST |
| **Total SGST** | `invoice.total_sgst` | `total_sgst` | Decimal | Sum of SGST |
| **Total IGST** | `invoice.total_igst` | `total_igst` | Decimal | Sum of IGST |
| **Round Off** | `invoice.round_off` | `round_off` | Decimal | Rounding adjustment |
| **Grand Total** | `invoice.grand_total` | `grand_total` | Decimal | Final amount |
| **Paid Amount** | `invoice.paid_amount` | `paid_amount` | Decimal | Amount received |
| **Balance Due** | `invoice.balance_due` | `balance_due` | Decimal | Remaining |

---

### Section 1.5: Payment Fields

| Field | Frontend Variable | Backend Column | Type | Description |
|-------|------------------|----------------|------|-------------|
| **Payment Method** | `invoice.payment_method` | `payment_method` | Enum | 'cash'/'card'/'upi'/'credit' |
| **Payment Status** | `invoice.payment_status` | `payment_status` | Enum | 'paid'/'partial'/'pending' |
| **UPI Reference** | `invoice.upi_reference` | `upi_reference` | String | UPI transaction ID |
| **Card Last 4** | `invoice.card_last_four` | `card_last_four` | String | Card ending |
| **Bank Account** | `invoice.bank_account_id` | `bank_account_id` | Integer | FK to bank accounts |

---

### Section 1.6: Address Fields

**Billing Address** (`invoice.billing_address`):

| Field | Frontend Variable | Backend Column | Type |
|-------|------------------|----------------|------|
| **Street** | `billing_address.street` | `billing_street` | String |
| **City** | `billing_address.city` | `billing_city` | String |
| **State** | `billing_address.state` | `billing_state` | String |
| **Pincode** | `billing_address.pincode` | `billing_pincode` | String |

**Shipping Address** (`invoice.shipping_address`) - same structure with `shipping_` prefix.

---

## 📊 TypeScript Interfaces

```typescript
interface Invoice {
  id?: number;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  status: 'draft' | 'confirmed' | 'paid' | 'cancelled';
  customer_id: number;
  delivery_type: 'counter' | 'delivery';
  items: InvoiceItem[];
  subtotal: number;
  total_discount: number;
  taxable_amount: number;
  total_cgst: number;
  total_sgst: number;
  total_igst: number;
  round_off: number;
  grand_total: number;
  payment_method: string;
  payment_status: 'paid' | 'partial' | 'pending';
  notes?: string;
}

interface InvoiceItem {
  product_id: number;
  product_name: string;
  batch_id: number;
  batch_number: string;
  quantity: number;
  free_qty?: number;
  unit: string;
  mrp: number;
  rate: number;
  discount_percent?: number;
  discount_amount?: number;
  gst_rate: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}
```

---

## 🔄 API Endpoints

### POST /api/sales/invoices
```json
{
  "invoice_date": "2024-01-08",
  "due_date": "2024-01-15",
  "customer_id": 123,
  "delivery_type": "counter",
  "items": [
    {
      "product_id": 456,
      "batch_id": 789,
      "quantity": 10,
      "rate": 100.00,
      "discount_percent": 10,
      "gst_rate": 12
    }
  ],
  "payment_method": "cash",
  "notes": "Urgent delivery"
}
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Save invoice |
| `Ctrl+P` | Print invoice |
| `Ctrl+N` | Create new customer |
| `Ctrl+Shift+N` | Create new product |
| `Escape` | Close/cancel |
| `Tab` | Next field |
| `Enter` | Add item / Submit |

---

**Last Updated**: 2026-01-08  
**Component**: `InvoiceFlow.tsx` (1,127 → 430 lines, REFACTORED)  
**Types**: `invoice.types.ts`
