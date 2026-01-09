# 🔌 API Client Usage Guide

> **How to make API calls** in the application

---

## 📦 Import

```typescript
// Import specific APIs
import { 
  invoicesApi, 
  customersApi, 
  productsApi,
  ordersApi 
} from '../../services/api';

// Or import the client directly
import { apiClient, apiHelpers } from '../../services/api';
```

---

## 🏗️ API Structure

Our APIs are organized by **domain**:

```
services/api/
├── apiClient.ts              # Axios instance with interceptors
├── index.ts                  # Central exports
└── modules/
    ├── analytics/            # Dashboard, Reports
    │   ├── dashboard.api.ts
    │   └── reports.api.ts
    ├── auth/                 # Authentication
    │   ├── auth.api.ts
    │   └── users.api.ts
    ├── finance/              # Payments, Ledger
    │   ├── payments.api.ts
    │   └── ledger.api.ts
    ├── inventory/            # Stock, Batches
    │   ├── stock.api.ts
    │   └── batches.api.ts
    ├── master/               # Customers, Products
    │   ├── customers.api.ts
    │   ├── suppliers.api.ts
    │   └── products.api.ts
    ├── purchase/             # POs, GRN
    │   ├── purchases.api.ts
    │   └── grn.api.ts
    ├── sales/                # Invoices, Orders
    │   ├── invoices.api.ts
    │   ├── orders.api.ts
    │   ├── challans.api.ts
    │   └── returns.api.ts
    └── settings/             # Configuration
        ├── settings.api.ts
        └── metadata.api.ts
```

---

## 📋 Available APIs

| Domain | API | Methods |
|--------|-----|---------|
| **Sales** | `invoicesApi` | getAll, getById, create, update, delete |
| | `ordersApi` | getAll, getById, create, update, delete |
| | `challansApi` | getAll, getById, create, update, delete |
| | `returnsApi` | getAll, getById, create |
| **Purchase** | `purchasesApi` | getAll, getById, create, update |
| | `grnApi` | getAll, getById, create |
| **Inventory** | `stockApi` | getCurrent, getByProduct, adjust |
| | `batchesApi` | getAll, getByProduct, create |
| **Master** | `customersApi` | getAll, getById, create, update, search |
| | `suppliersApi` | getAll, getById, create, update |
| | `productsApi` | getAll, getById, create, update, search |
| **Finance** | `paymentsApi` | getAll, create, allocate |
| | `ledgerApi` | getPartyLedger, getOutstanding |
| **Auth** | `authApi` | login, logout, refreshToken |
| | `usersApi` | getCurrentUser, updateProfile |

---

## 💡 Usage Examples

### List with Pagination
```typescript
const fetchInvoices = async () => {
  try {
    const response = await invoicesApi.getAll({
      page: 1,
      per_page: 20,
      search: searchQuery,
      status: 'paid'
    });
    
    setInvoices(response.data.invoices);
    setTotalPages(response.data.pagination.total_pages);
  } catch (error) {
    toast.error('Failed to fetch invoices');
  }
};
```

### Get Single Record
```typescript
const fetchInvoice = async (id: number) => {
  try {
    const response = await invoicesApi.getById(id);
    setInvoice(response.data);
  } catch (error) {
    if (error.response?.status === 404) {
      toast.error('Invoice not found');
    }
  }
};
```

### Create Record
```typescript
const createInvoice = async (data: CreateInvoiceDTO) => {
  try {
    const response = await invoicesApi.create(data);
    toast.success('Invoice created successfully');
    return response.data;
  } catch (error) {
    if (error.response?.status === 422) {
      // Validation error
      const errors = error.response.data.detail;
      toast.error(`Validation: ${errors[0].msg}`);
    } else {
      toast.error('Failed to create invoice');
    }
    throw error;
  }
};
```

### Update Record
```typescript
const updateInvoice = async (id: number, data: UpdateInvoiceDTO) => {
  try {
    await invoicesApi.update(id, data);
    toast.success('Invoice updated');
  } catch (error) {
    toast.error('Failed to update invoice');
  }
};
```

### Delete Record
```typescript
const deleteInvoice = async (id: number) => {
  try {
    await invoicesApi.delete(id);
    toast.success('Invoice deleted');
    refreshList();
  } catch (error) {
    toast.error('Failed to delete invoice');
  }
};
```

### Search
```typescript
const searchCustomers = async (query: string) => {
  if (query.length < 2) return;
  
  try {
    const response = await customersApi.search({
      query,
      limit: 10
    });
    setResults(response.data);
  } catch (error) {
    console.error('Search failed:', error);
  }
};
```

---

## ⚠️ Error Handling

```typescript
try {
  const response = await apiCall();
  // Success
} catch (error) {
  if (axios.isAxiosError(error)) {
    const { status, data } = error.response || {};
    
    switch (status) {
      case 400:
        toast.error(data?.detail || 'Bad request');
        break;
      case 401:
        // Handled by interceptor - redirects to login
        break;
      case 403:
        toast.error('Permission denied');
        break;
      case 404:
        toast.error('Resource not found');
        break;
      case 422:
        // Validation errors from FastAPI
        const messages = data.detail.map((e: any) => e.msg);
        toast.error(messages.join(', '));
        break;
      case 500:
        toast.error('Server error. Please try again.');
        break;
      default:
        toast.error('An error occurred');
    }
  } else {
    toast.error('Network error. Check your connection.');
  }
}
```

---

## 🔧 Using apiHelpers

For direct API calls with automatic trailing slash handling:

```typescript
import { apiHelpers } from '../../services/api';

// GET
const response = await apiHelpers.get('/custom-endpoint', { params: { id: 1 } });

// POST
const response = await apiHelpers.post('/custom-endpoint', data);

// Download file
await apiHelpers.download('/reports/export', 'report.pdf');
```

---

## 🔐 Authentication

The `apiClient` automatically:

1. **Adds Bearer token** from localStorage to all requests
2. **Adds X-Org-Id header** from user data
3. **Redirects to /login** on 401 responses
4. **Handles trailing slashes** for FastAPI compatibility

You don't need to handle auth manually!

```typescript
// Token is automatically added to headers
const response = await invoicesApi.getAll();
// Authorization: Bearer <token>
// X-Org-Id: <org_id>
```
