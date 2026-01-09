# Troubleshooting

Common issues and solutions.

---

## Quick Diagnosis

```bash
# Check if services are running
curl http://localhost:8000/health  # Backend
curl http://localhost:3000         # Frontend

# Check database connection
psql -U postgres -d pharmacy_dev -c "SELECT 1"

# Check Redis
redis-cli ping

# View backend logs
tail -f backend/logs/app.log
```

---

## Common Issues

### Backend Won't Start

#### Port Already in Use

```
Error: Address already in use
```

**Solution:**
```bash
# Find process using port 8000
lsof -i :8000

# Kill process
kill -9 <PID>

# Or use different port
uvicorn app.main:app --port 8001
```

#### Module Not Found

```
ModuleNotFoundError: No module named 'app'
```

**Solution:**
```bash
# Ensure you're in backend directory
cd backend

# Activate virtual environment
source venv/bin/activate

# Reinstall dependencies
pip install -r requirements.txt
```

#### Database Connection Failed

```
psycopg2.OperationalError: could not connect to server
```

**Solution:**
```bash
# Check PostgreSQL is running
pg_isready

# If not running
brew services start postgresql  # macOS
sudo systemctl start postgresql  # Linux

# Verify DATABASE_URL in .env
echo $DATABASE_URL
```

---

### Database Issues

#### Migration Failed

```
alembic.util.exc.CommandError: Can't locate revision
```

**Solution:**
```bash
# Reset to base
alembic downgrade base

# Re-run all migrations
alembic upgrade head
```

#### Duplicate Key Error

```
psycopg2.errors.UniqueViolation: duplicate key value violates unique constraint
```

**Solution:**
```sql
-- Check existing data
SELECT * FROM sales.invoices WHERE invoice_number = 'INV-001';

-- Reset sequence if needed
SELECT setval('sales.invoices_invoice_id_seq', (SELECT MAX(invoice_id) FROM sales.invoices));
```

#### Schema Not Found

```
psycopg2.errors.InvalidSchemaName: schema "sales" does not exist
```

**Solution:**
```bash
# Run migrations to create schemas
alembic upgrade head

# Or manually create
psql -d pharmacy_dev -c "CREATE SCHEMA IF NOT EXISTS sales;"
```

---

### Authentication Issues

#### Token Expired

```json
{"error": {"code": "AUTH_TOKEN_EXPIRED", "message": "Token has expired"}}
```

**Solution:**
```javascript
// Refresh the token
const response = await api.post('/auth/refresh', {
  refresh_token: localStorage.getItem('refreshToken')
});
localStorage.setItem('accessToken', response.data.access_token);
```

#### Invalid Token

```json
{"error": {"code": "AUTH_TOKEN_INVALID"}}
```

**Causes:**
- Token was tampered with
- Wrong JWT_SECRET_KEY in .env
- Token from different environment

**Solution:**
```bash
# Verify JWT_SECRET_KEY matches in .env
grep JWT_SECRET_KEY .env

# Re-login to get fresh token
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "user@test.com", "password": "password"}'
```

#### Permission Denied

```json
{"error": {"code": "AUTH_INSUFFICIENT_PERMISSIONS"}}
```

**Solution:**
```sql
-- Check user's role
SELECT username, role FROM master.org_users WHERE user_id = 123;

-- Update role if needed
UPDATE master.org_users SET role = 'admin' WHERE user_id = 123;
```

---

### API Errors

#### INSUFFICIENT_STOCK

```json
{"error": {"code": "INSUFFICIENT_STOCK", "message": "Not enough stock"}}
```

**Diagnosis:**
```sql
-- Check batch stock
SELECT batch_id, batch_number, quantity_available, quantity_reserved
FROM inventory.batches
WHERE product_id = :product_id AND batch_status = 'active';
```

**Solutions:**
1. Create GRN to add stock
2. Reduce requested quantity
3. Check if stock is reserved

#### CREDIT_LIMIT_EXCEEDED

```json
{"error": {"code": "CREDIT_LIMIT_EXCEEDED"}}
```

