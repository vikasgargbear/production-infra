# 📝 Developer Guides

> **Step-by-step guides** for common development tasks

---

## 📋 Available Guides

| Guide | Description | Difficulty |
|-------|-------------|------------|
| [Coding Conventions](./coding-conventions.md) | Code style & standards | 🟢 Easy |
| [Creating New Module](./creating-new-module.md) | Build a new feature | 🟡 Medium |
| [Adding Components](./adding-components.md) | Create shared components | 🟡 Medium |
| [Debugging](./debugging.md) | Troubleshooting tips | 🟢 Easy |
| [TypeScript Best Practices](./typescript-best-practices.md) | TS patterns | 🟡 Medium |

---

## 📖 Quick Reference

### File Naming Conventions
```
ComponentName.tsx        # React components - PascalCase
useHookName.ts          # Hooks - camelCase with "use" prefix
moduleName.types.ts     # Types - camelCase
utilityName.ts          # Utilities - camelCase
CONSTANT_NAME           # Constants - SCREAMING_SNAKE_CASE
```

### Folder Structure for New Module
```
components/[module]/
├── types/
│   └── module.types.ts       # Type definitions
├── hooks/
│   └── useModuleState.ts     # State management hook
├── components/
│   ├── ModuleHeader.tsx      # Sub-components
│   ├── ModuleTable.tsx
│   └── ModuleFilters.tsx
├── utils/
│   └── moduleHelpers.ts      # Helper functions
└── Module.tsx                # Main component
```

### Import Order
```typescript
// 1. React & external libraries
import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';

// 2. Internal services & contexts
import { apiClient } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

// 3. Components (global first, then local)
import { Button, Modal } from '../global';
import { ModuleHeader } from './components/ModuleHeader';

// 4. Types
import type { ModuleData } from './types/module.types';

// 5. Utilities & constants
import { formatDate } from '../../utils/formatters';
import { MODULE_CONSTANTS } from './constants';

// 6. Styles (if any)
import './Module.css';
```

---

## 🚀 Common Tasks

### Add a New API Endpoint
```typescript
// 1. Add to appropriate API file
// services/api/modulesApi.ts
export const modulesApi = {
  newEndpoint: (params) => apiClient.post('/api/endpoint', params)
};

// 2. Export from index
// services/api/index.ts
export { modulesApi } from './modulesApi';
```

### Create a New Hook
```typescript
// 1. Create hook file
// hooks/useNewHook.ts
import { useState, useEffect } from 'react';

export function useNewHook(initialValue: string) {
  const [value, setValue] = useState(initialValue);
  
  // Logic here
  
  return { value, setValue };
}

// 2. Export from index if shared
```

### Add a New Global Component
```typescript
// 1. Create component
// components/global/ui/NewComponent.tsx
interface NewComponentProps {
  // props
}

export const NewComponent: React.FC<NewComponentProps> = (props) => {
  return <div>...</div>;
};

// 2. Export from global index
// components/global/index.ts
export { NewComponent } from './ui/NewComponent';
```

---

## ✅ Code Review Checklist

- [ ] TypeScript - No `any` types
- [ ] Components - Using React.memo where needed
- [ ] Hooks - useCallback for handlers, useMemo for calculations
- [ ] API - Proper error handling
- [ ] State - Using appropriate state management
- [ ] Tests - Unit tests for logic
- [ ] Docs - Updated relevant documentation

---

## 📚 Further Reading

- [Architecture Overview](../02-architecture/)
- [Component Library](../03-components/)
- [State Management](../04-state-management/)
- [API Integration](../05-api-integration/)
