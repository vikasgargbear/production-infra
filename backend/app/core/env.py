"""
Shared environment helpers.

``APP_ENV`` is the only runtime-mode authority.  A second alias makes it
possible for deployment configuration and safety checks to disagree.
"""
from __future__ import annotations

import os


PRODUCTION_VALUES = {"production", "prod"}


def get_app_env(default: str = "development") -> str:
    return (os.getenv("APP_ENV") or default).lower()


def is_production() -> bool:
    return get_app_env() in PRODUCTION_VALUES


def is_test_mode_enabled() -> bool:
    return os.getenv("TEST_MODE", "").lower() in ("true", "1", "yes")
