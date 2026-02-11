-- Migration: Add gst_type audit column to document tables
-- Purpose: Persists the GST type (CGST/SGST or IGST) determined at document creation time
-- This enables accurate GST reporting and audit trail

-- Sales schema
ALTER TABLE sales.invoices ADD COLUMN IF NOT EXISTS gst_type VARCHAR(10);
ALTER TABLE sales.orders ADD COLUMN IF NOT EXISTS gst_type VARCHAR(10);
ALTER TABLE sales.delivery_challans ADD COLUMN IF NOT EXISTS gst_type VARCHAR(10);
ALTER TABLE sales.sales_returns ADD COLUMN IF NOT EXISTS gst_type VARCHAR(10);

-- Procurement schema
ALTER TABLE procurement.purchase_orders ADD COLUMN IF NOT EXISTS gst_type VARCHAR(10);
ALTER TABLE procurement.supplier_invoices ADD COLUMN IF NOT EXISTS gst_type VARCHAR(10);
ALTER TABLE procurement.purchase_returns ADD COLUMN IF NOT EXISTS gst_type VARCHAR(10);

-- Add comments
COMMENT ON COLUMN sales.invoices.gst_type IS 'GST type at creation: CGST/SGST or IGST';
COMMENT ON COLUMN sales.orders.gst_type IS 'GST type at creation: CGST/SGST or IGST';
COMMENT ON COLUMN sales.delivery_challans.gst_type IS 'GST type at creation: CGST/SGST or IGST';
COMMENT ON COLUMN sales.sales_returns.gst_type IS 'GST type at creation: CGST/SGST or IGST';
COMMENT ON COLUMN procurement.purchase_orders.gst_type IS 'GST type at creation: CGST/SGST or IGST';
COMMENT ON COLUMN procurement.supplier_invoices.gst_type IS 'GST type at creation: CGST/SGST or IGST';
COMMENT ON COLUMN procurement.purchase_returns.gst_type IS 'GST type at creation: CGST/SGST or IGST';
