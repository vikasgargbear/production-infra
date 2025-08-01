# Procurement Schema Documentation

## Overview
The `procurement` schema manages the complete procurement process from purchase requisitions to goods receipt, including supplier management, quality control, and inventory inward processing.

---

## Tables

### 1. purchase_orders
**Purpose**: Purchase order management and supplier ordering
**API Endpoint**: `api.get_purchase_orders()`, `api.create_purchase_order()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `po_id` | SERIAL | ✓ | Unique purchase order identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `branch_id` | INTEGER | ✓ | Ordering branch | Branch tracking |
| `po_number` | TEXT | ✓ | PO document number | PO identification |
| `po_date` | DATE | ✓ | Order creation date | Date filtering |
| `po_type` | TEXT | ✓ | Type: 'regular', 'urgent', 'scheduled', 'blanket' | PO classification |
| `supplier_id` | INTEGER | ✓ | Supplier reference | Supplier association |
| `supplier_name` | TEXT | - | Supplier name (snapshot) | Display convenience |
| `supplier_contact` | TEXT | - | Supplier contact info (snapshot) | Contact reference |
| `supplier_gst` | TEXT | - | Supplier GST (snapshot) | Tax compliance |
| `requisition_id` | INTEGER | - | Source requisition reference | Requisition linking |
| `buyer_id` | INTEGER | - | Purchasing officer | User tracking |
| `delivery_date` | DATE | - | Expected delivery date | Planning tracking |
| `delivery_branch_id` | INTEGER | - | Delivery destination branch | Delivery planning |
| `delivery_address` | TEXT | - | Delivery address | Logistics information |
| `payment_terms` | TEXT | - | Payment terms | Payment planning |
| `payment_days` | INTEGER | - | Payment due days | Payment tracking |
| `currency_code` | TEXT | - | Transaction currency | Multi-currency support |
| `exchange_rate` | NUMERIC(10,6) | - | Currency exchange rate | Currency conversion |
| `subtotal_amount` | NUMERIC(15,2) | ✓ | Subtotal before taxes | Amount calculations |
| `discount_percentage` | NUMERIC(5,2) | - | Overall discount % | Discount tracking |
| `discount_amount` | NUMERIC(15,2) | - | Total discount amount | Discount calculations |
| `freight_amount` | NUMERIC(15,2) | - | Freight/shipping charges | Additional costs |
| `other_charges` | NUMERIC(15,2) | - | Other charges | Additional costs |
| `tax_amount` | NUMERIC(15,2) | - | Total tax amount | Tax calculations |
| `total_amount` | NUMERIC(15,2) | ✓ | Final PO amount | Payment processing |
| `advance_amount` | NUMERIC(15,2) | - | Advance payment amount | Payment tracking |
| `po_status` | TEXT | ✓ | Status: 'draft', 'approved', 'sent', 'acknowledged', 'partial', 'completed', 'cancelled' | Status tracking |
| `approval_status` | TEXT | - | Approval: 'pending', 'approved', 'rejected' | Approval workflow |
| `approved_by` | INTEGER | - | Approver user ID | Approval tracking |
| `approved_at` | TIMESTAMPTZ | - | Approval timestamp | Approval tracking |
| `grn_status` | TEXT | - | GRN: 'pending', 'partial', 'completed' | Receipt tracking |
| `payment_status` | TEXT | - | Payment: 'unpaid', 'partial', 'paid' | Payment tracking |
| `quality_check_required` | BOOLEAN | - | QC requirement flag | Quality control |
| `special_instructions` | TEXT | - | Special handling instructions | Special requirements |
| `internal_notes` | TEXT | - | Internal notes | Internal documentation |
| `supplier_notes` | TEXT | - | Notes to supplier | Supplier communication |
| `cancelled_reason` | TEXT | - | Cancellation reason | Cancellation tracking |
| `cancelled_by` | INTEGER | - | User who cancelled | Cancellation audit |
| `cancelled_at` | TIMESTAMPTZ | - | Cancellation timestamp | Cancellation tracking |
| `created_by` | INTEGER | - | User who created PO | User tracking |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

**Example API Response**:
```json
{
  "po_id": 1,
  "po_number": "PO-2024-001",
  "po_date": "2024-01-15",
  "po_type": "regular",
  "supplier_id": 1,
  "supplier_name": "XYZ Pharmaceuticals",
  "delivery_date": "2024-01-22",
  "subtotal_amount": 50000.00,
  "tax_amount": 6000.00,
  "total_amount": 56000.00,
  "po_status": "approved",
  "grn_status": "pending",
  "payment_status": "unpaid"
}
```

---

### 2. purchase_order_items
**Purpose**: Individual line items within purchase orders
**API Endpoint**: `api.get_po_items()`, `api.create_po_item()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `po_item_id` | SERIAL | ✓ | Unique PO item identifier | Primary key |
| `po_id` | INTEGER | ✓ | Parent PO reference | PO association |
| `product_id` | INTEGER | ✓ | Product reference | Product association |
| `product_name` | TEXT | - | Product name (snapshot) | Display convenience |
| `product_code` | TEXT | - | Product code (snapshot) | Reference convenience |
| `manufacturer` | TEXT | - | Manufacturer name | Product information |
| `supplier_product_code` | TEXT | - | Supplier's product code | Supplier reference |
| `pack_size` | INTEGER | - | Units per pack | Quantity calculations |
| `ordered_quantity` | NUMERIC(15,3) | ✓ | Ordered quantity | Quantity tracking |
| `unit_price` | NUMERIC(15,4) | ✓ | Unit purchase price | Price calculations |
| `free_quantity` | NUMERIC(15,3) | - | Free/bonus quantity | Scheme tracking |
| `discount_percentage` | NUMERIC(5,2) | - | Line item discount % | Discount calculations |
| `discount_amount` | NUMERIC(15,2) | - | Line item discount amount | Discount tracking |
| `line_total` | NUMERIC(15,2) | ✓ | Line total before tax | Amount calculations |
| `gst_percentage` | NUMERIC(5,2) | - | GST rate % | Tax calculations |
| `cgst_amount` | NUMERIC(15,2) | - | CGST amount | Tax breakdown |
| `sgst_amount` | NUMERIC(15,2) | - | SGST amount | Tax breakdown |
| `igst_amount` | NUMERIC(15,2) | - | IGST amount | Tax breakdown |
| `cess_amount` | NUMERIC(15,2) | - | Cess amount | Tax calculations |
| `line_total_with_tax` | NUMERIC(15,2) | ✓ | Final line total | Final calculations |
| `received_quantity` | NUMERIC(15,3) | - | Quantity received via GRN | Receipt tracking |
| `accepted_quantity` | NUMERIC(15,3) | - | Quantity accepted after QC | Quality tracking |
| `rejected_quantity` | NUMERIC(15,3) | - | Quantity rejected in QC | Quality tracking |
| `pending_quantity` | NUMERIC(15,3) | - | Quantity yet to receive | Pending tracking |
| `required_by_date` | DATE | - | Required delivery date | Planning information |
| `specifications` | TEXT | - | Product specifications | Quality requirements |
| `notes` | TEXT | - | Line item notes | Documentation |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

