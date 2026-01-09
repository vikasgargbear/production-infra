# Performance

Optimization strategies and best practices.

---

## Performance Principles

1. **Database is the bottleneck** - Optimize queries first
2. **N+1 is the enemy** - Single query for related data
3. **Bulk over loop** - Batch operations when possible
4. **Cache what's read often** - Products, settings, permissions

---

## Database Optimizations

### Critical Indexes

```sql
-- Most frequently queried patterns
CREATE INDEX idx_invoices_org_customer ON sales.invoices(org_id, customer_id);
CREATE INDEX idx_invoices_org_status_date ON sales.invoices(org_id, invoice_status, invoice_date);
CREATE INDEX idx_batches_org_product_status ON inventory.batches(org_id, product_id, batch_status);

-- Full-text search
CREATE INDEX idx_products_name_gin ON inventory.products 
  USING gin(product_name gin_trgm_ops);
CREATE INDEX idx_customers_name_gin ON parties.customers 
  USING gin(customer_name gin_trgm_ops);
```

### Query Patterns

#### ❌ N+1 Problem

```python
# Bad - 1 query per invoice item
invoices = db.execute("SELECT * FROM invoices WHERE org_id = :org_id").fetchall()
for invoice in invoices:
    items = db.execute(
        "SELECT * FROM invoice_items WHERE invoice_id = :id",
        {"id": invoice.invoice_id}
    ).fetchall()
```

#### ✅ Single Query with JOIN

```python
# Good - single query with all data
query = """
    SELECT 
        i.*,
        json_agg(ii.*) as items
    FROM sales.invoices i
    LEFT JOIN sales.invoice_items ii ON i.invoice_id = ii.invoice_id
    WHERE i.org_id = :org_id
    GROUP BY i.invoice_id
"""
```

#### ✅ Batch Fetch Pattern

```python
# Good - fetch all items in one query
invoices = db.execute("SELECT * FROM invoices WHERE org_id = :org_id").fetchall()
invoice_ids = [i.invoice_id for i in invoices]

items = db.execute(
    "SELECT * FROM invoice_items WHERE invoice_id = ANY(:ids)",
    {"ids": invoice_ids}
).fetchall()

# Group in Python
items_by_invoice = defaultdict(list)
for item in items:
    items_by_invoice[item.invoice_id].append(item)
```

---

## Bulk Operations

### Bulk Insert

```python
# ❌ Bad - loop insert
for item in items:
    db.execute("INSERT INTO invoice_items VALUES (...)", item)

# ✅ Good - single bulk insert
from psycopg2.extras import execute_values

execute_values(
    cursor,
    """
    INSERT INTO sales.invoice_items 
    (invoice_id, product_id, quantity, unit_price)
    VALUES %s
    """,
    [(i.invoice_id, i.product_id, i.quantity, i.unit_price) for i in items]
)
```

### Bulk Update

```python
# ❌ Bad - individual updates
for batch in batches:
    db.execute(
        "UPDATE batches SET quantity = :qty WHERE batch_id = :id",
        {"qty": batch.new_quantity, "id": batch.batch_id}
    )

# ✅ Good - single update with CASE
db.execute("""
    UPDATE inventory.batches AS b
    SET quantity_available = c.new_qty
    FROM (VALUES 
        %(values)s
    ) AS c(batch_id, new_qty)
    WHERE b.batch_id = c.batch_id
""", {"values": tuple(batches)})
```

### Stock Deduction (FIFO)

