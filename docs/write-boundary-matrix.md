# Write-Boundary Matrix — AasoPharma ERP

Scope: backend-first write-boundary inventory audit (feat/claude-desktop-closure).
Out of scope (Codex owns): invoice creation/tax/place-of-supply, GST period/dashboard,
ledger/outstanding/collection, sales UUID imports/history, purchase returns/GRN/purchase
history, customer/supplier/product masters.

Legend
- **wired**: CTA calls `prepareCanonicalAction` → confirmation modal → `approveAndExecuteCanonicalAction`
- **disconnected**: canonical command exists but CTA called a legacy endpoint or was a stub
- **no-command**: no canonical command exists; CTA is explicitly disabled via `rejectCanonicalWrite` or `CanonicalWriteNotice`

---

## Inventory — Stock Adjustment

| Field | Value |
|---|---|
| Component | `frontend/src/components/inventory/stock/StockAdjustmentFlow.tsx` |
| CTA | "Post Adjustment" button in step-2 footer (via `GlobalDocumentFlow.onSave`) |
| Handler | `handlePrepare()` → confirmation modal → `handleCommit()` |
| API service method | `prepareCanonicalAction('inventory.adjustment.prepare', ...)` then `approveAndExecuteCanonicalAction(...)` |
| Endpoint URL | `POST /web/actions/inventory.adjustment.prepare/prepare` → `POST /web/actions/commands/{id}/approve` → `POST /web/actions/commands/{id}/execute` |
| Backend handler | `web_operator_actions.prepare_action` / `approve_command` / `execute_command` |
| Canonical command | `inventory.adjustment.prepare` |
| Permissions | `inventory.create` (via agent grant capability) |
| Response/readback | `ExecutionResponse.resource_id` (adjustment document UUID) shown in success banner |
| Status | **wired** (this commit) |
| Previously | Amber "review only" banner; no onSave wired; `stockApi.adjust` hit legacy `/stock-adjustments/` endpoint |

---

## Inventory — Stock Transfer

| Field | Value |
|---|---|
| Component | `frontend/src/components/inventory/stock/StockTransfer.tsx` |
| CTA | "Post Transfer" button in step-2 footer (via `GlobalDocumentFlow.onSave`) |
| Handler | `handlePrepare()` → confirmation modal → `handleCommit()` |
| API service method | `prepareCanonicalAction('inventory.transfer.prepare', ...)` then `approveAndExecuteCanonicalAction(...)` |
| Endpoint URL | `POST /web/actions/inventory.transfer.prepare/prepare` → approve → execute |
| Backend handler | `web_operator_actions.prepare_action` / `approve_command` / `execute_command` |
| Canonical command | `inventory.transfer.prepare` |
| Permissions | `inventory.create` (branch-scoped; both source and destination branch checked) |
| Response/readback | `ExecutionResponse.resource_id` (transfer document UUID) shown in success banner |
| Status | **wired** (this commit) |
| Previously | Amber "review only" banner; no onSave; `stockApi.transfer` hit legacy `/stock-movements/transfer` endpoint; `inventory.transfer.prepare` was missing from frontend `CanonicalOperationKey` type |

---

## Inventory — Stock Movement (read-only log)

| Field | Value |
|---|---|
| Component | `frontend/src/components/inventory/stock/StockMovement.tsx` |
| CTA | No write CTA; this is a read-only history view |
| Status | **no-command** (no write action required; read path uses `stockApi.getMovements` → `/inventory/movements`) |

---

## Finance — Customer Receipt (Payment Received)

| Field | Value |
|---|---|
| Component | `frontend/src/components/payment/entry/EnterprisePaymentEntry.tsx`, `ModularPaymentEntry.tsx`, `PaymentReceived.tsx` |
| CTA | "Save Payment" button |
| Handler | `handleSave()` — currently shows error toast / `CanonicalWriteNotice` |
| API service method | `paymentsApi.create` → `rejectCanonicalWrite('Posting a payment')` |
| Endpoint URL | None (blocked) |
| Backend handler | None wired to web transport yet |
| Canonical command | `finance.customer_receipt.prepare` (exists in `CanonicalOperationKey`) |
| Permissions | TBD — requires `finance.customer_receipt` agent grant capability |
| Response/readback | N/A |
| Status | **disconnected** |
| What must be built | Wire `EnterprisePaymentEntry`/`ModularPaymentEntry` "Save Payment" CTA to `prepareCanonicalAction('finance.customer_receipt.prepare', ...)` → confirmation modal → execute. The payload requires `payment_method` (bank_transfer/card/upi), `bank_account_id`, `external_reference`, `amount`, `allocations[]` matching open items exactly. `PaymentReceived.tsx` is a placeholder stub — replace with the real flow or delete. |

