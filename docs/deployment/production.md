# Production Deployment

Complete production deployment guide and checklist.

---

## Deployment Architecture

```mermaid
graph TB
    subgraph Internet
        USER[Users]
    end

    subgraph Cloud Provider
        LB[Load Balancer<br/>SSL Termination]
        
        subgraph App Tier
            API1[API Server 1]
            API2[API Server 2]
        end
        
        subgraph Data Tier
            PG[(PostgreSQL<br/>Primary)]
            PG_R[(PostgreSQL<br/>Replica)]
            REDIS[(Redis)]
        end
    end

    USER --> LB
    LB --> API1
    LB --> API2
    API1 --> PG
    API2 --> PG
    PG --> PG_R
    API1 --> REDIS
    API2 --> REDIS
```

---

## Pre-Deployment Checklist

### Code

- [ ] All tests passing
- [ ] No debug/print statements
- [ ] Environment variables documented
- [ ] Migrations tested on staging
- [ ] API documentation updated

### Security

- [ ] Secrets in environment variables (not code)
- [ ] CORS configured correctly
- [ ] Rate limiting enabled
- [ ] JWT secret is strong (32+ chars)
- [ ] Debug mode disabled

### Database

- [ ] Migrations ready to apply
- [ ] Backup completed before migration
- [ ] Indexes reviewed for new queries
- [ ] Connection pool sized appropriately

### Infrastructure

- [ ] SSL certificates valid
- [ ] Health check endpoints working
- [ ] Monitoring/alerting configured
- [ ] Rollback plan documented

---

## Environment Variables

### Required Variables

```bash
# Database
DATABASE_URL=postgresql://user:password@host:5432/pharmacy_prod

# Security
SECRET_KEY=<32+ character random string>
JWT_SECRET_KEY=<32+ character random string>
ENVIRONMENT=production
DEBUG=false

# CORS (production domains)
ALLOWED_ORIGINS=https://app.yourdomain.com,https://admin.yourdomain.com

# Redis
REDIS_URL=redis://redis-host:6379/0
```

### Optional Variables

```bash
# Performance
DATABASE_POOL_SIZE=20
DATABASE_MAX_OVERFLOW=30
WORKERS=4

# Logging
LOG_LEVEL=INFO
SENTRY_DSN=https://xxx@sentry.io/xxx

# Email
SMTP_HOST=smtp.provider.com
SMTP_USER=noreply@yourdomain.com
SMTP_PASSWORD=xxx
```

### Generate Secrets

```bash
# Python
python -c "import secrets; print(secrets.token_hex(32))"

# OpenSSL
openssl rand -hex 32
```

---

## Deployment Methods

### Method 1: Direct Server

```bash
# SSH to server
ssh deploy@production-server

# Pull latest code
cd /opt/pharmacy
git pull origin main

# Update dependencies
source venv/bin/activate
pip install -r requirements.txt

# Run migrations
alembic upgrade head

# Restart service
sudo systemctl restart pharmacy-api
```

### Method 2: Docker

See [Docker Deployment](docker.md)

### Method 3: Railway/Render

```bash
# Push to main triggers auto-deploy
git push origin main

# Or manual deploy
railway up  # Railway
# or
render deploy  # Render
```

---

## Zero-Downtime Deployment

### Rolling Deployment

1. Deploy to Server 1 (behind LB)
2. Verify Server 1 healthy
3. Deploy to Server 2
4. Verify Server 2 healthy

### Blue-Green Deployment

```mermaid
graph LR
    LB[Load Balancer]
    
    subgraph Blue - Current
        B1[API v1.0]
    end
    
    subgraph Green - New
        G1[API v1.1]
    end
    
    LB -->|switch| B1
    LB -.->|after verify| G1
```

1. Deploy new version to Green
2. Test Green environment
3. Switch LB to Green
4. Keep Blue as rollback

---

## Database Migrations

### Before Deployment

```bash
# Backup current database
pg_dump -Fc pharmacy_prod > backup_$(date +%Y%m%d_%H%M%S).dump

# Test migration on staging first
alembic upgrade head
```

### During Deployment

```bash
# Run migrations
alembic upgrade head

# Verify
alembic current
```

### Rollback Migration

```bash
# Rollback last migration
alembic downgrade -1

# Rollback to specific revision
alembic downgrade abc123
```

---

## Health Checks

### API Health Endpoint

```python
# Already implemented at /health
@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "1.0.0"
    }
```

### Database Health

```python
@app.get("/health/db")
async def db_health(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        return {"database": "healthy"}
    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={"database": "unhealthy", "error": str(e)}
        )
```

### Load Balancer Config

```nginx
upstream api_servers {
    server api1:8000;
    server api2:8000;
    
    health_check interval=10s fails=3 passes=2;
}
```

---

## Post-Deployment

### Verification

```bash
# Check API health
curl https://api.yourdomain.com/health

# Check version
curl https://api.yourdomain.com/version

# Test the Supabase-to-ERP session exchange with a confirmed pilot identity
curl -X POST https://api.yourdomain.com/api/auth/oauth/supabase/session \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN"

# Check critical endpoints
curl https://api.yourdomain.com/api/sales/invoices \
  -H "Authorization: Bearer $TOKEN"
```

### Monitor

- Check error rates in Sentry/logging
- Monitor response times
- Check database query times
- Verify cache hit rates

---

## Rollback Procedure

### Quick Rollback

```bash
# Method 1: Git revert
git revert HEAD
git push origin main

# Method 2: Deploy previous tag
git checkout v1.0.0
# or
railway rollback
```

### Full Rollback

```bash
# 1. Rollback code
git checkout <previous-commit>

# 2. Rollback migrations
alembic downgrade -1

# 3. Restore database (if needed)
pg_restore -d pharmacy_prod backup_20260109.dump

# 4. Restart services
sudo systemctl restart pharmacy-api
```

---

## Scaling

### Horizontal Scaling

```bash
# Add more API instances
docker-compose up --scale api=4

# Or in Kubernetes
kubectl scale deployment pharmacy-api --replicas=4
```

### Vertical Scaling

| Resource | Minimum | Recommended | High Load |
|----------|---------|-------------|-----------|
| CPU | 1 core | 2 cores | 4 cores |
| Memory | 512MB | 2GB | 4GB |
| DB Connections | 20 | 50 | 100 |

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| 502 Bad Gateway | App not started | Check logs, restart |
| Connection refused | Wrong port/host | Verify config |
| Database timeout | Pool exhausted | Increase pool size |
| SSL error | Cert expired | Renew certificate |

### Check Logs

```bash
# Application logs
tail -f /var/log/pharmacy/app.log

# Nginx logs
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log

# Docker logs
docker logs -f pharmacy-api
```

---

## See Also

- [Docker Setup](docker.md)
- [Monitoring](monitoring.md)
- [Backup & Recovery](backup.md)

---

**Next**: [Docker Deployment](docker.md) · [Monitoring](monitoring.md)
