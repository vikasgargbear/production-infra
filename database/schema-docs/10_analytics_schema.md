# Analytics Schema Documentation

## Overview
The `analytics` schema provides business intelligence, reporting, and data analytics capabilities. It includes pre-aggregated data, KPIs, dashboards, and analytical views for decision-making.

---

## Tables

### 1. daily_sales_summary
**Purpose**: Pre-aggregated daily sales metrics
**API Endpoint**: `api.get_daily_sales()`, `api.get_sales_trends()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `summary_id` | SERIAL | ✓ | Unique summary identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `branch_id` | INTEGER | - | Branch ID | Branch filtering |
| `summary_date` | DATE | ✓ | Summary date | Date filtering |
| `total_orders` | INTEGER | - | Total orders count | Order metrics |
| `total_invoices` | INTEGER | - | Total invoices count | Invoice metrics |
| `total_customers` | INTEGER | - | Unique customers count | Customer metrics |
| `new_customers` | INTEGER | - | New customers count | Growth metrics |
| `total_items_sold` | NUMERIC(15,3) | - | Total quantity sold | Volume metrics |
| `total_revenue` | NUMERIC(15,2) | - | Total revenue amount | Revenue metrics |
| `total_tax_collected` | NUMERIC(15,2) | - | Total tax amount | Tax metrics |
| `total_discount_given` | NUMERIC(15,2) | - | Total discount amount | Discount metrics |
| `cash_sales` | NUMERIC(15,2) | - | Cash sales amount | Payment metrics |
| `credit_sales` | NUMERIC(15,2) | - | Credit sales amount | Payment metrics |
| `average_order_value` | NUMERIC(15,2) | - | Average order value | Performance metrics |
| `average_items_per_order` | NUMERIC(10,2) | - | Average items per order | Basket metrics |
| `top_selling_category` | TEXT | - | Best selling category | Category performance |
| `top_selling_product` | TEXT | - | Best selling product | Product performance |
| `sales_by_hour` | JSONB | - | Hourly sales distribution | Time analysis |
| `sales_by_category` | JSONB | - | Category-wise sales | Category analysis |
| `sales_by_payment_mode` | JSONB | - | Payment mode distribution | Payment analysis |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

**sales_by_hour JSONB Structure**:
```json
{
  "09": {"orders": 5, "revenue": 15000},
  "10": {"orders": 12, "revenue": 45000},
  "11": {"orders": 18, "revenue": 72000}
}
```

**Example API Response**:
```json
{
  "summary_date": "2024-01-15",
  "total_orders": 156,
  "total_revenue": 850000.00,
  "average_order_value": 5448.72,
  "top_selling_product": "Paracetamol 500mg",
  "sales_trend": "increasing",
  "growth_percentage": 12.5
}
```

---

### 2. monthly_business_summary
**Purpose**: Monthly aggregated business metrics
**API Endpoint**: `api.get_monthly_summary()`, `api.get_business_metrics()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `summary_id` | SERIAL | ✓ | Unique summary identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `branch_id` | INTEGER | - | Branch ID | Branch filtering |
| `year` | INTEGER | ✓ | Year | Year filtering |
| `month` | INTEGER | ✓ | Month (1-12) | Month filtering |
| `total_sales_revenue` | NUMERIC(15,2) | - | Total sales revenue | Revenue metrics |
| `total_purchase_value` | NUMERIC(15,2) | - | Total purchases | Purchase metrics |
| `gross_profit` | NUMERIC(15,2) | - | Gross profit | Profit metrics |
| `gross_margin_percentage` | NUMERIC(5,2) | - | Gross margin % | Margin metrics |
| `operating_expenses` | NUMERIC(15,2) | - | Operating expenses | Expense metrics |
| `net_profit` | NUMERIC(15,2) | - | Net profit | Profit metrics |
| `total_customers_served` | INTEGER | - | Unique customers | Customer metrics |
| `new_customers_acquired` | INTEGER | - | New customers | Growth metrics |
| `customer_retention_rate` | NUMERIC(5,2) | - | Retention rate % | Retention metrics |
| `total_products_sold` | INTEGER | - | Unique products sold | Product metrics |
| `inventory_turnover_ratio` | NUMERIC(10,2) | - | Inventory turnover | Efficiency metrics |
| `average_collection_period` | NUMERIC(10,2) | - | Collection days | Credit metrics |
| `stock_out_incidents` | INTEGER | - | Stock-out count | Inventory metrics |
| `expired_stock_value` | NUMERIC(15,2) | - | Expired stock loss | Loss metrics |
| `top_customers` | JSONB | - | Top 10 customers | Customer analysis |
| `top_products` | JSONB | - | Top 10 products | Product analysis |
| `top_suppliers` | JSONB | - | Top 10 suppliers | Supplier analysis |
| `kpi_metrics` | JSONB | - | Key performance indicators | KPI tracking |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

