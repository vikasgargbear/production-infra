# Organization ID Strategy for Multi-Tenant Scaling

## Overview
This document outlines the strategy for handling organization IDs (org_id) in a multi-tenant pharmaceutical ERP system.

## Current Approach
- Single default organization for MVP
- `get_or_create_default_org()` function ensures there's always a valid org_id

## Scaling Strategy for Multi-Tenant

### 1. Authentication-Based Org Context
```python
# Future: Extract org_id from JWT token
@router.post("/customers")
async def create_customer(
    customer: CustomerCreate,
    current_user: User = Depends(get_current_user),  # Contains org_id
    db: Session = Depends(get_db)
):
    org_id = current_user.org_id  # From JWT token
```

### 2. Database Design Principles
- **Every table** has `org_id` as first column
- **All queries** filter by org_id
- **Foreign keys** include org_id for data isolation
- **Composite indexes** on (org_id, other_columns)

### 3. API Design Pattern
```python
# Pattern 1: Org ID from Authentication (Preferred)
router = APIRouter(dependencies=[Depends(verify_org_access)])

# Pattern 2: Org ID in URL (for admin/super-admin)
@router.get("/orgs/{org_id}/customers")

# Pattern 3: Header-based (for API integrations)
org_id = request.headers.get("X-Organization-ID")
```

### 4. Implementation Phases

#### Phase 1: Single Tenant (Current)
- Single default organization
- No authentication required
- Focus on core functionality

#### Phase 2: Multi-Tenant Preparation
- Add authentication system
- JWT tokens with org_id claim
- Middleware to inject org_id

#### Phase 3: Full Multi-Tenant
- Organization onboarding API
- Tenant isolation at all levels
- Cross-org reporting for admins

### 5. Code Structure for Scaling

#### Service Layer
```python
class CustomerService:
    def __init__(self, org_id: str):
        self.org_id = org_id
    
    def create_customer(self, customer_data: dict):
        customer_data["org_id"] = self.org_id
        # ... rest of logic
```

#### Repository Pattern
```python
class CustomerRepository:
    def __init__(self, db: Session, org_id: str):
        self.db = db
        self.org_id = org_id
    
    def find_all(self):
        return self.db.query(Customer).filter(
            Customer.org_id == self.org_id
        ).all()
```

#### Middleware
```python
@app.middleware("http")
async def org_context_middleware(request: Request, call_next):
    # Extract org_id from token/header
    org_id = extract_org_id(request)
    request.state.org_id = org_id
    response = await call_next(request)
    return response
```

### 6. Security Considerations
- **Row-Level Security**: PostgreSQL policies based on org_id
- **API Gateway**: Validate org_id at edge
- **Audit Logs**: Track all cross-org access
- **Data Encryption**: Per-tenant encryption keys

### 7. Migration Strategy
1. Add `org_id` to all tables (already done)
2. Create organization management APIs
3. Implement authentication with org context
4. Update all APIs to use authenticated org_id
5. Remove hardcoded defaults

### 8. Best Practices
- Never allow cross-org data access (except super-admin)
- Always validate org_id ownership
- Use database constraints for enforcement
- Log all org-related operations
- Separate databases for large tenants (future)

## Example Implementation

### Current (Single-Tenant)
```python
def get_or_create_default_org(db: Session) -> str:
    # Temporary solution for MVP
    result = db.execute(text("SELECT org_id FROM master.organizations LIMIT 1"))
    return str(result.scalar() or create_default_org(db))
```

### Future (Multi-Tenant)
```python
from fastapi import Depends, HTTPException
from ..auth import get_current_org

@router.post("/customers")
async def create_customer(
    customer: CustomerCreate,
    org_id: str = Depends(get_current_org),  # From auth token
    db: Session = Depends(get_db)
):
    customer_service = CustomerService(db, org_id)
    return customer_service.create(customer)
```

## Database Schema Enforcement
```sql
-- Row Level Security Policy
CREATE POLICY tenant_isolation ON parties.customers
    FOR ALL
    USING (org_id = current_setting('app.current_org_id')::uuid);

-- Enable RLS
ALTER TABLE parties.customers ENABLE ROW LEVEL SECURITY;
```

## Deployment Considerations
- Each organization gets:
  - Unique subdomain (org1.app.com)
  - Separate API keys
  - Isolated data storage
  - Custom configurations
  - Usage limits/quotas

## Monitoring
- Track requests per org
- Monitor data growth per tenant
- Alert on cross-org attempts
- Audit trail per organization