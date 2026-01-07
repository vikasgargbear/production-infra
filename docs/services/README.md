# Service Layer Documentation

This directory contains comprehensive documentation for all backend services in the application.

## Overview

The service layer provides a clean separation between API routes and database operations. All services follow these principles:

- **Multi-tenancy**: Uses `TenantAwareSession` for automatic org_id filtering
- **RBAC**: Works with `PermissionChecker` for role-based access control
- **Encapsulation**: All SQL queries are encapsulated in service methods
- **Testability**: Pure functions that are easy to unit test

## Service Categories

| Domain | Services | Description |
|--------|----------|-------------|
| [Finance](./FINANCE_SERVICES.md) | 8 services | Accounting, ledger, payments, tax |
| [Sales](./SALES_SERVICES.md) | 4 services | Orders, invoices, challans, conversions |
| [Purchase](./PURCHASE_SERVICES.md) | 5 services | Orders, GRN, supplier invoices, uploads |
| [Inventory](./INVENTORY_SERVICES.md) | 2 services | Stock management, write-offs |
| [Master](./MASTER_SERVICES.md) | 5 services | Products, customers, suppliers, employees |
| [Returns](./RETURNS_SERVICES.md) | 2 services | Sales and purchase returns |
| [Core](./CORE_SERVICES.md) | 5 services | Auth, compliance, email, settings |

## Quick Reference

### Most Used Services

| Service | Location | Primary Use |
|---------|----------|-------------|
| `ProductService` | `master/product/service.py` | Product CRUD, search, validation |
| `InvoiceService` | `sales/invoice/invoice_service.py` | Invoice creation and management |
| `LedgerService` | `finance/ledger/service.py` | Party statements, aging, balances |
| `GSTService` | `compliance/gst_service.py` | GST calculations, E-Way bills |
| `DocumentNumberService` | `document_number_service.py` | Auto-numbering for all documents |

## Service Count Summary

```
Total Services: 42
├── Finance: 8
├── Sales: 4
├── Purchase: 5
├── Inventory: 2
├── Master: 5
├── Returns: 2
├── Loyalty: 1
├── Auth: 1
├── Compliance: 2
├── Email: 1
├── Settings: 1
├── Dashboard: 1
└── Core Utilities: 2
```

## Architecture Pattern

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   API Routes    │────▶│    Services     │────▶│   Database      │
│  (routes.py)    │     │  (service.py)   │     │  (PostgreSQL)   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │
        │                       │
        ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│  PermissionChk  │     │ TenantAwareDB   │
│     (RBAC)      │     │ (Multi-tenant)  │
└─────────────────┘     └─────────────────┘
```

## Related Documentation

- [Common Reference](./COMMON_REFERENCE.md) - Dependencies, Error Codes, Database Tables, Usage Patterns
- [Production Readiness Playbook](../PRODUCTION_READINESS_PLAYBOOK.md)
- [API Documentation](../api/)
- [Database Schema](../database/)

---

## Document Contents

Each domain documentation file includes:
- **Service Location** - Full file path
- **Used By** - Routes that use the service
- **Methods Table** - All methods with descriptions
- **Usage Examples** - Code snippets
- **Database Tables** - Tables used by each service
- **Dependencies** - Service interdependencies
- **Error Codes** - Domain-specific error handling

