# Where to Find Implementations in Frontend

**Purpose:** Locate where new fields appear in the UI and check implementation status  
**Date:** 2025-08-08

---

## 🔍 Quick Navigation Guide

### How to Access Each Module in Your App

Based on your `Home.tsx` and `App.tsx` structure, here's where to find everything:

---

## 1. CUSTOMER MASTER FIELDS

### Where to Access:
1. **From Home Screen:** Click **"Master Management"** tile (or press `Ctrl+Shift+M`)
2. **Inside Master Hub:** Look for **"Customers"** in the sidebar
3. **To Create New:** Click **"Add Customer"** button

### File Locations:
```
Primary Component: /src/components/global/modals/CustomerCreationModal.js
Also used in: 
- /src/components/sales/InvoiceFlow.js (CustomerSearch component)
- /src/components/Customers.js (if exists)
```

### How to Check if Implemented:
```bash
# Check if drug license fields exist
grep -r "drug_license_number" src/components/
grep -r "drug_license_validity" src/components/
grep -r "whatsapp_number" src/components/
grep -r "credit_rating" src/components/
```

### Visual Check in UI:
When creating a new customer, look for these sections:

**❌ Currently MISSING (Not Implemented):**
- [ ] **Regulatory Compliance Section**
  - Drug License Number field
  - License Expiry Date field
  - FSSAI Number field
- [ ] **Credit Management Section**
  - Credit Rating dropdown (A/B/C/D)
  - Overdue Interest Rate
- [ ] **Business Information Section**
  - WhatsApp Number field
  - Assigned Salesperson dropdown
  - Territory dropdown
  - Route dropdown
- [ ] **Communication Preferences**
  - SMS/Email/WhatsApp checkboxes

**✅ Currently EXISTS:**
- [x] Basic Information (Name, Phone, Email)
- [x] Address fields
- [x] GST Number
- [x] Credit Limit
- [x] Payment Terms

---

## 2. SUPPLIER MASTER FIELDS

### Where to Access:
1. **From Home Screen:** Click **"Master Management"** tile
2. **Inside Master Hub:** Look for **"Suppliers"** in the sidebar
3. **To Create New:** Click **"Add Supplier"** button

### File Locations:
```
Primary Component: /src/components/global/modals/SupplierCreationModal.js (MAY NOT EXIST YET)
Alternative: /src/components/master/SupplierMaster.js
Used in: /src/components/purchase/PurchaseFlow.js
```

### Check Implementation:
```bash
# Check if supplier modal exists
ls -la src/components/global/modals/Supplier*
ls -la src/components/master/Supplier*

# Check for bank details fields
grep -r "bank_name" src/components/
grep -r "account_number" src/components/
grep -r "ifsc_code" src/components/
```

### Visual Check in UI:
**❌ Currently MISSING:**
- [ ] **Banking Details Section** (CRITICAL)
  - Bank Name
  - Account Number
  - IFSC Code
  - Account Holder Name
- [ ] **Compliance Section**
  - Drug License fields
- [ ] **Performance Ratings**
  - Quality Rating (1-5 stars)
  - Delivery Rating
  - Compliance Rating

---

## 3. PRODUCT MASTER FIELDS

### Where to Access:
1. **From Home Screen:** Click **"Master Management"** tile
2. **Inside Master Hub:** Look for **"Products"** in the sidebar
3. **Alternative:** Press `Products` from old menu

### File Locations:
```
Primary Component: /src/components/Products.js
Or: /src/components/master/ProductMaster.tsx
Modal: /src/components/global/modals/ProductCreationModal.js
```

### Check Implementation:
```bash
# Check for schedule type fields
grep -r "schedule_type" src/components/
grep -r "is_narcotic" src/components/
grep -r "prescription_required" src/components/
```

### Visual Check in UI:
**❌ Currently MISSING:**
- [ ] **Drug Schedule Section**
  - Schedule Type dropdown (H/H1/X/G/J/OTC)
  - Is Narcotic checkbox
  - Prescription Required checkbox
