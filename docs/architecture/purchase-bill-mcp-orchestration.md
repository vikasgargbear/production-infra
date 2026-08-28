# Purchase-bill MCP orchestration boundary

`erp_purchase_bill_mapping_review` is a stateless, non-posting review contract
for evidence extracted from a user-provided purchase-bill image or PDF. Its
machine contract is `aasopharma.purchase_bill_mapping.v1` in
`backend/mcp_runtime/aasopharma_mcp/purchase_bill_mapping.py`.

The tool preserves, without normalization or guessing:

- the visible supplier and invoice header text;
- each visible description, pack, batch, expiry, MRP, billed/free quantity,
  rate, discount, HSN and tax value;
- exact supplier and product UUIDs obtained separately through canonical search;
- proposed new suppliers/products that still require confirmed master-data
  writes and product activation in the ERP UI;
- every uncertain, unresolved and explicitly skipped field or line; and
- the blockers for purchase order, goods receipt and supplier invoice stages.

The caller resumes a review by carrying the complete returned mapping forward,
incrementing `revision`, and setting `parent_mapping_hash` to the prior returned
hash. The service stores neither the mapping nor the source attachment.

## Authority boundary

The review tool cannot search ERP records, choose a candidate, create master
data, upload or retain evidence, prepare a command, approve, execute or post. A
mapping status of `ready_for_canonical_prepare_validation` only means its
mapping-level identity blockers are clear. The exact schema and canonical reads
for `erp_purchase_order_prepare`, `erp_goods_receipt_prepare`, and
`erp_supplier_invoice_prepare` remain authoritative and must be satisfied at
each stage. Required fields cannot be skipped.

The image/PDF parser remains parse-only. Extracted supplier/product names are
evidence, not identity. Ambiguous matches remain unresolved, and products
proposed from a bill cannot enter a transaction until the user has completed
**Add product** in the ERP UI and `erp_product_search` returns the active product.
