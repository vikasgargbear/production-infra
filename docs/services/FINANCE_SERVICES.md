# Finance Services

Services for financial operations including accounting, payments, ledger management, and tax compliance.

---

## LedgerService

**Location:** `backend/app/api/services/finance/ledger/service.py`

**Used By:** `finance/ledger/routes.py`

**Description:** Comprehensive ledger management for party statements, aging analysis, and balance calculations.

### Methods

| Method | Description |
|--------|-------------|
| `get_party_statement()` | Get detailed transaction history for a customer/supplier |
| `get_party_balance()` | Calculate current outstanding balance |
| `get_aging_analysis()` | Generate aging buckets (0-30, 31-60, 61-90, 90+ days) |
| `get_outstanding_items()` | List unpaid invoices/bills |
| `calculate_interest()` | Calculate interest on overdue amounts |
| `get_ledger_summary()` | Summary statistics for a party |
| `get_top_debtors()` | List customers with highest outstanding |
| `get_customer_details()` | Get customer info for ledger |
| `get_supplier_details()` | Get supplier info for ledger |
| `get_last_payment()` | Get most recent payment from party |
| `get_opening_balance_customer()` | Customer opening balance |
| `get_opening_balance_supplier()` | Supplier opening balance |

---

## PaymentService

**Location:** `backend/app/api/services/finance/payment/service.py`

**Used By:** `finance/payments/routes.py`

**Description:** Payment recording and management for both receipts and payments.

### Methods

| Method | Description |
|--------|-------------|
| `create_payment()` | Record new payment/receipt |
| `get_payment()` | Get payment details |
| `list_payments()` | List payments with filters |
| `update_payment_status()` | Update payment status |
| `void_payment()` | Void/cancel a payment |
| `get_payment_modes()` | Get available payment modes |

---

## AllocationService

**Location:** `backend/app/api/services/finance/allocation/service.py`

**Used By:** `finance/allocation/routes.py`

**Description:** Payment allocation to invoices with FIFO/LIFO support.

### Methods (14 total)

| Method | Description |
|--------|-------------|
| `allocate_payment()` | Manually allocate payment to invoice |
| `bulk_allocate()` | Allocate payment to multiple invoices |
| `auto_allocate_fifo()` | Automatic FIFO allocation |
| `auto_allocate_lifo()` | Automatic LIFO allocation |
| `get_allocations_for_payment()` | Get all allocations for a payment |
| `get_allocations_for_invoice()` | Get payments allocated to invoice |
| `delete_allocation()` | Remove an allocation |
| `get_unallocated_payments()` | List payments with unallocated balance |
| `get_unpaid_invoices()` | List invoices awaiting payment |

---

## JournalService

**Location:** `backend/app/api/services/finance/journal/service.py`

**Used By:** `finance/journal/routes.py`

**Description:** Journal entry management for manual accounting entries.

### Methods (12 total)

| Method | Description |
|--------|-------------|
| `get_chart_of_accounts()` | List all accounts with filters |
| `get_or_create_account()` | Get existing or create new account |
| `insert_journal_entry()` | Create journal entry header |
| `insert_journal_line()` | Create journal entry line |
| `list_journal_entries()` | List entries with filters |
| `get_journal_entry()` | Get entry with all lines |
| `count_journal_entries()` | Count entries for pagination |
| `generate_journal_number()` | Generate unique journal number |

---

## ExpenseService

**Location:** `backend/app/api/services/finance/expense/service.py`

**Used By:** `finance/expenses/routes.py`

**Description:** Expense claim management and approval workflow.

### Methods (12 total)

| Method | Description |
|--------|-------------|
| `create_employee()` | Create employee record |
| `create_expense_claim()` | Submit new expense claim |
| `get_expense_types()` | List expense categories |
| `list_expense_claims()` | List claims with filters |
| `get_claim_details()` | Get claim with items |
| `approve_claim()` | Approve expense claim |
| `reject_claim()` | Reject expense claim |
| `update_claim_status()` | Update claim status |

---

## TaxService

**Location:** `backend/app/api/services/finance/tax/service.py`

**Used By:** `finance/tax/routes.py`

**Description:** Tax entry management and GST report generation.

### Methods (6 total)

| Method | Description |
|--------|-------------|
| `get_tax_entries()` | List tax entries with filters |
| `get_gstr1_summary()` | Generate GSTR-1 summary report |
| `get_gstr1_b2b()` | B2B supplies for GSTR-1 |
| `get_gstr1_b2c()` | B2C supplies for GSTR-1 |
| `get_tax_analytics()` | Tax collection analytics |
| `calculate_tax_liability()` | Calculate net tax liability |

