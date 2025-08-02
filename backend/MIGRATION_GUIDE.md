# API Migration Guide: Old to New Backend

## Key Issues When Migrating APIs

### 1. Import Path Issues
**Problem**: Dependencies and relative imports need adjustment
- Old: `from ...dependencies import get_current_org`
- New: Must ensure proper relative imports based on actual file structure
- Fix auth.py: `from ...core.config` → `from .config`

### 2. Router Registration
**Problem**: Not all routers are properly exported in `__init__.py`
- Some routers are exported through `__init__.py` (e.g., `orders_router`, `invoices_router`)
- Others need direct import (e.g., `stock_receive`, `enterprise_delivery_challan`)
- Solution: Check `__init__.py` first, then import missing ones directly

### 3. Schema Mapping Issues
**Problem**: Database schema names have changed
- `master.customers` → `parties.customers`
- `master.products` → `inventory.products`
- `master.addresses` → Still uses `master.addresses`
- Always use schema-qualified names (e.g., `parties.customers`, not just `customers`)

### 4. Column Name Changes
**Problem**: Table columns have been renamed
- Customer table:
  - `phone` → `primary_phone`
  - `email` → `primary_email`
  - `contact_person` → `contact_person_name`
  - `gstin` → `gst_number`
- Always map old field names to new column names

### 5. org_id Requirements
**Problem**: Multi-tenant system requires org_id in all queries
- Use `DEFAULT_ORG_ID` from config
- All WHERE clauses need `AND org_id = :org_id`
- All INSERTs need org_id column

### 6. Router Prefix Conflicts
**Problem**: Some routers define full paths instead of relative
- Bad: `router = APIRouter(prefix="/api/v1/stock")`
- Good: `router = APIRouter(prefix="/stock")`
- Main.py handles the API version prefix

### 7. Service Dependencies
**Problem**: Not all services exist or have different names
- Check `app/api/services/` for available services
- Some old services may be split or renamed
- Create missing services as needed

## Migration Checklist

1. **Check Router Export**
   - Is it in `routes/__init__.py`?
   - If yes, use the exported name
   - If no, import directly

2. **Fix Imports**
   - Update relative imports
   - Check service imports exist
   - Fix config imports

3. **Update Schema References**
   - Replace `master.customers` with `parties.customers`
   - Replace `master.products` with `inventory.products`
   - Keep `master.addresses` as is

4. **Add org_id**
   - Import DEFAULT_ORG_ID
   - Add to all queries
   - Add to all inserts

5. **Fix Column Names**
   - Map old names to new (see mapping above)
   - Update INSERT/UPDATE statements
   - Update SELECT column aliases

6. **Test Endpoints**
   - Check health after deployment
   - Test each endpoint with curl
   - Verify schema/column issues in logs

## Common Patterns

### Getting org_id
```python
from ...core.config import DEFAULT_ORG_ID
# or
org_id = current_org.get("org_id", DEFAULT_ORG_ID)
```

### Schema-qualified queries
```python
# Always use schema
"SELECT * FROM parties.customers WHERE org_id = :org_id"
# Not just
"SELECT * FROM customers"
```

### Column mapping
```python
mapped_data = {
    "primary_phone": customer_data.get("phone"),
    "primary_email": customer_data.get("email"),
    "contact_person_name": customer_data.get("contact_person"),
    "gst_number": customer_data.get("gstin"),
}
```