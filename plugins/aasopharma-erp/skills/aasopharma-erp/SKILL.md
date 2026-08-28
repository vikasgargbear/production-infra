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

## Returns

1. Resolve the exact posted sales or supplier invoice before preparing a
   return. Use only the source-line, dispatch/receipt-allocation, batch, and
   remaining billed/free quantities returned by that read.
2. When one product line has more than one returnable allocation, do not choose
   a batch automatically. Ask which displayed batch or batches are being
   returned and the billed/free quantity from each. Preserve billed and free
   quantities separately; never collapse them into one total.
3. Never exceed either the line-level or allocation-level remaining billed/free
   quantity. If the requested split is missing, ambiguous, or over the maximum,
   ask for correction before calling a prepare tool.
4. Reuse an idempotency key only for an exact replay. If a preview is stale,
   resolve the source again and present the changed allocations and maxima;
   never silently rebuild or execute the prior preview.

## Writes

1. Use the operation-specific prepare tool. Preparation is not completion.
2. Show the immutable review result, command UUID, affected documents, exact
   quantities, money, tax, stock, allocations, and accounting effects.
3. Do not approve or execute until the user explicitly confirms the reviewed
   operation. Respect distinct-reviewer rules exposed by the server.
4. Approve the captured command, then execute that exact command. Never look up
   an arbitrary pending command or silently rebuild a stale preview.
5. Read the result back through the operation-specific canonical tool and report
   any reconciliation or authorization failure instead of implying success.

Do not send WhatsApp, email, SMS, or telephone communications. Do not perform
destructive cleanup unless the user explicitly asks and a canonical reviewed
command supports it.
