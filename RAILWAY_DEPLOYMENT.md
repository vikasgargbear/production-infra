# Railway + Supabase Deployment Guide

## Prerequisites
- Railway account
- Supabase project
- GitHub repository connected

## 1. Database Setup (Supabase)

### Create PostgreSQL Functions
```sql
-- Run all SQL files in order:
-- 1. Run schemas creation
-- 2. Run tables creation  
-- 3. Run triggers creation
-- 4. Run API functions creation

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
```

### Configure Connection Pooling
In Supabase Dashboard:
1. Settings → Database
2. Enable Connection Pooling
3. Use "Transaction" mode for backend
4. Copy pooled connection string

## 2. Backend Deployment (Railway)

### Environment Variables
Set in Railway dashboard:
```bash
# Database (use Supabase pooled connection string)
DATABASE_URL=postgresql://postgres:[password]@[host]:6543/postgres?pgbouncer=true

# Security
SECRET_KEY=generate-secure-key
JWT_SECRET=generate-jwt-secret

# Redis (if using Railway Redis)
REDIS_URL=${{Redis.REDIS_URL}}

# Parser
OPENAI_API_KEY=your-key
PARSER_MAX_FILE_SIZE=10485760

# CORS (your frontend URL)
FRONTEND_URL=https://your-frontend.vercel.app
```

### Railway.json Configuration
```json
{
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "uvicorn app.main:app --host 0.0.0.0 --port $PORT",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

### Procfile (Alternative)
```
web: uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

## 3. Frontend Deployment (Vercel/Netlify)

### Build Configuration
```bash
# Build command
npm run build

# Output directory
build

# Environment variables
REACT_APP_API_URL=https://your-backend.up.railway.app
```

## 4. Testing PostgreSQL Functions

### Test Customer Search
```bash
curl -X GET "https://your-backend.up.railway.app/api/v2/pg/customers/search?q=test" \
  -H "Accept: application/json"
```

### Test Product Search
```bash
curl -X GET "https://your-backend.up.railway.app/api/v2/pg/products/search?q=paracetamol" \
  -H "Accept: application/json"
```

### Test Invoice Creation
```bash
curl -X POST "https://your-backend.up.railway.app/api/v2/pg/invoices" \
  -H "Content-Type: application/json" \
  -d '{
    "invoice_data": {
      "customer_id": 1,
      "invoice_date": "2024-01-15",
      "items": [{
        "product_id": 1,
        "quantity": 10,
        "rate": 100,
        "discount_percent": 5
      }]
    }
  }'
```

## 5. Production Checklist

### Database
- [ ] All schemas created
- [ ] All tables created with proper constraints
- [ ] All triggers active
- [ ] All API functions created
- [ ] Connection pooling enabled
- [ ] RLS policies configured

### Backend
- [ ] Environment variables set
- [ ] CORS configured for frontend URL
- [ ] Database migrations run
- [ ] Health check endpoint working
- [ ] Error logging configured

### Frontend
- [ ] API URL configured
- [ ] Environment variables set
- [ ] Build successful
- [ ] API integration tested

## 6. Monitoring

### Railway Metrics
- CPU usage
- Memory usage
- Response times
- Error rates

### Supabase Monitoring
- Database connections
- Query performance
- Storage usage
- Function execution times

### Application Monitoring
```javascript
// Add to frontend
if (process.env.NODE_ENV === 'production') {
  // Log API errors
  apiClient.interceptors.response.use(
    response => response,
    error => {
      console.error('API Error:', {
        endpoint: error.config?.url,
        status: error.response?.status,
        message: error.message
      });
      return Promise.reject(error);
    }
  );
}
```

## 7. Troubleshooting

### Database Connection Issues
1. Check connection pooling settings
2. Verify DATABASE_URL includes `?pgbouncer=true`
3. Check connection limits in Supabase

### CORS Issues
1. Verify FRONTEND_URL in backend env
2. Check CORS middleware configuration
3. Ensure proper headers in requests

### Performance Issues
1. Enable query logging
2. Check slow queries in Supabase
3. Add indexes where needed
4. Consider caching frequently accessed data

## 8. Backup Strategy

### Database Backups
- Supabase automatic daily backups
- Manual backup before major changes:
```bash
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql
```

### Code Backups
- Git tags for releases
- Branch protection on main
- Regular pushes to GitHub