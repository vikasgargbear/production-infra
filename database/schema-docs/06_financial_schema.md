# Financial Schema Documentation

**Schema:** `financial`
**Purpose:** Accounting, payments, receivables/payables management
**Last Updated:** 2025-10-16
**Tables:** 16

---

## Overview

The `financial` schema manages accounting and financial operations including chart of accounts, journal entries, payment processing, customer/supplier outstanding, expense management, bank reconciliation, and cash flow forecasting.

---

## Tables Summary

| # | Table | Purpose | Primary Key | Key Features |
|---|-------|---------|-------------|--------------|
| 1 | chart_of_accounts | COA master | account_id | Hierarchical GL accounts |
| 2 | journal_entries | Journal entry header | entry_id | Double-entry accounting |
| 3 | journal_entry_lines | JE line items | line_id | Debit/credit lines |
| 4 | payment_methods | Payment modes | payment_method_id | Cash/card/UPI/bank |
| 5 | payments | Payment transactions | payment_id | Customer/supplier payments |
| 6 | payment_allocations | Payment-to-invoice mapping | allocation_id | Outstanding reduction |
| 7 | customer_outstanding | Receivables ledger | outstanding_id | Aging, overdue tracking |
| 8 | supplier_outstanding | Payables ledger | outstanding_id | Payment scheduling |
| 9 | expense_categories | Expense types | category_id | OPEX/CAPEX classification |
| 10 | expense_claims | Employee expenses | claim_id | Approval workflow |
| 11 | expense_claim_items | Claim line items | claim_item_id | Receipt tracking |
| 12 | bank_reconciliations | Bank rec header | reconciliation_id | Statement matching |
| 13 | bank_reconciliation_items | Rec line items | item_id | Matched/unmatched transactions |
| 14 | unmatched_transactions | Unreconciled items | transaction_id | Requires investigation |
| 15 | cash_flow_forecast | Cash flow projection | forecast_id | Inflow/outflow prediction |
| 16 | pdc_management | Post-dated checks | pdc_id | Check clearance tracking |

---

## Related Documentation

- [MASTER_SCHEMA_INDEX.md](./MASTER_SCHEMA_INDEX.md) - All schemas
- [04_sales_schema.md](./04_sales_schema.md) - Customer receivables
- [05_procurement_schema.md](./05_procurement_schema.md) - Supplier payables

---

**Documentation Status:** ✅ Updated 2025-10-16
**Schema Version:** Production (Railway)
**Total Tables:** 16
**Key Features:** Double-Entry Accounting, Payment Allocation, Outstanding Management, Bank Reconciliation, Expense Claims
