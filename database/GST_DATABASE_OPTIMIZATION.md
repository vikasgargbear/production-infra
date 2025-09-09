# GST Database Storage Optimization Plan

## Current Problem: Massive Redundancy

We're storing GST data redundantly across multiple tables, violating database normalization principles.

### Current Redundant Storage:

#### 1. Products Table (Master Data - INPUT)
```sql
inventory.products:
  - gst_percentage  -- ✅ This is good - master GST rate for product
```

#### 2. Invoice Items Table (Transaction - REDUNDANT STORAGE)
```sql
sales.invoice_items:
  - igst_rate      -- ❌ Redundant - can calculate from product
  - igst_amount    -- ❌ Redundant - should be calculated
  - cgst_rate      -- ❌ Redundant - can calculate from product
  - cgst_amount    -- ❌ Redundant - should be calculated
  - sgst_rate      -- ❌ Redundant - can calculate from product
  - sgst_amount    -- ❌ Redundant - should be calculated
  - taxable_amount -- ❌ Redundant - should be calculated
  - discount_amount-- ❌ Redundant - should be calculated
```

#### 3. Orders Table (Header - REDUNDANT STORAGE)
```sql
sales.orders:
  - taxable_amount -- ❌ Redundant - sum of items
  - tax_amount     -- ❌ Redundant - sum of items
  - igst_amount    -- ❌ Redundant - sum of items
  - cgst_amount    -- ❌ Redundant - sum of items
  - sgst_amount    -- ❌ Redundant - sum of items
```

## The Problem Visualized:

```
Current Flow (BAD):
Product GST: 18% → Store in product ✅
Invoice Item → Store GST rate again ❌
Invoice Item → Calculate & store CGST/SGST amounts ❌
Order Header → Store all amounts again ❌

Result: Same GST data stored 10+ times!
```

## Correct Architecture:

### Option 1: Calculate on Read (Best for Most Cases)
```sql
-- Only store what changes or is negotiated
invoice_items:
  - product_id (links to product.gst_percentage)
  - quantity
  - unit_price
  - discount_percent (if negotiated)
  - gst_override (ONLY if different from product default)

-- Calculate everything else via VIEW or API
CREATE VIEW invoice_items_calculated AS
SELECT 
  ii.*,
  ii.quantity * ii.unit_price as subtotal,
  (ii.quantity * ii.unit_price * ii.discount_percent / 100) as discount_amount,
  (ii.quantity * ii.unit_price * (1 - ii.discount_percent/100)) as taxable_amount,
  COALESCE(ii.gst_override, p.gst_percentage) as gst_rate,
  -- Calculate CGST/SGST/IGST based on customer state
  CASE 
    WHEN c.state = org.state THEN COALESCE(ii.gst_override, p.gst_percentage) / 2
    ELSE 0
  END as cgst_rate,
  CASE 
    WHEN c.state = org.state THEN COALESCE(ii.gst_override, p.gst_percentage) / 2
    ELSE 0
  END as sgst_rate,
  CASE 
    WHEN c.state != org.state THEN COALESCE(ii.gst_override, p.gst_percentage)
    ELSE 0
  END as igst_rate
FROM invoice_items ii
JOIN products p ON ii.product_id = p.product_id
JOIN invoices i ON ii.invoice_id = i.invoice_id
JOIN customers c ON i.customer_id = c.customer_id
JOIN organizations org ON i.org_id = org.org_id;
```

### Option 2: Materialized Views (For Performance)
```sql
-- Create materialized view for frequently accessed calculations
CREATE MATERIALIZED VIEW invoice_totals AS
SELECT 
  invoice_id,
  SUM(taxable_amount) as total_taxable,
  SUM(cgst_amount) as total_cgst,
  SUM(sgst_amount) as total_sgst,
  SUM(igst_amount) as total_igst
FROM invoice_items_calculated
GROUP BY invoice_id;

-- Refresh on invoice changes
CREATE TRIGGER refresh_invoice_totals
AFTER INSERT OR UPDATE OR DELETE ON invoice_items
FOR EACH STATEMENT
EXECUTE FUNCTION refresh_materialized_view('invoice_totals');
```

### Option 3: Store Only Overrides (Hybrid Approach)
```sql
-- Store only when different from calculated value
invoice_items:
  - product_id
  - quantity  
  - unit_price
  - discount_percent (nullable - only if applied)
  - gst_rate_override (nullable - only if different from product)
  - line_total_override (nullable - only for manual adjustments)
```

