# 📋 Sales Invoice Creation - Complete Testing Documentation

## 🎯 Overview
This document provides a complete map of the Sales Invoice creation flow, including all components, APIs, database operations, and triggers. Each section includes current status, issues, and test cases for Linear.

---

## 🏗️ Architecture Overview

### Frontend Flow
```
SalesHub.tsx → InvoiceFlow.js → Backend API → Database → Triggers
```

### Backend Flow
```
/api/invoices/ → Orders Table → Invoices Table → Invoice Items → Triggers → Inventory Update
```

---

## 📱 FRONTEND COMPONENTS & FLOW

### 1. Entry Point: Sales Hub
**File:** `frontend/src/components/sales/SalesHub.tsx`
- **Status:** ✅ Working
- **Component:** Loads `InvoiceFlow` component when Invoice is selected
- **Issues:** None

### 2. Main Component: InvoiceFlow
**File:** `frontend/src/components/sales/InvoiceFlow.js`

#### Step 1: Customer Selection
**Component:** `CustomerSearch` (global component)
**Location:** Lines 722-730

**Current Status:**
- ✅ Search functionality works
- ⚠️ Remove Customer button (needs testing after recent fix)
- ❌ Continue button not enabling properly

**State Variables:**
```javascript
- selectedCustomer (line 79)
- invoice.customer_id
- invoice.customer_details
```

**Functions:**
- `handleCustomerSelect()` (lines 238-273) - ✅ Fixed to handle null
- `validateInvoice()` (lines 370-390) - Validates customer selection

**Test Cases:**
```
□ Search for customer "Neha" - should show dropdown
□ Select customer - should populate customer details
□ Click Remove Customer - should clear selection
□ Continue button should enable when customer selected
```

#### Step 2: Product Selection
**Component:** `ProductSearchSimple` (global component)
**Location:** Lines 738-745

**Current Status:**
- ✅ Product search works
- ✅ Add to invoice works
- ⚠️ Batch selection needs verification

**Functions:**
- `handleProductSelect()` (lines 275-337) - Adds product to invoice
- `handleQuantityChange()` - Updates quantity
- `handleRemoveItem()` - Removes item from invoice

**Test Cases:**
```
□ Search for product "Atlas" - should show results
□ Select product - should add to items table
□ Change quantity - should update totals
□ Remove item - should update totals
```

#### Step 3: Items Table
**Component:** `ItemsTable` (global component)
**Location:** Lines 747-766

**Current Status:**
- ✅ Display items works
- ✅ Edit quantity works
- ✅ GST calculation works
- ⚠️ Discount calculation needs verification

**State:**
```javascript
invoice.items[] - Array of items with:
- product_id, product_name
- quantity, unit_price
- discount_percent, gst_percent
- line_total (calculated)
```

**Test Cases:**
```
□ Items display with correct columns
□ Quantity change updates line total
□ Discount applies correctly
□ GST calculates as CGST+SGST or IGST
□ Total amount updates automatically
```

#### Step 4: Review & Save
**Location:** Lines 392-397 (handleProceedToReview)

**Current Status:**
- ⚠️ Proceed to review validation
- ❌ Save invoice may have issues

**Functions:**
- `handleProceedToReview()` (line 392) - Validates and moves to step 2
- `handleSaveInvoice()` (lines 399-525) - Saves invoice to backend

---

## 🔧 BACKEND APIs & DATABASE

### Main Invoice API
**File:** `backend/app/api/routes/invoices.py`
**Endpoint:** `POST /api/invoices/`

#### API Flow:
1. **Receive Request** (line 18)
   - ✅ Accepts invoice data
   - ✅ Validates required fields

2. **Get Branch & User** (lines 38-50)
   - ✅ Queries `master.org_branches`
   - ✅ Queries `master.org_users`
   - **Issue:** May use default values if not found

3. **Generate Order Number** (lines 53-59)
   - ✅ Auto-generates ORD-XXXXXX
   - **Issue:** Potential race condition

