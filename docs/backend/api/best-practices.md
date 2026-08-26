# Best Practices

Guidelines for building robust integrations with the Pharmacy API.

---

## Authentication

### 1. Secure Token Storage

| Platform | Storage Method |
|----------|----------------|
| Web (Browser) | HttpOnly cookies or secure memory |
| Mobile (iOS) | Keychain |
| Mobile (Android) | Keystore |
| Server | Environment variables |

❌ **Never**:
- Store tokens in localStorage (XSS vulnerable)
- Log tokens
- Include tokens in URLs
- Commit tokens to source control

### 2. Handle Token Expiration

```python
def api_request(method, url, **kwargs):
    """Wrapper with automatic token refresh"""
    response = requests.request(method, url, **kwargs)
    
    if response.status_code == 401:
        # Token expired - refresh
        refresh_tokens()
        # Update headers with new token
        kwargs['headers']['Authorization'] = f"Bearer {access_token}"
        response = requests.request(method, url, **kwargs)
    
    return response
```

### 3. Proactive Token Refresh

```javascript
// Refresh token before it expires
function scheduleTokenRefresh(expiresIn) {
  const refreshTime = (expiresIn - 300) * 1000; // 5 min before expiry
  setTimeout(async () => {
    await api.refresh();
    scheduleTokenRefresh(3600); // 1 hour
  }, refreshTime);
}
```

---

## Error Handling

### 1. Always Check Response Status

```python
response = requests.post(url, json=data)

if not response.ok:
    error = response.json().get('error', {})
    
    if response.status_code == 400:
        handle_validation_error(error)
    elif response.status_code == 401:
        handle_auth_error()
    elif response.status_code == 429:
        handle_rate_limit(response.headers)
    else:
        handle_generic_error(error)
```

### 2. Implement Exponential Backoff

```python
import time
import random

def retry_with_backoff(func, max_retries=5):
    """Retry with exponential backoff and jitter"""
    for attempt in range(max_retries):
        try:
            return func()
        except RetryableError as e:
            if attempt == max_retries - 1:
                raise
            
            # Exponential backoff with jitter
            delay = (2 ** attempt) + random.uniform(0, 1)
            time.sleep(delay)
```

### 3. Categorize Errors

```python
def is_retryable(status_code):
    """Determine if error is retryable"""
    return status_code in [
        408,  # Request Timeout
        429,  # Rate Limited
        500,  # Server Error
        502,  # Bad Gateway
        503,  # Service Unavailable
        504,  # Gateway Timeout
    ]

def is_client_error(status_code):
    """Client errors - not retryable"""
    return 400 <= status_code < 500 and status_code != 429
```

---

## API Usage

### 1. Use Pagination Correctly

```python
def fetch_all_records(api, endpoint, batch_size=100):
    """Efficiently fetch all records using pagination"""
    records = []
    offset = 0
    
    while True:
        response = api.get(endpoint, params={
            'limit': batch_size,
            'offset': offset
        })
        
        data = response['data']
        records.extend(data)
        
        # Stop when no more records
        if not response.get('has_more', False):
            break
            
        offset += batch_size
        
        # Rate limit protection
        time.sleep(0.1)
    
    return records
```

### 2. Filter on Server, Not Client

```python
# ❌ Bad - fetches all, filters client-side
all_invoices = api.list_invoices()
unpaid = [i for i in all_invoices if i['status'] == 'unpaid']

# ✅ Good - filter on server
unpaid = api.list_invoices(payment_status='unpaid')
```

### 3. Request Only Needed Fields

When available, use field selection:

```http
GET /api/customers?fields=customer_id,customer_name,phone
```

---

## Data Integrity

### 1. Always Use Idempotency Keys

For any operation that creates or modifies data:

```python
headers = {
    "Authorization": f"Bearer {token}",
    "X-Idempotency-Key": generate_unique_key()
}
```

See [Idempotency Guide](idempotency.md) for details.

### 2. Validate Before Submitting

