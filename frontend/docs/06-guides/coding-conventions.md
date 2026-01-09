# 📝 Coding Conventions

> **Code style, naming, and patterns** used across the frontend codebase

---

## 📁 File & Folder Naming

| Type | Convention | Example |
|------|------------|---------|
| **Components** | PascalCase | `InvoiceList.tsx`, `CustomerSearch.tsx` |
| **Hooks** | camelCase with `use` prefix | `useInvoiceListState.ts`, `useDebounce.ts` |
| **Types** | camelCase with `.types.ts` | `invoice.types.ts`, `module.types.ts` |
| **API modules** | camelCase with `.api.ts` | `invoices.api.ts`, `customers.api.ts` |
| **Utilities** | camelCase | `formatters.ts`, `validators.ts` |
| **Constants** | SCREAMING_SNAKE_CASE | `API_CONFIG.ts`, `STORAGE_KEYS.ts` |

---

## 🏗️ Component Structure

### Standard Component File
```typescript
/**
 * ComponentName Component
 * Brief description of what it does
 */

import React, { useState, useEffect, useCallback } from 'react';
import { SomeIcon } from 'lucide-react';

// Internal imports: services, contexts
import { apiClient } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

// Internal imports: components (global first, then local)
import { Button, Modal } from '../global';
import { ModuleHeader } from './components/ModuleHeader';

// Types
import type { ComponentData } from './types/component.types';

// Constants
const DEFAULT_PAGE_SIZE = 20;

// Types (if small, otherwise in separate file)
interface ComponentNameProps {
  onClose?: () => void;
  initialData?: ComponentData;
}

// Main Component
const ComponentName: React.FC<ComponentNameProps> = ({ onClose, initialData }) => {
  // State (or useReducer for complex)
  const [data, setData] = useState<ComponentData[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Effects
  useEffect(() => {
    // Effect logic
  }, []);
  
  // Handlers (useCallback for performance)
  const handleAction = useCallback(() => {
    // Handler logic
  }, []);
  
  // Render
  return (
    <div className="...">
      {/* JSX */}
    </div>
  );
};

export default ComponentName;
```

---

## 🔤 Naming Conventions

### Variables
```typescript
// ✅ Good: Descriptive, clear intent
const isLoading = true;
const selectedCustomerId = 123;
const invoiceItems = [];
const handleSubmit = () => {};

// ❌ Bad: Vague, unclear
const flag = true;
const id = 123;
const data = [];
const doIt = () => {};
```

### Functions
```typescript
// Event handlers: handle + Action
const handleClick = () => {};
const handleSubmit = () => {};
const handleCustomerSelect = (customer) => {};

// Fetch/async: fetch/load + Resource
const fetchInvoices = async () => {};
const loadCustomerData = async () => {};

// Compute/calculate: calculate/compute + What
const calculateTotal = () => {};
const computeTaxAmount = () => {};

// Boolean getters: is/has/should
const isValid = () => {};
const hasPermission = () => {};
const shouldShowModal = () => {};
```

### Types
```typescript
// Interfaces: PascalCase, descriptive
interface Invoice { ... }
interface InvoiceItem { ... }
interface InvoiceListState { ... }

// Props: ComponentName + Props
interface InvoiceListProps { ... }
interface CustomerSearchProps { ... }

// State: ComponentName + State
interface InvoiceListState { ... }

// Types (unions/aliases): PascalCase
type PaymentStatus = 'paid' | 'pending' | 'overdue';
type InvoiceAction = 
  | { type: 'SET_DATA'; data: Invoice[] }
  | { type: 'SET_LOADING'; loading: boolean };
```

---

## 📂 Import Order

```typescript
// 1. React and external libraries
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'react-toastify';
import { FileText, Download } from 'lucide-react';

// 2. Internal services and contexts
import { invoicesApi, customersApi } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useCompany } from '../../contexts/CompanyContext';

// 3. Components (global first, then local)
import { Button, Modal, DataTable, Pagination } from '../global';
import { InvoiceFilters } from './components/InvoiceFilters';
import { InvoiceTable } from './components/InvoiceTable';

// 4. Hooks
import { useInvoiceListState } from './hooks/useInvoiceListState';
import { useDebounce } from '../../hooks/useDebounce';

// 5. Types (use 'import type' when possible)
import type { Invoice, InvoiceItem } from './types/invoice.types';
import type { Customer } from '../../types/models';

// 6. Utilities and constants
import { formatCurrency, formatDate } from '../../utils/formatters';
import { INVOICE_STATUS, DEFAULT_PAGE_SIZE } from './constants';

// 7. Styles (if any)
import './InvoiceList.css';
```

---

## 🔄 State Management Rules

### When to use `useState`
- Simple, single values
- Independent state pieces
- < 3 related state variables

### When to use `useReducer`
- 5+ related state variables
- Complex update logic
- State depends on previous state
- Form with many fields

```typescript
// ✅ useState for simple state
const [isOpen, setIsOpen] = useState(false);
const [count, setCount] = useState(0);

// ✅ useReducer for complex state
const { state, dispatch } = useModuleState();
dispatch({ type: 'SET_DATA', data: newData });
```

---

## 🎨 JSX & Styling

### Component Structure
```tsx
// ✅ Clean JSX
return (
  <div className="invoice-list">
    {/* Header Section */}
    <ModuleHeader title="Invoices" onClose={onClose} />
    
    {/* Filters */}
    <InvoiceFilters 
      filters={filters}
      onFilterChange={handleFilterChange}
    />
    
    {/* Content */}
    {loading ? (
      <LoadingSpinner />
    ) : (
      <InvoiceTable data={data} onSelect={handleSelect} />
    )}
    
    {/* Footer */}
    <Pagination {...paginationProps} />
  </div>
);
```

### Tailwind Best Practices
```tsx
// ✅ Good: Logical grouping
<div className="
  flex items-center justify-between
  p-4 mb-4
  bg-white rounded-lg shadow-sm
  border border-gray-200
">

// ❌ Bad: Random order
<div className="shadow-sm p-4 flex border-gray-200 bg-white mb-4 rounded-lg items-center justify-between border">
```

---

## 🧹 Code Quality Rules

### TypeScript
```typescript
// ✅ Always type function parameters
const fetchData = async (id: number): Promise<Invoice> => { ... }

// ✅ Use type imports
import type { Invoice } from './types';

// ❌ Avoid 'any'
const data: any = {}; // Bad

// ✅ Use unknown for truly unknown data
const data: unknown = JSON.parse(response);
```

### Error Handling
```typescript
try {
  const response = await invoicesApi.create(data);
  toast.success('Invoice created');
  return response.data;
} catch (error) {
  if (error instanceof AxiosError) {
    toast.error(error.response?.data?.detail || 'Failed to create invoice');
  } else {
    toast.error('An unexpected error occurred');
  }
  throw error;
}
```

---

## 📋 Checklist for PRs

- [ ] No `any` types
- [ ] Components use React.memo where beneficial
- [ ] Handlers wrapped in useCallback
- [ ] Expensive computations in useMemo
- [ ] Proper error handling for API calls
- [ ] Consistent naming conventions
- [ ] Imports ordered correctly
- [ ] No console.log (except debug)
