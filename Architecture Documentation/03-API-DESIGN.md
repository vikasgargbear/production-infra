# API Design Standards
## RESTful API Conventions & Best Practices

**Version:** 2.0  
**Date:** 2025-12-06

---

## Core Principles

### 1. Database Names Everywhere
```python
# ✅ CORRECT - Use database field names
{
  "gst_number": "27XXXXX...",
  "primary_email": "abc@example.com",
  "contact_person_name": "John Doe"
}

# ❌ WRONG - Don't rename/alias
{
  "gstin": "27XXXXX...",      # Alias
  "email": "abc@example.com",  # Alias
  "contact_person": "John Doe" # Alias
}
```

### 2. Complete Data Always
```python
# ✅ CORRECT - Return ALL database fields
@router.get("/{customer_id}")
def get_customer(customer_id: int):
    return {
        # ALL 59 fields from database
        "customer_id": 1,
        "customer_name": "ABC Pharmacy",
        "drug_license_number": "DL-12345",
        "loyalty_points": 1250,
        # ... all 59 fields
    }

# ❌ WRONG - Selective fields
def get_customer(customer_id: int):
    return {
        "customer_id": 1,
        "customer_name": "ABC Pharmacy",
        # Missing 44+ fields
    }
```

### 3. Backend Does JOINs
```python
# ✅ CORRECT - JOIN in query
SELECT b.*, p.product_name, p.gst_percent
FROM batches b
INNER JOIN products p ON b.product_id = p.product_id

# ❌ WRONG - Subqueries
SELECT b.*,
  (SELECT product_name FROM products WHERE id = b.product_id)
FROM batches b
```

### 4. Consistent Response Format
```python
# ✅ CORRECT - Standard structure
{
  "data": { ... },           # Main data
  "meta": {                  # Optional metadata
    "total": 100,
    "page": 1,
    "per_page": 20
  }
}

# For lists
{
  "data": [ ... ],
  "total": 100,
  "page": 1,
  "per_page": 20
}
```

---

## URL Patterns

### Resource Naming
```
✅ Plural nouns for collections
GET  /api/customers
GET  /api/products
GET  /api/batches

✅ ID for specific resource
GET  /api/customers/123
PUT  /api/customers/123
DELETE /api/customers/123

✅ Actions as sub-resources
POST /api/invoices/123/send-email
POST /api/customers/123/apply-discount

❌ Avoid verbs in URLs
GET /api/getCustomer?id=123      # Wrong
GET /api/customers/123            # Correct
```

### Query Parameters
```
✅ Filtering
GET /api/customers?customer_type=retail
GET /api/batches?product_id=123&expired=false

✅ Pagination
GET /api/customers?page=1&limit=20
GET /api/customers?skip=0&limit=20

✅ Sorting
GET /api/customers?sort_by=customer_name&order=asc

✅ Search
GET /api/customers?search=ABC+Pharmacy
GET /api/products?q=paracetamol

✅ Filtering by multiple values
GET /api/customers?customer_type=retail,wholesale
GET /api/products?category_id=1,2,3

❌ Don't use complex nested structures
GET /api/customers?filter[type][eq]=retail  # Too complex
GET /api/customers?customer_type=retail      # Simple & clear
```

---

## HTTP Methods

### Standard CRUD Operations
```python
# CREATE
POST /api/customers
Body: { "customer_name": "...", ... }
Response: 201 Created
{
  "data": { "customer_id": 123, ... },
  "message": "Customer created successfully"
}

# READ (Single)
GET /api/customers/123
Response: 200 OK
{
  "data": { "customer_id": 123, ... }
}

# READ (List)
GET /api/customers?limit=20
Response: 200 OK
{
  "data": [ ... ],
  "total": 100,
  "page": 1,
  "per_page": 20
}

# UPDATE (Full)
PUT /api/customers/123
Body: { "customer_name": "...", ... }  # All fields
Response: 200 OK
{
  "data": { "customer_id": 123, ... },
  "message": "Customer updated successfully"
}

# UPDATE (Partial)
PATCH /api/customers/123
Body: { "credit_limit": 50000 }  # Only changed fields
Response: 200 OK

# DELETE
DELETE /api/customers/123
Response: 204 No Content
or
Response: 200 OK
{
  "message": "Customer deleted successfully"
}
```

---

## Request Headers

### Required Headers
```http
# Authentication (Always required)
Authorization: Bearer <JWT_TOKEN>

# Organization Context (Always required)
X-Organization-ID: <ORG_UUID>

# Content Type (for POST/PUT/PATCH)
Content-Type: application/json

# Accept (optional but recommended)
Accept: application/json
```

### Example Request
```bash
curl -X GET \
  https://api.example.com/api/customers/123 \
  -H "Authorization: Bearer eyJhbGci..." \
  -H "X-Organization-ID: 550e8400-e29b-41d4-a716-446655440000" \
  -H "Accept: application/json"
```

