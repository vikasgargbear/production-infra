from __future__ import annotations

import importlib.util
import json
import stat
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "backend/scripts/manage_render_pilot_lifecycle.py"
SPEC = importlib.util.spec_from_file_location("manage_render_pilot_lifecycle", SCRIPT)
lifecycle = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.path.insert(0, str(ROOT / "backend"))
sys.modules[SPEC.name] = lifecycle
SPEC.loader.exec_module(lifecycle)


class FakeClient:
    def __init__(self, *, initially_suspended: set[str] | None = None) -> None:
        initially_suspended = initially_suspended or set()
        self.calls: list[tuple[str, str]] = []
        self.services = {
            name: lifecycle.ServiceRef(
                id=f"srv-{index}",
                name=name,
                type=service_type,
                url=f"https://{index}.onrender.com",
                raw={
                    "id": f"srv-{index}",
                    "name": name,
                    "type": service_type,
                    "url": f"https://{index}.onrender.com",
                    "autoDeploy": "no",
                    "suspended": (
                        "suspended" if name in initially_suspended else "not_suspended"
                    ),
                },
            )
            for index, (name, service_type) in enumerate(lifecycle.QUIESCE_ORDER, 1)
        }

    def find_service(self, _owner_id, name, expected_type):
        service = self.services[name]
        assert service.type == expected_type
        return service

    @staticmethod
    def service_ref(value):
        return lifecycle.RenderClient.service_ref(value)

    def request(self, method, path, payload=None, query=None):
        del payload, query
        self.calls.append((method, path))
        service = next(
            (candidate for candidate in self.services.values() if candidate.id in path),
            None,
        )
        assert service is not None
        if path.endswith("/deploys"):
            return []
        if method == "POST" and path.endswith("/suspend"):
            service.raw["suspended"] = "suspended"
            return None
        if method == "POST" and path.endswith("/resume"):
            service.raw["suspended"] = "not_suspended"
            return None
        return dict(service.raw)


def test_quiesce_records_initial_state_and_suspends_in_ingress_order(tmp_path):
    client = FakeClient(initially_suspended={lifecycle.MCP_NAME})
    receipt = tmp_path / "lifecycle.json"

    result = lifecycle.quiesce(
        client,
        owner_id="owner",
        commit_sha="a" * 40,
        receipt_path=receipt,
        sleep=lambda _: None,
    )

    suspend_calls = [path for method, path in client.calls if method == "POST"]
    assert suspend_calls == [
        "/services/srv-1/suspend",
        "/services/srv-3/suspend",
    ]
    assert result["phase"] == "quiesced"
    assert result["services"][lifecycle.MCP_NAME]["suspended_by_run"] is False
    assert stat.S_IMODE(receipt.stat().st_mode) == 0o600
    assert json.loads(receipt.read_text())["commit_sha"] == "a" * 40


def test_resume_only_services_owned_by_same_receipt_in_dependency_order(tmp_path):
    client = FakeClient(initially_suspended={lifecycle.MCP_NAME})
    receipt = tmp_path / "lifecycle.json"
    lifecycle.quiesce(
        client,
        owner_id="owner",
        commit_sha="b" * 40,
        receipt_path=receipt,
        sleep=lambda _: None,
    )
    client.calls.clear()

    result = lifecycle.resume_owned(
        client,
        owner_id="owner",
        commit_sha="b" * 40,
        receipt_path=receipt,
        sleep=lambda _: None,
    )

    resume_calls = [path for method, path in client.calls if method == "POST"]
    assert resume_calls == [
        "/services/srv-3/resume",
        "/services/srv-1/resume",
    ]
    assert result["phase"] == "resumed"
    assert client.services[lifecycle.MCP_NAME].raw["suspended"] == "suspended"


def test_active_deploy_fails_before_any_service_is_suspended(tmp_path):
    client = FakeClient()
    original_request = client.request

    def request(method, path, payload=None, query=None):
        if path.endswith("/deploys") and "srv-2" in path:
            return [{"deploy": {"status": "build_in_progress"}}]
        return original_request(method, path, payload, query)

    client.request = request  # type: ignore[method-assign]
    with pytest.raises(lifecycle.ProvisioningError, match="active deploy"):
        lifecycle.quiesce(
            client,
            owner_id="owner",
            commit_sha="c" * 40,
            receipt_path=tmp_path / "lifecycle.json",
            sleep=lambda _: None,
        )
    assert not any(method == "POST" for method, _ in client.calls)