---

### 3. product_analytics
**Purpose**: Product-level performance analytics
**API Endpoint**: `api.get_product_analytics()`, `api.get_product_performance()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `analytics_id` | SERIAL | ✓ | Unique analytics identifier | Primary key |
| `product_id` | INTEGER | ✓ | Product reference | Product association |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `analysis_period` | TEXT | ✓ | Period: 'daily', 'weekly', 'monthly' | Period classification |
| `period_date` | DATE | ✓ | Period date | Date filtering |
| `units_sold` | NUMERIC(15,3) | - | Units sold | Volume metrics |
| `revenue_generated` | NUMERIC(15,2) | - | Revenue from product | Revenue metrics |
| `profit_generated` | NUMERIC(15,2) | - | Profit from product | Profit metrics |
| `margin_percentage` | NUMERIC(5,2) | - | Profit margin % | Margin metrics |
| `stock_level` | NUMERIC(15,3) | - | Current stock | Inventory metrics |
| `days_of_stock` | NUMERIC(10,2) | - | Stock coverage days | Stock planning |
| `stock_turnover_days` | NUMERIC(10,2) | - | Turnover in days | Efficiency metrics |
| `customer_count` | INTEGER | - | Unique customers | Customer metrics |
| `order_frequency` | NUMERIC(10,2) | - | Orders per period | Frequency metrics |
| `return_rate` | NUMERIC(5,2) | - | Return rate % | Quality metrics |
| `expiry_risk_quantity` | NUMERIC(15,3) | - | Near-expiry quantity | Risk metrics |
| `competitor_price` | NUMERIC(15,2) | - | Competitor pricing | Market intelligence |
| `price_elasticity` | NUMERIC(10,4) | - | Price elasticity coefficient | Pricing analytics |
| `forecast_demand` | NUMERIC(15,3) | - | Forecasted demand | Demand planning |
| `recommendation_score` | NUMERIC(5,2) | - | AI recommendation score | AI insights |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |

---

### 4. customer_analytics
**Purpose**: Customer behavior and value analytics
**API Endpoint**: `api.get_customer_analytics()`, `api.get_customer_insights()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `analytics_id` | SERIAL | ✓ | Unique analytics identifier | Primary key |
| `customer_id` | INTEGER | ✓ | Customer reference | Customer association |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `analysis_date` | DATE | ✓ | Analysis date | Date tracking |
| `lifetime_value` | NUMERIC(15,2) | - | Customer lifetime value | CLV metrics |
| `total_orders` | INTEGER | - | Total orders placed | Order metrics |
| `total_revenue` | NUMERIC(15,2) | - | Total revenue generated | Revenue metrics |
| `average_order_value` | NUMERIC(15,2) | - | Average order value | AOV metrics |
| `order_frequency` | NUMERIC(10,2) | - | Orders per month | Frequency metrics |
| `days_since_last_order` | INTEGER | - | Recency in days | Recency metrics |
| `churn_probability` | NUMERIC(5,2) | - | Churn risk % | Risk metrics |
| `payment_behavior` | TEXT | - | Behavior: 'prompt', 'normal', 'delayed' | Payment analysis |
| `average_payment_days` | NUMERIC(10,2) | - | Average payment days | Credit metrics |
| `preferred_products` | JSONB | - | Top purchased products | Product preference |
| `preferred_categories` | TEXT[] | - | Preferred categories | Category preference |
| `purchase_pattern` | TEXT | - | Pattern: 'regular', 'seasonal', 'sporadic' | Pattern analysis |
| `profitability_score` | NUMERIC(5,2) | - | Profitability score (0-100) | Profitability metrics |
| `loyalty_score` | NUMERIC(5,2) | - | Loyalty score (0-100) | Loyalty metrics |
| `rfm_score` | TEXT | - | RFM segment (e.g., "Champions") | Segmentation |
| `next_order_prediction` | DATE | - | Predicted next order date | Predictive analytics |
| `recommended_products` | INTEGER[] | - | Product recommendations | Recommendation engine |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |

---

