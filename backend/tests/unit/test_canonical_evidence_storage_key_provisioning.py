from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "backend/scripts/provision_canonical_evidence_storage_key.py"
SPEC = importlib.util.spec_from_file_location("provision_canonical_evidence_storage_key", SCRIPT)
provision = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = provision
SPEC.loader.exec_module(provision)


class Client:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def request(self, method, path, **kwargs):
        self.calls.append((method, path, kwargs))
        return self.responses.pop(0)


def record(*, api_key=None):
    value = {
        "id": "key-id",
        "name": provision.KEY_NAME,
        "type": "secret",
        "prefix": "sb_secret_test",
        "secret_jwt_template": {"role": provision.KEY_ROLE},
    }
    if api_key:
        value["api_key"] = api_key
    return value


def test_creates_one_custom_role_secret_key() -> None:
    secret = "sb_secret_" + "A" * 32
    client = Client([[], record(api_key=secret)])

    result = provision.reconcile_key(client, "rgihahbmkrmhitjdjvev")

    assert result["api_key"] == secret
    assert result["created"] is True
    assert client.calls[1][2]["payload"]["secret_jwt_template"] == {
        "role": "erp_evidence_storage"
    }


def test_reuses_only_the_exact_reviewed_key() -> None:
    secret = "sb_secret_" + "B" * 32
    client = Client([[record()], record(api_key=secret)])

    result = provision.reconcile_key(client, "rgihahbmkrmhitjdjvev")

    assert result["created"] is False
    assert client.calls[1][0] == "GET"
    assert client.calls[1][2]["query"] == {"reveal": "true"}


@pytest.mark.parametrize(
    "bad_record",
    [
        {**record(), "type": "publishable"},
        {**record(), "secret_jwt_template": {"role": "service_role"}},
    ],
)
def test_existing_key_contract_drift_fails_closed(bad_record) -> None:
    with pytest.raises(provision.EvidenceKeyError):
        provision.reconcile_key(Client([[bad_record]]), "rgihahbmkrmhitjdjvev")


def test_secret_is_written_only_to_run_scoped_environment(tmp_path) -> None:
    environment = tmp_path / "github-env"
    environment.touch(mode=0o600)
    secret = "sb_secret_" + "C" * 32

    provision._append_github_environment(
        environment,
        project_ref="rgihahbmkrmhitjdjvev",
        api_key=secret,
    )

    assert environment.read_text(encoding="utf-8").splitlines() == [
        "EVIDENCE_STORAGE_ENABLED=true",
        "EVIDENCE_STORAGE_EXPECTED_PROJECT_REF=rgihahbmkrmhitjdjvev",
        f"EVIDENCE_STORAGE_SERVER_API_KEY={secret}",
    ]
