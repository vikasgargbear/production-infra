import asyncio
import json

from fastapi.responses import JSONResponse

from app import main


def test_database_readiness_probe_executes_only_select_one(monkeypatch):
    executed = []

    class Result:
        @staticmethod
        def scalar_one():
            return 1

    class Connection:
        def __enter__(self):
            return self

        def __exit__(self, *_):
            return None

        def execute(self, statement):
            executed.append(str(statement))
            return Result()

    class Engine:
        @staticmethod
        def connect():
            return Connection()

    monkeypatch.setattr(main, "engine", Engine())

    assert main._database_is_ready() is True
    assert executed == ["SELECT 1"]


def test_ready_returns_success_only_after_database_probe(monkeypatch):
    monkeypatch.setattr(main, "_database_is_ready", lambda: True)

    assert asyncio.run(main.readiness_check()) == {"status": "ready"}


def test_ready_returns_generic_503_without_exception_details(monkeypatch):
    secret = "postgresql://user:password@private-host/database"

    def fail():
        raise RuntimeError(secret)

    monkeypatch.setattr(main, "_database_is_ready", fail)
    response = asyncio.run(main.readiness_check())

    assert isinstance(response, JSONResponse)
    assert response.status_code == 503
    assert json.loads(response.body) == {"status": "not_ready"}
    assert secret.encode() not in response.body


def test_ready_timeout_is_bounded_and_returns_generic_503(monkeypatch):
    async def never_finishes(*_args, **_kwargs):
        await asyncio.sleep(1)

    monkeypatch.setattr(main, "run_in_threadpool", never_finishes)
    monkeypatch.setattr(main, "READINESS_TIMEOUT_SECONDS", 0.001)

    response = asyncio.run(main.readiness_check())

    assert isinstance(response, JSONResponse)
    assert response.status_code == 503
    assert json.loads(response.body) == {"status": "not_ready"}
