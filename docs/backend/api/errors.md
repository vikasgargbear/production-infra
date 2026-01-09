# Error Reference

Complete list of API error codes and handling guidance.

---

## Error Response Format

All API errors follow a consistent format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": [
      {
        "field": "field_name",
        "message": "Field-specific error"
      }
    ]
  }
}
```

---

## HTTP Status Codes

| Code | Name | When Used |
|------|------|-----------|
| `200` | OK | Successful GET/PUT/DELETE |
| `201` | Created | Successful POST creating resource |
| `204` | No Content | Successful DELETE with no body |
| `400` | Bad Request | Invalid request format/parameters |
| `401` | Unauthorized | Missing/invalid authentication |
| `403` | Forbidden | Valid auth but insufficient permissions |
| `404` | Not Found | Resource doesn't exist |
| `409` | Conflict | Resource conflict (duplicate, version mismatch) |
| `422` | Unprocessable Entity | Validation error |
| `429` | Too Many Requests | Rate limit exceeded |
| `500` | Internal Server Error | Unexpected server error |
| `503` | Service Unavailable | Maintenance or overload |

---

## Authentication Errors

| Code | HTTP | Description | Resolution |
|------|------|-------------|------------|
| `AUTH_INVALID_CREDENTIALS` | 401 | Invalid username/password | Verify credentials |
| `AUTH_TOKEN_EXPIRED` | 401 | Access token has expired | Refresh token or re-login |
| `AUTH_TOKEN_INVALID` | 401 | Malformed or invalid token | Re-authenticate |
| `AUTH_TOKEN_REVOKED` | 401 | Token has been revoked | Re-authenticate |
| `AUTH_INSUFFICIENT_PERMISSIONS` | 403 | User lacks required permission | Contact admin for access |
| `AUTH_ACCOUNT_LOCKED` | 403 | Account locked due to failed attempts | Wait or contact admin |
| `AUTH_ACCOUNT_DISABLED` | 403 | Account has been disabled | Contact admin |
| `AUTH_PASSWORD_EXPIRED` | 403 | Password must be changed | Change password |
| `AUTH_MFA_REQUIRED` | 403 | Multi-factor auth required | Complete MFA |

---

## Validation Errors

| Code | HTTP | Description | Resolution |
|------|------|-------------|------------|
| `VALIDATION_ERROR` | 422 | Request validation failed | Check `details` for field errors |
| `INVALID_DATE_FORMAT` | 422 | Date format invalid | Use YYYY-MM-DD format |
| `INVALID_AMOUNT` | 422 | Amount must be positive | Provide valid amount |
| `INVALID_QUANTITY` | 422 | Quantity must be positive | Provide valid quantity |
| `INVALID_GSTIN` | 422 | Invalid GSTIN format | Provide valid 15-char GSTIN |
| `INVALID_PAN` | 422 | Invalid PAN format | Provide valid 10-char PAN |
| `MISSING_REQUIRED_FIELD` | 422 | Required field missing | Provide all required fields |

---

## Resource Errors

| Code | HTTP | Description | Resolution |
|------|------|-------------|------------|
| `RESOURCE_NOT_FOUND` | 404 | Requested resource not found | Verify resource ID |
| `CUSTOMER_NOT_FOUND` | 404 | Customer ID doesn't exist | Verify customer_id |
| `SUPPLIER_NOT_FOUND` | 404 | Supplier ID doesn't exist | Verify supplier_id |
| `PRODUCT_NOT_FOUND` | 404 | Product ID doesn't exist | Verify product_id |
| `BATCH_NOT_FOUND` | 404 | Batch ID doesn't exist | Verify batch_id |
| `INVOICE_NOT_FOUND` | 404 | Invoice ID doesn't exist | Verify invoice_id |
| `ORDER_NOT_FOUND` | 404 | Order ID doesn't exist | Verify order_id |
| `PO_NOT_FOUND` | 404 | Purchase order not found | Verify po_id |
| `GRN_NOT_FOUND` | 404 | GRN ID doesn't exist | Verify grn_id |
| `PAYMENT_NOT_FOUND` | 404 | Payment ID doesn't exist | Verify payment_id |

---

## Business Logic Errors

### Inventory Errors

| Code | HTTP | Description | Resolution |
|------|------|-------------|------------|
| `INSUFFICIENT_STOCK` | 400 | Not enough available stock | Reduce quantity or wait for restock |
| `BATCH_EXPIRED` | 400 | Batch has expired | Select different batch |
| `BATCH_RECALLED` | 400 | Batch has been recalled | Select different batch |
| `BATCH_RESERVED` | 400 | Stock already reserved | Wait or cancel reservation |
| `NEGATIVE_STOCK_NOT_ALLOWED` | 400 | Would result in negative stock | Check available quantity |

### Sales Errors

| Code | HTTP | Description | Resolution |
|------|------|-------------|------------|
| `CREDIT_LIMIT_EXCEEDED` | 400 | Customer credit limit exceeded | Collect payment or increase limit |
| `DUPLICATE_INVOICE_NUMBER` | 409 | Invoice number already exists | Generate new number |
| `INVOICE_ALREADY_CANCELLED` | 400 | Invoice already cancelled | No action needed |
| `INVOICE_HAS_PAYMENTS` | 400 | Cannot cancel invoice with payments | Reverse payments first |
| `DOCUMENT_ALREADY_POSTED` | 400 | Cannot modify posted document | Cancel and recreate |
| `ORDER_ALREADY_INVOICED` | 400 | Order fully converted to invoice | No further action |

### Purchase Errors

| Code | HTTP | Description | Resolution |
|------|------|-------------|------------|
| `PO_ALREADY_COMPLETE` | 400 | PO fully received | No further GRN possible |
| `QUANTITY_EXCEEDS_ORDERED` | 400 | Receiving more than ordered | Reduce quantity |
| `BATCH_ALREADY_EXISTS` | 409 | Batch number exists for product | Use different batch number |
| `DUPLICATE_INVOICE` | 409 | Supplier invoice already exists | Verify invoice number |

### Payment Errors

| Code | HTTP | Description | Resolution |
|------|------|-------------|------------|
| `INSUFFICIENT_BALANCE` | 400 | Not enough unallocated amount | Check available balance |
| `ALLOCATION_EXCEEDS_OUTSTANDING` | 400 | Allocation exceeds invoice balance | Reduce allocation amount |
| `PAYMENT_ALREADY_CANCELLED` | 400 | Payment already cancelled | No action needed |
| `PAYMENT_ALREADY_ALLOCATED` | 400 | Cannot cancel allocated payment | Deallocate first |

### Return Errors

| Code | HTTP | Description | Resolution |
|------|------|-------------|------------|
| `ITEM_NOT_RETURNABLE` | 400 | Item cannot be returned | Check return policy |
| `QUANTITY_EXCEEDS_LIMIT` | 400 | Return qty exceeds available | Reduce quantity |
| `ALREADY_FULLY_RETURNED` | 400 | Item already fully returned | No action needed |
| `RETURN_PERIOD_EXPIRED` | 400 | Return period has expired | Contact admin |

---

## Rate Limiting Errors

| Code | HTTP | Description | Resolution |
|------|------|-------------|------------|
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests | Wait and retry |

### Rate Limit Headers

```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1704672000
Retry-After: 60
```

---

## Error Handling Best Practices

### 1. Check HTTP Status First

```javascript
if (response.status === 401) {
  // Redirect to login
  return redirectToLogin();
}

if (response.status === 403) {
  // Show permission error
  return showPermissionError();
}
```

### 2. Parse Error Response

```javascript
const data = await response.json();
if (!data.success) {
  const error = data.error;
  
  switch (error.code) {
    case 'INSUFFICIENT_STOCK':
      showStockError(error.message);
      break;
    case 'VALIDATION_ERROR':
      showFieldErrors(error.details);
      break;
    default:
      showGenericError(error.message);
  }
}
```

### 3. Handle Retryable Errors

```javascript
if (response.status === 429 || response.status === 503) {
  const retryAfter = response.headers.get('Retry-After');
  await delay(retryAfter * 1000);
  return retry(request);
}
```

### 4. Log Errors for Debugging

```javascript
console.error({
  code: error.code,
  message: error.message,
  requestId: response.headers.get('X-Request-ID'),
  timestamp: new Date().toISOString()
});
```

---

## See Also

- [API Reference](README.md)
- [Authentication](auth/)

---

**Next**: [Sales API](sales/) · [Purchase API](purchase/)
