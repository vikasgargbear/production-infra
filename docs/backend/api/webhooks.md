# Webhooks

Event notifications for real-time integration.

---

## Overview

Webhooks allow your application to receive real-time notifications when events occur in the Pharmacy system. Instead of polling the API, you register a URL and we send HTTP POST requests when events happen.

---

## Quick Start

### 1. Register Webhook Endpoint

```http
POST /api/settings/webhooks
Authorization: Bearer <token>
Content-Type: application/json

{
  "url": "https://your-server.com/webhooks/pharmacy",
  "events": ["invoice.created", "payment.received"],
  "secret": "whsec_your_secret_key"
}
```

### 2. Receive Events

```python
from flask import Flask, request
import hmac
import hashlib

app = Flask(__name__)
WEBHOOK_SECRET = "whsec_your_secret_key"

@app.route('/webhooks/pharmacy', methods=['POST'])
def handle_webhook():
    # Verify signature
    signature = request.headers.get('X-Webhook-Signature')
    if not verify_signature(request.data, signature):
        return 'Invalid signature', 401
    
    event = request.json
    
    if event['type'] == 'invoice.created':
        handle_invoice_created(event['data'])
    elif event['type'] == 'payment.received':
        handle_payment_received(event['data'])
    
    return 'OK', 200

def verify_signature(payload, signature):
    expected = hmac.new(
        WEBHOOK_SECRET.encode(),
        payload,
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(f"sha256={expected}", signature)
```

---

## Available Events

### Sales Events

| Event | Description |
|-------|-------------|
| `invoice.created` | New invoice created |
| `invoice.updated` | Invoice modified |
| `invoice.cancelled` | Invoice cancelled |
| `invoice.payment_received` | Payment applied to invoice |
| `order.created` | New order created |
| `order.confirmed` | Order confirmed |
| `order.converted` | Order converted to invoice |
| `challan.dispatched` | Delivery dispatched |
| `challan.delivered` | Delivery completed |

### Purchase Events

| Event | Description |
|-------|-------------|
| `purchase_order.created` | New PO created |
| `purchase_order.approved` | PO approved |
| `grn.created` | GRN created |
| `grn.approved` | GRN approved (stock added) |
| `supplier_invoice.created` | Supplier invoice recorded |

### Inventory Events

| Event | Description |
|-------|-------------|
| `batch.created` | New batch created |
| `batch.expired` | Batch reached expiry |
| `batch.low_stock` | Batch below reorder level |
| `stock.adjusted` | Manual stock adjustment |

### Finance Events

| Event | Description |
|-------|-------------|
| `payment.received` | Customer payment received |
| `payment.made` | Supplier payment made |
| `payment.bounced` | Cheque bounced |
| `credit_note.issued` | Credit note issued |

### Compliance Events

| Event | Description |
|-------|-------------|
| `license.expiring` | License expiring soon |
| `license.expired` | License has expired |
| `batch.recall` | Product recall triggered |

---

## Event Payload

All webhook payloads follow this structure:

```json
{
  "id": "evt_a1b2c3d4e5f6",
  "type": "invoice.created",
  "created_at": "2026-01-09T10:30:00Z",
  "org_id": "550e8400-e29b-41d4-a716-446655440000",
  "data": {
    "invoice_id": 1001,
    "invoice_number": "INV-2026-0001",
    "customer_id": 123,
    "total_amount": 5000.00,
    ...
  }
}
```

### Payload Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique event ID |
| `type` | string | Event type (e.g., `invoice.created`) |
| `created_at` | datetime | When event occurred |
| `org_id` | uuid | Organization that owns the event |
| `data` | object | Event-specific data |

---

## Security

### Signature Verification

All webhook requests include a signature header:

```http
X-Webhook-Signature: sha256=5257a869e7e...
```

**Always verify this signature** before processing events.

### Python

```python
import hmac
import hashlib

def verify_webhook_signature(payload: bytes, signature: str, secret: str) -> bool:
    """Verify webhook signature"""
    expected = hmac.new(
        secret.encode('utf-8'),
        payload,
        hashlib.sha256
    ).hexdigest()
    
    expected_signature = f"sha256={expected}"
    return hmac.compare_digest(expected_signature, signature)
```

### JavaScript

```javascript
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');
  
  const expectedSignature = `sha256=${expected}`;
  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(signature)
  );
}
```

---

## Webhook Management

### Register Webhook

```http
POST /api/settings/webhooks
```

```json
{
  "url": "https://your-server.com/webhooks",
  "events": ["invoice.created", "payment.received"],
  "secret": "whsec_your_random_secret",
  "enabled": true,
  "description": "Main production webhook"
}
```

