# Complete API Input Fields by Module

**Purpose:** Complete list of all fields to send to backend APIs  
**Format:** Ready for API payload construction  
**Date:** 2025-08-08

---

## 1. CUSTOMER MODULE (`/api/customers/`)

### POST - Create/Update Customer
```json
{
  // EXISTING FIELDS (Already in Frontend)
  "customer_name": "string, required",
  "customer_type": "pharmacy|hospital|clinic|institution|doctor",
  "primary_phone": "string, required",
  "primary_email": "string, optional",
  "address": "string, required",
  "city": "string, required",
  "state": "string, required",
  "pincode": "string, required",
  "gst_number": "string, optional",
  "pan_number": "string, optional",
  "credit_limit": "number, default: 5000",
  "credit_days": "number, default: 0",
  "payment_terms": "cash|credit|advance",
  
  // NEW FIELDS TO ADD (Missing in Frontend)
  "customer_code": "string, auto-generate if empty",
  "secondary_phone": "string, optional",
  "whatsapp_number": "string, optional",
  "contact_person_name": "string, optional",
  "contact_person_phone": "string, optional",
  "contact_person_email": "string, optional",
  "drug_license_number": "string, REQUIRED for pharma",
  "drug_license_validity": "date, REQUIRED for pharma",
  "fssai_number": "string, optional",
  "establishment_year": "number, optional",
  "business_type": "retail_pharmacy|wholesale|distributor",
  "current_outstanding": "number, auto-calculated",
  "credit_rating": "A|B|C|D, default: C",
  "overdue_interest_rate": "number, default: 18",
  "security_deposit": "number, optional",
  "customer_category": "vip|regular|new|blacklisted",
  "customer_grade": "A|B|C|D",
  "territory_id": "number, optional",
  "route_id": "number, optional",
  "area_code": "string, optional",
  "assigned_salesperson_id": "number, optional",
  "price_list_id": "number, optional",
  "discount_group_id": "number, optional",
  "kyc_status": "pending|verified|rejected, default: pending",
  "kyc_verified_date": "date, optional",
  "kyc_documents": "json, optional",
  "preferred_payment_mode": "cash|upi|bank_transfer|cheque",
  "preferred_delivery_time": "morning|afternoon|evening|anytime",
  "prefer_sms": "boolean, default: true",
  "prefer_email": "boolean, default: true",
  "prefer_whatsapp": "boolean, default: true",
  "first_transaction_date": "date, auto-set on first sale",
  "last_transaction_date": "date, auto-update",
  "total_business_amount": "number, auto-calculate",
  "total_transactions": "number, auto-calculate",
  "average_order_value": "number, auto-calculate",
  "is_active": "boolean, default: true",
  "blacklisted": "boolean, default: false",
  "blacklist_reason": "string, optional",
  "blacklist_date": "date, optional",
  "loyalty_points": "number, default: 0",
  "loyalty_tier": "bronze|silver|gold|platinum",
  "internal_notes": "string, optional",
  "org_id": "uuid, from session"
}
```

---

## 2. SUPPLIER MODULE (`/api/suppliers/`)

