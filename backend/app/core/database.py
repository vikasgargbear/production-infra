"""
Database Configuration
"""
import os
import socket
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from typing import Generator
from urllib.parse import urlparse, urlunparse

# Get database URL from environment or use default
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:password@localhost:5432/pharma"
).strip()  # Remove leading/trailing whitespace

# Force IPv4 by adding target_session_attrs to connection string for Supabase
if "supabase.co" in DATABASE_URL and "target_session_attrs" not in DATABASE_URL:
    separator = "&" if "?" in DATABASE_URL else "?"
    DATABASE_URL = f"{DATABASE_URL}{separator}target_session_attrs=read-write"
    print(f"[DATABASE] Added IPv4 preference for Supabase connection")

# Supabase connection validation and detection
IS_SUPABASE = "supabase.com" in DATABASE_URL
IS_POOLER_HOSTNAME = ".pooler.supabase.com" in DATABASE_URL
IS_POOLER_PORT = ":6543" in DATABASE_URL
IS_DIRECT_PORT = ":5432" in DATABASE_URL

# Validate configuration
if IS_SUPABASE:
    if IS_POOLER_HOSTNAME and IS_DIRECT_PORT:
        print("[DATABASE] ❌ ERROR: Pooler hostname with direct port detected!")
        print("[DATABASE] ❌ URL has .pooler.supabase.com:5432 - this is WRONG")
        print("[DATABASE] ✅ Change to: db.PROJECT-ID.supabase.co:5432 (direct)")
        print("[DATABASE] ✅ OR to: .pooler.supabase.com:6543 (pooler)")
        print("[DATABASE] ⚠️  Attempting to connect anyway, but may fail...")
    
    if IS_POOLER_HOSTNAME and IS_POOLER_PORT:
        print(f"[DATABASE] Supabase Transaction Pooler detected (correct config)")
    elif not IS_POOLER_HOSTNAME and IS_DIRECT_PORT:
        print(f"[DATABASE] Supabase Direct Connection detected (correct config)")

IS_SUPABASE_POOLER = IS_POOLER_HOSTNAME and IS_POOLER_PORT

if IS_SUPABASE_POOLER:
    print(f"[DATABASE] Using aggressive connection recycling for pooler mode")

# Create engine with connection pooling optimized for Supabase
if IS_SUPABASE_POOLER:
    # Transaction pooler mode (port 6543) - increased pool for Railway
    engine = create_engine(
        DATABASE_URL,
        pool_size=5,              # Increased from 1 for better concurrency
        max_overflow=10,          # Increased from 2
        pool_pre_ping=True,       # Always test connections
        pool_recycle=30,          # Recycle every 30 seconds
        pool_timeout=10,          # Increased timeout
        echo=False,
        connect_args={
            "connect_timeout": 10,
            "options": "-c statement_timeout=30000 -c idle_in_transaction_session_timeout=60000"
        }
    )
else:
    # Direct connection or local database
    engine = create_engine(
        DATABASE_URL,
        pool_size=5,              # Normal pool size
        max_overflow=10,          # More overflow allowed
        pool_pre_ping=True,
        pool_recycle=3600,        # Recycle every hour
        pool_timeout=30,
        echo=False
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
    Set org_id context for RLS in database session
    Call this after getting org_id in your route handler
    """
    db.execute(f"SELECT set_config('app.current_org_id', '{org_id}', true)")
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