```python
def deduct_stock_fifo(product_id: int, quantity: Decimal, org_id: str):
    """Deduct from oldest batches first"""
    query = """
        WITH ordered_batches AS (
            SELECT batch_id, quantity_available,
                   SUM(quantity_available) OVER (ORDER BY expiry_date) AS running_total
            FROM inventory.batches
            WHERE org_id = :org_id 
              AND product_id = :product_id
              AND quantity_available > 0
              AND batch_status = 'active'
            ORDER BY expiry_date
        ),
        deductions AS (
            SELECT batch_id,
                   LEAST(
                       quantity_available,
                       GREATEST(0, :quantity - COALESCE(LAG(running_total) OVER (ORDER BY running_total), 0))
                   ) AS deduct_qty
            FROM ordered_batches
            WHERE running_total - quantity_available < :quantity
        )
        UPDATE inventory.batches b
        SET quantity_available = quantity_available - d.deduct_qty
        FROM deductions d
        WHERE b.batch_id = d.batch_id
        RETURNING b.batch_id, d.deduct_qty
    """
    return db.execute(query, {
        "org_id": org_id,
        "product_id": product_id,
        "quantity": quantity
    }).fetchall()
```

---

## Connection Pooling

```python
# database.py
from sqlalchemy import create_engine
from sqlalchemy.pool import QueuePool

engine = create_engine(
    DATABASE_URL,
    poolclass=QueuePool,
    pool_size=20,           # Base connections
    max_overflow=30,        # Additional on demand
    pool_timeout=30,        # Wait for connection
    pool_recycle=1800,      # Recycle after 30 min
    pool_pre_ping=True      # Verify connection health
)
```

### Connection Usage

```python
# ❌ Bad - holds connection too long
def long_operation():
    with get_db() as db:
        result = db.execute(query1)  # Connection acquired
        
        # External API call - connection held!
        external_result = call_external_api()
        
        db.execute(query2)  # Still holding connection

# ✅ Good - release between operations
def long_operation():
    with get_db() as db:
        result = db.execute(query1)  # Quick
    
    # Connection released
    external_result = call_external_api()
    
    with get_db() as db:
        db.execute(query2)  # New connection
```

---

## Background Processing

### Async Tasks Pattern

```python
from fastapi import BackgroundTasks

@router.post("/invoices")
async def create_invoice(
    data: InvoiceCreate,
    background_tasks: BackgroundTasks
):
    # 1. Create invoice (fast)
    invoice = InvoiceService.create(db, data)
    
    # 2. Queue side effects (deferred)
    background_tasks.add_task(
        update_inventory,
        invoice_id=invoice.invoice_id
    )
    background_tasks.add_task(
        update_customer_outstanding,
        customer_id=invoice.customer_id
    )
    background_tasks.add_task(
        send_invoice_notification,
        invoice_id=invoice.invoice_id
    )
    
    # 3. Return immediately
    return invoice  # Client gets response fast
```

### Heavy Operations

```python
# ❌ Bad - blocking the request
@router.post("/reports/generate")
async def generate_report(params: ReportParams):
    report = generate_large_report(params)  # Takes 30 seconds
    return report

# ✅ Good - async with status polling
@router.post("/reports/generate")
async def generate_report(params: ReportParams, background_tasks: BackgroundTasks):
    job_id = create_job_record(params)
    background_tasks.add_task(generate_large_report, job_id, params)
    return {"job_id": job_id, "status": "processing"}

@router.get("/reports/status/{job_id}")
async def report_status(job_id: str):
    job = get_job(job_id)
    if job.status == "complete":
        return {"status": "complete", "download_url": job.result_url}
    return {"status": job.status, "progress": job.progress}
```

---

## Caching

### Redis Cache Pattern

```python
import redis
import json

redis_client = redis.Redis.from_url(REDIS_URL)
CACHE_TTL = 300  # 5 minutes

def get_product(product_id: int) -> dict:
    # Try cache first
    cache_key = f"product:{product_id}"
    cached = redis_client.get(cache_key)
    
    if cached:
        return json.loads(cached)
    
    # Cache miss - fetch from DB
    product = db.execute(
        "SELECT * FROM products WHERE product_id = :id",
        {"id": product_id}
    ).fetchone()
    
    # Store in cache
    redis_client.setex(cache_key, CACHE_TTL, json.dumps(dict(product)))
    
    return dict(product)

def invalidate_product_cache(product_id: int):
    redis_client.delete(f"product:{product_id}")
```

