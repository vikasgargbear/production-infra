# Auth Module

**Status:** Cloud-authoritative

Single authentication entry point backed by the live Supabase/session-exchange
boundary. Authentication never falls back to cached credentials.

---

## 🏗️ Architecture

```
auth/
├── LoginPage.tsx          # Google-only login and onboarding UI
├── hooks/                 # Ready for future hooks
└── README.md
```

## 🔐 Features

- Google OAuth integration for browser and native clients
- Cloud API health gating
- Server-confirmed Supabase session exchange

## 📍 Related Files

- `src/contexts/AuthContext.tsx` - Authentication context and provider
- Provides: `useAuth`, `AuthProvider`

## 🚀 Usage

```typescript
import { useAuth } from '../contexts/AuthContext';

const { loginWithGoogle, logout, user, isAuthenticated } = useAuth();
```

---

**Last Updated:** August 24, 2026
