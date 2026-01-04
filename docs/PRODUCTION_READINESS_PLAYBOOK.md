# Production Readiness Playbook
## Backend Module Improvement Guide

This playbook documents all improvements applied to `backend/app/core` and `backend/app/api/services/sales` to bring them to production quality. Apply these steps to any module to ensure consistency and production readiness.

---

## 🎯 Progress Tracker

| Module | Status | Notes |
|--------|--------|-------|
| ✅ `core/` | **COMPLETE** | Reorganized into auth/, security/, utils/. All files have type hints, clean exports |
| ✅ `services/purchase/parsers/` | **COMPLETE** | Consolidated 8 files → 3 files. Added Pydantic schemas, removed duplicates |
| ✅ `services/inventory/` | **COMPLETE** | Extracted schemas to schemas/inventory/stock.py. Security audit passed |
| ✅ `routes/inventory/` | **COMPLETE** | Consolidated 3 files → 1, removed 990 lines of inline SQL |
| ⚠️ `routes/sales/` | **NEEDS WORK** | 82 instances of inline SQL, needs modular service structure |
| 🔄 `services/master/` | **IN PROGRESS** | Starting audit |
| ⏳ `services/purchase/` | **PENDING** | |
| ⏳ `services/sales/` | **PENDING** | Needs modular restructure (invoice/, order/, shared/) |
| ⏳ `services/finance/` | **PENDING** | |
| ⏳ `routes/master/` | **PENDING** | |
| ⏳ `routes/purchase/` | **PENDING** | |
| ⏳ `routes/finance/` | **PENDING** | |

**Last Updated**: 2026-01-04

---

## Quick Reference Checklist

```
□ 1. Directory Structure Audit
□ 2. Delete Empty/Deprecated Files
□ 3. Consolidate Duplicates
□ 4. Add Type Hints
□ 5. Create Pydantic Schemas
□ 6. Fix Error Handling
□ 7. Replace Magic Numbers with Constants
□ 8. Add Proper Logging
□ 9. Security Review
□ 10. Update Imports
□ 11. Create __init__.py Exports
□ 12. Consolidate Duplicate Routes (NEW)
□ 13. Move Inline Logic to Services (NEW)
□ 14. Verify & Test
```

---

## 1. Directory Structure Audit

### Goal
Ensure files are in logical locations following the project structure.

### Standard Structure
```
backend/app/
├── core/                    # Shared infrastructure
│   ├── auth/               # Authentication (jwt_auth, org_context, tenant_service)
│   ├── security/           # Authorization (permissions, role_management)
│   └── utils/              # Shared utilities (constants, api_utils, state_utils)
├── api/
│   ├── routes/             # HTTP endpoints only
│   │   └── {module}/       # Module routes
│   ├── schemas/            # Pydantic request/response models
│   │   └── {module}/       # Module schemas
│   └── services/           # Business logic
│       └── {module}/       # Module services + sub-components
├── middleware/             # FastAPI middleware
└── repositories/           # Data access layer (optional)
```

### What to Check
| Item | Action |
|------|--------|
| Empty folders | DELETE |
| Files at wrong level | MOVE to correct location |
| Duplicate folders (e.g., `utils/` and `core/utils/`) | MERGE into single location |
| Deprecated/archive folders | DELETE after review |
| Missing `__init__.py` | CREATE with proper exports |

### Example Moves We Made
```
app/dependencies.py → app/core/auth/dependencies.py
app/utils/*         → app/core/utils/
app/version.py      → app/core/version.py
infrastructure/parsers/ → api/services/purchase/parsers/
```

---

## 2. Delete Empty/Deprecated Files

### What to Delete
- Empty folders (no files, just `__init__.py`)
- `archive/` folders with deprecated code
- Placeholder files (like unused `models.py`)
- Duplicate files that aren't imported anywhere

### How to Find
```bash
# Find empty directories
find backend/app -type d -empty

# Find unused Python files (check before deleting!)
grep -rL "from.*{filename}" backend/app/
```

### Files We Deleted
- `app/models.py` (placeholder, never used)
- `app/database/` (empty)
- `app/domain/` (empty DDD scaffolding)
- `api/middleware/` (duplicate of `app/middleware/`)
- `api/services/archive/` (deprecated code)

---

## 3. Consolidate Duplicates