---

## Response Status Codes

### Success Codes
```
200 OK              - Successful GET, PUT, PATCH
201 Created         - Successful POST
204 No Content      - Successful DELETE (no body)
```

### Client Error Codes
```
400 Bad Request     - Invalid request body/parameters
401 Unauthorized    - Missing/invalid authentication
403 Forbidden       - No permission for this resource
404 Not Found       - Resource doesn't exist
422 Unprocessable   - Validation errors
429 Too Many Req    - Rate limit exceeded
```

### Server Error Codes
```
500 Internal Error  - Server-side error
502 Bad Gateway     - Backend service unavailable
503 Service Unavail - Temporary unavailability
```

---

## Error Response Format

### Standard Error Structure
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid customer data",
    "details": [
      {
        "field": "primary_phone",
        "message": "Must be 10 digits",
        "value": "12345"
      },
      {
        "field": "gst_number",
        "message": "Invalid GSTIN format",
        "value": "INVALID"
      }
    ]
  },
  "timestamp": "2025-12-06T10:30:00Z",
  "path": "/api/customers",
  "request_id": "req_abc123"
}
```

### Pydantic Validation Errors (422)
```json
{
  "detail": [
    {
      "loc": ["body", "primary_phone"],
      "msg": "string does not match regex pattern",
      "type": "value_error.str.regex"
    }
  ]
}
```

### Business Logic Errors (400)
```json
{
  "error": {
    "code": "INSUFFICIENT_CREDIT",
    "message": "Customer credit limit exceeded",
    "details": {
      "credit_limit": 50000,
      "current_outstanding": 45000,
      "attempted_amount": 10000,
      "available_credit": 5000
    }
  }
}
```

---

## Field Naming Conventions

### Standard Rules
```python
# ✅ Use snake_case (database standard)
customer_name
primary_phone
gst_number
credit_limit

# ❌ Don't use camelCase
customerName     # Wrong
primaryPhone     # Wrong

# ❌ Don't use aliases
gstin           # Use gst_number
email           # Use primary_email
```

### Date/Time Fields
```python
# ✅ Always ISO 8601 format
{
  "created_at": "2025-12-06T10:30:00Z",      # UTC timestamp
  "invoice_date": "2025-12-06",              # Date only
  "expiry_date": "2027-06-30"
}

# ❌ Don't use custom formats
{
  "created_at": "06/12/2025 10:30 AM",      # Wrong
  "invoice_date": "06-Dec-2025"              # Wrong
}
```

### Boolean Fields
```python
# ✅ Use is_ or has_ prefix
is_active
is_deleted
has_prescription
requires_prescription

# ✅ Return actual booleans
{
  "is_active": true,
  "blacklisted": false
}

# ❌ Don't use strings or numbers
{
  "is_active": "true",    # Wrong
  "blacklisted": 0        # Wrong
}
```

### Numeric Fields
```python
# ✅ Use decimal/float for currency
{
  "credit_limit": 50000.00,
  "current_outstanding": 25000.50
}

# ✅ Use integers for counts
{
  "total_transactions": 45,
  "quantity_available": 100
}

# ❌ Don't use strings
{
  "credit_limit": "50000.00"    # Wrong
}
```

---

## Pagination

### Standard Pagination
```python
# Request
GET /api/customers?page=1&limit=20

# Response
{
  "data": [ ... ],
  "total": 250,           # Total records
  "page": 1,              # Current page
  "per_page": 20,         # Records per page
  "total_pages": 13,      # Total pages
  "has_next": true,       # Has next page
  "has_prev": false       # Has previous page
}
```

### Offset-Based Pagination
```python
# Request
GET /api/customers?skip=40&limit=20

# Response
{
  "data": [ ... ],
  "total": 250,
  "skip": 40,
  "limit": 20
}
```

### Cursor-Based Pagination (for real-time data)
```python
# Request
GET /api/transactions?cursor=abc123&limit=20

# Response
{
  "data": [ ... ],
  "next_cursor": "xyz789",
  "has_more": true
}
```

---

## Filtering & Search

### Basic Filtering
```python
# Exact match
GET /api/customers?customer_type=retail

# Multiple values (OR)
GET /api/customers?customer_type=retail,wholesale

# Range
GET /api/customers?credit_limit_min=10000&credit_limit_max=50000

# Boolean
GET /api/customers?is_active=true
GET /api/batches?expired=false
```

### Search
```python
# Full-text search
GET /api/customers?search=ABC+Pharmacy

# Field-specific search
GET /api/customers?name_contains=pharmacy
GET /api/products?code_starts_with=MED

# Multiple fields search
GET /api/customers?q=9999999999  # Searches name, phone, code
```

### Sorting
```python
# Single field
GET /api/customers?sort_by=customer_name&order=asc