**Diagnosis:**
```sql
SELECT c.customer_name, c.credit_limit, c.outstanding_amount,
       c.credit_limit - c.outstanding_amount AS available
FROM parties.customers c
WHERE customer_id = :customer_id;
```

**Solutions:**
1. Collect payment to reduce outstanding
2. Increase credit limit
3. Use cash payment instead

#### Validation Error

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "details": [{"field": "items", "message": "At least one item required"}]
  }
}
```

**Solution:** Check request body matches schema requirements.

---

### Performance Issues

#### Slow API Response

**Diagnosis:**
```bash
# Check response time
curl -w "@curl-format.txt" http://localhost:8000/api/invoices

# Check database queries
tail -f logs/slow_queries.log
```

**Common Causes:**
1. Missing index
2. N+1 queries
3. Large result set without pagination

**Solutions:**
```sql
-- Add missing index
CREATE INDEX idx_invoices_customer ON sales.invoices(org_id, customer_id);

-- Use EXPLAIN to check query plan
EXPLAIN ANALYZE SELECT * FROM sales.invoices WHERE org_id = '...' AND customer_id = 123;
```

#### High Memory Usage

**Diagnosis:**
```bash
# Check process memory
ps aux | grep uvicorn

# Check database connections
SELECT count(*) FROM pg_stat_activity;
```

**Solutions:**
1. Add pagination to large queries
2. Close database connections properly
3. Reduce connection pool size

---

### Frontend Issues

#### API Connection Failed

```
Network Error: Failed to fetch
```

**Causes:**
- Backend not running
- CORS not configured
- Wrong API URL

**Solutions:**
```bash
# Check backend is running
curl http://localhost:8000/health

# Check CORS in backend .env
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173

# Check frontend .env
VITE_API_URL=http://localhost:8000
```

#### Build Fails

```
Error: Cannot find module 'xxx'
```

**Solution:**
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

#### White Screen

**Diagnosis:**
- Check browser console for errors
- Check React error boundary

**Common Causes:**
1. JavaScript error in component
2. Missing environment variable
3. API returning unexpected data

---

### Environment Issues

#### .env Not Loaded

```python
KeyError: 'DATABASE_URL'
```

**Solution:**
```bash
# Check .env exists
ls -la .env

# If missing, copy from example
cp .env.example .env

# Verify python-dotenv installed
pip install python-dotenv
```

#### Wrong Environment

**Symptoms:**
- Connecting to production database from local
- Wrong API endpoints

**Solution:**
```bash
# Check current environment
echo $ENVIRONMENT

# Verify .env points to local resources
cat .env | grep DATABASE_URL
```

---

### Git Issues

#### Merge Conflicts

```bash
# See conflicting files
git status

# Open in editor and resolve
# Look for <<<<<<< markers

# After resolving
git add .
git commit -m "Resolved conflicts"
```

#### Pre-commit Hook Failed

```bash
# Run manually to see errors
flake8 app/
black app/ --check
mypy app/

# Auto-fix formatting
black app/
```

---

## Debug Techniques

### Backend Logging

```python
import logging
logger = logging.getLogger(__name__)

# Add to code
logger.debug(f"Processing invoice: {invoice_id}")
logger.info(f"Invoice created: {invoice_number}")
logger.warning(f"Low stock for product: {product_id}")
logger.error(f"Failed to process: {e}")
```

### SQL Query Logging

```python
# In database.py
import logging
logging.getLogger('sqlalchemy.engine').setLevel(logging.DEBUG)
```

### Request Debugging

```python
# Middleware to log all requests
@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info(f"Request: {request.method} {request.url}")
    response = await call_next(request)
    logger.info(f"Response: {response.status_code}")
    return response
```

---

## Getting Help

1. **Check this guide** - Most issues covered here
2. **Search existing issues** - GitHub Issues
3. **Ask in chat** - #dev-pharmacy channel
4. **Include details when asking:**
   - Error message
   - Steps to reproduce
   - Environment info
   - Relevant logs

---

## See Also

- [Getting Started](getting-started.md)
- [Development Workflow](development.md)
- [Testing Guide](testing.md)