### What to Look For
1. **Same functionality in multiple files**
   - Base class + Enhanced class → Merge into one
   - Generic parser + Vendor parsers → Combine with patterns

2. **Similar code patterns repeated**
   - Extract to shared utility
   - Create base class or mixin

3. **Config scattered across files**
   - Consolidate into single config file

### Example: Parser Consolidation
```
BEFORE (8 files, 1,606 lines):
parsers/
├── base/base_parser.py
├── base/enhanced_parser.py
├── vendors/generic_parser.py
├── vendors/arpii_parser.py
├── vendors/polestar_parser.py
└── vendors/pharma_biological_parser.py

AFTER (3 files, 689 lines):
parsers/
├── __init__.py
├── schemas.py
└── invoice_parser.py
```

---

## 4. Add Type Hints

### Before
```python
def calculate_tax(amount, rate):
    return amount * rate / 100
```

### After
```python
from decimal import Decimal

def calculate_tax(amount: Decimal, rate: Decimal) -> Decimal:
    """Calculate tax amount from base amount and rate."""
    return amount * rate / Decimal("100")
```

### Rules
1. **All function arguments** must have type hints
2. **All return types** must be specified
3. Use `Optional[X]` for nullable values
4. Use `Decimal` for money, not `float`
5. Use `datetime` and `date` properly
6. Use `List[X]`, `Dict[K, V]`, `Tuple[X, Y]` for collections

### Common Types
```python
from typing import Optional, List, Dict, Any, Tuple
from decimal import Decimal
from datetime import datetime, date
from uuid import UUID
from pathlib import Path
```

---

## 5. Create Pydantic Schemas

### Purpose
- Validate input/output data
- Self-documenting API contracts
- Automatic serialization

### Template
```python
from pydantic import BaseModel, Field, field_validator
from decimal import Decimal
from datetime import date
from typing import Optional, List

class ItemSchema(BaseModel):
    """Single line item with validation."""
    
    product_name: str = Field(..., min_length=1, description="Product name")
    quantity: int = Field(..., ge=1, description="Quantity must be positive")
    unit_price: Decimal = Field(..., ge=0, description="Price per unit")
    discount_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    
    @field_validator('product_name')
    @classmethod
    def clean_name(cls, v: str) -> str:
        return v.strip()

class InvoiceSchema(BaseModel):
    """Complete invoice with nested items."""
    
    invoice_number: str
    invoice_date: date
    customer_id: int
    items: List[ItemSchema] = Field(default_factory=list, min_length=1)
    
    model_config = {"str_strip_whitespace": True}
```

---

## 6. Fix Error Handling

### ❌ Bad: Bare Except
```python
try:
    result = process_data()
except:
    pass
```

### ✅ Good: Specific Exceptions with Logging
```python
import logging

logger = logging.getLogger(__name__)

try:
    result = process_data()
except ValueError as e:
    logger.warning(f"Invalid data format: {e}")
    raise ValidationError(f"Invalid input: {e}")
except DatabaseError as e:
    logger.error(f"Database operation failed: {e}")
    raise ServiceError("Unable to save data")
```

### Custom Exception Classes
```python
class ServiceError(Exception):
    """Base exception for service layer errors."""
    pass

class ValidationError(ServiceError):
    """Input validation failed."""
    pass

class NotFoundError(ServiceError):
    """Requested resource not found."""
    pass

class AuthorizationError(ServiceError):
    """User not authorized for this action."""
    pass
```

---

## 7. Replace Magic Numbers with Constants

### ❌ Bad: Magic Numbers
```python
if discount > 40:
    raise ValueError("Discount too high")

tax = amount * 12 / 100
```

### ✅ Good: Named Constants
```python
from decimal import Decimal

class BusinessLimits:
    MAX_DISCOUNT_PERCENT = Decimal("40")
    DEFAULT_TAX_PERCENT = Decimal("12")
    MAX_CREDIT_DAYS = 90
    MIN_ORDER_AMOUNT = Decimal("0")

class OrderStatus:
    DRAFT = "draft"
    CONFIRMED = "confirmed"
    SHIPPED = "shipped"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"

# Usage
if discount > BusinessLimits.MAX_DISCOUNT_PERCENT:
    raise ValueError(f"Discount cannot exceed {BusinessLimits.MAX_DISCOUNT_PERCENT}%")

tax = amount * BusinessLimits.DEFAULT_TAX_PERCENT / Decimal("100")
```

