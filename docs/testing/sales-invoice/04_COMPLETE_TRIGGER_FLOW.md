# 🔄 Sales Invoice - Complete Trigger & Function Flow

## 📊 Overview
Based on analysis of 75+ enterprise triggers and 8 function files, this document maps the complete flow of triggers and functions that should execute during invoice creation.

---

## 🎯 INVOICE CREATION FLOW - COMPLETE SEQUENCE

### Phase 1: Invoice Header Creation
**Table:** `sales.invoices`
**Operation:** INSERT

#### Triggers That Should Fire:
1. **None directly on invoice header insert** - Header is basic record creation

#### Functions Called:
1. **Generate Invoice Number** (built-in sequence)
   - Auto-increments invoice_id
   - Format: `INV-2024-000001`

---

### Phase 2: Invoice Items Creation
**Table:** `sales.invoice_items`  
**Operation:** INSERT (for each item)

#### Triggers That MUST Fire:

##### 2.1 GST Calculation Trigger
**Trigger:** `calculate_gst_on_invoice_item()` (from 06_gst_triggers.sql)
**When:** BEFORE INSERT on invoice_items
**Actions:**
- Determines interstate/intrastate based on customer and branch GST
- Fetches GST rate from HSN code or product
- Calculates IGST/CGST/SGST based on transaction type
- Calculates CESS if applicable
- Sets line_total = taxable_amount + total_tax_amount

**Fields Updated:**
```sql
- igst_rate, cgst_rate, sgst_rate
- igst_amount, cgst_amount, sgst_amount  
- cess_rate, cess_amount
- total_tax_amount
- line_total
```

##### 2.2 Inventory Update Trigger
**Trigger:** `update_inventory_on_sale()` (from 11_core_operations_triggers.sql)
**When:** AFTER INSERT on invoice_items
**Actions:**
- Reduces batch quantity_available
- Updates quantity_sold
- Updates location_wise_stock
- Creates inventory_movements record
- Validates sufficient stock

**Tables Updated:**
```sql
- inventory.batches (quantity_available, quantity_sold)
- inventory.location_wise_stock (quantity_available)
- inventory.inventory_movements (new record)
```

##### 2.3 Batch Allocation Function
**Function:** `allocate_stock_intelligent()` (from 02_inventory_functions.sql)
**Called By:** API before item insert
**Returns:** Batch allocation details
**Method:** FEFO (First Expiry First Out) by default

---

### Phase 3: Invoice Totals Update
**After all items inserted**

#### Triggers That Should Fire:

##### 3.1 Invoice Total Calculation
**Custom Trigger Needed:** `calculate_invoice_totals()`
**When:** AFTER INSERT/UPDATE/DELETE on invoice_items
**Actions:**
```sql
UPDATE sales.invoices SET
    items_count = (SELECT COUNT(*) FROM invoice_items WHERE invoice_id = NEW.invoice_id),
    subtotal_amount = SUM(quantity * unit_price),
    discount_amount = SUM(discount_amount),
    taxable_amount = SUM(taxable_amount),
    igst_amount = SUM(igst_amount),
    cgst_amount = SUM(cgst_amount),
    sgst_amount = SUM(sgst_amount),
    tax_amount = SUM(total_tax_amount),
    final_amount = ROUND(SUM(line_total))
WHERE invoice_id = NEW.invoice_id;
```

---

### Phase 4: Financial Entries
**When:** Invoice status changes to 'posted'

#### Functions That Should Execute:

##### 4.1 Journal Entry Creation
**Function:** `create_journal_entry()` (from 01_financial_functions.sql)
**Creates:** Accounting entries
**Entries:**
```
Debit: Customer Account (Receivable)
Credit: Sales Account
Credit: GST Payable Account
```

##### 4.2 Customer Credit Update  
**Trigger:** `update_credit_on_transactions()` (from 11_core_operations_triggers.sql)
**Updates:** Customer credit utilization
```sql
UPDATE parties.customers SET
    current_outstanding = current_outstanding + invoice_amount,
    credit_utilized = credit_utilized + invoice_amount
WHERE customer_id = NEW.customer_id;
```

---

### Phase 5: GST Compliance
**When:** Invoice status = 'posted'

#### Triggers That Should Fire:

##### 5.1 GSTR-1 Population
**Trigger:** `populate_gstr1_on_invoice()` (from 06_gst_triggers.sql)
**Actions:**
- Creates/updates GSTR-1 header for return period
- Adds invoice to B2B/B2C section based on customer GST
- Aggregates HSN-wise summary

**Tables Updated:**
```sql
- gst.gstr1_data
- gst.gstr1_b2b_invoices (if registered customer)
- gst.gstr1_b2c_summary (if unregistered)
- gst.gstr1_hsn_summary
```

---

### Phase 6: Analytics & Reporting

#### Triggers That Should Fire:

##### 6.1 Sales Analytics Update
**Trigger:** `calculate_realtime_kpis()` (from 08_analytics_triggers.sql)
**Updates:**
- Daily sales metrics
- Product performance
- Customer purchase history
- Salesperson targets

##### 6.2 Dashboard Cache Refresh
**Trigger:** `refresh_dashboard_cache()` (from 08_analytics_triggers.sql)
**Updates:** Pre-calculated dashboard metrics

---

## 🔴 CRITICAL MISSING TRIGGERS

