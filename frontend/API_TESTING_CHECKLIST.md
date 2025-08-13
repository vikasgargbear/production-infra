# Complete API Testing Checklist with Input Fields

**Purpose:** Comprehensive testing guide for all API endpoints with exact input fields  
**Database API Path:** `/database/07-api/`  
**Date:** 2025-08-08

---

## 🔴 CRITICAL APIs to Test First (Legal Compliance)

### 1. NARCOTIC REGISTER API
**Endpoint:** `POST /api/compliance/narcotic-register/`  
**Priority:** IMMEDIATE - Legal requirement

#### Required Test Cases:

```json
// TEST 1: Valid Narcotic Sale
{
  "entry_type": "sale",
  "entry_date": "2024-01-15",
  "product_id": 101,
  "product_name": "Alprazolam 0.5mg",
  "batch_id": 501,
  "batch_number": "ALP2024001",
  "schedule_type": "X",
  
  // Prescription Details (ALL REQUIRED)
  "prescription_number": "RX-2024-0001",
  "prescription_date": "2024-01-15",
  "doctor_name": "Dr. Rajesh Kumar",
  "doctor_registration": "MCI/12345/2020",
  "doctor_phone": "+91-9876543210",
  "patient_name": "John Doe",
  "patient_age": 35,
  "patient_gender": "M",
  "patient_address": "123 Main St, Mumbai",
  "patient_phone": "+91-9876543211",
  
  // Quantity Tracking
  "opening_balance": 1000,
  "quantity_dispensed": 30,
  "closing_balance": 970,
  
  "invoice_number": "INV-2024-0001",
  "created_by": 1,
  "branch_id": 1,
  "org_id": "ad808530-1ddb-4377-ab20-67bef145d80d"
}

// TEST 2: Missing Prescription (Should FAIL)
{
  "entry_type": "sale",
  "product_id": 101,
  "schedule_type": "X",
  "quantity_dispensed": 30
  // Missing prescription details - MUST REJECT
}

// TEST 3: Expired Prescription (Should FAIL)
{
  "prescription_date": "2023-12-01", // > 30 days old
  // Rest of valid data
}
```

**Expected Validations:**
- ✅ Prescription date must be within 30 days
- ✅ Doctor registration format validation
- ✅ Patient age 1-150
- ✅ Closing balance = Opening - Dispensed
- ✅ Schedule type must be H/H1/X

---

### 2. CUSTOMER API (with Drug License)
**Endpoint:** `POST /api/customers/`  
**Priority:** IMMEDIATE - Cannot sell without license

#### Complete Input Fields Test:

```json
{
  // EXISTING FIELDS (Already Working)
  "customer_name": "ABC Medical Store",
  "customer_type": "pharmacy",
  "primary_phone": "+91-9876543210",
  "primary_email": "contact@abcmedical.com",
  "address": "123 Main Street",
  "city": "Mumbai",
  "state": "Maharashtra",
  "pincode": "400001",
  "gst_number": "27ABCDE1234F1Z5",
  "pan_number": "ABCDE1234F",
  "credit_limit": 50000,
  "credit_days": 30,
  "payment_terms": "credit",
  
  // NEW CRITICAL FIELDS (Must Add)
  "drug_license_number": "DL-MH-12345",      // REQUIRED
  "drug_license_validity": "2025-12-31",      // REQUIRED
  "whatsapp_number": "+91-9876543210",        // HIGH PRIORITY
  "credit_rating": "B",                       // REQUIRED (A/B/C/D)
  "assigned_salesperson_id": 5,               // REQUIRED
  "territory_id": 3,                          // REQUIRED
  "route_id": 7,                              // REQUIRED
  
  // NEW OPTIONAL FIELDS
  "fssai_number": "12345678901234",
  "contact_person_name": "Mr. Sharma",
  "contact_person_phone": "+91-9876543211",
  "overdue_interest_rate": 18,
  "preferred_delivery_time": "morning",
  "prefer_sms": true,
  "prefer_email": true,
  "prefer_whatsapp": true,
  "customer_category": "regular",
  "customer_grade": "B",
  "loyalty_tier": "silver",
  "kyc_status": "pending",
  
  "org_id": "ad808530-1ddb-4377-ab20-67bef145d80d"
}
```

