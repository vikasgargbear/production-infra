# 📦 Delivery Challan - Complete Field Reference

> **Complete Documentation**: Every field, every variable, frontend to backend mapping.

---

## 🎯 Challan Creation: 2-Step Process

### ✅ Step 1: Customer, Items & Delivery Details
### ✅ Step 2: Preview & Save

---

## 📝 STEP 1: Challan Details & Items

### Section 1.1: Challan Header Fields

| Field | Frontend Variable | Backend Column | Type | Required | Description |
|-------|------------------|----------------|------|----------|-------------|
| **Challan Number** | `challan.challan_number` | `challan_number` | String | ✅ Auto | Auto-generated (e.g., DC-24001) |
| **Challan Date** | `challan.challan_date` | `challan_date` | Date | ✅ Yes | Date of dispatch |
| **Expected Delivery** | `challan.expected_delivery_date` | `expected_delivery_date` | Date | ✅ Yes | Expected delivery date |
| **M.R. (Salesperson)** | `selectedMR` / `challan.salesperson_id` | `salesperson_id` | Integer | ❌ No | Medical Representative |

**Visual Flow**:
```
┌──────────────────────────────────────────┐
│ Challan #: DC-2401080001                │ ← challan.challan_number (auto)
│ Challan Date: [08-Jan-2024] 📅          │ ← challan.challan_date
│ Expected Delivery: [08-Jan-2024] 📅     │ ← challan.expected_delivery_date
│ M.R.: [Priya Sharma ▼]                  │ ← selectedMR
└──────────────────────────────────────────┘
```

**Backend Mapping**:
```python
# challans table
challan_number: VARCHAR(50) UNIQUE NOT NULL
challan_date: DATE NOT NULL
expected_delivery_date: DATE NOT NULL
salesperson_id: INTEGER FOREIGN KEY -> employees.employee_id
```

---

### Section 1.2: Customer Selection

| Field | Frontend Variable | Backend Column | Type | Required | Description |
|-------|------------------|----------------|------|----------|-------------|
| **Customer ID** | `challan.customer_id` | `customer_id` | Integer | ✅ Yes | Customer reference |
| **Customer Name** | `challan.customer_name` | `customer_name` | String | ✅ Yes | For display/print |
| **Customer Phone** | `challan.customer_details.phone` | Joined | String | For WhatsApp | Contact number |
| **Customer Address** | `challan.customer_details.address` | Joined | Text | Autofill | Default address |

---

### Section 1.3: Delivery Address (Challan-Specific)

| Field | Frontend Variable | Backend Column | Type | Required | Description |
|-------|------------------|----------------|------|----------|-------------|
| **Same as Billing** | `sameAsBilling` | UI State | Boolean | UI Only | Copy customer address |
| **Delivery Address** | `challan.delivery_address` | `delivery_address` | Text | ✅ Yes | Full delivery address |
| **Delivery City** | `challan.delivery_city` | `delivery_city` | String | ✅ Yes | Delivery city |
| **Delivery State** | `challan.delivery_state` | `delivery_state` | String | ✅ Yes | Delivery state |
| **Delivery Pincode** | `challan.delivery_pincode` | `delivery_pincode` | String | ✅ Yes | Delivery PIN code |
| **Contact Person** | `challan.delivery_contact_person` | `delivery_contact_person` | String | ❌ No | Recipient name |
| **Contact Phone** | `challan.delivery_contact_phone` | `delivery_contact_phone` | String | ❌ No | Recipient phone |

**Visual Flow**:
```
┌────────────────────────────────────────────┐
│ 📍 DELIVERY ADDRESS                       │
├────────────────────────────────────────────┤
│ ☑ Same as Customer Address               │ ← sameAsBilling
│                                            │
│ [If unchecked, show separate fields]      │
│ Address: [Godown 12, Industrial Area___] │ ← delivery_address
│ City: [Thane____]  State: [Maharashtra▼] │ ← delivery_city, delivery_state
│ Pincode: [400601]                         │ ← delivery_pincode
│                                            │
│ Contact: [Mr. Rajesh_______]              │ ← delivery_contact_person
│ Phone: [+91 99887 76655]                  │ ← delivery_contact_phone
└────────────────────────────────────────────┘
```

