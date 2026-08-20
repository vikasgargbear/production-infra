# Docker Deployment

Containerized deployment with Docker and Docker Compose.

---

## Prerequisites

- Docker 20.10+
- Docker Compose 2.0+

```bash
docker --version
docker-compose --version
```

---

## Project Structure

```
pharmacy-management/
├── docker-compose.yml
├── docker-compose.prod.yml
├── backend/
│   ├── Dockerfile
│   └── ...
├── frontend/
│   ├── Dockerfile
│   └── ...
└── nginx/
    ├── nginx.conf
    └── Dockerfile
```

---

## Dockerfiles

### Backend Dockerfile

```dockerfile
# backend/Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Create non-root user
RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Frontend Dockerfile

```dockerfile
# frontend/Dockerfile
FROM node:18-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Build
COPY . .
RUN npm run build

# Production image
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

### Nginx Dockerfile

```dockerfile
# nginx/Dockerfile
FROM nginx:alpine

COPY nginx.conf /etc/nginx/nginx.conf
COPY ssl/ /etc/nginx/ssl/

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
```

---

## Docker Compose

### Development

```yaml
# docker-compose.yml
version: '3.8'

services:
  api:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/pharmacy_dev
      - APP_ENV=development
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
      - JWT_SECRET_KEY=${JWT_SECRET_KEY}
      - CORS_ORIGINS=http://localhost:3000
      - APP_URL=http://localhost:3000
    volumes:
      - ./backend:/app
    depends_on:
      - db
      - redis

  db:
    image: postgres:14
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=pharmacy_dev
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  frontend:
    build: ./frontend
    ports:
      - "3000:80"
    depends_on:
      - api

volumes:
  postgres_data:
```

### Production

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  nginx:
    build: ./nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/ssl:/etc/nginx/ssl:ro
    depends_on:
      - api
      - frontend
    restart: always

  api:
    build:
      context: ./backend
      dockerfile: Dockerfile
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - JWT_SECRET_KEY=${JWT_SECRET_KEY}
      - APP_ENV=production
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
      - CORS_ORIGINS=${CORS_ORIGINS}
      - APP_URL=${APP_URL}
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: '2'
          memory: 2G
    restart: always

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    restart: always

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    restart: always

volumes:
  redis_data:
```

---

## Nginx Configuration

```nginx
# nginx/nginx.conf
upstream api_servers {
    server api:8000;
}

upstream frontend_servers {
    server frontend:80;
}

server {
    listen 80;
    server_name api.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

    location / {
        limit_req zone=api burst=20 nodelay;
        
        proxy_pass http://api_servers;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_read_timeout 60s;
    }

    location /health {
        proxy_pass http://api_servers;
        access_log off;
    }
}

server {
    listen 443 ssl http2;
    server_name app.yourdomain.com;

    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;

    location / {
        proxy_pass http://frontend_servers;
        proxy_set_header Host $host;
    }
}
```

---

## Commands

### Build

```bash
# Build all services
docker-compose build

# Build specific service
docker-compose build api

# Build without cache
docker-compose build --no-cache
```

### Run

```bash
# Development
docker-compose up

# Development (detached)
docker-compose up -d

# Production
docker-compose -f docker-compose.prod.yml up -d
```

### Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api

# Last 100 lines
docker-compose logs --tail=100 api
```

### Execute Commands

```bash
# Run migrations
docker-compose exec api alembic upgrade head

# Django-style commands
docker-compose exec api python scripts/seed_data.py

# Shell access
docker-compose exec api /bin/bash
docker-compose exec db psql -U postgres -d pharmacy_dev
```

### Scale

```bash
# Scale API to 3 instances
docker-compose up -d --scale api=3
```

### Clean Up

```bash
# Stop services
docker-compose down

# Stop and remove volumes
docker-compose down -v

# Remove unused images
docker image prune

# Full cleanup
docker system prune -a
```

---

## Environment Files

### .env.docker

```bash
# Database (internal Docker network)
DATABASE_URL=postgresql://postgres:strongpassword@db:5432/pharmacy

# Security
JWT_SECRET_KEY=your-jwt-secret-key

# App
APP_ENV=production
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
CORS_ORIGINS=https://app.yourdomain.com
APP_URL=https://app.yourdomain.com
```

### Using .env Files

```yaml
# docker-compose.prod.yml
services:
  api:
    env_file:
      - .env.docker
```

---

## Multi-Stage Builds

### Optimized Backend Dockerfile

```dockerfile
# Stage 1: Builder
FROM python:3.11-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev

COPY requirements.txt .
RUN pip wheel --no-cache-dir --no-deps --wheel-dir /app/wheels -r requirements.txt

# Stage 2: Production
FROM python:3.11-slim

WORKDIR /app

# Install runtime dependencies only
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Copy wheels from builder
COPY --from=builder /app/wheels /wheels
RUN pip install --no-cache /wheels/*

# Copy application
COPY . .

# Non-root user
RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

## Health Checks

```yaml
services:
  api:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  db:
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 3
```

---

## CI/CD Integration

### GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Build and push
        run: |
          docker build -t registry.example.com/pharmacy-api:${{ github.sha }} ./backend
          docker push registry.example.com/pharmacy-api:${{ github.sha }}
      
      - name: Deploy
        run: |
          ssh deploy@production "cd /opt/pharmacy && docker-compose pull && docker-compose up -d"
```

---

## See Also

- [Production Deployment](production.md)
- [Monitoring](monitoring.md)
- [Backup & Recovery](backup.md)

---

**Next**: [Monitoring](monitoring.md) · [Backup & Recovery](backup.md)
