# PharmaERP - Production Infrastructure

Enterprise-grade, cloud-authoritative Pharmacy Management System with multi-tenancy and GST compliance.

Built for pharmaceutical distribution, where the domain does not forgive mistakes: batch and expiry tracking for drug compliance, multi-rate GST invoicing where even the order of discounts changes the tax, customer credit ledgers, and split-payment reconciliation. In daily production use. React + FastAPI + PostgreSQL, with web and Electron desktop clients. Roadmap: an MCP layer over the API, so the full ERP can be operated in natural language.

## 🚀 Quick Start (5 Minutes)

### Prerequisites

| Tool | Version | Check Command |
|------|---------|---------------|
| Python | 3.11+ | `python3 --version` |
| Node.js | 18+ | `node --version` |
| PostgreSQL | 15+ | `psql --version` |
| npm | 9+ | `npm --version` |

### Clone & Setup

```bash
# Clone the repository
git clone https://github.com/vikasgargbear/production-infra.git
cd production-infra
```

---

## � Development Workflow

### The Fast Development Loop

```
┌─────────────────────────────────────────────────────┐
│  1. EDIT          Make your changes in code        │
│       ↓                                             │
│  2. SAVE          Ctrl+S / Cmd+S                   │
│       ↓                                             │
│  3. AUTO-RELOAD   Backend/Frontend auto-refreshes  │
│       ↓                                             │
│  4. TEST          Check in browser (localhost)     │
│       ↓                                             │
│  5. REPEAT        Keep iterating until satisfied   │
│       ↓                                             │
│  6. COMMIT        Only when feature is working     │
└─────────────────────────────────────────────────────┘
```

Both backend and frontend have **hot reload** - changes appear instantly!

### Local Development URLs

| Service | URL | Description |
|---------|-----|-------------|
| Frontend | `http://localhost:5173` | React app |
| Backend API | `http://localhost:8000` | FastAPI server |
| API Docs (Swagger) | `http://localhost:8000/docs` | Interactive API testing |
| API Docs (ReDoc) | `http://localhost:8000/redoc` | API reference |

### Git Branching Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Production-ready code |
| `develop` | Integration branch for features |
| `feature/*` | New features (e.g., `feature/new-reports`) |
| `hotfix/*` | Emergency production fixes |

### Local Scratch Space (`.dev/`)

A gitignored folder for your experiments:

```
.dev/
├── experiments/    # Test code, prototypes
├── notes/          # Personal development notes  
├── sql-queries/    # Test SQL queries
└── temp/           # Temporary files
```

Use this for anything you don't want to commit!

### Pro Tips

- **F12** - Open browser DevTools to see console errors
- **Swagger UI** - Test API endpoints at `/docs`
- **Split terminal** - One for backend, one for frontend
- **Commit often** - Small commits are easier to track

---

## �🔧 Backend Setup

### 1. Create Virtual Environment

```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Environment Variables

Create `.env` file in `backend/`:

```bash
# Database (PostgreSQL)
DATABASE_URL=postgresql://user:password@localhost:5432/pharmaerp

# Or use Supabase/Railway
# DATABASE_URL=postgresql://user:password@host:5432/railway

# JWT Settings
SECRET_KEY=your-secret-key-min-32-characters
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# CORS (for local development)
CORS_ORIGINS=http://localhost:5173,http://localhost:3000

# Optional: Redis for caching
# REDIS_URL=redis://localhost:6379
```

### 4. Run the Backend

```bash
uvicorn app.main:app --reload --port 8000
```

**Backend will be available at:**
- API: `http://localhost:8000`
- Swagger Docs: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

---

## 💻 Frontend Setup

### 1. Navigate to Frontend

```bash
cd frontend
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Variables

Create `.env.local` in `frontend/`:

```bash
# API URL
VITE_API_URL=http://localhost:8000/api

# Development diagnostics
VITE_ENABLE_DEBUG=true
```

### 4. Run the Frontend

```bash
npm run dev
```

**Frontend will be available at:** `http://localhost:5173`

---

## 🏃 Running Both Services (Local Development)

Open two terminal windows:

```bash
# Terminal 1: Backend
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8000

# Terminal 2: Frontend
cd frontend
npm run dev
```

