# Analytics Schema Documentation

**Schema:** `analytics`
**Purpose:** Business intelligence, reporting, KPIs
**Last Updated:** 2025-10-16
**Tables:** 13

---

## Overview

The `analytics` schema provides business intelligence and reporting capabilities including pre-aggregated data, KPI calculations, dashboard widgets, custom reports, data cubes, and analytical views for strategic decision-making.

---

## Table Categories

### Reporting (4 tables)
Report templates, saved reports, report schedules, report execution history

### Dashboards (3 tables)
Dashboard definitions, dashboard widgets, widget configurations

### KPIs & Metrics (3 tables)
KPI definitions, KPI values (time-series), metric calculations

### Data Warehousing (3 tables)
Sales cube (pre-aggregated), inventory cube, financial cube

---

## Key Features

- **Pre-Aggregated Data**: Daily/weekly/monthly rollups for fast query performance
- **Custom Reports**: User-defined reports with filters, grouping, and charts
- **Interactive Dashboards**: Drag-and-drop dashboard builder with real-time widgets
- **KPI Tracking**: Automated KPI calculation with trend analysis
- **Data Cubes**: OLAP-style cubes for multi-dimensional analysis
- **Scheduled Reports**: Auto-generated reports via email/export
- **Drill-Down Analysis**: Summary to detail navigation

---

## Common Analytics

### Sales Analytics
- Revenue trends, product mix, customer segmentation, territory performance
- Top customers, top products, sales funnel, conversion rates

### Inventory Analytics
- Stock turnover, fast/slow moving, expiry analysis, ABC analysis
- Stockout frequency, reorder suggestions, inventory value

### Financial Analytics
- Cash flow, receivables aging, payables aging, profitability
- Budget vs actual, expense analysis, margin analysis

### Operations Analytics
- Order fulfillment time, GRN cycle time, return rates
- Vendor performance, quality metrics, delivery performance

---

## Related Documentation

- [MASTER_SCHEMA_INDEX.md](./MASTER_SCHEMA_INDEX.md) - All schemas
- All operational schemas serve as data sources for analytics

---

**Documentation Status:** ✅ Updated 2025-10-16
**Schema Version:** Production (Railway)
**Total Tables:** 13
**Key Features:** Pre-Aggregated Cubes, Custom Reports, KPI Tracking, Interactive Dashboards, Scheduled Reporting
