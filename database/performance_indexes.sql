-- Performance Indexes for Return Module
-- Run these to improve query performance

-- Index for finding returns by invoice_id
CREATE INDEX IF NOT EXISTS idx_sales_returns_invoice_id 
ON sales.sales_returns(invoice_id) 
WHERE invoice_id IS NOT NULL;

-- Index for return items by return_id
CREATE INDEX IF NOT EXISTS idx_sales_return_items_return_id 
ON sales.sales_return_items(return_id);

-- Index for invoices by customer and status
CREATE INDEX IF NOT EXISTS idx_invoices_customer_status 
ON sales.invoices(customer_id, invoice_status) 
WHERE invoice_status = 'generated';

-- Index for invoice items by invoice_id
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id 
ON sales.invoice_items(invoice_id);

-- Composite index for batch lookup
CREATE INDEX IF NOT EXISTS idx_batches_product_batch 
ON inventory.batches(product_id, batch_number);

-- Index for products by org_id
CREATE INDEX IF NOT EXISTS idx_products_org_id 
ON inventory.products(org_id);

-- Index for faster invoice date filtering
CREATE INDEX IF NOT EXISTS idx_invoices_date_status 
ON sales.invoices(invoice_date DESC, invoice_status) 
WHERE invoice_status = 'generated';

-- Analyze tables to update statistics
ANALYZE sales.sales_returns;
ANALYZE sales.sales_return_items;
ANALYZE sales.invoices;
ANALYZE sales.invoice_items;
ANALYZE inventory.batches;
ANALYZE inventory.products;