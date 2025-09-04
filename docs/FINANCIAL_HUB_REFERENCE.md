# Financial Hub Reference Documentation

## Overview
The Financial Hub is a comprehensive system for managing customer payments, invoices, and financial transactions. This document provides a complete reference for all financial operations, database views, and functions.

## Table of Contents
1. [Payment Management](#payment-management)
2. [Invoice & Outstanding Management](#invoice--outstanding-management)
3. [Customer Balance Tracking](#customer-balance-tracking)
4. [Database Views](#database-views)
5. [Database Functions](#database-functions)
6. [Triggers & Automation](#triggers--automation)
7. [API Endpoints](#api-endpoints)
8. [Common Queries](#common-queries)

---

## Payment Management

### Core Concepts
- **Payment**: Money received from customers
- **Allocation**: Linking payments to specific invoices
- **Advance Payment**: Unallocated payment amount (customer credit)
- **FIFO Allocation**: Automatic allocation to oldest invoices first

### Payment Flow
1. Customer makes payment
2. Payment recorded in `financial.payments`
3. System attempts allocation to outstanding invoices
4. Unallocated amount remains as advance
5. Advance automatically allocated to future invoices

### Payment Status Types
- `cleared`: Payment successfully received
- `pending`: Payment awaiting confirmation
- `bounced`: Payment failed (e.g., cheque bounce)
- `cancelled`: Payment cancelled

### Allocation Status
- `unallocated`: No amount allocated to invoices
- `partial`: Some amount allocated, some remains
- `allocated`: Fully allocated to invoices

---

## Invoice & Outstanding Management

### Invoice Payment Status
- `pending`: No payment received
- `partial`: Partially paid
- `paid`: Fully paid
- `cancelled`: Invoice cancelled

### Customer Outstanding
The `financial.customer_outstanding` table tracks all unpaid/partially paid invoices:
- Never contains negative values
- Status: `open`, `partial`, `paid`
- Automatically updated via triggers

---

## Customer Balance Tracking

### Three Key Metrics
1. **Outstanding Amount**: What customer owes us
2. **Advance Balance**: Unallocated payments (we owe customer)
3. **Net Balance**: Outstanding - Advance (positive = customer owes)

---

## Database Views

### 1. `financial.customer_payment_history`
Complete payment history with allocation details.

**Columns:**
- `payment_id`, `customer_id`, `customer_name`
- `payment_date`, `payment_amount`
- `allocated_amount`, `unallocated_amount`
- `payment_method`, `allocation_status`
- `allocations` (JSONB array of allocation details)

**Usage:**
```sql
SELECT * FROM financial.customer_payment_history 
WHERE customer_id = 109
ORDER BY payment_date DESC;
```

### 2. `financial.customer_ledger`
All transactions (invoices, payments, credit/debit notes) with running balance.

**Columns:**
- `customer_id`, `customer_name`, `transaction_date`
- `transaction_type` (INVOICE/PAYMENT/CREDIT_NOTE/DEBIT_NOTE)
- `document_number`, `description`
- `debit_amount`, `credit_amount`
- `running_balance` (positive = customer owes)

**Usage:**
```sql
SELECT * FROM financial.customer_ledger 
WHERE customer_id = 109
ORDER BY transaction_date DESC;
```

### 3. `financial.customer_advance_balance`
Tracks unallocated payment amounts per customer.

**Columns:**
- `customer_id`, `customer_name`
- `advance_balance` (total unallocated)
- `advance_payment_count`
- `advance_payments` (JSONB array with details)

**Usage:**
```sql
SELECT * FROM financial.customer_advance_balance 
WHERE advance_balance > 0;
```

---

## Database Functions

### 1. Payment Summary
```sql
SELECT * FROM financial.get_customer_payment_summary(
    customer_id INTEGER,
    from_date DATE DEFAULT NULL,
    to_date DATE DEFAULT NULL
);
```

**Returns:**
- Total payments and count
- Allocated vs unallocated amounts
- Payment method breakdown (cash, bank, UPI, card, cheque)
- Average and max payment amounts
- Last payment details

**Example:**
```sql
-- All time summary
SELECT * FROM financial.get_customer_payment_summary(109);

-- Monthly summary
SELECT * FROM financial.get_customer_payment_summary(109, '2025-01-01', '2025-01-31');
```

### 2. Customer Balance
```sql
SELECT * FROM financial.get_customer_balance(customer_id INTEGER);
```

**Returns:**
- `total_outstanding`: What customer owes
- `total_advance`: Unallocated payments
- `net_balance`: Outstanding - Advance
- `outstanding_invoices`: Count of unpaid invoices
- `advance_payments`: Count of unallocated payments

### 3. Simple Totals
```sql
-- Total payments made
SELECT financial.get_customer_total_payments(109);

-- Total invoice amount
SELECT financial.get_customer_total_invoices(109);

-- Net position (positive = owes, negative = advance)
SELECT financial.get_customer_net_position(109);
```

---

## Triggers & Automation

### 1. `allocate_advance_payments_to_invoice()`
**Trigger:** After INSERT on `sales.invoices`
**Action:** Automatically allocates unallocated customer payments to new invoices using FIFO

### 2. `update_reference_paid_amount()`
**Trigger:** After INSERT/UPDATE/DELETE on `financial.payment_allocations`
**Action:** Updates invoice paid_amount and payment_status

### 3. `update_allocation_status()`
**Trigger:** After INSERT/UPDATE/DELETE on `financial.payment_allocations`
**Action:** Updates payment allocation_status based on allocated amount

### 4. `create_customer_outstanding_on_invoice()`
**Trigger:** After INSERT/UPDATE on `sales.invoices`
**Action:** Creates/updates customer_outstanding records

---

## API Endpoints

### Record Customer Payment
```http
POST /api/v1/customers/{customer_id}/payment
```

**Request Body:**
```json
{
  "customer_id": 109,
  "payment_date": "2025-01-04",
  "amount": 5000.00,
  "payment_mode": "cash|bank|upi|card|cheque",
  "reference_number": "PMT-001",
  "notes": "Payment notes",
  "allocate_to_invoices": [285, 286] // Optional, empty array for FIFO
}
```

**Response:**
```json
{
  "payment_id": 74,
  "customer_id": 109,
  "payment_date": "2025-01-04",
  "amount": 5000.00,
  "allocated_amount": 3000.00,
  "unallocated_amount": 2000.00,
  "payment_mode": "cash",
  "reference_number": "PMT-001"
}
```

---

## Common Queries

### 1. Customer Financial Summary
```sql
WITH summary AS (
    SELECT 
        c.customer_id,
        c.customer_name,
        financial.get_customer_total_invoices(c.customer_id) as total_invoiced,
        financial.get_customer_total_payments(c.customer_id) as total_paid,
        financial.get_customer_net_position(c.customer_id) as net_balance,
        COALESCE(cab.advance_balance, 0) as advance_balance
    FROM parties.customers c
    LEFT JOIN financial.customer_advance_balance cab ON cab.customer_id = c.customer_id
    WHERE c.customer_id = 109
)
SELECT * FROM summary;
```

### 2. Recent Payment Activity
```sql
SELECT 
    payment_date,
    payment_number,
    payment_amount,
    allocated_amount,
    unallocated_amount,
    allocation_status,
    payment_method
FROM financial.customer_payment_history
WHERE customer_id = 109
    AND payment_date >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY payment_date DESC;
```

### 3. Outstanding Invoices with Age
```sql
SELECT 
    document_number as invoice_number,
    document_date as invoice_date,
    original_amount,
    paid_amount,
    outstanding_amount,
    CURRENT_DATE - document_date as days_outstanding,
    CASE 
        WHEN CURRENT_DATE - document_date <= 30 THEN 'Current'
        WHEN CURRENT_DATE - document_date <= 60 THEN '31-60 days'
        WHEN CURRENT_DATE - document_date <= 90 THEN '61-90 days'
        ELSE 'Over 90 days'
    END as aging_bucket
FROM financial.customer_outstanding
WHERE customer_id = 109
    AND status IN ('open', 'partial')
ORDER BY document_date;
```

### 4. Payment Allocation Details
```sql
SELECT 
    p.payment_number,
    p.payment_date,
    p.payment_amount,
    pa.reference_number as invoice_number,
    pa.allocated_amount,
    pa.created_at as allocation_date
FROM financial.payments p
JOIN financial.payment_allocations pa ON p.payment_id = pa.payment_id
WHERE p.party_id = 109
    AND p.party_type = 'customer'
    AND pa.allocation_status = 'active'
ORDER BY p.payment_date DESC, pa.created_at;
```

### 5. Monthly Collection Report
```sql
SELECT 
    DATE_TRUNC('month', payment_date) as month,
    COUNT(*) as payment_count,
    SUM(payment_amount) as total_collected,
    SUM(allocated_amount) as allocated_amount,
    SUM(payment_amount - COALESCE(allocated_amount, 0)) as advance_amount
FROM financial.payments
WHERE party_type = 'customer'
    AND payment_status = 'cleared'
    AND payment_date >= DATE_TRUNC('year', CURRENT_DATE)
GROUP BY DATE_TRUNC('month', payment_date)
ORDER BY month;
```

### 6. Customers with Advance Balances
```sql
SELECT 
    customer_id,
    customer_name,
    advance_balance,
    advance_payment_count
FROM financial.customer_advance_balance
WHERE advance_balance > 0
ORDER BY advance_balance DESC;
```

---

## Important Notes

### Payment Allocation Rules
1. **Manual Allocation**: When specific invoice IDs are provided
2. **FIFO Allocation**: When no invoices specified, allocates to oldest first
3. **Advance Payments**: Automatically allocated when new invoices are created
4. **Validation**: Cannot allocate more than payment amount or invoice amount

### Data Integrity
- All financial calculations happen in the database via triggers
- Frontend displays data but doesn't perform critical calculations
- Payment allocations are immutable once created (only status can change)
- Customer outstanding never shows negative values

### Best Practices
1. Always use database functions for calculations
2. Never hardcode branch_id or user_id values
3. Use FIFO allocation by default for better cash flow
4. Regular reconciliation using ledger views
5. Monitor advance balances to avoid excess customer credit

---

## Troubleshooting

### Common Issues

1. **Payment not allocating to invoices**
   - Check if customer has outstanding invoices in `customer_outstanding`
   - Verify payment status is 'cleared'
   - Check allocation triggers are enabled

2. **Double allocation error**
   - Check for circular trigger chains
   - Verify allocation doesn't already exist
   - Review trigger execution order

3. **Incorrect balances**
   - Run reconciliation query comparing ledger to payment/invoice totals
   - Check for cancelled/reversed transactions
   - Verify all triggers are active

### Reconciliation Query
```sql
SELECT 
    c.customer_id,
    c.customer_name,
    -- From invoices
    (SELECT SUM(final_amount) FROM sales.invoices 
     WHERE customer_id = c.customer_id AND invoice_status != 'cancelled') as invoice_total,
    -- From payments
    (SELECT SUM(payment_amount) FROM financial.payments 
     WHERE party_id = c.customer_id AND party_type = 'customer' 
     AND payment_status = 'cleared') as payment_total,
    -- Net position
    financial.get_customer_net_position(c.customer_id) as calculated_balance
FROM parties.customers c
WHERE c.customer_id = 109;
```

---

## Version History
- **v1.0** (2025-01-04): Initial documentation
- Payment allocation system with FIFO
- Advance balance tracking
- Comprehensive views and functions
- Auto-allocation triggers

---

## Contact & Support
For issues or questions regarding the Financial Hub, please refer to the technical team or create an issue in the repository.