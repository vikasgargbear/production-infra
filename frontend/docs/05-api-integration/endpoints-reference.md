# 📡 API Endpoints Reference

> **Complete reference** for all available API endpoints

---

## 🏗️ API Structure

All APIs are available from the central export:

```typescript
import { 
  invoicesApi, 
  customersApi, 
  productsApi,
  // ... etc
} from '../../services/api';
```

---

## 📊 Analytics

### dashboardApi
| Method | Endpoint | Description |
|--------|----------|-------------|
| `getStats()` | GET `/dashboard/stats` | Dashboard KPIs |
| `getSalesChart(range)` | GET `/dashboard/charts/sales` | Sales chart data |
| `getRecentOrders()` | GET `/dashboard/recent-orders` | Recent orders |
| `getAlerts()` | GET `/dashboard/alerts` | Active alerts |

### reportsApi
| Method | Endpoint | Description |
|--------|----------|-------------|
| `getSalesReport(params)` | GET `/reports/sales` | Sales report |
| `getPurchaseReport(params)` | GET `/reports/purchase` | Purchase report |
| `getInventoryReport()` | GET `/reports/inventory` | Inventory report |
| `exportPDF(reportType)` | GET `/reports/export/pdf` | Export to PDF |

---

## 🔐 Authentication

### authApi
| Method | Endpoint | Description |
|--------|----------|-------------|
| `login(credentials)` | POST `/auth/login` | User login |
| `logout()` | POST `/auth/logout` | User logout |
| `forgotPassword(email)` | POST `/auth/forgot-password` | Password reset |

### usersApi
| Method | Endpoint | Description |
|--------|----------|-------------|
| `getCurrentUser()` | GET `/users/me` | Current user |
| `updateProfile(data)` | PUT `/users/me` | Update profile |
| `changePassword(data)` | POST `/users/change-password` | Change password |

---

## 💼 Sales

### invoicesApi
| Method | Endpoint | Description |
|--------|----------|-------------|
| `getAll(params)` | GET `/sales/invoices` | List invoices |
| `getById(id)` | GET `/sales/invoices/:id` | Get invoice |
| `create(data)` | POST `/sales/invoices` | Create invoice |
| `update(id, data)` | PUT `/sales/invoices/:id` | Update invoice |
| `delete(id)` | DELETE `/sales/invoices/:id` | Delete invoice |
| `getNextNumber()` | GET `/sales/invoices/next-number` | Next invoice # |
| `markAsPaid(id, data)` | POST `/sales/invoices/:id/payment` | Record payment |

### ordersApi
| Method | Endpoint | Description |
|--------|----------|-------------|
| `getAll(params)` | GET `/sales/orders` | List orders |
| `getById(id)` | GET `/sales/orders/:id` | Get order |
| `create(data)` | POST `/sales/orders` | Create order |
| `update(id, data)` | PUT `/sales/orders/:id` | Update order |
| `convertToInvoice(id)` | POST `/sales/orders/:id/convert` | Convert to invoice |

### challansApi
| Method | Endpoint | Description |
|--------|----------|-------------|
| `getAll(params)` | GET `/sales/challans` | List challans |
| `getById(id)` | GET `/sales/challans/:id` | Get challan |
| `create(data)` | POST `/sales/challans` | Create challan |
| `update(id, data)` | PUT `/sales/challans/:id` | Update challan |

### returnsApi
| Method | Endpoint | Description |
|--------|----------|-------------|
| `getAll(params)` | GET `/sales/returns` | List returns |
| `getById(id)` | GET `/sales/returns/:id` | Get return |
| `create(data)` | POST `/sales/returns` | Create return |
| `getByInvoice(invoiceId)` | GET `/sales/returns/invoice/:id` | Returns for invoice |

---

## 🛒 Purchase

### purchasesApi
| Method | Endpoint | Description |
|--------|----------|-------------|
| `getAll(params)` | GET `/purchases` | List POs |
| `getById(id)` | GET `/purchases/:id` | Get PO |
| `create(data)` | POST `/purchases` | Create PO |
| `update(id, data)` | PUT `/purchases/:id` | Update PO |
| `getNextNumber()` | GET `/purchases/next-number` | Next PO # |

