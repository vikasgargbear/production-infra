# Authentication API

Complete API reference for authentication and user management.

---

## Overview

The Authentication API handles user authentication, token management, and authorization.

### Base Path

```
/api/auth
```

---

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/login` | Authenticate user |
| `POST` | `/refresh` | Refresh access token |
| `POST` | `/logout` | Invalidate tokens |
| `GET` | `/me` | Get current user |
| `PUT` | `/me/password` | Change password |

---

## Login

Authenticates a user and returns access tokens.

```http
POST /api/auth/login
```

### Request Body

```json
{
  "username": "user@example.com",
  "password": "your-secure-password"
}
```

### Request Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `username` | string | Yes | Email or username |
| `password` | string | Yes | User password |

### Response

```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "token_type": "bearer",
    "expires_in": 3600,
    "user": {
      "user_id": 1,
      "username": "john.doe",
      "email": "user@example.com",
      "full_name": "John Doe",
      "role": "admin",
      "permissions": ["sales:view", "sales:create", "inventory:view"],
      "org_id": "550e8400-e29b-41d4-a716-446655440000",
      "org_name": "ABC Distributors",
      "branch_id": 1,
      "branch_name": "Main Branch"
    }
  }
}
```

### Example

```bash
curl -X POST https://api.yourdomain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "user@example.com",
    "password": "your-secure-password"
  }'
```

### Errors

| Code | HTTP | Description |
|------|------|-------------|
| `AUTH_INVALID_CREDENTIALS` | 401 | Invalid username or password |
| `AUTH_ACCOUNT_LOCKED` | 403 | Account locked (too many attempts) |
| `AUTH_ACCOUNT_DISABLED` | 403 | Account has been disabled |
| `AUTH_PASSWORD_EXPIRED` | 403 | Password has expired |

---

## Refresh Token

Exchanges a refresh token for a new access token.

```http
POST /api/auth/refresh
```

### Request Body

```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Response

```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "token_type": "bearer",
    "expires_in": 3600
  }
}
```

### Example

```bash
curl -X POST https://api.yourdomain.com/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }'
```

### Errors

| Code | HTTP | Description |
|------|------|-------------|
| `AUTH_TOKEN_EXPIRED` | 401 | Refresh token has expired |
| `AUTH_TOKEN_REVOKED` | 401 | Token has been revoked |
| `AUTH_TOKEN_INVALID` | 401 | Invalid token format |

---

## Logout

Invalidates the current access and refresh tokens.

```http
POST /api/auth/logout
```

### Headers

```http
Authorization: Bearer <access_token>
```

### Response

```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

## Get Current User

Returns the currently authenticated user's profile.

```http
GET /api/auth/me
```

### Headers

```http
Authorization: Bearer <access_token>
```

### Response

```json
{
  "success": true,
  "data": {
    "user_id": 1,
    "username": "john.doe",
    "email": "user@example.com",
    "full_name": "John Doe",
    "role": "admin",
    "permissions": [
      "sales:view",
      "sales:create",
      "sales:edit",
      "sales:delete",
      "inventory:view",
      "inventory:create",
      "reports:view"
    ],
    "org": {
      "org_id": "550e8400-e29b-41d4-a716-446655440000",
      "org_name": "ABC Distributors"
    },
    "branch": {
      "branch_id": 1,
      "branch_name": "Main Branch"
    },
    "preferences": {
      "language": "en",
      "timezone": "Asia/Kolkata",
      "date_format": "DD/MM/YYYY"
    },
    "last_login": "2026-01-08T09:00:00Z"
  }
}
```

---

## Change Password

Updates the current user's password.

```http
PUT /api/auth/me/password
```

### Request Body

```json
{
  "current_password": "old-password",
  "new_password": "new-secure-password",
  "confirm_password": "new-secure-password"
}
```

### Response

```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

### Errors

| Code | HTTP | Description |
|------|------|-------------|
| `AUTH_INVALID_PASSWORD` | 400 | Current password is incorrect |
| `AUTH_PASSWORD_WEAK` | 400 | New password doesn't meet requirements |
| `AUTH_PASSWORD_REUSED` | 400 | Cannot reuse recent passwords |

---

## Token Structure

### Access Token

JWT payload contains:

```json
{
  "sub": "1",
  "username": "john.doe",
  "org_id": "550e8400-e29b-41d4-a716-446655440000",
  "branch_id": 1,
  "role": "admin",
  "permissions": ["sales:view", "sales:create"],
  "iat": 1704672000,
  "exp": 1704675600
}
```

### Token Expiration

| Token | Expiration |
|-------|------------|
| Access Token | 1 hour |
| Refresh Token | 7 days |

---

## Permission Scopes

Permissions follow `module:action` format:

| Module | Actions |
|--------|---------|
| `sales` | `view`, `create`, `edit`, `delete` |
| `purchase` | `view`, `create`, `edit`, `delete`, `approve` |
| `inventory` | `view`, `create`, `adjust` |
| `finance` | `view`, `create`, `approve` |
| `master` | `view`, `create`, `edit`, `delete` |
| `reports` | `view`, `export` |
| `settings` | `view`, `edit` |
| `users` | `view`, `create`, `edit`, `delete` |

---

## Security Best Practices

1. **Store tokens securely** - Use secure storage (Keychain/Keystore on mobile)
2. **Short-lived access tokens** - 1 hour expiry limits exposure
3. **Refresh before expiry** - Refresh tokens proactively
4. **Logout on uninstall** - Clear tokens when app is removed
5. **HTTPS only** - Never send credentials over HTTP

---

## See Also

- [API Reference](../README.md)
- [Error Codes](../errors.md)

---

**Next**: [Sales API](../sales/) · [Error Reference](../errors.md)