### POST - Create/Update Supplier
```json
{
  // EXISTING FIELDS (Already in Frontend)
  "supplier_name": "string, required",
  "supplier_type": "manufacturer|distributor|stockist|importer",
  "primary_phone": "string, required",
  "primary_email": "string, optional",
  "address": "string, required",
  "city": "string, required",
  "state": "string, required",
  "gst_number": "string, optional",
  
  // NEW FIELDS TO ADD (Missing in Frontend)
  "supplier_code": "string, auto-generate if empty",
  "secondary_phone": "string, optional",
  "contact_person_name": "string, optional",
  "contact_person_phone": "string, optional",
  "pan_number": "string, optional",
  "drug_license_number": "string, REQUIRED",
  "drug_license_validity": "date, REQUIRED",
  "establishment_year": "number, optional",
  "payment_days": "number, default: 30",
  "preferred_payment_mode": "bank_transfer|cheque|cash",
  "early_payment_discount": "number, optional",
  "late_payment_penalty": "number, optional",
  "supplier_category": "preferred|regular|backup|blacklisted",
  "supplier_grade": "A|B|C|D",
  "product_categories": ["array of strings"],
  "brand_authorizations": ["array of strings"],
  "compliance_rating": "excellent|good|average|poor",
  "quality_rating": "number, 1-5",
  "delivery_rating": "number, 1-5",
  "vendor_documents": "json, optional",
  "bank_name": "string, REQUIRED",
  "account_number": "string, REQUIRED",
  "ifsc_code": "string, REQUIRED",
  "account_type": "current|savings",
  "account_holder_name": "string, REQUIRED",
  "credit_limit_given": "number, optional",
  "current_outstanding": "number, auto-calculated",
  "first_purchase_date": "date, auto-set",
  "last_purchase_date": "date, auto-update",
  "total_purchase_amount": "number, auto-calculate",
  "total_purchases": "number, auto-calculate",
  "average_order_value": "number, auto-calculate",
  "return_rate_percentage": "number, auto-calculate",
  "quality_issue_count": "number, default: 0",
  "is_active": "boolean, default: true",
  "is_approved": "boolean, default: false",
  "approved_date": "date, optional",
  "approved_by": "number, optional",
  "blacklisted": "boolean, default: false",
  "blacklist_reason": "string, optional",
  "blacklist_date": "date, optional",
  "internal_notes": "string, optional",
  "org_id": "uuid, from session"
}
```

---

## 3. PRODUCT MODULE (`/api/products/`)

### POST - Create/Update Product
```json
{
  // EXISTING FIELDS (Already in Frontend)
  "product_name": "string, required",
  "product_code": "string, optional",
  "generic_name": "string, optional",
  "brand": "string, optional",
  "manufacturer": "string, optional",
  "category": "string, optional",
  "hsn_code": "string, required",
  "gst_percentage": "number, required",
  "mrp": "number, required",
  "cost_price": "number, optional",
  "selling_price": "number, optional",
  "unit": "tablet|bottle|box|strip|vial",
  "pack_size": "string, optional",
  "min_stock_level": "number, optional",
  "max_stock_level": "number, optional",
  "is_active": "boolean, default: true",
  
  // NEW FIELDS TO ADD (Missing in Frontend)
  "schedule_type": "H|H1|X|G|J|empty for OTC",
  "prescription_required": "boolean, auto-set for H/H1/X",
  "is_narcotic": "boolean, auto-set for X",
  "storage_condition": "room_temp|cool|refrigerated|frozen",
  "shelf_life_months": "number, optional",
  "reorder_level": "number, optional",
  "reorder_quantity": "number, optional",
  "barcode": "string, optional",
  "product_image": "string/url, optional",
  "therapeutic_class": "string, optional",
  "composition": "string, optional",
  "side_effects": "string, optional",
  "contraindications": "string, optional",
  "dosage_form": "tablet|capsule|syrup|injection|cream",
  "strength": "string, optional",
  "route_of_administration": "oral|topical|injection|inhalation",
  "storage_instructions": "string, optional",
  "disposal_instructions": "string, optional",
  "is_combination_drug": "boolean, default: false",
  "active_ingredients": ["array of strings"],
  "inactive_ingredients": ["array of strings"],
  "org_id": "uuid, from session"
}
```

---

## 4. BATCH MODULE (`/api/batches/`)

### POST - Create/Update Batch
```json
{
  // EXISTING FIELDS (Already in Frontend)
  "product_id": "number, required",
  "batch_number": "string, required",
  "expiry_date": "date, required",
  "quantity_received": "number, required",
  "cost_per_unit": "number, required",
  "selling_price": "number, optional",
  "mrp": "number, optional",
  
  // NEW FIELDS TO ADD (Missing in Frontend)
  "supplier_id": "number, optional",
  "manufacturing_date": "date, REQUIRED",
  "quantity_available": "number, auto-calculate",
  "quantity_sold": "number, auto-track",
  "quantity_returned": "number, auto-track",
  "quantity_damaged": "number, manual entry",
  "quantity_expired": "number, manual entry",
  "quantity_reserved": "number, auto-track",
  "batch_status": "active|expired|damaged|recalled",
  "expiry_status": "fresh|near_expiry|expired",
  "qc_status": "passed|failed|pending",
  "qc_date": "date, optional",
  "qc_notes": "string, optional",
  "storage_condition": "string, optional",
  "last_movement_date": "date, auto-update",
  "is_narcotic": "boolean, from product",
  "org_id": "uuid, from session"
}
```

