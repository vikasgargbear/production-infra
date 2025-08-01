# Financial Schema Documentation

## Overview
The `financial` schema manages accounting, payments, receivables, and financial reporting. This includes chart of accounts, journal entries, payment processing, and outstanding management.

---

## Tables

### 1. chart_of_accounts
**Purpose**: General ledger account structure and hierarchy
**API Endpoint**: `api.get_accounts()`, `api.create_account()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `account_id` | SERIAL | ✓ | Unique account identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `account_code` | TEXT | ✓ | Account code (e.g., "1001") | Account identification |
| `account_name` | TEXT | ✓ | Account display name | Display name |
| `account_type` | TEXT | ✓ | Type: 'asset', 'liability', 'equity', 'revenue', 'expense' | Account classification |
| `account_subtype` | TEXT | - | Subtype for detailed classification | Fine categorization |
| `parent_account_id` | INTEGER | - | Parent account for hierarchy | Account hierarchy |
| `account_level` | INTEGER | - | Hierarchy level (1,2,3...) | Tree depth |
| `account_path` | TEXT | - | Full path (e.g., "Assets/Current Assets/Cash") | Breadcrumb navigation |
| `currency_code` | TEXT | - | Account currency | Multi-currency support |
| `opening_balance` | NUMERIC(15,2) | - | Opening balance | Initial setup |
| `current_balance` | NUMERIC(15,2) | - | Current balance | Balance tracking |
| `is_system_account` | BOOLEAN | - | System-managed account flag | Edit protection |
| `is_bank_account` | BOOLEAN | - | Bank account flag | Banking features |
| `bank_name` | TEXT | - | Bank name if applicable | Banking information |
| `bank_account_number` | TEXT | - | Bank account number | Banking reference |
| `ifsc_code` | TEXT | - | Bank IFSC code | Banking information |
| `is_reconcilable` | BOOLEAN | - | Reconciliation required flag | Reconciliation tracking |
| `last_reconciled_date` | DATE | - | Last reconciliation date | Reconciliation tracking |
| `tax_applicable` | BOOLEAN | - | Tax applicability flag | Tax tracking |
| `description` | TEXT | - | Account description | Documentation |
| `is_active` | BOOLEAN | - | Account active status | Account filtering |
| `created_by` | INTEGER | - | User who created account | User tracking |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

**Example API Response**:
```json
{
  "account_id": 1,
  "account_code": "1001",
  "account_name": "Cash in Hand",
  "account_type": "asset",
  "account_subtype": "current_asset",
  "account_path": "Assets/Current Assets/Cash",
  "current_balance": 50000.00,
  "is_bank_account": false,
  "is_active": true
}
```

---

### 2. journal_entries
**Purpose**: Double-entry bookkeeping journal entries
**API Endpoint**: `api.get_journal_entries()`, `api.create_journal_entry()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `journal_id` | SERIAL | ✓ | Unique journal entry identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `branch_id` | INTEGER | - | Branch reference | Branch tracking |
| `journal_number` | TEXT | ✓ | Journal entry number | Document identification |
| `journal_date` | DATE | ✓ | Transaction date | Date filtering |
| `journal_type` | TEXT | ✓ | Type: 'general', 'sales', 'purchase', 'cash', 'bank', 'contra' | Journal classification |
| `reference_type` | TEXT | - | Source document type | Document linking |
| `reference_id` | INTEGER | - | Source document ID | Document linking |
| `reference_number` | TEXT | - | Source document number | Reference tracking |
| `narration` | TEXT | ✓ | Entry description/narration | Documentation |
| `total_debit` | NUMERIC(15,2) | ✓ | Total debit amount | Balance validation |
| `total_credit` | NUMERIC(15,2) | ✓ | Total credit amount | Balance validation |
| `is_balanced` | BOOLEAN | - | Entry balanced flag | Validation status |
| `posting_status` | TEXT | ✓ | Status: 'draft', 'posted', 'cancelled' | Posting control |
| `posted_by` | INTEGER | - | User who posted entry | Posting tracking |
| `posted_at` | TIMESTAMPTZ | - | Posting timestamp | Posting tracking |
| `is_adjustment` | BOOLEAN | - | Adjustment entry flag | Entry classification |
| `fiscal_year` | TEXT | - | Fiscal year reference | Period tracking |
| `accounting_period` | TEXT | - | Accounting period | Period tracking |
| `cancelled_by` | INTEGER | - | User who cancelled | Cancellation tracking |
| `cancelled_at` | TIMESTAMPTZ | - | Cancellation timestamp | Cancellation tracking |
| `cancellation_reason` | TEXT | - | Cancellation reason | Cancellation documentation |
| `created_by` | INTEGER | - | User who created entry | User tracking |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

