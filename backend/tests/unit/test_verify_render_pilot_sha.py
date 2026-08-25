from __future__ import annotations

from dataclasses import dataclass

import pytest

from scripts.provision_render_pilot import ProvisioningError
from scripts.verify_render_pilot_sha import SERVICE_TYPES, verify


SHA = "a" * 40


@dataclass
class Service:
    id: str
    name: str
    url: str


class Client:
    def __init__(self, *, status: str = "live", commit: str = SHA):
        self.status = status
        self.commit = commit

    def find_service(self, _owner_id, name, _service_type):
        return Service(f"srv-{name}", name, f"https://{name}.example")

    def request(self, _method, path, query=None):
        assert path.endswith("/deploys")
        assert query == {"limit": 1}
        return [{"deploy": {"id": "dep-1", "status": self.status, "commit": {"id": self.commit}}}]


def test_all_three_services_must_be_live_on_the_same_reviewed_sha():
    result = verify(Client(), "owner", SHA)
    assert set(result["services"]) == set(SERVICE_TYPES)
    assert {row["commit_sha"] for row in result["services"].values()} == {SHA}


@pytest.mark.parametrize(
    ("client", "message"),
    [(Client(status="build_in_progress"), "not live"), (Client(commit="b" * 40), "not live")],
)
def test_nonlive_or_different_sha_fails_closed(client, message):
    with pytest.raises(ProvisioningError, match=message):
        verify(client, "owner", SHA)


def test_sha_must_be_an_exact_full_lowercase_commit():
    with pytest.raises(ProvisioningError, match="40 lowercase hexadecimal"):
        verify(Client(), "owner", "ABC")