4. **Create Order** (lines 86-113)
   ```sql
   INSERT INTO sales.orders (
     org_id, branch_id, order_number, order_date,
     customer_id, delivery_priority, payment_terms,
     subtotal_amount, final_amount, ...
   )
   ```
   - ✅ Uses correct column names (fixed)
   - ✅ Creates order record

5. **Create Invoice** (lines 133-166)
   ```sql
   INSERT INTO sales.invoices (
     org_id, branch_id, invoice_number, invoice_date,
     order_id, customer_id, customer_name,
     subtotal_amount, final_amount, ...
   )
   ```
   - ✅ Creates invoice record
   - ✅ Links to order

6. **Create Invoice Items** (lines 169-232)
   ```sql
   INSERT INTO sales.invoice_items (
     invoice_id, product_id, product_name,
     quantity, unit_price, line_total,
     discount_percent, batch_id, ...
   )
   ```
   - ⚠️ Batch selection logic (lines 193-201)
   - ❌ Items may not persist (needs investigation)

---

## 🔄 DATABASE TRIGGERS

### 1. GST Calculation Trigger
**Name:** `calculate_gst_on_invoice_item_trigger`
**File:** `backend/app/api/routes/create_fixed_triggers.py`
**Table:** `sales.invoice_items`
**Event:** BEFORE INSERT/UPDATE

**Status:** ✅ Fixed
**Function:**
- Calculates CGST/SGST based on GST rate
- Updates taxable_amount, cgst_amount, sgst_amount
- Updates line_total with tax

**Issues Fixed:**
- ✅ Changed `gst_percent` to `gst_percentage`
- ✅ Added null handling

### 2. Invoice Totals Update Trigger
**Name:** `update_invoice_totals_trigger`
**Table:** `sales.invoice_items`
**Event:** AFTER INSERT/UPDATE/DELETE

**Status:** ✅ Created
**Function:**
- Recalculates invoice totals when items change
- Updates subtotal, tax amounts, final_amount

**Test:**
```sql
SELECT final_amount FROM sales.invoices WHERE invoice_id = X;
-- Should match sum of invoice_items
```

### 3. Inventory Update Trigger
**Name:** `inventory_update_on_sale_trigger`
**Table:** `sales.invoice_items`
**Event:** AFTER INSERT/DELETE

**Status:** ⚠️ Partially working
**Function:**
- Deducts quantity_available from batches
- Only works if batch_id provided

