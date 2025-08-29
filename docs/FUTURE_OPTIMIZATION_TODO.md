# Future Optimization TODO

## Return Module Performance Optimization

### Problem Statement
The return module experiences timeout issues when fetching invoice return status due to N+1 query problems and inefficient database queries.

### Optimization Strategies

#### 1. Add Batch Endpoint for Return Status
**Priority: High**
```javascript
// Instead of individual calls per invoice
GET /api/sale-returns/invoice/123/returns
GET /api/sale-returns/invoice/124/returns
GET /api/sale-returns/invoice/125/returns

// Create batch endpoint
POST /api/sale-returns/batch/return-status
{
  "invoice_ids": [123, 124, 125]
}
// Returns all statuses in one call
```

**Implementation:**
```python
@router.post("/batch/return-status")
async def get_batch_return_status(
    invoice_ids: List[int],
    db: Session = Depends(get_db)
):
    # Single query for all invoices
    return db.execute("""
        SELECT invoice_id, COUNT(*) as return_count, 
               SUM(total_amount) as total_returned
        FROM sales_returns 
        WHERE invoice_id = ANY(:ids)
        GROUP BY invoice_id
    """, {"ids": invoice_ids})
```

#### 2. Implement Redis Caching
**Priority: High**
```python
import redis
from datetime import timedelta

redis_client = redis.Redis(host='localhost', port=6379, db=0)

def get_return_status_cached(invoice_id: int):
    # Check cache first
    cache_key = f"return_status:{invoice_id}"
    cached = redis_client.get(cache_key)
    
    if cached:
        return json.loads(cached)
    
    # Fetch from database
    status = fetch_return_status_from_db(invoice_id)
    
    # Cache for 5 minutes
    redis_client.setex(
        cache_key, 
        timedelta(minutes=5), 
        json.dumps(status)
    )
    
    return status
```

#### 3. Database Index Optimization
**Priority: Critical**

Run these indexes in production:
```sql
-- Composite index for return lookups
CREATE INDEX CONCURRENTLY idx_sales_returns_invoice_customer 
ON sales.sales_returns(invoice_id, customer_id) 
WHERE return_status != 'cancelled';

-- Covering index for return items
CREATE INDEX CONCURRENTLY idx_return_items_covering 
ON sales.sales_return_items(return_id) 
INCLUDE (product_id, return_quantity, return_value);

-- Index for date range queries
CREATE INDEX CONCURRENTLY idx_invoices_date_range 
ON sales.invoices(invoice_date, customer_id) 
WHERE invoice_status = 'generated';

-- Partial index for active returns
CREATE INDEX CONCURRENTLY idx_active_returns 
ON sales.sales_returns(invoice_id) 
WHERE credit_note_status = 'issued' 
AND pending_amount > 0;

-- Analyze tables for query planner
VACUUM ANALYZE sales.sales_returns;
VACUUM ANALYZE sales.sales_return_items;
VACUUM ANALYZE sales.invoices;
```

#### 4. Async Loading Pattern
**Priority: Medium**

```javascript
// Load invoices first, then return status async
const InvoiceList = () => {
  const [invoices, setInvoices] = useState([]);
  const [returnStatuses, setReturnStatuses] = useState({});
  
  // Load invoices immediately
  useEffect(() => {
    loadInvoices().then(setInvoices);
  }, []);
  
  // Load return status asynchronously
  useEffect(() => {
    if (invoices.length > 0) {
      // Batch load return statuses
      loadReturnStatusesBatch(invoices.map(i => i.id))
        .then(statuses => {
          const statusMap = {};
          statuses.forEach(s => {
            statusMap[s.invoice_id] = s;
          });
          setReturnStatuses(statusMap);
        });
    }
  }, [invoices]);
  
  return (
    <div>
      {invoices.map(invoice => (
        <InvoiceCard 
          invoice={invoice}
          returnStatus={returnStatuses[invoice.id] || { loading: true }}
        />
      ))}
    </div>
  );
};
```

#### 5. Query Optimization Techniques
**Priority: High**

##### Current Slow Query:
```sql
-- Multiple joins and subqueries
SELECT i.*, 
  (SELECT COUNT(*) FROM returns WHERE invoice_id = i.id),
  (SELECT SUM(amount) FROM returns WHERE invoice_id = i.id)
FROM invoices i
```

