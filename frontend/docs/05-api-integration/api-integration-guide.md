# 🔌 API Integration Guide

> **Complete guide** to backend API integration

---

## 📋 Overview

All API communication goes through a centralized `apiClient` with:
- Automatic token management
- Request/response interceptors
- Error handling
- Retry logic

---

## 🔧 API Client Setup

### Base Configuration

```typescript
// services/api/apiClient.ts
import axios, { AxiosInstance, AxiosError } from 'axios';
import { tokenService } from './tokenService';

const API_URL = import.meta.env.VITE_API_URL;
const TIMEOUT = parseInt(import.meta.env.VITE_API_TIMEOUT || '30000');

export const apiClient: AxiosInstance = axios.create({
    baseURL: API_URL,
    timeout: TIMEOUT,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Add auth token to requests
apiClient.interceptors.request.use(
    (config) => {
        const token = tokenService.getAccessToken();
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// Handle responses and errors
apiClient.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
        // Handle 401 - try refresh token
        if (error.response?.status === 401) {
            return handleUnauthorized(error);
        }
        
        // Handle other errors
        return Promise.reject(normalizeError(error));
    }
);
```

### Token Refresh

```typescript
async function handleUnauthorized(error: AxiosError) {
    const originalRequest = error.config as any;
    
    // Prevent infinite loop
    if (originalRequest._retry) {
        tokenService.clearTokens();
        window.location.href = '/login';
        return Promise.reject(error);
    }
    
    originalRequest._retry = true;
    
    try {
        const newToken = await refreshAccessToken();
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(originalRequest);
    } catch (refreshError) {
        tokenService.clearTokens();
        window.location.href = '/login';
        return Promise.reject(refreshError);
    }
}
```

---

## 📡 Making API Calls

### Basic Usage

```typescript
// GET request
const response = await apiClient.get('/invoices');
const invoices = response.data.data;

// GET with params
const response = await apiClient.get('/invoices', {
    params: {
        status: 'pending',
        limit: 20,
        offset: 0,
    },
});

// POST request
const response = await apiClient.post('/invoices', {
    customer_id: 123,
    items: [...],
});

// PUT request
const response = await apiClient.put(`/invoices/${id}`, updateData);

// DELETE request
await apiClient.delete(`/invoices/${id}`);
```

### API Module Pattern

```typescript
// services/api/modules/invoices.api.ts
import { apiClient } from '../apiClient';
import { Invoice, CreateInvoiceDTO, InvoiceFilters } from '@/types';

export const invoiceApi = {
    // List invoices
    async list(filters?: InvoiceFilters): Promise<{
        data: Invoice[];
        pagination: Pagination;
    }> {
        const response = await apiClient.get('/invoices', { params: filters });
        return response.data;
    },

    // Get single invoice
    async get(id: string): Promise<Invoice> {
        const response = await apiClient.get(`/invoices/${id}`);
        return response.data.data;
    },

    // Create invoice
    async create(data: CreateInvoiceDTO): Promise<Invoice> {
        const response = await apiClient.post('/invoices', data);
        return response.data.data;
    },

    // Update invoice
    async update(id: string, data: Partial<Invoice>): Promise<Invoice> {
        const response = await apiClient.put(`/invoices/${id}`, data);
        return response.data.data;
    },

    // Delete invoice
    async delete(id: string): Promise<void> {
        await apiClient.delete(`/invoices/${id}`);
    },

    // Bulk operations
    async bulkExport(ids: string[]): Promise<Blob> {
        const response = await apiClient.post('/invoices/export', { ids }, {
            responseType: 'blob',
        });
        return response.data;
    },
};
```

---

## ⚠️ Error Handling

### Error Types

```typescript
// types/api.types.ts
export interface ApiError {
    status: number;
    code: string;
    message: string;
    details?: Record<string, string[]>;
}

export class APIError extends Error {
    constructor(
        public status: number,
        public code: string,
        message: string,
        public details?: Record<string, string[]>
    ) {
        super(message);
        this.name = 'APIError';
    }
}
```

### Error Normalization

```typescript
function normalizeError(error: AxiosError): APIError {
    const response = error.response;
    
    if (response) {
        const data = response.data as any;
        return new APIError(
            response.status,
            data.code || 'UNKNOWN_ERROR',
            data.message || 'An error occurred',
            data.details
        );
    }
    
    if (error.code === 'ECONNABORTED') {
        return new APIError(0, 'TIMEOUT', 'Request timed out');
    }
    
    if (!navigator.onLine) {
        return new APIError(0, 'OFFLINE', 'No internet connection');
    }
    
    return new APIError(0, 'NETWORK_ERROR', 'Network error');
}
```

### Handling Errors in Components

