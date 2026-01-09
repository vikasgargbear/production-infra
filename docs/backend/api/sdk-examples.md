# SDK Examples

Code examples in Python, JavaScript, and cURL for common API operations.

---

## Installation

### Python

```bash
pip install requests
```

### JavaScript (Node.js)

```bash
npm install axios
# or
npm install node-fetch
```

---

## Authentication Setup

### Python

```python
import requests

class PharmacyAPI:
    def __init__(self, base_url="https://api.yourdomain.com"):
        self.base_url = base_url
        self.access_token = None
        self.refresh_token = None
    
    def login(self, username, password):
        """Authenticate and store tokens"""
        response = requests.post(
            f"{self.base_url}/api/auth/login",
            json={"username": username, "password": password}
        )
        response.raise_for_status()
        data = response.json()["data"]
        self.access_token = data["access_token"]
        self.refresh_token = data["refresh_token"]
        return data
    
    def _headers(self):
        """Get authorization headers"""
        return {"Authorization": f"Bearer {self.access_token}"}
    
    def refresh(self):
        """Refresh access token"""
        response = requests.post(
            f"{self.base_url}/api/auth/refresh",
            json={"refresh_token": self.refresh_token}
        )
        response.raise_for_status()
        self.access_token = response.json()["data"]["access_token"]

# Usage
api = PharmacyAPI()
api.login("user@example.com", "password")
```

### JavaScript

```javascript
const axios = require('axios');

class PharmacyAPI {
  constructor(baseURL = 'https://api.yourdomain.com') {
    this.client = axios.create({ baseURL });
    this.accessToken = null;
    this.refreshToken = null;
  }

  async login(username, password) {
    const { data } = await this.client.post('/api/auth/login', {
      username,
      password
    });
    this.accessToken = data.data.access_token;
    this.refreshToken = data.data.refresh_token;
    
    // Set default header for future requests
    this.client.defaults.headers.common['Authorization'] = 
      `Bearer ${this.accessToken}`;
    
    return data.data;
  }

  async refresh() {
    const { data } = await this.client.post('/api/auth/refresh', {
      refresh_token: this.refreshToken
    });
    this.accessToken = data.data.access_token;
    this.client.defaults.headers.common['Authorization'] = 
      `Bearer ${this.accessToken}`;
  }
}

// Usage
const api = new PharmacyAPI();
await api.login('user@example.com', 'password');
```

---

## Invoices

### Create Invoice

#### Python

```python
def create_invoice(self, invoice_data):
    """Create a new invoice"""
    response = requests.post(
        f"{self.base_url}/api/sales/invoices",
        headers=self._headers(),
        json=invoice_data
    )
    response.raise_for_status()
    return response.json()["data"]

# Usage
invoice = api.create_invoice({
    "invoice_number": "INV-2026-0001",
    "invoice_date": "2026-01-09",
    "customer_id": 123,
    "items": [
        {
            "product_id": 456,
            "batch_id": 789,
            "quantity": 10,
            "uom": "STRIP",
            "pack_type": "strip",
            "unit_price": 45.50
        }
    ]
})
print(f"Created invoice: {invoice['invoice_number']}")
```

#### JavaScript

```javascript
async createInvoice(invoiceData) {
  const { data } = await this.client.post('/api/sales/invoices', invoiceData);
  return data.data;
}

// Usage
const invoice = await api.createInvoice({
  invoice_number: 'INV-2026-0001',
  invoice_date: '2026-01-09',
  customer_id: 123,
  items: [
    {
      product_id: 456,
      batch_id: 789,
      quantity: 10,
      uom: 'STRIP',
      pack_type: 'strip',
      unit_price: 45.50
    }
  ]
});
console.log(`Created invoice: ${invoice.invoice_number}`);
```

### List Invoices with Pagination

#### Python

```python
def list_invoices(self, limit=50, offset=0, **filters):
    """List invoices with pagination and filters"""
    params = {"limit": limit, "offset": offset, **filters}
    response = requests.get(
        f"{self.base_url}/api/sales/invoices",
        headers=self._headers(),
        params=params
    )
    response.raise_for_status()
    return response.json()

# Usage - Fetch all unpaid invoices
all_invoices = []
offset = 0
while True:
    result = api.list_invoices(
        limit=100, 
        offset=offset, 
        payment_status="unpaid"
    )
    all_invoices.extend(result["data"])
    if not result.get("has_more", False):
        break
    offset += 100

print(f"Total unpaid invoices: {len(all_invoices)}")
```

#### JavaScript

```javascript
async listInvoices(options = {}) {
  const { limit = 50, offset = 0, ...filters } = options;
  const { data } = await this.client.get('/api/sales/invoices', {
    params: { limit, offset, ...filters }
  });
  return data;
}

// Usage - Fetch all unpaid invoices
async function fetchAllUnpaidInvoices(api) {
  const invoices = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const result = await api.listInvoices({
      limit: 100,
      offset,
      payment_status: 'unpaid'
    });
    invoices.push(...result.data);
    hasMore = result.has_more;
    offset += 100;
  }

  return invoices;
}
```

---

## Payments

### Create Payment with Allocation

#### Python