Based on the analysis, these triggers are MISSING but REQUIRED:

### 1. Invoice Totals Aggregation
**Need:** Trigger to sum invoice_items and update invoice totals
**Current Status:** ❌ Not implemented
**Fix Required:** Create trigger similar to `calculate_order_totals()` but for invoices

### 2. Invoice Number Generation
**Need:** Proper sequential numbering with branch/year prefix
**Current Status:** ⚠️ Basic sequence only
**Fix Required:** Function to generate formatted invoice numbers

### 3. Stock Reservation Release
**Need:** Release reserved stock when invoice is created
**Current Status:** ❌ Not implemented
**Fix Required:** Update reservation status after invoice

---

## 📋 VERIFICATION QUERIES

### Check Trigger Status:
```sql
-- List all triggers on invoice tables
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'sales'
AND event_object_table IN ('invoices', 'invoice_items')
ORDER BY event_object_table, action_order;
```

### Verify GST Calculation:
```sql
-- Check if GST was calculated
SELECT 
    invoice_item_id,
    product_name,
    taxable_amount,
    igst_amount + cgst_amount + sgst_amount as total_gst,
    line_total
FROM sales.invoice_items
WHERE invoice_id = (SELECT MAX(invoice_id) FROM sales.invoices);
```

### Check Inventory Impact:
```sql
-- Verify inventory was reduced
SELECT 
    b.batch_id,
    b.batch_number,
    b.quantity_available,
    b.quantity_sold,
    im.quantity as movement_qty,
    im.movement_type
FROM inventory.batches b
LEFT JOIN inventory.inventory_movements im ON b.batch_id = im.batch_id
WHERE b.product_id = 47
ORDER BY im.created_at DESC
LIMIT 5;
```

---

## 🛠️ IMPLEMENTATION CHECKLIST

### Immediate Actions Required:

- [ ] Create `calculate_invoice_totals()` trigger
- [ ] Fix batch allocation to return proper JSON structure
- [ ] Ensure GST trigger has correct column names
- [ ] Add invoice posting workflow trigger
- [ ] Create credit limit check before invoice

### Testing Sequence:

1. **Create Invoice Header**
   - Verify invoice_id generated
   - Check customer details populated

2. **Add Invoice Items**
   - Verify GST calculation trigger fires
   - Check line_total calculated
   - Verify batch allocation

3. **Check Totals**
   - Verify invoice totals updated
   - Check tax aggregation

4. **Post Invoice**
   - Verify inventory reduced
   - Check journal entries created
   - Verify GSTR-1 populated

5. **Verify Reports**
   - Check analytics updated
   - Verify dashboard metrics

---

## 📊 PERFORMANCE CONSIDERATIONS

### Critical Indexes Required:
```sql
-- Already exist (verified in 01_performance_indexes.sql):
✅ idx_invoices_customer
✅ idx_invoice_items_invoice  
✅ idx_batches_product_active
✅ idx_inventory_movements_reference

-- May need additional:
CREATE INDEX idx_invoice_items_line_total ON sales.invoice_items(invoice_id, line_total);
CREATE INDEX idx_invoices_final_amount ON sales.invoices(final_amount) WHERE invoice_status = 'posted';
```

---

## 🔄 TRANSACTION MANAGEMENT

### Required Transaction Flow:
```sql
BEGIN;
    -- 1. Insert invoice header
    INSERT INTO sales.invoices (...) RETURNING invoice_id;
    
    -- 2. Allocate batches (function call)
    SELECT * FROM allocate_stock_intelligent(...);
    
    -- 3. Insert items (triggers GST calculation)
    INSERT INTO sales.invoice_items (...);
    
    -- 4. Update totals (trigger should fire)
    -- Automatic via trigger
    
    -- 5. Reduce inventory (trigger fires)
    -- Automatic via trigger
    
    -- 6. Create financial entries
    SELECT create_journal_entry(...);
    
COMMIT;
```

### Rollback Scenarios:
- Insufficient stock → ROLLBACK
- Credit limit exceeded → ROLLBACK  
- GST calculation error → ROLLBACK
- Journal entry imbalance → ROLLBACK

---

## 📈 SUCCESS METRICS

### Complete Invoice Should Have:
1. ✅ Invoice header with all fields
2. ✅ Invoice items with GST calculated
3. ✅ Correct totals aggregated
4. ✅ Inventory reduced
5. ✅ Journal entries created
6. ✅ GSTR-1 data populated
7. ✅ Customer outstanding updated
8. ✅ Analytics metrics updated

---

## 🚨 CURRENT STATUS SUMMARY

### Working:
- ✅ Basic invoice creation
- ✅ GST calculation trigger (after column name fixes)
- ✅ Inventory movement structure

### Not Working:
- ❌ Invoice totals aggregation trigger
- ❌ Batch allocation integration
- ❌ Financial entry creation
- ❌ GSTR-1 auto-population
- ❌ Credit limit enforcement

### Priority Fixes:
1. **CRITICAL:** Create invoice totals trigger
2. **HIGH:** Fix batch allocation flow
3. **HIGH:** Integrate financial entries
4. **MEDIUM:** Add GSTR-1 population
5. **LOW:** Analytics updates

---

**Document Version:** 1.0
**Last Updated:** August 4, 2024
**Based On:** 75+ enterprise triggers analysis
**Status:** Ready for implementation