---

## 5. SALES INVOICE MODULE (`/api/invoices/`)

### POST - Create Invoice
```json
{
  // EXISTING FIELDS (Already in Frontend)
  "customer_id": "number, required",
  "invoice_date": "date, required",
  "due_date": "date, optional",
  "payment_terms": "cash|credit|advance",
  "delivery_type": "pickup|delivery",
  "delivery_charges": "number, optional",
  "discount_amount": "number, optional",
  "notes": "string, optional",
  "reference_no": "string, optional",
  "items": [
    {
      "product_id": "number, required",
      "batch_id": "number, optional",
      "quantity": "number, required",
      "free_quantity": "number, optional",
      "unit_price": "number, required",
      "discount_percent": "number, optional",
      "cgst_rate": "number, auto-calculate",
      "sgst_rate": "number, auto-calculate",
      "igst_rate": "number, auto-calculate"
    }
  ],
  
  // NEW FIELDS TO ADD (Missing in Frontend)
  "invoice_type": "tax_invoice|retail|proforma",
  "sales_person_id": "number, REQUIRED",
  "place_of_supply": "string/state, REQUIRED for GST",
  "customer_name": "string, snapshot",
  "customer_phone": "string, snapshot",
  "customer_address": "string, snapshot",
  "customer_gst": "string, snapshot",
  "billing_address": "string, required",
  "shipping_address": "string, required",
  "transport_company": "string, optional",
  "vehicle_number": "string, optional",
  "lr_number": "string, optional",
  "e_way_bill_number": "string, optional",
  "terms_conditions": "string, optional",
  "bank_details": "string, optional",
  "digital_signature": "string, optional",
  "qr_code_data": "string, auto-generate",
  "invoice_series_id": "number, optional",
  "branch_id": "number, from session",
  "org_id": "uuid, from session",
  
  // FOR NARCOTIC ITEMS ONLY
  "narcotic_records": [
    {
      "product_id": "number",
      "prescription_number": "string, REQUIRED",
      "prescription_date": "date, REQUIRED",
      "doctor_name": "string, REQUIRED",
      "doctor_registration": "string, REQUIRED",
      "doctor_phone": "string, optional",
      "patient_name": "string, REQUIRED",
      "patient_age": "number, REQUIRED",
      "patient_gender": "M|F|O, REQUIRED",
      "patient_address": "string, REQUIRED",
      "patient_phone": "string, optional",
      "prescribed_quantity": "number, REQUIRED",
      "dispensed_quantity": "number, REQUIRED"
    }
  ]
}
```

---

## 6. PURCHASE ORDER MODULE (`/api/purchase-orders/`)

### POST - Create Purchase Order
```json
{
  // EXISTING FIELDS (Already in Frontend)
  "supplier_id": "number, required",
  "po_date": "date, required",
  "items": [
    {
      "product_id": "number, required",
      "quantity": "number, required",
      "unit_price": "number, required",
      "discount_percent": "number, optional",
      "cgst_rate": "number, optional",
      "sgst_rate": "number, optional"
    }
  ],
  
  // NEW FIELDS TO ADD (Missing in Frontend)
  "po_type": "regular|urgent|scheduled|blanket",
  "po_status": "draft|sent|acknowledged|partial|completed",
  "expected_delivery_date": "date, REQUIRED",
  "payment_days": "number, default: 30",
  "payment_terms": "string, optional",
  "delivery_location_id": "number, optional",
  "billing_address": "string, optional",
  "shipping_address": "string, optional",
  "special_instructions": "string, optional",
  "terms_conditions": "string, optional",
  "approval_status": "pending|approved|rejected",
  "approved_by": "number, optional",
  "approved_date": "datetime, optional",
  "freight_charges": "number, optional",
  "insurance_charges": "number, optional",
  "other_charges": "number, optional",
  "advance_payment": "number, optional",
  "quality_check_required": "boolean, default: false",
  "partial_delivery_allowed": "boolean, default: true",
  "auto_close_on_delivery": "boolean, default: false",
  "reference_quotation_id": "number, optional",
  "branch_id": "number, from session",
  "org_id": "uuid, from session"
}
```

