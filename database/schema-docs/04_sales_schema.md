# Sales Schema Documentation

## Overview
The `sales` schema manages the complete sales process from orders to invoices, including returns and delivery management. This is critical for pharmaceutical sales operations with batch allocation and compliance tracking.

---

## Tables

### 1. orders
**Purpose**: Sales order management and order-to-cash workflow
**API Endpoint**: `api.get_orders()`, `api.create_order()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `order_id` | SERIAL | ✓ | Unique order identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `branch_id` | INTEGER | - | Originating branch | Branch tracking |
| `order_number` | TEXT | ✓ | Order document number | Order identification |
| `order_date` | DATE | ✓ | Order creation date | Date filtering |
| `customer_id` | INTEGER | ✓ | Customer reference | Customer association |
| `customer_name` | TEXT | - | Customer name (snapshot) | Display convenience |
| `customer_phone` | TEXT | - | Customer phone (snapshot) | Contact reference |
| `order_type` | TEXT | ✓ | Type: 'regular', 'urgent', 'scheduled', 'recurring' | Order classification |
| `order_priority` | TEXT | - | Priority: 'low', 'normal', 'high', 'urgent' | Priority handling |
| `sales_person_id` | INTEGER | - | Assigned salesperson | Sales tracking |
| `order_source` | TEXT | - | Source: 'manual', 'phone', 'email', 'app', 'website' | Channel tracking |
| `delivery_date` | DATE | - | Requested delivery date | Delivery planning |
| `delivery_address` | TEXT | - | Delivery address | Logistics planning |
| `delivery_instructions` | TEXT | - | Special delivery instructions | Delivery guidance |
| `subtotal_amount` | NUMERIC(15,2) | ✓ | Subtotal before taxes | Amount calculations |
| `discount_amount` | NUMERIC(15,2) | - | Total discount amount | Discount tracking |
| `tax_amount` | NUMERIC(15,2) | - | Total tax amount | Tax calculations |
| `total_amount` | NUMERIC(15,2) | ✓ | Final order amount | Payment processing |
| `order_status` | TEXT | ✓ | Status: 'draft', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled' | Status tracking |
| `fulfillment_status` | TEXT | - | Fulfillment: 'pending', 'partial', 'fulfilled' | Fulfillment tracking |
| `payment_status` | TEXT | - | Payment: 'unpaid', 'partial', 'paid' | Payment tracking |
| `payment_terms` | TEXT | - | Payment terms | Payment planning |
| `due_date` | DATE | - | Payment due date | Payment tracking |
| `invoice_id` | INTEGER | - | Generated invoice ID | Invoice linking |
| `invoiced_amount` | NUMERIC(15,2) | - | Amount invoiced | Invoice tracking |
| `notes` | TEXT | - | Order notes/comments | Documentation |
| `cancelled_reason` | TEXT | - | Cancellation reason | Cancellation tracking |
| `cancelled_by` | INTEGER | - | User who cancelled | Cancellation audit |
| `cancelled_at` | TIMESTAMPTZ | - | Cancellation timestamp | Cancellation tracking |
| `created_by` | INTEGER | - | User who created order | User tracking |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

**Example API Response**:
```json
{
  "order_id": 1,
  "order_number": "SO-2024-001",
  "order_date": "2024-01-15",
  "customer_id": 1,
  "customer_name": "ABC Medical Store",
  "order_type": "regular",
  "delivery_date": "2024-01-17",
  "subtotal_amount": 5000.00,
  "tax_amount": 600.00,
  "total_amount": 5600.00,
  "order_status": "confirmed",
  "fulfillment_status": "pending",
  "payment_status": "unpaid"
}
```

---

### 2. order_items
**Purpose**: Individual line items within sales orders
**API Endpoint**: `api.get_order_items()`, `api.create_order_item()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `order_item_id` | SERIAL | ✓ | Unique order item identifier | Primary key |
| `order_id` | INTEGER | ✓ | Parent order reference | Order association |
| `product_id` | INTEGER | ✓ | Product reference | Product association |
| `product_name` | TEXT | - | Product name (snapshot) | Display convenience |
| `product_code` | TEXT | - | Product code (snapshot) | Reference convenience |
| `batch_id` | INTEGER | - | Specific batch allocation | Batch tracking |
| `batch_number` | TEXT | - | Batch number (snapshot) | Batch reference |
| `quantity` | NUMERIC(15,3) | ✓ | Ordered quantity | Quantity tracking |
| `delivered_quantity` | NUMERIC(15,3) | - | Delivered quantity | Fulfillment tracking |
| `unit_price` | NUMERIC(15,4) | ✓ | Unit selling price | Price calculations |
| `discount_percentage` | NUMERIC(5,2) | - | Line item discount % | Discount calculations |
| `discount_amount` | NUMERIC(15,2) | - | Line item discount amount | Discount tracking |
| `line_total` | NUMERIC(15,2) | ✓ | Line total before tax | Amount calculations |
| `gst_percentage` | NUMERIC(5,2) | - | GST rate % | Tax calculations |
| `cgst_amount` | NUMERIC(15,2) | - | CGST amount | Tax breakdown |
| `sgst_amount` | NUMERIC(15,2) | - | SGST amount | Tax breakdown |
| `igst_amount` | NUMERIC(15,2) | - | IGST amount | Tax breakdown |
| `cess_amount` | NUMERIC(15,2) | - | Cess amount | Tax calculations |
| `line_total_with_tax` | NUMERIC(15,2) | ✓ | Final line total | Final calculations |
| `delivery_status` | TEXT | - | Status: 'pending', 'partial', 'delivered' | Delivery tracking |
| `notes` | TEXT | - | Line item notes | Documentation |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