### Where to Put Constants
```
core/utils/constants.py    # Shared business constants
api/schemas/{module}/      # Module-specific enums
```

---

## 8. Add Proper Logging

### Setup
```python
import logging

logger = logging.getLogger(__name__)
```

### Levels
| Level | When to Use |
|-------|-------------|
| `DEBUG` | Detailed diagnostic info (query params, intermediate values) |
| `INFO` | Normal operations (created invoice, processed payment) |
| `WARNING` | Unexpected but handled (using default, deprecated feature) |
| `ERROR` | Failed operations (save failed, external API error) |
| `CRITICAL` | System-level failures (database down, auth service unreachable) |

### Examples
```python
logger.debug(f"Processing invoice {invoice_id} with {len(items)} items")
logger.info(f"Invoice {invoice_number} created successfully, total={grand_total}")
logger.warning(f"Customer {customer_id} has no credit limit set, using default")
logger.error(f"Failed to save invoice {invoice_id}: {error}")
```

---

## 9. Security Review

### Checklist
| Item | Check |
|------|-------|
| SQL Injection | Use parameterized queries with `text()` and `bindparams` |
| Authentication | All endpoints require valid JWT via `decode_jwt` |
| Authorization | Check permissions before data access |
| Tenant Isolation | Use `TenantAwareSession` for all queries |
| Input Validation | Pydantic schemas on all inputs |
| Secrets | No hardcoded keys, use environment variables |
| RLS | Database-level row security enabled |

### RLS Pattern
```python
from sqlalchemy import text

# Always use parameterized queries
result = db.execute(
    text("SELECT * FROM sales.invoices WHERE org_id = :org_id"),
    {"org_id": org_id}
)

# Or use TenantAwareSession which auto-filters
with TenantAwareSession(db, org_id=context.org_id) as session:
    invoices = session.query(Invoice).all()  # Auto-filtered by org_id
```

### Permission Check Pattern
```python
from app.core.security.permissions import require_permission

@router.post("/invoices")
async def create_invoice(
    data: InvoiceCreate,
    db: Session = Depends(get_db),
    context: OrgContext = Depends(get_org_context),
):
    # Check permission before any operation
    if not require_permission(db, context.user_id, "sales", "create"):
        raise HTTPException(status_code=403, detail="Permission denied")
    
    # Proceed with operation
    return await invoice_service.create(db, data, context)
```

---

## 10. Update Imports

### After Moving Files
Run these commands to fix imports:

```bash
# Find files with old import paths
grep -r "from \.\.\.core\.{old_module}" backend/app --include="*.py"

# Batch update (be careful!)
find backend/app -name "*.py" -exec sed -i '' \
    's/from \.\.\.core\.tenant_service/from ...core.auth.tenant_service/g' {} \;
```

### ⚠️ No Import Aliases Rule

**CRITICAL**: Do NOT use import aliases to maintain backward compatibility. This creates technical debt and confusion.

❌ **BAD** - Using aliases as fallbacks:
```python
# Don't do this!
from ...core.security.permissions import PermissionChecker
from ...core.permissions import PermissionChecker  # Old path as fallback
```

✅ **GOOD** - Single import path:
```python
from ...core.security.permissions import PermissionChecker
```

**Why?**
- Multiple import paths for the same thing creates confusion
- Makes it unclear which is the "correct" import
- Prevents finding all usages via grep
- Makes refactoring harder

**Instead**: Update ALL imports when moving files using `sed` or find/replace.

### Import Order
```python
# 1. Standard library
import os
import logging
from datetime import datetime
from decimal import Decimal
from typing import Optional, List

# 2. Third-party packages
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

# 3. Local imports (relative)
from ...core.auth.tenant_service import TenantAwareSession
from ...core.security.permissions import require_permission
from ..schemas.sales.invoice import InvoiceCreate, InvoiceResponse
```

---

## 11. Create `__init__.py` Exports

### Purpose
- Clean public API for the module
- Hide internal implementation details
- Enable simple imports

### Template
```python
"""
Module Name
Brief description of what this module provides

Usage:
    from app.api.services.{module} import ServiceClass
    
    service = ServiceClass()
    result = service.do_something()
"""

from .service import ServiceClass
from .schemas import InputSchema, OutputSchema
from .exceptions import ServiceError

__all__ = [
    "ServiceClass",
    "InputSchema",
    "OutputSchema",
    "ServiceError",
]
```

