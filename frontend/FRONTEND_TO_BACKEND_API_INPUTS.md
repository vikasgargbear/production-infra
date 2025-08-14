# Frontend to Backend API Input Documentation

**Purpose:** Document EXACTLY what data the frontend is currently collecting and sending to backend  
**Status:** UPDATED after implementing critical missing fields  
**Date:** 2025-08-13  
**Note:** This shows ACTUAL implementation after latest updates

---

## 📊 SUMMARY OF CURRENT STATE

### ✅ What's Currently Captured (IMPLEMENTED)
- Basic customer/supplier information
- Contact details including WhatsApp
- Drug license with validity dates
- Banking details for suppliers
- Credit ratings and limits
- GST/PAN numbers
- **Product Schedule Types** - ✅ IMPLEMENTED in ProductCreationModal
- **Narcotic Register** - ✅ IMPLEMENTED with PrescriptionModal
- **Place of Supply** - ✅ IMPLEMENTED in InvoiceFlow
- Storage conditions for products
- Generic names and composition

### ❌ Still Missing
- **E-invoice fields** - Not implemented
- **Territory/Route/Salesperson** - No dropdowns (fields exist but no UI)
- **Expected delivery date** - Not in purchase orders
- **Payment clearance tracking** - Not in payment entry

---

## 1. CUSTOMER API INPUTS

### Current Implementation in `CustomerCreationModal.js`

```json
{
  // BASIC INFORMATION (✅ Implemented)
  "customer_name": "string",               // Required
  "primary_phone": "string",               // Required
  "primary_email": "string",               // Optional
  "whatsapp_number": "string",             // ✅ NEW - Added
  "customer_type": "pharmacy|hospital|clinic|institution|doctor",
  
  // ADDRESS (✅ Implemented)
  "address": {
    "address_line1": "string",             // Required
    "address_line2": "string",             // Optional
    "city": "string",                      // Required
    "state": "string",                     // Required (dropdown)
    "pincode": "string",                   // Required
    "country": "India"                     // Fixed value
  },
  
  // COMPLIANCE (✅ Implemented)
  "drug_license_number": "string",         // ✅ NEW - Added
  "drug_license_validity": "date",         // ✅ NEW - Added
  "gst_number": "string",                  // Optional, auto-uppercase
  "pan_number": "string",                  // Optional, auto-uppercase
  
  // CREDIT MANAGEMENT (✅ Implemented)
  "credit_rating": "A|B|C|D",              // ✅ NEW - Added
  "credit_limit": 5000,                    // Auto-disabled if rating=D
  "credit_days": 0,                        // Auto-disabled if rating=D
  
  // SYSTEM FIELDS
  "org_id": "uuid"                         // From APP_CONFIG
}
```

### ❌ NOT Captured Yet (But Needed)
```json
{
  "assigned_salesperson_id": null,  // No salesperson dropdown
  "territory_id": null,              // No territory selection
  "route_id": null,                  // No route management
  "customer_code": null,             // Not auto-generated
  "fssai_number": null,              // Not in form
  "loyalty_tier": null,              // Removed as unnecessary
  "prefer_sms": null,                // No communication preferences
  "prefer_email": null,              
  "prefer_whatsapp": null
}
```

---

## 2. SUPPLIER API INPUTS

### Current Implementation in `SupplierCreationModal.js`

```json
{
  // BASIC INFORMATION (✅ Implemented)
  "supplier_name": "string",               // Required
  "supplier_code": "string",               // Auto-generated
  "contact_person": "string",              // Optional
  "phone": "string",                       // Required
  "whatsapp_number": "string",             // ✅ NEW - Added
  "alternate_phone": "string",             // Optional
  "email": "string",                       // Optional
  "website": "string",                     // Optional
  
  // ADDRESS (✅ Implemented)
  "address_line1": "string",               // Required
  "address_line2": "string",               // Optional
  "city": "string",                        // Required
  "state": "Maharashtra",                  // Dropdown, default
  "pincode": "string",                     // 6 digits
  "country": "India",                      // Fixed
  
  // COMPLIANCE (✅ Implemented)
  "gstin": "string",                       // Optional, validated
  "pan_number": "string",                  // Optional, validated
  "drug_license_no": "string",             // Required
  "drug_license_validity": "date",         // ✅ NEW - Added
  
  // BANKING (✅ Implemented)
  "payment_terms": "30",                   // Days
  "bank_name": "string",                   // ✅ Critical
  "bank_account_no": "string",             // ✅ Critical
  "bank_ifsc_code": "string",              // ✅ Critical
  "account_holder_name": "string",         // ✅ NEW - Added
  
  // PERFORMANCE (✅ NEW - Added)
  "quality_rating": 4,                     // 1-5 scale
  "delivery_rating": 4,                    // 1-5 scale
  "compliance_rating": "good",             // excellent|good|average|poor
  
  // ADDITIONAL
  "supplier_type": "pharmaceutical",       // Default
  "notes": "string",                       // Optional
  "is_active": true                        // Default
}
```