- [ ] **Storage Information**
  - Storage Condition dropdown
  - Manufacturing Date

**✅ Currently EXISTS:**
- [x] Product Name, Code
- [x] HSN Code
- [x] GST Rate
- [x] MRP, Selling Price

---

## 4. INVOICE/SALES FIELDS

### Where to Access:
1. **From Home Screen:** Click **"Sales"** tile (or press `Ctrl+S`)
2. **Inside Sales Hub:** Click **"New Invoice"** in sidebar
3. **Create Invoice Flow:** The multi-step form

### File Locations:
```
Primary Component: /src/components/sales/InvoiceFlow.js
Related: /src/components/sales/InvoiceFlowMinimal.tsx
```

### Check Implementation:
```bash
# Check for new invoice fields
grep -r "place_of_supply" src/components/sales/
grep -r "sales_person_id" src/components/sales/
grep -r "narcotic_records" src/components/sales/
grep -r "e_invoice_number" src/components/sales/
```

### Visual Check in Invoice Creation:
**❌ Currently MISSING:**
- [ ] **Place of Supply** field (GST compliance)
- [ ] **Salesperson** dropdown
- [ ] **Narcotic Prescription Modal** (for Schedule X drugs)
- [ ] **E-Invoice** fields

**✅ Currently EXISTS:**
- [x] Customer Selection
- [x] Product Selection
- [x] Basic Invoice Details
- [x] Payment Terms

---

## 5. NARCOTIC REGISTER

### Where to Access:
**❌ DOES NOT EXIST YET** - Needs to be created

### Should be accessible from:
1. During invoice creation when selling Schedule X drugs
2. As a separate module in Compliance section
3. In reports for daily reconciliation

### File Should Be Created At:
```
/src/components/compliance/NarcoticRegister.js
/src/components/compliance/NarcoticPrescriptionModal.js
```

### How to Check:
```bash
# Check if narcotic components exist
ls -la src/components/compliance/
grep -r "NarcoticRegister" src/
grep -r "prescription_number" src/
```

---

## 6. PURCHASE ORDER FIELDS

### Where to Access:
1. **From Home Screen:** Click **"Purchase Entry"** tile (or press `Ctrl+P`)
2. **Inside Purchase Hub:** Click **"Purchase Order"** in sidebar

### File Locations:
```
Primary Component: /src/components/purchase/PurchaseOrderFlow.js
Or: /src/components/purchase/PurchaseOrderMinimal.tsx
```

### Visual Check:
**❌ Currently MISSING:**
- [ ] Expected Delivery Date
- [ ] PO Type (Regular/Urgent/Scheduled)
- [ ] Approval Status
- [ ] Special Instructions

---

## 7. PAYMENT ENTRY FIELDS

### Where to Access:
1. **From Home Screen:** Click **"Payment Entry"** tile (or press `Ctrl+M`)
2. Payment Entry screen opens

### File Locations:
```
Primary Component: /src/components/payment/EnterprisePaymentEntry.tsx
Or: /src/components/payment/ModularPaymentEntry.tsx
```

### Visual Check:
**❌ Currently MISSING:**
- [ ] Clearance Date field
- [ ] Clearance Status dropdown
- [ ] Bank Charges field
- [ ] Unallocated Amount tracking

---

## 8. RETURNS MODULE

### Where to Access:
1. **From Home Screen:** Click **"Returns Management"** tile (or press `F8`)
2. **Inside Returns Hub:** Select Customer/Supplier Return

### File Locations:
```
Primary Component: /src/components/returns/ReturnsHub.tsx
Sales Return: /src/components/returns/SalesReturnFlow.js
```

---

## 9. LICENSE & COMPLIANCE ALERTS

### Where These Should Appear:

#### A. Dashboard Widget
**Location:** Home screen or Dashboard  
**File:** `/src/components/Home.tsx` or `/src/components/Dashboard.js`  
**Look for:** License expiry alerts, compliance warnings

