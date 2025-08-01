-- Add foreign key constraints that couldn't be created during table creation
-- due to circular dependencies or tables not existing yet

-- Sales tables  
-- Skip sales.order_items batch_id FK as it uses batch_allocation JSONB instead
-- Skip sales.invoices batch_id FK as the column doesn't exist in that table

ALTER TABLE sales.sales_return_items
ADD CONSTRAINT fk_return_items_batch FOREIGN KEY (batch_id)
REFERENCES inventory.batches(batch_id);

-- Procurement tables
ALTER TABLE procurement.purchase_return_items
ADD CONSTRAINT fk_purchase_return_items_batch FOREIGN KEY (batch_id)
REFERENCES inventory.batches(batch_id);

-- Compliance tables
ALTER TABLE compliance.quality_control_tests
ADD CONSTRAINT fk_qc_tests_batch FOREIGN KEY (batch_id)
REFERENCES inventory.batches(batch_id);

ALTER TABLE compliance.narcotic_register
ADD CONSTRAINT fk_narcotic_register_batch FOREIGN KEY (batch_id)
REFERENCES inventory.batches(batch_id);