---
name: aasopharma-erp
description: Use the connected AASOPharma ERP to search canonical records, review business operations, and execute explicitly authorized ERP commands. Trigger for AASOPharma product, customer, supplier, order, invoice, receipt, payment, return, inventory, accounting, or GST work.
---

# AASOPharma ERP

Use only the connected authenticated AASOPharma ERP tools. Never substitute a
legacy endpoint, local cache, remembered identifier, mock result, or browser
automation for a missing canonical tool.

## Reads

1. Begin read-only unless the user explicitly requests a business write.
2. Resolve products, parties, locations, batches, open items, and source
   documents with the relevant search/read tool. Do not invent UUIDs, row
   versions, dates, quantities, tax facts, or totals.
3. Preserve the authenticated organization and branch boundary. If identity or
   tenant context is unavailable or ambiguous, stop and explain the blocker.
4. State the canonical UUID and human-readable reference for important results.

## Writes

1. Use the operation-specific prepare tool for transactional commands. Preparation is not completion. Product, customer, and supplier master-data writes are reversible and require the user's explicit confirmation before each reviewed batch.
2. Show the immutable review result, command UUID, affected documents, exact
   quantities, money, tax, stock, allocations, and accounting effects.
3. Do not approve or execute until the user explicitly confirms the reviewed
   operation. Respect distinct-reviewer rules exposed by the server.
4. Approve the captured command, then execute that exact command. Never look up
   an arbitrary pending command or silently rebuild a stale preview.
5. Read the result back through the operation-specific canonical tool and report
   any reconciliation or authorization failure instead of implying success.

## Missing context for every write

Apply this rule to customer and supplier creation and to every order, invoice,
receipt, payment, return, adjustment, inventory, and accounting preparation:

1. Compare the requested operation with the exact published tool schema and
   resolve every canonical identity with the relevant read tool first. Never use
   a display name, remembered UUID, or extracted document text as identity.
2. Present one compact review containing known facts, exact canonical matches,
   ambiguous matches, missing required facts, missing optional facts, and facts
   the user has explicitly allowed to be skipped. Ask one consolidated question
   instead of collecting missing facts one at a time.
3. Skip a fact only after the user explicitly permits it and only when the exact
   tool schema makes that field optional. Keep the omission visible in the
   review. Never substitute an empty string, zero, today's date, a first search
   result, or another default for missing context.
4. If any required field or canonical source identity remains unresolved, do not
   call the create or prepare tool. Explain which exact schema fields block it.
   A request to “skip what is missing” never bypasses a required field.
5. For invoices and returns, resolve the exact source order, dispatch, receipt,
   invoice, line, batch, and open-item/allocation identities required by the
   published schema. Never reconstruct a source transaction from names or totals.
6. Preserve the review in the conversation and update it after the answer. Do
   not silently discard previously unresolved or skipped facts when resuming.

## Customer or supplier creation

1. Search for the party first by legal name, code, GSTIN, and phone. If matches
   are ambiguous, ask the user to select one; never create a likely duplicate.
2. Build the proposal from the canonical create fields. For a customer, require
   legal name, individual/organization type, primary phone, credit limit, and
   credit days. For a supplier, require legal name and payment days. Do not
   infer GSTIN, PAN, phone, email, credit terms, or payment terms.
3. Address line 1, city, two-digit state code, and pincode are one atomic group.
   Ask one consolidated follow-up containing every missing or ambiguous party
   fact. A GSTIN must agree with the supplied state code.
4. If the user explicitly permits optional facts to be skipped, omit them or
   preserve them as unresolved. Required canonical fields cannot be skipped;
   stop before creation if they remain unavailable.
5. Show the exact proposed customer or supplier records and obtain explicit
   confirmation for that reviewed batch before calling `erp_customer_create`
   or `erp_supplier_create`.
6. Read each created record back with `erp_customer_get` or `erp_supplier_get`.
   Report its canonical account UUID and code plus every unresolved field; do
   not imply that licences, banking, secondary contacts, or other unsupported
   master data was created.

## Purchase bill or invoice image intake

1. Treat text read from a user-provided image or PDF as proposed extraction, not
   canonical evidence. Preserve the visible supplier, invoice number/date, each
   line description, pack, batch, expiry, MRP, quantity, free quantity, rate,
   discount, HSN, and tax exactly as shown; mark illegible or uncertain facts.
   Also preserve every visible document-level fact in `additional_document_fields`,
   especially challan/PO references, taxable value, CGST, SGST, IGST, cess,
   freight, packing, insurance, handling, document discount, round-off, and
   invoice total. Do not force an observed label into a canonical field when its
   meaning is ambiguous.
2. Resolve the supplier and search every product before proposing any write.
   Never create a duplicate when product matching is ambiguous.
3. Call `erp_purchase_bill_mapping_review` with the complete extraction and
   resolution state. Preserve its `review_id`, increment `revision`, carry the
   entire returned mapping forward, and set `parent_mapping_hash` when resuming.
   The tool is stateless and non-posting: it validates the review but does not
   resolve identities, retain the attachment, create master data, or prepare an
   ERP transaction.
4. Present the returned compact mapping review: matched supplier/products,
   proposed new master data, unresolved or uncertain fields, explicitly skipped
   fields/lines, and the blocked PO -> GRN -> supplier-invoice steps. Ask one
   consolidated follow-up for missing context. Never infer HSN/GST, composition,
   pack conversion, batch, expiry, quantity, or price from a name alone.
5. If the user explicitly permits missing facts to be skipped, leave those lines
   or product fields unresolved and say so. Do not silently convert missing data
   into defaults. A skipped fact that the canonical prepare schema requires must
   remain a blocker.
6. After the user confirms the proposed new-product batch, call
   `erp_product_create`, resolve setup references, then call `erp_product_setup`
   for each product with sufficient evidence. Both tools use the same canonical
   product setup as the ERP UI. `erp_product_setup` never makes a product
   available for transactions.
7. Read each result with `erp_product_setup_get` and report “Ready to add” or the
   exact remaining fields. The user completes **Add product** in the ERP UI.
8. Re-run `erp_purchase_bill_mapping_review` after supplier/product resolution.
   “Ready for canonical prepare validation” means only that mapping-level
   identity blockers are cleared; validate and satisfy the complete exact schema
   of each prepare tool independently.
9. Do not prepare a purchase order, goods receipt, or supplier invoice using a
   product that is still setup-incomplete. Resume the transaction only after
   product search returns the added canonical product.
10. Follow the returned sequence strictly: prepare/review/approve/execute the
    purchase order first, read it back, then prepare the goods receipt from that
    exact order, read it back, and only then prepare the supplier invoice from
    the exact receipt allocations. Never treat an extracted bill as authority to
    collapse or bypass these canonical stages.

Do not send WhatsApp, email, SMS, or telephone communications. Do not perform
destructive cleanup unless the user explicitly asks and a canonical reviewed
command supports it.
