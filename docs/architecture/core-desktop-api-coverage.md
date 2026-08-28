# Canonical core operations: desktop/API/MCP coverage

Status date: 2026-08-25. This is a source-of-truth wiring matrix for the 18
agreed transactional outcomes. “Backend active” means the reviewed command is
registered; it does not mean the current live Render SHA contains it. Browser
acceptance is valid only after the exact integrated SHA is deployed.

Every active write uses the same REST lifecycle:

`POST /api/web/actions/{operation}/prepare` →
`GET /api/web/actions/commands/{id}/review` when independent approval applies →
`POST /api/web/actions/commands/{id}/approve` →
`POST /api/web/actions/commands/{id}/execute` → exact canonical GET readback.

MCP uses the matching `erp_*_prepare`, `erp_operation_review_get`,
`erp_operation_approve`, `erp_operation_execute`, status, and documented exact
readback tools. It does not own a second posting implementation.

| # | Business outcome / operation | Desktop screen and primary CTA | Frontend authority | Exact REST readback | MCP parity | Desktop state |
|---:|---|---|---|---|---|---|
| 1 | Sales order / `sales.order.prepare` | Sales Order → Approve & Create | `sales/orders.api.ts` | `/canonical/sales-orders/{id}/acceptance-readback` | `erp_sales_order_prepare`, `erp_sales_order_get` | wired |
| 2 | Dispatch / `sales.dispatch.prepare` | Delivery Challan → Approve & Post | `sales/challans.api.ts` | `/canonical/sales-dispatches/{id}/acceptance-readback` | `erp_sales_dispatch_prepare`; status/read projections | wired |
| 3 | Sales invoice / `sales.invoice.prepare` | Create Invoice → Generate Invoice | `sales/invoices.api.ts` | `/canonical/sales-invoices/{id}/posting-readback` | `erp_sales_invoice_prepare`, `erp_sales_invoice_get` | wired |
| 4 | Customer return / `sales.return.prepare` | Sales Return → Prepare; approval/requester inboxes | `returns/canonicalReturns.api.ts`, `canonicalReturnLifecycle.ts` | `/canonical/returns/sales/{id}` | `erp_sales_return_prepare`; status/read projections | wired, separate approver |
| 5 | Purchase order / `procurement.purchase_order.prepare` | Purchase Order → Approve & Create PO | `purchase/canonicalPurchaseOrders.api.ts` | `/canonical/purchase-orders/{id}` | `erp_purchase_order_prepare`, `erp_purchase_order_get` | wired |
| 6 | Goods receipt / `procurement.goods_receipt.prepare` | Receipts → Receive remaining PO quantity | `purchase/canonicalGoodsReceipts.api.ts` | `/canonical/goods-receipts/{id}` | `erp_goods_receipt_prepare`, `erp_goods_receipt_get` | wired |
| 7 | Supplier invoice / `procurement.supplier_invoice.prepare` | Purchase Entry → Post matched invoice | `purchase/canonicalSupplierInvoices.api.ts` | `/canonical/supplier-invoices/{id}` | `erp_supplier_invoice_prepare`, `erp_supplier_invoice_get` | wired when GRN/GSTR-2B context is eligible |
| 8 | Supplier return / `procurement.purchase_return.prepare` | Purchase Return → Prepare; approval/requester inboxes | `returns/canonicalReturns.api.ts`, `canonicalReturnLifecycle.ts` | `/canonical/returns/purchases/{id}` | `erp_purchase_return_prepare`; status/read projections | wired, separate approver |
| 9 | Customer receipt / `finance.customer_receipt.prepare` | Customer Receipt → Post | `finance/customerReceipts.api.ts` | canonical payment plus invoice-allocation readbacks | `erp_customer_receipt_prepare`; open-item/status reads | wired; FIFO default and manual allocation available |
| 10 | Supplier payment / `finance.supplier_payment.prepare` | Supplier Payment → Post | `finance/canonicalSupplierPayments.api.ts` | `/canonical/supplier-payments/{id}` | `erp_supplier_payment_prepare`; open-item/status reads | wired; FIFO default and manual allocation available |
| 11 | Supplier advance / `finance.supplier_advance.prepare` | Financial Hub → Supplier Advance → Prepare; independent approval; requester execute | `finance/canonicalSupplierAdvances.api.ts`, `supplierAdvanceCommand.ts`, `supplierAdvanceLifecycle.ts` | `/canonical/supplier-advances/{id}` | `erp_supplier_advance_prepare`; review/status tools | wired, separate approver; exact PO-line, prepayment, withholding and journal readback |
| 12 | Standalone customer credit / `finance.adjustment_note.prepare` | Credit & Debit Notes → Customer credit → Prepare | `finance/canonicalAdjustmentNotes.api.ts` | `/canonical/adjustment-notes/{id}` | `erp_adjustment_note_prepare`, `erp_adjustment_note_readback_get` | wired, separate approver |
| 13 | Standalone supplier debit / `finance.adjustment_note.prepare` | Credit & Debit Notes → Supplier debit → Prepare | `finance/canonicalAdjustmentNotes.api.ts` | `/canonical/adjustment-notes/{id}` | same canonical note tools | wired, separate approver |
| 14 | Inter-branch stock transfer / `inventory.transfer.prepare` | Stock Transfer → Prepare/Post | `StockTransfer.tsx`, `canonicalOperatorActions.ts` | posted transfer detail/ledger projection | `erp_inventory_transfer_prepare`; status/read projections | wired |
| 15 | Cycle-count gain / `inventory.adjustment.prepare` | Stock Adjustment → Prepare; checker/requester states | `StockAdjustmentFlow.tsx`, `canonicalStockAdjustmentCommand.ts` | `/web/actions/inventory-adjustment/commands/{id}/readback` | `erp_inventory_adjustment_prepare`; status/read projections | wired, separate approver |
| 16 | Certified destruction / `inventory.destruction.prepare` | Stock → Destruction → choose an eligible full balance and same-day verified certificate → independent approval → requester execute | `inventory/stock/InventoryDestructionFlow.tsx`, `controlledOperations.api.ts` | `/canonical/inventory-destruction/context`; `/web/actions/inventory-destruction/commands/{id}/readback` | `erp_inventory_destruction_prepare`, `erp_inventory_destruction_readback_get` | wired, separate approver; certificate upload remains unavailable until a reviewed evidence-ingestion boundary exists |
| 17 | Bank match / `finance.bank_reconciliation.prepare` | Financial → Bank Reconcile → choose one exact candidate → independent approval → requester execute | `payment/flows/BankReconciliationFlow.tsx`, `controlledOperations.api.ts` | `/canonical/bank-reconciliation/context`; `/web/actions/bank-reconciliation/commands/{id}/readback` | `erp_bank_reconciliation_prepare`, `erp_bank_reconciliation_get` | wired, separate approver; statement import remains unavailable until a reviewed import command exists |
| 18 | Expense claim / `finance.expense_claim.prepare` | Expenses → Prepare claim; independent approval; requester execute/recover | `finance/canonicalExpenseClaims.api.ts`, `ExpenseClaimsFlow.tsx` | `/web/actions/expense-claims/commands/{id}/readback` | `erp_expense_claim_prepare`, `erp_expense_claim_readback` | wired, separate approver; verified receipt and balanced journal readback |

## No-fallback rules for these paths

- No core command may write through legacy `/payments`, `/purchases`, integer-ID
  routes, browser storage, IndexedDB, an offline queue, or a client-only success
  state.
- Empty/null authoritative money, quantity, tax, cost, balance, status, identity,
  date, or lineage is an error or an explicit “unavailable” value. It must not
  silently become `0`, “Pending”, the current date, a demo UUID, or a fixed rate.
- The UI may display a named invariant that is also enforced by the command
  schema (for example `currency_code=INR`, `rounding_policy=none`, or FIFO as the
  default allocation choice). Business facts always come from canonical context,
  immutable preview, or posted readback.
- A success message is allowed only after the posted resource UUID and its exact
  authoritative readback reconcile. Ambiguous execute outcomes move to GET-only
  recovery; they do not trigger a blind second execute.

## Remaining desktop closure order

1. Add a reviewed bank-statement import command and exact import readback; the
   matching flow deliberately cannot manufacture statement lines.
2. Add a reviewed destruction-certificate ingestion/verification command; the
   destruction flow deliberately cannot manufacture compliance evidence.
3. Deploy one exact SHA, then run authenticated desktop maker/checker browser
   writes and reconcile UI values with REST, MCP, and database evidence.
