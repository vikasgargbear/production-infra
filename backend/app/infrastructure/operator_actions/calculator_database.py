"""Isolated calculator connection used only for attested prepare transactions."""

from __future__ import annotations

import os
from functools import lru_cache
import re
from urllib.parse import unquote, urlparse

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


CALCULATOR_DATABASE_URL_ENV = "ERP_CALCULATOR_DATABASE_URL"
PROJECT_REF_RE = re.compile(r"^[a-z0-9]{20}$")


def calculator_database_configured() -> bool:
    value = os.getenv(CALCULATOR_DATABASE_URL_ENV, "").strip()
    if not value or "[YOUR-" in value:
        return False
    try:
        parsed = urlparse(value)
    except ValueError:
        return False
    username = unquote(parsed.username or "")
    direct = username == "erp_calculator"
    pooler_prefix, separator, project_ref = username.partition(".")
    pooler = (
        separator == "."
        and pooler_prefix == "erp_calculator"
        and PROJECT_REF_RE.fullmatch(project_ref) is not None
        and (parsed.hostname or "").endswith(".pooler.supabase.com")
    )
    return (
        parsed.scheme in {"postgres", "postgresql", "postgresql+psycopg2"}
        and (direct or pooler)
        and bool(parsed.hostname)
        and bool(parsed.path.strip("/"))
    )


@lru_cache(maxsize=1)
def calculator_session_factory():
    """Build a dedicated small pool; never reuse it for ordinary API reads."""
    value = os.getenv(CALCULATOR_DATABASE_URL_ENV, "").strip()
    if not calculator_database_configured():
        raise RuntimeError(
            f"{CALCULATOR_DATABASE_URL_ENV} must authenticate as erp_calculator"
        )
    engine = create_engine(
        value,
        pool_size=2,
        max_overflow=0,
        pool_pre_ping=True,
        pool_recycle=300,
        pool_timeout=10,
        echo=False,
        connect_args={
            "connect_timeout": 10,
            "options": "-c statement_timeout=30000 -c idle_in_transaction_session_timeout=60000",
        },
    )
    return sessionmaker(autocommit=False, autoflush=False, bind=engine)
