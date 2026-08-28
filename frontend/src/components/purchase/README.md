# Purchase module

The desktop purchase UI uses reviewed canonical commands and exact readbacks.
It does not submit the retired combined purchase-entry write.

## Authoritative workflow

1. Create and approve a purchase order.
2. From **Purchase History → Purchase Orders**, choose **Receipt**.
3. Review and post `procurement.goods_receipt.prepare`.
   This posts inventory and valuation evidence only.
4. Open **Supplier Invoice** after the supplier tax document has a unique parsed
   GSTR-2B match.
5. Review and post `procurement.supplier_invoice.prepare`.
   This posts the payable, GST/ITC, receipt allocations, and balanced journal.

The two writes are intentionally separate. A browser-side combined operation
could leave an ambiguous partial result and would require facts that do not
exist until the receipt has posted.

## Active surfaces

- `PurchaseHub.tsx`: navigation and PO-to-receipt context loading.
- `purchase-order/PurchaseOrderFlow.tsx`: reviewed purchase-order command.
- `grn/CanonicalGoodsReceiptForm.tsx`: explicit receipt, QC, batch, expiry,
  MRP-conversion, and location evidence.
- `grn/GRNFlow.tsx`: canonical receipt history and exact stock readback.
- `purchase-entry/CanonicalPurchaseWorkflow.tsx`: two-step workflow guidance.
- `purchase-entry/CanonicalSupplierInvoiceFlow.tsx`: receipt/GSTR-2B matching,
  reviewed supplier-invoice command, and finance readback.
- `PurchaseListHistory.tsx`: canonical supplier-invoice, PO, and GRN history.

## Failure policy

Missing PO identity, location, MRP conversion, receipt allocation, supplier tax
registration, GSTR-2B evidence, or command readback fails closed. The UI does
not infer those facts, call a legacy endpoint, queue an offline write, or show a
success state before the canonical resource reconciles.
