# Purchase Return Module Revamp Plan

## 🎯 Goal
Make purchase returns as robust as sales returns with consistent UI/UX and proper tracking

## 📊 Database Changes Required

### 1. Add tracking columns to GRN items
```sql
ALTER TABLE procurement.grn_items 
ADD COLUMN IF NOT EXISTS quantity_returned DECIMAL(18,3) DEFAULT 0;

ALTER TABLE procurement.supplier_invoices
ADD COLUMN IF NOT EXISTS quantity_returned DECIMAL(18,3) DEFAULT 0;
```

### 2. Add missing columns to purchase_returns
```sql
-- Add disposition and restock tracking
ALTER TABLE procurement.purchase_return_items
ADD COLUMN IF NOT EXISTS disposition TEXT DEFAULT 'RETURN_TO_SUPPLIER',
ADD COLUMN IF NOT EXISTS damaged_quantity DECIMAL(15,3) DEFAULT 0,
ADD COLUMN IF NOT EXISTS saleable_quantity DECIMAL(15,3) DEFAULT 0;
```

## 🔄 Backend Improvements

### 1. Batch Tracking
- Fetch batch_number from GRN items
- Lookup batch_id from batch_number
- Update batch quantities on return

### 2. Inventory Movements
- Create OUT movement for returns to supplier
- Track movement_type as 'PURCHASE_RETURN'
- Link to return_id in reference

### 3. Validation
- Check quantity_returned doesn't exceed GRN quantity
- Validate batch availability
- Prevent duplicate returns

### 4. Debit Note Generation
- Auto-generate debit note number
- Track debit note status
- Calculate proper amounts with GST

## 🎨 Frontend Improvements

### 1. Consistent UI Components
- Use same ReturnItemsTable component
- Add restock checkbox (for damaged items that won't go back)
- Show batch selection dropdown
- Display already returned quantities

### 2. Three-Step Flow (like sales returns)
- Step 1: Select Supplier & GRN/Invoice
- Step 2: Select Items & Quantities
- Step 3: Review & Generate Debit Note

### 3. Features to Add
- ✅ Returnable quantity validation
- ✅ Batch tracking with dropdown
- ✅ Disposition management (RETURN_TO_SUPPLIER, DESTROY, QUARANTINE)
- ✅ Transport details for pickup
- ✅ Debit note preview
- ✅ Print/Email debit note

## 📝 API Endpoints Needed

### 1. GET /api/purchase-returns/grn/{grn_id}/returnable-items
- Get items with returnable quantities
- Include batch information
- Show already returned amounts

### 2. POST /api/purchase-returns/validate
- Pre-validate return before creation
- Check quantities and batches
- Return any warnings

### 3. GET /api/purchase-returns/{return_id}/debit-note
- Generate debit note PDF
- Include all tax calculations
- Format for printing/email

## 🔍 Tracking & Reporting

### 1. Views to Create
```sql
CREATE VIEW procurement.grn_return_status AS
-- Similar to invoice_return_status for purchases
```

### 2. Metrics to Track
- Return rate by supplier
- Return reasons analysis
- Pending debit notes
- Supplier acknowledgment status

## 🚀 Implementation Steps

1. **Phase 1: Database** ✅
   - Add missing columns
   - Create tracking views
   - Add validation triggers

2. **Phase 2: Backend**
   - Update return creation logic
   - Add batch tracking
   - Implement inventory movements
   - Add validation

3. **Phase 3: Frontend**
   - Revamp UI to match sales returns
   - Add batch selection
   - Implement validation
   - Add debit note preview

4. **Phase 4: Testing**
   - Test with/without batches
   - Validate quantity limits
   - Check inventory updates
   - Verify debit notes

## 🎯 Success Criteria

- [ ] Can't return more than received
- [ ] Batch quantities update correctly
- [ ] Inventory movements are tracked
- [ ] Debit notes generate properly
- [ ] UI is consistent with sales returns
- [ ] Transport details are captured
- [ ] Supplier acknowledgment is tracked