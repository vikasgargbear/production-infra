# Pharma ERP - Production Infrastructure

## 🚀 Quick Start

```bash
# Frontend
cd frontend && npm install && npm start

# Backend
cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload

# Full stack with Docker
docker-compose up
```

## 📁 Project Structure

```
production-infra/
├── frontend/          # React TypeScript SPA
│   └── src/
│       ├── modules/   # Business modules (sales, inventory, etc.)
│       ├── shared/    # Shared components and utilities
│       └── services/  # API integration
├── backend/           # FastAPI + PostgreSQL
│   └── app/
│       ├── api/       # REST endpoints
│       ├── domain/    # Business logic
│       └── infrastructure/
│           └── parsers/  # Invoice parsing system
├── database/          # PostgreSQL schemas
├── infrastructure/    # Docker & deployment
├── docs/             # Documentation
└── tests/            # Test suites
```

## 🏢 Business Modules

- **Sales & Invoicing** - Invoice generation, sales tracking
- **Purchase & GRN** - Purchase orders, goods receipt
- **Inventory** - Stock management, batch tracking
- **Payments** - Payment recording, reconciliation
- **GST Compliance** - GST reports, e-way bills
- **Master Data** - Products, customers, settings

## 🧪 Testing

```bash
# Run all tests
./scripts/test/run-tests.sh

# Specific tests
npm test                    # Frontend unit tests
pytest backend/tests/       # Backend tests
npm run test:e2e           # E2E tests
```

## 📚 Documentation

- [API Documentation](./docs/api/)
- [Architecture Guide](./docs/architecture/)
- [Deployment Guide](./docs/deployment/)
- [Development Guide](./docs/guides/)

## 🚢 Deployment

See [Deployment Guide](./docs/deployment/README.md)
