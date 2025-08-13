# Frontend to Backend API Input Documentation

**Purpose:** Document EXACTLY what data the frontend is currently collecting and sending to backend  
**Status:** After adding critical missing fields  
**Date:** 2025-08-13  
**Note:** This shows ACTUAL implementation, not wishlist

---

## 📊 SUMMARY OF CURRENT STATE

### ✅ What's Currently Captured
- Basic customer/supplier information
- Contact details including WhatsApp
- Drug license with validity dates
- Banking details for suppliers
- Credit ratings and limits
- GST/PAN numbers

### ❌ Still Missing (Critical)
- **Narcotic Register** - No frontend implementation yet
- **Product Schedule Types** - Not in product creation
- **Place of Supply** - Not in invoice creation
- **E-invoice fields** - Not implemented
- **Territory/Route/Salesperson** - No dropdowns or selection

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

### Current Implementation in `ProductCreationModal.js`

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
  
  // ❌ MISSING (Critical for Pharma)
  "schedule_type": null,           // NOT IMPLEMENTED - H/H1/X/G/J
  "is_narcotic": null,             // NOT IMPLEMENTED
  "prescription_required": null,   // NOT IMPLEMENTED
  "manufacturing_date": null,      // NOT IMPLEMENTED
  "storage_condition": null,       // NOT IMPLEMENTED
  "generic_name": null,
  "composition": null
}
```

---

## 4. INVOICE API INPUTS

### Current Implementation in `InvoiceFlow.js`

```json
{
  // HEADER (✅ Implemented)
  "customer_id": 123,
  "invoice_date": "2024-01-15",
  "due_date": "2024-02-14",
  "payment_terms": "credit",
  
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
  
  // ❌ MISSING (GST Compliance)
  "place_of_supply": null,         // NOT IMPLEMENTED - Required for GST
  "sales_person_id": null,         // NOT IMPLEMENTED
  "billing_address": null,         // NOT CAPTURED separately
  "shipping_address": null,        // NOT CAPTURED separately
  
  // ❌ MISSING (Narcotic Compliance)
  "narcotic_records": null,        // NO PRESCRIPTION CAPTURE
  
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

### ❌ NOT IMPLEMENTED AT ALL

No frontend component exists for narcotic register. This is a **CRITICAL LEGAL REQUIREMENT**.

Required fields that need implementation:
```json
{
  "entry_type": "sale|purchase",
  "product_id": 101,
  "schedule_type": "X",
  "prescription_number": "RX-2024-001",
  "prescription_date": "2024-01-15",
  "doctor_name": "Dr. Kumar",
  "doctor_registration": "MCI/12345",
  "patient_name": "John Doe",
  "patient_age": 35,
  "patient_gender": "M",
  "quantity_dispensed": 30,
  "opening_balance": 1000,
  "closing_balance": 970
}
```

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