**Example API Response**:
```json
{
  "journal_id": 1,
  "journal_number": "JV-2024-001",
  "journal_date": "2024-01-15",
  "journal_type": "sales",
  "reference_type": "invoice",
  "reference_number": "INV-2024-001",
  "narration": "Sales invoice posting",
  "total_debit": 5600.00,
  "total_credit": 5600.00,
  "is_balanced": true,
  "posting_status": "posted"
}
```

---

### 3. journal_entry_lines
**Purpose**: Individual debit/credit lines within journal entries
**API Endpoint**: `api.get_journal_lines()`, `api.create_journal_line()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `line_id` | SERIAL | ✓ | Unique line identifier | Primary key |
| `journal_id` | INTEGER | ✓ | Parent journal entry | Journal association |
| `line_number` | INTEGER | ✓ | Line sequence number | Line ordering |
| `account_code` | TEXT | ✓ | GL account code | Account reference |
| `account_name` | TEXT | - | Account name (snapshot) | Display convenience |
| `debit_amount` | NUMERIC(15,2) | - | Debit amount (0 if credit) | Amount entry |
| `credit_amount` | NUMERIC(15,2) | - | Credit amount (0 if debit) | Amount entry |
| `currency_code` | TEXT | - | Transaction currency | Multi-currency |
| `exchange_rate` | NUMERIC(10,6) | - | Currency exchange rate | Currency conversion |
| `base_debit_amount` | NUMERIC(15,2) | - | Debit in base currency | Base currency tracking |
| `base_credit_amount` | NUMERIC(15,2) | - | Credit in base currency | Base currency tracking |
| `cost_center_id` | INTEGER | - | Cost center reference | Cost allocation |
| `project_id` | INTEGER | - | Project reference | Project tracking |
| `party_type` | TEXT | - | Party type: 'customer', 'supplier' | Party classification |
| `party_id` | INTEGER | - | Customer/supplier ID | Party tracking |
| `line_narration` | TEXT | - | Line-specific narration | Line documentation |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |

**Example API Response**:
```json
{
  "line_id": 1,
  "journal_id": 1,
  "line_number": 1,
  "account_code": "4001",
  "account_name": "Sales Revenue",
  "debit_amount": 0.00,
  "credit_amount": 5000.00,
  "line_narration": "Product sales"
}
```

---

### 4. payments
**Purpose**: Payment and receipt transaction management
**API Endpoint**: `api.get_payments()`, `api.create_payment()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `payment_id` | SERIAL | ✓ | Unique payment identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `branch_id` | INTEGER | - | Branch reference | Branch tracking |
| `payment_number` | TEXT | ✓ | Payment document number | Document identification |
| `payment_date` | DATE | ✓ | Transaction date | Date filtering |
| `payment_type` | TEXT | ✓ | Type: 'payment', 'receipt', 'advance' | Payment classification |
| `payment_mode` | TEXT | ✓ | Mode: 'cash', 'cheque', 'bank_transfer', 'upi', 'credit_card' | Payment method |
| `party_type` | TEXT | ✓ | Party: 'customer', 'supplier', 'expense', 'income' | Party classification |
| `party_id` | INTEGER | - | Customer/supplier ID | Party tracking |
| `party_name` | TEXT | - | Party name (snapshot) | Display convenience |
| `payment_amount` | NUMERIC(15,2) | ✓ | Payment amount | Amount tracking |
| `currency_code` | TEXT | - | Payment currency | Multi-currency |
| `exchange_rate` | NUMERIC(10,6) | - | Currency exchange rate | Currency conversion |
| `base_amount` | NUMERIC(15,2) | - | Amount in base currency | Base currency tracking |
| `bank_account_id` | INTEGER | - | Bank account reference | Banking tracking |
| `cheque_number` | TEXT | - | Cheque number if applicable | Cheque tracking |
| `cheque_date` | DATE | - | Cheque date | Cheque tracking |
| `bank_reference` | TEXT | - | Bank transaction reference | Banking reference |
| `upi_reference` | TEXT | - | UPI transaction ID | UPI tracking |
| `payment_status` | TEXT | ✓ | Status: 'pending', 'cleared', 'bounced', 'cancelled' | Status tracking |
| `clearance_date` | DATE | - | Bank clearance date | Clearance tracking |
| `allocation_status` | TEXT | - | Allocation: 'unallocated', 'partial', 'full' | Allocation tracking |
| `allocated_amount` | NUMERIC(15,2) | - | Amount allocated to invoices | Allocation tracking |
| `unallocated_amount` | NUMERIC(15,2) | - | Unallocated amount | Balance tracking |
| `reference_type` | TEXT | - | Reference document type | Document linking |
| `reference_id` | INTEGER | - | Reference document ID | Document linking |
| `reference_number` | TEXT | - | Reference document number | Reference tracking |
| `notes` | TEXT | - | Payment notes | Documentation |
| `reconciled` | BOOLEAN | - | Bank reconciliation flag | Reconciliation status |
| `reconciled_date` | DATE | - | Reconciliation date | Reconciliation tracking |
| `created_by` | INTEGER | - | User who created payment | User tracking |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

