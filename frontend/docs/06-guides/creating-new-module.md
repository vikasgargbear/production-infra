# 🚀 Creating a New Module

> **Step-by-step guide** to add a new feature module

---

## 📋 Overview

This guide shows how to create a new module following our established patterns.

---

## 📁 Step 1: Create Folder Structure

```bash
# Create the module folder structure
mkdir -p src/components/mymodule/{types,hooks,components}
touch src/components/mymodule/MyModule.tsx
touch src/components/mymodule/types/mymodule.types.ts
touch src/components/mymodule/hooks/useMyModuleState.ts
```

Resulting structure:
```
src/components/mymodule/
├── types/
│   └── mymodule.types.ts     # Type definitions
├── hooks/
│   └── useMyModuleState.ts   # State management
├── components/
│   ├── MyModuleFilters.tsx   # Sub-components
│   └── MyModuleTable.tsx
└── MyModule.tsx              # Main component
```

---

## 📝 Step 2: Define Types

```typescript
// types/mymodule.types.ts

/**
 * MyModule Type Definitions
 */

// ============================================================================
// Core Data Types
// ============================================================================

export interface MyItem {
  id: number;
  name: string;
  status: 'active' | 'inactive';
  amount: number;
  created_at: string;
}

// ============================================================================
// Component Props
// ============================================================================

export interface MyModuleProps {
  onClose?: () => void;
}

export interface MyModuleFiltersProps {
  filters: MyModuleFilters;
  onFilterChange: (filter: string, value: string) => void;
  onReset: () => void;
}

export interface MyModuleTableProps {
  data: MyItem[];
  selectedIds: Set<number>;
  onSelect: (id: number) => void;
  onAction: (item: MyItem) => void;
}

// ============================================================================
// State Management Types
// ============================================================================

export interface MyModuleFilters {
  search: string;
  status: string;
}

export interface MyModuleUIState {
  loading: boolean;
  showFilters: boolean;
}

export interface MyModuleState {
  data: MyItem[];
  filters: MyModuleFilters;
  ui: MyModuleUIState;
  selectedIds: Set<number>;
  pagination: {
    page: number;
    perPage: number;
    total: number;
  };
}

export type MyModuleAction =
  | { type: 'SET_DATA'; data: MyItem[] }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'SET_FILTER'; filter: keyof MyModuleFilters; value: string }
  | { type: 'TOGGLE_SELECT'; id: number }
  | { type: 'SET_PAGE'; page: number }
  | { type: 'RESET' };
```

---

## 🔄 Step 3: Create State Hook

```typescript
// hooks/useMyModuleState.ts

import { useReducer, useMemo } from 'react';
import type { MyModuleState, MyModuleAction, MyItem } from '../types/mymodule.types';

const initialState: MyModuleState = {
  data: [],
  filters: {
    search: '',
    status: 'all'
  },
  ui: {
    loading: false,
    showFilters: false
  },
  selectedIds: new Set(),
  pagination: {
    page: 1,
    perPage: 20,
    total: 0
  }
};

function myModuleReducer(state: MyModuleState, action: MyModuleAction): MyModuleState {
  switch (action.type) {
    case 'SET_DATA':
      return { ...state, data: action.data };
    
    case 'SET_LOADING':
      return { ...state, ui: { ...state.ui, loading: action.loading } };
    
    case 'SET_FILTER':
      return {
        ...state,
        filters: { ...state.filters, [action.filter]: action.value },
        pagination: { ...state.pagination, page: 1 }
      };
    
    case 'TOGGLE_SELECT':
      const newIds = new Set(state.selectedIds);
      newIds.has(action.id) ? newIds.delete(action.id) : newIds.add(action.id);
      return { ...state, selectedIds: newIds };
    
    case 'SET_PAGE':
      return { ...state, pagination: { ...state.pagination, page: action.page } };
    
    case 'RESET':
      return initialState;
    
    default:
      return state;
  }
}

export function useMyModuleState() {
  const [state, dispatch] = useReducer(myModuleReducer, initialState);
  
  const { data, filters, ui, selectedIds, pagination } = state;
  
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
  }, [data, filters]);
  
  return {
    state,
    dispatch,
    data,
    filters,
    ui,
    selectedIds,
    pagination,
    filteredData
  };
}
```

---

## 🧩 Step 4: Create Sub-Components

```typescript
// components/MyModuleFilters.tsx

import React from 'react';
import { SearchBar, Select } from '../../global';
import type { MyModuleFiltersProps } from '../types/mymodule.types';

export const MyModuleFilters = React.memo<MyModuleFiltersProps>(({
  filters,
  onFilterChange,
  onReset
}) => {
  return (
    <div className="flex gap-4 p-4 bg-gray-50 rounded-lg">
      <SearchBar
        value={filters.search}
        onChange={(value) => onFilterChange('search', value)}
        placeholder="Search..."
      />
      
      <Select
        value={filters.status}
        onChange={(value) => onFilterChange('status', value)}
        options={[
          { value: 'all', label: 'All Status' },
          { value: 'active', label: 'Active' },
          { value: 'inactive', label: 'Inactive' }
        ]}
      />
      
      <button onClick={onReset} className="text-sm text-gray-600">
        Reset
      </button>
    </div>
  );
});

MyModuleFilters.displayName = 'MyModuleFilters';
```