Then open `http://localhost:5173` in your browser.

---

## 📁 Project Structure

```
production-infra/
├── backend/                    # FastAPI Backend
│   ├── app/
│   │   ├── api/
│   │   │   ├── routes/        # API endpoints
│   │   │   ├── services/      # Business logic
│   │   │   └── schemas/       # Pydantic models
│   │   ├── core/              # Config, security, database
│   │   └── main.py            # App entry point
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/                   # React Frontend
│   ├── src/
│   │   ├── components/        # React components
│   │   │   ├── sales/         # Invoice, challan, orders
│   │   │   ├── purchase/      # PO, GRN
│   │   │   ├── inventory/     # Stock management
│   │   │   ├── ledger/        # Outstanding, payments
│   │   │   └── global/        # Shared components
│   │   ├── services/
│   │   │   └── api/           # API clients
│   │   ├── hooks/             # Custom React hooks
│   │   ├── contexts/          # React Context
│   │   └── types/             # TypeScript types
│   ├── docs/                  # Frontend documentation
│   └── package.json
│
├── database/                   # Database migrations & schemas
│   ├── migrations/
│   └── schema-docs/
│
├── docs/                       # Project documentation
│   ├── backend/               # API, Architecture docs
│   │   ├── api/               # API reference
│   │   ├── architecture/      # System design
│   │   └── database/          # Schema docs
│   ├── frontend/              # Frontend docs
│   ├── guides/                # Developer guides
│   └── deployment/            # Deployment docs
│
├── docker-compose.yml          # Local Docker setup
├── deploy/railway/             # Service-specific Railway manifests and Dockerfiles
└── .github/workflows/          # CI/CD workflows
```

---

## 🧪 Running Tests

### Backend Tests

```bash
cd backend
source venv/bin/activate
pytest
```

### Frontend Tests

```bash
cd frontend
npm test                    # Run tests
npm run test:coverage       # With coverage
npm run type-check          # TypeScript check
npm run lint               # ESLint
```

---

## 🔑 Key Features

| Feature | Description |
|---------|-------------|
| **Multi-Tenancy** | Organization & branch isolation |
| **GST Compliance** | Indian tax calculations |
| **Canonical APIs** | Fail-closed reads and writes against PostgreSQL authority |
| **Role-Based Access** | Owner, Manager, Pharmacist, Salesperson |

---

## 📚 Documentation

| Category | Path | Description |
|----------|------|-------------|
| **API Reference** | `docs/backend/api/` | All API endpoints |
| **Architecture** | `docs/backend/architecture/` | System design |
| **Database Schema** | `docs/backend/database/` | Table structures |
| **Frontend Docs** | `frontend/docs/` | Components, guides |
| **Getting Started** | `docs/guides/getting-started.md` | Full setup guide |
| **Deployment** | `docs/deployment/` | Production deployment |

---

## 🚀 Deployment

### Railway

Railway deployments are exact-SHA, three-service releases controlled by
`.github/workflows/railway-canonical-staging.yml`. The API, MCP runtime, and
frontend each use their own checked-in manifest under `deploy/railway/`.

Do not run an unqualified local `railway up`: it bypasses the reviewed SHA,
service-manifest, health, and build-metadata gates. Dispatch the Production
readiness workflow with Railway selected after the candidate SHA is reviewed.

### Docker

```bash
docker-compose up -d
```

See [Deployment Guide](docs/deployment/production.md) for detailed instructions.

---

## 🛠️ Development Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start frontend dev server |
| `npm run build` | Production build |
| `npm run lint` | Run ESLint |
| `npm run type-check` | TypeScript validation |
| `uvicorn app.main:app --reload` | Start backend (dev) |
| `pytest` | Run backend tests |

---

## 🤝 Contributing

1. Create a feature branch: `git checkout -b feature/my-feature`
2. Make your changes & test locally
3. Commit: `git commit -m "feat: add new feature"`
4. Push: `git push origin feature/my-feature`
5. Create a Pull Request

---

## 📞 Support

- **Documentation**: Check `docs/` folder
- **Issues**: Create a GitHub issue
- **Contact**: Frontend/Backend team leads

---

**Last Updated**: January 2026  
**Version**: 1.0.0