---

## 7. GOODS RECEIPT NOTE MODULE (`/api/grn/`)

### POST - Create GRN
```json
{
  // EXISTING FIELDS (Already in Frontend)
  "po_id": "number, optional",
  "supplier_id": "number, required",
  "received_date": "date, required",
  "invoice_number": "string, required",
  "invoice_date": "date, required",
  "items": [
    {
      "product_id": "number, required",
      "batch_number": "string, required",
      "expiry_date": "date, required",
      "received_quantity": "number, required",
      "accepted_quantity": "number, required",
      "rejected_quantity": "number, optional",
      "unit_price": "number, required"
    }
  ],
  
  // NEW FIELDS TO ADD (Missing in Frontend)
  "grn_type": "against_po|direct_purchase|sample|replacement",
  "transporter_name": "string, optional",
  "vehicle_number": "string, optional",
  "lr_number": "string, optional",
  "received_by": "number, REQUIRED",
  "qc_status": "pending|passed|failed|partial",
  "qc_date": "date, optional",
  "qc_by": "number, optional",
  "qc_notes": "string, optional",
  "storage_location_id": "number, REQUIRED",
  "temperature_on_receipt": "number, optional",
  "damaged_quantity": "number, optional",
  "shortage_quantity": "number, optional",
  "excess_quantity": "number, optional",
  "rejection_reason": "string, optional",
  "supplier_dc_number": "string, optional",
  "supplier_dc_date": "date, optional",
  "remarks": "string, optional",
  "branch_id": "number, from session",
  "org_id": "uuid, from session"
}
```

---

## 8. SALES RETURN MODULE (`/api/sales-returns/`)

### POST - Create Sales Return
```json
{
  // EXISTING FIELDS (Already in Frontend)
  "invoice_id": "number, required",
  "return_date": "date, required",
  "return_reason": "expired|damaged|wrong_product|quality_issue|not_required",
  "items": [
    {
      "invoice_item_id": "number, required",
      "product_id": "number, required",
      "batch_id": "number, optional",
      "return_quantity": "number, required",
      "reason": "string, required"
    }
  ],
  
  // NEW FIELDS TO ADD (Missing in Frontend)
  "return_type": "credit_note|replacement|refund",
  "customer_id": "number, required",
  "approved_by": "number, optional",
  "approval_status": "pending|approved|rejected",
  "inspection_status": "pending|passed|failed",
  "inspection_notes": "string, optional",
  "credit_note_number": "string, auto-generate",
  "credit_note_date": "date, optional",
  "refund_amount": "number, optional",
  "refund_mode": "cash|bank_transfer|adjustment",
  "replacement_invoice_id": "number, optional",
  "stock_impact": "add_to_stock|destroy|quarantine",
  "destruction_certificate": "string, optional",
  "return_charges": "number, optional",
  "pickup_required": "boolean, default: false",
  "pickup_date": "date, optional",
  "remarks": "string, optional",
  "branch_id": "number, from session",
  "org_id": "uuid, from session"
}
```

---

## 9. PAYMENT MODULE (`/api/payments/`)

### POST - Create Payment
```json
{
  // EXISTING FIELDS (Already in Frontend)
  "party_type": "customer|supplier",
  "party_id": "number, required",
  "payment_date": "date, required",
  "payment_amount": "number, required",
  "payment_mode": "cash|upi|bank_transfer|cheque|card",
  "reference_number": "string, conditional",
  "bank_name": "string, conditional",
  "notes": "string, optional",
  "allocations": [
    {
      "invoice_id": "number",
      "allocated_amount": "number"
    }
  ],
  
  // NEW FIELDS TO ADD (Missing in Frontend)
  "payment_type": "receipt|payment|advance|refund",
  "cheque_number": "string, conditional",
  "cheque_date": "date, conditional",
  "clearance_date": "date, optional",
  "clearance_status": "pending|cleared|bounced",
  "bank_account_id": "number, optional",
  "transaction_charges": "number, optional",
  "tds_amount": "number, optional",
  "exchange_rate": "number, default: 1",
  "currency": "INR|USD|EUR, default: INR",
  "approval_status": "auto_approved|pending|approved|rejected",
  "approved_by": "number, optional",
  "reconciliation_status": "pending|reconciled|exception",
  "reconciliation_date": "date, optional",
  "attachment_url": "string, optional",
  "payment_gateway_response": "json, optional",
  "is_advance": "boolean, default: false",
  "unallocated_amount": "number, auto-calculate",
  "branch_id": "number, from session",
  "org_id": "uuid, from session"
}
```