---

## Finance — Supplier Payment (Payment Made)

| Field | Value |
|---|---|
| Component | `frontend/src/components/payment/entry/PaymentMade.tsx` |
| CTA | None (placeholder "Coming soon" stub) |
| Handler | None |
| API service method | `paymentsApi.create` → `rejectCanonicalWrite('Posting a payment')` |
| Endpoint URL | None (blocked) |
| Backend handler | None wired to web transport yet |
| Canonical command | `finance.supplier_payment.prepare` (exists in `CanonicalOperationKey`) |
| Permissions | TBD — requires `finance.supplier_payment` agent grant capability |
| Response/readback | N/A |
| Status | **disconnected** |
| What must be built | Build supplier payment entry flow mirroring `EnterprisePaymentEntry` pattern; call `prepareCanonicalAction('finance.supplier_payment.prepare', ...)`. Payload requires `payment_method` (bank_transfer/upi), `bank_account_id`, `external_reference`, `gross_amount`, `allocations[]` summing exactly to `gross_amount`. `PaymentMade.tsx` is a "Coming soon" placeholder — replace. |

---

## Finance — Supplier Advance

| Field | Value |
|---|---|
| Component | None (no flow implemented) |
| CTA | None |
| Canonical command | `finance.supplier_advance.prepare` (exists in `CanonicalOperationKey`) |
| Status | **no-command** (command exists but no UI entry point built yet) |
| What must be built | Build supplier advance entry; payload requires exactly one PO-line allocation; `payment_method` restricted to bank_transfer/upi. |

---

## Finance — Bank Reconciliation

| Field | Value |
|---|---|
| Component | `frontend/src/components/payment/flows/BankReconciliationFlow.tsx` |
| CTA | Start Reconciliation |
| API service method | `paymentsApi.startBankReconciliation` → `rejectCanonicalWrite('Starting bank reconciliation')` |
| Canonical command | None |
| Status | **no-command** |
| What must be built | Canonical bank reconciliation command is not yet defined. CTA is correctly disabled. Do not restore legacy behavior. |

---

## Finance — Credit/Debit Note

| Field | Value |
|---|---|
| Component | `frontend/src/components/payment/flows/CreditDebitFlow.tsx` |
| CTA | TBD |
| Canonical command | None |
| Status | **no-command** |
| What must be built | No canonical command yet. CTA must remain disabled until command is defined. |

---

## Finance — Expense Claims

| Field | Value |
|---|---|
| Component | `frontend/src/components/payment/flows/ExpenseClaimsFlow.tsx` |
| CTA | TBD |
| Canonical command | None |
| Status | **no-command** |
| What must be built | No canonical command yet. CTA must remain disabled. |

---

## Finance — Journal Entry

| Field | Value |
|---|---|
| Component | `frontend/src/components/payment/flows/FinancialJournalFlow.tsx` |
| CTA | Post Journal Entry |
| API service method | `journalApi` (out of scope — Codex owns ledger/journal) |
| Status | out-of-scope |

---

## Summary

| CTA | Status |
|---|---|
| Stock Adjustment — Post Adjustment | wired |
| Stock Transfer — Post Transfer | wired |
| Stock Movement — (read-only) | no-command (correct) |
| Customer Receipt — Save Payment | disconnected — needs build |
| Supplier Payment — Save Payment | disconnected — needs build |
| Supplier Advance — (no UI) | disconnected — needs build |
| Bank Reconciliation — Start | no-command (correctly disabled) |
| Credit/Debit Note | no-command (correctly disabled) |
| Expense Claims | no-command (correctly disabled) |
| Journal Entry | out-of-scope (Codex) |

### Legacy endpoint fence

`stockApi.adjust`, `stockApi.transfer`, and `stockApi.createAdjustment` now call
`rejectCanonicalWrite(...)` instead of posting to `/stock-adjustments/` or
`/stock-movements/transfer`. Any legacy caller will receive a
`CanonicalWriteUnavailableError` at runtime rather than silently writing to the legacy path.