---

### Section 1.4: Transport Details (Challan-Specific)

| Field | Frontend Variable | Backend Column | Type | Required | Description |
|-------|------------------|----------------|------|----------|-------------|
| **Transport Company** | `challan.transport_company` | `transport_company` | String | ❌ No | Logistics provider |
| **Vehicle Number** | `challan.vehicle_number` | `vehicle_number` | String | ❌ No | Vehicle registration |
| **Driver Phone** | `challan.driver_phone` | `driver_phone` | String | ❌ No | Driver contact |
| **LR Number** | `challan.lr_number` | `lr_number` | String | ❌ No | Lorry Receipt number |
| **Freight Charges** | `challan.freight_charges` | `freight_charges` | Decimal | ❌ No | Shipping cost |

**Visual Flow**:
```
┌────────────────────────────────────────────┐
│ 🚚 TRANSPORT DETAILS                      │
├────────────────────────────────────────────┤
│ Transport: [Blue Dart Logistics_____]    │ ← transport_company
│ Vehicle: [MH-01-AB-1234_______]          │ ← vehicle_number
│ Driver Phone: [+91 98765 43210]          │ ← driver_phone
│ LR Number: [LR-2024-00123_____]          │ ← lr_number
│ Freight: ₹[250.00]                       │ ← freight_charges
└────────────────────────────────────────────┘
```

---

### Section 1.5: Challan Item Fields

Each item in `challan.items[]` array:

| Field | Frontend Variable | Backend Column | Type | Required | Description |
|-------|------------------|----------------|------|----------|-------------|
| **Product ID** | `item.product_id` | `product_id` | Integer | ✅ Yes | Product reference |
| **Product Name** | `item.product_name` | `product_name` | String | ✅ Yes | Product name |
| **Batch ID** | `item.batch_id` | `batch_id` | Integer | ❌ No | Batch reference |
| **Batch Number** | `item.batch_number` | `batch_number` | String | ❌ No | Batch identifier |
| **Expiry Date** | `item.expiry_date` | `expiry_date` | Date | Display | Batch expiry |
| **Ordered Qty** | `item.ordered_quantity` | `ordered_quantity` | Decimal | ❌ No | Original order quantity |
| **Dispatched Qty** | `item.quantity` / `item.dispatched_quantity` | `dispatched_quantity` | Decimal | ✅ Yes | Quantity being shipped |
| **Unit** | `item.unit` / `item.base_uom` | `uom` | String | ✅ Yes | Unit of measurement |
| **Unit Price** | `item.unit_price` / `item.sale_price` | `unit_price` | Decimal | ✅ Yes | Price per unit |
| **GST %** | `item.gst_percent` | `gst_percent` | Decimal | ❌ No | GST rate (0 for challan) |
| **Package Type** | `item.package_type` | `package_type` | String | ❌ No | UNIT/BOX/CASE |

**Visual Flow**:
```
┌─────────────────────────────────────────────────────────────────┐
│ # │ Product           │ Batch    │ Ordered │ Dispatch │ Unit  │
├───┼───────────────────┼──────────┼─────────┼──────────┼───────┤
│ 1 │ Paracetamol 500mg │ B2024001 │ 100     │ [100]    │ TAB   │
│   │                   │ Dec-2025 │         │          │       │
├───┼───────────────────┼──────────┼─────────┼──────────┼───────┤
│ 2 │ Crocin Advance    │ B2024002 │ 50      │ [45]     │ TAB   │
│   │                   │ Nov-2025 │         │          │       │
└─────────────────────────────────────────────────────────────────┘
```

---

### Section 1.6: Challan Totals

| Field | Frontend Variable | Backend Column | Type | Description |
|-------|------------------|----------------|------|-------------|
| **Total Quantity** | `challan.total_quantity` | `total_quantity` | Decimal | Sum of dispatched quantities |
| **Total Amount** | `challan.total_amount` | `total_amount` | Decimal | Value of goods + freight |
| **Notes** | `challan.notes` | `notes` | Text | Delivery instructions |

