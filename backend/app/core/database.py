"""
Database Configuration
"""
import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from typing import Generator

# Get database URL from environment or use default
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:password@localhost:5432/pharma"
)

# Supabase connection fix: Add pgbouncer=true for connection pooler
# This tells Supabase to use transaction mode instead of session mode
if "supabase.com" in DATABASE_URL and "pgbouncer=true" not in DATABASE_URL:
    # Add pgbouncer parameter if using Supabase pooler
    separator = "&" if "?" in DATABASE_URL else "?"
    DATABASE_URL = f"{DATABASE_URL}{separator}pgbouncer=true"
    print(f"[DATABASE] Supabase pooler detected - added pgbouncer=true parameter")

# Create engine with ultra-conservative connection pooling for Supabase
engine = create_engine(
    DATABASE_URL,
    pool_size=2,  # Ultra-small for Supabase session mode limits
    max_overflow=3,  # Maximum 5 total connections
    pool_pre_ping=True,
    pool_recycle=60,  # Recycle connections every 1 minute
    pool_timeout=10,  # 10 second timeout
    echo=False,
    # Supabase-specific connection args
    connect_args={
        "options": "-c statement_timeout=30000"  # 30 second query timeout
    } if "supabase.com" in DATABASE_URL else {}
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