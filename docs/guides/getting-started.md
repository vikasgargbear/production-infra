# Getting Started

New developer setup and onboarding guide.

---

## Prerequisites

| Tool | Version | Installation |
|------|---------|--------------|
| Python | 3.10+ | [python.org](https://python.org) |
| Node.js | 18+ | [nodejs.org](https://nodejs.org) |
| PostgreSQL | 14+ | [postgresql.org](https://postgresql.org) |
| Redis | 6+ | [redis.io](https://redis.io) |
| Git | Latest | [git-scm.com](https://git-scm.com) |

### Verify Installation

```bash
python --version   # 3.10+
node --version     # 18+
psql --version     # 14+
redis-cli --version
git --version
```

---

## Quick Start

### 1. Clone Repository

```bash
git clone https://github.com/your-org/pharmacy-management.git
cd pharmacy-management
```

### 2. Backend Setup

```bash
# Navigate to backend
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy environment file
cp .env.example .env
# Edit .env with your local settings
```

### 3. Database Setup

```bash
# Create database
createdb pharmacy_dev

# Run migrations
alembic upgrade head

# (Optional) Seed test data
python scripts/seed_test_data.py
```

### 4. Start Backend

```bash
# Development server with hot reload
python start.py
# or
uvicorn app.main:app --reload --port 8000
```

Verify: http://localhost:8000/docs

### 5. Frontend Setup

```bash
# Navigate to frontend
cd ../frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

Verify: http://localhost:3000

---

## Project Structure

```
pharmacy-management/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── routes/          # API endpoints
│   │   │   ├── services/        # Business logic
│   │   │   └── schemas/         # Pydantic models
│   │   ├── core/                # Auth, config, db
│   │   └── main.py              # FastAPI app
│   ├── alembic/                 # DB migrations
│   ├── tests/
│   ├── requirements.txt
│   └── start.py
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   └── store/
│   ├── package.json
│   └── vite.config.js
│
└── docs/                        # Documentation
```

---

## Environment Variables

### Backend (.env)

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/pharmacy_dev

# Security
SECRET_KEY=your-super-secret-key-change-in-production
JWT_SECRET_KEY=another-secret-key-for-jwt

# CORS (comma-separated origins)
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173

# Redis
REDIS_URL=redis://localhost:6379/0

# Environment
ENVIRONMENT=development
DEBUG=true
```

### Frontend (.env)

```bash
VITE_API_URL=http://localhost:8000
VITE_APP_NAME=Pharmacy Management
```

---

## Development Workflow

### Daily Workflow

```bash
# 1. Pull latest changes
git pull origin main

# 2. Update dependencies if requirements changed
pip install -r requirements.txt  # Backend
npm install                       # Frontend

# 3. Run any new migrations
alembic upgrade head

# 4. Start development servers
# Terminal 1: Backend
cd backend && python start.py

# Terminal 2: Frontend
cd frontend && npm run dev
```

### Creating a Feature

```bash
# 1. Create feature branch
git checkout -b feature/add-bulk-invoice

# 2. Make changes
# ... edit files ...

# 3. Run tests
pytest tests/

# 4. Commit with descriptive message
git add .
git commit -m "feat(invoices): add bulk invoice creation endpoint"

# 5. Push and create PR
git push origin feature/add-bulk-invoice
```

---

## API Development

### Adding a New Endpoint

1. **Create/update service** in `app/api/services/`
2. **Create/update route** in `app/api/routes/`
3. **Add schema** in `app/api/schemas/`
4. **Write tests** in `tests/`

### Example: New Endpoint

```python
# 1. Service (app/api/services/sales/reports_service.py)
class SalesReportsService:
    @staticmethod
    def get_daily_summary(db, org_id: str, date: date) -> dict:
        query = """
            SELECT COUNT(*) as count, SUM(total_amount) as total
            FROM sales.invoices
            WHERE org_id = :org_id AND invoice_date = :date
        """
        return db.execute(query, {"org_id": org_id, "date": date}).fetchone()

# 2. Route (app/api/routes/sales/reports.py)
@router.get("/daily-summary")
async def daily_summary(
    date: date = Query(default=date.today()),
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    result = SalesReportsService.get_daily_summary(db, context.org_id, date)
    return {"success": True, "data": dict(result)}

# 3. Register route in __init__.py
from .reports import router as reports_router
router.include_router(reports_router, prefix="/reports")
```

---

## Database Changes

### Creating a Migration

```bash
# Auto-generate from model changes (if using ORM)
alembic revision --autogenerate -m "add_invoice_notes_column"

# Or create empty migration
alembic revision -m "add_invoice_notes_column"
```

### Migration Example

```python
# alembic/versions/xxx_add_invoice_notes_column.py
def upgrade():
    op.add_column(
        'invoices',
        sa.Column('notes', sa.Text(), nullable=True),
        schema='sales'
    )

def downgrade():
    op.drop_column('invoices', 'notes', schema='sales')
```

### Running Migrations

```bash
# Apply all pending migrations
alembic upgrade head

# Rollback last migration
alembic downgrade -1

# Show current version
alembic current
```

---

## Testing

### Run All Tests

```bash
cd backend
pytest
```

### Run Specific Tests

```bash
# Single file
pytest tests/test_invoices.py

# Single test
pytest tests/test_invoices.py::test_create_invoice

# With coverage
pytest --cov=app tests/
```

### Test Database

Tests use a separate database:

```bash
# Create test database
createdb pharmacy_test

# Set in .env.test
DATABASE_URL=postgresql://user:password@localhost:5432/pharmacy_test
```

---

## Debugging

### Backend Debug Mode

```python
# In start.py
import uvicorn
uvicorn.run(app, host="0.0.0.0", port=8000, reload=True, log_level="debug")
```

### VS Code Launch Config

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Backend",
      "type": "python",
      "request": "launch",
      "module": "uvicorn",
      "args": ["app.main:app", "--reload", "--port", "8000"],
      "cwd": "${workspaceFolder}/backend"
    }
  ]
}
```

### Logging

```python
import logging
logger = logging.getLogger(__name__)

logger.debug("Detailed debugging info")
logger.info("General information")
logger.warning("Something unexpected")
logger.error("Something failed")
```

---

## Common Issues

### Port Already in Use

```bash
# Find process using port
lsof -i :8000

# Kill process
kill -9 <PID>
```

### Database Connection Failed

1. Verify PostgreSQL is running: `pg_isready`
2. Check DATABASE_URL in .env
3. Verify database exists: `psql -l`

### Migration Errors

```bash
# Reset to specific version
alembic downgrade base

# Re-run all migrations
alembic upgrade head
```

---

## Next Steps

1. Review [Development Workflow](development.md)
2. Read [Testing Guide](testing.md)
3. Explore [API contract guidance](../backend/api/)
4. Understand [canonical architecture](../architecture/)

---

## Getting Help

- **Documentation**: You're here!
- **Team Chat**: #dev-pharmacy (Slack)
- **Issues**: GitHub Issues
- **Architecture Questions**: Ask in #architecture

---

**Next**: [Development Workflow](development.md) · [Testing Guide](testing.md)