**Issues:**
- ❌ Removed `quantity_sold` column (doesn't exist)
- ⚠️ Batch selection may not work

### 4. Order Status Sync Trigger
**Name:** `sync_order_invoice_status_trigger`
**Table:** `sales.invoices`
**Event:** AFTER UPDATE

**Status:** ✅ Fixed
**Function:**
- Updates order status when invoice status changes
- Syncs payment_status

---

## 🔴 CURRENT ISSUES & STATUS

### Critical Issues:
1. **Invoice Items Not Persisting**
   - Items created but may not show in database
   - Possible transaction rollback issue

2. **Continue Button Not Working**
   - Frontend validation issue
   - selectedCustomer state not syncing

3. **Inventory Not Updating**
   - Batch_id may be null
   - Trigger only works with valid batch_id

### Working Features:
- ✅ Customer search
- ✅ Product search
- ✅ Order creation
- ✅ Invoice number generation
- ✅ GST calculation
- ✅ Basic invoice creation

### Needs Testing:
- ⚠️ Remove Customer button (just fixed)
- ⚠️ Batch allocation
- ⚠️ Invoice persistence after creation
- ⚠️ Trigger execution

---

## 📝 LINEAR TEST CASES

### Test Suite 1: Customer Selection
```
Feature: Customer Selection in Invoice Creation

Test 1.1: Search Customer
GIVEN I am on Sales Invoice creation screen
WHEN I type "Neha" in customer search
THEN I should see customer suggestions dropdown
AND "Neha" with phone "7738228969" should be visible

Test 1.2: Select Customer
GIVEN Customer search results are visible
WHEN I click on "Neha"
THEN Customer details should populate
AND Continue button should be enabled

Test 1.3: Remove Customer
GIVEN A customer is selected
WHEN I click "Remove Customer" button
THEN Customer should be cleared
AND Continue button should be disabled
```

### Test Suite 2: Product Addition
```
Feature: Adding Products to Invoice

Test 2.1: Search Product
GIVEN Customer is selected
WHEN I search for product "Atlas"
THEN Product suggestions should appear

Test 2.2: Add Product
GIVEN Product search shows results
WHEN I select "Atlas"
THEN Product should be added to items table
AND Total should update

Test 2.3: Update Quantity
GIVEN Product is in items table
WHEN I change quantity to 5
THEN Line total should update
AND Invoice total should recalculate
```

### Test Suite 3: Invoice Saving
```
Feature: Save Invoice

Test 3.1: Proceed to Review
GIVEN Customer selected and items added
WHEN I click Continue
THEN Should move to review screen
AND Show invoice summary

Test 3.2: Save Invoice
GIVEN Invoice is reviewed
WHEN I click Save
THEN Invoice should be created
AND Invoice number should be generated
AND Should show success message

Test 3.3: Verify in Database
GIVEN Invoice saved successfully
WHEN I check database
THEN Invoice should exist in sales.invoices
AND Items should exist in sales.invoice_items
AND Order should exist in sales.orders
```

---

## 🔍 DEBUGGING CHECKLIST

### Frontend Console Logs Added:
```javascript
- handleCustomerSelect() - logs customer selection/removal
- validateInvoice() - logs validation checks
- handleProceedToReview() - logs state before proceeding
```

### Backend Verification Queries:
```sql
-- Check last invoice
SELECT * FROM sales.invoices 
ORDER BY created_at DESC LIMIT 1;

-- Check invoice items
SELECT * FROM sales.invoice_items 
WHERE invoice_id = (SELECT MAX(invoice_id) FROM sales.invoices);

-- Check triggers
SELECT trigger_name, event_object_table 
FROM information_schema.triggers 
WHERE event_object_schema = 'sales';

-- Check inventory update
SELECT product_id, quantity_available 
FROM inventory.batches 
WHERE product_id IN (SELECT product_id FROM sales.invoice_items);
```

---

## 🚀 NEXT STEPS

### Immediate Actions:
1. Test with console logging enabled
2. Verify triggers are active in production
3. Check transaction commit in backend
4. Test batch allocation logic

### Development Tasks:
1. Add transaction logging
2. Implement batch selection UI
3. Add invoice retrieval endpoint
4. Create inventory reconciliation

### Monitoring:
1. Add error tracking for failed invoices
2. Log trigger execution
3. Monitor inventory updates
4. Track invoice completion rate

---

## 📊 SUCCESS METRICS

### Functional Tests:
- [ ] Customer selection works
- [ ] Product addition works
- [ ] Invoice saves to database
- [ ] Invoice items persist
- [ ] Triggers execute correctly
- [ ] Inventory updates

### Data Integrity:
- [ ] Invoice totals match item sums
- [ ] GST calculates correctly
- [ ] Order linked to invoice
- [ ] Batch quantities update
- [ ] No orphaned records

### User Experience:
- [ ] Continue button enables/disables correctly
- [ ] Remove Customer clears data
- [ ] Save shows success message
- [ ] Invoice number displayed
- [ ] Can retrieve saved invoice

---

## 📞 SUPPORT NOTES

### Common Issues:
1. **Continue button disabled** - Check customer selection state
2. **Invoice not saving** - Check browser console for API errors
3. **Items missing** - Verify product_id exists
4. **Inventory not updating** - Check batch_id assignment

### Debug Commands:
```bash
# Check API logs
railway logs --service pharma-backend | grep invoice

# Test API directly
curl -X POST https://pharma-backend-production-0c09.up.railway.app/api/invoices/ \
  -H "Content-Type: application/json" \
  -d '{"customer_id": 35, "items": [{"product_id": 47, "quantity": 1, "unit_price": 100}]}'
```

---

**Document Version:** 1.0
**Last Updated:** Current Session
**Status:** Ready for Linear Import