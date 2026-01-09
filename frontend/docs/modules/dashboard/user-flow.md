# 📊 Dashboard - Complete Field Reference

> **Complete Documentation**: Every field, every variable, frontend to backend mapping.

---

## 🎯 Dashboard Module Overview

The Dashboard provides real-time business insights with KPIs, charts, alerts, recent orders, and quick actions.

**Refactoring Status**: ✅ 1,369 → 324 lines (76% reduction)

---

## 📝 Core Data Structures

### Section 1.1: Dashboard Statistics (`DashboardStats`)

| Field | Frontend Variable | Backend Endpoint | Type | Description |
|-------|------------------|------------------|------|-------------|
| **Total Revenue** | `stats.totalRevenue` | `/dashboard/stats` | Decimal | Total sales revenue |
| **Total Orders** | `stats.totalOrders` | `/dashboard/stats` | Integer | Order count |
| **Total Products** | `stats.totalProducts` | `/dashboard/stats` | Integer | Product catalog size |
| **Total Customers** | `stats.totalCustomers` | `/dashboard/stats` | Integer | Customer count |
| **Expiring Soon** | `stats.expiringSoon` | `/dashboard/stats` | Integer | Items near expiry |
| **Pending Payments** | `stats.pendingPayments` | `/dashboard/stats` | Decimal | Outstanding amount |
| **Stock Value** | `stats.stockValue` | `/dashboard/stats` | Decimal | Total inventory value |
| **Low Stock Items** | `stats.lowStockItems` | `/dashboard/stats` | Integer | Items below reorder |
| **Daily Sales** | `stats.dailySales` | `/dashboard/stats` | Decimal | Today's sales |
| **Monthly Growth** | `stats.monthlyGrowth` | `/dashboard/stats` | Decimal | MoM growth % |
| **Customer Retention** | `stats.customerRetention` | `/dashboard/stats` | Decimal | Retention rate % |
| **Average Order Value** | `stats.averageOrderValue` | `/dashboard/stats` | Decimal | AOV |
| **Profit Margin** | `stats.profitMargin` | `/dashboard/stats` | Decimal | Margin % |
| **Inventory Turnover** | `stats.inventoryTurnover` | `/dashboard/stats` | Decimal | Turnover ratio |
| **Prescription Count** | `stats.prescriptionCount` | `/dashboard/stats` | Integer | Rx orders |
| **Return Rate** | `stats.returnRate` | `/dashboard/stats` | Decimal | Return % |