**Validation Tests:**
```javascript
// TEST: Invalid Drug License Format
"drug_license_number": "INVALID" // Should REJECT

// TEST: Expired License
"drug_license_validity": "2023-01-01" // Should WARN/REJECT

// TEST: Invalid Credit Rating
"credit_rating": "E" // Should REJECT (only A/B/C/D)

// TEST: Invalid GST Number
"gst_number": "INVALID123" // Should REJECT
```

---

### 3. SUPPLIER API (with Bank Details)
**Endpoint:** `POST /api/suppliers/`  
**Priority:** IMMEDIATE - Cannot pay without bank details

#### Complete Input Fields Test:

```json
{
  // EXISTING FIELDS
  "supplier_name": "XYZ Pharmaceuticals Ltd",
  "supplier_type": "manufacturer",
  "primary_phone": "+91-11-12345678",
  "primary_email": "sales@xyzpharma.com",
  "address": "Industrial Area",
  "city": "Delhi",
  "state": "Delhi",
  "gst_number": "07ABCDE1234F1Z5",
  
  // NEW CRITICAL FIELDS
  "drug_license_number": "DL-DL-98765",       // REQUIRED
  "drug_license_validity": "2025-12-31",       // REQUIRED
  "bank_name": "State Bank of India",          // REQUIRED
  "account_number": "12345678901234",          // REQUIRED
  "ifsc_code": "SBIN0001234",                  // REQUIRED
  "account_holder_name": "XYZ Pharmaceuticals", // REQUIRED
  
  // NEW BUSINESS FIELDS
  "payment_days": 45,
  "supplier_category": "preferred",
  "quality_rating": 4.5,
  "delivery_rating": 4.2,
  "compliance_rating": "excellent",
  "product_categories": ["tablets", "syrups", "injections"],
  "brand_authorizations": ["Brand1", "Brand2"],
  
  "org_id": "ad808530-1ddb-4377-ab20-67bef145d80d"
}
```

**Validation Tests:**
```javascript
// TEST: Invalid IFSC Code
"ifsc_code": "INVALID" // Should REJECT (Format: XXXX0XXXXXX)

// TEST: Invalid Account Number
"account_number": "123" // Should REJECT (Min length validation)

// TEST: Rating Out of Range
"quality_rating": 6 // Should REJECT (1-5 only)
```

---

### 4. PRODUCT API (with Schedule Type)
**Endpoint:** `POST /api/products/`  
**Priority:** IMMEDIATE - Schedule classification required

#### Complete Input Fields Test:

```json
{
  // EXISTING FIELDS
  "product_name": "Paracetamol 500mg",
  "product_code": "PARA500",
  "hsn_code": "30049099",
  "gst_percentage": 12,
  "mrp": 10.00,
  "selling_price": 8.50,
  "unit": "tablet",
  "pack_size": "10",
  
  // NEW CRITICAL FIELDS
  "schedule_type": "H",                    // REQUIRED (H/H1/X/G/J/empty)
  "prescription_required": true,           // Auto-set for H/H1/X
  "is_narcotic": false,                   // Auto-set for X
  "manufacturing_date": "2024-01-01",     // REQUIRED
  "storage_condition": "room_temp",       // REQUIRED
  
  // NEW OPTIONAL FIELDS
  "generic_name": "Acetaminophen",
  "therapeutic_class": "Analgesic",
  "composition": "Paracetamol 500mg",
  "dosage_form": "tablet",
  "route_of_administration": "oral",
  
  "org_id": "ad808530-1ddb-4377-ab20-67bef145d80d"
}
```