### What to Cache

| Data | TTL | Reason |
|------|-----|--------|
| Products | 5 min | Read frequently, changes rarely |
| Categories | 1 hour | Very static |
| User permissions | 5 min | Security, needs refresh |
| Settings | 10 min | Rarely changes |
| Dashboard stats | 1 min | Expensive but tolerable lag |

### What NOT to Cache

- Invoice details (real-time accuracy needed)
- Stock levels (must be current)
- Payment status (financial accuracy)

---

## Pagination Optimization

### Offset vs Cursor

```python
# ❌ Offset - slow for large offsets
SELECT * FROM invoices 
ORDER BY invoice_date DESC 
LIMIT 50 OFFSET 10000;  # Scans 10050 rows

# ✅ Cursor - constant time
SELECT * FROM invoices 
WHERE invoice_date < :last_date 
  AND invoice_id < :last_id
ORDER BY invoice_date DESC, invoice_id DESC
LIMIT 50;  # Uses index
```

### Implementation

```python
def list_invoices_cursor(
    org_id: str,
    limit: int = 50,
    cursor: str = None
) -> dict:
    query = """
        SELECT * FROM sales.invoices
        WHERE org_id = :org_id
    """
    params = {"org_id": org_id, "limit": limit + 1}
    
    if cursor:
        cursor_data = decode_cursor(cursor)
        query += """
            AND (invoice_date, invoice_id) < (:cursor_date, :cursor_id)
        """
        params.update(cursor_data)
    
    query += " ORDER BY invoice_date DESC, invoice_id DESC LIMIT :limit"
    
    results = db.execute(query, params).fetchall()
    
    has_more = len(results) > limit
    if has_more:
        results = results[:limit]
    
    next_cursor = None
    if has_more:
        last = results[-1]
        next_cursor = encode_cursor({
            "cursor_date": last.invoice_date,
            "cursor_id": last.invoice_id
        })
    
    return {
        "data": results,
        "next_cursor": next_cursor,
        "has_more": has_more
    }
```

---

## API Response Time Targets

| Endpoint Type | Target | Max |
|---------------|--------|-----|
| Simple GET | < 50ms | 200ms |
| List with filters | < 100ms | 500ms |
| Create/Update | < 200ms | 1s |
| Complex reports | < 1s | 5s |
| Bulk operations | < 2s | 10s |

---

## Monitoring & Profiling

### Request Timing Middleware

```python
import time
from starlette.middleware.base import BaseHTTPMiddleware

class TimingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        duration = time.perf_counter() - start
        
        # Log slow requests
        if duration > 1.0:
            logger.warning(f"Slow request: {request.url.path} took {duration:.2f}s")
        
        response.headers["X-Response-Time"] = f"{duration:.3f}s"
        return response
```

### Query Timing

```python
def timed_query(query: str, params: dict):
    start = time.perf_counter()
    result = db.execute(text(query), params)
    duration = time.perf_counter() - start
    
    if duration > 0.5:
        logger.warning(f"Slow query ({duration:.2f}s): {query[:100]}...")
    
    return result
```

---

## Checklist

### Database
- [ ] Indexes on frequently queried columns
- [ ] No N+1 queries
- [ ] Bulk operations for batch inserts/updates
- [ ] Connection pooling configured

### API
- [ ] Background tasks for heavy operations
- [ ] Cursor pagination for large datasets
- [ ] Response time logging
- [ ] Caching for static data

### Infrastructure
- [ ] Redis for caching and sessions
- [ ] Connection pool sized correctly
- [ ] Read replicas for reporting (if needed)

---

## See Also

- [System Design](system-design.md)
- [Database Schema](../database/)
- [Deployment](../../deployment/)
