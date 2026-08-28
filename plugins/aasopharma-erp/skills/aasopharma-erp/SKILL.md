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
2. Resolve the supplier and search every product before proposing any write.
   Never create a duplicate when product matching is ambiguous.
3. Present one compact mapping review: matched products, proposed new products,
   missing fields, and skipped lines. Ask one consolidated follow-up for missing
   context. Never infer HSN/GST, composition, pack conversion, batch, expiry,
   quantity, or price from a name alone.
4. If the user explicitly permits missing facts to be skipped, leave those lines
   or product fields unresolved and say so. Do not silently convert missing data
   into defaults.
5. After the user confirms the proposed new-product batch, call
   `erp_product_create`, resolve setup references, then call `erp_product_setup`
   for each product with sufficient evidence. Both tools use the same canonical
   product setup as the ERP UI. `erp_product_setup` never makes a product
   available for transactions.
6. Read each result with `erp_product_setup_get` and report “Ready to add” or the
   exact remaining fields. The user completes **Add product** in the ERP UI.
7. Do not prepare a purchase order, goods receipt, or supplier invoice using a
   product that is still setup-incomplete. Resume the transaction only after
   product search returns the added canonical product.

Do not send WhatsApp, email, SMS, or telephone communications. Do not perform
destructive cleanup unless the user explicitly asks and a canonical reviewed
command supports it.