```python
def create_payment(self, payment_data):
    """Create a payment and optionally allocate to invoices"""
    response = requests.post(
        f"{self.base_url}/api/finance/payments",
        headers=self._headers(),
        json=payment_data
    )
    response.raise_for_status()
    return response.json()["data"]

# Usage
payment = api.create_payment({
    "payment_date": "2026-01-09",
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
            "allocated_amount": 5000.00
        }
    ]
})
print(f"Created payment: {payment['payment_number']}")
```

#### JavaScript

```javascript
async createPayment(paymentData) {
  const { data } = await this.client.post('/api/finance/payments', paymentData);
  return data.data;
}

// Usage
const payment = await api.createPayment({
  payment_date: '2026-01-09',
  payment_type: 'receipt',
  party_type: 'customer',
  party_id: 123,
  payment_amount: 5000.00,
  payment_method: 'upi',
  reference_number: 'UPI123456789',
  allocations: [
    {
      reference_type: 'invoice',
      reference_id: 1001,
      allocated_amount: 5000.00
    }
  ]
});
```

---

## GRN (Goods Receipt)

### Create GRN with Batch Details

#### Python

```python
def create_grn(self, grn_data):
    """Create a GRN which will create inventory batches on approval"""
    response = requests.post(
        f"{self.base_url}/api/purchase/grn",
        headers=self._headers(),
        json=grn_data
    )
    response.raise_for_status()
    return response.json()["data"]

def approve_grn(self, grn_id):
    """Approve GRN and create batches"""
    response = requests.post(
        f"{self.base_url}/api/purchase/grn/{grn_id}/approve",
        headers=self._headers()
    )
    response.raise_for_status()
    return response.json()["data"]

# Usage
grn = api.create_grn({
    "grn_date": "2026-01-09",
    "supplier_id": 50,
    "purchase_order_id": 201,
    "items": [
        {
            "product_id": 456,
            "batch_number": "B2026001",
            "manufacturing_date": "2025-12-01",
            "expiry_date": "2027-11-30",
            "received_quantity": 100,
            "accepted_quantity": 100,
            "mrp": 50.00,
            "unit_price": 35.00
        }
    ]
})

# Approve to create batches
approved = api.approve_grn(grn["grn_id"])
print(f"Batches created: {len(approved['batches_created'])}")
```

---

## Error Handling

### Python

```python
import requests
from requests.exceptions import HTTPError

def api_call_with_retry(func, max_retries=3):
    """Wrapper for API calls with retry logic"""
    for attempt in range(max_retries):
        try:
            return func()
        except HTTPError as e:
            if e.response.status_code == 429:
                # Rate limited - wait and retry
                retry_after = int(e.response.headers.get('Retry-After', 60))
                time.sleep(retry_after)
                continue
            elif e.response.status_code == 401:
                # Token expired - refresh and retry
                api.refresh()
                continue
            else:
                # Parse error response
                error = e.response.json().get("error", {})
                raise APIError(
                    code=error.get("code"),
                    message=error.get("message"),
                    details=error.get("details")
                )
    raise Exception("Max retries exceeded")

class APIError(Exception):
    def __init__(self, code, message, details=None):
        self.code = code
        self.message = message
        self.details = details or []
        super().__init__(f"{code}: {message}")
```

### JavaScript

```javascript
class APIError extends Error {
  constructor(code, message, details = []) {
    super(`${code}: ${message}`);
    this.code = code;
    this.details = details;
  }
}

// Axios interceptor for error handling
api.client.interceptors.response.use(
  response => response,
  async error => {
    const { response } = error;
    
    if (response?.status === 429) {
      // Rate limited - wait and retry
      const retryAfter = parseInt(response.headers['retry-after'] || '60');
      await new Promise(r => setTimeout(r, retryAfter * 1000));
      return api.client.request(error.config);
    }
    
    if (response?.status === 401 && error.config.url !== '/api/auth/login') {
      // Token expired - refresh and retry
      await api.refresh();
      return api.client.request(error.config);
    }
    
    if (response?.data?.error) {
      const { code, message, details } = response.data.error;
      throw new APIError(code, message, details);
    }
    
    throw error;
  }
);
```

---

## Complete SDK Class

### Python

```python
# pharmacy_sdk.py
import requests
from typing import Optional, Dict, Any, List

class PharmacySDK:
    """Complete Python SDK for Pharmacy API"""
    
    def __init__(self, base_url: str = "https://api.yourdomain.com"):
        self.base_url = base_url
        self.access_token: Optional[str] = None
        self.refresh_token: Optional[str] = None
    
    def _headers(self) -> Dict[str, str]:
        return {"Authorization": f"Bearer {self.access_token}"}
    
    # Auth
    def login(self, username: str, password: str) -> Dict:
        """Authenticate user"""
        ...
    
    # Invoices
    def create_invoice(self, data: Dict) -> Dict:
        """Create invoice"""
        ...
    
    def get_invoice(self, invoice_id: int) -> Dict:
        """Get invoice by ID"""
        ...
    
    def list_invoices(self, **filters) -> Dict:
        """List invoices"""
        ...
    
    # Payments
    def create_payment(self, data: Dict) -> Dict:
        """Create payment"""
        ...
    
    # ... more methods
```

---

## See Also

- [API Reference](README.md)
- [Authentication](auth/)
- [Error Codes](errors.md)
