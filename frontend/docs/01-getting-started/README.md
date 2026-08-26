# 🚀 Getting Started

> **Quick start guide** for new developers joining the project

---

## 📋 Prerequisites

Before you begin, ensure you have:

| Tool | Version | Check Command |
|------|---------|---------------|
| **Node.js** | 18.x or higher | `node --version` |
| **npm** | 9.x or higher | `npm --version` |
| **Git** | 2.x | `git --version` |
| **VS Code** | Latest | Recommended IDE |

---

## ⚡ Quick Start (5 minutes)

```bash
# 1. Clone the repository
git clone <repository-url>
cd production-infra/frontend

# 2. Install dependencies
npm install

# 3. Copy environment file
cp .env.example .env.local

# 4. Start development server
npm run dev

# 5. Open in browser
# http://localhost:5173
```

---

## 📁 Project Overview

```
frontend/
├── src/
│   ├── components/       # React components (by module)
│   │   ├── dashboard/    # Dashboard module
│   │   ├── sales/        # Invoice, Order, Challan
│   │   ├── purchase/     # Purchase management
│   │   ├── inventory/    # Stock management
│   │   ├── returns/      # Sales returns
│   │   ├── ledger/       # Outstanding, payments
│   │   └── global/       # Shared components
│   │
│   ├── services/         # API clients & utilities
│   │   └── api/          # API client, endpoints
│   │
│   ├── hooks/            # Custom React hooks
│   ├── contexts/         # React Context providers
│   ├── types/            # TypeScript type definitions
│   ├── utils/            # Helper functions
│   └── pages/            # Route pages
│
├── docs/                 # 📚 Documentation (you are here)
├── public/               # Static assets
└── package.json
```

---

## 🔧 Development Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (hot reload) |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |
| `npm run type-check` | TypeScript validation |
| `npm test` | Run tests |

---

## 📖 Next Steps

1. **Read**: [Architecture Overview](../02-architecture/README.md)
2. **Explore**: [Component Library](../03-components/README.md)
3. **Follow**: [Coding Conventions](../06-guides/coding-conventions.md)
4. **Reference**: [Module Documentation](../modules/)

---

## 🆘 Need Help?

- **Slack**: #frontend-dev channel
- **Wiki**: Internal confluence pages
- **Lead**: Contact Frontend Tech Lead

---

## 📚 Documentation Index

| Category | Description |
|----------|-------------|
| [01 Getting Started](.) | You are here |
| [02 Architecture](../02-architecture/) | System design & tech stack |
| [03 Components](../03-components/) | UI component library |
| [04 State Management](../04-state-management/) | State patterns |
| [05 API Integration](../05-api-integration/) | Backend integration |
| [06 Guides](../06-guides/) | Developer guides |
| [07 Testing](../07-testing/) | Testing strategy |
| [08 Security](../08-security/) | Auth & security |
| [09 Deployment](../09-deployment/) | Build & deploy |
| [10 Accessibility](../10-accessibility/) | A11y guidelines |
| [Modules](../modules/) | Module reference |
