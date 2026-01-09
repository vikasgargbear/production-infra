# 🛠️ Installation & Environment Setup

> **Complete setup guide** for the frontend development environment

---

## 📋 System Requirements

### Hardware
| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| RAM | 8 GB | 16 GB |
| Disk Space | 5 GB | 10 GB |
| CPU | 4 cores | 8 cores |

### Software

| Tool | Version | Installation |
|------|---------|--------------|
| **Node.js** | 18.x+ | [nodejs.org](https://nodejs.org/) |
| **npm** | 9.x+ | Comes with Node.js |
| **Git** | 2.x+ | [git-scm.com](https://git-scm.com/) |
| **VS Code** | Latest | [code.visualstudio.com](https://code.visualstudio.com/) |

---

## 🚀 Installation Steps

### 1. Clone Repository

```bash
git clone <repository-url>
cd production-infra/frontend
```

### 2. Install Dependencies

```bash
# Using npm
npm install

# Or using npm ci for exact versions (recommended for CI)
npm ci
```

### 3. Environment Configuration

```bash
# Copy example environment file
cp .env.example .env.local
```

Edit `.env.local` with your settings:

```bash
# API Configuration
VITE_API_URL=http://localhost:8000/api
VITE_API_TIMEOUT=30000

# Feature Flags
VITE_ENABLE_OFFLINE=true
VITE_ENABLE_ANALYTICS=false
VITE_ENABLE_DEBUG=true

# Build Configuration
VITE_BUILD_VERSION=local-dev
```

### 4. Start Development Server

```bash
npm run dev
```

Server starts at: `http://localhost:5173`

---

## 🔧 Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API base URL | `http://localhost:8000/api` |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_TIMEOUT` | `30000` | API request timeout (ms) |
| `VITE_ENABLE_OFFLINE` | `true` | Enable offline mode |
| `VITE_ENABLE_DEBUG` | `false` | Enable debug logging |
| `VITE_SENTRY_DSN` | — | Sentry error tracking DSN |

### Environment Files

| File | Purpose | Git Ignored |
|------|---------|-------------|
| `.env` | Default values | No |
| `.env.local` | Local overrides | **Yes** |
| `.env.development` | Development settings | No |
| `.env.production` | Production settings | No |

---

## 💻 VS Code Setup

### Recommended Extensions

```json
// .vscode/extensions.json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "dsznajder.es7-react-js-snippets",
    "formulahendry.auto-rename-tag",
    "streetsidesoftware.code-spell-checker",
    "ms-vscode.vscode-typescript-next"
  ]
}
```

### Workspace Settings

```json
// .vscode/settings.json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.preferences.importModuleSpecifier": "relative",
  "tailwindCSS.includeLanguages": {
    "typescript": "javascript",
    "typescriptreact": "javascript"
  }
}
```

---

## 🔗 Connecting to Backend

### Local Backend

```bash
# In another terminal, start the backend
cd ../backend
source venv/bin/activate
uvicorn main:app --reload --port 8000
```

Frontend `.env.local`:
```bash
VITE_API_URL=http://localhost:8000/api
```

### Development Backend

```bash
VITE_API_URL=https://dev-api.example.com/api
```

### Production Backend

```bash
VITE_API_URL=https://api.example.com/api
```

---

## 🐛 Troubleshooting

### Node Modules Issues

```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Port Already in Use

```bash
# Kill process on port 5173
lsof -ti:5173 | xargs kill -9

# Or use different port
npm run dev -- --port 3000
```

### TypeScript Errors

```bash
# Clear TypeScript cache
rm -rf node_modules/.cache
npm run type-check
```

### Environment Variables Not Loading

- Ensure variable names start with `VITE_`
- Restart dev server after changing `.env` files
- Check file is named correctly (`.env.local` not `.env.local.txt`)

---

## 📚 Next Steps

1. [Project Structure](../02-architecture/README.md) - Understand the codebase
2. [Component Library](../03-components/README.md) - Available components
3. [Coding Conventions](../06-guides/coding-conventions.md) - Follow standards