**Special Test Cases:**
```javascript
// TEST: Schedule X Product (Narcotic)
{
  "product_name": "Alprazolam 0.5mg",
  "schedule_type": "X",
  "is_narcotic": true,  // Must be true
  "prescription_required": true  // Must be true
}

// TEST: OTC Product
{
  "product_name": "Vitamin C",
  "schedule_type": "",  // Empty for OTC
  "prescription_required": false
}
```

---

## 🟡 BUSINESS CRITICAL APIs

### 5. INVOICE API (with GST Compliance)
**Endpoint:** `POST /api/invoices/`  
**Priority:** HIGH - GST compliance required

#### Complete Input Fields Test:

```json
{
  // BASIC FIELDS
  "customer_id": 123,
  "invoice_date": "2024-01-15",
  "due_date": "2024-02-14",
  "payment_terms": "credit",
  
  // NEW REQUIRED FIELDS
  "invoice_type": "tax_invoice",           // REQUIRED
  "sales_person_id": 5,                    // REQUIRED
  "place_of_supply": "Maharashtra",        // REQUIRED for GST
  "billing_address": "123 Main St, Mumbai",
  "shipping_address": "Same as billing",
  
  // ITEMS with complete details
  "items": [
    {
      "product_id": 101,
      "batch_id": 501,
      "quantity": 100,              // Total quantity
      "base_quantity": 90,          // Billable quantity
      "free_quantity": 10,          // Free items
      "unit_price": 10.00,
      "discount_percent": 5,
      "cgst_rate": 6,
      "sgst_rate": 6,
      "hsn_code": "30049099"
    }
  ],
  
  // NARCOTIC ITEMS (if applicable)
  "narcotic_records": [
    {
      "product_id": 201,
      "prescription_number": "RX-2024-001",
      "prescription_date": "2024-01-15",
      "doctor_name": "Dr. Kumar",
      "doctor_registration": "MCI/12345/2020",
      "patient_name": "John Doe",
      "patient_age": 35,
      "patient_gender": "M",
      "patient_address": "456 Park St",
      "prescribed_quantity": 30,
      "dispensed_quantity": 30
    }
  ],
  
  // TRANSPORT DETAILS
  "transport_company": "Blue Dart",
  "vehicle_number": "MH-01-AB-1234",
  "lr_number": "LR123456",
  "e_way_bill_number": "EWB123456789012",
  
  // ADDITIONAL
  "notes": "Handle with care",
  "terms_conditions": "Standard T&C apply",
  
  "branch_id": 1,
  "org_id": "ad808530-1ddb-4377-ab20-67bef145d80d"
}
```

**GST Validation Tests:**
```javascript
// TEST: Interstate Sale (IGST)
{
  "customer_state": "Gujarat",
  "place_of_supply": "Gujarat",
  // Should apply IGST instead of CGST/SGST
}

// TEST: Missing Place of Supply
{
  // Missing place_of_supply - Should REJECT
}
```

---

### 6. PURCHASE ORDER API
**Endpoint:** `POST /api/purchase-orders/`  
**Priority:** HIGH - Procurement management

#### Complete Input Fields Test:

```json
{
  // BASIC FIELDS
  "supplier_id": 456,
  "po_date": "2024-01-15",
  
  // NEW REQUIRED FIELDS
  "po_type": "regular",                    // REQUIRED
  "expected_delivery_date": "2024-01-20",  // REQUIRED
  "payment_days": 30,                      // REQUIRED
  
  // ITEMS
  "items": [
    {
      "product_id": 101,
      "quantity": 1000,
      "unit_price": 7.50,
      "discount_percent": 10,
      "cgst_rate": 6,
      "sgst_rate": 6
    }
  ],
  
  // NEW OPTIONAL FIELDS
  "delivery_location_id": 2,
  "special_instructions": "Call before delivery",
  "terms_conditions": "Standard purchase terms",
  "approval_status": "pending",
  "quality_check_required": true,
  "partial_delivery_allowed": false,
  
  "branch_id": 1,
  "org_id": "ad808530-1ddb-4377-ab20-67bef145d80d"
}
```

---

### 7. PAYMENT API
**Endpoint:** `POST /api/payments/`  
**Priority:** HIGH - Financial tracking

