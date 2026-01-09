# Production Infrastructure Documentation

Enterprise-grade documentation for the Pharmacy Management System.

---

## Quick Navigation

| I want to... | Go to |
|--------------|-------|
| Start developing | [Getting Started](guides/getting-started.md) |
| Understand the architecture | [System Design](backend/architecture/system-design.md) |
| Find API endpoints | [API Reference](backend/api/) |
| Deploy to production | [Production Guide](deployment/production.md) |
| Debug an issue | [Troubleshooting](guides/troubleshooting.md) |

---

## Documentation Map

```
docs/
├── backend/                      # Backend documentation
│   ├── api/                      # API reference (14 files)
│   ├── services/                 # Service layer (8 files)
│   ├── database/                 # Schema documentation (7 files)
│   ├── architecture/             # System architecture (4 files)
│   └── deployment/               # Deploy configs (4 files)
│
├── frontend/                     # Frontend documentation
│   ├── offline/                  # Offline-first architecture
│   └── design-system.md          # UI components & patterns
│
├── guides/                       # Developer guides
│   ├── getting-started.md        # New developer setup
│   ├── development.md            # Development workflow
│   ├── testing.md                # Testing guide
│   └── troubleshooting.md        # Common issues
│
└── deployment/                   # Deployment documentation
    ├── production.md             # Production deployment
    ├── docker.md                 # Docker setup
    ├── monitoring.md             # Monitoring & logging
    └── backup.md                 # Backup & recovery
```

---

## Backend Documentation

### API Reference

Complete REST API documentation with enterprise features.

| Section | Description |
|---------|-------------|
| [API Overview](backend/api/) | Authentication, pagination, rate limits |
| [Sales API](backend/api/sales/) | Invoices, orders, challans |
| [Purchase API](backend/api/purchase/) | PO, GRN, supplier invoices |
| [Inventory API](backend/api/inventory/) | Products, batches, stock |
| [Finance API](backend/api/finance/) | Payments, ledger, credit notes |
| [Master API](backend/api/master/) | Customers, suppliers, categories |
| [Returns API](backend/api/returns/) | Sales & purchase returns |
| [Auth API](backend/api/auth/) | Login, tokens, permissions |

**Enterprise Guides:**
- [SDK Examples](backend/api/sdk-examples.md) - Python & JavaScript code
- [Testing Guide](backend/api/testing.md) - Postman, automated tests
- [Idempotency](backend/api/idempotency.md) - Safe retries
- [Webhooks](backend/api/webhooks.md) - Event notifications
- [Best Practices](backend/api/best-practices.md) - Security, performance
- [Error Reference](backend/api/errors.md) - 60+ error codes

### Architecture

| Document | Description |
|----------|-------------|
| [System Design](backend/architecture/system-design.md) | High-level architecture, components |
| [Multi-Tenancy](backend/architecture/multi-tenancy.md) | Data isolation, TenantAwareSession |
| [Authentication](backend/architecture/authentication.md) | JWT, RBAC, permissions |
| [Performance](backend/architecture/performance.md) | Caching, bulk operations |

### Database

| Document | Description |
|----------|-------------|
| [Database Overview](backend/database/) | 10 schemas, 166 tables |
| [Master Schema Index](backend/database/MASTER_SCHEMA_INDEX.md) | All tables reference |
| [Schema Details](backend/database/schemas/) | Per-module schemas with ERDs |

### Services

| Module | Description |
|--------|-------------|
| [Services Overview](backend/services/) | Service layer patterns |
| [Sales Services](backend/services/sales/) | Invoice, order logic |
| [Purchase Services](backend/services/purchase/) | PO, GRN logic |
| [Inventory Services](backend/services/inventory/) | Stock, batch management |
| [Finance Services](backend/services/finance/) | Payments, ledger |
| [Master Services](backend/services/master/) | Customer, supplier logic |
| [Returns Services](backend/services/returns/) | Return processing |
| [Core Services](backend/services/core/) | Auth, audit, base |

---

## Frontend Documentation

Frontend docs are split between two locations:

| Location | Content |
|----------|---------|
| [docs/frontend/](frontend/) | Overview, offline architecture |
| [frontend/docs/](../frontend/docs/) | Detailed dev docs, user guides (66 files) |

### Key Docs

| Document | Description |
|----------|-------------|
| [Offline Architecture](frontend/offline/) | IndexedDB schema, sync engine, delta sync |
| [Design System](../frontend/docs/design-system.md) | Complete (511 lines) |
| [User Guides](../frontend/docs/user-guides/) | End-user operational guides (36 files) |

---

## Developer Guides

| Guide | Audience |
|-------|----------|
| [Getting Started](guides/getting-started.md) | New developers |
| [Development Workflow](guides/development.md) | All developers |
| [Testing Guide](guides/testing.md) | All developers |
| [Troubleshooting](guides/troubleshooting.md) | All developers |

---

## Deployment

| Document | Description |
|----------|-------------|
| [Production Deployment](deployment/production.md) | Deployment architecture, checklists |
| [Docker Setup](deployment/docker.md) | Dockerfiles, docker-compose |
| [Monitoring & Logging](deployment/monitoring.md) | Prometheus, Grafana, Sentry |
| [Backup & Recovery](deployment/backup.md) | Backup strategies, DR plan |

---

## Documentation Standards

### File Naming
- Use `kebab-case.md` for files
- Use `README.md` for directory indexes

### Structure
Each document includes:
1. **Overview** - What this covers
2. **Details** - Main content
3. **Examples** - Code samples
4. **See Also** - Related docs

### Diagrams
Mermaid diagrams for:
- Sequence diagrams (API flows)
- ER diagrams (database)
- Flowcharts (business logic)
- Component diagrams (architecture)

---

## Contributing to Docs

1. Follow the file structure above
2. Use consistent formatting
3. Include code examples
4. Add cross-references
5. Update this index when adding new sections

---

**Last Updated**: 2026-01-09