---

## 10. STOCK ADJUSTMENT MODULE (`/api/stock-adjustments/`)

### POST - Create Stock Adjustment
```json
{
  // EXISTING FIELDS (Already in Frontend)
  "adjustment_date": "date, required",
  "adjustment_type": "increase|decrease",
  "reason": "physical_count|damage|expiry|theft|sample|other",
  "items": [
    {
      "product_id": "number, required",
      "batch_id": "number, optional",
      "current_quantity": "number, display",
      "adjustment_quantity": "number, required"
    }
  ],
  "notes": "string, required",
  
  // NEW FIELDS TO ADD (Missing in Frontend)
  "reference_document": "string, optional",
  "approved_by": "number, REQUIRED",
  "approval_date": "datetime, optional",
  "cost_impact": "number, auto-calculate",
  "location_id": "number, REQUIRED",
  "inspection_report": "string, optional",
  "destruction_certificate": "string, conditional",
  "insurance_claim_number": "string, optional",
  "police_report_number": "string, conditional for theft",
  "quality_check_id": "number, optional",
  "adjustment_category": "operational|compliance|quality|security",
  "photographic_evidence": ["array of urls"],
  "witness_name": "string, optional",
  "witness_signature": "string, optional",
  "branch_id": "number, from session",
  "org_id": "uuid, from session"
}
```

---

## 11. CREDIT/DEBIT NOTE MODULE (`/api/credit-debit-notes/`)

### POST - Create Credit/Debit Note
```json
{
  // EXISTING FIELDS (Already in Frontend)
  "note_type": "credit|debit",
  "note_date": "date, required",
  "party_type": "customer|supplier",
  "party_id": "number, required",
  "reason": "return|discount|damage|price_adjustment|other",
  "amount": "number, required",
  "notes": "string, optional",
  
  // NEW FIELDS TO ADD (Missing in Frontend)
  "reference_invoice_id": "number, optional",
  "reference_invoice_number": "string, optional",
  "items": [
    {
      "product_id": "number, optional",
      "description": "string, required",
      "quantity": "number, optional",
      "rate": "number, optional",
      "amount": "number, required",
      "cgst_rate": "number, optional",
      "sgst_rate": "number, optional",
      "igst_rate": "number, optional"
    }
  ],
  "adjustment_type": "against_invoice|against_account|future_adjustment",
  "adjusted_invoice_ids": ["array of numbers"],
  "approval_status": "draft|approved|cancelled",
  "approved_by": "number, optional",
  "approval_date": "datetime, optional",
  "gst_applicable": "boolean, default: true",
  "place_of_supply": "string, required if GST",
  "reverse_charge": "boolean, default: false",
  "original_invoice_date": "date, optional",
  "branch_id": "number, from session",
  "org_id": "uuid, from session"
}
```

---

## 12. GST MODULE (`/api/gst/`)

### POST - File GST Return
```json
{
  // NEW FIELDS (All Missing in Frontend)
  "return_type": "GSTR1|GSTR3B|GSTR9",
  "return_period": "MM-YYYY, required",
  "filing_date": "date, required",
  "sales_data": {
    "b2b_invoices": "number",
    "b2c_invoices": "number",
    "export_invoices": "number",
    "credit_notes": "number",
    "debit_notes": "number",
    "amended_invoices": "number"
  },
  "tax_data": {
    "cgst_payable": "number",
    "sgst_payable": "number",
    "igst_payable": "number",
    "cess_payable": "number",
    "cgst_credit": "number",
    "sgst_credit": "number",
    "igst_credit": "number",
    "net_payable": "number"
  },
  "itc_data": {
    "eligible_itc": "number",
    "claimed_itc": "number",
    "reversed_itc": "number",
    "ineligible_itc": "number"
  },
  "late_fee": "number, optional",
  "interest": "number, optional",
  "penalty": "number, optional",
  "payment_reference": "string, optional",
  "arn_number": "string, after filing",
  "filing_status": "draft|filed|accepted|rejected",
  "rejection_reason": "string, optional",
  "org_id": "uuid, from session"
}
```