### Benefits
```python
# Instead of
from app.api.services.purchase.parsers.invoice_parser import InvoiceParser

# You can do
from app.api.services.purchase.parsers import InvoiceParser
```

---

## 12. Consolidate Duplicate Routes

### Goal
Eliminate duplicate API endpoints across route files to prevent routing conflicts and maintenance issues.

### What to Look For

#### Duplicate Endpoints
Multiple route files defining the same endpoint path:

```python
# ❌ BAD - Same endpoint in multiple files
# routes/inventory/receive.py
@router.get("/current")
async def get_current_stock(...):
    # 135 lines of SQL...

# routes/inventory/dashboard.py
@router.get("/current")  # DUPLICATE!
async def get_current_stock(...):
    # 117 lines of different SQL...

# routes/inventory/stock.py
@router.get("/current")  # DUPLICATE!
async def list_current_stock(...):
    # Uses service properly
```

#### How to Find Duplicates

```bash
# Find all route decorators
grep -r "@router\." backend/app/api/routes/{module} --include="*.py"

# Look for duplicate paths
grep -r "@router\.get\|@router\.post" backend/app/api/routes/{module} | \
  awk -F'"' '{print $2}' | sort | uniq -d
```

### Consolidation Strategy

1. **Identify the canonical file** - Usually the one using services properly
2. **Extract missing functionality** - Move any unique logic to services
3. **Delete duplicate files** - Remove files with redundant endpoints
4. **Update imports** - Fix `__init__.py` and any dependent code

### Example: Inventory Routes Consolidation

**BEFORE** (3 files with duplicates):
```
routes/inventory/
├── receive.py (624 lines, inline SQL)     ❌ DELETE
├── dashboard.py (366 lines, inline SQL)   ❌ DELETE
└── stock.py (466 lines, uses services)    ✅ KEEP
```

**AFTER** (1 canonical file):
```
routes/inventory/
└── stock.py (466 lines, uses services)    ✅ CANONICAL
```

### Checklist

- [ ] Run grep to find all route decorators
- [ ] Identify duplicate endpoint paths
- [ ] Choose canonical implementation (prefer service-based)
- [ ] Extract unique logic to services
- [ ] Delete duplicate route files
- [ ] Update `__init__.py` imports
- [ ] Test all endpoints still work

---

## 13. Move Inline Logic to Services

### Goal
Remove business logic and SQL queries from route handlers. Routes should only handle HTTP concerns (validation, serialization, error codes).

### The Golden Rule

> **Routes handle HTTP. Services handle business logic.**

### ❌ Bad: Inline Business Logic in Routes

```python
# routes/inventory/receive.py
@router.get("/current")
async def get_current_stock(db: Session):
    # 135 lines of complex SQL with CTEs
    query = """
        WITH batch_summary AS (
            SELECT 
                product_id,
                SUM(quantity_available) as total_stock,
                SUM(quantity_reserved) as total_reserved,
                -- 50+ more lines of SQL...
            FROM inventory.batches
            WHERE org_id = :org_id
            GROUP BY product_id
        )
        SELECT 
            p.product_id,
            p.product_name,
            -- 30+ more lines...
        FROM inventory.products p
        LEFT JOIN batch_summary bs ON p.product_id = bs.product_id
        WHERE p.org_id = :org_id
    """
    
    result = db.execute(text(query), {"org_id": org_id})
    
    # More business logic...
    products = []
    for row in result:
        product_data = dict(row._mapping)
        product_data["low_stock"] = product_data["current_stock"] <= product_data["reorder_level"]
        # More calculations...
        products.append(product_data)
    
    return products
```

**Problems:**
- 135 lines of SQL in route handler
- Business logic mixed with HTTP handling
- Impossible to test without HTTP context
- Can't reuse logic elsewhere
- Violates single responsibility principle

### ✅ Good: Service Layer Pattern

