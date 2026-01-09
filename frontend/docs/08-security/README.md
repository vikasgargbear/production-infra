# 🔐 Security

> **Security practices** for the frontend application

---

## 🎯 Security Overview

| Area | Implementation | Status |
|------|----------------|--------|
| **Authentication** | JWT tokens | ✅ Implemented |
| **Authorization** | Role-based access | ✅ Implemented |
| **Input Validation** | Client-side + Server-side | ✅ Implemented |
| **XSS Prevention** | React escaping, sanitization | ✅ Implemented |
| **CSRF Protection** | Token-based | ✅ Implemented |

---

## 🔑 Authentication Flow

```
User Login
    │
    ▼
┌─────────────────┐
│ Login Form      │ ──► POST /auth/login
└─────────────────┘           │
                              ▼
                    ┌───────────────────┐
                    │ Backend validates │
                    │ Returns JWT token │
                    └─────────┬─────────┘
                              │
    ┌─────────────────────────┼─────────────────────────┐
    ▼                         ▼                         ▼
┌─────────┐           ┌─────────────┐          ┌─────────────┐
│ Store   │           │ Set Auth    │          │ Redirect to │
│ Token   │           │ Context     │          │ Dashboard   │
└─────────┘           └─────────────┘          └─────────────┘
```

---

## 🔒 Token Management

```typescript
// Store token securely
localStorage.setItem('auth_token', token);  // Access token
// (Refresh token in httpOnly cookie - handled by backend)

// Token in API requests
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Token expiry handling
if (error.response?.status === 401) {
  localStorage.removeItem('auth_token');
  window.location.href = '/login';
}
```

---

## 👥 Role-Based Access Control

```typescript
// User roles
type Role = 'admin' | 'manager' | 'salesperson' | 'accountant' | 'viewer';

// Permission check component
<RequirePermission permission="create_invoice">
  <CreateInvoiceButton />
</RequirePermission>

// Hook usage
const { hasPermission } = useAuth();
if (hasPermission('delete_invoice')) {
  // Show delete button
}
```

---

## 🛡️ Input Validation

```typescript
// Always validate on both client AND server

// Client-side
const validateInvoice = (data: InvoiceData): ValidationResult => {
  const errors: string[] = [];
  
  if (!data.customer_id) errors.push('Customer required');
  if (data.items.length === 0) errors.push('At least one item required');
  if (data.total_amount < 0) errors.push('Invalid amount');
  
  return { valid: errors.length === 0, errors };
};

// Sanitize user input
import DOMPurify from 'dompurify';
const sanitized = DOMPurify.sanitize(userInput);
```

---

## 🚫 XSS Prevention

```typescript
// ✅ React automatically escapes
<div>{userInput}</div>

// ⚠️ Dangerous - avoid unless necessary
<div dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />

// ✅ If needed, always sanitize first
const safe = DOMPurify.sanitize(userHtml);
<div dangerouslySetInnerHTML={{ __html: safe }} />
```

---

## 📚 Further Reading

- [Authentication Details](./authentication.md)
- [Authorization & RBAC](./authorization.md)
- [Input Validation](./input-validation.md)