#### B. Notification Center
**Location:** Bell icon in header (already exists)  
**File:** `/src/components/NotificationCenter.js`  
**Should show:** License expiry notifications

#### C. During Transactions
**When creating invoice/purchase:**
- Should warn if customer/supplier license expired
- Should block if selling without valid license

---

## 🔍 HOW TO VERIFY IMPLEMENTATION STATUS

### Method 1: Visual Inspection
1. Open the app in browser
2. Navigate to each module using the paths above
3. Look for the missing sections/fields listed

### Method 2: Code Search
```bash
# Run from frontend directory

# Check all missing critical fields
echo "=== Checking Critical Fields ==="
echo "Drug License:" && grep -r "drug_license" src/ | wc -l
echo "WhatsApp:" && grep -r "whatsapp_number" src/ | wc -l
echo "Credit Rating:" && grep -r "credit_rating" src/ | wc -l
echo "Bank Details:" && grep -r "bank_name\|account_number\|ifsc" src/ | wc -l
echo "Schedule Type:" && grep -r "schedule_type" src/ | wc -l
echo "Narcotic:" && grep -r "is_narcotic\|prescription" src/ | wc -l
echo "Place of Supply:" && grep -r "place_of_supply" src/ | wc -l

# If counts are 0 or very low, fields are not implemented
```

### Method 3: Component Inspection
```bash
# Check which modals exist
ls -la src/components/global/modals/

# Expected to see:
# ✅ CustomerCreationModal.js - EXISTS
# ❌ SupplierCreationModal.js - MAY NOT EXIST
# ✅ ProductCreationModal.js - EXISTS

# Check master components
ls -la src/components/master/
```

### Method 4: Browser DevTools
1. Open Chrome DevTools (F12)
2. Go to Components tab (React DevTools)
3. Search for "Customer", "Supplier", "Product"
4. Inspect props to see what fields are being used

---

## 📊 IMPLEMENTATION STATUS SUMMARY

Based on the codebase analysis:

### ✅ IMPLEMENTED (Working)
- Basic customer creation (name, phone, address, GST)
- Basic product creation (name, HSN, price)
- Basic invoice creation
- Payment entry (basic)
- Sales/Purchase/Returns modules structure

### ❌ NOT IMPLEMENTED (Missing)
**CRITICAL (Legal Requirements):**
1. **Drug License Fields** - Customers & Suppliers
2. **Narcotic Register** - Complete system missing
3. **Schedule Type** - Product classification
4. **Place of Supply** - GST compliance
5. **Bank Details** - Supplier payments

**HIGH PRIORITY:**
6. WhatsApp Number capture
7. Credit Rating system
8. Salesperson assignment
9. Territory/Route management
10. QC Status for batches

**MEDIUM PRIORITY:**
11. License expiry alerts
12. Compliance dashboard
13. Performance ratings
14. Loyalty system
15. Advanced payment tracking

---

## 🚀 QUICK TEST PATHS

### Test Customer Creation:
1. Home → Master Management → Customers → Add Customer
2. **Check for:** Compliance section with drug license fields

### Test Product Creation:
1. Home → Master Management → Products → Add Product
2. **Check for:** Schedule type dropdown

### Test Invoice Creation:
1. Home → Sales → New Invoice
2. Add a Schedule X product
3. **Check for:** Prescription modal popup

### Test Supplier Creation:
1. Home → Master Management → Suppliers → Add Supplier
2. **Check for:** Banking details section

---

## 📝 DEVELOPER NOTES

### If fields are missing, check these files first:

1. **Form Components:**
   - `/src/components/global/modals/*CreationModal.js`
   - `/src/components/global/ui/forms/*`

2. **API Integration:**
   - `/src/services/api/*`
   - Check if API calls include new fields

3. **State Management:**
   - Check if form states include new fields
   - Look for `useState` declarations

4. **Validation:**
   - `/src/utils/validation.js` (if exists)
   - Check inline validation in components

---

*Use this guide to quickly locate and verify which features are implemented and which are still missing in your frontend.*