**Visual Flow**:
```
┌─────────────────────────────────────────────────────────────────────────┐
│ 📈 DASHBOARD OVERVIEW                                                  │
├─────────────────┬─────────────────┬─────────────────┬──────────────────┤
│ 💰 Revenue      │ 📦 Orders       │ 👥 Customers    │ 📊 Products      │
│ ₹12,50,000      │ 450             │ 125             │ 2,500            │
│ ↑ 15% vs last mo│ ↑ 8%           │ ↑ 12%           │ 50 low stock     │
├─────────────────┴─────────────────┴─────────────────┴──────────────────┤
│ Today: ₹45,000  │  Pending: ₹1,25,000  │  Expiring: 25 items          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### Section 1.2: Sales Data Points (`SalesDataPoint`)

| Field | Frontend Variable | Type | Description |
|-------|------------------|------|-------------|
| **Month** | `point.month` | String | Period label |
| **Revenue** | `point.revenue` | Decimal | Revenue for period |
| **Orders** | `point.orders` | Integer | Order count |

---

### Section 1.3: Product Categories (`ProductCategory`)

| Field | Frontend Variable | Type | Description |
|-------|------------------|------|-------------|
| **Name** | `category.name` | String | Category name |
| **Value** | `category.value` | Decimal | Sales value |
| **Color** | `category.color` | String | Chart color |

---

### Section 1.4: Recent Orders (`DashboardOrder`)

| Field | Frontend Variable | Backend Column | Type | Description |
|-------|------------------|----------------|------|-------------|
| **ID** | `order.id` | `id` | String | Order ID |
| **Customer** | `order.customer` | `customer_name` | String | Customer name |
| **Amount** | `order.amount` | `total_amount` | Decimal | Order total |
| **Status** | `order.status` | `status` | String | Order status |
| **Date** | `order.date` | `order_date` | Date | Order date |

---

### Section 1.5: Alerts (`Alert`)

| Field | Frontend Variable | Type | Description |
|-------|------------------|------|-------------|
| **ID** | `alert.id` | Integer | Alert ID |
| **Type** | `alert.type` | Enum | 'stock'/'expiry'/'order'/'payment' |
| **Message** | `alert.message` | String | Alert text |
| **Severity** | `alert.severity` | Enum | 'high'/'medium'/'low' |
| **Timestamp** | `alert.timestamp` | String | When triggered |
| **Read** | `alert.read` | Boolean | Dismissed status |

**Alert Types**:
- 🔴 **Stock**: Low/out of stock alerts
- 🟡 **Expiry**: Near-expiry product alerts
- 🔵 **Order**: Order status alerts
- 🟢 **Payment**: Payment due/overdue alerts

---

### Section 1.6: Custom KPIs (`CustomKPI`)

| Field | Frontend Variable | Type | Description |
|-------|------------------|------|-------------|
| **ID** | `kpi.id` | Integer | KPI identifier |
| **Name** | `kpi.name` | String | KPI display name |
| **Value** | `kpi.value` | String | Current value |
| **Icon** | `kpi.icon` | Component | Lucide icon |
| **Color** | `kpi.color` | String | Card color |
| **Trend** | `kpi.trend` | String | Trend indicator (+5%, -2%) |

---

## 🎛️ UI State Fields

### Section 2.1: Filter & View States

| Field | Frontend Variable | Type | Options | Description |
|-------|------------------|------|---------|-------------|
| **Alert Filter** | `ui.alertFilter` | Enum | 'all'/'stock'/'expiry'/'order'/'payment' | Filter alerts |
| **Order Filter** | `ui.orderFilter` | Enum | 'all'/'pending'/'completed'/'cancelled' | Filter orders |
| **Order Sort** | `ui.orderSort` | Object | {field, direction} | Sort orders |
| **Chart Time Range** | `ui.chartTimeRange` | Enum | 'daily'/'weekly'/'monthly'/'yearly' | Charts period |
| **Selected Chart** | `ui.selectedChart` | Enum | 'revenue'/'orders'/'profit'/'customers' | Active chart |
| **FAB Open** | `ui.fabOpen` | Boolean | - | Quick action menu |
| **Panel** | `ui.panel` | Enum | 'add-sale'/etc or null | Active side panel |
| **Customizing KPIs** | `ui.isCustomizingKPIs` | Boolean | - | KPI editor mode |

---

### Section 2.2: Chart Data Structure

| Field | Frontend Variable | Type | Description |
|-------|------------------|------|-------------|
| **Revenue Chart** | `chartData.revenue` | Array | Revenue over time |
| **Orders Chart** | `chartData.orders` | Array | Orders over time |
| **Profit Chart** | `chartData.profit` | Array | Profit over time |
| **Customers Chart** | `chartData.customers` | Array | Customer growth |

---

## 📊 Complete TypeScript Interfaces

```typescript
interface DashboardStats {
  totalRevenue: number;
  totalOrders: number;
  totalProducts: number;
  totalCustomers: number;
  expiringSoon: number;
  pendingPayments: number;
  stockValue: number;
  lowStockItems: number;
  dailySales: number;
  monthlyGrowth: number;
  customerRetention: number;
  averageOrderValue: number;
  profitMargin: number;
  inventoryTurnover: number;
  prescriptionCount: number;
  returnRate: number;
}

interface SalesDataPoint {
  month: string;
  revenue: number;
  orders: number;
}

interface Alert {
  id: number;
  type: 'stock' | 'expiry' | 'order' | 'payment';
  message: string;
  severity: 'high' | 'medium' | 'low';
  timestamp: string;
  read: boolean;
}

interface DashboardUIState {
  alertFilter: 'all' | 'stock' | 'expiry' | 'order' | 'payment';
  orderFilter: 'all' | 'pending' | 'completed' | 'cancelled';
  orderSort: { field: 'date' | 'amount'; direction: 'asc' | 'desc' };
  chartTimeRange: 'daily' | 'weekly' | 'monthly' | 'yearly';
  selectedChart: 'revenue' | 'orders' | 'profit' | 'customers';
  fabOpen: boolean;
  panel: 'add-sale' | 'create-challan' | 'add-purchase' | 'add-payment' | null;
  isCustomizingKPIs: boolean;
}

interface DashboardState {
  ui: DashboardUIState;
  data: {
    stats: DashboardStats;
    salesData: SalesDataPoint[];
    recentOrders: DashboardOrder[];
    alerts: Alert[];
    chartData: ChartData;
  };
  async: {
    loading: boolean;
    error: string | null;
    refreshing: boolean;
  };
  selectedKPIs: number[];
  searchQuery: string;
}
```

---

## 🔄 API Endpoints

### GET /api/dashboard/stats
**Response**:
```json
{
  "totalRevenue": 1250000.00,
  "totalOrders": 450,
  "totalProducts": 2500,
  "totalCustomers": 125,
  "expiringSoon": 25,
  "pendingPayments": 125000.00,
  "stockValue": 850000.00,
  "lowStockItems": 50,
  "dailySales": 45000.00,
  "monthlyGrowth": 15.5,
  "averageOrderValue": 2778.00
}
```

### GET /api/dashboard/charts?range={daily|weekly|monthly}
### GET /api/dashboard/alerts
### GET /api/dashboard/recent-orders

---

## 🔄 State Management (Refactored)

**Before**: 21 useState calls  
**After**: 1 useReducer via `useDashboardState` hook

**Sub-components Created**: 5 (StatCards, Charts, Alerts, Orders, QuickActions)

---

**Last Updated**: 2026-01-08  
**Component**: `Dashboard.tsx` (1,369 → 324 lines, REFACTORED)  
**Types**: `dashboard.types.ts` (181 lines)
