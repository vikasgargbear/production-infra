# 🏗️ Architecture Overview

> **System design and technical architecture** of the frontend application

---

## 🎯 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      FRONTEND APPLICATION                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Pages     │  │  Modules    │  │   Global    │             │
│  │  (Routes)   │──│ (Features)  │──│ Components  │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│         │               │                │                      │
│         └───────────────┼────────────────┘                      │
│                         │                                        │
│                  ┌──────▼──────┐                                │
│                  │Custom Hooks │                                │
│                  │  (Logic)    │                                │
│                  └──────┬──────┘                                │
│                         │                                        │
│         ┌───────────────┼───────────────┐                       │
│         │               │               │                       │
│   ┌─────▼─────┐  ┌──────▼──────┐  ┌────▼────┐                  │
│   │  Context  │  │   Services  │  │  Utils  │                  │
│   │(State Mgmt)│  │ (API/Cache)│  │(Helpers)│                  │
│   └───────────┘  └─────────────┘  └─────────┘                  │
│                         │                                        │
└─────────────────────────┼────────────────────────────────────────┘
                          │
                    ┌─────▼─────┐
                    │  Backend  │
                    │   APIs    │
                    └───────────┘
```

---

## 🛠️ Tech Stack

### Core Framework
| Technology | Version | Purpose |
|------------|---------|---------|
| **React** | 18.x | UI Framework |
| **TypeScript** | 5.x | Type Safety |
| **Vite** | 5.x | Build Tool |

### State Management
| Technology | Usage |
|------------|-------|
| **useReducer** | Complex component state |
| **React Context** | Global state (Theme, Auth, Company) |
| **useState** | Simple local state |

### UI & Styling
| Technology | Purpose |
|------------|---------|
| **Tailwind CSS** | Utility-first styling |
| **Lucide React** | Icon library |
| **Recharts** | Charts & graphs |
| **React Toastify** | Notifications |

### API & Data
| Technology | Purpose |
|------------|---------|
| **Axios** | HTTP client |
| **IndexedDB** | Offline storage |
| **Custom Cache** | Search/data caching |

### Forms & Validation
| Technology | Purpose |
|------------|---------|
| **React Hook Form** | Form state (optional) |
| **Custom validation** | Input validation |

---

## 📁 Code Organization

```
src/
├── components/                 # React Components
│   ├── [module]/              # Feature modules
│   │   ├── types/             # Module-specific types
│   │   ├── hooks/             # Module-specific hooks
│   │   ├── components/        # Sub-components
│   │   └── [Module].tsx       # Main component
│   │
│   └── global/                # Shared components
│       ├── ui/                # Basic UI (Button, Input)
│       ├── forms/             # Form components
│       ├── layout/            # Layout components
│       └── modals/            # Modal components
│
├── services/                  # Business Logic & APIs
│   ├── api/                   # API clients
│   │   ├── apiClient.ts       # Axios instance
│   │   ├── [module]Api.ts     # Module-specific APIs
│   │   └── index.ts           # API exports
│   │
│   └── offline/               # Offline support
│       ├── storage/           # IndexedDB
│       └── sync/              # Sync services
│
├── hooks/                     # Shared Custom Hooks
│   ├── useEscapeKey.ts
│   ├── useEnterAsTab.ts
│   └── useDebounce.ts
│
├── contexts/                  # React Context
│   ├── AuthContext.tsx
│   ├── CompanyContext.tsx
│   └── ThemeContext.tsx
│
├── types/                     # Shared TypeScript Types
│   ├── models/                # Data models
│   ├── api.types.ts           # API types
│   └── index.ts               # Type exports
│
├── utils/                     # Helper Functions
│   ├── formatters.ts          # Date, currency format
│   ├── validators.ts          # Validation helpers
│   └── constants.ts           # App constants
│
└── pages/                     # Route Pages
    ├── Dashboard.tsx
    ├── Sales.tsx
    └── Inventory.tsx
```

---

## 🔄 Data Flow

```
User Action
    │
    ▼
┌─────────┐    dispatch()    ┌──────────┐
│   UI    │ ───────────────► │ Reducer  │
│Component│                  │ (Hook)   │
└────┬────┘                  └────┬─────┘
     │                            │
     │ onClick/onChange           │ state update
     │                            ▼
     │                     ┌──────────┐
     │                     │  State   │
     │                     └────┬─────┘
     │                          │
     │ ◄────────────────────────┘ re-render
     │
     │ API call needed?
     ▼
┌─────────┐
│ Service │ ───► API ───► Backend
└─────────┘
```

---

## 🧩 Component Architecture

### Standard Module Structure
```
module/
├── types/
│   └── module.types.ts       # All type definitions
├── hooks/
│   └── useModuleState.ts     # useReducer hook
├── components/
│   ├── ModuleHeader.tsx      # Sub-component
│   ├── ModuleTable.tsx       # Sub-component
│   └── ModuleFilters.tsx     # Sub-component
└── Module.tsx                # Main orchestrator
```

### Component Patterns
1. **Container/Presenter**: Logic in hooks, UI in components
2. **Compound Components**: Related components grouped together
3. **Render Props**: For flexible rendering
4. **React.memo**: Performance optimization

---

## 📚 Further Reading

- [State Management Patterns](../04-state-management/)
- [Component Library](../03-components/)
- [API Integration](../05-api-integration/)
- [Module Documentation](../modules/)