```tsx
function InvoiceForm() {
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

    const handleSubmit = async (data: InvoiceData) => {
        try {
            await invoiceApi.create(data);
            toast.success('Invoice created!');
            navigate('/invoices');
        } catch (err) {
            if (err instanceof APIError) {
                // Handle validation errors
                if (err.status === 422 && err.details) {
                    setFieldErrors(
                        Object.fromEntries(
                            Object.entries(err.details).map(
                                ([key, messages]) => [key, messages[0]]
                            )
                        )
                    );
                    return;
                }
                
                // Handle business logic errors
                if (err.status === 400) {
                    setError(err.message);
                    return;
                }
                
                // Handle server errors
                if (err.status >= 500) {
                    setError('Server error. Please try again later.');
                    return;
                }
            }
            
            // Unknown error
            setError('An unexpected error occurred');
        }
    };
}
```

---

## 🔄 Loading States

### Using Custom Hooks

```typescript
// hooks/useApiCall.ts
import { useState, useCallback } from 'react';

interface UseApiCallOptions<T> {
    onSuccess?: (data: T) => void;
    onError?: (error: APIError) => void;
}

export function useApiCall<T, Args extends any[]>(
    apiFunction: (...args: Args) => Promise<T>,
    options?: UseApiCallOptions<T>
) {
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<APIError | null>(null);

    const execute = useCallback(async (...args: Args) => {
        setLoading(true);
        setError(null);
        
        try {
            const result = await apiFunction(...args);
            setData(result);
            options?.onSuccess?.(result);
            return result;
        } catch (err) {
            const apiError = err instanceof APIError ? err : 
                new APIError(0, 'UNKNOWN', 'Unknown error');
            setError(apiError);
            options?.onError?.(apiError);
            throw apiError;
        } finally {
            setLoading(false);
        }
    }, [apiFunction, options]);

    return { data, loading, error, execute };
}
```

### Usage

```tsx
function InvoiceList() {
    const { data: invoices, loading, error, execute: loadInvoices } = useApiCall(
        invoiceApi.list,
        {
            onError: (err) => toast.error(err.message),
        }
    );

    useEffect(() => {
        loadInvoices({ status: 'all' });
    }, []);

    if (loading) return <Spinner />;
    if (error) return <ErrorMessage error={error} />;
    if (!invoices?.length) return <EmptyState />;

    return <InvoiceTable invoices={invoices} />;
}
```

---

## 📄 Pagination

### Standard Pagination

```typescript
// API response format
interface PaginatedResponse<T> {
    data: T[];
    pagination: {
        total: number;
        page: number;
        per_page: number;
        total_pages: number;
    };
}

// Hook for paginated data
function usePaginatedData<T>(
    fetchFn: (params: PaginationParams) => Promise<PaginatedResponse<T>>
) {
    const [data, setData] = useState<T[]>([]);
    const [pagination, setPagination] = useState({
        page: 1,
        perPage: 20,
        total: 0,
    });
    const [loading, setLoading] = useState(false);

    const loadPage = async (page: number) => {
        setLoading(true);
        try {
            const response = await fetchFn({
                page,
                limit: pagination.perPage,
            });
            setData(response.data);
            setPagination({
                ...pagination,
                page,
                total: response.pagination.total,
            });
        } finally {
            setLoading(false);
        }
    };

    return { data, pagination, loading, loadPage };
}
```

---

## 🔐 Authenticated Requests

### File Upload

```typescript
async function uploadFile(file: File): Promise<{ url: string }> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await apiClient.post('/files/upload', formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });

    return response.data;
}
```

### File Download

```typescript
async function downloadInvoicePDF(invoiceId: string): Promise<void> {
    const response = await apiClient.get(`/invoices/${invoiceId}/pdf`, {
        responseType: 'blob',
    });

    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `invoice-${invoiceId}.pdf`);
    document.body.appendChild(link);
    link.click();
    link.remove();
}
```

---

## 📁 API Module Structure

```
services/api/
├── apiClient.ts              # Axios instance
├── tokenService.ts           # Token management
├── index.ts                  # Exports
└── modules/
    ├── auth.api.ts           # Authentication
    ├── invoices.api.ts       # Invoice operations
    ├── customers.api.ts      # Customer operations
    ├── products.api.ts       # Product operations
    ├── batches.api.ts        # Batch operations
    ├── payments.api.ts       # Payment operations
    └── reports.api.ts        # Report operations
```

---

## 🎯 Best Practices

### Do's ✅

- Use API modules for all backend calls
- Handle all error cases
- Show loading states
- Use TypeScript for request/response types
- Cancel requests on component unmount

### Don'ts ❌

- Don't call `axios` directly (use `apiClient`)
- Don't ignore errors
- Don't hardcode API URLs
- Don't store tokens in plain state

---

## 📚 Further Reading

- [Endpoints Reference](./endpoints-reference.md) - All API endpoints
- [Error Handling](./error-handling.md) - Error patterns