**Example API Response**:
```json
{
  "order_item_id": 1,
  "order_id": 1,
  "product_id": 101,
  "product_name": "Paracetamol 500mg",
  "quantity": 100.0,
  "unit_price": 15.00,
  "discount_percentage": 5.0,
  "line_total": 1425.00,
  "gst_percentage": 12.0,
  "cgst_amount": 85.50,
  "sgst_amount": 85.50,
  "line_total_with_tax": 1596.00,
  "delivery_status": "pending"
}
```

---

### 3. invoices
**Purpose**: Sales invoice generation and management
**API Endpoint**: `api.get_invoices()`, `api.create_invoice()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `invoice_id` | SERIAL | ✓ | Unique invoice identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `branch_id` | INTEGER | ✓ | Invoicing branch | Branch tracking |
| `invoice_number` | TEXT | ✓ | Invoice document number | Invoice identification |
| `invoice_date` | DATE | ✓ | Invoice date | Date filtering |
| `invoice_type` | TEXT | ✓ | Type: 'regular', 'proforma', 'tax_invoice', 'retail' | Invoice classification |
| `order_id` | INTEGER | - | Source order reference | Order linking |
| `customer_id` | INTEGER | ✓ | Customer reference | Customer association |
| `customer_name` | TEXT | - | Customer name (snapshot) | Display convenience |
| `customer_phone` | TEXT | - | Customer phone (snapshot) | Contact reference |
| `customer_address` | TEXT | - | Customer address (snapshot) | Address reference |
| `customer_gst` | TEXT | - | Customer GST number (snapshot) | Tax compliance |
| `sales_person_id` | INTEGER | - | Salesperson reference | Sales tracking |
| `invoice_series_id` | INTEGER | - | Number series used | Numbering tracking |
| `payment_terms` | TEXT | - | Payment terms | Payment planning |
| `due_date` | DATE | - | Payment due date | Payment tracking |
| `place_of_supply` | TEXT | - | Place of supply for GST | Tax compliance |
| `subtotal_amount` | NUMERIC(15,2) | ✓ | Subtotal before taxes | Amount calculations |
| `discount_amount` | NUMERIC(15,2) | - | Total discount amount | Discount tracking |
| `taxable_amount` | NUMERIC(15,2) | ✓ | Taxable amount | Tax calculations |
| `cgst_amount` | NUMERIC(15,2) | - | Total CGST amount | Tax breakdown |
| `sgst_amount` | NUMERIC(15,2) | - | Total SGST amount | Tax breakdown |
| `igst_amount` | NUMERIC(15,2) | - | Total IGST amount | Tax breakdown |
| `cess_amount` | NUMERIC(15,2) | - | Total cess amount | Tax calculations |
| `total_tax_amount` | NUMERIC(15,2) | ✓ | Total tax amount | Tax summary |
| `final_amount` | NUMERIC(15,2) | ✓ | Final invoice amount | Payment processing |
| `paid_amount` | NUMERIC(15,2) | - | Amount paid | Payment tracking |
| `outstanding_amount` | NUMERIC(15,2) | - | Amount outstanding | Payment tracking |
| `invoice_status` | TEXT | ✓ | Status: 'draft', 'posted', 'paid', 'overdue', 'cancelled' | Status tracking |
| `payment_status` | TEXT | - | Payment: 'unpaid', 'partial', 'paid' | Payment tracking |
| `e_invoice_number` | TEXT | - | E-invoice IRN | Digital compliance |
| `e_invoice_status` | TEXT | - | E-invoice status | Digital compliance |
| `qr_code_data` | TEXT | - | Invoice QR code data | Digital verification |
| `notes` | TEXT | - | Invoice notes | Documentation |
| `terms_conditions` | TEXT | - | Terms and conditions | Legal terms |
| `cancelled_reason` | TEXT | - | Cancellation reason | Cancellation tracking |
| `cancelled_by` | INTEGER | - | User who cancelled | Cancellation audit |
| `cancelled_at` | TIMESTAMPTZ | - | Cancellation timestamp | Cancellation tracking |
| `created_by` | INTEGER | - | User who created invoice | User tracking |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

**Example API Response**:
```json
{
  "invoice_id": 1,
  "invoice_number": "INV-2024-001",
  "invoice_date": "2024-01-15",
  "invoice_type": "tax_invoice",
  "customer_id": 1,
  "customer_name": "ABC Medical Store",
  "subtotal_amount": 5000.00,
  "total_tax_amount": 600.00,
  "final_amount": 5600.00,
  "paid_amount": 0.00,
  "outstanding_amount": 5600.00,
  "invoice_status": "posted",
  "payment_status": "unpaid",
  "due_date": "2024-02-14"
}
```

---

### 4. invoice_items
**Purpose**: Individual line items within invoices with batch allocation
**API Endpoint**: `api.get_invoice_items()`, `api.create_invoice_item()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `invoice_item_id` | SERIAL | ✓ | Unique invoice item identifier | Primary key |
| `invoice_id` | INTEGER | ✓ | Parent invoice reference | Invoice association |
| `order_item_id` | INTEGER | - | Source order item reference | Order linking |
| `product_id` | INTEGER | ✓ | Product reference | Product association |
| `product_name` | TEXT | - | Product name (snapshot) | Display convenience |
| `product_code` | TEXT | - | Product code (snapshot) | Reference convenience |
| `hsn_code` | TEXT | - | HSN code (snapshot) | Tax compliance |
| `batch_allocation` | JSONB | - | Batch allocation details | Batch tracking |
| `quantity` | NUMERIC(15,3) | ✓ | Invoiced quantity | Quantity tracking |
| `unit_price` | NUMERIC(15,4) | ✓ | Unit selling price | Price calculations |
| `discount_percentage` | NUMERIC(5,2) | - | Line item discount % | Discount calculations |
| `discount_amount` | NUMERIC(15,2) | - | Line item discount amount | Discount tracking |
| `line_total` | NUMERIC(15,2) | ✓ | Line total before tax | Amount calculations |
| `gst_percentage` | NUMERIC(5,2) | - | GST rate % | Tax calculations |
| `cgst_percentage` | NUMERIC(5,2) | - | CGST rate % | Tax breakdown |
| `sgst_percentage` | NUMERIC(5,2) | - | SGST rate % | Tax breakdown |
| `igst_percentage` | NUMERIC(5,2) | - | IGST rate % | Tax breakdown |
| `cgst_amount` | NUMERIC(15,2) | - | CGST amount | Tax breakdown |
| `sgst_amount` | NUMERIC(15,2) | - | SGST amount | Tax breakdown |
| `igst_amount` | NUMERIC(15,2) | - | IGST amount | Tax breakdown |
| `cess_percentage` | NUMERIC(5,2) | - | Cess rate % | Tax calculations |
| `cess_amount` | NUMERIC(15,2) | - | Cess amount | Tax calculations |
| `line_total_with_tax` | NUMERIC(15,2) | ✓ | Final line total | Final calculations |
| `pack_size` | INTEGER | - | Pack size (snapshot) | Inventory calculations |
| `mrp` | NUMERIC(15,4) | - | MRP (snapshot) | Price validation |
| `expiry_date` | DATE | - | Product expiry date | Compliance tracking |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