### List Webhooks

```http
GET /api/settings/webhooks
```

### Update Webhook

```http
PUT /api/settings/webhooks/{webhook_id}
```

### Delete Webhook

```http
DELETE /api/settings/webhooks/{webhook_id}
```

### Test Webhook

```http
POST /api/settings/webhooks/{webhook_id}/test
```

Sends a test event to verify your endpoint is working.

---

## Delivery & Retries

### Timeout

Webhook requests timeout after **30 seconds**. Respond quickly.

### Success Response

Return HTTP status code `200-299` to indicate success:

```python
return 'OK', 200
```

### Retry Policy

Failed webhooks are retried with exponential backoff:

| Attempt | Delay |
|---------|-------|
| 1 | Immediate |
| 2 | 1 minute |
| 3 | 5 minutes |
| 4 | 30 minutes |
| 5 | 2 hours |
| 6 | 8 hours |
| 7 | 24 hours |

After 7 failed attempts, the webhook is marked as failed.

### View Delivery History

```http
GET /api/settings/webhooks/{webhook_id}/deliveries
```

Response:
```json
{
  "data": [
    {
      "delivery_id": "del_abc123",
      "event_id": "evt_xyz789",
      "event_type": "invoice.created",
      "status": "success",
      "status_code": 200,
      "delivered_at": "2026-01-09T10:30:01Z",
      "response_time_ms": 125
    }
  ]
}
```

---

## Best Practices

### 1. Respond Quickly

Process webhooks asynchronously. Acknowledge immediately, process later:

```python
@app.route('/webhooks', methods=['POST'])
def handle_webhook():
    # Quick validation
    if not verify_signature(request.data, request.headers.get('X-Webhook-Signature')):
        return 'Invalid', 401
    
    # Queue for async processing
    event_queue.put(request.json)
    
    # Return immediately
    return 'OK', 200

# Process in background worker
def process_events():
    while True:
        event = event_queue.get()
        process_event(event)
```

### 2. Handle Duplicates

The same event may be delivered multiple times. Use `event.id` for deduplication:

```python
def handle_event(event):
    event_id = event['id']
    
    # Check if already processed
    if redis.get(f"processed:{event_id}"):
        return  # Skip duplicate
    
    # Process event
    process(event)
    
    # Mark as processed (with TTL)
    redis.setex(f"processed:{event_id}", 86400, "1")
```

### 3. Secure Your Endpoint

- Use HTTPS only
- Verify signatures
- Whitelist our IP addresses (available on request)

### 4. Monitor Failures

Check delivery status regularly:

```bash
# Check recent failures
curl "https://api.yourdomain.com/api/settings/webhooks/123/deliveries?status=failed" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Example Implementations

### Complete Flask Handler

```python
from flask import Flask, request, jsonify
import hmac
import hashlib
import logging

app = Flask(__name__)
logger = logging.getLogger(__name__)

WEBHOOK_SECRET = "whsec_your_secret"

@app.route('/webhooks/pharmacy', methods=['POST'])
def webhook_handler():
    # 1. Verify signature
    signature = request.headers.get('X-Webhook-Signature', '')
    if not verify_signature(request.data, signature, WEBHOOK_SECRET):
        logger.warning("Invalid webhook signature")
        return jsonify({"error": "Invalid signature"}), 401
    
    # 2. Parse event
    event = request.json
    event_type = event.get('type')
    event_id = event.get('id')
    
    logger.info(f"Received webhook: {event_type} ({event_id})")
    
    # 3. Handle event
    try:
        handlers = {
            'invoice.created': handle_invoice_created,
            'payment.received': handle_payment_received,
            'batch.low_stock': handle_low_stock_alert,
        }
        
        handler = handlers.get(event_type)
        if handler:
            handler(event['data'])
        else:
            logger.info(f"Unhandled event type: {event_type}")
            
    except Exception as e:
        logger.error(f"Error handling webhook: {e}")
        # Still return 200 to prevent retries for processing errors
    
    return jsonify({"received": True}), 200

def handle_invoice_created(data):
    """Handle new invoice creation"""
    invoice_id = data['invoice_id']
    customer_id = data['customer_id']
    amount = data['total_amount']
    
    # Update your system, send notifications, etc.
    notify_sales_team(customer_id, invoice_id, amount)

def handle_payment_received(data):
    """Handle payment receipt"""
    # Update accounting system, reconcile, etc.
    pass

def handle_low_stock_alert(data):
    """Handle low stock notification"""
    # Create purchase requisition, alert purchasing team
    pass
```

---

## See Also

- [API Reference](README.md)
- [Settings API](settings/)
- [Best Practices](best-practices.md)