**Example API Response**:
```json
{
  "payment_id": 1,
  "payment_number": "RCT-2024-001",
  "payment_date": "2024-01-15",
  "payment_type": "receipt",
  "payment_mode": "bank_transfer",
  "party_type": "customer",
  "party_name": "ABC Medical Store",
  "payment_amount": 5600.00,
  "payment_status": "cleared",
  "allocation_status": "full",
  "bank_reference": "IMPS123456789"
}
```

---

### 5. payment_allocations
**Purpose**: Payment allocation to specific invoices/bills
**API Endpoint**: `api.get_allocations()`, `api.allocate_payment()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `allocation_id` | SERIAL | ✓ | Unique allocation identifier | Primary key |
| `payment_id` | INTEGER | ✓ | Parent payment reference | Payment association |
| `reference_type` | TEXT | ✓ | Reference: 'invoice', 'bill', 'advance' | Document type |
| `reference_id` | INTEGER | ✓ | Invoice/bill ID | Document reference |
| `reference_number` | TEXT | - | Invoice/bill number | Reference display |
| `allocated_amount` | NUMERIC(15,2) | ✓ | Amount allocated | Allocation tracking |
| `discount_amount` | NUMERIC(15,2) | - | Settlement discount | Discount tracking |
| `write_off_amount` | NUMERIC(15,2) | - | Write-off amount | Write-off tracking |
| `allocation_date` | DATE | - | Allocation date | Date tracking |
| `allocation_status` | TEXT | - | Status: 'active', 'reversed' | Status tracking |
| `reversed_date` | DATE | - | Reversal date if reversed | Reversal tracking |
| `reversed_reason` | TEXT | - | Reversal reason | Reversal documentation |
| `allocated_by` | INTEGER | - | User who allocated | User tracking |
| `allocated_at` | TIMESTAMPTZ | - | Allocation timestamp | Audit trails |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |

---

### 6. customer_outstanding
**Purpose**: Customer-wise outstanding balance tracking
**API Endpoint**: `api.get_customer_outstanding()`, `api.update_outstanding()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `outstanding_id` | SERIAL | ✓ | Unique outstanding identifier | Primary key |
| `customer_id` | INTEGER | ✓ | Customer reference | Customer association |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `document_type` | TEXT | ✓ | Type: 'invoice', 'credit_note', 'advance' | Document classification |
| `document_id` | INTEGER | ✓ | Source document ID | Document reference |
| `document_number` | TEXT | - | Document number | Reference display |
| `document_date` | DATE | ✓ | Document date | Date tracking |
| `due_date` | DATE | - | Payment due date | Due date tracking |
| `original_amount` | NUMERIC(15,2) | ✓ | Original document amount | Amount tracking |
| `paid_amount` | NUMERIC(15,2) | - | Amount paid | Payment tracking |
| `outstanding_amount` | NUMERIC(15,2) | ✓ | Current outstanding | Balance tracking |
| `days_overdue` | INTEGER | - | Days past due date | Aging tracking |
| `aging_bucket` | TEXT | - | Aging: '0-30', '31-60', '61-90', '90+' | Aging classification |
| `status` | TEXT | ✓ | Status: 'open', 'partial', 'paid', 'written_off' | Status tracking |
| `last_payment_date` | DATE | - | Last payment received date | Payment tracking |
| `last_reminder_date` | DATE | - | Last reminder sent date | Collection tracking |
| `reminder_count` | INTEGER | - | Number of reminders sent | Collection tracking |
| `notes` | TEXT | - | Outstanding notes | Documentation |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