### 5. inventory_analytics
**Purpose**: Inventory optimization and analytics
**API Endpoint**: `api.get_inventory_analytics()`, `api.get_stock_insights()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `analytics_id` | SERIAL | ✓ | Unique analytics identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `branch_id` | INTEGER | - | Branch ID | Branch filtering |
| `analysis_date` | DATE | ✓ | Analysis date | Date tracking |
| `total_stock_value` | NUMERIC(15,2) | - | Total inventory value | Value metrics |
| `total_stock_units` | NUMERIC(15,3) | - | Total units in stock | Volume metrics |
| `slow_moving_value` | NUMERIC(15,2) | - | Slow-moving stock value | Risk metrics |
| `fast_moving_value` | NUMERIC(15,2) | - | Fast-moving stock value | Performance metrics |
| `dead_stock_value` | NUMERIC(15,2) | - | Dead stock value | Loss metrics |
| `near_expiry_value` | NUMERIC(15,2) | - | Near-expiry stock value | Risk metrics |
| `stock_accuracy_rate` | NUMERIC(5,2) | - | Physical vs system accuracy % | Accuracy metrics |
| `stockout_incidents` | INTEGER | - | Stockout count | Service metrics |
| `overstock_incidents` | INTEGER | - | Overstock count | Efficiency metrics |
| `average_stock_days` | NUMERIC(10,2) | - | Average stock holding days | Efficiency metrics |
| `inventory_turnover` | NUMERIC(10,2) | - | Inventory turnover ratio | Performance metrics |
| `carrying_cost` | NUMERIC(15,2) | - | Inventory carrying cost | Cost metrics |
| `ordering_cost` | NUMERIC(15,2) | - | Total ordering cost | Cost metrics |
| `abc_analysis` | JSONB | - | ABC classification results | Classification |
| `xyz_analysis` | JSONB | - | XYZ classification results | Variability analysis |
| `fsn_analysis` | JSONB | - | FSN classification results | Movement analysis |
| `reorder_suggestions` | JSONB | - | Reorder recommendations | Planning suggestions |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |

---

### 6. financial_analytics
**Purpose**: Financial performance and cash flow analytics
**API Endpoint**: `api.get_financial_analytics()`, `api.get_financial_health()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `analytics_id` | SERIAL | ✓ | Unique analytics identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `analysis_period` | TEXT | ✓ | Period type: 'daily', 'monthly', 'yearly' | Period classification |
| `period_date` | DATE | ✓ | Period date | Date tracking |
| `total_revenue` | NUMERIC(15,2) | - | Total revenue | Revenue metrics |
| `total_expenses` | NUMERIC(15,2) | - | Total expenses | Expense metrics |
| `gross_profit` | NUMERIC(15,2) | - | Gross profit | Profit metrics |
| `operating_profit` | NUMERIC(15,2) | - | Operating profit | Profit metrics |
| `net_profit` | NUMERIC(15,2) | - | Net profit | Profit metrics |
| `cash_inflow` | NUMERIC(15,2) | - | Cash inflows | Cash flow metrics |
| `cash_outflow` | NUMERIC(15,2) | - | Cash outflows | Cash flow metrics |
| `net_cash_flow` | NUMERIC(15,2) | - | Net cash flow | Cash flow metrics |
| `accounts_receivable` | NUMERIC(15,2) | - | Total receivables | Working capital |
| `accounts_payable` | NUMERIC(15,2) | - | Total payables | Working capital |
| `working_capital` | NUMERIC(15,2) | - | Working capital | Liquidity metrics |
| `current_ratio` | NUMERIC(10,2) | - | Current ratio | Liquidity ratios |
| `quick_ratio` | NUMERIC(10,2) | - | Quick ratio | Liquidity ratios |
| `debt_equity_ratio` | NUMERIC(10,2) | - | Debt-equity ratio | Leverage ratios |
| `return_on_investment` | NUMERIC(5,2) | - | ROI % | Performance ratios |
| `expense_breakdown` | JSONB | - | Expense categories | Expense analysis |
| `revenue_breakdown` | JSONB | - | Revenue sources | Revenue analysis |
| `cash_flow_forecast` | JSONB | - | Cash flow projections | Forecasting |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |

---

