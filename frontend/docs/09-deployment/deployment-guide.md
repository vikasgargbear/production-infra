# 🚀 Deployment Guide

> **Build and deployment process** for the frontend application

---

## 📋 Environments

| Environment | URL | Branch | Purpose |
|-------------|-----|--------|---------|
| **Development** | `localhost:5173` | `develop` | Local development |
| **Staging** | `staging.example.com` | `staging` | Pre-production testing |
| **Production** | `app.example.com` | `main` | Live production |

---

## 🔧 Build Process

### Production Build

```bash
# Create optimized production build
npm run build

# Output directory: dist/
```

### Build Output

```
dist/
├── index.html                 # Entry HTML (minified)
├── assets/
│   ├── index-[hash].js       # Main bundle (code-split)
│   ├── vendor-[hash].js      # Vendor dependencies
│   ├── index-[hash].css      # Compiled styles
│   └── [chunk]-[hash].js     # Lazy-loaded chunks
└── favicon.ico
```

### Build Optimization

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    build: {
        target: 'es2020',
        minify: 'terser',
        sourcemap: true,
        rollupOptions: {
            output: {
                manualChunks: {
                    // Separate vendor chunks
                    vendor: ['react', 'react-dom', 'react-router-dom'],
                    charts: ['recharts'],
                    icons: ['lucide-react'],
                }
            }
        }
    }
});
```

---

## 🌐 Environment Configuration

### Environment Variables by Stage

```bash
# .env.development
VITE_API_URL=http://localhost:8000/api
VITE_ENABLE_DEBUG=true
VITE_ENABLE_ANALYTICS=false

# .env.staging
VITE_API_URL=https://staging-api.example.com/api
VITE_ENABLE_DEBUG=true
VITE_ENABLE_ANALYTICS=true
VITE_SENTRY_DSN=https://xxx@sentry.io/staging

# .env.production
VITE_API_URL=https://api.example.com/api
VITE_ENABLE_DEBUG=false
VITE_ENABLE_ANALYTICS=true
VITE_SENTRY_DSN=https://xxx@sentry.io/prod
```

### Runtime Config

```typescript
// config/environment.ts
export const config = {
    apiUrl: import.meta.env.VITE_API_URL,
    isDebug: import.meta.env.VITE_ENABLE_DEBUG === 'true',
    enableAnalytics: import.meta.env.VITE_ENABLE_ANALYTICS === 'true',
    sentryDsn: import.meta.env.VITE_SENTRY_DSN,
    version: import.meta.env.VITE_APP_VERSION || 'unknown',
    environment: import.meta.env.MODE,
};
```

---

## 🔄 CI/CD Pipeline

### GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main, staging]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json

      - name: Install dependencies
        run: npm ci
        working-directory: frontend

      - name: Type check
        run: npm run type-check
        working-directory: frontend

      - name: Lint
        run: npm run lint
        working-directory: frontend

      - name: Run tests
        run: npm run test
        working-directory: frontend

      - name: Build
        run: npm run build
        working-directory: frontend
        env:
          VITE_API_URL: ${{ secrets.VITE_API_URL }}
          VITE_SENTRY_DSN: ${{ secrets.VITE_SENTRY_DSN }}

      - name: Upload build artifacts
        uses: actions/upload-artifact@v4
        with:
          name: dist
          path: frontend/dist

  deploy-staging:
    needs: build
    if: github.ref == 'refs/heads/staging'
    runs-on: ubuntu-latest
    steps:
      - name: Download artifacts
        uses: actions/download-artifact@v4
        with:
          name: dist

      - name: Deploy to staging
        run: |
          # Deploy to staging server
          # e.g., AWS S3, Vercel, Netlify

  deploy-production:
    needs: build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Download artifacts
        uses: actions/download-artifact@v4
        with:
          name: dist

      - name: Deploy to production
        run: |
          # Deploy to production
```

---

## ☁️ Hosting Options

### Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
cd frontend
vercel --prod
```

### AWS S3 + CloudFront

```bash
# Sync to S3
aws s3 sync dist/ s3://bucket-name --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
    --distribution-id DISTRIBUTION_ID \
    --paths "/*"
```

### Nginx Configuration

```nginx
server {
    listen 80;
    server_name app.example.com;
    root /var/www/frontend/dist;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_types text/css application/javascript application/json;

    # Cache static assets
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";
    add_header X-XSS-Protection "1; mode=block";
}
```

---

## 📊 Monitoring

### Error Tracking (Sentry)

```typescript
// main.tsx
import * as Sentry from '@sentry/react';

if (import.meta.env.PROD) {
    Sentry.init({
        dsn: import.meta.env.VITE_SENTRY_DSN,
        environment: import.meta.env.MODE,
        tracesSampleRate: 0.1,
        integrations: [
            new Sentry.BrowserTracing(),
        ],
    });
}
```

### Performance Monitoring

```typescript
// Report Web Vitals
import { getCLS, getFID, getLCP } from 'web-vitals';

function sendToAnalytics(metric) {
    // Send to analytics service
    console.log(metric);
}

getCLS(sendToAnalytics);
getFID(sendToAnalytics);
getLCP(sendToAnalytics);
```

---

## 🔙 Rollback

### Quick Rollback

```bash
# Revert to previous version
git revert HEAD
git push origin main

# Or deploy specific version
git checkout v1.2.3
npm run build
# Deploy
```

### Version Tags

```bash
# Create release tag
git tag -a v1.3.0 -m "Release 1.3.0"
git push origin v1.3.0
```

---

## ✅ Deployment Checklist

### Pre-Deploy

- [ ] All tests passing
- [ ] No TypeScript errors
- [ ] No ESLint errors
- [ ] Environment variables set
- [ ] Build successful locally

### Post-Deploy

- [ ] Smoke test critical flows
- [ ] Check error monitoring
- [ ] Verify API connectivity
- [ ] Check offline functionality
- [ ] Monitor performance metrics

---

## 📚 Further Reading

- [Vite Production Build](https://vitejs.dev/guide/build.html)
- [Vercel Documentation](https://vercel.com/docs)
- [AWS S3 Static Hosting](https://docs.aws.amazon.com/AmazonS3/latest/userguide/WebsiteHosting.html)