**Example API Response**:
```json
{
  "outstanding_id": 1,
  "customer_id": 1,
  "document_type": "invoice",
  "document_number": "INV-2024-001",
  "document_date": "2024-01-01",
  "due_date": "2024-01-31",
  "original_amount": 5600.00,
  "paid_amount": 2000.00,
  "outstanding_amount": 3600.00,
  "days_overdue": 15,
  "aging_bucket": "0-30",
  "status": "partial"
}
```

---

### 7. supplier_outstanding
**Purpose**: Supplier-wise outstanding balance tracking
**API Endpoint**: `api.get_supplier_outstanding()`, `api.update_supplier_outstanding()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `outstanding_id` | SERIAL | ✓ | Unique outstanding identifier | Primary key |
| `supplier_id` | INTEGER | ✓ | Supplier reference | Supplier association |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `document_type` | TEXT | ✓ | Type: 'bill', 'debit_note', 'advance' | Document classification |
| `document_id` | INTEGER | ✓ | Source document ID | Document reference |
| `document_number` | TEXT | - | Document number | Reference display |
| `document_date` | DATE | ✓ | Document date | Date tracking |
| `due_date` | DATE | - | Payment due date | Due date tracking |
| `original_amount` | NUMERIC(15,2) | ✓ | Original bill amount | Amount tracking |
| `paid_amount` | NUMERIC(15,2) | - | Amount paid | Payment tracking |
| `outstanding_amount` | NUMERIC(15,2) | ✓ | Current outstanding | Balance tracking |
| `days_overdue` | INTEGER | - | Days past due date | Aging tracking |
| `aging_bucket` | TEXT | - | Aging: '0-30', '31-60', '61-90', '90+' | Aging classification |
| `status` | TEXT | ✓ | Status: 'open', 'partial', 'paid' | Status tracking |
| `last_payment_date` | DATE | - | Last payment made date | Payment tracking |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

---

### 8. bank_reconciliation
**Purpose**: Bank statement reconciliation tracking
**API Endpoint**: `api.get_reconciliations()`, `api.create_reconciliation()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `reconciliation_id` | SERIAL | ✓ | Unique reconciliation identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `bank_account_id` | INTEGER | ✓ | Bank account reference | Account association |
| `reconciliation_date` | DATE | ✓ | Reconciliation date | Date tracking |
| `statement_start_date` | DATE | ✓ | Statement period start | Period tracking |
| `statement_end_date` | DATE | ✓ | Statement period end | Period tracking |
| `statement_balance` | NUMERIC(15,2) | ✓ | Bank statement balance | Balance tracking |
| `book_balance` | NUMERIC(15,2) | ✓ | Books balance | Balance tracking |
| `reconciled_balance` | NUMERIC(15,2) | - | Reconciled balance | Balance tracking |
| `difference` | NUMERIC(15,2) | - | Unreconciled difference | Difference tracking |
| `total_deposits` | NUMERIC(15,2) | - | Total deposits in period | Summary tracking |
| `total_withdrawals` | NUMERIC(15,2) | - | Total withdrawals in period | Summary tracking |
| `unreconciled_items` | INTEGER | - | Count of unreconciled items | Status tracking |
| `reconciliation_status` | TEXT | ✓ | Status: 'draft', 'completed', 'approved' | Status tracking |
| `reconciled_by` | INTEGER | - | User who reconciled | User tracking |
| `approved_by` | INTEGER | - | User who approved | Approval tracking |
| `approved_at` | TIMESTAMPTZ | - | Approval timestamp | Approval tracking |
| `notes` | TEXT | - | Reconciliation notes | Documentation |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

