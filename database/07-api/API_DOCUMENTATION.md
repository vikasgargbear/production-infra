# Enterprise Pharmaceutical ERP - Global API Documentation

## Overview

This document provides comprehensive documentation for all global APIs in the enterprise pharmaceutical ERP system. The APIs are organized by functional modules and provide secure, efficient access to all system functionality.

## Table of Contents

1. [Master Module APIs](#master-module-apis)
2. [Inventory Module APIs](#inventory-module-apis)
3. [Sales Module APIs](#sales-module-apis)
4. [Procurement Module APIs](#procurement-module-apis)
5. [Financial Module APIs](#financial-module-apis)
6. [GST & Compliance Module APIs](#gst-compliance-module-apis)
7. [Analytics & Reporting APIs](#analytics-reporting-apis)
8. [System & Utility APIs](#system-utility-apis)

## API Conventions

- All APIs are PostgreSQL functions in the `api` schema
- Functions return JSONB for flexible, structured responses
- Error handling is built into each function
- All functions use `SECURITY DEFINER` for controlled access
- Pagination is supported where applicable

## Master Module APIs

### get_organization_details
Retrieves complete organization information including branches and licenses.

```sql
SELECT api.get_organization_details(p_org_id INTEGER DEFAULT NULL);
```

**Response Structure:**
```json
{
  "organization": {...},
  "branches": [...],
  "licenses": [...]
}
```

### search_products
Search products with filters and pagination.

```sql
SELECT api.search_products(
    p_search_term TEXT DEFAULT NULL,
    p_category_id INTEGER DEFAULT NULL,
    p_product_type TEXT DEFAULT NULL,
    p_is_narcotic BOOLEAN DEFAULT NULL,
    p_limit INTEGER DEFAULT 100,
    p_offset INTEGER DEFAULT 0
);
```

### get_product_details
Get comprehensive product information including stock and suppliers.

```sql
SELECT api.get_product_details(p_product_id INTEGER);
```

## Inventory Module APIs

### get_stock_availability
Real-time stock availability across locations.

```sql
SELECT api.get_stock_availability(
    p_product_id INTEGER DEFAULT NULL,
    p_branch_id INTEGER DEFAULT NULL,
    p_location_id INTEGER DEFAULT NULL,
    p_include_reserved BOOLEAN DEFAULT FALSE
);
```

### get_batch_information
Batch details with expiry and distribution information.

```sql
SELECT api.get_batch_information(
    p_batch_id INTEGER DEFAULT NULL,
    p_product_id INTEGER DEFAULT NULL,
    p_expiry_days INTEGER DEFAULT NULL,
    p_include_expired BOOLEAN DEFAULT FALSE
);
```

### get_reorder_alerts
Products requiring reorder with urgency levels.

```sql
SELECT api.get_reorder_alerts(
    p_branch_id INTEGER DEFAULT NULL,
    p_category_id INTEGER DEFAULT NULL
);
```

### get_expiry_alerts
Batch expiry alerts with risk assessment.

```sql
SELECT api.get_expiry_alerts(
    p_days_ahead INTEGER DEFAULT 90,
    p_branch_id INTEGER DEFAULT NULL,
    p_include_expired BOOLEAN DEFAULT TRUE
);
```

## Sales Module APIs

### search_customers
Search customers with credit and outstanding information.

```sql
SELECT api.search_customers(
    p_search_term TEXT DEFAULT NULL,
    p_customer_type TEXT DEFAULT NULL,
    p_category_id INTEGER DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
);
```

### create_sales_order
Create new sales order with automatic calculations.

```sql
SELECT api.create_sales_order(p_order_data JSONB);
```

**Request Structure:**
```json
{
  "org_id": 1,
  "branch_id": 1,
  "customer_id": 123,
  "order_type": "regular",
  "items": [
    {
      "product_id": 1001,
      "quantity": 100,
      "unit_of_sale": "TAB",
      "base_unit_price": 10.50,
      "discount_percentage": 10,
      "tax_percentage": 12
    }
  ]
}
```

### create_invoice
Create invoice with automatic batch allocation using FEFO.

```sql
SELECT api.create_invoice(p_invoice_data JSONB);
```

### get_sales_dashboard
Comprehensive sales analytics dashboard.

```sql
SELECT api.get_sales_dashboard(
    p_branch_id INTEGER DEFAULT NULL,
    p_from_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
    p_to_date DATE DEFAULT CURRENT_DATE
);
```

## Procurement Module APIs

### search_suppliers
Search suppliers with product mapping and credit info.

```sql
SELECT api.search_suppliers(
    p_search_term TEXT DEFAULT NULL,
    p_supplier_category TEXT DEFAULT NULL,
    p_product_id INTEGER DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
);
```

### create_purchase_order
Create purchase order with supplier credit validation.

```sql
SELECT api.create_purchase_order(p_po_data JSONB);
```

### create_grn
Create GRN with batch creation and quality checks.

```sql
SELECT api.create_grn(p_grn_data JSONB);
```

### get_pending_deliveries
Track pending deliveries with overdue analysis.

```sql
SELECT api.get_pending_deliveries(
    p_supplier_id INTEGER DEFAULT NULL,
    p_branch_id INTEGER DEFAULT NULL,
    p_days_overdue INTEGER DEFAULT NULL
);
```

### get_supplier_performance
Supplier performance metrics and scoring.

```sql
SELECT api.get_supplier_performance(
    p_supplier_id INTEGER DEFAULT NULL,
    p_from_date DATE DEFAULT CURRENT_DATE - INTERVAL '90 days',
    p_to_date DATE DEFAULT CURRENT_DATE
);
```

## Financial Module APIs

### record_payment
Record payment with automatic journal entry creation.

```sql
SELECT api.record_payment(p_payment_data JSONB);
```

**Request Structure:**
```json
{
  "org_id": 1,
  "branch_id": 1,
  "payment_date": "2024-01-15",
  "party_type": "customer",
  "party_id": 123,
  "payment_type": "receipt",
  "payment_mode": "bank",
  "amount": 10000,
  "allocations": [
    {
      "reference_type": "invoice",
      "reference_id": 456,
      "allocated_amount": 10000
    }
  ]
}
```

### get_customer_outstanding
Customer outstanding with aging analysis.

```sql
SELECT api.get_customer_outstanding(
    p_customer_id INTEGER DEFAULT NULL,
    p_as_on_date DATE DEFAULT CURRENT_DATE,
    p_aging_buckets BOOLEAN DEFAULT TRUE,
    p_include_pdc BOOLEAN DEFAULT TRUE
);
```

### get_cash_flow_forecast
Cash flow forecast based on receivables and payables.

```sql
SELECT api.get_cash_flow_forecast(
    p_from_date DATE DEFAULT CURRENT_DATE,
    p_to_date DATE DEFAULT CURRENT_DATE + INTERVAL '30 days',
    p_branch_id INTEGER DEFAULT NULL
);
```

### get_profit_loss_statement
P&L statement with period comparison.

```sql
SELECT api.get_profit_loss_statement(
    p_from_date DATE,
    p_to_date DATE,
    p_branch_id INTEGER DEFAULT NULL,
    p_comparison_period BOOLEAN DEFAULT FALSE
);
```

### get_balance_sheet
Balance sheet as on specific date.

```sql
SELECT api.get_balance_sheet(
    p_as_on_date DATE DEFAULT CURRENT_DATE,
    p_branch_id INTEGER DEFAULT NULL
);
```

## GST & Compliance Module APIs

### generate_gstr1_data
Generate GSTR-1 data for GST filing.

```sql
SELECT api.generate_gstr1_data(
    p_org_id INTEGER,
    p_return_period VARCHAR(6), -- MMYYYY format
    p_branch_id INTEGER DEFAULT NULL
);
```

### generate_eway_bill
Generate e-way bill for eligible invoices.

```sql
SELECT api.generate_eway_bill(
    p_invoice_id INTEGER,
    p_transport_details JSONB
);
```

### get_license_expiry_alerts
Business license expiry tracking and alerts.

```sql
SELECT api.get_license_expiry_alerts(
    p_org_id INTEGER,
    p_days_ahead INTEGER DEFAULT 90,
    p_license_type TEXT DEFAULT NULL
);
```

### get_narcotic_register
Narcotic drug register with balance verification.

```sql
SELECT api.get_narcotic_register(
    p_product_id INTEGER DEFAULT NULL,
    p_from_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
    p_to_date DATE DEFAULT CURRENT_DATE,
    p_include_balance_check BOOLEAN DEFAULT TRUE
);
```

## Analytics & Reporting APIs

### get_executive_dashboard
Executive dashboard with key metrics and alerts.

```sql
SELECT api.get_executive_dashboard(
    p_org_id INTEGER,
    p_date_range TEXT DEFAULT 'current_month',
    p_comparison BOOLEAN DEFAULT TRUE
);
```

**Date Range Options:**
- 'today'
- 'current_week'
- 'current_month'
- 'current_quarter'
- 'current_year'

### get_sales_analytics
Detailed sales analytics with trends and breakdowns.

```sql
SELECT api.get_sales_analytics(
    p_org_id INTEGER,
    p_from_date DATE,
    p_to_date DATE,
    p_group_by TEXT DEFAULT 'day',
    p_branch_id INTEGER DEFAULT NULL,
    p_category_id INTEGER DEFAULT NULL
);
```

### get_inventory_analytics
Inventory analytics including ABC analysis and movement.

```sql
SELECT api.get_inventory_analytics(
    p_org_id INTEGER,
    p_analysis_type TEXT DEFAULT 'overview',
    p_branch_id INTEGER DEFAULT NULL,
    p_category_id INTEGER DEFAULT NULL
);
```

**Analysis Types:**
- 'overview' - Stock overview and distribution
- 'movement' - Movement analysis and turnover
- 'aging' - Stock aging analysis
- 'abc' - ABC classification by revenue

### get_customer_analytics
Customer analytics with RFM segmentation.

```sql
SELECT api.get_customer_analytics(
    p_org_id INTEGER,
    p_from_date DATE DEFAULT CURRENT_DATE - INTERVAL '365 days',
    p_to_date DATE DEFAULT CURRENT_DATE,
    p_customer_id INTEGER DEFAULT NULL
);
```

## System & Utility APIs

### authenticate_user
User authentication with session management.

```sql
SELECT api.authenticate_user(
    p_username VARCHAR(100),
    p_password TEXT
);
```

### get_system_settings
Retrieve system settings by organization.

```sql
SELECT api.get_system_settings(
    p_org_id INTEGER,
    p_category TEXT DEFAULT NULL
);
```

### get_audit_log
Audit trail with comprehensive filters.

```sql
SELECT api.get_audit_log(
    p_table_name TEXT DEFAULT NULL,
    p_user_id INTEGER DEFAULT NULL,
    p_action TEXT DEFAULT NULL,
    p_from_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP - INTERVAL '7 days',
    p_to_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    p_limit INTEGER DEFAULT 100,
    p_offset INTEGER DEFAULT 0
);
```

### system_health_check
System health status and performance metrics.

```sql
SELECT api.system_health_check();
```

**Response includes:**
- Database metrics
- Module status
- Performance indicators
- Recent errors

### export_data
Export data in various formats.

```sql
SELECT api.export_data(
    p_export_type TEXT,
    p_format TEXT DEFAULT 'json',
    p_filters JSONB DEFAULT '{}'
);
```

**Export Types:**
- 'customers'
- 'products'
- 'invoices'
- 'purchase_orders'

## Error Handling

All APIs follow consistent error handling:

```json
{
  "success": false,
  "error": "Error message description"
}
```

## Security

- All APIs require authentication (except authenticate_user)
- Row-level security (RLS) is enforced at the database level
- Functions use SECURITY DEFINER for controlled access
- Audit logging is automatic for all data modifications

## Performance Considerations

1. Use pagination for large result sets
2. Apply filters to reduce data transfer
3. Batch operations when possible
4. Monitor API response times through system_health_check

## Rate Limiting

Rate limiting should be implemented at the application layer:
- Authentication: 5 attempts per 5 minutes
- Data APIs: 100 requests per minute
- Report APIs: 10 requests per minute
- Export APIs: 5 requests per minute