### grnApi
| Method | Endpoint | Description |
|--------|----------|-------------|
| `getAll(params)` | GET `/grn` | List GRNs |
| `getById(id)` | GET `/grn/:id` | Get GRN |
| `create(data)` | POST `/grn` | Create GRN |

---

## 📦 Inventory

### stockApi
| Method | Endpoint | Description |
|--------|----------|-------------|
| `getCurrent(params)` | GET `/inventory/stock/current` | Current stock |
| `getByProduct(productId)` | GET `/inventory/stock/:productId` | Stock for product |
| `adjust(data)` | POST `/inventory/stock/adjust` | Stock adjustment |
| `getLowStock()` | GET `/inventory/stock/low` | Low stock items |
| `getExpiringStock(days)` | GET `/inventory/stock/expiring` | Expiring stock |

### batchesApi
| Method | Endpoint | Description |
|--------|----------|-------------|
| `getAll(params)` | GET `/inventory/batches` | List batches |
| `getByProduct(productId)` | GET `/inventory/batches/:productId` | Batches for product |
| `create(data)` | POST `/inventory/batches` | Create batch |
| `update(id, data)` | PUT `/inventory/batches/:id` | Update batch |

---

## 👥 Master Data

### customersApi
| Method | Endpoint | Description |
|--------|----------|-------------|
| `getAll(params)` | GET `/customers` | List customers |
| `getById(id)` | GET `/customers/:id` | Get customer |
| `create(data)` | POST `/customers` | Create customer |
| `update(id, data)` | PUT `/customers/:id` | Update customer |
| `search(query)` | GET `/customers/search` | Search customers |
| `getOutstanding(id)` | GET `/customers/:id/outstanding` | Outstanding balance |

### suppliersApi
| Method | Endpoint | Description |
|--------|----------|-------------|
| `getAll(params)` | GET `/suppliers` | List suppliers |
| `getById(id)` | GET `/suppliers/:id` | Get supplier |
| `create(data)` | POST `/suppliers` | Create supplier |
| `update(id, data)` | PUT `/suppliers/:id` | Update supplier |
| `search(query)` | GET `/suppliers/search` | Search suppliers |

### productsApi
| Method | Endpoint | Description |
|--------|----------|-------------|
| `getAll(params)` | GET `/products` | List products |
| `getById(id)` | GET `/products/:id` | Get product |
| `create(data)` | POST `/products` | Create product |
| `update(id, data)` | PUT `/products/:id` | Update product |
| `search(query)` | GET `/products/search` | Search products |
| `getByBarcode(barcode)` | GET `/products/barcode/:barcode` | Find by barcode |

---

## 💰 Finance

### paymentsApi
| Method | Endpoint | Description |
|--------|----------|-------------|
| `getAll(params)` | GET `/payments` | List payments |
| `create(data)` | POST `/payments` | Record payment |
| `allocate(id, data)` | POST `/payments/:id/allocate` | Allocate to invoices |

### ledgerApi
| Method | Endpoint | Description |
|--------|----------|-------------|
| `getPartyLedger(partyId)` | GET `/ledger/:partyId` | Party ledger |
| `getOutstanding(partyType)` | GET `/ledger/outstanding` | Outstanding summary |
| `getAgingReport()` | GET `/ledger/aging` | Aging report |

---

## 📋 Common Query Parameters

Most list endpoints support:

| Param | Type | Description |
|-------|------|-------------|
| `page` | number | Page number (1-indexed) |
| `per_page` | number | Items per page (default: 20) |
| `search` | string | Search query |
| `sort_by` | string | Sort field |
| `sort_order` | 'asc' \| 'desc' | Sort direction |
| `status` | string | Filter by status |
| `from_date` | string | From date (YYYY-MM-DD) |
| `to_date` | string | To date (YYYY-MM-DD) |

---

## 📥 Response Format

Standard list response:
```json
{
  "data": [...],
  "pagination": {
    "total": 150,
    "page": 1,
    "per_page": 20,
    "total_pages": 8
  }
}
```

Standard error response:
```json
{
  "detail": "Error message"
}
// or for validation
{
  "detail": [
    { "loc": ["body", "field"], "msg": "error message" }
  ]
}
```
