# GST Schema Documentation

## Overview
The `gst` schema manages Goods and Services Tax compliance including returns filing, e-invoicing, e-way bills, and reconciliation. This is critical for Indian tax compliance.

---

## Tables

### 1. gst_returns
**Purpose**: GST return filing and tracking
**API Endpoint**: `api.get_gst_returns()`, `api.create_gst_return()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `return_id` | SERIAL | ✓ | Unique return identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `gstin` | TEXT | ✓ | GSTIN for which return is filed | GST registration |
| `return_type` | TEXT | ✓ | Type: 'GSTR1', 'GSTR2A', 'GSTR3B', 'GSTR9' | Return classification |
| `return_period` | TEXT | ✓ | Period (MMYYYY format) | Period identification |
| `financial_year` | TEXT | ✓ | Financial year (e.g., "2023-24") | FY tracking |
| `from_date` | DATE | ✓ | Period start date | Date range |
| `to_date` | DATE | ✓ | Period end date | Date range |
| `filing_status` | TEXT | ✓ | Status: 'draft', 'validated', 'submitted', 'filed', 'cancelled' | Filing workflow |
| `filing_date` | DATE | - | Actual filing date | Compliance tracking |
| `due_date` | DATE | ✓ | Return due date | Compliance deadline |
| `arn_number` | TEXT | - | Acknowledgment reference number | Filing confirmation |
| `total_taxable_value` | NUMERIC(15,2) | - | Total taxable turnover | Summary data |
| `total_cgst` | NUMERIC(15,2) | - | Total CGST | Tax summary |
| `total_sgst` | NUMERIC(15,2) | - | Total SGST | Tax summary |
| `total_igst` | NUMERIC(15,2) | - | Total IGST | Tax summary |
| `total_cess` | NUMERIC(15,2) | - | Total cess | Tax summary |
| `total_tax_liability` | NUMERIC(15,2) | - | Total tax liability | Tax summary |
| `late_fee` | NUMERIC(15,2) | - | Late filing fee | Penalty tracking |
| `interest` | NUMERIC(15,2) | - | Interest on delayed payment | Penalty tracking |
| `is_amended` | BOOLEAN | - | Amendment flag | Amendment tracking |
| `original_return_id` | INTEGER | - | Original return if amended | Amendment reference |
| `auto_populated` | BOOLEAN | - | Auto-populated from system flag | Data source |
| `validation_errors` | JSONB | - | Validation error details | Error tracking |
| `submission_response` | JSONB | - | GST portal response | API response |
| `created_by` | INTEGER | - | User who created return | User tracking |
| `filed_by` | INTEGER | - | User who filed return | Filing tracking |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

**Example API Response**:
```json
{
  "return_id": 1,
  "gstin": "27ABCDE1234F1Z5",
  "return_type": "GSTR1",
  "return_period": "012024",
  "financial_year": "2023-24",
  "filing_status": "filed",
  "filing_date": "2024-02-10",
  "due_date": "2024-02-11",
  "arn_number": "AB270124123456",
  "total_taxable_value": 500000.00,
  "total_cgst": 30000.00,
  "total_sgst": 30000.00,
  "total_igst": 15000.00
}
```

---

### 2. gstr1_data
**Purpose**: GSTR-1 outward supply details
**API Endpoint**: `api.get_gstr1_data()`, `api.create_gstr1_data()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `gstr1_id` | SERIAL | ✓ | Unique GSTR1 record identifier | Primary key |
| `return_id` | INTEGER | ✓ | Parent return reference | Return association |
| `section_type` | TEXT | ✓ | Section: 'B2B', 'B2C', 'B2CL', 'CDNR', 'CDNUR', 'EXP', 'AT', 'ATADJ', 'EXEMP', 'HSN' | Section classification |
| `invoice_id` | INTEGER | - | Source invoice reference | Invoice linking |
| `invoice_number` | TEXT | ✓ | Invoice number | Document identification |
| `invoice_date` | DATE | ✓ | Invoice date | Date tracking |
| `invoice_type` | TEXT | - | Type: 'Regular', 'SEZ supplies', 'Deemed Export' | Invoice classification |
| `customer_gstin` | TEXT | - | Customer GSTIN (for B2B) | Party identification |
| `customer_name` | TEXT | - | Customer name | Party reference |
| `state_code` | TEXT | - | Place of supply state code | Tax determination |
| `reverse_charge` | BOOLEAN | - | Reverse charge flag | Tax liability |
| `invoice_value` | NUMERIC(15,2) | ✓ | Total invoice value | Amount tracking |
| `taxable_value` | NUMERIC(15,2) | ✓ | Taxable value | Tax base |
| `igst_rate` | NUMERIC(5,2) | - | IGST rate % | Tax rate |
| `igst_amount` | NUMERIC(15,2) | - | IGST amount | Tax amount |
| `cgst_rate` | NUMERIC(5,2) | - | CGST rate % | Tax rate |
| `cgst_amount` | NUMERIC(15,2) | - | CGST amount | Tax amount |
| `sgst_rate` | NUMERIC(5,2) | - | SGST rate % | Tax rate |
| `sgst_amount` | NUMERIC(15,2) | - | SGST amount | Tax amount |
| `cess_amount` | NUMERIC(15,2) | - | Cess amount | Additional tax |
| `is_cancelled` | BOOLEAN | - | Cancellation flag | Status tracking |
| `is_amended` | BOOLEAN | - | Amendment flag | Amendment tracking |
| `original_invoice_number` | TEXT | - | Original invoice if amended | Amendment reference |
| `original_invoice_date` | DATE | - | Original invoice date | Amendment reference |
| `differential_value` | NUMERIC(15,2) | - | Differential value for amendments | Amendment tracking |
| `upload_status` | TEXT | - | Upload: 'pending', 'uploaded', 'accepted', 'rejected' | Upload tracking |
| `error_message` | TEXT | - | Error from GST portal | Error tracking |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |

**Example API Response**:
```json
{
  "gstr1_id": 1,
  "return_id": 1,
  "section_type": "B2B",
  "invoice_number": "INV-2024-001",
  "invoice_date": "2024-01-15",
  "customer_gstin": "29ABCDE5678G1Z2",
  "customer_name": "XYZ Pharma",
  "state_code": "29",
  "invoice_value": 11800.00,
  "taxable_value": 10000.00,
  "igst_rate": 18.00,
  "igst_amount": 1800.00,
  "upload_status": "accepted"
}
```

---

### 3. gstr2a_data
**Purpose**: GSTR-2A auto-populated inward supply data
**API Endpoint**: `api.get_gstr2a_data()`, `api.sync_gstr2a()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `gstr2a_id` | SERIAL | ✓ | Unique GSTR2A record identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `gstin` | TEXT | ✓ | GSTIN | GST registration |
| `return_period` | TEXT | ✓ | Period (MMYYYY format) | Period identification |
| `supplier_gstin` | TEXT | ✓ | Supplier GSTIN | Supplier identification |
| `supplier_name` | TEXT | - | Supplier name | Supplier reference |
| `invoice_number` | TEXT | ✓ | Supplier invoice number | Document identification |
| `invoice_date` | DATE | ✓ | Invoice date | Date tracking |
| `invoice_value` | NUMERIC(15,2) | ✓ | Total invoice value | Amount tracking |
| `taxable_value` | NUMERIC(15,2) | ✓ | Taxable value | Tax base |
| `igst_amount` | NUMERIC(15,2) | - | IGST amount | Tax amount |
| `cgst_amount` | NUMERIC(15,2) | - | CGST amount | Tax amount |
| `sgst_amount` | NUMERIC(15,2) | - | SGST amount | Tax amount |
| `cess_amount` | NUMERIC(15,2) | - | Cess amount | Additional tax |
| `itc_availability` | TEXT | - | ITC availability status | ITC eligibility |
| `reason` | TEXT | - | Reason if ITC not available | ITC tracking |
| `filing_date` | DATE | - | Supplier filing date | Compliance tracking |
| `filing_status` | TEXT | - | Supplier filing status | Status tracking |
| `matched_status` | TEXT | - | Matching: 'matched', 'unmatched', 'pending' | Reconciliation |
| `purchase_id` | INTEGER | - | Matched purchase record | System linking |
| `action_required` | TEXT | - | Action: 'accept', 'reject', 'pending' | User action |
| `sync_date` | DATE | - | GST portal sync date | Sync tracking |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

---

### 4. gst_reconciliation
**Purpose**: Purchase-GSTR2A reconciliation
**API Endpoint**: `api.get_reconciliation()`, `api.reconcile_gst()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `reconciliation_id` | SERIAL | ✓ | Unique reconciliation identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `return_period` | TEXT | ✓ | Period (MMYYYY format) | Period identification |
| `reconciliation_date` | DATE | ✓ | Reconciliation date | Date tracking |
| `total_purchases` | INTEGER | - | Total purchase records | Count tracking |
| `total_gstr2a` | INTEGER | - | Total GSTR2A records | Count tracking |
| `matched_count` | INTEGER | - | Matched records count | Match tracking |
| `unmatched_purchases` | INTEGER | - | Unmatched in books | Mismatch tracking |
| `unmatched_gstr2a` | INTEGER | - | Unmatched in GSTR2A | Mismatch tracking |
| `matched_value` | NUMERIC(15,2) | - | Total matched value | Value tracking |
| `unmatched_purchase_value` | NUMERIC(15,2) | - | Unmatched purchase value | Value tracking |
| `unmatched_gstr2a_value` | NUMERIC(15,2) | - | Unmatched GSTR2A value | Value tracking |
| `itc_matched` | NUMERIC(15,2) | - | Matched ITC amount | ITC tracking |
| `itc_unmatched` | NUMERIC(15,2) | - | Unmatched ITC amount | ITC tracking |
| `reconciliation_status` | TEXT | ✓ | Status: 'in_progress', 'completed', 'approved' | Status tracking |
| `mismatches` | JSONB | - | Detailed mismatch information | Mismatch details |
| `actions_taken` | JSONB | - | Actions taken on mismatches | Action tracking |
| `reconciled_by` | INTEGER | - | User who performed reconciliation | User tracking |
| `approved_by` | INTEGER | - | User who approved | Approval tracking |
| `approved_at` | TIMESTAMPTZ | - | Approval timestamp | Approval tracking |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