---

### 9. expense_claims
**Purpose**: Employee expense claim management
**API Endpoint**: `api.get_expense_claims()`, `api.create_expense_claim()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `claim_id` | SERIAL | ✓ | Unique claim identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `claim_number` | TEXT | ✓ | Claim document number | Document identification |
| `claim_date` | DATE | ✓ | Claim submission date | Date filtering |
| `employee_id` | INTEGER | ✓ | Employee user ID | Employee tracking |
| `employee_name` | TEXT | - | Employee name (snapshot) | Display convenience |
| `department_id` | INTEGER | - | Department reference | Department tracking |
| `claim_period_from` | DATE | - | Expense period start | Period tracking |
| `claim_period_to` | DATE | - | Expense period end | Period tracking |
| `total_amount` | NUMERIC(15,2) | ✓ | Total claim amount | Amount tracking |
| `advance_amount` | NUMERIC(15,2) | - | Advance adjusted | Advance tracking |
| `net_payable` | NUMERIC(15,2) | - | Net amount payable | Payment amount |
| `claim_status` | TEXT | ✓ | Status: 'draft', 'submitted', 'approved', 'paid', 'rejected' | Status tracking |
| `approval_status` | TEXT | - | Approval: 'pending', 'approved', 'rejected' | Approval workflow |
| `approved_by` | INTEGER | - | Approver user ID | Approval tracking |
| `approved_at` | TIMESTAMPTZ | - | Approval timestamp | Approval tracking |
| `payment_status` | TEXT | - | Payment: 'unpaid', 'paid' | Payment tracking |
| `payment_date` | DATE | - | Payment date | Payment tracking |
| `payment_reference` | TEXT | - | Payment reference | Payment tracking |
| `notes` | TEXT | - | Claim notes | Documentation |
| `created_by` | INTEGER | - | User who created claim | User tracking |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

---

### 10. expense_claim_items
**Purpose**: Individual expense items within claims
**API Endpoint**: `api.get_claim_items()`, `api.create_claim_item()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `item_id` | SERIAL | ✓ | Unique item identifier | Primary key |
| `claim_id` | INTEGER | ✓ | Parent claim reference | Claim association |
| `expense_date` | DATE | ✓ | Expense incurred date | Date tracking |
| `expense_category` | TEXT | ✓ | Category: 'travel', 'meals', 'accommodation', 'misc' | Expense classification |
| `expense_type` | TEXT | - | Detailed expense type | Fine categorization |
| `description` | TEXT | ✓ | Expense description | Documentation |
| `amount` | NUMERIC(15,2) | ✓ | Expense amount | Amount tracking |
| `bill_number` | TEXT | - | Bill/receipt number | Receipt tracking |
| `vendor_name` | TEXT | - | Vendor/merchant name | Vendor tracking |
| `project_id` | INTEGER | - | Project reference | Project allocation |
| `client_billable` | BOOLEAN | - | Client billable flag | Billing tracking |
| `has_receipt` | BOOLEAN | - | Receipt available flag | Receipt verification |
| `receipt_url` | TEXT | - | Receipt image URL | Receipt storage |
| `notes` | TEXT | - | Item notes | Documentation |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |

---

## API Integration Notes

### Account Management
```javascript
// Create chart of accounts
const account = {
  account_code: "1001",
  account_name: "Cash in Hand",
  account_type: "asset",
  account_subtype: "current_asset",
  parent_account_id: 10, // Current Assets parent
  currency_code: "INR"
};

// Account hierarchy
const accountTypes = {
  asset: ['current_asset', 'fixed_asset', 'investment'],
  liability: ['current_liability', 'long_term_liability'],
  equity: ['capital', 'reserves'],
  revenue: ['sales', 'other_income'],
  expense: ['direct_expense', 'indirect_expense']
};
```

