# Financial Schema Documentation

## Overview
The `financial` schema manages accounting, payments, receivables, and financial reporting. This includes chart of accounts, journal entries, payment processing, and outstanding management.

---

## Tables

### 1. payment_methods

### payment_methods
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_payment_methods()`, `api.create_payment_method()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `payment_method_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `method_code` | TEXT | ✓ | Description needed | Standard field usage |
| `method_name` | TEXT | ✓ | Description needed | Standard field usage |
| `method_type` | TEXT | ✓ | Description needed | Standard field usage |
| `requires_reference` | BOOLEAN | - | Description needed | Standard field usage |
| `requires_approval` | BOOLEAN | - | Description needed | Standard field usage |
| `default_bank_account_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `processing_days` | INTEGER | - | Description needed | Standard field usage |
| `transaction_charge_percent` | NUMERIC(5 | - | Description needed | Standard field usage |
| `transaction_charge_fixed` | NUMERIC(15 | - | Description needed | Standard field usage |
| `is_active` | BOOLEAN | - | Active status flag | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `default_bank_account_id` → `master.org_bank_accounts.bank_account_id`

---

### 2. payments

### payments
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_payments()`, `api.create_payment()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `payment_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `branch_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `payment_number` | TEXT | ✓ | Description needed | Standard field usage |
| `payment_date` | DATE | - | Description needed | Standard field usage |
| `payment_type` | TEXT | ✓ | Description needed | Standard field usage |
| `party_type` | TEXT | ✓ | Description needed | Standard field usage |
| `party_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `party_name` | TEXT | ✓ | Description needed | Standard field usage |
| `payment_amount` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `payment_method_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `reference_number` | TEXT | - | Description needed | Standard field usage |
| `reference_date` | DATE | - | Description needed | Standard field usage |
| `bank_account_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `deposited_at_bank` | TEXT | - | Description needed | Standard field usage |
| `payment_status` | TEXT | - | Description needed | Standard field usage |
| `clearance_date` | DATE | - | Description needed | Standard field usage |
| `requires_approval` | BOOLEAN | - | Description needed | Standard field usage |
| `approved_by` | INTEGER | - | Description needed | Standard field usage |
| `approved_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `allocation_status` | TEXT | - | Description needed | Standard field usage |
| `allocated_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `unallocated_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `narration` | TEXT | - | Description needed | Standard field usage |
| `internal_notes` | TEXT | - | Description needed | Standard field usage |
| `is_pdc` | BOOLEAN | - | Description needed | Standard field usage |
| `pdc_status` | TEXT | - | Description needed | Standard field usage |
| `is_cancelled` | BOOLEAN | - | Description needed | Standard field usage |
| `cancellation_reason` | TEXT | - | Description needed | Standard field usage |
| `cancelled_by` | INTEGER | - | Description needed | Standard field usage |
| `cancelled_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | ✓ | Creation audit field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `branch_id` → `master.org_branches.branch_id`
- `payment_method_id` → `financial.payment_methods.payment_method_id`
- `bank_account_id` → `master.org_bank_accounts.bank_account_id`
- `approved_by` → `master.org_users.user_id`
- `cancelled_by` → `master.org_users.user_id`
- `created_by` → `master.org_users.user_id`

---

### 3. payment_allocations

### payment_allocations
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_payment_allocations()`, `api.create_payment_allocation()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `allocation_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `payment_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `reference_type` | TEXT | ✓ | Description needed | Standard field usage |
| `reference_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `reference_number` | TEXT | ✓ | Description needed | Standard field usage |
| `allocated_amount` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `discount_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `write_off_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `allocation_status` | TEXT | - | Description needed | Standard field usage |
| `reversed_by` | INTEGER | - | Description needed | Standard field usage |
| `reversed_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `reversal_reason` | TEXT | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | ✓ | Creation audit field | Standard field usage |

**Foreign Key Relationships**:
- `payment_id` → `financial.payments.payment_id`
- `reversed_by` → `master.org_users.user_id`
- `created_by` → `master.org_users.user_id`

---

### 4. customer_outstanding

### customer_outstanding
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_customer_outstanding()`, `api.create_customer_outstanding()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `outstanding_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `customer_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `document_type` | TEXT | ✓ | Description needed | Standard field usage |
| `document_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `document_number` | TEXT | ✓ | Description needed | Standard field usage |
| `document_date` | DATE | ✓ | Description needed | Standard field usage |
| `original_amount` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `outstanding_amount` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `paid_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `due_date` | DATE | - | Description needed | Standard field usage |
| `days_overdue` | INTEGER | - | Description needed | Standard field usage |
| `aging_bucket` | TEXT | - | Description needed | Standard field usage |
| `status` | TEXT | - | Description needed | Standard field usage |
| `promised_date` | DATE | - | Description needed | Standard field usage |
| `follow_up_date` | DATE | - | Description needed | Standard field usage |
| `collection_notes` | TEXT | - | Description needed | Standard field usage |
| `write_off_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `write_off_date` | DATE | - | Description needed | Standard field usage |
| `write_off_reason` | TEXT | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `customer_id` → `parties.customers.customer_id`

---

### 5. supplier_outstanding

### supplier_outstanding
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_supplier_outstanding()`, `api.create_supplier_outstanding()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `outstanding_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `supplier_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `document_type` | TEXT | ✓ | Description needed | Standard field usage |
| `document_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `document_number` | TEXT | ✓ | Description needed | Standard field usage |
| `document_date` | DATE | ✓ | Description needed | Standard field usage |
| `original_amount` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `outstanding_amount` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `paid_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `due_date` | DATE | - | Description needed | Standard field usage |
| `days_until_due` | INTEGER | - | Description needed | Standard field usage |
| `status` | TEXT | - | Description needed | Standard field usage |
| `planned_payment_date` | DATE | - | Description needed | Standard field usage |
| `payment_priority` | TEXT | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `supplier_id` → `parties.suppliers.supplier_id`

---

### 6. journal_entries

### journal_entries
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_journal_entries()`, `api.create_journal_entrie()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `journal_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `branch_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `journal_number` | TEXT | ✓ | Description needed | Standard field usage |
| `journal_date` | DATE | ✓ | Description needed | Standard field usage |
| `journal_type` | TEXT | ✓ | Description needed | Standard field usage |
| `reference_type` | TEXT | - | Description needed | Standard field usage |
| `reference_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `reference_number` | TEXT | - | Description needed | Standard field usage |
| `entry_status` | TEXT | - | Description needed | Standard field usage |
| `posted_by` | INTEGER | - | Description needed | Standard field usage |
| `posted_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `is_reversal` | BOOLEAN | - | Description needed | Standard field usage |
| `reversal_of_journal_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `narration` | TEXT | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | ✓ | Creation audit field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `branch_id` → `master.org_branches.branch_id`
- `posted_by` → `master.org_users.user_id`
- `reversal_of_journal_id` → `financial.journal_entries.journal_id`
- `created_by` → `master.org_users.user_id`

---

### 7. journal_entry_lines

### journal_entry_lines
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_journal_entry_lines()`, `api.create_journal_entry_line()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `line_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `journal_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `account_code` | TEXT | ✓ | Description needed | Standard field usage |
| `account_name` | TEXT | ✓ | Description needed | Standard field usage |
| `debit_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `credit_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `party_type` | TEXT | - | Description needed | Standard field usage |
| `party_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `cost_center_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `line_narration` | TEXT | - | Description needed | Standard field usage |
| `display_order` | INTEGER | - | Description needed | Standard field usage |

**Foreign Key Relationships**:
- `journal_id` → `financial.journal_entries.journal_id`

---

### 8. chart_of_accounts

### chart_of_accounts
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_chart_of_accounts()`, `api.create_chart_of_account()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `account_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `parent_account_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `account_code` | TEXT | ✓ | Description needed | Standard field usage |
| `account_name` | TEXT | ✓ | Description needed | Standard field usage |
| `account_type` | TEXT | ✓ | Description needed | Standard field usage |
| `account_subtype` | TEXT | - | Description needed | Standard field usage |
| `is_group` | BOOLEAN | - | Description needed | Standard field usage |
| `is_active` | BOOLEAN | - | Active status flag | Standard field usage |
| `is_system_account` | BOOLEAN | - | Description needed | Standard field usage |
| `normal_balance` | TEXT | ✓ | Description needed | Standard field usage |
| `current_balance` | NUMERIC(15 | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `parent_account_id` → `financial.chart_of_accounts.account_id`

---

### 9. bank_reconciliations

### bank_reconciliations
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_bank_reconciliations()`, `api.create_bank_reconciliation()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `reconciliation_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `bank_account_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `reconciliation_date` | DATE | ✓ | Description needed | Standard field usage |
| `from_date` | DATE | ✓ | Description needed | Standard field usage |
| `to_date` | DATE | ✓ | Description needed | Standard field usage |
| `statement_balance` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `statement_date` | DATE | ✓ | Description needed | Standard field usage |
| `book_balance` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `uncleared_deposits` | NUMERIC(15 | - | Description needed | Standard field usage |
| `uncleared_payments` | NUMERIC(15 | - | Description needed | Standard field usage |
| `adjusted_book_balance` | NUMERIC(15 | - | Description needed | Standard field usage |
| `difference` | NUMERIC(15 | - | Description needed | Standard field usage |
| `reconciliation_status` | TEXT | - | Description needed | Standard field usage |
| `completed_by` | INTEGER | - | Description needed | Standard field usage |
| `completed_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `approved_by` | INTEGER | - | Description needed | Standard field usage |
| `approved_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `notes` | TEXT | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | ✓ | Creation audit field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `bank_account_id` → `master.org_bank_accounts.bank_account_id`
- `completed_by` → `master.org_users.user_id`
- `approved_by` → `master.org_users.user_id`
- `created_by` → `master.org_users.user_id`

---

### 10. bank_reconciliation_items

### bank_reconciliation_items
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_bank_reconciliation_items()`, `api.create_bank_reconciliation_item()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `item_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `reconciliation_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `transaction_type` | TEXT | ✓ | Description needed | Standard field usage |
| `transaction_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `transaction_date` | DATE | ✓ | Description needed | Standard field usage |
| `transaction_amount` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `is_reconciled` | BOOLEAN | - | Description needed | Standard field usage |
| `reconciled_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `statement_reference` | TEXT | - | Description needed | Standard field usage |
| `statement_date` | DATE | - | Description needed | Standard field usage |
| `notes` | TEXT | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `reconciliation_id` → `financial.bank_reconciliations.reconciliation_id`

---

### 11. expense_categories

### expense_categories
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_expense_categories()`, `api.create_expense_categorie()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `category_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `parent_category_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `category_code` | TEXT | ✓ | Description needed | Standard field usage |
| `category_name` | TEXT | ✓ | Description needed | Standard field usage |
| `expense_account_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `monthly_budget` | NUMERIC(15 | - | Description needed | Standard field usage |
| `quarterly_budget` | NUMERIC(15 | - | Description needed | Standard field usage |
| `annual_budget` | NUMERIC(15 | - | Description needed | Standard field usage |
| `requires_approval` | BOOLEAN | - | Description needed | Standard field usage |
| `approval_limit` | NUMERIC(15 | - | Description needed | Standard field usage |
| `is_active` | BOOLEAN | - | Active status flag | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `parent_category_id` → `financial.expense_categories.category_id`
- `expense_account_id` → `financial.chart_of_accounts.account_id`

---

### 12. expense_claims

### expense_claims
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_expense_claims()`, `api.create_expense_claim()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `claim_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `claim_number` | TEXT | ✓ | Description needed | Standard field usage |
| `claim_date` | DATE | ✓ | Description needed | Standard field usage |
| `employee_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `department` | TEXT | - | Description needed | Standard field usage |
| `expense_from_date` | DATE | - | Description needed | Standard field usage |
| `expense_to_date` | DATE | - | Description needed | Standard field usage |
| `total_amount` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `approved_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `advance_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `payable_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `claim_status` | TEXT | - | Description needed | Standard field usage |
| `submitted_date` | DATE | - | Description needed | Standard field usage |
| `current_approver_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `approval_history` | JSONB | - | Description needed | Standard field usage |
| `payment_status` | TEXT | - | Description needed | Standard field usage |
| `payment_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `paid_date` | DATE | - | Description needed | Standard field usage |
| `purpose` | TEXT | - | Description needed | Standard field usage |
| `notes` | TEXT | - | Description needed | Standard field usage |
| `rejection_reason` | TEXT | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `employee_id` → `master.org_users.user_id`
- `current_approver_id` → `master.org_users.user_id`
- `payment_id` → `financial.payments.payment_id`

---

### 13. expense_claim_items

### expense_claim_items
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_expense_claim_items()`, `api.create_expense_claim_item()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `claim_item_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `claim_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `expense_date` | DATE | ✓ | Description needed | Standard field usage |
| `category_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `expense_description` | TEXT | ✓ | Description needed | Standard field usage |
| `claimed_amount` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `approved_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `bill_number` | TEXT | - | Description needed | Standard field usage |
| `bill_date` | DATE | - | Description needed | Standard field usage |
| `vendor_name` | TEXT | - | Description needed | Standard field usage |
| `attachment_path` | TEXT | - | Description needed | Standard field usage |
| `item_status` | TEXT | - | Description needed | Standard field usage |
| `rejection_reason` | TEXT | - | Description needed | Standard field usage |
| `notes` | TEXT | - | Description needed | Standard field usage |
| `display_order` | INTEGER | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `claim_id` → `financial.expense_claims.claim_id`
- `category_id` → `financial.expense_categories.category_id`

---

### 14. pdc_management

### pdc_management
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_pdc_management()`, `api.create_pdc_management()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `pdc_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `payment_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `cheque_number` | TEXT | ✓ | Description needed | Standard field usage |
| `cheque_date` | DATE | ✓ | Description needed | Standard field usage |
| `bank_name` | TEXT | ✓ | Description needed | Standard field usage |
| `party_type` | TEXT | ✓ | Description needed | Standard field usage |
| `party_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `party_name` | TEXT | ✓ | Description needed | Standard field usage |
| `cheque_amount` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `pdc_type` | TEXT | ✓ | Description needed | Standard field usage |
| `pdc_status` | TEXT | - | Description needed | Standard field usage |
| `deposit_date` | DATE | - | Description needed | Standard field usage |
| `clearance_date` | DATE | - | Description needed | Standard field usage |
| `bounce_count` | INTEGER | - | Description needed | Standard field usage |
| `bounce_charges` | NUMERIC(15 | - | Description needed | Standard field usage |
| `bounce_reason` | TEXT | - | Description needed | Standard field usage |
| `cheque_location` | TEXT | - | Description needed | Standard field usage |
| `notes` | TEXT | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | ✓ | Creation audit field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `payment_id` → `financial.payments.payment_id`
- `created_by` → `master.org_users.user_id`

---

### 15. cash_flow_forecast

### cash_flow_forecast
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_cash_flow_forecast()`, `api.create_cash_flow_forecast()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `forecast_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `forecast_date` | DATE | ✓ | Description needed | Standard field usage |
| `forecast_type` | TEXT | ✓ | Description needed | Standard field usage |
| `opening_balance` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `customer_collections` | NUMERIC(15 | - | Description needed | Standard field usage |
| `other_income` | NUMERIC(15 | - | Description needed | Standard field usage |
| `total_inflows` | NUMERIC(15 | - | Description needed | Standard field usage |
| `supplier_payments` | NUMERIC(15 | - | Description needed | Standard field usage |
| `salary_payments` | NUMERIC(15 | - | Description needed | Standard field usage |
| `other_expenses` | NUMERIC(15 | - | Description needed | Standard field usage |
| `total_outflows` | NUMERIC(15 | - | Description needed | Standard field usage |
| `projected_closing_balance` | NUMERIC(15 | - | Description needed | Standard field usage |
| `minimum_required_balance` | NUMERIC(15 | - | Description needed | Standard field usage |
| `surplus_deficit` | NUMERIC(15 | - | Description needed | Standard field usage |
| `actual_inflows` | NUMERIC(15 | - | Description needed | Standard field usage |
| `actual_outflows` | NUMERIC(15 | - | Description needed | Standard field usage |
| `actual_closing_balance` | NUMERIC(15 | - | Description needed | Standard field usage |
| `variance` | NUMERIC(15 | - | Description needed | Standard field usage |
| `forecast_status` | TEXT | - | Description needed | Standard field usage |
| `notes` | TEXT | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | ✓ | Creation audit field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `created_by` → `master.org_users.user_id`

---