---

### 5. e_invoices
**Purpose**: E-invoice generation and management
**API Endpoint**: `api.get_einvoices()`, `api.generate_einvoice()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `e_invoice_id` | SERIAL | ✓ | Unique e-invoice identifier | Primary key |
| `invoice_id` | INTEGER | ✓ | Source invoice reference | Invoice linking |
| `invoice_number` | TEXT | ✓ | Invoice number | Document identification |
| `irn` | TEXT | - | Invoice Reference Number | E-invoice identifier |
| `ack_number` | TEXT | - | Acknowledgment number | GST portal reference |
| `ack_date` | TIMESTAMPTZ | - | Acknowledgment date | Acknowledgment tracking |
| `signed_invoice` | TEXT | - | Signed invoice data | Digital signature |
| `signed_qr_code` | TEXT | - | Signed QR code | QR verification |
| `qr_code_url` | TEXT | - | QR code image URL | Visual display |
| `generation_status` | TEXT | ✓ | Status: 'pending', 'generated', 'cancelled', 'failed' | Status tracking |
| `generation_date` | TIMESTAMPTZ | - | Generation timestamp | Generation tracking |
| `cancellation_date` | TIMESTAMPTZ | - | Cancellation timestamp | Cancellation tracking |
| `cancellation_reason` | TEXT | - | Cancellation reason | Cancellation documentation |
| `ewb_number` | TEXT | - | E-way bill number if generated | EWB linking |
| `ewb_date` | DATE | - | E-way bill date | EWB tracking |
| `ewb_valid_till` | TIMESTAMPTZ | - | E-way bill validity | EWB validity |
| `api_response` | JSONB | - | Complete API response | API tracking |
| `error_code` | TEXT | - | Error code if failed | Error tracking |
| `error_message` | TEXT | - | Error message | Error details |
| `retry_count` | INTEGER | - | API retry attempts | Retry tracking |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

**Example API Response**:
```json
{
  "e_invoice_id": 1,
  "invoice_id": 1,
  "invoice_number": "INV-2024-001",
  "irn": "a7b1c3d5e7f9g1h3j5k7l9m1n3p5r7s9",
  "ack_number": "112010012345678",
  "ack_date": "2024-01-15T10:30:00Z",
  "generation_status": "generated",
  "qr_code_url": "/api/einvoice/qr/1",
  "ewb_number": "331001234567",
  "ewb_valid_till": "2024-01-17T23:59:59Z"
}
```

---

### 6. e_way_bills
**Purpose**: E-way bill generation and tracking
**API Endpoint**: `api.get_ewaybills()`, `api.generate_ewaybill()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `ewb_id` | SERIAL | ✓ | Unique e-way bill identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `ewb_number` | TEXT | - | E-way bill number | EWB identification |
| `ewb_date` | DATE | ✓ | Generation date | Date tracking |
| `document_type` | TEXT | ✓ | Type: 'invoice', 'challan', 'credit_note' | Document classification |
| `document_id` | INTEGER | ✓ | Source document ID | Document reference |
| `document_number` | TEXT | ✓ | Document number | Reference tracking |
| `supply_type` | TEXT | ✓ | Supply: 'outward', 'inward' | Direction tracking |
| `sub_supply_type` | TEXT | ✓ | Sub-type: 'supply', 'return', 'job_work' | Type classification |
| `from_gstin` | TEXT | ✓ | Consignor GSTIN | From party |
| `from_name` | TEXT | ✓ | Consignor name | From details |
| `from_address` | TEXT | ✓ | Consignor address | From location |
| `from_pincode` | TEXT | ✓ | From pincode | From location |
| `to_gstin` | TEXT | - | Consignee GSTIN | To party |
| `to_name` | TEXT | ✓ | Consignee name | To details |
| `to_address` | TEXT | ✓ | Consignee address | To location |
| `to_pincode` | TEXT | ✓ | To pincode | To location |
| `transport_mode` | TEXT | ✓ | Mode: 'road', 'rail', 'air', 'ship' | Transport type |
| `transport_distance` | INTEGER | ✓ | Distance in KM | Distance tracking |
| `transporter_id` | TEXT | - | Transporter GSTIN | Transporter details |
| `transporter_name` | TEXT | - | Transporter name | Transporter reference |
| `transport_doc_number` | TEXT | - | Transport document number | Transport tracking |
| `transport_doc_date` | DATE | - | Transport document date | Transport tracking |
| `vehicle_number` | TEXT | - | Vehicle registration number | Vehicle tracking |
| `vehicle_type` | TEXT | - | Vehicle type: 'regular', 'ODC' | Vehicle classification |
| `total_value` | NUMERIC(15,2) | ✓ | Total consignment value | Value tracking |
| `taxable_value` | NUMERIC(15,2) | ✓ | Taxable value | Tax base |
| `cgst_amount` | NUMERIC(15,2) | - | CGST amount | Tax amount |
| `sgst_amount` | NUMERIC(15,2) | - | SGST amount | Tax amount |
| `igst_amount` | NUMERIC(15,2) | - | IGST amount | Tax amount |
| `cess_amount` | NUMERIC(15,2) | - | Cess amount | Additional tax |
| `valid_from` | TIMESTAMPTZ | - | Validity start | Validity tracking |
| `valid_until` | TIMESTAMPTZ | - | Validity end | Validity tracking |
| `generation_status` | TEXT | ✓ | Status: 'draft', 'generated', 'cancelled', 'expired' | Status tracking |
| `cancellation_reason` | TEXT | - | Cancellation reason | Cancellation tracking |
| `cancellation_date` | TIMESTAMPTZ | - | Cancellation timestamp | Cancellation tracking |
| `api_response` | JSONB | - | API response data | API tracking |
| `created_by` | INTEGER | - | User who created EWB | User tracking |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

