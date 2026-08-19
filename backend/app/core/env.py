"""
Shared environment helpers.

These helpers treat APP_ENV and ENV as the same deployment signal so
production safeguards do not depend on one variable name.
"""
from __future__ import annotations

import os


PRODUCTION_VALUES = {"production", "prod"}


def get_app_env(default: str = "development") -> str:
    return (os.getenv("APP_ENV") or os.getenv("ENV") or default).lower()


def is_production() -> bool:
    return get_app_env() in PRODUCTION_VALUES


def is_test_mode_enabled() -> bool:
    return os.getenv("TEST_MODE", "").lower() in ("true", "1", "yes")