**batch_allocation JSONB Structure**:
```json
[
  {
    "batch_id": 1,
    "batch_number": "BT240115001",
    "quantity": 50.0,
    "expiry_date": "2025-01-15",
    "unit_cost": 10.50
  }
]
```

---

### 5. delivery_challans
**Purpose**: Delivery challan/dispatch note management
**API Endpoint**: `api.get_challans()`, `api.create_challan()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `challan_id` | SERIAL | ✓ | Unique challan identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `branch_id` | INTEGER | ✓ | Dispatching branch | Branch tracking |
| `challan_number` | TEXT | ✓ | Challan document number | Challan identification |
| `challan_date` | DATE | ✓ | Dispatch date | Date filtering |
| `challan_type` | TEXT | ✓ | Type: 'delivery', 'return', 'transfer', 'sample' | Challan classification |
| `invoice_id` | INTEGER | - | Related invoice reference | Invoice linking |
| `order_id` | INTEGER | - | Related order reference | Order linking |
| `customer_id` | INTEGER | ✓ | Customer reference | Customer association |
| `customer_name` | TEXT | - | Customer name (snapshot) | Display convenience |
| `delivery_address` | TEXT | ✓ | Delivery address | Logistics information |
| `delivery_contact_person` | TEXT | - | Contact person at delivery | Contact reference |
| `delivery_phone` | TEXT | - | Contact phone | Contact reference |
| `transporter_name` | TEXT | - | Transporter/logistics partner | Logistics tracking |
| `vehicle_number` | TEXT | - | Vehicle registration number | Transport tracking |
| `driver_name` | TEXT | - | Driver name | Transport information |
| `driver_phone` | TEXT | - | Driver contact | Transport contact |
| `lr_number` | TEXT | - | Lorry receipt number | Transport reference |
| `lr_date` | DATE | - | LR date | Transport tracking |
| `distance_km` | NUMERIC(10,2) | - | Delivery distance | Logistics planning |
| `e_way_bill_number` | TEXT | - | E-way bill number | Compliance tracking |
| `e_way_bill_date` | DATE | - | E-way bill date | Compliance tracking |
| `e_way_bill_valid_until` | TIMESTAMPTZ | - | E-way bill validity | Compliance tracking |
| `total_packages` | INTEGER | - | Number of packages | Logistics information |
| `total_weight_kg` | NUMERIC(10,3) | - | Total weight | Logistics planning |
| `subtotal_amount` | NUMERIC(15,2) | - | Subtotal amount | Amount reference |
| `total_amount` | NUMERIC(15,2) | - | Total challan amount | Amount reference |
| `challan_status` | TEXT | ✓ | Status: 'draft', 'dispatched', 'in_transit', 'delivered', 'returned' | Status tracking |
| `dispatch_time` | TIMESTAMPTZ | - | Actual dispatch time | Logistics tracking |
| `delivered_time` | TIMESTAMPTZ | - | Actual delivery time | Delivery tracking |
| `received_by` | TEXT | - | Person who received goods | Delivery confirmation |
| `delivery_notes` | TEXT | - | Delivery notes/comments | Documentation |
| `created_by` | INTEGER | - | User who created challan | User tracking |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

**Example API Response**:
```json
{
  "challan_id": 1,
  "challan_number": "DC-2024-001",
  "challan_date": "2024-01-15",
  "challan_type": "delivery",
  "customer_name": "ABC Medical Store",
  "delivery_address": "123 Main Street, Mumbai",
  "transporter_name": "XYZ Logistics",
  "vehicle_number": "MH01AB1234",
  "e_way_bill_number": "123456789012",
  "challan_status": "dispatched",
  "total_packages": 2,
  "total_weight_kg": 15.5
}
```

---

### 6. sales_returns
**Purpose**: Sales return and credit note management
**API Endpoint**: `api.get_returns()`, `api.create_return()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `return_id` | SERIAL | ✓ | Unique return identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `branch_id` | INTEGER | ✓ | Return processing branch | Branch tracking |
| `return_number` | TEXT | ✓ | Return document number | Return identification |
| `return_date` | DATE | ✓ | Return date | Date filtering |
| `return_type` | TEXT | ✓ | Type: 'quality_issue', 'damage', 'expiry', 'excess_supply', 'customer_request' | Return classification |
| `invoice_id` | INTEGER | ✓ | Original invoice reference | Invoice linking |
| `invoice_number` | TEXT | - | Invoice number (snapshot) | Reference convenience |
| `customer_id` | INTEGER | ✓ | Customer reference | Customer association |
| `customer_name` | TEXT | - | Customer name (snapshot) | Display convenience |
| `return_reason` | TEXT | ✓ | Detailed return reason | Documentation |
| `subtotal_amount` | NUMERIC(15,2) | ✓ | Return subtotal | Amount calculations |
| `tax_amount` | NUMERIC(15,2) | - | Return tax amount | Tax calculations |
| `total_amount` | NUMERIC(15,2) | ✓ | Total return amount | Amount tracking |
| `credit_note_number` | TEXT | - | Generated credit note number | Credit note reference |
| `credit_note_date` | DATE | - | Credit note date | Credit tracking |
| `credit_note_status` | TEXT | - | Status: 'pending', 'issued', 'adjusted' | Credit tracking |
| `refund_mode` | TEXT | - | Mode: 'cash', 'bank_transfer', 'credit_adjustment', 'replacement' | Refund processing |
| `refund_amount` | NUMERIC(15,2) | - | Actual refund amount | Refund tracking |
| `approval_status` | TEXT | ✓ | Status: 'pending', 'approved', 'rejected' | Approval workflow |
| `approved_by` | INTEGER | - | Approver user ID | Approval tracking |
| `approved_at` | TIMESTAMPTZ | - | Approval timestamp | Approval tracking |
| `rejection_reason` | TEXT | - | Rejection reason if rejected | Rejection documentation |
| `quality_check_status` | TEXT | - | QC status: 'pending', 'passed', 'failed' | Quality tracking |
| `quality_check_notes` | TEXT | - | QC notes | Quality documentation |
| `created_by` | INTEGER | - | User who created return | User tracking |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