---

### 7. gst_ledger
**Purpose**: GST liability and credit tracking
**API Endpoint**: `api.get_gst_ledger()`, `api.get_gst_balance()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `ledger_id` | SERIAL | ✓ | Unique ledger entry identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `transaction_date` | DATE | ✓ | Transaction date | Date tracking |
| `transaction_type` | TEXT | ✓ | Type: 'output_tax', 'input_tax', 'payment', 'refund', 'reversal' | Transaction classification |
| `document_type` | TEXT | - | Source document type | Document reference |
| `document_id` | INTEGER | - | Source document ID | Document linking |
| `document_number` | TEXT | - | Document number | Reference tracking |
| `gstin` | TEXT | ✓ | GSTIN | GST registration |
| `tax_period` | TEXT | ✓ | Tax period (MMYYYY) | Period tracking |
| `cgst_liability` | NUMERIC(15,2) | - | CGST liability amount | Tax tracking |
| `sgst_liability` | NUMERIC(15,2) | - | SGST liability amount | Tax tracking |
| `igst_liability` | NUMERIC(15,2) | - | IGST liability amount | Tax tracking |
| `cess_liability` | NUMERIC(15,2) | - | Cess liability amount | Tax tracking |
| `cgst_credit` | NUMERIC(15,2) | - | CGST credit amount | ITC tracking |
| `sgst_credit` | NUMERIC(15,2) | - | SGST credit amount | ITC tracking |
| `igst_credit` | NUMERIC(15,2) | - | IGST credit amount | ITC tracking |
| `cess_credit` | NUMERIC(15,2) | - | Cess credit amount | ITC tracking |
| `description` | TEXT | - | Transaction description | Documentation |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |

---

### 8. gst_rates
**Purpose**: HSN/SAC wise GST rate master
**API Endpoint**: `api.get_gst_rates()`, `api.update_gst_rates()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `rate_id` | SERIAL | ✓ | Unique rate identifier | Primary key |
| `hsn_sac_code` | TEXT | ✓ | HSN/SAC code | Code identification |
| `description` | TEXT | ✓ | Description of goods/services | Reference |
| `effective_from` | DATE | ✓ | Rate effective from date | Validity start |
| `effective_to` | DATE | - | Rate effective to date | Validity end |
| `cgst_rate` | NUMERIC(5,2) | ✓ | CGST rate % | Tax rate |
| `sgst_rate` | NUMERIC(5,2) | ✓ | SGST rate % | Tax rate |
| `igst_rate` | NUMERIC(5,2) | ✓ | IGST rate % | Tax rate |
| `cess_rate` | NUMERIC(5,2) | - | Cess rate % | Additional tax |
| `is_exempted` | BOOLEAN | - | Exemption flag | Exemption tracking |
| `is_nil_rated` | BOOLEAN | - | Nil rated flag | Zero tax tracking |
| `notification_number` | TEXT | - | Government notification reference | Compliance reference |
| `is_active` | BOOLEAN | - | Rate active status | Status tracking |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

