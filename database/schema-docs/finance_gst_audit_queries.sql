-- Finance and GST production audit queries
-- Run against a staging or production-like database before live sign-off.

-- 1. Deprecated note tables should be empty after migration.
SELECT 'sales.credit_notes' AS table_name, COUNT(*) AS row_count FROM sales.credit_notes
UNION ALL
SELECT 'sales.debit_notes' AS table_name, COUNT(*) AS row_count FROM sales.debit_notes
UNION ALL
SELECT 'sales.credit_note_applications' AS table_name, COUNT(*) AS row_count FROM sales.credit_note_applications;

-- 2. Canonical finance note tables should contain active data.
SELECT 'financial.credit_notes' AS table_name, COUNT(*) AS row_count FROM financial.credit_notes
UNION ALL
SELECT 'financial.debit_notes' AS table_name, COUNT(*) AS row_count FROM financial.debit_notes;

-- 3. Allocation base table vs compatibility view counts.
SELECT 'financial.allocations' AS source, COUNT(*) AS row_count FROM financial.allocations
UNION ALL
SELECT 'financial.payment_allocations_view' AS source, COUNT(*) AS row_count FROM financial.payment_allocations;

-- 4. Orphan allocations: references with no source document.
SELECT a.allocation_id, a.payment_id, a.reference_type, a.reference_id
FROM financial.allocations a
LEFT JOIN sales.invoices i
  ON UPPER(a.reference_type) = 'INVOICE' AND a.reference_id = i.invoice_id
WHERE UPPER(a.reference_type) = 'INVOICE'
  AND i.invoice_id IS NULL;

-- 5. Duplicate outstanding rows per document.
SELECT document_type, document_id, COUNT(*) AS duplicate_rows
FROM financial.customer_outstanding
GROUP BY document_type, document_id
HAVING COUNT(*) > 1
UNION ALL
SELECT document_type, document_id, COUNT(*) AS duplicate_rows
FROM financial.supplier_outstanding
GROUP BY document_type, document_id
HAVING COUNT(*) > 1;

-- 6. Customer outstanding rows that do not reconcile to invoice totals.
SELECT
    co.document_id AS invoice_id,
    i.invoice_number,
    i.final_amount AS invoice_total,
    SUM(co.outstanding_amount) AS outstanding_total,
    SUM(co.paid_amount) AS paid_total
FROM financial.customer_outstanding co
JOIN sales.invoices i
  ON co.document_type IN ('invoice', 'INVOICE')
 AND co.document_id = i.invoice_id
GROUP BY co.document_id, i.invoice_number, i.final_amount
HAVING ABS((SUM(co.outstanding_amount) + SUM(co.paid_amount)) - i.final_amount) > 0.01;

-- 7. Supplier outstanding rows that do not reconcile to supplier invoice totals.
SELECT
    so.document_id AS supplier_invoice_id,
    si.supplier_invoice_number,
    si.invoice_total,
    SUM(so.outstanding_amount) AS outstanding_total,
    SUM(so.paid_amount) AS paid_total
FROM financial.supplier_outstanding so
JOIN procurement.supplier_invoices si
  ON so.document_type = 'invoice'
 AND so.document_id = si.supplier_invoice_id
GROUP BY so.document_id, si.supplier_invoice_number, si.invoice_total
HAVING ABS((SUM(so.outstanding_amount) + SUM(so.paid_amount)) - si.invoice_total) > 0.01;

-- 8. Payments whose allocation totals do not reconcile.
SELECT
    p.payment_id,
    p.payment_number,
    p.payment_amount,
    p.allocated_amount,
    p.unallocated_amount,
    COALESCE(SUM(a.allocated_amount), 0) AS allocation_sum
FROM financial.payments p
LEFT JOIN financial.allocations a
  ON a.payment_id = p.payment_id
 AND a.source_type = 'payment'
GROUP BY p.payment_id, p.payment_number, p.payment_amount, p.allocated_amount, p.unallocated_amount
HAVING ABS(COALESCE(SUM(a.allocated_amount), 0) - COALESCE(p.allocated_amount, 0)) > 0.01
    OR ABS((p.payment_amount - COALESCE(SUM(a.allocated_amount), 0)) - COALESCE(p.unallocated_amount, 0)) > 0.01;

-- 9. Invoice allocation totals that do not reconcile.
SELECT
    i.invoice_id,
    i.invoice_number,
    i.final_amount,
    i.allocated_amount,
    COALESCE(SUM(a.allocated_amount), 0) AS allocation_sum
FROM sales.invoices i
LEFT JOIN financial.allocations a
  ON UPPER(a.reference_type) = 'INVOICE'
 AND a.reference_id = i.invoice_id
 AND a.allocation_status = 'active'
GROUP BY i.invoice_id, i.invoice_number, i.final_amount, i.allocated_amount
HAVING ABS(COALESCE(SUM(a.allocated_amount), 0) - COALESCE(i.allocated_amount, 0)) > 0.01;

-- 10. Org-wide GST totals from sales invoices.
SELECT
    org_id,
    COUNT(*) AS invoice_count,
    COALESCE(SUM(cgst_amount), 0) AS total_cgst,
    COALESCE(SUM(sgst_amount), 0) AS total_sgst,
    COALESCE(SUM(igst_amount), 0) AS total_igst,
    COALESCE(SUM(cgst_amount + sgst_amount + igst_amount), 0) AS total_output_tax
FROM sales.invoices
WHERE invoice_status NOT IN ('cancelled', 'void')
GROUP BY org_id;

-- 11. Org-wide GST input totals from supplier invoices.
SELECT
    org_id,
    COUNT(*) AS supplier_invoice_count,
    COALESCE(SUM(cgst_amount), 0) AS total_cgst,
    COALESCE(SUM(sgst_amount), 0) AS total_sgst,
    COALESCE(SUM(igst_amount), 0) AS total_igst,
    COALESCE(SUM(cgst_amount + sgst_amount + igst_amount), 0) AS total_input_tax
FROM procurement.supplier_invoices
WHERE invoice_status != 'cancelled'
GROUP BY org_id;

-- 12. Compare branch-scoped GST totals to org-wide totals.
SELECT
    org_id,
    branch_id,
    COUNT(*) AS invoice_count,
    COALESCE(SUM(cgst_amount + sgst_amount + igst_amount), 0) AS branch_output_tax
FROM sales.invoices
WHERE invoice_status NOT IN ('cancelled', 'void')
GROUP BY org_id, branch_id
ORDER BY org_id, branch_id;

-- 13. Invalid or unexpected GST type values.
SELECT 'sales.invoices' AS table_name, gst_type, COUNT(*) AS row_count
FROM sales.invoices
GROUP BY gst_type
HAVING gst_type IS NOT NULL AND gst_type NOT IN ('CGST_SGST', 'IGST', 'EXEMPT', 'NON_GST')
UNION ALL
SELECT 'procurement.supplier_invoices' AS table_name, gst_type, COUNT(*) AS row_count
FROM procurement.supplier_invoices
GROUP BY gst_type
HAVING gst_type IS NOT NULL AND gst_type NOT IN ('CGST_SGST', 'IGST', 'EXEMPT', 'NON_GST');
