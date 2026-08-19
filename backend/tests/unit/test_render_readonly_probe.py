import importlib.util
import sys
from pathlib import Path

import pytest


SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "verify_render_pilot_readonly.py"
SPEC = importlib.util.spec_from_file_location("verify_render_pilot_readonly", SCRIPT)
probe = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = probe
SPEC.loader.exec_module(probe)


class FakeResponse:
    def __init__(self, status_code, body):
        self.status_code = status_code
        self._body = body

    def json(self):
        return self._body


class FakeSession:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def get(self, url, *, headers, timeout):
        self.calls.append((url, headers, timeout))
        return self.responses.pop(0)


def _public_responses():
    return [
        FakeResponse(200, {"status": "healthy", "service": "api", "version": "3"}),
        FakeResponse(200, {"status": "ready"}),
        FakeResponse(200, {
            "enabled": True,
            "providers_configured": ["email", "google"],
            "setup_required": False,
        }),
        FakeResponse(200, {"providers": [], "supabase_configured": True}),
    ]


def test_probe_retries_transient_get_and_uses_no_authenticated_write_path():
    session = FakeSession([FakeResponse(503, {}), *_public_responses()])
    sleeps = []

    passed = probe.run_checks(
        "https://pilot-api.onrender.com",
        attempts=3,
        timeout_seconds=7,
        session=session,
        sleep=sleeps.append,
    )

    assert passed == ["health", "database readiness", "auth status", "auth providers"]
    assert len(session.calls) == 5
    assert all(call[1] is None for call in session.calls)
    assert sleeps == [1]
    assert all("supabase/session" not in call[0] for call in session.calls)


def test_access_token_adds_only_the_authenticated_gst_get():
    session = FakeSession([
        *_public_responses(),
        FakeResponse(200, {
            "outputTax": "10.00",
            "inputCredit": "2.00",
            "netPayable": "8.00",
            "summary": {},
        }),
    ])

    passed = probe.run_checks(
        "https://pilot-api.onrender.com/",
        access_token="secret-token",
        session=session,
        sleep=lambda _: None,
    )

    assert passed[-1] == "authenticated GST read"
    assert session.calls[-1][0].endswith("/api/gst/dashboard?period=current")
    assert session.calls[-1][1] == {"Authorization": "Bearer secret-token"}
    assert all(call[1] is None for call in session.calls[:-1])


@pytest.mark.parametrize(
    "url",
    [
        "http://pilot-api.onrender.com",
        "https://user:password@pilot-api.onrender.com",
        "https://pilot-api.onrender.com/api",
        "https://pilot-api.onrender.com?token=secret",
    ],
)
def test_probe_rejects_non_origin_or_insecure_remote_urls(url):
    with pytest.raises(probe.ProbeError):
        probe.normalize_base_url(url)


def test_non_retryable_response_fails_without_repeating_request():
    session = FakeSession([FakeResponse(401, {})])

    with pytest.raises(probe.ProbeError, match=r"after 1 attempt\(s\): HTTP 401"):
        probe.run_checks(
            "https://pilot-api.onrender.com",
            attempts=5,
            session=session,
            sleep=lambda _: None,
        )

    assert len(session.calls) == 1