### Journal Entry Creation
```javascript
// Create balanced journal entry
const journalEntry = {
  journal_date: "2024-01-15",
  journal_type: "sales",
  narration: "Sales invoice posting",
  lines: [
    {
      account_code: "1101", // Accounts Receivable
      debit_amount: 5600.00,
      credit_amount: 0,
      party_type: "customer",
      party_id: 1
    },
    {
      account_code: "4001", // Sales Revenue
      debit_amount: 0,
      credit_amount: 5000.00
    },
    {
      account_code: "2301", // GST Payable
      debit_amount: 0,
      credit_amount: 600.00
    }
  ]
};

// Validate balanced entry
const isBalanced = journalEntry.lines.reduce((sum, line) => 
  sum + line.debit_amount - line.credit_amount, 0) === 0;
```

### Payment Processing
```javascript
// Record customer payment
const payment = {
  payment_type: "receipt",
  payment_mode: "bank_transfer",
  party_type: "customer",
  party_id: 1,
  payment_amount: 5600.00,
  bank_account_id: 1,
  bank_reference: "IMPS123456789",
  allocations: [
    {
      reference_type: "invoice",
      reference_id: 1,
      allocated_amount: 5600.00
    }
  ]
};

// Payment modes with requirements
const paymentModes = {
  cash: [],
  cheque: ['cheque_number', 'cheque_date'],
  bank_transfer: ['bank_reference'],
  upi: ['upi_reference'],
  credit_card: ['bank_reference']
};
```

### Outstanding Management
```javascript
// Get customer aging analysis
GET /api/customer-outstanding/aging?
  customer_id=1&
  as_of_date=2024-01-31

// Response
{
  "customer_id": 1,
  "total_outstanding": 25000.00,
  "aging_buckets": {
    "current": 10000.00,
    "0-30": 8000.00,
    "31-60": 5000.00,
    "61-90": 2000.00,
    "90+": 0.00
  },
  "oldest_invoice_days": 75
}
```

### Bank Reconciliation
```javascript
// Create bank reconciliation
const reconciliation = {
  bank_account_id: 1,
  reconciliation_date: "2024-01-31",
  statement_start_date: "2024-01-01",
  statement_end_date: "2024-01-31",
  statement_balance: 150000.00,
  transactions: [
    {
      transaction_id: 1,
      transaction_date: "2024-01-15",
      amount: 5600.00,
      matched: true,
      payment_id: 1
    }
  ]
};
```

### Financial Reports
```javascript
// Trial balance
GET /api/reports/trial-balance?
  as_of_date=2024-01-31&
  include_zero_balance=false

// Profit & Loss
GET /api/reports/profit-loss?
  from_date=2024-01-01&
  to_date=2024-01-31&
  comparison_period=previous_month

// Balance Sheet
GET /api/reports/balance-sheet?
  as_of_date=2024-01-31&
  format=condensed
```

### Search and Filtering
```javascript
// Payment search
GET /api/payments/search?
  payment_type=receipt&
  payment_status=cleared&
  date_from=2024-01-01&
  date_to=2024-01-31&
  party_type=customer&
  min_amount=1000&
  allocation_status=partial
```

### Dashboard Metrics
```javascript
// Financial dashboard
GET /api/financial/dashboard
{
  "cash_balance": 250000.00,
  "bank_balance": 1500000.00,
  "total_receivables": 350000.00,
  "total_payables": 275000.00,
  "overdue_receivables": 45000.00,
  "monthly_revenue": 850000.00,
  "monthly_expenses": 650000.00,
  "pending_payments": 15,
  "unreconciled_transactions": 8
}
```

### Validation Rules
1. **Journal Entries**: Must be balanced (total debits = total credits)
2. **Account Codes**: Must exist in chart of accounts
3. **Payment Allocations**: Cannot exceed payment amount
4. **Bank Reconciliation**: Statement balance must match after reconciliation
5. **Expense Claims**: Receipts required above certain amount threshold