```python
# routes/inventory/stock.py
@router.get("/stock/current")
@with_tenant_context
async def list_current_stock(
    category: Optional[str] = None,
    low_stock_only: bool = False,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    """List current stock levels - delegates to service"""
    try:
        # Route only handles HTTP concerns
        stocks = InventoryService.list_current_stock(
            db=db,
            org_id=context.org_id,
            category=category,
            low_stock_only=low_stock_only,
            skip=skip,
            limit=limit
        )
        return {"total": len(stocks), "stocks": stocks}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise handle_error(e, "list current stock")

# services/inventory/inventory_service.py
class InventoryService:
    @staticmethod
    def list_current_stock(
        db: Session,
        org_id: UUID,
        category: Optional[str] = None,
        low_stock_only: bool = False,
        skip: int = 0,
        limit: int = 100
    ) -> List[CurrentStock]:
        """Business logic for listing current stock"""
        # All SQL and business logic here
        query = """..."""  # Complex query
        result = db.execute(text(query), params)
        
        # Business calculations
        stocks = []
        for row in result:
            stock = CurrentStock(**dict(row._mapping))
            stock.is_below_minimum = stock.total_quantity < 10
            stocks.append(stock)
        
        return stocks
```

**Benefits:**
- Route is 15 lines vs 135 lines
- Service is testable without HTTP
- Logic is reusable
- Clear separation of concerns
- Easy to maintain

### What Counts as "Inline Logic"?

| ❌ Belongs in Service | ✅ OK in Route |
|---------------------|---------------|
| SQL queries (especially CTEs) | Request validation |
| Business calculations | Response serialization |
| Data transformations | Error code mapping |
| Aggregations | Permission checks |
| Complex filtering | Dependency injection |
| Multi-step operations | HTTP status codes |

### How to Identify Inline Logic

**Red Flags:**
- Route function > 50 lines
- SQL queries with `text()`
- `for` loops processing data
- Business calculations
- Multiple database calls
- Complex conditionals

**Quick Check:**
```bash
# Find long route functions (likely have inline logic)
find backend/app/api/routes -name "*.py" -exec wc -l {} \; | sort -rn

# Find inline SQL in routes
grep -r "text(\"\"\"" backend/app/api/routes/{module}
```

### Migration Pattern

1. **Create service method**
   ```python
   # services/{module}/{module}_service.py
   class ModuleService:
       @staticmethod
       def operation_name(db: Session, ...) -> ReturnType:
           # Move SQL and logic here
           pass
   ```

2. **Update route to call service**
   ```python
   # routes/{module}/routes.py
   @router.get("/endpoint")
   async def handler(...):
       try:
           result = ModuleService.operation_name(db, ...)
           return result
       except ValueError as e:
           raise HTTPException(status_code=400, detail=str(e))
   ```

3. **Delete old inline code**

### Checklist

- [ ] Identify routes with inline SQL (grep for `text("""`)
- [ ] Identify routes > 50 lines
- [ ] Create service methods for business logic
- [ ] Update routes to call services
- [ ] Remove inline SQL and calculations from routes
- [ ] Verify routes are thin (< 30 lines each)
- [ ] Test service methods independently

---

## 14. Verify & Test

### Import Check
```bash
cd backend
python -c "from app.main import app; print('✅ All imports OK')"
```

### Module-Specific Check
```bash
python -c "from app.api.services.{module} import *; print('✅ Module OK')"
```

### Type Check (if using mypy)
```bash
mypy backend/app/api/services/{module}
```

### Run Tests
```bash
pytest backend/tests/services/{module} -v
```

---

## Appendix: File Templates

### Service Class Template
```python
"""
{Module} Service
Business logic for {module} operations
"""
from typing import Optional, List
from decimal import Decimal
from sqlalchemy.orm import Session
import logging

from ...core.auth.tenant_service import TenantContext
from ...core.utils.constants import BusinessLimits
from ..schemas.{module} import CreateSchema, UpdateSchema, ResponseSchema

logger = logging.getLogger(__name__)


class {Module}Service:
    """Handles {module} business operations."""
    
    def __init__(self, db: Session, org_id: str):
        self.db = db
        self.org_id = org_id
    
    def create(self, data: CreateSchema) -> ResponseSchema:
        """Create a new {module} record."""
        logger.info(f"Creating {module} for org {self.org_id}")
        
        # Validation
        self._validate(data)
        
        # Business logic
        result = self._process(data)
        
        logger.info(f"Created {module} {result.id}")
        return result
    
    def _validate(self, data: CreateSchema) -> None:
        """Validate input data."""
        if data.amount > BusinessLimits.MAX_AMOUNT:
            raise ValueError(f"Amount exceeds limit")
    
    def _process(self, data: CreateSchema) -> ResponseSchema:
        """Core processing logic."""
        # Implementation
        pass
```