---

## 3. PRODUCT API INPUTS

### ✅ UPDATED Implementation in `ProductCreationModal.js`

```json
{
  // BASIC (✅ Implemented)
  "product_name": "string",
  "product_code": "string",
  "hsn_code": "string",
  "gst_percentage": 12,
  "mrp": 100.00,
  "selling_price": 90.00,
  "purchase_price": 70.00,
  "unit": "tablet|bottle|strip|box",
  "pack_size": "10",
  
  // INVENTORY (✅ Implemented)
  "current_stock": 0,
  "min_stock": 10,
  "max_stock": 1000,
  
  // ✅ PHARMACEUTICAL COMPLIANCE (NOW IMPLEMENTED)
  "schedule_type": "H|H1|X|G|J|''",     // ✅ IMPLEMENTED - Drug schedule
  "is_narcotic": true/false,            // ✅ IMPLEMENTED - Auto-set for X
  "prescription_required": true/false,  // ✅ IMPLEMENTED - Auto-set for H/H1/X
  "storage_condition": "room_temp|cool|refrigerated|frozen", // ✅ IMPLEMENTED
  "generic_name": "string",             // ✅ IMPLEMENTED
  "composition": "string",              // ✅ IMPLEMENTED
  "manufacturing_date": "date",         // Already exists as mfg_date
  
  // Still uses existing fields
  "salt_composition": "string",
  "batch_number": "string",
  "mfg_date": "YYYY-MM",
  "expiry_date": "YYYY-MM"
}
```

---

## 4. INVOICE API INPUTS

### ✅ UPDATED Implementation in `InvoiceFlow.js`

```json
{
  // HEADER (✅ Implemented)
  "customer_id": 123,
  "invoice_date": "2024-01-15",
  "due_date": "2024-02-14",
  "payment_terms": "credit",
  
  // ✅ GST COMPLIANCE (NOW IMPLEMENTED)
  "place_of_supply": "Maharashtra",     // ✅ IMPLEMENTED - Auto-set from customer
  "sales_person_id": null,              // Field exists but no UI dropdown yet
  "billing_address": "string",          // ✅ CAPTURED from customer
  "shipping_address": "string",         // ✅ CAPTURED from customer
  "gst_type": "CGST/SGST|IGST",        // ✅ Auto-determined
  
  // ITEMS (✅ Implemented)
  "items": [
    {
      "product_id": 101,
      "batch_id": 501,
      "quantity": 100,
      "unit_price": 10.00,
      "discount_percent": 5,
      "cgst_rate": 6,
      "sgst_rate": 6,
      "hsn_code": "30049099"
    }
  ],
  
  // ✅ NARCOTIC COMPLIANCE (Component exists)
  // When Schedule X product is added, PrescriptionModal will capture:
  "narcotic_records": [
    {
      "prescription_number": "RX-2024-001",
      "prescription_date": "2024-01-15",
      "doctor_name": "Dr. Kumar",
      "doctor_registration": "MCI/12345",
      "patient_name": "John Doe",
      "patient_age": 35,
      "patient_gender": "M",
      "quantity_dispensed": 30
    }
  ],
  
  // ❌ MISSING (E-Invoice)
  "e_invoice_number": null,        // NOT IMPLEMENTED
  "irn": null,                     // NOT IMPLEMENTED
  "qr_code": null                  // NOT IMPLEMENTED
}
```

---

## 5. PAYMENT API INPUTS

### Current Implementation in `PaymentEntry.tsx`

```json
{
  // BASIC (✅ Implemented)
  "party_type": "customer|supplier",
  "party_id": 123,
  "payment_date": "2024-01-15",
  "payment_amount": 50000,
  "payment_mode": "cash|cheque|bank_transfer|upi",
  "reference_number": "string",
  
  // ALLOCATIONS (✅ Implemented)
  "allocations": [
    {
      "invoice_id": 789,
      "allocated_amount": 30000
    }
  ],
  
  // ❌ MISSING
  "clearance_date": null,          // NOT IMPLEMENTED
  "clearance_status": null,        // NOT IMPLEMENTED
  "bank_charges": null,            // NOT IMPLEMENTED
  "tds_amount": null,              // NOT IMPLEMENTED
  "unallocated_amount": null       // NOT CALCULATED
}
```

