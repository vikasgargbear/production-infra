# 🔄 useReducer Pattern Guide

> **How we use useReducer** for complex state management

---

## 🎯 Why useReducer?

We migrate components from multiple `useState` calls to single `useReducer` when:
- Component has **5+ related state variables**
- State updates have **complex logic**
- Multiple state pieces need to update together

### Example Migration

```typescript
// ❌ Before: 15 useState calls
const [invoices, setInvoices] = useState([]);
const [loading, setLoading] = useState(false);
const [search, setSearch] = useState('');
const [status, setStatus] = useState('all');
const [page, setPage] = useState(1);
const [selectedIds, setSelectedIds] = useState(new Set());
const [showFilters, setShowFilters] = useState(false);
// ... 8 more

// ✅ After: 1 useReducer
const { state, dispatch } = useInvoiceListState();
```

**Results**:
- 93% fewer useState calls
- Predictable state updates
- Easier debugging
- Better performance

---

## 🏗️ Standard Pattern

### Step 1: Define State Interface

```typescript
// hooks/useModuleState.ts

interface ModuleState {
  // Data
  data: DataItem[];
  
  // Filters
  filters: {
    search: string;
    status: string;
    dateRange: string;
  };
  
  // UI State
  ui: {
    loading: boolean;
    showFilters: boolean;
    showModal: boolean;
  };
  
  // Selection
  selectedIds: Set<string>;
  
  // Pagination
  pagination: {
    page: number;
    perPage: number;
    total: number;
  };
}
```

### Step 2: Define Actions

```typescript
type ModuleAction =
  // Data actions
  | { type: 'SET_DATA'; data: DataItem[] }
  | { type: 'ADD_ITEM'; item: DataItem }
  | { type: 'REMOVE_ITEM'; id: string }
  
  // Filter actions
  | { type: 'SET_FILTER'; filter: keyof ModuleState['filters']; value: string }
  | { type: 'RESET_FILTERS' }
  
  // UI actions
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'TOGGLE_FILTERS' }
  | { type: 'TOGGLE_MODAL' }
  
  // Selection actions
  | { type: 'TOGGLE_SELECT'; id: string }
  | { type: 'SELECT_ALL'; ids: string[] }
  | { type: 'CLEAR_SELECTION' }
  
  // Pagination actions
  | { type: 'SET_PAGE'; page: number }
  
  // Reset
  | { type: 'RESET' };
```

### Step 3: Create Initial State

```typescript
const initialState: ModuleState = {
  data: [],
  filters: {
    search: '',
    status: 'all',
    dateRange: 'all'
  },
  ui: {
    loading: false,
    showFilters: false,
    showModal: false
  },
  selectedIds: new Set(),
  pagination: {
    page: 1,
    perPage: 20,
    total: 0
  }
};
```

### Step 4: Create Reducer

```typescript
function moduleReducer(state: ModuleState, action: ModuleAction): ModuleState {
  switch (action.type) {
    // Data
    case 'SET_DATA':
      return { ...state, data: action.data };
    
    case 'ADD_ITEM':
      return { ...state, data: [...state.data, action.item] };
    
    case 'REMOVE_ITEM':
      return { 
        ...state, 
        data: state.data.filter(item => item.id !== action.id) 
      };
    
    // Filters
    case 'SET_FILTER':
      return {
        ...state,
        filters: { ...state.filters, [action.filter]: action.value },
        pagination: { ...state.pagination, page: 1 } // Reset page on filter
      };
    
    case 'RESET_FILTERS':
      return { ...state, filters: initialState.filters };
    
    // UI
    case 'SET_LOADING':
      return { ...state, ui: { ...state.ui, loading: action.loading } };
    
    case 'TOGGLE_FILTERS':
      return { 
        ...state, 
        ui: { ...state.ui, showFilters: !state.ui.showFilters } 
      };
    
    // Selection
    case 'TOGGLE_SELECT':
      const newIds = new Set(state.selectedIds);
      if (newIds.has(action.id)) {
        newIds.delete(action.id);
      } else {
        newIds.add(action.id);
      }
      return { ...state, selectedIds: newIds };
    
    case 'CLEAR_SELECTION':
      return { ...state, selectedIds: new Set() };
    
    // Pagination
    case 'SET_PAGE':
      return { 
        ...state, 
        pagination: { ...state.pagination, page: action.page } 
      };
    
    // Reset
    case 'RESET':
      return initialState;
    
    default:
      return state;
  }
}
```

### Step 5: Create Custom Hook

```typescript
export function useModuleState() {
  const [state, dispatch] = useReducer(moduleReducer, initialState);
  
  // Destructure for convenience
  const { data, filters, ui, selectedIds, pagination } = state;
  
  // Computed values (with useMemo)
  const filteredData = useMemo(() => {
    let result = data;
    
    if (filters.search) {
      const query = filters.search.toLowerCase();
      result = result.filter(item => 
        item.name.toLowerCase().includes(query)
      );
    }
    
    if (filters.status !== 'all') {
      result = result.filter(item => item.status === filters.status);
    }
    
    return result;
  }, [data, filters.search, filters.status]);
  
  const selectedCount = useMemo(() => {
    return Array.from(selectedIds).filter(id => 
      filteredData.some(item => item.id === id)
    ).length;
  }, [selectedIds, filteredData]);
  
  return {
    // Raw state
    state,
    dispatch,
    
    // Destructured for convenience
    data,
    filters,
    ui,
    selectedIds,
    pagination,
    
    // Computed
    filteredData,
    selectedCount
  };
}
```

---

## 📦 Using in Components

```typescript
// Module.tsx
import { useModuleState } from './hooks/useModuleState';

const Module: React.FC = () => {
  const {
    data,
    filters,
    ui,
    dispatch,
    filteredData,
    selectedCount
  } = useModuleState();
  
  // Use handlers with useCallback
  const handleSearch = useCallback((query: string) => {
    dispatch({ type: 'SET_FILTER', filter: 'search', value: query });
  }, [dispatch]);
  
  const handleSelect = useCallback((id: string) => {
    dispatch({ type: 'TOGGLE_SELECT', id });
  }, [dispatch]);
  
  return (
    <div>
      <SearchBar 
        value={filters.search} 
        onChange={handleSearch} 
      />
      
      <DataTable 
        data={filteredData}
        selectedIds={selectedIds}
        onSelect={handleSelect}
      />
      
      {selectedCount > 0 && (
        <BulkActions count={selectedCount} />
      )}
    </div>
  );
};
```

---

## 📁 File Structure

```
components/module/
├── types/
│   └── module.types.ts       # State, Action types
├── hooks/
│   └── useModuleState.ts     # The reducer hook
├── components/
│   ├── ModuleFilters.tsx     # Sub-component
│   └── ModuleTable.tsx       # Sub-component
└── Module.tsx                # Main component
```

---

## 🎯 Real Examples in Codebase

| Component | Before | After | File |
|-----------|--------|-------|------|
| InvoiceList | 15 useState | 1 useReducer | `useInvoiceListState.ts` |
| Outstanding | 7 useState | 1 useReducer | `useOutstandingState.ts` |
| SalesReturn | 14 useState | 1 useReducer | `useSalesReturnState.ts` |
| Dashboard | 21 useState | 1 useReducer | `useDashboardState.ts` |
| PurchaseHistory | 15 useState | 1 useReducer | `usePurchaseListHistoryState.ts` |