## Implementation Strategy:

### Phase 1: Add Calculation Layer
1. Create database functions for GST calculations
2. Create views for calculated values
3. Update APIs to use views instead of stored values

### Phase 2: Migration
1. Verify calculated values match stored values
2. Stop writing to redundant columns
3. Drop redundant columns after verification period

### Phase 3: Optimization
1. Add materialized views for performance if needed
2. Create indexes on calculation columns
3. Monitor query performance

## Benefits:

1. **Data Integrity**: Single source of truth for GST rates
2. **Storage Savings**: ~60% reduction in storage for invoice tables
3. **Consistency**: GST changes automatically reflect everywhere
4. **Audit Trail**: Can track GST rate changes over time
5. **Performance**: Calculations are fast, storage is expensive

## Database Functions Needed:

```sql
-- Function to calculate GST breakdown
CREATE OR REPLACE FUNCTION calculate_gst_breakdown(
  amount NUMERIC,
  gst_rate NUMERIC,
  is_interstate BOOLEAN
) RETURNS TABLE (
  cgst_amount NUMERIC,
  sgst_amount NUMERIC,
  igst_amount NUMERIC
) AS $$
BEGIN
  IF is_interstate THEN
    RETURN QUERY SELECT 0::NUMERIC, 0::NUMERIC, (amount * gst_rate / 100)::NUMERIC;
  ELSE
    RETURN QUERY SELECT 
      (amount * gst_rate / 200)::NUMERIC,  -- CGST = GST/2
      (amount * gst_rate / 200)::NUMERIC,  -- SGST = GST/2
      0::NUMERIC;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate line totals
CREATE OR REPLACE FUNCTION calculate_line_total(
  quantity NUMERIC,
  unit_price NUMERIC,
  discount_percent NUMERIC,
  gst_rate NUMERIC
) RETURNS NUMERIC AS $$
BEGIN
  RETURN quantity * unit_price * (1 - discount_percent/100) * (1 + gst_rate/100);
END;
$$ LANGUAGE plpgsql;
```

## What Should Be Stored vs Calculated:

### STORE (Input Data):
- Product GST rate (master data)
- Quantity (transaction input)
- Unit price (negotiated/agreed)
- Discount percent (if negotiated)
- GST override (only if different from product)

### CALCULATE (Output Data):
- Subtotal (quantity × price)
- Discount amount (subtotal × discount%)
- Taxable amount (subtotal - discount)
- CGST/SGST/IGST amounts (based on GST rate and interstate flag)
- Line total (taxable + GST)
- Order/Invoice totals (sum of line items)

## Migration Script Example:

```sql
-- Step 1: Create new structure
ALTER TABLE invoice_items ADD COLUMN gst_rate_override NUMERIC(5,2);

-- Step 2: Populate overrides where different from product
UPDATE invoice_items ii
SET gst_rate_override = ii.cgst_rate + ii.sgst_rate + ii.igst_rate
FROM products p
WHERE ii.product_id = p.product_id
  AND (ii.cgst_rate + ii.sgst_rate + ii.igst_rate) != p.gst_percentage;

-- Step 3: Create calculation view
CREATE VIEW invoice_items_v2 AS
SELECT 
  ii.invoice_item_id,
  ii.product_id,
  ii.quantity,
  ii.unit_price,
  ii.discount_percent,
  COALESCE(ii.gst_rate_override, p.gst_percentage) as gst_rate,
  -- All calculated fields
  ii.quantity * ii.unit_price as subtotal,
  ii.quantity * ii.unit_price * ii.discount_percent / 100 as discount_amount,
  ii.quantity * ii.unit_price * (1 - ii.discount_percent/100) as taxable_amount,
  -- GST calculations based on interstate logic
  ...
FROM invoice_items ii
JOIN products p ON ii.product_id = p.product_id;

-- Step 4: Update APIs to use new view
-- Step 5: After verification, drop old columns
ALTER TABLE invoice_items 
  DROP COLUMN cgst_rate,
  DROP COLUMN sgst_rate,
  DROP COLUMN igst_rate,
  DROP COLUMN cgst_amount,
  DROP COLUMN sgst_amount,
  DROP COLUMN igst_amount,
  DROP COLUMN taxable_amount,
  DROP COLUMN discount_amount;
```

## Summary:

**Current**: Storing same GST data 10+ times across tables
**Proposed**: Store only inputs, calculate outputs
**Benefit**: 60% storage reduction, single source of truth, automatic consistency