---

## API Integration Notes

### GST Return Filing
```javascript
// Generate GSTR-1 for period
POST /api/gst/generate-gstr1
{
  "gstin": "27ABCDE1234F1Z5",
  "return_period": "012024",
  "include_amendments": true
}

// GSTR-1 sections
const gstr1Sections = {
  "B2B": "Business to Business",
  "B2C": "Business to Consumer (< 2.5L)",
  "B2CL": "Business to Consumer Large (> 2.5L)",
  "CDNR": "Credit/Debit Notes (Registered)",
  "CDNUR": "Credit/Debit Notes (Unregistered)",
  "EXP": "Exports",
  "AT": "Tax on Advances",
  "ATADJ": "Adjustment of Advances",
  "EXEMP": "Exempted/Nil Rated/Non-GST",
  "HSN": "HSN Summary"
};
```

### E-Invoice Generation
```javascript
// Generate e-invoice
POST /api/einvoice/generate
{
  "invoice_id": 1,
  "generate_ewb": true, // Generate e-way bill with e-invoice
  "transport_details": {
    "transport_mode": "road",
    "vehicle_number": "MH01AB1234",
    "transport_distance": 150
  }
}

// E-invoice response
{
  "success": true,
  "irn": "a7b1c3d5e7f9g1h3j5k7l9m1n3p5r7s9",
  "ack_number": "112010012345678",
  "signed_qr_code": "...",
  "ewb_number": "331001234567",
  "ewb_valid_till": "2024-01-17T23:59:59Z"
}
```

