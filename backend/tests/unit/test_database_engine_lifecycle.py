from __future__ import annotations

import asyncio

import pytest

from app import main
from app.infrastructure.operator_actions import calculator_database


class _EngineDouble:
    def __init__(self) -> None:
        self.dispose_calls = 0

    def dispose(self) -> None:
        self.dispose_calls += 1


def test_calculator_disposal_preserves_lazy_initialization(monkeypatch):
    calculator_database.calculator_session_factory.cache_clear()
    create_calls = []
    monkeypatch.setattr(
        calculator_database,
        "create_engine",
        lambda *args, **kwargs: create_calls.append((args, kwargs)),
    )

    calculator_database.dispose_calculator_engine()

    assert create_calls == []


def test_calculator_disposal_is_idempotent(monkeypatch):
    calculator_database.calculator_session_factory.cache_clear()
    calculator_engine = _EngineDouble()
    monkeypatch.setenv(
        calculator_database.CALCULATOR_DATABASE_URL_ENV,
        "postgresql://erp_calculator:secret@localhost:5432/canonical",
    )
    monkeypatch.setattr(
        calculator_database,
        "create_engine",
        lambda *args, **kwargs: calculator_engine,
    )

    calculator_database.calculator_session_factory()
    calculator_database.dispose_calculator_engine()
    calculator_database.dispose_calculator_engine()

    assert calculator_engine.dispose_calls == 1
    assert calculator_database.calculator_session_factory.cache_info().currsize == 0


def test_lifespan_disposes_both_engines_after_request_shutdown(monkeypatch):
    calls = []
    monkeypatch.setattr(main, "setup_logging", lambda: None)
    monkeypatch.setattr(
        main, "install_sqlalchemy_operator_action_service", lambda: None
    )
    monkeypatch.setattr(main, "is_production", lambda: False)
    monkeypatch.setattr(main, "dispose_calculator_engine", lambda: calls.append("calculator"))
    monkeypatch.setattr(main.engine, "dispose", lambda: calls.append("main"))

    async def exercise() -> None:
        async with main.lifespan(main.app):
            assert calls == []

    asyncio.run(exercise())

    assert calls == ["calculator", "main"]


def test_lifespan_disposes_main_engine_when_calculator_disposal_fails(monkeypatch):
    calls = []
    monkeypatch.setattr(main, "setup_logging", lambda: None)
    monkeypatch.setattr(
        main, "install_sqlalchemy_operator_action_service", lambda: None
    )
    monkeypatch.setattr(main, "is_production", lambda: False)

    def fail_calculator_disposal() -> None:
        calls.append("calculator")
        raise RuntimeError("calculator disposal failed")

    monkeypatch.setattr(main, "dispose_calculator_engine", fail_calculator_disposal)
    monkeypatch.setattr(main.engine, "dispose", lambda: calls.append("main"))

    async def exercise() -> None:
        async with main.lifespan(main.app):
            pass

    with pytest.raises(RuntimeError, match="calculator disposal failed"):
        asyncio.run(exercise())

    assert calls == ["calculator", "main"]
