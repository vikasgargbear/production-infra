# Finance API

Complete API reference for financial operations including payments, ledger, and credit notes.

---

## Overview

The Finance API manages all financial transactions including customer payments, supplier payments, ledger entries, and credit/debit notes.

### Base Path

```
/api/finance
```

### Sub-modules

| Module | Path | Description |
|--------|------|-------------|
| [Payments](#payments) | `/payments` | Payment management |
| [Ledger](#ledger) | `/ledger` | Account statements |
| [Credit Notes](#credit-notes) | `/credit-notes` | Customer credit notes |
| [Debit Notes](#debit-notes) | `/debit-notes` | Supplier debit notes |
| [Outstanding](#outstanding) | `/outstanding` | Receivables/payables |

---

# Payments

Handle customer receipts and supplier payments.

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/payments` | Create payment |
| `GET` | `/payments` | List payments |
| `GET` | `/payments/{payment_id}` | Get payment details |
| `POST` | `/payments/{payment_id}/allocate` | Allocate to invoices |
| `POST` | `/payments/{payment_id}/cancel` | Cancel payment |

---

## Create Payment

Records a customer receipt or supplier payment.

```http
POST /api/finance/payments
```

### Request Body

```json
{
  "payment_date": "2026-01-08",
  "payment_type": "receipt",
  "party_type": "customer",
  "party_id": 123,
  "payment_amount": 5000.00,
  "payment_method": "upi",
  "reference_number": "UPI123456789",
  "allocations": [
    {
      "reference_type": "invoice",
      "reference_id": 1001,
      "allocated_amount": 4500.00,
      "discount_amount": 0
    }
  ],
  "narration": "Payment received against INV-2026-0001"
}
```

### Request Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `payment_date` | date | Yes | Payment date |
| `payment_type` | string | Yes | `receipt` or `payment` |
| `party_type` | string | Yes | `customer` or `supplier` |
| `party_id` | integer | Yes | Customer/Supplier ID |
| `payment_amount` | number | Yes | Total payment amount |
| `payment_method` | string | Yes | `cash`, `upi`, `cheque`, `rtgs`, `neft` |
| `reference_number` | string | No | Cheque#/UTR# |
| `allocations` | array | No | Invoice allocations |

### Response

```json
{
  "success": true,
  "data": {
    "payment_id": 601,
    "payment_number": "PAY-2026-0001",
    "payment_date": "2026-01-08",
    "payment_type": "receipt",
    "party_name": "ABC Pharmacy",
    "payment_amount": 5000.00,
    "payment_method": "upi",
    "payment_status": "cleared",
    "allocation_status": "partial",
    "allocated_amount": 4500.00,
    "unallocated_amount": 500.00,
    "created_at": "2026-01-08T11:00:00Z"
  }
}
```

### Example

```bash
curl -X POST https://api.yourdomain.com/api/finance/payments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "payment_date": "2026-01-08",
    "payment_type": "receipt",
    "party_type": "customer",
    "party_id": 123,
    "payment_amount": 5000.00,
    "payment_method": "upi",
    "reference_number": "UPI123456789"
  }'
```

---

## Allocate Payment

Allocates unallocated payment amount to invoices.

```http
POST /api/finance/payments/{payment_id}/allocate
```

### Request Body

```json
{
  "allocations": [
    {
      "reference_type": "invoice",
      "reference_id": 1002,
      "allocated_amount": 500.00,
      "discount_amount": 25.00
    }
  ]
}
```

### Response

```json
{
  "success": true,
  "data": {
    "payment_id": 601,
    "allocation_status": "full",
    "allocated_amount": 5000.00,
    "unallocated_amount": 0,
    "allocations": [
      {
        "allocation_id": 701,
        "reference_type": "invoice",
        "reference_number": "INV-2026-0001",
        "allocated_amount": 4500.00
      },
      {
        "allocation_id": 702,
        "reference_type": "invoice",
        "reference_number": "INV-2026-0002",
        "allocated_amount": 500.00
      }
    ]
  }
}
```

---

# Ledger

Customer and supplier account statements.

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/ledger/customer/{customer_id}` | Customer statement |
| `GET` | `/ledger/supplier/{supplier_id}` | Supplier statement |
| `GET` | `/ledger/summary` | Ledger summary |

---

## Customer Ledger

Returns complete account statement for a customer.

```http
GET /api/finance/ledger/customer/{customer_id}
```

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `date_from` | date | Start date |
| `date_to` | date | End date |
| `include_pending` | boolean | Include pending transactions |

### Response

```json
{
  "success": true,
  "data": {
    "customer_id": 123,
    "customer_name": "ABC Pharmacy",
    "opening_balance": 10000.00,
    "total_debits": 25000.00,
    "total_credits": 20000.00,
    "closing_balance": 15000.00,
    "transactions": [
      {
        "date": "2026-01-05",
        "type": "invoice",
        "reference": "INV-2026-0001",
        "debit": 5000.00,
        "credit": 0,
        "balance": 15000.00,
        "narration": "Sales invoice"
      },
      {
        "date": "2026-01-08",
        "type": "receipt",
        "reference": "PAY-2026-0001",
        "debit": 0,
        "credit": 5000.00,
        "balance": 10000.00,
        "narration": "Payment received - UPI"
      }
    ]
  }
}
```

---

# Outstanding

Receivables and payables management.

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/outstanding/receivables` | Customer receivables |
| `GET` | `/outstanding/payables` | Supplier payables |
| `GET` | `/outstanding/aging` | Aging analysis |
| `GET` | `/outstanding/customer/{customer_id}` | Customer outstanding |

---

## Receivables Summary

Returns summary of all outstanding receivables.

```http
GET /api/finance/outstanding/receivables
```

### Response

```json
{
  "success": true,
  "data": {
    "total_outstanding": 1250000.00,
    "total_overdue": 350000.00,
    "aging_summary": {
      "current": 450000.00,
      "days_1_30": 350000.00,
      "days_31_60": 200000.00,
      "days_61_90": 150000.00,
      "days_90_plus": 100000.00
    },
    "top_outstanding": [
      {
        "customer_id": 123,
        "customer_name": "ABC Pharmacy",
        "outstanding": 75000.00,
        "overdue": 25000.00,
        "oldest_invoice_days": 45
      }
    ]
  }
}
```

---

## Aging Analysis

Detailed aging report with configurable buckets.

```http
GET /api/finance/outstanding/aging
```

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `party_type` | string | `customer` or `supplier` |
| `as_of_date` | date | Aging as of date |

### Response

```json
{
  "success": true,
  "data": [
    {
      "party_id": 123,
      "party_name": "ABC Pharmacy",
      "current": 10000.00,
      "days_1_30": 15000.00,
      "days_31_60": 5000.00,
      "days_61_90": 0,
      "days_90_plus": 0,
      "total": 30000.00
    }
  ]
}
```

---

# Credit Notes

Customer credit note management for returns.

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/credit-notes` | Create credit note |
| `GET` | `/credit-notes` | List credit notes |
| `GET` | `/credit-notes/{cn_id}` | Get credit note |
| `POST` | `/credit-notes/{cn_id}/apply` | Apply to invoice |

---

## Create Credit Note

Creates a credit note for a sales return.

```http
POST /api/finance/credit-notes
```

### Request Body

```json
{
  "credit_note_date": "2026-01-08",
  "customer_id": 123,
  "return_id": 101,
  "items": [
    {
      "product_id": 456,
      "quantity": 5,
      "unit_price": 45.50,
      "cgst_rate": 6.0,
      "sgst_rate": 6.0
    }
  ],
  "reason": "Goods returned - near expiry"
}
```

---

## Error Codes

| Code | Description |
|------|-------------|
| `CUSTOMER_NOT_FOUND` | Customer does not exist |
| `SUPPLIER_NOT_FOUND` | Supplier does not exist |
| `INVOICE_NOT_FOUND` | Invoice does not exist |
| `PAYMENT_NOT_FOUND` | Payment does not exist |
| `INSUFFICIENT_BALANCE` | Not enough unallocated amount |
| `ALLOCATION_EXCEEDS_OUTSTANDING` | Allocation exceeds invoice balance |
| `PAYMENT_ALREADY_CANCELLED` | Payment already cancelled |
| `CREDIT_NOTE_EXISTS` | Credit note already exists for return |

---

## See Also

- [Canonical field dictionary](../../../architecture/canonical-field-dictionary.json)
- [Finance Services](../../services/finance/)
- [Sales API](../sales/) · [Returns API](../returns/)

---

**Next**: [Master API](../master/) · [Auth API](../auth/)
