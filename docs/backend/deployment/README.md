# Deployment Documentation

Production deployment guides.

---

## Quick Deploy

### Docker (Recommended)
```bash
docker build -t pharmacy-backend .
docker run -d -p 8000:8000 --env-file .env.production pharmacy-backend
```

### Direct
```bash
pip install -r requirements.txt
alembic upgrade head
python start.py
```

---

## Guides

| Guide | Description |
|-------|-------------|
| [Production](production.md) | Full production deployment |
| [Docker](docker.md) | Docker/Compose setup |
| [Monitoring](monitoring.md) | Logging & metrics |

---

## Environment

```bash
DATABASE_URL=postgresql://user:pass@host:5432/db
SECRET_KEY=<32-char-random>
JWT_SECRET_KEY=<32-char-random>
```

---

## Checklist

- [ ] Database migrations applied
- [ ] Indexes created (11 total)
- [ ] Environment variables set
- [ ] Health check passing (`/health`)

---

**See also**: [Backend Overview](../README.md)