```typescript
// components/MyModuleTable.tsx

import React from 'react';
import { DataTable } from '../../global';
import type { MyModuleTableProps } from '../types/mymodule.types';

export const MyModuleTable = React.memo<MyModuleTableProps>(({
  data,
  selectedIds,
  onSelect,
  onAction
}) => {
  const columns = [
    { key: 'name', label: 'Name', sortable: true },
    { key: 'status', label: 'Status' },
    { key: 'amount', label: 'Amount', align: 'right' as const },
    { key: 'actions', label: 'Actions', render: (row) => (
      <button onClick={() => onAction(row)}>View</button>
    )}
  ];
  
  return (
    <DataTable
      columns={columns}
      data={data}
      selectable
      selectedIds={selectedIds}
      onSelect={onSelect}
    />
  );
});

MyModuleTable.displayName = 'MyModuleTable';
```

---

## 🏠 Step 5: Create Main Component

```typescript
// MyModule.tsx

import React, { useEffect, useCallback } from 'react';
import { FileText } from 'lucide-react';
import { ModuleHeader, Pagination } from '../global';
import { myModuleApi } from '../../services/api';

import { useMyModuleState } from './hooks/useMyModuleState';
import { MyModuleFilters } from './components/MyModuleFilters';
import { MyModuleTable } from './components/MyModuleTable';
import type { MyModuleProps, MyItem } from './types/mymodule.types';

const MyModule: React.FC<MyModuleProps> = ({ onClose }) => {
  const {
    data,
    filters,
    ui,
    dispatch,
    filteredData,
    selectedIds,
    pagination
  } = useMyModuleState();
  
  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      dispatch({ type: 'SET_LOADING', loading: true });
      try {
        const response = await myModuleApi.getAll({
          page: pagination.page,
          per_page: pagination.perPage
        });
        dispatch({ type: 'SET_DATA', data: response.data.items });
      } catch (error) {
        console.error('Failed to fetch:', error);
      } finally {
        dispatch({ type: 'SET_LOADING', loading: false });
      }
    };
    
    fetchData();
  }, [pagination.page, dispatch]);
  
  // Handlers
  const handleFilterChange = useCallback((filter: string, value: string) => {
    dispatch({ type: 'SET_FILTER', filter: filter as any, value });
  }, [dispatch]);
  
  const handleSelect = useCallback((id: number) => {
    dispatch({ type: 'TOGGLE_SELECT', id });
  }, [dispatch]);
  
  const handleAction = useCallback((item: MyItem) => {
    console.log('Action on:', item);
  }, []);
  
  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <ModuleHeader
        title="My Module"
        icon={FileText}
        iconColor="text-blue-600"
        onClose={onClose}
      />
      
      {/* Filters */}
      <MyModuleFilters
        filters={filters}
        onFilterChange={handleFilterChange}
        onReset={() => dispatch({ type: 'RESET' })}
      />
      
      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {ui.loading ? (
          <div>Loading...</div>
        ) : (
          <MyModuleTable
            data={filteredData}
            selectedIds={selectedIds}
            onSelect={handleSelect}
            onAction={handleAction}
          />
        )}
      </div>
      
      {/* Pagination */}
      <Pagination
        currentPage={pagination.page}
        totalPages={Math.ceil(pagination.total / pagination.perPage)}
        onPageChange={(page) => dispatch({ type: 'SET_PAGE', page })}
      />
    </div>
  );
};

export default MyModule;
```

---

## 🔌 Step 6: Create API Module

```typescript
// services/api/modules/mymodule/mymodule.api.ts

import apiClient from '../../apiClient';

export const myModuleApi = {
  getAll: (params?: { page?: number; per_page?: number; search?: string }) =>
    apiClient.get('/mymodule', { params }),
  
  getById: (id: number) =>
    apiClient.get(`/mymodule/${id}`),
  
  create: (data: any) =>
    apiClient.post('/mymodule', data),
  
  update: (id: number, data: any) =>
    apiClient.put(`/mymodule/${id}`, data),
  
  delete: (id: number) =>
    apiClient.delete(`/mymodule/${id}`)
};
```

---

## ✅ Checklist

- [ ] Types defined in `types/mymodule.types.ts`
- [ ] State hook created in `hooks/useMyModuleState.ts`
- [ ] Sub-components use `React.memo`
- [ ] Main component uses `useCallback` for handlers
- [ ] API module created and exported
- [ ] Module documentation added to `docs/modules/`
