## Clean Authentication Implementation

**Created:** 2025-10-24
**Status:** Ready to implement
**Based on:** Industry best practices (Facebook, Stripe, AWS Console)

---

## Files Created:

1. **`contexts/AuthContext_NEW.js`** - Single source of truth for authentication
2. **`services/api/apiClient_NEW.ts`** - Clean API client with interceptors

---

## Implementation Steps:

### Step 1: Replace AuthContext

```bash
mv frontend/src/contexts/AuthContext.js frontend/src/contexts/AuthContext_OLD.js
mv frontend/src/contexts/AuthContext_NEW.js frontend/src/contexts/AuthContext.js
```

### Step 2: Replace apiClient

```bash
mv frontend/src/services/api/apiClient.ts frontend/src/services/api/apiClient_OLD.ts
mv frontend/src/services/api/apiClient_NEW.ts frontend/src/services/api/apiClient.ts
```

### Step 3: Update App.tsx

```tsx
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoadingSpinner from './components/LoadingSpinner';

// Login component
const LoginPage = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await login(email, password);
    if (!result.success) {
      setError(result.error);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white p-8 rounded-lg shadow">
        <h2 className="text-2xl font-bold mb-6">Login to Pharma ERP</h2>
        {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4">{error}</div>}
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-3 border rounded mb-4"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-3 border rounded mb-4"
            required
          />
          <button
            type="submit"
            className="w-full bg-blue-600 text-white p-3 rounded hover:bg-blue-700"
          >
            Login
          </button>
        </form>
      </div>
    </div>
  );
};

// Main App component
const AppContent = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    // Your main app UI here
    <div>App content goes here</div>
  );
};

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
```

### Step 4: Use auth in components

```jsx
import { useAuth } from '../contexts/AuthContext';

const EmployeeManagement = () => {
  const { user } = useAuth();
  
  // user.org_id is always available when authenticated
  console.log('Current org:', user.org_id);
  console.log('Current user:', user.email);
  console.log('Branch:', user.branch_id);
  
  // Make API calls - org_id automatically included
  const loadEmployees = async () => {
    const response = await employeesAPI.getAll({ limit: 100 });
    // Works! org_id sent automatically by interceptor
  };
};
```

### Step 5: Delete old files

```bash
rm frontend/src/services/OrgIdManager.js
rm frontend/src/setupAuth.js
rm frontend/src/services/auth/AuthService.js
```

---

## How It Works:

### 1. **On App Load:**
   - AuthProvider checks localStorage for token
   - If token exists → decode → extract user data → set state
   - If no token or expired → set isAuthenticated = false
   - App shows login page

### 2. **On Login:**
   - User enters credentials
   - AuthContext.login() calls API
   - Gets JWT token
   - Decodes token → extracts org_id, user_id, etc.
   - Stores in localStorage
   - Updates state → isAuthenticated = true
   - App automatically re-renders with main UI

### 3. **On API Calls:**
   - API interceptor reads token from localStorage
   - Reads user.org_id from localStorage
   - Adds both to headers automatically
   - All APIs work

### 4. **On Logout:**
   - Clear localStorage
   - Clear state
   - isAuthenticated = false
   - App shows login page

---

## Benefits:

✅ **Single Source of Truth**: AuthContext only
✅ **No org_id management**: Comes from token automatically
✅ **No setupAuth.js hacks**: Clean initialization
✅ **Professional**: Like Facebook/Stripe/AWS
✅ **Maintainable**: One file to understand auth
✅ **Type-safe**: Can add TypeScript easily
✅ **Testable**: Mock AuthContext in tests

---

## Testing:

1. Clear localStorage
2. Refresh page
3. Should see login page
4. Login with valid credentials
5. Should decode token and show app
6. org_id automatically in all API calls
7. Logout clears everything

---

## Migration:

**DO NOT patch existing code. Replace it entirely.**

This is how you hand over professional software.

---

**Status:** Ready to implement. Just swap the files and update App.tsx.