def test_receipt_is_exact_sha_bound_and_cannot_be_reused(tmp_path):
    client = FakeClient()
    receipt = tmp_path / "lifecycle.json"
    lifecycle.quiesce(
        client,
        owner_id="owner",
        commit_sha="d" * 40,
        receipt_path=receipt,
        sleep=lambda _: None,
    )

    with pytest.raises(lifecycle.ProvisioningError, match="not bound"):
        lifecycle.resume_owned(
            client,
            owner_id="owner",
            commit_sha="e" * 40,
            receipt_path=receipt,
            sleep=lambda _: None,
        )


def test_unreviewed_suspension_state_fails_closed(tmp_path):
    client = FakeClient()
    client.services[lifecycle.API_NAME].raw["suspended"] = "unknown"
    with pytest.raises(lifecycle.ProvisioningError, match="unreviewed"):
        lifecycle.quiesce(
            client,
            owner_id="owner",
            commit_sha="f" * 40,
            receipt_path=tmp_path / "lifecycle.json",
            sleep=lambda _: None,
        )


def test_certification_refuses_preexisting_suspension_before_mutation(tmp_path):
    client = FakeClient(initially_suspended={lifecycle.API_NAME})
    with pytest.raises(lifecycle.ProvisioningError, match="requires active"):
        lifecycle.quiesce(
            client,
            owner_id="owner",
            commit_sha="1" * 40,
            receipt_path=tmp_path / "lifecycle.json",
            require_active=True,
            sleep=lambda _: None,
        )
    assert not any(method == "POST" for method, _ in client.calls)


def test_explicit_recovery_adopts_and_resumes_preexisting_suspension(tmp_path):
    client = FakeClient(initially_suspended={lifecycle.API_NAME})
    receipt = tmp_path / "lifecycle.json"
    lifecycle.quiesce(
        client,
        owner_id="owner",
        commit_sha="2" * 40,
        receipt_path=receipt,
        require_active=True,
        adopt_preexisting=True,
        sleep=lambda _: None,
    )

    result = lifecycle.resume_owned(
        client,
        owner_id="owner",
        commit_sha="2" * 40,
        receipt_path=receipt,
        sleep=lambda _: None,
    )
    assert result["services"][lifecycle.API_NAME]["adopted_by_run"] is True
    assert client.services[lifecycle.API_NAME].raw["suspended"] == "not_suspended"


def test_deploy_failure_requiesces_only_run_owned_services(tmp_path):
    client = FakeClient(initially_suspended={lifecycle.MCP_NAME})
    receipt = tmp_path / "lifecycle.json"
    lifecycle.quiesce(
        client,
        owner_id="owner",
        commit_sha="3" * 40,
        receipt_path=receipt,
        sleep=lambda _: None,
    )
    lifecycle.resume_owned(
        client,
        owner_id="owner",
        commit_sha="3" * 40,
        receipt_path=receipt,
        sleep=lambda _: None,
    )

    result = lifecycle.requiesce_owned(
        client,
        owner_id="owner",
        commit_sha="3" * 40,
        receipt_path=receipt,
        sleep=lambda _: None,
    )
    assert result["phase"] == "quiesced_after_failure"
    assert client.services[lifecycle.API_NAME].raw["suspended"] == "suspended"
    assert client.services[lifecycle.FRONTEND_NAME].raw["suspended"] == "suspended"
    assert client.services[lifecycle.MCP_NAME].raw["suspended"] == "suspended"
    assert "resuspended_after_failure" not in result["services"][lifecycle.MCP_NAME]


def test_resume_can_stage_dependencies_without_waking_frontend(tmp_path):
    client = FakeClient()
    receipt = tmp_path / "lifecycle.json"
    lifecycle.quiesce(
        client,
        owner_id="owner",
        commit_sha="4" * 40,
        receipt_path=receipt,
        sleep=lambda _: None,
    )
    client.calls.clear()

    result = lifecycle.resume_owned(
        client,
        owner_id="owner",
        commit_sha="4" * 40,
        receipt_path=receipt,
        service_names=[lifecycle.API_NAME],
        sleep=lambda _: None,
    )

    assert result["phase"] == "partially_resumed"
    assert client.services[lifecycle.API_NAME].raw["suspended"] == "not_suspended"
    assert client.services[lifecycle.MCP_NAME].raw["suspended"] == "suspended"
    assert client.services[lifecycle.FRONTEND_NAME].raw["suspended"] == "suspended"