---

## 📊 Complete TypeScript Interface

```typescript
interface Challan {
  // Header
  id?: number;
  challan_number: string;
  challan_date: string;
  expected_delivery_date: string;
  salesperson_id?: number;
  
  // Customer
  customer_id: number;
  customer_name: string;
  customer_details?: CustomerDetails;
  
  // Delivery Address
  delivery_address: string;
  delivery_city: string;
  delivery_state: string;
  delivery_pincode: string;
  delivery_contact_person?: string;
  delivery_contact_phone?: string;
  
  // Transport
  transport_company?: string;
  vehicle_number?: string;
  driver_phone?: string;
  lr_number?: string;
  freight_charges: number;
  
  // Items
  items: ChallanItem[];
  
  // Totals
  total_quantity: number;
  total_amount: number;
  
  // Notes
  notes?: string;
  
  // System
  status?: 'DRAFT' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED';
  created_by?: number;
  created_at?: string;
  company_id?: number;
}

interface ChallanItem {
  id?: string | number;
  challan_id?: number;
  product_id: number;
  product_name: string;
  batch_id?: number;
  batch_number?: string;
  expiry_date?: string;
  ordered_quantity?: number;
  dispatched_quantity: number;  // This is the main quantity field
  quantity?: number;            // Alias for dispatched_quantity
  unit_price: number;
  gst_percent?: number;
  cgst_percent?: number;
  sgst_percent?: number;
  igst_percent?: number;
  uom: string;
  package_type?: string;
}

interface CustomerDetails {
  id?: number;
  customer_id?: number;
  customer_name?: string;
  name?: string;
  address?: string;
  address_line1?: string;
  city?: string;
  state?: string;
  pincode?: string;
  phone?: string;
  primary_phone?: string;
  mobile?: string;
  contact_number?: string;
  contact_person?: string;
  gst_number?: string;
}
```

---

## 🔄 API Endpoints

### POST /api/challans
**Request Body**:
```json
{
  "challan_number": "DC-2401080001",
  "challan_date": "2024-01-08",
  "expected_delivery_date": "2024-01-08",
  "customer_id": 123,
  "customer_name": "ABC Pharma",
  "delivery_address": "Godown 12, Industrial Area",
  "delivery_city": "Thane",
  "delivery_state": "Maharashtra",
  "delivery_pincode": "400601",
  "transport_company": "Blue Dart",
  "vehicle_number": "MH-01-AB-1234",
  "driver_phone": "+91 98765 43210",
  "freight_charges": 250.00,
  "lr_number": "LR-2024-00123",
  "items": [
    {
      "product_id": 456,
      "product_name": "Paracetamol 500mg",
      "batch_id": 789,
      "batch_number": "B2024001",
      "dispatched_quantity": 100,
      "unit_price": 5.00,
      "gst_percent": 0,
      "uom": "TAB",
      "package_type": "UNIT"
    }
  ],
  "notes": "Handle with care",
  "total_amount": 750.00
}
```

**Response**:
```json
{
  "success": true,
  "challan_id": 101,
  "challan_number": "DC-2401080001",
  "total_amount": 750.00,
  "status": "DISPATCHED"
}
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | Create new customer |
| `Ctrl+I` | Import from Order/Invoice |
| `Ctrl+F` | Focus product search |
| `Ctrl+S` | Save challan |
| `Ctrl+P` | Print challan |
| `Esc` | Close/Go back |

---

## 🖨️ Print Options

| Option | Description |
|--------|-------------|
| **A4 Print** | Standard full-page challan |
| **Thermal 80mm** | 80mm receipt printer format |
| **Thermal 58mm** | 58mm mini receipt format |

---

**Last Updated**: 2026-01-08  
**Component**: `ChallanFlow.tsx` (177 lines)  
**Hook**: `useChallanLogic.ts` (440 lines)