##### Optimized Query:
```sql
-- Single pass with window functions
WITH return_summary AS (
  SELECT 
    invoice_id,
    COUNT(*) as return_count,
    SUM(total_amount) as total_returned,
    STRING_AGG(return_number, ', ') as return_numbers
  FROM sales_returns
  GROUP BY invoice_id
)
SELECT 
  i.*,
  COALESCE(rs.return_count, 0) as return_count,
  COALESCE(rs.total_returned, 0) as total_returned,
  rs.return_numbers
FROM invoices i
LEFT JOIN return_summary rs ON rs.invoice_id = i.id
WHERE i.customer_id = :customer_id
LIMIT 20;
```

#### 6. Implement Pagination Properly
**Priority: Medium**

```javascript
// Use cursor-based pagination instead of offset
const fetchInvoices = async (cursor = null) => {
  const query = {
    limit: 20,
    cursor: cursor, // Use last invoice_id as cursor
  };
  
  const response = await api.getInvoices(query);
  return {
    data: response.invoices,
    nextCursor: response.next_cursor,
    hasMore: response.has_more
  };
};
```

#### 7. Materialized Views for Reports
**Priority: Low**

```sql
-- Create materialized view for return statistics
CREATE MATERIALIZED VIEW mv_invoice_return_stats AS
SELECT 
  i.invoice_id,
  i.invoice_number,
  i.customer_id,
  COUNT(sr.return_id) as return_count,
  SUM(sr.total_amount) as total_returned,
  MAX(sr.return_date) as last_return_date,
  ARRAY_AGG(sr.return_number) as return_numbers
FROM sales.invoices i
LEFT JOIN sales.sales_returns sr ON sr.invoice_id = i.invoice_id
GROUP BY i.invoice_id, i.invoice_number, i.customer_id;

-- Refresh periodically
CREATE INDEX ON mv_invoice_return_stats(customer_id, invoice_id);
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_invoice_return_stats;
```

#### 8. Connection Pooling
**Priority: Medium**

```python
# Use connection pooling for better performance
from sqlalchemy.pool import QueuePool

engine = create_engine(
    DATABASE_URL,
    poolclass=QueuePool,
    pool_size=20,
    max_overflow=40,
    pool_pre_ping=True,
    pool_recycle=3600
)
```

## Implementation Timeline

### Phase 1 (Immediate) - Week 1
- [ ] Add database indexes
- [ ] Implement batch return status endpoint
- [ ] Fix N+1 query problems

### Phase 2 (Short-term) - Week 2-3
- [ ] Add Redis caching layer
- [ ] Implement async loading pattern
- [ ] Optimize SQL queries

### Phase 3 (Medium-term) - Month 2
- [ ] Add materialized views
- [ ] Implement cursor pagination
- [ ] Connection pool optimization

### Phase 4 (Long-term) - Quarter 2
- [ ] GraphQL for flexible data fetching
- [ ] ElasticSearch for complex searches
- [ ] CDN for static data caching

## Performance Metrics to Track

1. **Response Time**
   - Target: < 200ms for invoice list
   - Current: 30,000ms (timeout)

2. **Database Query Time**
   - Target: < 50ms per query
   - Monitor slow query log

3. **Cache Hit Rate**
   - Target: > 80% for return status
   - Track Redis metrics

4. **User Experience**
   - Time to First Byte (TTFB)
   - Time to Interactive (TTI)
   - Largest Contentful Paint (LCP)

## Testing Strategy

1. **Load Testing**
   ```bash
   # Use Apache Bench
   ab -n 1000 -c 10 https://api.example.com/returnable-invoices
   ```

2. **Query Analysis**
   ```sql
   EXPLAIN ANALYZE [your query];
   ```

3. **Performance Monitoring**
   - New Relic / DataDog
   - Custom metrics dashboard
   - Alert on slow queries

## Notes

- Always test optimizations in staging first
- Monitor production metrics after deployment
- Consider rolling back if performance degrades
- Document all changes in CHANGELOG

## References

- [PostgreSQL Performance Tuning](https://wiki.postgresql.org/wiki/Performance_Optimization)
- [Redis Best Practices](https://redis.io/docs/manual/patterns/)
- [React Performance Patterns](https://react.dev/learn/render-and-commit)
- [N+1 Query Problem](https://stackoverflow.com/questions/97197/what-is-the-n1-selects-problem)