**Example API Response**:
```json
{
  "po_item_id": 1,
  "po_id": 1,
  "product_id": 101,
  "product_name": "Paracetamol 500mg",
  "ordered_quantity": 1000.0,
  "unit_price": 10.50,
  "free_quantity": 100.0,
  "discount_percentage": 5.0,
  "line_total": 9975.00,
  "gst_percentage": 12.0,
  "line_total_with_tax": 11172.00,
  "received_quantity": 0.0,
  "pending_quantity": 1000.0
}
```

---

### 3. goods_receipt_notes
**Purpose**: Goods receipt and quality control management
**API Endpoint**: `api.get_grns()`, `api.create_grn()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `grn_id` | SERIAL | ✓ | Unique GRN identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `branch_id` | INTEGER | ✓ | Receiving branch | Branch tracking |
| `grn_number` | TEXT | ✓ | GRN document number | GRN identification |
| `grn_date` | DATE | ✓ | Receipt date | Date filtering |
| `grn_type` | TEXT | ✓ | Type: 'purchase', 'return', 'transfer', 'replacement' | GRN classification |
| `po_id` | INTEGER | - | Source PO reference | PO linking |
| `po_number` | TEXT | - | PO number (snapshot) | Reference convenience |
| `supplier_id` | INTEGER | ✓ | Supplier reference | Supplier association |
| `supplier_name` | TEXT | - | Supplier name (snapshot) | Display convenience |
| `supplier_invoice_number` | TEXT | - | Supplier's invoice number | Supplier reference |
| `supplier_invoice_date` | DATE | - | Supplier's invoice date | Invoice tracking |
| `dc_number` | TEXT | - | Delivery challan number | Delivery reference |
| `dc_date` | DATE | - | Delivery challan date | Delivery tracking |
| `received_by` | INTEGER | ✓ | Receiving user | User tracking |
| `transporter_name` | TEXT | - | Transport company | Logistics tracking |
| `lr_number` | TEXT | - | Lorry receipt number | Transport reference |
| `lr_date` | DATE | - | LR date | Transport tracking |
| `vehicle_number` | TEXT | - | Vehicle registration | Transport tracking |
| `total_items` | INTEGER | - | Total line items | Count tracking |
| `total_quantity` | NUMERIC(15,3) | - | Total received quantity | Quantity summary |
| `subtotal_amount` | NUMERIC(15,2) | - | Subtotal amount | Amount tracking |
| `tax_amount` | NUMERIC(15,2) | - | Total tax amount | Tax tracking |
| `total_amount` | NUMERIC(15,2) | - | Total GRN amount | Amount summary |
| `grn_status` | TEXT | ✓ | Status: 'draft', 'received', 'qc_pending', 'qc_completed', 'approved', 'rejected' | Status tracking |
| `qc_status` | TEXT | - | QC: 'pending', 'in_progress', 'passed', 'failed', 'conditional' | Quality tracking |
| `qc_completed_by` | INTEGER | - | QC inspector user ID | Quality tracking |
| `qc_completed_at` | TIMESTAMPTZ | - | QC completion timestamp | Quality tracking |
| `approval_status` | TEXT | - | Approval: 'pending', 'approved', 'rejected' | Approval workflow |
| `approved_by` | INTEGER | - | Approver user ID | Approval tracking |
| `approved_at` | TIMESTAMPTZ | - | Approval timestamp | Approval tracking |
| `rejection_reason` | TEXT | - | Rejection reason | Rejection documentation |
| `storage_location_id` | INTEGER | - | Default storage location | Storage planning |
| `notes` | TEXT | - | GRN notes | Documentation |
| `created_by` | INTEGER | - | User who created GRN | User tracking |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

**Example API Response**:
```json
{
  "grn_id": 1,
  "grn_number": "GRN-2024-001",
  "grn_date": "2024-01-22",
  "grn_type": "purchase",
  "po_id": 1,
  "supplier_name": "XYZ Pharmaceuticals",
  "supplier_invoice_number": "INV/2024/12345",
  "total_quantity": 1100.0,
  "grn_status": "qc_pending",
  "qc_status": "pending",
  "approval_status": "pending"
}
```

---

### 4. grn_items
**Purpose**: Individual items received in GRN with batch details
**API Endpoint**: `api.get_grn_items()`, `api.create_grn_item()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `grn_item_id` | SERIAL | ✓ | Unique GRN item identifier | Primary key |
| `grn_id` | INTEGER | ✓ | Parent GRN reference | GRN association |
| `po_item_id` | INTEGER | - | Source PO item reference | PO linking |
| `product_id` | INTEGER | ✓ | Product reference | Product association |
| `product_name` | TEXT | - | Product name (snapshot) | Display convenience |
| `batch_number` | TEXT | ✓ | Manufacturer batch number | Batch tracking |
| `manufacturing_date` | DATE | - | Manufacturing date | Batch information |
| `expiry_date` | DATE | ✓ | Product expiry date | Expiry validation |
| `received_quantity` | NUMERIC(15,3) | ✓ | Quantity received | Receipt tracking |
| `damaged_quantity` | NUMERIC(15,3) | - | Damaged quantity | Damage tracking |
| `shortage_quantity` | NUMERIC(15,3) | - | Shortage quantity | Shortage tracking |
| `excess_quantity` | NUMERIC(15,3) | - | Excess quantity | Excess tracking |
| `sample_quantity` | NUMERIC(15,3) | - | QC sample quantity | Quality sampling |
| `accepted_quantity` | NUMERIC(15,3) | - | Quantity accepted after QC | Quality tracking |
| `rejected_quantity` | NUMERIC(15,3) | - | Quantity rejected in QC | Quality tracking |
| `pack_size` | INTEGER | - | Units per pack | Inventory calculations |
| `unit_price` | NUMERIC(15,4) | ✓ | Unit cost price | Cost tracking |
| `mrp` | NUMERIC(15,4) | - | Maximum retail price | Price validation |
| `selling_price` | NUMERIC(15,4) | - | Selling price | Price planning |
| `line_total` | NUMERIC(15,2) | ✓ | Line total amount | Amount calculations |
| `storage_location_id` | INTEGER | - | Assigned storage location | Storage allocation |
| `qc_status` | TEXT | - | QC: 'pending', 'passed', 'failed', 'conditional' | Quality status |
| `qc_notes` | TEXT | - | Quality check notes | Quality documentation |
| `qc_parameters` | JSONB | - | QC test parameters and results | Quality details |
| `rejection_reason` | TEXT | - | Rejection reason if failed | Quality documentation |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

