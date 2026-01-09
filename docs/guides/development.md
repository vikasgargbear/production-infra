# Development Workflow

Standards and practices for daily development.

---

## Git Workflow

### Branch Naming

```
feature/description     # New features
bugfix/description      # Bug fixes
hotfix/description      # Urgent production fixes
refactor/description    # Code refactoring
docs/description        # Documentation updates
```

Examples:
```
feature/bulk-invoice-creation
bugfix/payment-allocation-rounding
hotfix/login-timeout-fix
refactor/invoice-service-split
docs/api-authentication
```

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting (no code change)
- `refactor`: Code restructuring
- `perf`: Performance improvement
- `test`: Adding tests
- `chore`: Maintenance tasks

Examples:
```bash
feat(invoices): add bulk creation endpoint
fix(payments): correct rounding in allocation
docs(api): update authentication examples
refactor(services): extract InvoiceCalculator class
perf(queries): add index for customer search
test(payments): add allocation edge cases
```

### Pull Request Process

1. **Create PR** with descriptive title
2. **Fill template** with changes summary
3. **Request review** from team member
4. **Address feedback** with new commits
5. **Squash merge** when approved

---

## Code Standards

### Python (Backend)

```python
# Type hints required
def create_invoice(
    db: TenantAwareSession,
    org_id: str,
    data: InvoiceCreate
) -> Invoice:
    ...

# Docstrings for public functions
def calculate_line_total(
    quantity: Decimal,
    unit_price: Decimal,
    discount_percent: Decimal = Decimal("0")
) -> Decimal:
    """
    Calculate line total with discount.
    
    Args:
        quantity: Number of units
        unit_price: Price per unit
        discount_percent: Discount (0-100)
    
    Returns:
        Line total after discount
    """
    ...

# Constants from centralized location
from app.core.constants import (
    INVOICE_STATUS_DRAFT,
    INVOICE_STATUS_POSTED,
    DEFAULT_PAGE_SIZE
)

# No magic numbers
limit = DEFAULT_PAGE_SIZE  # ✅ Good
limit = 50                 # ❌ Bad
```

### JavaScript/TypeScript (Frontend)

```typescript
// Functional components with TypeScript
interface InvoiceListProps {
  customerId?: number;
  status?: InvoiceStatus;
}

const InvoiceList: React.FC<InvoiceListProps> = ({ customerId, status }) => {
  // ...
};

// Services for API calls
class InvoiceService {
  static async list(filters: InvoiceFilters): Promise<InvoiceListResponse> {
    const response = await api.get('/invoices', { params: filters });
    return response.data;
  }
}

// Types in separate files
// types/invoice.ts
export interface Invoice {
  invoice_id: number;
  invoice_number: string;
  customer_id: number;
  total_amount: number;
  status: InvoiceStatus;
}
```

---

## Project Patterns

### Service Layer Pattern

```python
# Routes are thin HTTP adapters
@router.post("/invoices")
async def create_invoice(
    data: InvoiceCreate,
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    # Delegate to service
    return InvoiceService.create(db, context, data)

# Services contain business logic
class InvoiceService:
    @staticmethod
    def create(db: TenantAwareSession, context: OrgContext, data: InvoiceCreate) -> dict:
        # 1. Validate business rules
        validate_customer_credit(db, context.org_id, data.customer_id)
        validate_stock_availability(db, context.org_id, data.items)
        
        # 2. Execute business logic
        invoice = insert_invoice(db, context, data)
        
        # 3. Return result
        return invoice
```

### Multi-Tenancy Pattern

```python
# Always include org_id in queries
def get_customer(db: TenantAwareSession, org_id: str, customer_id: int):
    return db.execute("""
        SELECT * FROM parties.customers
        WHERE org_id = :org_id AND customer_id = :customer_id
    """, {"org_id": org_id, "customer_id": customer_id}).fetchone()

# Never trust client-provided org_id
def create_invoice(db, context: OrgContext, data):
    org_id = context.org_id  # ✅ From auth context
    # NOT: org_id = data.org_id  # ❌ Never from client
```

### Error Handling Pattern