```python
def create_invoice(data):
    # Client-side validation
    if not data.get('customer_id'):
        raise ValueError("customer_id is required")
    if not data.get('items') or len(data['items']) == 0:
        raise ValueError("At least one item is required")
    
    # Validate totals match
    calculated_total = sum(item['quantity'] * item['unit_price'] 
                          for item in data['items'])
    
    return api.post('/invoices', json=data)
```

### 3. Handle Optimistic Locking

When updating records, check for concurrent modifications:

```python
def update_order(order_id, updates, expected_version):
    response = api.put(
        f'/orders/{order_id}',
        json={**updates, 'version': expected_version}
    )
    
    if response.status_code == 409:
        # Someone else modified - reload and retry
        current = api.get(f'/orders/{order_id}')
        # Show conflict to user or merge changes
```

---

## Performance

### 1. Minimize API Calls

```python
# ❌ Bad - N+1 queries
for product_id in product_ids:
    batches = api.get_batches_for_product(product_id)

# ✅ Good - single call with filter
batches = api.get_batches(product_ids=product_ids)
```

### 2. Use Bulk Endpoints

When available, prefer bulk operations:

```python
# ❌ Bad - 100 API calls
for item in items:
    api.create_item(item)

# ✅ Good - 1 API call
api.create_items_bulk(items)
```

### 3. Cache Appropriately

```python
from functools import lru_cache

@lru_cache(maxsize=100, ttl=300)  # Cache for 5 min
def get_product(product_id):
    return api.get(f'/products/{product_id}')
```

### 4. Parallelize Independent Requests

```python
import asyncio
import aiohttp

async def fetch_dashboard_data():
    async with aiohttp.ClientSession() as session:
        # Parallel fetch
        results = await asyncio.gather(
            fetch_sales_summary(session),
            fetch_inventory_alerts(session),
            fetch_pending_orders(session)
        )
    return results
```

---

## Security

### 1. Validate All Inputs

```python
# Server does validation, but still validate client-side
def create_customer(data):
    # Sanitize inputs
    data['customer_name'] = sanitize_string(data.get('customer_name', ''))
    data['email'] = validate_email(data.get('email', ''))
    
    # Check required fields
    if not data['customer_name']:
        raise ValueError("Customer name is required")
```

### 2. Log Carefully

```python
# ❌ Bad - logs sensitive data
logger.info(f"Creating payment: {payment_data}")

# ✅ Good - sanitize before logging
logger.info(f"Creating payment: amount={payment_data['amount']}, "
            f"customer_id={payment_data['customer_id']}")
```

### 3. Use HTTPS Only

```python
# ❌ Never
api = PharmacyAPI("http://api.example.com")

# ✅ Always
api = PharmacyAPI("https://api.example.com")
```

---

## Testing

### 1. Use Test Environment

```python
# Development
api = PharmacyAPI("http://localhost:8000")

# Staging (test data)
api = PharmacyAPI("https://staging-api.yourdomain.com")

# Production (never test here)
api = PharmacyAPI("https://api.yourdomain.com")
```

### 2. Mock for Unit Tests

```python
from unittest.mock import patch

def test_create_invoice():
    with patch('pharmacy_sdk.requests.post') as mock_post:
        mock_post.return_value.status_code = 201
        mock_post.return_value.json.return_value = {
            'success': True,
            'data': {'invoice_id': 1}
        }
        
        result = api.create_invoice({...})
        assert result['invoice_id'] == 1
```

---

## Monitoring

### 1. Track Request IDs

```python
response = api.post('/invoices', json=data)
request_id = response.headers.get('X-Request-ID')

logger.info(f"Created invoice, request_id={request_id}")

# If error occurs, include request_id in support tickets
```

### 2. Monitor Rate Limits

```python
def check_rate_limits(response):
    remaining = int(response.headers.get('X-RateLimit-Remaining', 0))
    if remaining < 100:
        logger.warning(f"Low rate limit remaining: {remaining}")
```

---

## See Also

- [API Reference](README.md)
- [Error Codes](errors.md)
- [Idempotency](idempotency.md)
- [Testing Guide](testing.md)
