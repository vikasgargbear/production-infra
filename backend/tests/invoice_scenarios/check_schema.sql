-- Run this SQL on production to check actual column schema
-- This will reveal if columns are in different order or have issues

-- Check column order and existence
SELECT 
    column_name,
    ordinal_position,
    data_type,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'sales' 
AND table_name = 'delivery_challans'
AND column_name IN ('taxable_amount', 'gst_amount', 'total_amount')
ORDER BY ordinal_position;

-- Check actual data from latest challan
SELECT 
    challan_id,
    challan_number,
    invoice_id,
    total_amount,
    taxable_amount,
    gst_amount
FROM sales.delivery_challans
WHERE invoice_id = 394;

-- Cross-check with linked invoice
SELECT 
    invoice_id,
    invoice_number,
    taxable_amount,
    total_tax_amount
FROM sales.invoices
WHERE invoice_id = 394;