---

## 13. NARCOTIC REGISTER MODULE (`/api/narcotic-register/`)

### POST - Create Narcotic Entry
```json
{
  // NEW FIELDS (All Missing in Frontend - CRITICAL)
  "entry_type": "purchase|sale|return|destruction|theft",
  "entry_date": "date, required",
  "product_id": "number, required",
  "product_name": "string, snapshot",
  "batch_id": "number, required",
  "batch_number": "string, snapshot",
  "schedule_type": "H|H1|X, required",
  
  // FOR SALES ONLY
  "prescription_number": "string, REQUIRED for sale",
  "prescription_date": "date, REQUIRED for sale",
  "doctor_name": "string, REQUIRED for sale",
  "doctor_registration": "string, REQUIRED for sale",
  "doctor_phone": "string, optional",
  "doctor_address": "string, optional",
  "patient_name": "string, REQUIRED for sale",
  "patient_age": "number, REQUIRED for sale",
  "patient_gender": "M|F|O, REQUIRED for sale",
  "patient_address": "string, REQUIRED for sale",
  "patient_phone": "string, optional",
  "patient_id_type": "aadhar|pan|voter_id|passport",
  "patient_id_number": "string, optional",
  
  // QUANTITY TRACKING
  "opening_balance": "number, required",
  "quantity_received": "number, for purchase",
  "quantity_dispensed": "number, for sale",
  "quantity_returned": "number, for return",
  "quantity_destroyed": "number, for destruction",
  "closing_balance": "number, required",
  
  // COMPLIANCE
  "invoice_number": "string, required",
  "voucher_number": "string, auto-generate",
  "destruction_certificate": "string, for destruction",
  "police_report_number": "string, for theft",
  "witness_name": "string, optional",
  "witness_signature": "string, optional",
  "inspector_name": "string, optional",
  "inspection_date": "date, optional",
  "remarks": "string, optional",
  
  "created_by": "number, from session",
  "branch_id": "number, from session",
  "org_id": "uuid, from session"
}
```

---

## 14. LICENSE MANAGEMENT MODULE (`/api/licenses/`)

### POST - Create/Update License
```json
{
  // NEW FIELDS (All Missing in Frontend)
  "license_type": "drug_license|gst|fssai|factory|wholesale|retail",
  "license_number": "string, required",
  "license_name": "string, required",
  "issuing_authority": "string, required",
  "issue_date": "date, required",
  "valid_from": "date, required",
  "valid_until": "date, required",
  "renewal_due_date": "date, optional",
  "license_category": "primary|secondary|special",
  "license_scope": "state|national|international",
  "applicable_products": ["array of product categories"],
  "license_conditions": "string, optional",
  "license_fee": "number, optional",
  "renewal_fee": "number, optional",
  "penalty_amount": "number, optional",
  "document_url": "string, optional",
  "renewal_reminder_days": "number, default: 30",
  "compliance_status": "compliant|non_compliant|expired",
  "last_inspection_date": "date, optional",
  "next_inspection_date": "date, optional",
  "compliance_score": "number, 0-100",
  "org_id": "uuid, from session"
}
```

---

## 15. TERRITORY & ROUTE MODULE (`/api/territories/` & `/api/routes/`)

### POST - Create Territory
```json
{
  // NEW FIELDS (All Missing in Frontend)
  "territory_code": "string, required",
  "territory_name": "string, required",
  "territory_type": "state|city|area|zone",
  "parent_territory_id": "number, optional",
  "territory_manager_id": "number, optional",
  "sales_team_ids": ["array of numbers"],
  "monthly_target": "number, optional",
  "quarterly_target": "number, optional",
  "yearly_target": "number, optional",
  "geographic_boundaries": "json/geojson, optional",
  "pincode_range": "string, optional",
  "is_active": "boolean, default: true",
  "org_id": "uuid, from session"
}
```

