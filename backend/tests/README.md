# Backend Test Suite

## Structure

- `root_level/` - Tests moved from backend root
- `modules/` - Domain-specific tests
- `integration/` - Integration tests
- `validation/` - Business logic validation
- `api/` - API endpoint tests
- `workflows/` - End-to-end workflow tests

## Running Tests

```bash
# Run all tests
python -m pytest tests/

# Run specific module tests
python -m pytest tests/modules/

# Run integration tests
python -m pytest tests/integration/

# Run with coverage
python -m pytest tests/ --cov=app
```

## Test Categories

- `test_01_*.py` through `test_23_*.py` - Comprehensive API tests
- `test_*_workflow.py` - End-to-end workflows
- `test_*_validation.py` - Business logic validation
