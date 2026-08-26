from __future__ import annotations

from dataclasses import dataclass

import pytest

from scripts.provision_render_pilot import ProvisioningError
from scripts.verify_render_pilot_sha import SERVICE_TYPES, select_latest_deploy, verify


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
        assert query == {"limit": 20}
        return [
            {
                "deploy": {
                    "id": "dep-1",
                    "status": self.status,
                    "commit": {"id": self.commit},
                    "createdAt": "2026-08-26T02:00:00Z",
                }
            }
        ]


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


def test_latest_deploy_is_selected_by_validated_created_at_not_response_order():
    rows = [
        {"deploy": {"id": "new", "createdAt": "2026-08-26T02:00:00Z"}},
        {"deploy": {"id": "old", "createdAt": "2026-08-25T02:00:00Z"}},
        {"deploy": {"id": "middle", "createdAt": "2026-08-25T12:00:00+00:00"}},
    ]
    assert select_latest_deploy(rows)["id"] == "new"


@pytest.mark.parametrize(
    "rows",
    [[], [{}], [{"deploy": []}], [{"deploy": {"createdAt": "not-a-date"}}]],
)
def test_latest_deploy_selection_fails_closed_on_missing_or_malformed_rows(rows):
    with pytest.raises(ProvisioningError):
        select_latest_deploy(rows)