### POST - Create Route
```json
{
  // NEW FIELDS (All Missing in Frontend)
  "route_code": "string, required",
  "route_name": "string, required",
  "territory_id": "number, required",
  "route_type": "daily|weekly|monthly",
  "assigned_to": "number, salesperson_id",
  "visit_days": ["array of weekdays"],
  "visit_frequency": "daily|alternate|weekly|biweekly|monthly",
  "customer_ids": ["array of customer_ids"],
  "sequence": ["ordered array of customer_ids"],
  "estimated_distance": "number, km",
  "estimated_time": "number, hours",
  "vehicle_type": "bike|car|van|truck",
  "is_active": "boolean, default: true",
  "org_id": "uuid, from session"
}
```

---

## CRITICAL IMPLEMENTATION NOTES

### 1. Required Fields by Module Priority

**IMMEDIATE (Legal Compliance):**
- Customer: `drug_license_number`, `drug_license_validity`
- Supplier: `drug_license_number`, `drug_license_validity`
- Product: `schedule_type`, `is_narcotic`, `prescription_required`
- Narcotic Register: ALL fields for Schedule H/H1/X drugs
- Invoice: `place_of_supply` for GST

**WEEK 1 (Business Critical):**
- Customer: `whatsapp_number`, `credit_rating`, `assigned_salesperson_id`
- Supplier: `bank_name`, `account_number`, `ifsc_code`
- Batch: `manufacturing_date`, `qc_status`
- Payment: `clearance_date`, `clearance_status`

**WEEK 2-4 (Enhancements):**
- All loyalty fields
- All analytics fields
- All territory/route fields
- Advanced payment fields

### 2. Auto-Generated/Calculated Fields (Don't capture, backend handles)
```json
{
  "customer_code": "auto-generate",
  "supplier_code": "auto-generate",
  "invoice_number": "auto-generate",
  "order_number": "auto-generate",
  "current_outstanding": "auto-calculate",
  "total_business_amount": "auto-calculate",
  "average_order_value": "auto-calculate",
  "first_transaction_date": "auto-set",
  "last_transaction_date": "auto-update",
  "created_at": "auto-timestamp",
  "updated_at": "auto-timestamp",
  "created_by": "from session",
  "org_id": "from session",
  "branch_id": "from session"
}
```

### 3. Conditional Required Fields
```javascript
// These become REQUIRED based on conditions
if (product.schedule_type === 'H' || 'H1' || 'X') {
  prescription_required = true;
  narcotic_register_entry = required;
}

if (payment_mode === 'cheque') {
  cheque_number = required;
  cheque_date = required;
  bank_name = required;
}

if (payment_mode === 'bank_transfer') {
  reference_number = required;
  bank_name = required;
}

if (customer.state !== company.state) {
  place_of_supply = required;
  igst_applicable = true;
}
```

### 4. Validation Rules Summary
```javascript
const validationRules = {
  drug_license: /^(DL-[A-Z]{2}-\d{5}|20[A-Z]{1,2}\d{4,}|21[A-Z]{1,2}\d{4,})$/,
  gst_number: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
  pan_number: /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/,
  ifsc_code: /^[A-Z]{4}0[A-Z0-9]{6}$/,
  mobile_number: /^[6-9]\d{9}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  pincode: /^[1-9][0-9]{5}$/,
  vehicle_number: /^[A-Z]{2}[-\s]?\d{1,2}[-\s]?[A-Z]{1,2}[-\s]?\d{4}$/
};
```

---

## API Response Format

### Success Response
```json
{
  "success": true,
  "data": {
    "id": 123,
    "created_at": "2024-01-15T10:30:00Z",
    "message": "Customer created successfully"
  }
}
```

### Error Response
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

---

*This document contains ALL fields that should be sent to APIs. Fields marked as "NEW FIELDS TO ADD" are currently missing from frontend and need implementation.*