```python
from app.core.exceptions import ValidationError, NotFoundError

class InvoiceService:
    @staticmethod
    def get(db, org_id: str, invoice_id: int) -> dict:
        invoice = db.execute(...).fetchone()
        
        if not invoice:
            raise NotFoundError("Invoice not found")
        
        return invoice
    
    @staticmethod
    def create(db, context, data) -> dict:
        if not data.items:
            raise ValidationError("At least one item is required")
        
        if data.total_amount <= 0:
            raise ValidationError("Total amount must be positive")
        
        # ...
```

---

## File Organization

### Backend

```
app/api/routes/{module}/
├── __init__.py           # Router registration
├── routes.py             # (or split into invoices.py, orders.py)
└── schemas.py            # Pydantic models

app/api/services/{module}/
├── __init__.py
├── invoice_service.py
├── order_service.py
└── calculations.py       # Shared helpers
```

### Frontend

```
src/
├── components/
│   ├── common/           # Shared components
│   │   ├── DataTable/
│   │   ├── Modal/
│   │   └── Button/
│   └── invoices/         # Feature-specific
│       ├── InvoiceList/
│       ├── InvoiceForm/
│       └── InvoiceDetails/
├── pages/
│   └── invoices/
│       ├── index.tsx     # List page
│       ├── [id].tsx      # Details page
│       └── new.tsx       # Create page
├── services/
│   ├── api.ts            # Axios instance
│   └── invoiceService.ts
├── store/
│   └── invoiceStore.ts
└── types/
    └── invoice.ts
```

---

## Adding New Features

### Checklist

- [ ] Backend route with proper auth/permissions
- [ ] Service layer with business logic
- [ ] Pydantic schemas for validation
- [ ] Database queries with org_id filtering
- [ ] Unit tests for service logic
- [ ] API tests for endpoints
- [ ] Frontend components
- [ ] Update API documentation

### Example: Adding Report Endpoint

```python
# 1. Schema (schemas/reports.py)
class DailySummaryResponse(BaseModel):
    date: date
    invoice_count: int
    total_sales: Decimal
    total_collections: Decimal

# 2. Service (services/reports_service.py)
class ReportsService:
    @staticmethod
    def daily_summary(db, org_id: str, report_date: date) -> dict:
        return db.execute("""
            SELECT 
                :report_date as date,
                COUNT(*) as invoice_count,
                COALESCE(SUM(total_amount), 0) as total_sales
            FROM sales.invoices
            WHERE org_id = :org_id AND invoice_date = :report_date
        """, {"org_id": org_id, "report_date": report_date}).fetchone()

# 3. Route (routes/reports.py)
@router.get("/daily-summary", response_model=DailySummaryResponse)
async def get_daily_summary(
    report_date: date = Query(default=date.today()),
    _: dict = Depends(PermissionChecker("reports", "view")),
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    return ReportsService.daily_summary(db, context.org_id, report_date)

# 4. Test (tests/test_reports.py)
def test_daily_summary(auth_client, test_invoice):
    response = auth_client.get(f"/api/reports/daily-summary?report_date={date.today()}")
    assert response.status_code == 200
    assert response.json()["data"]["invoice_count"] >= 1
```

---

## Code Review Guidelines

### What Reviewers Check

1. **Correctness**: Does it work as intended?
2. **Security**: Auth, input validation, SQL injection
3. **Performance**: N+1 queries, missing indexes
4. **Maintainability**: Clear code, proper naming
5. **Tests**: Adequate coverage for changes
6. **Documentation**: Updated if needed

### Self-Review Before PR

```bash
# Run linter
flake8 app/
black app/ --check

# Run type checker
mypy app/

# Run tests
pytest

# Check for debug code
grep -r "print(" app/
grep -r "console.log" src/
```

---

## Documentation

### When to Update Docs

- New API endpoint → Update API docs
- Schema change → Update database docs
- New pattern → Update architecture docs
- Bug fix with workaround → Add to troubleshooting

### Where Docs Live

| Doc Type | Location |
|----------|----------|
| API Reference | `docs/backend/api/` |
| Architecture | `docs/backend/architecture/` |
| Schema | `docs/backend/database/` |
| Guides | `docs/guides/` |
| Deployment | `docs/deployment/` |

---

## See Also

- [Getting Started](getting-started.md)
- [Testing Guide](testing.md)
- [Troubleshooting](troubleshooting.md)

---

**Next**: [Testing Guide](testing.md) · [Troubleshooting](troubleshooting.md)
