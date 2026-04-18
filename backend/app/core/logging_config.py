"""
Centralized Structured Logging Configuration

JSON-formatted logs with:
- timestamp, level, logger name, message
- request_id, user_id, org_id correlation
- LOG_LEVEL from env var (default INFO in prod, DEBUG in dev)

Usage:
    from app.core.logging_config import setup_logging
    setup_logging()  # Call once at startup
"""
import logging
import json
import os
import sys
import uuid
from datetime import datetime, timezone
from contextvars import ContextVar

from .env import get_app_env, is_production

# Context vars for request correlation
request_id_var: ContextVar[str] = ContextVar("request_id", default="")
user_id_var: ContextVar[str] = ContextVar("user_id", default="")
org_id_var: ContextVar[str] = ContextVar("org_id", default="")


class JSONFormatter(logging.Formatter):
    """
    Structured JSON log formatter for production use.
    Each log line is a valid JSON object for log aggregation tools.
    """

    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Add correlation IDs if available
        req_id = request_id_var.get("")
        if req_id:
            log_entry["request_id"] = req_id

        uid = user_id_var.get("")
        if uid:
            log_entry["user_id"] = uid

        oid = org_id_var.get("")
        if oid:
            log_entry["org_id"] = oid

        # Add exception info if present
        if record.exc_info and record.exc_info[0] is not None:
            log_entry["exception"] = {
                "type": record.exc_info[0].__name__,
                "message": str(record.exc_info[1]),
            }

        # Add extra fields (e.g., from logger.info("msg", extra={...}))
        for key in ("event_type", "ip", "method", "path", "status_code", "duration_ms"):
            val = getattr(record, key, None)
            if val is not None:
                log_entry[key] = val

        return json.dumps(log_entry, default=str)


def setup_logging():
    """
    Configure application-wide structured logging.
    Call once at FastAPI startup.

    Environment variables:
        LOG_LEVEL: DEBUG, INFO, WARNING, ERROR (default: INFO)
        LOG_FORMAT: json or text (default: json in prod, text in dev)
    """
    env = get_app_env()
    production = is_production()

    level_name = os.getenv("LOG_LEVEL", "INFO" if production else "DEBUG").upper()
    level = getattr(logging, level_name, logging.INFO)

    log_format = os.getenv("LOG_FORMAT", "json" if production else "text").lower()

    # Remove existing handlers
    root = logging.getLogger()
    root.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(level)

    if log_format == "json":
        handler.setFormatter(JSONFormatter())
    else:
        handler.setFormatter(logging.Formatter(
            "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S"
        ))

    root.setLevel(level)
    root.addHandler(handler)

    # Quiet noisy libraries
    for lib in ("uvicorn.access", "sqlalchemy.engine", "httpx", "httpcore"):
        logging.getLogger(lib).setLevel(logging.WARNING)

    logging.getLogger("uvicorn.error").setLevel(level)

    logger = logging.getLogger(__name__)
    logger.info(
        f"Logging configured: level={level_name}, format={log_format}, env={env}"
    )


def generate_request_id() -> str:
    """Generate a short unique request ID for correlation."""
    return uuid.uuid4().hex[:12]