**qc_parameters JSONB Structure**:
```json
{
  "visual_inspection": "passed",
  "packaging_integrity": "passed",
  "label_verification": "passed",
  "weight_check": {
    "expected": 100.0,
    "actual": 99.8,
    "status": "passed"
  },
  "moisture_content": {
    "value": 2.5,
    "limit": 5.0,
    "status": "passed"
  }
}
```

---

### 5. purchase_requisitions
**Purpose**: Internal purchase requisition management
**API Endpoint**: `api.get_requisitions()`, `api.create_requisition()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `requisition_id` | SERIAL | ✓ | Unique requisition identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `branch_id` | INTEGER | ✓ | Requesting branch | Branch tracking |
| `requisition_number` | TEXT | ✓ | Requisition document number | Document identification |
| `requisition_date` | DATE | ✓ | Request date | Date filtering |
| `requisition_type` | TEXT | ✓ | Type: 'stock', 'urgent', 'seasonal', 'new_product' | Request classification |
| `department_id` | INTEGER | - | Requesting department | Department tracking |
| `requested_by` | INTEGER | ✓ | Requesting user | User tracking |
| `required_by_date` | DATE | - | Required delivery date | Planning information |
| `priority` | TEXT | - | Priority: 'low', 'normal', 'high', 'urgent' | Priority management |
| `justification` | TEXT | - | Request justification | Documentation |
| `estimated_amount` | NUMERIC(15,2) | - | Estimated total amount | Budget planning |
| `requisition_status` | TEXT | ✓ | Status: 'draft', 'submitted', 'approved', 'po_created', 'completed', 'cancelled' | Status tracking |
| `approval_status` | TEXT | - | Approval: 'pending', 'approved', 'rejected' | Approval workflow |
| `approved_by` | INTEGER | - | Approver user ID | Approval tracking |
| `approved_at` | TIMESTAMPTZ | - | Approval timestamp | Approval tracking |
| `po_created` | BOOLEAN | - | PO creation flag | PO tracking |
| `notes` | TEXT | - | Requisition notes | Documentation |
| `created_by` | INTEGER | - | User who created requisition | User tracking |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

---

### 6. purchase_requisition_items
**Purpose**: Individual items in purchase requisitions
**API Endpoint**: `api.get_requisition_items()`, `api.create_requisition_item()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `requisition_item_id` | SERIAL | ✓ | Unique requisition item identifier | Primary key |
| `requisition_id` | INTEGER | ✓ | Parent requisition reference | Requisition association |
| `product_id` | INTEGER | ✓ | Product reference | Product association |
| `product_name` | TEXT | - | Product name (snapshot) | Display convenience |
| `current_stock` | NUMERIC(15,3) | - | Current stock level | Stock information |
| `reorder_level` | NUMERIC(15,3) | - | Reorder level | Planning information |
| `requested_quantity` | NUMERIC(15,3) | ✓ | Requested quantity | Quantity tracking |
| `approved_quantity` | NUMERIC(15,3) | - | Approved quantity | Approval tracking |
| `unit_price_estimate` | NUMERIC(15,4) | - | Estimated unit price | Cost planning |
| `total_estimate` | NUMERIC(15,2) | - | Estimated line total | Budget planning |
| `preferred_supplier_id` | INTEGER | - | Preferred supplier | Supplier preference |
| `justification` | TEXT | - | Item-specific justification | Documentation |
| `po_created` | BOOLEAN | - | PO creation flag | PO tracking |
| `po_id` | INTEGER | - | Created PO reference | PO linking |
| `notes` | TEXT | - | Item notes | Documentation |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |

---

### 7. supplier_quotations
**Purpose**: Supplier quotation and price comparison
**API Endpoint**: `api.get_quotations()`, `api.create_quotation()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `quotation_id` | SERIAL | ✓ | Unique quotation identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `quotation_number` | TEXT | ✓ | Quotation reference number | Document identification |
| `quotation_date` | DATE | ✓ | Quotation date | Date filtering |
| `supplier_id` | INTEGER | ✓ | Supplier reference | Supplier association |
| `supplier_name` | TEXT | - | Supplier name (snapshot) | Display convenience |
| `rfq_number` | TEXT | - | Request for quotation number | RFQ tracking |
| `valid_from` | DATE | ✓ | Validity start date | Validity tracking |
| `valid_until` | DATE | ✓ | Validity end date | Validity tracking |
| `delivery_terms` | TEXT | - | Delivery terms | Terms tracking |
| `payment_terms` | TEXT | - | Payment terms | Terms tracking |
| `currency_code` | TEXT | - | Quote currency | Currency tracking |
| `total_items` | INTEGER | - | Total quoted items | Count tracking |
| `total_amount` | NUMERIC(15,2) | - | Total quote amount | Amount tracking |
| `quotation_status` | TEXT | ✓ | Status: 'draft', 'submitted', 'under_review', 'accepted', 'rejected', 'expired' | Status tracking |
| `comparison_rank` | INTEGER | - | Rank in comparison | Comparison tracking |
| `notes` | TEXT | - | Quotation notes | Documentation |
| `created_by` | INTEGER | - | User who created record | User tracking |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |

---

### 8. supplier_quotation_items
**Purpose**: Individual items in supplier quotations
**API Endpoint**: `api.get_quotation_items()`, `api.create_quotation_item()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `quotation_item_id` | SERIAL | ✓ | Unique quotation item identifier | Primary key |
| `quotation_id` | INTEGER | ✓ | Parent quotation reference | Quotation association |
| `product_id` | INTEGER | ✓ | Product reference | Product association |
| `product_name` | TEXT | - | Product name (snapshot) | Display convenience |
| `quantity` | NUMERIC(15,3) | ✓ | Quoted quantity | Quantity tracking |
| `unit_price` | NUMERIC(15,4) | ✓ | Unit price quote | Price tracking |
| `discount_percentage` | NUMERIC(5,2) | - | Discount offered % | Discount tracking |
| `free_quantity` | NUMERIC(15,3) | - | Free quantity offered | Scheme tracking |
| `tax_percentage` | NUMERIC(5,2) | - | Tax rate % | Tax tracking |
| `delivery_days` | INTEGER | - | Delivery lead time | Planning information |
| `minimum_order_quantity` | NUMERIC(15,3) | - | MOQ requirement | Order planning |
| `packing_details` | TEXT | - | Packing specifications | Product information |
| `line_total` | NUMERIC(15,2) | ✓ | Line total amount | Amount calculations |
| `is_selected` | BOOLEAN | - | Selected for PO flag | Selection tracking |
| `notes` | TEXT | - | Item notes | Documentation |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |

---

## API Integration Notes

### Purchase Order Workflow
```javascript
// Create purchase order
const purchaseOrder = {
  po_type: "regular",
  supplier_id: 1,
  delivery_date: "2024-01-22",
  items: [
    {
      product_id: 101,
      ordered_quantity: 1000,
      unit_price: 10.50,
      gst_percentage: 12.0
    }
  ]
};

// PO status workflow
const poStatusFlow = ['draft', 'approved', 'sent', 'acknowledged', 'partial', 'completed'];
```

### GRN Processing
```javascript
// Create GRN from PO
POST /api/grn/create-from-po
{
  "po_id": 1,
  "grn_date": "2024-01-22",
  "supplier_invoice_number": "INV/2024/12345",
  "items": [
    {
      "po_item_id": 1,
      "batch_number": "BT240122001",
      "expiry_date": "2025-01-22",
      "received_quantity": 1000,
      "unit_price": 10.50
    }
  ]
}
```

### Quality Control
```javascript
// QC parameter recording
const qcParameters = {
  "visual_inspection": "passed",
  "packaging_integrity": "passed",
  "label_verification": "passed",
  "weight_check": {
    "expected": 100.0,
    "actual": 99.8,
    "status": "passed"
  },
  "assay": {
    "value": 99.5,
    "specification": "98.0-102.0",
    "status": "passed"
  }
};

// Update GRN item with QC results
PATCH /api/grn-items/1
{
  "qc_status": "passed",
  "accepted_quantity": 990,
  "rejected_quantity": 10,
  "qc_parameters": qcParameters
}
```