---

### 7. sales_return_items
**Purpose**: Individual items in sales returns
**API Endpoint**: `api.get_return_items()`, `api.create_return_item()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `return_item_id` | SERIAL | ✓ | Unique return item identifier | Primary key |
| `return_id` | INTEGER | ✓ | Parent return reference | Return association |
| `invoice_item_id` | INTEGER | ✓ | Original invoice item reference | Item linking |
| `product_id` | INTEGER | ✓ | Product reference | Product association |
| `product_name` | TEXT | - | Product name (snapshot) | Display convenience |
| `batch_id` | INTEGER | - | Batch reference | Batch tracking |
| `batch_number` | TEXT | - | Batch number (snapshot) | Batch reference |
| `returned_quantity` | NUMERIC(15,3) | ✓ | Returned quantity | Quantity tracking |
| `saleable_quantity` | NUMERIC(15,3) | - | Quantity fit for resale | Stock restoration |
| `damaged_quantity` | NUMERIC(15,3) | - | Damaged quantity | Loss tracking |
| `expired_quantity` | NUMERIC(15,3) | - | Expired quantity | Waste tracking |
| `unit_price` | NUMERIC(15,4) | ✓ | Original unit price | Price calculations |
| `line_total` | NUMERIC(15,2) | ✓ | Return line total | Amount calculations |
| `return_reason` | TEXT | ✓ | Item-specific return reason | Documentation |
| `damage_reason` | TEXT | - | Damage reason if applicable | Quality documentation |
| `quality_check_result` | TEXT | - | QC result: 'saleable', 'damaged', 'expired' | Quality classification |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |

---

## API Integration Notes

### Order Management
```javascript
// Create order with validation
const order = {
  customer_id: 1,
  order_type: "regular",
  delivery_date: "2024-01-17",
  items: [
    {
      product_id: 101,
      quantity: 100,
      unit_price: 15.00,
      gst_percentage: 12.0
    }
  ]
};