### 7. kpi_metrics
**Purpose**: Key Performance Indicator tracking
**API Endpoint**: `api.get_kpis()`, `api.get_kpi_trends()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `kpi_id` | SERIAL | ✓ | Unique KPI identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `kpi_name` | TEXT | ✓ | KPI name | KPI identification |
| `kpi_category` | TEXT | ✓ | Category: 'sales', 'inventory', 'financial', 'customer' | KPI grouping |
| `measurement_date` | DATE | ✓ | Measurement date | Date tracking |
| `actual_value` | NUMERIC | ✓ | Actual measured value | Performance tracking |
| `target_value` | NUMERIC | - | Target value | Goal tracking |
| `previous_value` | NUMERIC | - | Previous period value | Comparison |
| `achievement_percentage` | NUMERIC(5,2) | - | Achievement % | Performance assessment |
| `trend` | TEXT | - | Trend: 'increasing', 'stable', 'decreasing' | Trend analysis |
| `unit_of_measure` | TEXT | - | Unit (e.g., 'currency', 'percentage', 'count') | Display formatting |
| `calculation_method` | TEXT | - | Calculation formula/method | Documentation |
| `data_quality_score` | NUMERIC(5,2) | - | Data quality (0-100) | Quality tracking |
| `notes` | TEXT | - | KPI notes | Documentation |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |

---

### 8. dashboard_configs
**Purpose**: User dashboard configuration and layouts
**API Endpoint**: `api.get_dashboards()`, `api.save_dashboard()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `dashboard_id` | SERIAL | ✓ | Unique dashboard identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `user_id` | INTEGER | - | User ID for personal dashboards | User association |
| `dashboard_name` | TEXT | ✓ | Dashboard name | Display name |
| `dashboard_type` | TEXT | ✓ | Type: 'executive', 'operational', 'financial', 'custom' | Dashboard classification |
| `is_default` | BOOLEAN | - | Default dashboard flag | Default selection |
| `layout_config` | JSONB | ✓ | Widget layout configuration | Layout rendering |
| `refresh_interval` | INTEGER | - | Auto-refresh interval in seconds | Refresh control |
| `sharing_settings` | JSONB | - | Sharing configuration | Access control |
| `is_public` | BOOLEAN | - | Public dashboard flag | Visibility control |
| `created_by` | INTEGER | - | Creator user ID | User tracking |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

**layout_config JSONB Structure**:
```json
{
  "widgets": [
    {
      "id": "sales_trend",
      "type": "line_chart",
      "position": {"x": 0, "y": 0, "w": 6, "h": 4},
      "config": {
        "title": "Sales Trend",
        "metric": "daily_revenue",
        "period": "last_30_days"
      }
    }
  ]
}
```

---

### 9. report_templates
**Purpose**: Configurable report templates
**API Endpoint**: `api.get_report_templates()`, `api.create_report_template()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `template_id` | SERIAL | ✓ | Unique template identifier | Primary key |
| `org_id` | UUID | - | Organization ID | Organization filtering |
| `template_name` | TEXT | ✓ | Template name | Display name |
| `report_type` | TEXT | ✓ | Type: 'sales', 'inventory', 'financial', 'compliance', 'custom' | Report classification |
| `description` | TEXT | - | Template description | Documentation |
| `query_config` | JSONB | ✓ | Report query configuration | Query definition |
| `layout_config` | JSONB | - | Report layout configuration | Layout definition |
| `parameters` | JSONB | - | Report parameters | Parameter definition |
| `schedule_config` | JSONB | - | Scheduling configuration | Schedule settings |
| `output_formats` | TEXT[] | - | Supported formats: ['pdf', 'excel', 'csv'] | Export options |
| `is_system_template` | BOOLEAN | - | System template flag | Template type |
| `is_active` | BOOLEAN | - | Template active status | Template filtering |
| `created_by` | INTEGER | - | Creator user ID | User tracking |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

---

### 10. data_mart_refresh_log
**Purpose**: ETL and data refresh tracking
**API Endpoint**: `api.get_refresh_status()`, `api.trigger_refresh()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `refresh_id` | SERIAL | ✓ | Unique refresh identifier | Primary key |
| `table_name` | TEXT | ✓ | Table/view refreshed | Table identification |
| `refresh_type` | TEXT | ✓ | Type: 'full', 'incremental', 'real_time' | Refresh classification |
| `start_time` | TIMESTAMPTZ | ✓ | Refresh start time | Time tracking |
| `end_time` | TIMESTAMPTZ | - | Refresh end time | Duration calculation |
| `status` | TEXT | ✓ | Status: 'running', 'completed', 'failed' | Status tracking |
| `records_processed` | INTEGER | - | Records processed count | Volume tracking |
| `records_inserted` | INTEGER | - | Records inserted | Insert tracking |
| `records_updated` | INTEGER | - | Records updated | Update tracking |
| `error_message` | TEXT | - | Error message if failed | Error tracking |
| `execution_time_ms` | INTEGER | - | Execution time in milliseconds | Performance tracking |
| `next_refresh_time` | TIMESTAMPTZ | - | Next scheduled refresh | Schedule tracking |

---

## API Integration Notes

