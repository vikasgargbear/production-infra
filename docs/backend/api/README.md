# API Reference

Complete REST API documentation for the Pharmacy Management System.

---

## Overview

This API provides programmatic access to all pharmacy management operations including sales, purchases, inventory, and financial data.

### Base URL

```
Production:  https://api.yourdomain.com
Staging:     https://staging-api.yourdomain.com
Local:       http://localhost:8000
```

### API Version

Current version: **v1** (implicit in all endpoints)

```http
GET /api/invoices
```

---

## Quick Start

### 1. Authenticate

```bash
curl -X POST https://api.yourdomain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "user@example.com", "password": "your-password"}'
```

### 2. Use the Token

```bash
curl https://api.yourdomain.com/api/invoices \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## Authentication

All API requests require authentication via JWT bearer tokens.

### Obtaining Tokens

```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "user@example.com",
  "password": "your-password"
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 3600
}
```

### Using Tokens

Include the access token in the `Authorization` header:

```http
Authorization: Bearer <access_token>
```

### Token Refresh

```http
POST /api/auth/refresh
Content-Type: application/json

{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Token Expiration

| Token Type | Expiration |
|------------|------------|
| Access Token | 1 hour |
| Refresh Token | 7 days |

---

## Request Format

### Headers

| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | Yes | Bearer token for authentication |
| `Content-Type` | Yes* | `application/json` for POST/PUT requests |
| `X-Request-ID` | No | Client-provided request ID for tracing |

### Pagination

List endpoints support pagination:

```http
GET /api/invoices?limit=20&offset=0
```

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `limit` | integer | 50 | 200 | Number of records per page |
| `offset` | integer | 0 | — | Number of records to skip |

### Filtering

Most list endpoints support filtering:

```http
GET /api/invoices?customer_id=123&status=pending&date_from=2026-01-01
```

### Sorting

```http
GET /api/invoices?sort_by=invoice_date&sort_order=desc
```

---

## Response Format

### Success Response

```json
{
  "success": true,
  "data": {
    "invoice_id": 1234,
    "invoice_number": "INV-2026-0001",
    ...
  }
}
```

### List Response

```json
{
  "success": true,
  "data": [...],
  "total": 150,
  "limit": 20,
  "offset": 0,
  "has_more": true
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid customer_id",
    "details": [
      {
        "field": "customer_id",
        "message": "Customer not found"
      }
    ]
  }
}
```

---

## Error Codes

### HTTP Status Codes

| Code | Name | Description |
|------|------|-------------|
| `200` | OK | Request succeeded |
| `201` | Created | Resource created successfully |
| `400` | Bad Request | Invalid request parameters |
| `401` | Unauthorized | Missing or invalid authentication |
| `403` | Forbidden | Insufficient permissions |
| `404` | Not Found | Resource not found |
| `409` | Conflict | Resource conflict (e.g., duplicate) |
| `422` | Unprocessable | Validation error |
| `429` | Too Many Requests | Rate limit exceeded |
| `500` | Server Error | Internal server error |

### Application Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `AUTH_INVALID_CREDENTIALS` | 401 | Invalid username or password |
| `AUTH_TOKEN_EXPIRED` | 401 | Access token has expired |
| `AUTH_INSUFFICIENT_PERMISSIONS` | 403 | User lacks required permission |
| `VALIDATION_ERROR` | 422 | Request validation failed |
| `RESOURCE_NOT_FOUND` | 404 | Requested resource not found |
| `RESOURCE_CONFLICT` | 409 | Resource already exists |
| `INSUFFICIENT_STOCK` | 400 | Not enough inventory |
| `CREDIT_LIMIT_EXCEEDED` | 400 | Customer credit limit exceeded |
| `DOCUMENT_ALREADY_POSTED` | 400 | Cannot modify posted document |

---

## Rate Limits

| Endpoint Type | Limit | Window |
|---------------|-------|--------|
| Authentication | 10 | per minute |
| Read (GET) | 1000 | per minute |
| Write (POST/PUT/DELETE) | 100 | per minute |
| Bulk operations | 10 | per minute |
| Reports | 30 | per minute |

Rate limit headers in response:

```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1704672000
```

---

## API Modules

### Core Business

| Module | Prefix | Description |
|--------|--------|-------------|
| [Sales](sales/) | `/api/sales` | Orders, invoices, challans |
| [Purchase](purchase/) | `/api/purchase` | PO, GRN, supplier invoices |
| [Inventory](inventory/) | `/api/inventory` | Stock, batches, movements |
| [Finance](finance/) | `/api/finance` | Payments, ledger, credit notes |
| [Master](master/) | `/api/master` | Products, customers, suppliers |
| [Returns](returns/) | `/api/returns` | Sales and purchase returns |

### System

| Module | Prefix | Description |
|--------|--------|-------------|
| [Auth](auth/) | `/api/auth` | Authentication and users |
| Reports | `/api/reports` | Dashboard and analytics |
| Sync | `/api/sync` | Mobile data synchronization |
| Settings | `/api/settings` | Organization settings |

---

## Interactive Documentation

When running locally, interactive documentation is available:

| Format | URL |
|--------|-----|
| Swagger UI | http://localhost:8000/docs |
| ReDoc | http://localhost:8000/redoc |
| OpenAPI JSON | http://localhost:8000/openapi.json |

---

## SDKs & Tools

### cURL Examples

All documentation includes cURL examples for quick testing.

### Postman Collection

Import our Postman collection for easy API exploration:
- Download: [Pharmacy-API.postman_collection.json](./postman/)

---

## Guides

| Guide | Description |
|-------|-------------|
| [SDK Examples](sdk-examples.md) | Python & JavaScript code examples |
| [Testing Guide](testing.md) | Local setup, Postman, automated tests |
| [Idempotency](idempotency.md) | Safe retries and duplicate prevention |
| [Webhooks](webhooks.md) | Real-time event notifications |
| [Best Practices](best-practices.md) | Security, performance, error handling |
| [Error Reference](errors.md) | Complete error code reference |

---

## Changelog

### 2026-01-09
- Added SDK examples (Python, JavaScript)
- Added testing guide with Postman and automated tests
- Added idempotency documentation
- Added webhooks documentation
- Added best practices guide

### 2026-01-08
- Initial enterprise documentation release
- Complete Sales, Purchase, Inventory, Finance API docs

---

## Support

For API support, contact:
- **Email**: api-support@yourdomain.com
- **Documentation Issues**: Open a GitHub issue

---

**Next**: [Authentication Details](auth/) · [Sales API](sales/) · [SDK Examples](sdk-examples.md)

