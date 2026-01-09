# 🌐 React Context Usage

> **How we use React Context** for global state

---

## 📋 Available Contexts

| Context | Purpose | File |
|---------|---------|------|
| [AuthContext](#authcontext) | User authentication state | `contexts/AuthContext.tsx` |
| [CompanyContext](#companycontext) | Company/tenant information | `contexts/CompanyContext.tsx` |
| [PaymentContext](#paymentcontext) | Payment-related state | `contexts/PaymentContext.tsx` |
| [EscapeKeyContext](#escapekeycontext) | Modal hierarchy escape handling | `contexts/EscapeKeyContext.tsx` |

---

## 🔐 AuthContext

Manages authentication state and user information.

```typescript
import { useAuth } from '../contexts/AuthContext';

const MyComponent: React.FC = () => {
  const { 
    user,           // Current user object
    isAuthenticated,// Boolean - logged in?
    loading,        // Auth state loading
    login,          // Login function
    logout,         // Logout function
    hasPermission   // Permission checker
  } = useAuth();
  
  // Check authentication
  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }
  
  // Check permissions
  if (!hasPermission('create_invoice')) {
    return <div>Access Denied</div>;
  }
  
  // Use user data
  return (
    <div>
      <p>Welcome, {user?.name}</p>
      <p>Role: {user?.role}</p>
      <button onClick={logout}>Logout</button>
    </div>
  );
};
```

**Available Values**:
| Value | Type | Description |
|-------|------|-------------|
| `user` | `User \| null` | Current user object |
| `isAuthenticated` | `boolean` | Is user logged in |
| `loading` | `boolean` | Auth loading state |
| `login` | `(credentials) => Promise` | Login function |
| `logout` | `() => void` | Logout function |
| `hasPermission` | `(permission: string) => boolean` | Check permission |
| `refreshToken` | `() => Promise` | Refresh auth token |

---

## 🏢 CompanyContext

Manages company/tenant information.

```typescript
import { useCompany } from '../contexts/CompanyContext';

const InvoiceHeader: React.FC = () => {
  const {
    company,        // Company details
    loading,        // Loading state
    refreshCompany  // Reload company data
  } = useCompany();
  
  if (!company) return null;
  
  return (
    <div className="company-header">
      <h1>{company.name}</h1>
      <p>{company.address}</p>
      <p>GST: {company.gst_number}</p>
      <p>Phone: {company.phone}</p>
    </div>
  );
};
```

**Company Object**:
```typescript
interface Company {
  id: number;
  name: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  email: string;
  gst_number: string;
  pan_number: string;
  logo_url?: string;
  settings?: CompanySettings;
}
```

---

## 💳 PaymentContext

Manages payment-related state and actions.

```typescript
import { usePayment } from '../contexts/PaymentContext';

const PaymentSection: React.FC = () => {
  const {
    paymentMethods,    // Available payment methods
    bankAccounts,      // Bank accounts
    selectedMethod,    // Currently selected method
    setSelectedMethod  // Change method
  } = usePayment();
  
  return (
    <Select
      value={selectedMethod}
      onChange={setSelectedMethod}
      options={paymentMethods.map(m => ({
        value: m.id,
        label: m.name
      }))}
    />
  );
};
```

---

## ⎋ EscapeKeyContext

Manages escape key handling for nested modals.

```typescript
import { useEscapeKey } from '../hooks/useEscapeKey';

// In modals - register escape handler
const MyModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  // Register this modal's escape handler
  useEscapeKey(
    onClose,           // Handler function
    true,              // Is active?
    'MyModal'          // Identifier
  );
  
  return (
    <div className="modal">
      {/* Modal content */}
    </div>
  );
};

// The context ensures only the topmost modal 
// handles Escape key press
```

---

## 🏗️ Provider Setup

Contexts are wrapped in `App.tsx`:

```typescript
// App.tsx
import { AuthProvider } from './contexts/AuthContext';
import { CompanyProvider } from './contexts/CompanyContext';
import { PaymentProvider } from './contexts/PaymentContext';

const App = () => {
  return (
    <AuthProvider>
      <CompanyProvider>
        <PaymentProvider>
          <Router>
            <AppRoutes />
          </Router>
        </PaymentProvider>
      </CompanyProvider>
    </AuthProvider>
  );
};
```

---

## ✅ Best Practices

### 1. Always Handle Loading State
```typescript
const { user, loading } = useAuth();

if (loading) return <Spinner />;
if (!user) return <LoginRedirect />;
```

### 2. Check Permissions Before Rendering
```typescript
const { hasPermission } = useAuth();

// In component
{hasPermission('delete_invoice') && (
  <DeleteButton onClick={handleDelete} />
)}
```

### 3. Use Context for Truly Global State
```typescript
// ✅ Good: Auth state (needed everywhere)
const { user } = useAuth();

// ✅ Good: Company info (needed for headers/invoices)
const { company } = useCompany();

// ❌ Bad: Form state (should be local)
// Don't put form state in context
```

### 4. Combine with Local State
```typescript
// Context for global, useReducer for local
const { company } = useCompany();
const { state, dispatch } = useInvoiceListState();

// Use both together
const pageTitle = `${company.name} - Invoices`;
```