---

## Summary of Changes Made

| Area | Before | After |
|------|--------|-------|
| `core/` structure | Flat, mixed concerns | Organized into `auth/`, `security/`, `utils/` |
| Empty folders | 9 empty folders | All deleted |
| Parsers | 8 files, 1,606 lines | 3 files, 689 lines |
| Type hints | ~20% coverage | 100% coverage |
| Error handling | Bare excepts | Specific exceptions + logging |
| Magic numbers | Throughout | Constants in `core/utils/constants.py` |
| Imports | Inconsistent paths | Updated after reorganization |
| `__init__.py` | Missing/minimal | Clean exports in all modules |
| **Route duplicates** | **Multiple files, same endpoints** | **Consolidated to canonical files** |
| **Inline logic** | **SQL/business logic in routes** | **Moved to service layer** |

---

## 15. Modular Service Architecture (NEW)

### Problem: Monolithic Service Files

As you move inline SQL from routes to services, service files can become too large (1,000+ lines).

### Solution: Break Services into Sub-Modules

Organize by **domain** and **responsibility**:

```
backend/app/api/services/{module}/
├── __init__.py                    # Clean exports
├── {entity}/                      # Entity domain
│   ├── __init__.py               # Export main service
│   ├── {entity}_service.py       # Orchestration (200-400 lines)
│   ├── {entity}_repository.py    # Data access (300-500 lines)
│   ├── {entity}_validator.py     # Business rules (100-300 lines)
│   └── {entity}_calculator.py    # Pure logic (100-300 lines)
└── shared/                        # Shared utilities
    └── ...
```

### File Size Guidelines

| File Type | Recommended Lines | Max Lines | Purpose |
|-----------|------------------|-----------|---------|
| Service (Orchestration) | 200-400 | 500 | Coordinates operations |
| Repository (Data Access) | 300-500 | 700 | All SQL queries |
| Validator (Business Rules) | 100-300 | 400 | Validation logic |
| Calculator (Pure Logic) | 100-300 | 400 | Calculations (no DB) |

### Example: Sales Module Structure

```
services/sales/
├── __init__.py
├── calculations.py                # Shared calculations
│
├── invoice/                       # Invoice domain
│   ├── __init__.py
│   ├── invoice_service.py        # Orchestrates invoice operations
│   ├── invoice_repository.py     # All invoice SQL queries
│   ├── invoice_validator.py      # Invoice business rules
│   └── invoice_calculator.py     # Tax/total calculations
│
├── order/                         # Order domain
│   ├── __init__.py
│   ├── order_service.py
│   ├── order_repository.py
│   └── order_validator.py
│
└── shared/                        # Shared utilities
    ├── stock_manager.py          # Stock validation & deduction
    ├── payment_processor.py      # Payment handling
    └── document_generator.py     # Number generation
```

### Service Layer Pattern

#### Service (Orchestration)
```python
# services/sales/invoice/invoice_service.py
class InvoiceService:
    """High-level invoice operations - orchestrates other layers"""
    
    @staticmethod
    def create_invoice_with_items(db, org_id, user_id, invoice_data):
        # 1. Validate
        InvoiceValidator.validate_invoice_data(invoice_data)
        
        # 2. Get context
        context = InvoiceRepository.get_invoice_context(db, org_id)
        
        # 3. Calculate
        totals = InvoiceCalculator.calculate_totals(invoice_data.items)
        
        # 4. Create invoice
        invoice_id = InvoiceRepository.create_invoice(db, context, totals)
        
        # 5. Create items
        InvoiceRepository.create_invoice_items(db, invoice_id, items)
        
        # 6. Update stock
        StockManager.deduct_stock(db, items)
        
        return invoice_id
```

#### Repository (Data Access)
```python
# services/sales/invoice/invoice_repository.py
class InvoiceRepository:
    """Pure data access - all SQL queries here"""
    
    @staticmethod
    def create_invoice(db, context, totals):
        """Insert invoice record"""
        result = db.execute(text("""
            INSERT INTO sales.invoices (...)
            VALUES (...)
            RETURNING invoice_id
        """), {...})
        return result.scalar()
    
    @staticmethod
    def get_invoice_context(db, org_id, customer_id):
        """Get all context data in one CTE query"""
        result = db.execute(text("""
            WITH customer_data AS (...),
                 branch_data AS (...),
                 user_data AS (...)
            SELECT * FROM customer_data, branch_data, user_data
        """), {...})
        return dict(result.fetchone()._mapping)
```