### E-Way Bill Management
```javascript
// Generate e-way bill
POST /api/ewaybill/generate
{
  "document_type": "invoice",
  "document_id": 1,
  "transport_mode": "road",
  "vehicle_number": "MH01AB1234",
  "transport_distance": 250,
  "transporter_id": "27TRANS1234G1Z5"
}

// Update vehicle in transit
PATCH /api/ewaybill/update-vehicle
{
  "ewb_number": "331001234567",
  "vehicle_number": "MH02CD5678",
  "from_place": "Mumbai",
  "from_state": "27",
  "reason": "VEHICLE_BREAKDOWN"
}
```

### GST Reconciliation
```javascript
// Sync GSTR-2A data
POST /api/gst/sync-gstr2a
{
  "gstin": "27ABCDE1234F1Z5",
  "return_period": "012024",
  "otp": "123456" // If required
}

// Reconcile with purchases
POST /api/gst/reconcile
{
  "return_period": "012024",
  "auto_match": true,
  "tolerance_percentage": 1.0 // 1% tolerance for matching
}

// Reconciliation summary
GET /api/gst/reconciliation-summary?period=012024
{
  "matched": {
    "count": 150,
    "value": 1500000,
    "itc": 270000
  },
  "unmatched_purchases": {
    "count": 10,
    "value": 50000,
    "itc": 9000
  },
  "unmatched_gstr2a": {
    "count": 5,
    "value": 25000,
    "itc": 4500
  }
}
```

### GST Compliance Dashboard
```javascript
// GST compliance status
GET /api/gst/compliance-status
{
  "returns_pending": [
    {
      "return_type": "GSTR1",
      "period": "012024",
      "due_date": "2024-02-11",
      "days_remaining": 2
    }
  ],
  "returns_filed": 12,
  "current_liability": {
    "cgst": 50000,
    "sgst": 50000,
    "igst": 25000
  },
  "itc_balance": {
    "cgst": 30000,
    "sgst": 30000,
    "igst": 40000
  },
  "net_payable": 25000
}
```

### HSN Summary
```javascript
// Get HSN summary for GSTR-1
GET /api/gst/hsn-summary?
  period=012024&
  min_turnover=true // Include if turnover > 1.5Cr

// Response
{
  "hsn_data": [
    {
      "hsn_code": "3004",
      "description": "Medicaments",
      "uqc": "NOS",
      "total_quantity": 10000,
      "total_value": 500000,
      "taxable_value": 500000,
      "igst_amount": 60000,
      "cgst_amount": 30000,
      "sgst_amount": 30000
    }
  ]
}
```

### Tax Calculation
```javascript
// GST rate determination
function getGSTRate(hsnCode, stateCode) {
  // Fetch from gst_rates table
  const rate = await api.getGstRate(hsnCode);
  
  return {
    cgst_rate: rate.cgst_rate,
    sgst_rate: rate.sgst_rate,
    igst_rate: rate.igst_rate,
    cess_rate: rate.cess_rate,
    is_exempted: rate.is_exempted
  };
}

// Place of supply rules
function determinePlaceOfSupply(billToState, shipToState) {
  // For goods
  return shipToState || billToState;
}
```

### Validation Rules
1. **GSTIN Format**: Must match pattern `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$`
2. **Return Period**: MMYYYY format (e.g., "012024")
3. **E-Invoice**: Mandatory for B2B with turnover > 5Cr
4. **E-Way Bill**: Required for consignment value > 50,000
5. **HSN Code**: Mandatory based on turnover limits