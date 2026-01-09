# System Design

High-level architecture and design principles.

---

## Architecture Overview

```mermaid
graph TB
    subgraph Client Layer
        WEB[React Web App]
        MOBILE[React Native Mobile]
    end

    subgraph API Gateway
        NGINX[Nginx Reverse Proxy]
        RATE[Rate Limiter]
    end

    subgraph Application Layer
        API[FastAPI Backend]
        BG[Background Workers]
    end

    subgraph Data Layer
        PG[(PostgreSQL)]
        REDIS[(Redis Cache)]
    end

    subgraph External
        EMAIL[Email Service]
        GST[GST Portal]
    end

    WEB --> NGINX
    MOBILE --> NGINX
    NGINX --> RATE
    RATE --> API
    API --> PG
    API --> REDIS
    API --> BG
    BG --> PG
    BG --> EMAIL
    API --> GST
```

---

## Component Overview

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Web App** | React 18 | Browser-based interface |
| **Mobile App** | React Native | iOS/Android with offline |
| **API Server** | FastAPI (Python) | REST API, business logic |
| **Database** | PostgreSQL 14+ | Primary data store |
| **Cache** | Redis | Session, rate limits, cache |
| **Background** | Celery (optional) | Async tasks |
| **Reverse Proxy** | Nginx | SSL, routing, static files |

---

## Key Design Principles

### 1. Multi-Tenancy First

Every operation is scoped to an organization:

```python
# All queries include org_id
SELECT * FROM sales.invoices 
WHERE org_id = :org_id AND invoice_id = :invoice_id
```

### 2. Service-Repository Pattern

```mermaid
graph LR
    ROUTE[API Route] --> SERVICE[Service Layer]
    SERVICE --> |Business Logic| SERVICE
    SERVICE --> REPO[Raw SQL]
    REPO --> DB[(PostgreSQL)]
```

- **Routes**: HTTP adapter, validation, response formatting
- **Services**: Business logic, orchestration
- **Repository**: Direct SQL queries (no ORM)

### 3. Offline-First Mobile

```mermaid
sequenceDiagram
    participant Mobile
    participant IndexedDB
    participant API

    Mobile->>IndexedDB: Read/Write offline
    Mobile->>API: Sync when online
    API-->>Mobile: Delta sync (changes only)
    Mobile->>IndexedDB: Apply changes
```

### 4. Event-Driven Side Effects

```python
# Main operation returns immediately
invoice = create_invoice(data)

# Side effects in background
background_tasks.add_task(
    update_inventory,
    invoice_id=invoice.id
)
background_tasks.add_task(
    update_customer_outstanding,
    customer_id=invoice.customer_id
)
```

---

## Request Flow

```mermaid
sequenceDiagram
    participant Client
    participant Nginx
    participant FastAPI
    participant Auth
    participant Service
    participant DB

    Client->>Nginx: HTTPS Request
    Nginx->>FastAPI: Forward (stripped SSL)
    FastAPI->>Auth: Validate JWT
    Auth-->>FastAPI: User + Org Context
    FastAPI->>Service: Business Operation
    Service->>DB: Execute Query
    DB-->>Service: Result
    Service-->>FastAPI: Domain Object
    FastAPI-->>Client: JSON Response
```

---

## Database Architecture

### Schema Organization

```
PostgreSQL
├── master          # Orgs, users, branches
├── parties         # Customers, suppliers
├── inventory       # Products, batches, stock
├── sales           # Orders, invoices, returns
├── procurement     # PO, GRN, supplier invoices
├── financial       # Payments, ledger
├── gst             # Tax compliance
├── compliance      # Regulatory
├── analytics       # BI, dashboards
└── system_config   # Audit, settings
```

### Multi-Tenancy Strategy

- **Shared Schema**: All tenants in same tables
- **Row-Level Isolation**: `org_id` on every row
- **Connection Pool**: Shared across tenants

See [Multi-Tenancy](multi-tenancy.md) for implementation details.

---

## Security Layers

```mermaid
graph TB
    subgraph Perimeter
        HTTPS[HTTPS/TLS 1.3]
        CORS[CORS Policy]
    end

    subgraph Application
        JWT[JWT Authentication]
        RBAC[Role-Based Access]
        RLS[Row-Level Security]
    end

    subgraph Data
        PARAM[Parameterized Queries]
        ENCRYPT[Sensitive Data Encryption]
        AUDIT[Audit Logging]
    end

    HTTPS --> JWT
    JWT --> RBAC
    RBAC --> RLS
    RLS --> PARAM
```

See [Authentication](authentication.md) for details.

---

## Scalability Considerations

### Horizontal Scaling

| Component | Scaling Strategy |
|-----------|------------------|
| API Servers | Stateless, add instances |
| Database | Read replicas, connection pooling |
| Cache | Redis Cluster |
| Background | Celery workers |

### Vertical Limits

| Metric | Current Capacity |
|--------|------------------|
| Concurrent Users | ~1000 per instance |
| Requests/sec | ~500 per instance |
| Database Connections | 100 pooled |
| Invoices/day | 10,000+ |

---

## Technology Choices

### Why FastAPI?

- **Async native** - High concurrency
- **Type hints** - Self-documenting, validation
- **OpenAPI auto-gen** - Swagger docs free
- **Performance** - Top-tier Python framework

### Why Raw SQL (No ORM)?

- **Performance** - No N+1, optimal queries
- **Control** - Complex joins, CTEs, window functions
- **Transparency** - Know exactly what runs
- **Bulk operations** - Efficient batch inserts

### Why PostgreSQL?

- **Multi-schema** - Clean tenant separation
- **JSONB** - Flexible metadata storage
- **Full-text search** - Product search
- **Extensions** - pg_trgm for fuzzy search

---

## Deployment Architecture

### Production

```mermaid
graph TB
    subgraph Cloud Provider
        LB[Load Balancer]
        
        subgraph App Cluster
            API1[API Instance 1]
            API2[API Instance 2]
        end
        
        subgraph Data
            PG_PRIMARY[(PostgreSQL Primary)]
            PG_REPLICA[(PostgreSQL Replica)]
            REDIS[(Redis)]
        end
    end

    LB --> API1
    LB --> API2
    API1 --> PG_PRIMARY
    API2 --> PG_PRIMARY
    PG_PRIMARY --> PG_REPLICA
    API1 --> REDIS
    API2 --> REDIS
```

See [Deployment Guide](../../deployment/) for details.

---

## Related Documentation

- [Multi-Tenancy](multi-tenancy.md)
- [Authentication](authentication.md)
- [Performance](performance.md)
- [Database Schema](../database/)
- [API Reference](../api/)