#### Validator (Business Rules)
```python
# services/sales/invoice/invoice_validator.py
class InvoiceValidator:
    """Business rule validation - no database access"""
    
    @staticmethod
    def validate_invoice_data(invoice_data):
        if not invoice_data.customer_id:
            raise ValueError("Customer ID required")
        
        if not invoice_data.items:
            raise ValueError("At least one item required")
        
        if invoice_data.discount_percent > 100:
            raise ValueError("Discount cannot exceed 100%")
```

#### Calculator (Pure Logic)
```python
# services/sales/invoice/invoice_calculator.py
class InvoiceCalculator:
    """Pure calculation logic - fully testable, no side effects"""
    
    @staticmethod
    def calculate_totals(items, gst_type="CGST/SGST"):
        subtotal = Decimal("0")
        tax = Decimal("0")
        
        for item in items:
            line_total = item.quantity * item.unit_price
            line_tax = line_total * item.gst_percent / 100
            subtotal += line_total
            tax += line_tax
        
        return {"subtotal": subtotal, "tax": tax, "total": subtotal + tax}
```

### Benefits

| Aspect | Monolithic | Modular |
|--------|-----------|---------|
| **File Size** | 1,200+ lines | 200-400 lines each |
| **Testability** | Hard (mixed concerns) | Easy (isolated units) |
| **Maintainability** | Difficult | Easy |
| **Collaboration** | Merge conflicts | Parallel work |
| **Onboarding** | Overwhelming | Gradual |

### Checklist

- [ ] Identify large service files (>500 lines)
- [ ] Create domain subdirectories (invoice/, order/, etc.)
- [ ] Extract repository layer (all SQL queries)
- [ ] Extract validator layer (business rules)
- [ ] Extract calculator layer (pure logic)
- [ ] Update `__init__.py` with clean exports
- [ ] Update route imports
- [ ] Verify tests still pass

---

## 16. Frontend Module Optimization (NEW)

### Goal
Ensure frontend modules follow TypeScript best practices and align with backend schemas.

### Frontend Checklist

```
□ 1. TypeScript Coverage (100%)
□ 2. Type Definitions (Centralized)
□ 3. Variable Naming (Backend Alignment)
□ 4. Dead Code Removal
□ 5. Component Decomposition
□ 6. API Module Organization
```

### 1. TypeScript Coverage

**Goal**: 100% TypeScript, no `.js` files

```bash
# Find JavaScript files
find frontend/src/components/{module} -name "*.js"

# Convert to TypeScript
# 1. Rename .js → .tsx (for React components)
# 2. Add type annotations
# 3. Fix implicit any errors
```

**Example Conversion**:
```javascript
// ❌ Before: BatchesInventory.js
export default function BatchesInventory({ productId }) {
    const [batches, setBatches] = useState([]);
    // ...
}
```

```typescript
// ✅ After: BatchTracking.tsx
interface BatchTrackingProps {
    productId: number;
}

export default function BatchTracking({ productId }: BatchTrackingProps) {
    const [batches, setBatches] = useState<Batch[]>([]);
    // ...
}
```

### 2. Type Definitions (Centralized)

**Goal**: Single source of truth for types

**Structure**:
```
frontend/src/components/{module}/
├── types/
│   └── {module}Types.ts          # All type definitions
├── hooks/                         # Custom hooks
├── ui/                            # UI components
└── utils/                         # Utilities
```