### Requisition to PO
```javascript
// Convert approved requisitions to PO
POST /api/purchase-orders/create-from-requisitions
{
  "requisition_ids": [1, 2, 3],
  "supplier_id": 1,
  "combine_items": true,
  "delivery_date": "2024-01-30"
}
```

### Supplier Quotation Comparison
```javascript
// Compare quotations
GET /api/quotations/compare?
  product_ids=101,102,103&
  valid_date=2024-01-15&
  sort_by=total_amount&
  include_delivery_time=true

// Response includes ranked quotations
{
  "quotations": [
    {
      "quotation_id": 1,
      "supplier_name": "Supplier A",
      "total_amount": 50000,
      "average_delivery_days": 7,
      "comparison_rank": 1,
      "items": [...]
    }
  ]
}
```

### Search and Filtering
```javascript
// Advanced procurement search
GET /api/procurement/search?
  po_status=approved&              // PO status filter
  supplier_id=1&                   // Supplier filter
  grn_status=pending&              // GRN status filter
  date_from=2024-01-01&           // Date range
  date_to=2024-01-31&
  product_id=101&                  // Product filter
  pending_delivery=true&           // Pending deliveries only
  sort_by=po_date&                // Sort options
  order=desc                       // Sort direction
```

### Compliance Features
1. **Quality Control**: Multi-parameter QC with pass/fail tracking
2. **Batch Tracking**: Complete batch traceability from receipt
3. **Expiry Validation**: Automatic expiry date validation
4. **Document Management**: Supplier invoices, DC, LR tracking
5. **Approval Workflows**: Multi-level approval for PO and GRN

### Dashboard Metrics
```javascript
// Procurement dashboard data
GET /api/procurement/dashboard
{
  "pending_pos": 5,
  "pending_grns": 3,
  "overdue_deliveries": 2,
  "pending_payments": 150000,
  "monthly_purchase_value": 500000,
  "top_suppliers": [...],
  "pending_requisitions": 8,
  "qc_failure_rate": 2.5
}
```

### Validation Rules
1. **PO Quantities**: Must be positive numbers
2. **Expiry Dates**: Must be future dates for pharmaceuticals
3. **Batch Numbers**: Must be unique per product per supplier
4. **GRN Quantities**: Cannot exceed PO quantities
5. **QC Results**: Required before GRN approval