### Dashboard Analytics
```javascript
// Get dashboard data
GET /api/analytics/dashboard/executive
{
  "period": "current_month",
  "metrics": {
    "revenue": {
      "current": 2500000,
      "previous": 2100000,
      "change_percentage": 19.05,
      "trend": "increasing"
    },
    "orders": {
      "current": 1250,
      "previous": 1100,
      "change_percentage": 13.64
    },
    "inventory_value": 5000000,
    "cash_position": 1500000
  },
  "charts": {
    "daily_sales": [...],
    "top_products": [...],
    "payment_distribution": [...]
  }
}
```

### Sales Analytics
```javascript
// Sales performance analysis
GET /api/analytics/sales?
  from_date=2024-01-01&
  to_date=2024-01-31&
  group_by=daily&
  metrics=revenue,orders,profit

// Product performance
GET /api/analytics/products/performance?
  period=last_30_days&
  sort_by=revenue&
  limit=20
```

### Customer Analytics
```javascript
// Customer segmentation
GET /api/analytics/customers/segments
{
  "segments": {
    "champions": {
      "count": 50,
      "revenue_contribution": 45.5,
      "characteristics": {
        "avg_order_value": 15000,
        "order_frequency": 8.5
      }
    },
    "at_risk": {
      "count": 120,
      "churn_probability": 65.5
    }
  }
}

// Customer lifetime value
GET /api/analytics/customers/123/lifetime-value
{
  "customer_id": 123,
  "lifetime_value": 250000,
  "total_orders": 45,
  "avg_order_value": 5555,
  "predicted_next_order": "2024-02-10",
  "churn_risk": "low"
}
```

### Inventory Analytics
```javascript
// ABC Analysis
GET /api/analytics/inventory/abc-analysis
{
  "classification": {
    "A": {
      "products": 150,
      "value_percentage": 70,
      "items": [...]
    },
    "B": {
      "products": 300,
      "value_percentage": 20
    },
    "C": {
      "products": 1200,
      "value_percentage": 10
    }
  }
}

// Stock optimization
GET /api/analytics/inventory/optimization
{
  "reorder_suggestions": [
    {
      "product_id": 101,
      "current_stock": 50,
      "reorder_point": 100,
      "suggested_quantity": 500,
      "lead_time_days": 7
    }
  ],
  "overstock_items": [...],
  "slow_moving_items": [...]
}
```

### Financial Analytics
```javascript
// Cash flow analysis
GET /api/analytics/financial/cash-flow?period=monthly
{
  "summary": {
    "opening_balance": 1000000,
    "inflows": 2500000,
    "outflows": 2200000,
    "closing_balance": 1300000
  },
  "forecast": {
    "next_30_days": {
      "expected_inflows": 2000000,
      "expected_outflows": 1800000,
      "projected_balance": 1500000
    }
  }
}
```

### KPI Tracking
```javascript
// KPI dashboard
GET /api/analytics/kpis?category=all
{
  "kpis": [
    {
      "name": "Revenue Growth",
      "category": "sales",
      "actual": 2500000,
      "target": 2300000,
      "achievement": 108.7,
      "trend": "increasing",
      "sparkline": [...]
    }
  ]
}
```

### Report Generation
```javascript
// Generate report
POST /api/analytics/reports/generate
{
  "template_id": 1,
  "parameters": {
    "date_from": "2024-01-01",
    "date_to": "2024-01-31",
    "branch_id": 1
  },
  "format": "pdf",
  "email_to": ["manager@company.com"]
}
```

### Real-time Analytics
```javascript
// WebSocket connection for real-time metrics
ws://api/analytics/realtime
{
  "subscribe": ["sales", "inventory"],
  "metrics": ["current_orders", "stock_levels"]
}

// Real-time updates
{
  "type": "metric_update",
  "metric": "current_orders",
  "value": 25,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Predictive Analytics
```javascript
// Demand forecasting
GET /api/analytics/forecast/demand?
  product_id=101&
  horizon_days=30

{
  "product_id": 101,
  "forecast": [
    {
      "date": "2024-02-01",
      "predicted_demand": 150,
      "confidence_interval": [130, 170]
    }
  ],
  "seasonality": "weekly",
  "trend": "increasing"
}
```

### Validation Rules
1. **Date Ranges**: Maximum 1 year for detailed analytics
2. **Aggregation Levels**: Must be valid (daily, weekly, monthly, yearly)
3. **Metrics**: Must be from allowed metrics list
4. **Dashboard Widgets**: Maximum 20 widgets per dashboard
5. **Report Parameters**: Must match template requirements