#### Complete Input Fields Test:

```json
{
  // BASIC FIELDS
  "party_type": "customer",
  "party_id": 123,
  "payment_date": "2024-01-15",
  "payment_amount": 50000,
  "payment_mode": "bank_transfer",
  
  // CONDITIONAL FIELDS (based on payment_mode)
  "reference_number": "IMPS123456",        // Required for bank_transfer
  "bank_name": "HDFC Bank",                // Required for bank_transfer
  
  // NEW REQUIRED FIELDS
  "payment_type": "receipt",                // REQUIRED
  "clearance_date": "2024-01-16",          // REQUIRED for tracking
  "clearance_status": "pending",           // REQUIRED
  
  // ALLOCATIONS
  "allocations": [
    {
      "invoice_id": 789,
      "allocated_amount": 30000
    },
    {
      "invoice_id": 790,
      "allocated_amount": 20000
    }
  ],
  
  // NEW OPTIONAL FIELDS
  "bank_account_id": 3,
  "transaction_charges": 50,
  "unallocated_amount": 0,
  
  "branch_id": 1,
  "org_id": "ad808530-1ddb-4377-ab20-67bef145d80d"
}
```

**Payment Mode Tests:**
```javascript
// TEST: Cheque Payment
{
  "payment_mode": "cheque",
  "cheque_number": "123456",     // REQUIRED
  "cheque_date": "2024-01-15",   // REQUIRED
  "bank_name": "SBI"              // REQUIRED
}

// TEST: UPI Payment
{
  "payment_mode": "upi",
  "reference_number": "UPI123456789"  // REQUIRED
}
```

---

### 8. STOCK ADJUSTMENT API
**Endpoint:** `POST /api/stock-adjustments/`  
**Priority:** MEDIUM - Inventory accuracy

#### Complete Input Fields Test:

```json
{
  // BASIC FIELDS
  "adjustment_date": "2024-01-15",
  "adjustment_type": "decrease",
  "reason": "expiry",
  "notes": "Monthly expiry clearance",
  
  // NEW REQUIRED FIELDS
  "approved_by": 2,                        // REQUIRED
  "location_id": 1,                        // REQUIRED
  
  // ITEMS
  "items": [
    {
      "product_id": 101,
      "batch_id": 501,
      "current_quantity": 100,
      "adjustment_quantity": -20
    }
  ],
  
  // CONDITIONAL FIELDS
  "destruction_certificate": "DC/2024/001", // Required for expiry/damage
  "police_report_number": "FIR/2024/123",  // Required for theft
  
  "branch_id": 1,
  "org_id": "ad808530-1ddb-4377-ab20-67bef145d80d"
}
```

---

## 🟢 ENHANCEMENT APIs

### 9. GST RETURN API
**Endpoint:** `POST /api/gst/returns/`  
**Priority:** MEDIUM - Compliance reporting

```json
{
  "return_type": "GSTR1",
  "return_period": "01-2024",
  "filing_date": "2024-02-10",
  
  "sales_data": {
    "b2b_invoices": 150,
    "b2c_invoices": 500,
    "credit_notes": 10,
    "debit_notes": 5
  },
  
  "tax_data": {
    "cgst_payable": 50000,
    "sgst_payable": 50000,
    "igst_payable": 25000,
    "net_payable": 125000
  },
  
  "org_id": "ad808530-1ddb-4377-ab20-67bef145d80d"
}
```

### 10. TERRITORY/ROUTE API
**Endpoint:** `POST /api/territories/`

```json
{
  "territory_code": "MUM-WEST",
  "territory_name": "Mumbai West",
  "territory_type": "area",
  "territory_manager_id": 5,
  "monthly_target": 1000000,
  "pincode_range": "400001-400050",
  
  "org_id": "ad808530-1ddb-4377-ab20-67bef145d80d"
}
```

---

## API Testing Checklist

### Phase 1: Critical APIs (Week 1)
- [ ] Narcotic Register - All validations
- [ ] Customer with Drug License
- [ ] Supplier with Bank Details
- [ ] Product with Schedule Type
- [ ] Invoice with Place of Supply