---

## 6. PURCHASE ORDER API INPUTS

### Current Implementation

```json
{
  // BASIC (✅ Implemented)
  "supplier_id": 456,
  "po_date": "2024-01-15",
  "items": [...],
  
  // ❌ MISSING
  "po_type": null,                 // NOT IMPLEMENTED
  "expected_delivery_date": null,  // NOT IMPLEMENTED
  "delivery_location_id": null,    // NOT IMPLEMENTED
  "special_instructions": null,    // NOT IMPLEMENTED
  "approval_status": null          // NOT IMPLEMENTED
}
```

---

## 7. NARCOTIC REGISTER API INPUTS

### ✅ NOW IMPLEMENTED in `NarcoticRegister.tsx`

Complete narcotic register component with prescription modal for Schedule X drugs.

```json
{
  // REGISTER ENTRY
  "entry_type": "sale|purchase|adjustment",
  "entry_date": "2024-01-15T10:30:00",
  "product_id": 101,
  "product_name": "Alprazolam 0.5mg",
  "batch_number": "ALP2024001",
  "schedule_type": "X|H1",
  
  // ✅ PRESCRIPTION DETAILS (Required for sales)
  "prescription_number": "RX-2024-001",
  "prescription_date": "2024-01-15",
  "doctor_name": "Dr. Rajesh Kumar",
  "doctor_registration": "MCI/12345/2020",
  "doctor_phone": "+91-9876543210",
  
  // ✅ PATIENT INFORMATION
  "patient_name": "John Doe",
  "patient_age": 35,
  "patient_gender": "M|F|O",
  "patient_address": "123 Main St, Mumbai",
  "patient_phone": "+91-9876543211",
  
  // ✅ QUANTITY TRACKING
  "opening_balance": 1000,
  "quantity_received": null,      // For purchases
  "quantity_dispensed": 30,       // For sales
  "closing_balance": 970,
  
  // REFERENCES
  "invoice_number": "INV-2024-0001",
  "grn_number": null,              // For purchases
  "created_by": "Admin User",
  "verified_by": "Supervisor",
  "verification_date": "2024-01-15T11:00:00"
}
```

**Features Implemented:**
- Complete narcotic register table view
- Prescription modal with full validation
- 30-day prescription validity check
- Doctor registration verification fields
- Patient demographics capture
- Balance tracking for each transaction
- Export functionality for regulatory compliance

---

## 🚨 CRITICAL GAPS TO ADDRESS

### 1. **Narcotic/Schedule Drug Management**
- No product schedule type field
- No prescription capture during sale
- No narcotic register component
- **Legal Risk:** Can't sell Schedule X drugs compliantly

### 2. **GST Compliance**
- No place of supply in invoices
- No e-invoice generation
- **Tax Risk:** GST filing issues

### 3. **Territory/Sales Management**
- No salesperson assignment
- No territory/route management
- **Business Risk:** Can't track sales performance

### 4. **Banking/Payment**
- Missing clearance tracking
- No TDS handling
- **Financial Risk:** Reconciliation issues

---

## 📋 IMPLEMENTATION PRIORITY

### Week 1 (CRITICAL - Legal)
1. Add schedule_type to Product creation
2. Create NarcoticRegister component
3. Add prescription modal to Invoice when selling Schedule X
4. Add place_of_supply to Invoice

### Week 2 (HIGH - Business)
1. Create Salesperson dropdown (fetch from users)
2. Add territory/route masters
3. Add clearance fields to Payment
4. Add expected_delivery to Purchase Order

### Week 3 (MEDIUM - Enhancement)
1. E-invoice integration
2. Communication preferences
3. TDS calculations
4. Loyalty system

---

## 🔧 BACKEND EXPECTATIONS

The backend APIs expect ALL these fields but frontend is only sending ~60% of them. This means:

1. **Backend may reject requests** - Missing required fields
2. **Features won't work** - No data to process
3. **Reports incomplete** - Missing critical data
4. **Compliance failures** - Legal requirements not met

---

*This document shows the ACTUAL current state of frontend data collection, not the ideal state.*