**Example**: [`invoiceTypes.ts`](file:///Users/vikasgarg/Documents/AASO/Infrastructure/production-infra/frontend/src/components/sales/invoice/types/invoiceTypes.ts)
```typescript
/**
 * Invoice Module Type Definitions
 * SINGLE SOURCE OF TRUTH for invoice types
 */

export interface InvoiceItem {
    product_id: number;
    quantity: number;
    unit_price: number;
    // Pricing - batch level uses _per_unit suffix (backend alignment)
    sale_price_per_unit?: number;
    mrp_per_unit?: number;
    // ...
}

export interface Invoice {
    invoice_id: number;
    invoice_number: string;
    customer_id: number;
    items: InvoiceItem[];
    // ...
}
```

### 3. Variable Naming (Backend Alignment)

**Goal**: Frontend types match backend Pydantic schemas exactly

**Check Backend Schema**:
```python
# backend/app/api/schemas/inventory/inventory.py
class BatchBase(BaseModel):
    mrp: Decimal              # NOT mrp_per_unit
    cost_price: Decimal       # NOT cost_per_unit
    sale_price: Decimal       # NOT sale_price_per_unit
```

**Update Frontend Types**:
```typescript
// ✅ Correct - matches backend
export interface BaseBatch {
    mrp: number;              // Matches backend
    cost_price: number;       // Matches backend
    sale_price: number;       // Matches backend
}

// ❌ Wrong - doesn't match backend
export interface BaseBatch {
    mrp_per_unit: number;     // Backend uses 'mrp'
    cost_per_unit: number;    // Backend uses 'cost_price'
}
```

**How to Find Mismatches**:
```bash
# 1. Check backend schema
cat backend/app/api/schemas/{module}/*.py | grep "class.*BaseModel"

# 2. Check frontend types
cat frontend/src/components/{module}/types/*.ts | grep "interface"

# 3. Compare field names
```

### 4. Dead Code Removal

**Find Duplicate/Legacy Components**:
```bash
# Find components not imported anywhere
grep -r "import.*ComponentName" frontend/src --include="*.tsx" --include="*.ts"

# If no results, component is unused
```

**Example**: `BatchesInventory.js` was superseded by `BatchTracking.tsx`
- ❌ Delete: Legacy component
- ✅ Keep: Modern replacement
- Update routing to use new component

### 5. Component Decomposition

**Goal**: Keep components under 500 lines

**Red Flags**:
- Component > 500 lines
- Multiple responsibilities
- Hard to test

**Decomposition Strategy**:
```
Large Component (1,200 lines)
├── Filters (extract to FilterPanel.tsx)
├── Table (extract to DataTable.tsx)
├── Actions (extract to ActionButtons.tsx)
└── Export (extract to ExportDialog.tsx)
```

**Example**: `CurrentStock.tsx` (1,187 lines)
```
Before:
└── CurrentStock.tsx (1,187 lines)

After:
├── CurrentStock.tsx (300 lines - main component)
├── StockFilters.tsx (150 lines)
├── StockTable.tsx (200 lines)
├── StockActions.tsx (100 lines)
└── ExportDialog.tsx (150 lines)
```

### 6. API Module Organization

**Structure**:
```
frontend/src/services/api/modules/{module}/
├── {entity}.api.ts               # Entity-specific API calls
├── {entity}Items.api.ts          # Sub-entity API calls
└── index.ts                      # Barrel export
```

**Example**: Sales API
```typescript
// services/api/modules/sales/invoices.api.ts
export const invoicesApi = {
    create: (data) => apiHelpers.post('/invoices', data),
    getById: (id) => apiHelpers.get(`/invoices/${id}`),
    list: (params) => apiHelpers.get('/invoices', { params }),
    // ...
};
```

### Frontend Module Assessment Template

Use this to audit any frontend module:

```markdown
## {Module} Frontend Audit

### TypeScript Coverage
- [ ] No .js files
- [ ] All components have proper types
- [ ] No implicit any warnings

### Type Definitions
- [ ] Centralized in types/ directory
- [ ] Comprehensive interfaces
- [ ] Backend schema alignment verified

### Variable Naming
- [ ] Matches backend Pydantic schemas
- [ ] No _per_unit mismatches
- [ ] Consistent naming conventions

### Dead Code
- [ ] No unused components
- [ ] No duplicate implementations
- [ ] Routing updated

### Component Size
- [ ] All components < 500 lines
- [ ] Large components decomposed
- [ ] Clear separation of concerns

### API Organization
- [ ] Clean API module structure
- [ ] Consistent naming
- [ ] Proper error handling
```

### Example: Sales Module (Reference Implementation)

The sales module is a **model example** of frontend best practices:

✅ **100% TypeScript** - No JS files
✅ **Comprehensive types** - 575-line `invoiceTypes.ts`
✅ **Backend aligned** - Variable names match schemas
✅ **Clean architecture** - Modular with hooks/UI/utils
✅ **Well-organized** - Clear separation of concerns

**Use sales module as reference for other modules!**

---
