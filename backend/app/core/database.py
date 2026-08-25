"""
Database Configuration
"""
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from typing import Generator
from urllib.parse import urlparse, urlunparse

from .env import is_production


def _bounded_pool_setting(
    name: str,
    *,
    default: int,
    minimum: int,
    maximum: int,
) -> int:
    """Read an explicit pool budget and reject unsafe deployment values."""
    raw_value = os.getenv(name, str(default)).strip()
    try:
        value = int(raw_value)
    except ValueError as error:
        raise RuntimeError(f"{name} must be an integer") from error
    if not minimum <= value <= maximum:
        raise RuntimeError(
            f"{name} must be between {minimum} and {maximum}, inclusive"
        )
    return value


def classify_database_connection(database_url: str) -> str:
    """Classify documented Supabase Postgres endpoint modes without connecting."""
    try:
        parsed = urlparse(database_url)
        hostname = (parsed.hostname or "").lower()
        port = parsed.port
    except ValueError:
        return "other"

    if hostname.endswith(".pooler.supabase.com"):
        if port == 5432:
            return "supabase_session_pooler"
        if port == 6543:
            return "supabase_transaction_pooler"
        return "supabase_pooler_unknown"

    if hostname.startswith("db.") and hostname.endswith(".supabase.co"):
        if port in (None, 5432):
            return "supabase_direct"
        if port == 6543:
            return "supabase_transaction_pooler"
        return "supabase_direct_unknown"

    return "other"

_configured_database_url = os.getenv("DATABASE_URL", "").strip()
if is_production() and (
    not _configured_database_url
    or "[YOUR-" in _configured_database_url
    or _configured_database_url == "postgresql://postgres:password@localhost:5432/pharma"
):
    raise RuntimeError("DATABASE_URL must be explicitly configured in production")

DATABASE_URL = (
    _configured_database_url
    or "postgresql://postgres:password@localhost:5432/pharma"
)

# Require a writable primary. This does not select an address family; the endpoint
# and deployment network determine whether the connection uses IPv4 or IPv6.
if "supabase.co" in DATABASE_URL and "target_session_attrs" not in DATABASE_URL:
    separator = "&" if "?" in DATABASE_URL else "?"
    DATABASE_URL = f"{DATABASE_URL}{separator}target_session_attrs=read-write"

# Supabase documents direct and session connections on 5432, and transaction
# pooling on 6543. Host and port must be considered together.
DATABASE_CONNECTION_MODE = classify_database_connection(DATABASE_URL)
IS_SUPABASE = DATABASE_CONNECTION_MODE.startswith("supabase_")
IS_SUPABASE_POOLER = DATABASE_CONNECTION_MODE == "supabase_transaction_pooler"

if DATABASE_CONNECTION_MODE == "supabase_direct":
    print("[DATABASE] Supabase direct connection detected")
elif DATABASE_CONNECTION_MODE == "supabase_session_pooler":
    print("[DATABASE] Supabase session pooler detected")
elif DATABASE_CONNECTION_MODE == "supabase_transaction_pooler":
    print("[DATABASE] Supabase transaction pooler detected")
elif DATABASE_CONNECTION_MODE.startswith("supabase_"):
    print("[DATABASE] WARNING: Supabase endpoint uses an unrecognized port")

if IS_SUPABASE_POOLER:
    print(f"[DATABASE] Using aggressive connection recycling for pooler mode")

DATABASE_POOL_SIZE = _bounded_pool_setting(
    "DATABASE_POOL_SIZE", default=10, minimum=1, maximum=20
)
DATABASE_MAX_OVERFLOW = _bounded_pool_setting(
    "DATABASE_MAX_OVERFLOW", default=20, minimum=0, maximum=40
)

# Create engine with connection pooling optimized for Supabase
if IS_SUPABASE_POOLER:
    # Transaction pooler mode (port 6543) - increased pool for Railway
    engine = create_engine(
        DATABASE_URL,
        pool_size=DATABASE_POOL_SIZE,
        max_overflow=DATABASE_MAX_OVERFLOW,
        pool_pre_ping=True,       # Always test connections
        pool_recycle=30,          # Recycle every 30 seconds
        pool_timeout=20,          # Increased from 10 seconds
        echo=False,
        connect_args={
            "connect_timeout": 10,
            "options": "-c statement_timeout=30000 -c idle_in_transaction_session_timeout=60000"
        }
    )
else:
    # Direct connection or local database
    # P1-5: Added query timeout protection (30s limit)
    engine = create_engine(
        DATABASE_URL,
        pool_size=DATABASE_POOL_SIZE,
        max_overflow=DATABASE_MAX_OVERFLOW,
        pool_pre_ping=True,
        pool_recycle=3600,        # Recycle every hour
        pool_timeout=20,          # Increased from 30
        echo=False,
        connect_args={
            "connect_timeout": 10,
            "options": "-c statement_timeout=30000"  # 30 second query timeout
        }
    )

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()

# Dependency to get DB session
def get_db() -> Generator:
    """
    Dependency to get database session
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Simple RLS function - call this manually in endpoints where needed
def set_org_context(db, org_id: str):
    """
    Set org_id context for RLS in database session.
    This sets the session variable that RLS policies use for filtering.
    Call this after getting org_id in your route handler.
    
    Usage:
        set_org_context(db, context.org_id)
    """
    from sqlalchemy import text
    db.execute(text("SELECT set_config('app.org_id', :org_id, true)"), {"org_id": str(org_id)})
    return db

# Test connection
def test_db_connection():
    """Test database connection"""
    try:
        with engine.connect() as conn:
            result = conn.execute("SELECT 1")
            return True
    except Exception as e:
        print(f"Database connection failed: {e}")
        return False