# Multiple fields
GET /api/batches?sort_by=expiry_date,batch_number&order=asc,desc
```

---

## Data Relationships

### Inline Expansion
```python
# Without expansion
GET /api/batches/123
{
  "batch_id": 123,
  "product_id": 456,
  "batch_number": "B001"
}

# With expansion (using JOIN)
GET /api/batches/123
{
  "batch_id": 123,
  "product_id": 456,
  "batch_number": "B001",
  # Product fields from JOIN ✅
  "product_name": "Paracetamol 500mg",
  "gst_percent": 12.0,
  "manufacturer": "ABC Pharma"
}
```

### Nested Objects
```python
# Customer with addresses (from JOIN)
{
  "customer_id": 123,
  "customer_name": "ABC Pharmacy",
  "addresses": [
    {
      "address_id": 1,
      "address_type": "billing",
      "address_line1": "123 Main St",
      "city": "Mumbai",
      "state_code": "27"
    }
  ]
}
```

---

## Versioning

### URL Versioning (Current)
```
/api/v1/customers
/api/v2/customers  # When breaking changes needed
```

### Header Versioning (Future)
```http
API-Version: 2025-12-06
Accept-Version: 2.0
```

### Deprecation
```http
# Response headers for deprecated endpoints
Deprecation: true
Sunset: Wed, 31 Dec 2025 23:59:59 GMT
Link: </api/v2/customers>; rel="successor-version"
```

---

## Rate Limiting

### Headers
```http
# Response headers
X-RateLimit-Limit: 1000          # Requests per hour
X-RateLimit-Remaining: 999       # Remaining requests
X-RateLimit-Reset: 1638835200    # Unix timestamp

# When limit exceeded (429)
Retry-After: 3600                # Seconds until reset
```

---

## Security

### Authentication
```python
# JWT Bearer token (current)
Authorization: Bearer <JWT_TOKEN>

# Token structure
{
  "user_id": 123,
  "org_id": "550e8400-e29b-41d4-a716-446655440000",
  "exp": 1638835200,
  "iat": 1638831600
}
```

### Authorization
```python
# Row-Level Security (RLS) at database level
# Enforced by org_id in JWT

# Backend validates:
1. Token is valid (not expired)
2. User has access to org_id
3. Resource belongs to user's org_id
```

### Sensitive Data
```python
# ✅ Never expose in responses
password_hash
api_secret_key
internal_notes (customer-facing APIs)

# ✅ Mask in logs
"phone": "999999****"
"gst_number": "27XXXXX1234Z"
```

---

## Caching

### Cache Headers
```http
# Response headers
Cache-Control: max-age=3600, public
ETag: "abc123xyz"
Last-Modified: Wed, 06 Dec 2025 10:30:00 GMT

# Conditional requests
If-None-Match: "abc123xyz"
If-Modified-Since: Wed, 06 Dec 2025 10:30:00 GMT

# Response for unchanged
304 Not Modified
```

---

## Documentation Standards

### OpenAPI/Swagger
```python
# All endpoints must have:
@router.get(
    "/{customer_id}",
    response_model=CustomerResponse,
    summary="Get customer details",
    description="Returns complete customer data with all 59 fields",
    responses={
        200: {"description": "Customer found"},
        404: {"description": "Customer not found"}
    }
)
async def get_customer(customer_id: int):
    ...
```

### Example Responses
```python
# Always provide examples in schema
class CustomerResponse(BaseModel):
    customer_id: int = Field(..., example=123)
    customer_name: str = Field(..., example="ABC Pharmacy")
    drug_license_number: Optional[str] = Field(None, example="DL-12345")
    
    class Config:
        schema_extra = {
            "example": {
                "customer_id": 123,
                "customer_name": "ABC Pharmacy",
                "drug_license_number": "DL-12345",
                # ... full example
            }
        }
```

---

## Testing Endpoints

### Test Checklist
```bash
# 1. Happy path
curl -X GET /api/customers/123

# 2. Not found
curl -X GET /api/customers/999999

# 3. Unauthorized
curl -X GET /api/customers/123  # No auth header

# 4. Invalid input
curl -X POST /api/customers -d '{"phone": "invalid"}'

# 5. Pagination
curl -X GET /api/customers?page=1&limit=10

# 6. Filtering
curl -X GET /api/customers?customer_type=retail

# 7. Search
curl -X GET /api/customers?search=ABC

# 8. Performance
time curl -X GET /api/customers/123  # Should be < 150ms
```

---

## Migration Compatibility

### During Transition
```python
# Support both old and new field names
{
  # New (database name)
  "gst_number": "27XXXXX...",
  "primary_email": "abc@example.com",
  
  # Old (alias - for compatibility)
  "gstin": "27XXXXX...",
  "email": "abc@example.com"
}
```

### After Migration Complete
```python
# Remove aliases, keep only database names
{
  "gst_number": "27XXXXX...",
  "primary_email": "abc@example.com"
}
```

---

**Next:** [Transformer Elimination Plan](./04-TRANSFORMER-ELIMINATION.md)
