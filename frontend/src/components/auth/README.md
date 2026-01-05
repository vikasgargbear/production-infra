# Auth Module

**Status:** ✅ Modernized (Jan 2026)

Single authentication entry point with offline support.

---

## 🏗️ Architecture

```
auth/
├── LoginPage.tsx          # Main login UI (180 lines)
├── hooks/                 # Ready for future hooks
└── README.md
```

## 🔐 Features

- Email/password login
- Google OAuth integration
- Offline login with cached credentials
- Online/offline status indicator

## 📍 Related Files

- `src/contexts/AuthContext.tsx` - Authentication context and provider
- Provides: `useAuth`, `AuthProvider`

## 🚀 Usage

```typescript
import { useAuth } from '../contexts/AuthContext';

const { login, loginWithGoogle, logout, user, isAuthenticated } = useAuth();
```

---

**Last Updated:** January 4, 2026
