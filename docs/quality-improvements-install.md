# Quality Improvement Installation Guide

## Phase 1: Tests (DONE ✅)
All test files created in `backend/tests/`

## Phase 2: Schema Validation (DONE ✅)
Schemas and middleware created.

**To activate**:
1. Add to `main.py` or app initialization:
```python
from app.api.middleware.validation import add_validation_middleware
add_validation_middleware(app)
```

## Phase 3: Quality Gates (DONE ✅)

### Pre-commit Hook Installation
```bash
# Copy the hook
cp scripts/pre-commit-hook.sh .git/hooks/pre-commit

# Make executable
chmod +x .git/hooks/pre-commit
```

### Calculation Audit Usage
In `invoice_service.py`:
```python
from app.api.shared.audit import CalculationAuditor

# When creating invoice
auditor = CalculationAuditor()
auditor.audit_invoice_totals(frontend_totals, backend_totals, invoice_number)
```

## Phase 4: Database Constraints (Next)
SQL migration scripts to be created.

---

**Current Status**: 
- Phase 1: ✅ Complete
- Phase 2: ✅ Complete  
- Phase 3: ✅ Complete
- Phase 4: In progress