---

## CreditNoteService

**Location:** `backend/app/api/services/finance/credit_note/service.py`

**Used By:** `finance/credit_notes/routes.py`

**Description:** Credit note creation and management.

### Methods

| Method | Description |
|--------|-------------|
| `create_credit_note()` | Create new credit note |
| `get_credit_note()` | Get credit note details |
| `list_credit_notes()` | List with filters |
| `apply_credit_note()` | Apply to invoice |

---

## Usage Examples

### LedgerService - Get Party Statement

```python
from app.api.services.finance.ledger.service import LedgerService

# In route handler
statement = LedgerService.get_party_statement(
    db=db,
    org_id=str(context.org_id),
    party_type="customer",
    party_id=customer_id,
    from_date=date(2024, 1, 1),
    to_date=date.today()
)
# Returns: List of transactions with running balance
```

### AllocationService - Allocate Payment to Invoice

```python
from app.api.services.finance.allocation.service import AllocationService

# Allocate specific amount
allocation = AllocationService.allocate_payment(
    db=db,
    org_id=str(context.org_id),
    payment_id=123,
    invoice_id=456,
    amount=Decimal("5000.00")
)
db.commit()
```

### PaymentService - Create Payment

```python
from app.api.services.finance.payment.service import PaymentService

payment_id = PaymentService.create_payment(
    db=db,
    org_id=str(context.org_id),
    payment_data={
        "payment_type": "receipt",
        "party_type": "customer",
        "party_id": customer_id,
        "amount": Decimal("10000.00"),
        "payment_mode": "bank_transfer",
        "reference_number": "UTR123456"
    },
    created_by=context.user_id
)
```

---

## Database Tables

| Table | Schema | Service | Description |
|-------|--------|---------|-------------|
| `financial.payments` | Payment records | PaymentService | All receipts and payments |
| `financial.payment_allocations` | Payment mapping | AllocationService | Links payments to invoices |
| `financial.journal_entries` | Journal headers | JournalService | Manual accounting entries |
| `financial.journal_entry_lines` | Journal details | JournalService | Debit/credit lines |
| `financial.chart_of_accounts` | Account master | JournalService | COA with hierarchy |
| `financial.expense_claims` | Expense headers | ExpenseService | Employee expense claims |
| `financial.expense_claim_items` | Expense details | ExpenseService | Claim line items |
| `financial.tax_entries` | Tax records | TaxService | GST/tax transactions |

---

## Dependencies

```
LedgerService
├── Uses: sales.invoices, procurement.supplier_invoices
├── Uses: financial.payments, financial.payment_allocations
└── Depends on: None (standalone)

PaymentService
├── Uses: financial.payments
├── Uses: parties.customers, parties.suppliers
└── Depends on: DocumentNumberService

AllocationService
├── Uses: financial.payment_allocations
├── Uses: financial.payments, sales.invoices
└── Depends on: PaymentService (validation)

TaxService
├── Uses: financial.tax_entries
├── Uses: sales.invoices, procurement.supplier_invoices
└── Depends on: GSTService
```

---

## Error Codes

| Error | HTTP | Description | Resolution |
|-------|------|-------------|------------|
| `PAYMENT_NOT_FOUND` | 404 | Payment ID doesn't exist | Verify payment_id |
| `INVOICE_NOT_FOUND` | 404 | Invoice ID doesn't exist | Verify invoice_id |
| `INSUFFICIENT_BALANCE` | 400 | Payment has insufficient unallocated amount | Check unallocated balance |
| `ALREADY_FULLY_PAID` | 400 | Invoice is already fully paid | No action needed |
| `ALLOCATION_EXISTS` | 409 | Duplicate allocation attempt | Check existing allocations |
| `INVALID_JOURNAL` | 400 | Journal entry not balanced | Ensure debits = credits |
| `ACCOUNT_NOT_FOUND` | 404 | Account code not in COA | Create account first |
| `CLAIM_ALREADY_APPROVED` | 400 | Expense claim already processed | Cannot modify |


---

## OutstandingService

**Location:** `backend/app/api/services/finance/outstanding/service.py`

**Used By:** `finance/outstanding/routes.py`

**Description:** Outstanding balance tracking and analysis.

### Methods

| Method | Description |
|--------|-------------|
| `get_customer_outstanding()` | Customer-wise outstanding |
| `get_supplier_outstanding()` | Supplier-wise outstanding |
| `get_aging_report()` | Detailed aging report |
| `get_due_today()` | Bills due today |
| `get_overdue()` | Overdue bills list |
