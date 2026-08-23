WITH source_counts AS (
    SELECT jsonb_build_object(
        'organizations', (SELECT count(*) FROM master.organizations),
        'customers', (SELECT count(*) FROM parties.customers WHERE NOT coalesce(is_deleted,false)),
        'suppliers', (SELECT count(*) FROM parties.suppliers WHERE NOT coalesce(is_deleted,false)),
        'products', (SELECT count(*) FROM inventory.products WHERE NOT coalesce(is_deleted,false)),
        'batches', (SELECT count(*) FROM inventory.batches),
        'sales_orders', (SELECT count(*) FROM sales.orders WHERE NOT coalesce(is_deleted,false)),
        'sales_order_lines', (SELECT count(*) FROM sales.order_items),
        'dispatches', (SELECT count(*) FROM sales.delivery_challans),
        'dispatch_lines', (SELECT count(*) FROM sales.delivery_challan_items),
        'sales_invoices', (SELECT count(*) FROM sales.invoices WHERE NOT coalesce(is_deleted,false)),
        'sales_invoice_lines', (SELECT count(*) FROM sales.invoice_items),
        'sales_returns', (SELECT count(*) FROM sales.sales_returns WHERE NOT coalesce(is_deleted,false)),
        'sales_return_lines', (SELECT count(*) FROM sales.sales_return_items),
        'purchase_orders', (SELECT count(*) FROM procurement.purchase_orders),
        'purchase_order_lines', (SELECT count(*) FROM procurement.purchase_order_items),
        'goods_receipts', (SELECT count(*) FROM procurement.goods_receipt_notes),
        'goods_receipt_lines', (SELECT count(*) FROM procurement.grn_items),
        'supplier_invoices', (SELECT count(*) FROM procurement.supplier_invoices),
        'supplier_invoice_lines', (SELECT count(*) FROM procurement.supplier_invoice_items),
        'purchase_returns', (SELECT count(*) FROM procurement.purchase_returns),
        'purchase_return_lines', (SELECT count(*) FROM procurement.purchase_return_items),
        'payments', (SELECT count(*) FROM financial.payments WHERE NOT coalesce(is_deleted,false)),
        'allocations', (SELECT count(*) FROM financial.allocations),
        'inventory_movements', (SELECT count(*) FROM inventory.inventory_movements),
        'stock_positions', (SELECT count(*) FROM inventory.location_wise_stock)
    ) AS value
), orphan_counts AS (
    SELECT jsonb_build_object(
        'sales_order_lines', (SELECT count(*) FROM sales.order_items line LEFT JOIN sales.orders header ON header.order_id=line.order_id WHERE header.order_id IS NULL),
        'dispatch_lines', (SELECT count(*) FROM sales.delivery_challan_items line LEFT JOIN sales.delivery_challans header ON header.challan_id=line.challan_id WHERE header.challan_id IS NULL),
        'sales_invoice_lines', (SELECT count(*) FROM sales.invoice_items line LEFT JOIN sales.invoices header ON header.invoice_id=line.invoice_id WHERE header.invoice_id IS NULL),
        'sales_return_lines', (SELECT count(*) FROM sales.sales_return_items line LEFT JOIN sales.sales_returns header ON header.return_id=line.return_id WHERE header.return_id IS NULL),
        'purchase_order_lines', (SELECT count(*) FROM procurement.purchase_order_items line LEFT JOIN procurement.purchase_orders header ON header.purchase_order_id=line.purchase_order_id WHERE header.purchase_order_id IS NULL),
        'goods_receipt_lines', (SELECT count(*) FROM procurement.grn_items line LEFT JOIN procurement.goods_receipt_notes header ON header.grn_id=line.grn_id WHERE header.grn_id IS NULL),
        'supplier_invoice_lines', (SELECT count(*) FROM procurement.supplier_invoice_items line LEFT JOIN procurement.supplier_invoices header ON header.supplier_invoice_id=line.supplier_invoice_id WHERE header.supplier_invoice_id IS NULL),
        'purchase_return_lines', (SELECT count(*) FROM procurement.purchase_return_items line LEFT JOIN procurement.purchase_returns header ON header.return_id=line.return_id WHERE header.return_id IS NULL),
        'inventory_movements_without_product', (SELECT count(*) FROM inventory.inventory_movements movement LEFT JOIN inventory.products product ON product.product_id=movement.product_id WHERE product.product_id IS NULL),
        'inventory_movements_without_batch', (SELECT count(*) FROM inventory.inventory_movements movement LEFT JOIN inventory.batches batch ON batch.batch_id=movement.batch_id WHERE movement.batch_id IS NOT NULL AND batch.batch_id IS NULL)
    ) AS value
), zero_line_headers AS (
    SELECT jsonb_build_object(
        'sales_orders', (SELECT count(*) FROM sales.orders header WHERE NOT coalesce(header.is_deleted,false) AND NOT EXISTS (SELECT 1 FROM sales.order_items line WHERE line.order_id=header.order_id)),
        'dispatches', (SELECT count(*) FROM sales.delivery_challans header WHERE NOT EXISTS (SELECT 1 FROM sales.delivery_challan_items line WHERE line.challan_id=header.challan_id)),
        'sales_invoices', (SELECT count(*) FROM sales.invoices header WHERE NOT coalesce(header.is_deleted,false) AND NOT EXISTS (SELECT 1 FROM sales.invoice_items line WHERE line.invoice_id=header.invoice_id)),
        'sales_returns', (SELECT count(*) FROM sales.sales_returns header WHERE NOT coalesce(header.is_deleted,false) AND NOT EXISTS (SELECT 1 FROM sales.sales_return_items line WHERE line.return_id=header.return_id)),
        'purchase_orders', (SELECT count(*) FROM procurement.purchase_orders header WHERE NOT EXISTS (SELECT 1 FROM procurement.purchase_order_items line WHERE line.purchase_order_id=header.purchase_order_id)),
        'goods_receipts', (SELECT count(*) FROM procurement.goods_receipt_notes header WHERE NOT EXISTS (SELECT 1 FROM procurement.grn_items line WHERE line.grn_id=header.grn_id)),
        'supplier_invoices', (SELECT count(*) FROM procurement.supplier_invoices header WHERE NOT EXISTS (SELECT 1 FROM procurement.supplier_invoice_items line WHERE line.supplier_invoice_id=header.supplier_invoice_id)),
        'purchase_returns', (SELECT count(*) FROM procurement.purchase_returns header WHERE NOT EXISTS (SELECT 1 FROM procurement.purchase_return_items line WHERE line.return_id=header.return_id))
    ) AS value
), duplicate_numbers AS (
    SELECT jsonb_build_object(
        'sales_orders', (SELECT count(*) FROM (SELECT org_id,order_number FROM sales.orders GROUP BY org_id,order_number HAVING count(*)>1) duplicate),
        'dispatches', (SELECT count(*) FROM (SELECT org_id,challan_number FROM sales.delivery_challans GROUP BY org_id,challan_number HAVING count(*)>1) duplicate),
        'sales_invoices', (SELECT count(*) FROM (SELECT org_id,invoice_number FROM sales.invoices GROUP BY org_id,invoice_number HAVING count(*)>1) duplicate),
        'sales_returns', (SELECT count(*) FROM (SELECT org_id,return_number FROM sales.sales_returns GROUP BY org_id,return_number HAVING count(*)>1) duplicate),
        'purchase_orders', (SELECT count(*) FROM (SELECT org_id,po_number FROM procurement.purchase_orders GROUP BY org_id,po_number HAVING count(*)>1) duplicate),
        'goods_receipts', (SELECT count(*) FROM (SELECT org_id,grn_number FROM procurement.goods_receipt_notes GROUP BY org_id,grn_number HAVING count(*)>1) duplicate),
        'supplier_invoices', (SELECT count(*) FROM (SELECT org_id,supplier_invoice_number FROM procurement.supplier_invoices GROUP BY org_id,supplier_invoice_number HAVING count(*)>1) duplicate),
        'purchase_returns', (SELECT count(*) FROM (SELECT org_id,return_number FROM procurement.purchase_returns GROUP BY org_id,return_number HAVING count(*)>1) duplicate)
    ) AS value
), validation_counts AS (
    SELECT jsonb_build_object(
        'invalid_customer_gstin', (SELECT count(*) FROM parties.customers WHERE nullif(btrim(gst_number),'') IS NOT NULL AND upper(btrim(gst_number)) !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
        'invalid_supplier_gstin', (SELECT count(*) FROM parties.suppliers WHERE nullif(btrim(gst_number),'') IS NOT NULL AND upper(btrim(gst_number)) !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
        'invalid_customer_pan', (SELECT count(*) FROM parties.customers WHERE nullif(btrim(pan_number),'') IS NOT NULL AND upper(btrim(pan_number)) !~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
        'invalid_supplier_pan', (SELECT count(*) FROM parties.suppliers WHERE nullif(btrim(pan_number),'') IS NOT NULL AND upper(btrim(pan_number)) !~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
        'users_without_auth_identity', (SELECT count(*) FROM master.org_users WHERE auth_user_id IS NULL AND coalesce(is_active,true)),
        'duplicate_auth_identity', (SELECT count(*) FROM (SELECT auth_user_id FROM master.org_users WHERE auth_user_id IS NOT NULL GROUP BY auth_user_id HAVING count(*)>1) duplicate),
        'nonpositive_inventory_movements', (SELECT count(*) FROM inventory.inventory_movements WHERE quantity<=0 AND coalesce(base_quantity,quantity)<=0),
        'negative_stock_positions', (SELECT count(*) FROM inventory.location_wise_stock WHERE quantity_available<0)
    ) AS value
), status_counts AS (
    SELECT jsonb_build_object(
        'sales_orders', (SELECT coalesce(jsonb_object_agg(status,row_count),'{}'::jsonb) FROM (SELECT coalesce(order_status,'null') status,count(*) row_count FROM sales.orders GROUP BY order_status) grouped),
        'dispatches', (SELECT coalesce(jsonb_object_agg(status,row_count),'{}'::jsonb) FROM (SELECT coalesce(challan_status,'null') status,count(*) row_count FROM sales.delivery_challans GROUP BY challan_status) grouped),
        'sales_invoices', (SELECT coalesce(jsonb_object_agg(status,row_count),'{}'::jsonb) FROM (SELECT coalesce(invoice_status,'null') status,count(*) row_count FROM sales.invoices GROUP BY invoice_status) grouped),
        'sales_returns', (SELECT coalesce(jsonb_object_agg(status,row_count),'{}'::jsonb) FROM (SELECT coalesce(approval_status,'null') status,count(*) row_count FROM sales.sales_returns GROUP BY approval_status) grouped),
        'purchase_orders', (SELECT coalesce(jsonb_object_agg(status,row_count),'{}'::jsonb) FROM (SELECT coalesce(po_status,'null') status,count(*) row_count FROM procurement.purchase_orders GROUP BY po_status) grouped),
        'goods_receipts', (SELECT coalesce(jsonb_object_agg(status,row_count),'{}'::jsonb) FROM (SELECT coalesce(grn_status,'null') status,count(*) row_count FROM procurement.goods_receipt_notes GROUP BY grn_status) grouped),
        'supplier_invoices', (SELECT coalesce(jsonb_object_agg(status,row_count),'{}'::jsonb) FROM (SELECT coalesce(invoice_status,'null') status,count(*) row_count FROM procurement.supplier_invoices GROUP BY invoice_status) grouped),
        'purchase_returns', (SELECT coalesce(jsonb_object_agg(status,row_count),'{}'::jsonb) FROM (SELECT coalesce(approval_status,'null') status,count(*) row_count FROM procurement.purchase_returns GROUP BY approval_status) grouped)
    ) AS value
)
SELECT jsonb_build_object(
    'contract_version','1.0.0',
    'transaction_read_only',current_setting('transaction_read_only'),
    'source_counts',(SELECT value FROM source_counts),
    'orphan_counts',(SELECT value FROM orphan_counts),
    'zero_line_headers',(SELECT value FROM zero_line_headers),
    'duplicate_document_number_groups',(SELECT value FROM duplicate_numbers),
    'validation_counts',(SELECT value FROM validation_counts),
    'status_counts',(SELECT value FROM status_counts)
) AS canonical_conversion_preflight;
