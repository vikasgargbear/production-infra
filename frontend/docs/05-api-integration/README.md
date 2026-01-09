# 🔌 API Integration

> **How to integrate with backend APIs** in the application

---

## 🎯 API Client Overview

We use a centralized **apiClient** (Axios instance) for all HTTP requests.

```typescript
import { apiClient } from '../services/api';

// GET request
const response = await apiClient.get('/invoices');

// POST request
const result = await apiClient.post('/invoices', data);

// PUT request
await apiClient.put('/invoices/123', updates);

// DELETE request
await apiClient.delete('/invoices/123');
```

---

## 📁 API Structure

```
src/services/api/
├── apiClient.ts          # Axios instance with interceptors
├── invoicesApi.ts        # Invoice endpoints
├── customersApi.ts       # Customer endpoints
├── productsApi.ts        # Product endpoints
├── purchasesApi.ts       # Purchase endpoints
├── reportsApi.ts         # Report endpoints
└── index.ts              # Unified exports
```

---

## 🔧 API Client Configuration

```typescript
// services/api/apiClient.ts

import axios from 'axios';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request Interceptor - Add auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor - Handle errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Redirect to login
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default apiClient;
```

---

## 📋 Module API Pattern

```typescript
// services/api/invoicesApi.ts

import apiClient from './apiClient';

export const invoicesApi = {
  // List with pagination
  getAll: (params?: { page?: number; per_page?: number; search?: string }) => 
    apiClient.get('/sales/invoices', { params }),
  
  // Get single
  getById: (id: number) => 
    apiClient.get(`/sales/invoices/${id}`),
  
  // Create
  create: (data: CreateInvoiceDTO) => 
    apiClient.post('/sales/invoices', data),
  
  // Update
  update: (id: number, data: UpdateInvoiceDTO) => 
    apiClient.put(`/sales/invoices/${id}`, data),
  
  // Delete
  delete: (id: number) => 
    apiClient.delete(`/sales/invoices/${id}`),
  
  // Custom actions
  markAsPaid: (id: number, paymentData: PaymentDTO) =>
    apiClient.post(`/sales/invoices/${id}/payment`, paymentData),
  
  print: (id: number) =>
    apiClient.get(`/sales/invoices/${id}/print`, { responseType: 'blob' })
};
```

---

## 📥 Using APIs in Components

```typescript
// components/sales/InvoiceList.tsx

import { invoicesApi } from '../../services/api';

const InvoiceList: React.FC = () => {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchInvoices = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await invoicesApi.getAll({ page: 1, per_page: 20 });
      setInvoices(response.data.invoices);
    } catch (err) {
      setError(err.message || 'Failed to fetch invoices');
      toast.error('Failed to fetch invoices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  // ...
};
```

---

## ⚠️ Error Handling

```typescript
try {
  const response = await invoicesApi.create(invoiceData);
  toast.success('Invoice created successfully');
  return response.data;
  
} catch (error) {
  if (error.response) {
    // Server responded with error
    const { status, data } = error.response;
    
    switch (status) {
      case 400:
        toast.error(data.detail || 'Invalid data');
        break;
      case 401:
        // Handled by interceptor
        break;
      case 403:
        toast.error('Permission denied');
        break;
      case 404:
        toast.error('Resource not found');
        break;
      case 422:
        // Validation errors
        const errors = data.detail.map(e => e.msg).join(', ');
        toast.error(`Validation: ${errors}`);
        break;
      case 500:
        toast.error('Server error. Please try again.');
        break;
    }
  } else if (error.request) {
    // Network error
    toast.error('Network error. Check your connection.');
  }
  throw error;
}
```

---

## 🔄 Offline Support

```typescript
import offlineStorage from '../../services/offlineStorage';

// Store for offline use
await offlineStorage.storeOffline('invoices', data, { persistent: true });

// Retrieve offline data
const cached = await offlineStorage.getOffline('invoices');
if (cached?.data) {
  setInvoices(cached.data);
}
```

---

## 📚 API Endpoints Reference

### Sales Module
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/sales/invoices` | List invoices |
| POST | `/sales/invoices` | Create invoice |
| GET | `/sales/invoices/:id` | Get invoice |
| PUT | `/sales/invoices/:id` | Update invoice |
| DELETE | `/sales/invoices/:id` | Delete invoice |

### Purchase Module
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/purchases` | List POs |
| POST | `/purchases` | Create PO |
| GET | `/purchases/:id` | Get PO |

### Inventory Module
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/inventory/stock/current` | Current stock |
| GET | `/inventory/products` | Product list |
| POST | `/inventory/products` | Create product |

---

## 📚 Further Reading

- [Endpoints Reference](./endpoints-reference.md)
- [Error Handling](./error-handling.md)
- [Offline Sync](./offline-sync.md)