def test_requiesce_attempts_every_owned_service_after_first_failure(tmp_path):
    client = FakeClient()
    receipt = tmp_path / "lifecycle.json"
    lifecycle.quiesce(
        client,
        owner_id="owner",
        commit_sha="5" * 40,
        receipt_path=receipt,
        sleep=lambda _: None,
    )
    lifecycle.resume_owned(
        client,
        owner_id="owner",
        commit_sha="5" * 40,
        receipt_path=receipt,
        sleep=lambda _: None,
    )
    original_request = client.request

    def request(method, path, payload=None, query=None):
        if method == "POST" and path == "/services/srv-1/suspend":
            raise lifecycle.ProvisioningError("simulated ingress failure")
        return original_request(method, path, payload, query)

    client.request = request  # type: ignore[method-assign]
    with pytest.raises(lifecycle.ProvisioningError, match="safe suspended state"):
        lifecycle.requiesce_owned(
            client,
            owner_id="owner",
            commit_sha="5" * 40,
            receipt_path=receipt,
            sleep=lambda _: None,
        )

    persisted = json.loads(receipt.read_text())
    assert persisted["phase"] == "requiesce_failed"
    assert persisted["requiesce_failed_services"] == [lifecycle.FRONTEND_NAME]
    assert client.services[lifecycle.MCP_NAME].raw["suspended"] == "suspended"
    assert client.services[lifecycle.API_NAME].raw["suspended"] == "suspended"


def test_requiesce_reconciles_ambiguous_transient_suspend_without_duplicate(tmp_path):
    client = FakeClient()
    receipt = tmp_path / "lifecycle.json"
    lifecycle.quiesce(
        client,
        owner_id="owner",
        commit_sha="6" * 40,
        receipt_path=receipt,
        sleep=lambda _: None,
    )
    lifecycle.resume_owned(
        client,
        owner_id="owner",
        commit_sha="6" * 40,
        receipt_path=receipt,
        sleep=lambda _: None,
    )
    client.calls.clear()
    original_request = client.request
    ambiguous_failure = True

    def request(method, path, payload=None, query=None):
        nonlocal ambiguous_failure
        if (
            ambiguous_failure
            and method == "POST"
            and path == "/services/srv-1/suspend"
        ):
            ambiguous_failure = False
            original_request(method, path, payload, query)
            raise lifecycle.ProvisioningError(
                "Render API POST /services/srv-1/suspend failed with HTTP 503"
            )
        return original_request(method, path, payload, query)

    client.request = request  # type: ignore[method-assign]
    result = lifecycle.requiesce_owned(
        client,
        owner_id="owner",
        commit_sha="6" * 40,
        receipt_path=receipt,
        sleep=lambda _: None,
    )

    ingress_suspend_calls = [
        path
        for method, path in client.calls
        if method == "POST" and path == "/services/srv-1/suspend"
    ]
    assert ingress_suspend_calls == ["/services/srv-1/suspend"]
    assert result["phase"] == "quiesced_after_failure"
    assert all(
        service.raw["suspended"] == "suspended"
        for service in client.services.values()
    )


def test_requiesce_retries_allowlisted_transient_but_not_permanent_failure(tmp_path):
    client = FakeClient()
    receipt = tmp_path / "lifecycle.json"
    lifecycle.quiesce(
        client,
        owner_id="owner",
        commit_sha="7" * 40,
        receipt_path=receipt,
        sleep=lambda _: None,
    )
    lifecycle.resume_owned(
        client,
        owner_id="owner",
        commit_sha="7" * 40,
        receipt_path=receipt,
        sleep=lambda _: None,
    )
    client.calls.clear()
    original_request = client.request
    transient_failures = 0
    permanent_failures = 0

    def request(method, path, payload=None, query=None):
        nonlocal transient_failures, permanent_failures
        if method == "POST" and path == "/services/srv-1/suspend":
            transient_failures += 1
            if transient_failures < lifecycle.MAX_REQUIESCE_ATTEMPTS:
                raise lifecycle.ProvisioningError(
                    "Render API POST /services/srv-1/suspend failed with HTTP 429"
                )
        if method == "POST" and path == "/services/srv-2/suspend":
            permanent_failures += 1
            raise lifecycle.ProvisioningError(
                "Render API POST /services/srv-2/suspend failed with HTTP 403"
            )
        return original_request(method, path, payload, query)

    client.request = request  # type: ignore[method-assign]
    with pytest.raises(lifecycle.ProvisioningError, match="safe suspended state"):
        lifecycle.requiesce_owned(
            client,
            owner_id="owner",
            commit_sha="7" * 40,
            receipt_path=receipt,
            sleep=lambda _: None,
        )

    assert transient_failures == lifecycle.MAX_REQUIESCE_ATTEMPTS
    assert permanent_failures == 1
    assert client.services[lifecycle.FRONTEND_NAME].raw["suspended"] == "suspended"
    assert client.services[lifecycle.MCP_NAME].raw["suspended"] == "not_suspended"
    assert client.services[lifecycle.API_NAME].raw["suspended"] == "suspended"
    persisted = json.loads(receipt.read_text())
    assert persisted["requiesce_failed_services"] == [lifecycle.MCP_NAME]
