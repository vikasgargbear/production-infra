# 🔄 State Management

> **Patterns and practices** for managing state in the application

---

## 🎯 State Management Strategy

We use a **layered approach** to state management:

| Layer | Technology | Use Case |
|-------|------------|----------|
| **Local** | `useState` | Simple, single-component state |
| **Complex Local** | `useReducer` | Multi-field forms, complex logic |
| **Module** | Custom Hooks | Shared within a module |
| **Global** | React Context | App-wide state (auth, theme) |

---

## 📦 The useReducer Pattern (Recommended)

### Why useReducer?
```typescript
// ❌ Before: 15+ useState calls
const [search, setSearch] = useState('');
const [loading, setLoading] = useState(false);
const [data, setData] = useState([]);
const [filters, setFilters] = useState({});
const [selectedIds, setSelectedIds] = useState(new Set());
// ... 10 more

// ✅ After: Single useReducer
const { state, dispatch } = useModuleState();
```

### Benefits
- **Predictable updates**: All state changes through dispatch
- **Debuggable**: Log all actions
- **Testable**: Reducer is a pure function
- **Performance**: Fewer re-renders

---

## 🏗️ Standard Hook Structure

```typescript
// hooks/useModuleState.ts

// 1. Define State Interface
interface ModuleState {
  data: DataItem[];
  filters: {
    search: string;
    status: string;
  };
  ui: {
    loading: boolean;
    showModal: boolean;
  };
  selectedIds: Set<string>;
}

// 2. Define Actions
type ModuleAction =
  | { type: 'SET_DATA'; data: DataItem[] }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'SET_FILTER'; filter: string; value: string }
  | { type: 'TOGGLE_SELECT'; id: string }
  | { type: 'RESET' };

// 3. Initial State
const initialState: ModuleState = {
  data: [],
  filters: { search: '', status: 'all' },
  ui: { loading: false, showModal: false },
  selectedIds: new Set()
};

// 4. Reducer
function moduleReducer(state: ModuleState, action: ModuleAction): ModuleState {
  switch (action.type) {
    case 'SET_DATA':
      return { ...state, data: action.data };
    
    case 'SET_LOADING':
      return { ...state, ui: { ...state.ui, loading: action.loading } };
    
    case 'SET_FILTER':
      return { 
        ...state, 
        filters: { ...state.filters, [action.filter]: action.value } 
      };
    
    case 'TOGGLE_SELECT':
      const newIds = new Set(state.selectedIds);
      newIds.has(action.id) ? newIds.delete(action.id) : newIds.add(action.id);
      return { ...state, selectedIds: newIds };
    
    case 'RESET':
      return initialState;
    
    default:
      return state;
  }
}

// 5. Custom Hook
export function useModuleState() {
  const [state, dispatch] = useReducer(moduleReducer, initialState);
  
  // Derived state
  const { data, filters, ui, selectedIds } = state;
  
  // Computed values
  const filteredData = useMemo(() => {
    return data.filter(item => 
      item.name.includes(filters.search)
    );
  }, [data, filters.search]);
  
  return {
    state,
    dispatch,
    data,
    filters,
    ui,
    selectedIds,
    filteredData
  };
}
```

---

## 🎛️ Using the Hook in Components

```typescript
// ModuleComponent.tsx
import { useModuleState } from './hooks/useModuleState';

const ModuleComponent: React.FC = () => {
  const { 
    data, 
    filters, 
    ui, 
    dispatch,
    filteredData 
  } = useModuleState();
  
  // Dispatch actions
  const handleSearch = (query: string) => {
    dispatch({ type: 'SET_FILTER', filter: 'search', value: query });
  };
  
  const handleSelect = (id: string) => {
    dispatch({ type: 'TOGGLE_SELECT', id });
  };
  
  return (
    <div>
      <SearchInput 
        value={filters.search}
        onChange={handleSearch}
      />
      <DataTable 
        data={filteredData}
        onSelect={handleSelect}
      />
    </div>
  );
};
```

---

## 🌐 React Context (Global State)

### When to Use Context
- User authentication state
- Company/tenant information
- Theme preferences
- Feature flags

### Context Pattern
```typescript
// contexts/AuthContext.tsx

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState);
  
  return (
    <AuthContext.Provider value={{ ...state, dispatch }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be inside AuthProvider');
  return context;
}
```

---

## ⚡ Performance Optimization

### 1. React.memo for Components
```typescript
const SubComponent = React.memo(({ data, onAction }) => {
  return <div>...</div>;
});
```

### 2. useCallback for Handlers
```typescript
const handleClick = useCallback(() => {
  dispatch({ type: 'ACTION' });
}, [dispatch]);
```

### 3. useMemo for Expensive Calculations
```typescript
const filteredData = useMemo(() => {
  return data.filter(item => item.status === filter);
}, [data, filter]);
```

---

## 📚 Further Reading

- [useReducer Pattern Details](./useReducer-pattern.md)
- [Context Usage](./context-usage.md)
- [Performance Optimization](./performance.md)
