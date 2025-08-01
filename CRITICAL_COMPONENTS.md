# Critical Components for Production Infrastructure

## 1. Database Components (PostgreSQL)

### Schemas (11 total)
- `master` - Products, customers, suppliers, settings
- `parties` - Enhanced customer/supplier management
- `inventory` - Stock, batches, warehouses, movements
- `sales` - Invoices, orders, returns, pricing
- `procurement` - Purchase orders, GRN, supplier invoices
- `financial` - Payments, ledger, accounting
- `gst` - GST transactions, returns, e-way bills
- `compliance` - Regulatory, audit trails
- `system_config` - Settings, sequences, metadata
- `analytics` - Reporting views, aggregations
- `api` - Public API functions

### Critical Tables
```sql
-- Master
master.products
master.customers
master.suppliers
master.organizations

-- Inventory
inventory.batches
inventory.stock_ledger
inventory.warehouses

-- Sales
sales.invoices
sales.invoice_items
sales.sales_returns

-- Financial
financial.payments
financial.payment_allocations
financial.ledger_entries
```

### Essential Triggers (30+)
1. **Financial Triggers**
   - `trg_update_customer_outstanding` - Auto-update balances
   - `trg_maintain_running_balance` - Ledger balance tracking
   - `trg_payment_auto_allocation` - Smart payment allocation

2. **Inventory Triggers**
   - `trg_update_stock_on_purchase` - Stock addition on GRN
   - `trg_update_stock_on_sale` - Stock deduction on invoice
   - `trg_batch_fifo_allocation` - Auto FIFO batch selection
   - `trg_reorder_level_check` - Low stock alerts

3. **Sales Triggers**
   - `trg_generate_invoice_number` - Sequential numbering
   - `trg_calculate_invoice_totals` - Tax calculations
   - `trg_update_loyalty_points` - Customer rewards

4. **GST Triggers**
   - `trg_calculate_gst_breakup` - CGST/SGST/IGST split
   - `trg_populate_gstr1` - Auto GSTR-1 population

### PostgreSQL API Functions (50+)
```sql
-- Customer APIs
api.search_customers()
api.get_customer_details()
api.create_customer()
api.get_customer_ledger()

-- Product APIs
api.search_products()
api.get_product_details()
api.get_stock_availability()

-- Invoice APIs
api.create_invoice()
api.get_invoice_details()
api.search_invoices()

-- Payment APIs
api.record_payment()
api.get_outstanding_invoices()
api.reconcile_payment()

-- Dashboard APIs
api.get_dashboard_summary()
api.get_sales_analytics()
api.get_inventory_analytics()
```

## 2. Backend Components (FastAPI)

### Core Modules
- Database connection with pooling
- Authentication (JWT)
- CORS middleware
- Error handling
- Request validation

### API Routes
1. **REST Endpoints** (traditional)
   - `/api/v1/*` - Legacy compatibility
   - `/api/v2/*` - New structure

2. **PostgreSQL Wrappers** (new)
   - `/api/v2/pg/customers/search`
   - `/api/v2/pg/products/search`
   - `/api/v2/pg/invoices`

### Parser System
```
parsers/
├── base_parser.py         # Abstract base
├── enhanced_parser.py     # AI-enhanced parsing
├── vendors/
│   ├── generic_parser.py
│   ├── polestar_parser.py
│   ├── arpii_healthcare_parser.py
│   └── pharma_biological_parser.py
└── processors/
    ├── pdf_processor.py
    └── ocr_processor.py
```

### Services Layer
- Customer service
- Product service
- Invoice service
- Payment service
- Inventory service
- GST service

## 3. Frontend Components (React TypeScript)

### Core Modules
```
modules/
├── sales/
│   ├── SalesHub.tsx
│   ├── InvoiceFlow.tsx
│   └── QuickSale.tsx
├── purchase/
│   ├── PurchaseHub.tsx
│   └── GRNFlow.tsx
├── inventory/
│   ├── StockHub.tsx
│   └── StockAdjustment.tsx
├── payments/
│   ├── PaymentEntry.tsx
│   └── PaymentReconciliation.tsx
└── reports/
    ├── DashboardHub.tsx
    └── GSTReports.tsx
```

### Shared Components
- CustomerSearch (with debouncing)
- ProductSearch (with stock info)
- DataTable (sortable, filterable)
- DatePicker (with presets)
- CurrencyInput (formatted)

### API Integration
- React Query for caching
- Axios interceptors for auth
- Error boundaries
- Loading states

## 4. Critical Business Logic

### Invoice Creation Flow
1. Customer selection/creation
2. Product search with stock check
3. Batch selection (FIFO)
4. Price calculation with discounts
5. GST calculation
6. Invoice generation
7. Stock deduction
8. Ledger entry creation

### Payment Recording Flow
1. Customer selection
2. Outstanding invoice list
3. Payment amount entry
4. Auto-allocation to oldest invoices
5. Receipt generation
6. Ledger update

### Stock Management
1. Real-time stock tracking
2. Multi-location support
3. Batch-wise tracking
4. Expiry management
5. Reorder alerts

## 5. Production Requirements

### Environment Variables
```env
DATABASE_URL=postgresql://user:pass@host:5432/pharma
REDIS_URL=redis://host:6379
JWT_SECRET=secure-secret
OPENAI_API_KEY=for-parser-enhancement
AWS_S3_BUCKET=for-document-storage
```

### Infrastructure
- PostgreSQL 15+ with pgvector
- Redis for caching
- S3-compatible storage
- Docker containers
- Nginx reverse proxy

### Security
- Row-level security in PostgreSQL
- JWT authentication
- API rate limiting
- Input validation
- SQL injection prevention

## 6. Migration Considerations

### From Old System
1. Customer data migration
2. Product catalog migration
3. Historical invoices
4. Outstanding balances
5. Stock reconciliation

### Data Integrity
- Foreign key constraints
- Check constraints
- Unique constraints
- Trigger validations

## 7. Testing Requirements

### Backend Tests
- API endpoint tests
- PostgreSQL function tests
- Parser accuracy tests
- Integration tests

### Frontend Tests
- Component unit tests
- Integration tests
- E2E critical paths
- Performance tests

## 8. Monitoring & Logging

### Application Metrics
- API response times
- Database query performance
- Parser success rates
- Error rates

### Business Metrics
- Daily sales
- Stock levels
- Outstanding receivables
- Tax liabilities

This comprehensive structure ensures we maintain all the functionality built over time!