### Phase 2: Business APIs (Week 2)
- [ ] Purchase Order with Expected Delivery
- [ ] Payment with Clearance Tracking
- [ ] Stock Adjustment with Approvals
- [ ] GRN with QC Status

### Phase 3: Enhancement APIs (Week 3-4)
- [ ] GST Returns
- [ ] Territory Management
- [ ] Credit/Debit Notes
- [ ] Loyalty Points

---

## Common Validation Rules

### 1. Format Validations
```javascript
const validations = {
  drug_license: /^(DL-[A-Z]{2}-\d{5}|20[A-Z]{1,2}\d{4,}|21[A-Z]{1,2}\d{4,})$/,
  gst_number: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
  pan_number: /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/,
  ifsc_code: /^[A-Z]{4}0[A-Z0-9]{6}$/,
  vehicle_number: /^[A-Z]{2}[-\s]?\d{1,2}[-\s]?[A-Z]{1,2}[-\s]?\d{4}$/,
  mobile: /^[6-9]\d{9}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
};
```

### 2. Business Rules
```javascript
// Credit Rating Impact
if (customer.credit_rating === 'D') {
  customer.payment_terms = 'cash';
  customer.credit_limit = 0;
}

// Schedule Drug Rules
if (product.schedule_type === 'X') {
  product.is_narcotic = true;
  product.prescription_required = true;
  // Require narcotic register entry
}

// GST Place of Supply
if (customer.state !== company.state) {
  invoice.tax_type = 'IGST';
} else {
  invoice.tax_type = 'CGST_SGST';
}
```

### 3. Conditional Requirements
```javascript
// Payment Mode Requirements
switch(payment.mode) {
  case 'cheque':
    required: ['cheque_number', 'cheque_date', 'bank_name'];
    break;
  case 'bank_transfer':
    required: ['reference_number', 'bank_name'];
    break;
  case 'upi':
    required: ['reference_number'];
    break;
}

// Stock Adjustment Requirements
switch(adjustment.reason) {
  case 'theft':
    required: ['police_report_number'];
    break;
  case 'expiry':
  case 'damage':
    required: ['destruction_certificate'];
    break;
}
```

---

## Error Response Testing

### Expected Error Format
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Drug license number is required",
    "fields": {
      "drug_license_number": "This field is required",
      "drug_license_validity": "License has expired"
    }
  }
}
```

### Common Error Codes
- `VALIDATION_ERROR` - Input validation failed
- `NOT_FOUND` - Resource not found
- `DUPLICATE_ENTRY` - Unique constraint violation
- `INSUFFICIENT_STOCK` - Stock not available
- `CREDIT_LIMIT_EXCEEDED` - Customer credit limit exceeded
- `LICENSE_EXPIRED` - Drug license expired
- `PRESCRIPTION_REQUIRED` - Missing prescription for scheduled drug

---

## Performance Testing

### Load Test Scenarios
1. **Bulk Customer Creation** - 1000 customers with all fields
2. **Large Invoice** - Invoice with 100+ line items
3. **Stock Check** - Concurrent stock availability checks
4. **Payment Allocation** - Payment against 50+ invoices
5. **Narcotic Register** - 100 entries per day

### Expected Response Times
- Simple GET: < 100ms
- Complex Search: < 500ms
- Create/Update: < 1000ms
- Bulk Operations: < 5000ms

---

## Security Testing

### Authentication Headers
```javascript
headers: {
  'Authorization': 'Bearer <token>',
  'X-Org-ID': 'ad808530-1ddb-4377-ab20-67bef145d80d',
  'X-Branch-ID': '1',
  'X-User-ID': '123'
}
```

### Permission Tests
1. Try accessing other org's data (should fail)
2. Try narcotic sale without prescription (should fail)
3. Try credit sale beyond limit (should fail)
4. Try expired license operations (should fail)

---

*This testing checklist ensures all critical fields are captured and validated before going to production.*