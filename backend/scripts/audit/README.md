# Backend Audit Scripts 🔍

Comprehensive code quality and schema validation tools.

## Directory Structure

```
scripts/
├── audit/
│   ├── comprehensive_schema_audit.py  # Full schema validation
│   ├── payment_idempotency_readiness.py # Dedicated payment replay store gate
│   ├── validate_constants.py          # Constants usage checker
│   ├── transaction_integrity_audit.py # Stock and finance release blockers
│   ├── contract_consistency_audit.py  # Identifier and API contract blockers
│   └── README.md                       # This file
├── audit_schema.py                     # Legacy schema audit
├── audit_sales_schema.py               # Sales module specific
└── extract_schema_docs.py              # Schema documentation generator
```

## Audit Scripts

### 1. Comprehensive Schema Audit
**Purpose**: Validates SQL queries, column names, and coding patterns across all modules

```bash
# Audit all modules
python scripts/audit/comprehensive_schema_audit.py

# Audit specific module
python scripts/audit/comprehensive_schema_audit.py --module sales
python scripts/audit/comprehensive_schema_audit.py --module purchase
```

**Checks**:
- ✅ Hardcoded status values
- ✅ Missing constants imports
- ✅ SQL query issues (SELECT *, etc.)
- ✅ Column name mismatches

### 2. Constants Validator
**Purpose**: Ensures proper usage of centralized constants from `app/core/utils/constants.py`

```bash
# Quick scan
python scripts/audit/validate_constants.py

# Full report
python scripts/audit/validate_constants.py --show-all
```

**Detects**:
- ⚠️  Hardcoded strings like `"pending"`, `"active"`
- ⚠️  Missing constants imports
- ⚠️  Duplicate constant definitions

**Suggests**:
- Use `OrderStatus.PENDING.value`
- Use `InvoiceStatus.GENERATED.value`
- Import from `app.core.utils.constants`

### 3. Transaction Integrity Audit

**Purpose**: Fails the release when inventory or finance has competing mutation
owners, missing payment idempotency, mutable posted journals, missing allocation
projection reconciliation, unbaselined finance schema, or duplicated calculation
ownership.

```bash
python scripts/audit/transaction_integrity_audit.py
```

This audit is intentionally fail-closed. A non-zero exit identifies production
blockers that require an implemented invariant, not an allowlist entry.

### 4. Contract Consistency Audit

**Purpose**: Fails the release for competing document-number authorities,
divergent status enums, untrusted GST rate inputs, tenant/branch identifier
conflicts, lossy money or timestamp serialization, and untyped mutation
responses.

```bash
python scripts/audit/contract_consistency_audit.py
```

This audit reports checked-in conflicts without assuming which unbaselined SQL
definition is deployed. Resolve an issue by establishing and testing one
authority; do not suppress the code with an allowlist.

### 5. Payment Idempotency Readiness

**Purpose**: Prevents promotion while payment replay relies on a temporary
payment-note field or the live schema and dedicated replay store are unbaselined.
Cancel, reconciliation, and allocation routes require an idempotency key and
fail before database access until that store is implemented.

```bash
python scripts/audit/payment_idempotency_readiness.py
```

The audit consumes `docs/architecture/payment-idempotency-store.json`. That
contract is migration-neutral and must not be marked implemented until the live
schema baseline and reviewed Alembic migration exist.

## Best Practices

### Using Constants ✅

**Good**:
```python
from app.core.utils.constants import OrderStatus, InvoiceStatus

# In code
status = OrderStatus.PENDING.value

# In SQL
db.execute(text("""
    UPDATE orders SET status = :status
"""), {"status": OrderStatus.CONFIRMED.value})
```

**Bad** ❌:
```python
# Hardcoded string
status = "pending"

# In SQL
query = "UPDATE orders SET status = 'pending'"
```

### Available Constants

See `app/core/utils/constants.py` for full list:

- `OrderStatus` - draft, pending, confirmed, completed, cancelled
- `InvoiceStatus` - draft, generated, issued, paid
- `PaymentStatus` - pending, paid, overdue
- `GRNStatus` - pending, received, partial
- `BatchStatus` - active, expired, quarantine
- `PaymentMethod` - cash, card, upi, bank
- And 10+ more enums!

## Running Audits

### Pre-commit Check
```bash
# Run before committing changes
python scripts/audit/validate_constants.py
python scripts/audit/comprehensive_schema_audit.py --module sales
```

### CI/CD Integration
Add to your CI pipeline:
```yaml
- name: Validate Constants
  run: python scripts/audit/validate_constants.py
  
- name: Schema Audit
  run: python scripts/audit/comprehensive_schema_audit.py

- name: Transaction Integrity Audit
  run: python scripts/audit/transaction_integrity_audit.py

- name: Payment Idempotency Readiness
  run: python scripts/audit/payment_idempotency_readiness.py

- name: Contract Consistency Audit
  run: python scripts/audit/contract_consistency_audit.py
```

### IDE Integration
Add as external tool in VSCode/PyCharm:
- Tool: `python`
- Arguments: `scripts/audit/validate_constants.py`
- Working directory: `$ProjectFileDir$`

## Common Issues & Fixes

### Issue: Hardcoded "pending"
```python
# Before
if status == "pending":
    ...

# After
from app.core.utils.constants import OrderStatus

if status == OrderStatus.PENDING.value:
    ...
```

### Issue: Missing Constants Import
```python
# Before
def create_order():
    return {"status": "pending"}

# After
from app.core.utils.constants import OrderStatus

def create_order():
    return {"status": OrderStatus.PENDING.value}
```

### Issue: Duplicate Enums
If you find duplicate enum definitions, consolidate to `constants.py`:

```python
# Remove from service file
class Status(Enum):
    PENDING = "pending"
    
# Use central constant instead
from app.core.utils.constants import OrderStatus
```

## Maintenance

### Adding New Constants
1. Add to `app/core/utils/constants.py`
2. Update `CONSTANTS_MAP` in `validate_constants.py`
3. Run audit to find hardcoded values
4. Refactor code to use new constant

### Updating Audit Scripts
- Keep patterns in sync with constants.py
- Add new SQL validation rules as needed
- Update module definitions for new modules

## Support

For questions or issues with audit scripts, see:
- `app/core/utils/constants.py` - Available constants
- Backend team documentation
- Code review guidelines