// Order status workflow
const statusFlow = ['draft', 'confirmed', 'processing', 'shipped', 'delivered'];
```

### Invoice Generation
```javascript
// Generate invoice from order
POST /api/invoices/generate-from-order
{
  "order_id": 1,
  "invoice_date": "2024-01-15",
  "due_date": "2024-02-14",
  "batch_allocations": [
    {
      "order_item_id": 1,
      "batch_id": 1,
      "quantity": 100
    }
  ]
}
```

### Batch Allocation
```javascript
// Batch allocation for invoice items
const batchAllocation = [
  {
    "batch_id": 1,
    "batch_number": "BT240115001",
    "quantity": 50.0,
    "expiry_date": "2025-01-15",
    "unit_cost": 10.50
  },
  {
    "batch_id": 2,
    "batch_number": "BT240120001", 
    "quantity": 50.0,
    "expiry_date": "2025-02-20",
    "unit_cost": 11.00
  }
];
```

### Tax Calculations
```javascript
// GST calculation logic
function calculateGST(amount, gstRate, customerState, companyState) {
  const taxAmount = (amount * gstRate) / 100;
  
  if (customerState === companyState) {
    // Intra-state: CGST + SGST
    return {
      cgst_percentage: gstRate / 2,
      sgst_percentage: gstRate / 2,
      cgst_amount: taxAmount / 2,
      sgst_amount: taxAmount / 2,
      igst_percentage: 0,
      igst_amount: 0
    };
  } else {
    // Inter-state: IGST
    return {
      cgst_percentage: 0,
      sgst_percentage: 0,
      cgst_amount: 0,
      sgst_amount: 0,
      igst_percentage: gstRate,
      igst_amount: taxAmount
    };
  }
}
```

### Return Processing
```javascript
// Process sales return
const salesReturn = {
  invoice_id: 1,
  return_type: "quality_issue",
  return_reason: "Product damaged during transport",
  items: [
    {
      invoice_item_id: 1,
      returned_quantity: 10,
      saleable_quantity: 0,
      damaged_quantity: 10,
      return_reason: "Physical damage"
    }
  ]
};
```

### Search and Filtering
```javascript
// Advanced sales search
GET /api/sales/search?
  customer_id=1&                   // Customer filter
  invoice_status=posted&           // Status filter
  payment_status=unpaid&           // Payment filter
  date_from=2024-01-01&           // Date range
  date_to=2024-01-31&
  min_amount=1000&                // Amount range
  salesperson_id=5&               // Salesperson filter
  sort_by=invoice_date&           // Sort options
  order=desc                      // Sort direction
```

### Compliance Features
1. **E-Invoice Integration**: IRN generation and QR codes
2. **E-Way Bill**: Automatic generation for interstate sales
3. **GST Compliance**: Proper tax calculation and reporting
4. **Batch Tracking**: Complete batch traceability
5. **Return Management**: Quality-based return processing

### Validation Rules
1. **Order Quantities**: Cannot exceed available stock
2. **Pricing**: Cannot be below cost unless authorized
3. **GST Numbers**: Must be valid if provided
4. **Batch Allocation**: Must match invoice quantities
5. **Return Quantities**: Cannot exceed original invoice quantities