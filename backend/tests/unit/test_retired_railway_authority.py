from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "backend/scripts/verify_retired_railway_authority.py"
SPEC = importlib.util.spec_from_file_location("verify_retired_railway_authority", SCRIPT)
authority = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = authority
SPEC.loader.exec_module(authority)


SERVICES = [
    ("api-id", "api", "https://api.example.test"),
    ("mcp-id", "mcp", "https://mcp.example.test"),
    ("web-id", "web", "https://web.example.test"),
]


def status_payload(*, environment_id: str = "reviewed") -> dict:
    return {
        "id": "project",
        "environments": {
            "edges": [
                {
                    "node": {
                        "id": environment_id,
                        "serviceInstances": {
                            "edges": [
                                {
                                    "node": {
                                        "serviceId": service_id,
                                        "serviceName": name,
                                        "domains": {
                                            "serviceDomains": [
                                                {"domain": f"{name}.example.test"}
                                            ],
                                            "customDomains": [],
                                        },
                                        "latestDeployment": {
                                            "id": f"{service_id}-deployment",
                                            "status": "FAILED",
                                            "deploymentStopped": True,
                                        },
                                        "activeDeployments": [],
                                    }
                                }
                                for service_id, name, _ in SERVICES
                            ]
                        },
                    }
                }
            ]
        },
    }


def test_status_is_bound_to_exact_project_environment_services_and_domains() -> None:
    evidence = authority.validate_status(
        status_payload(),
        project_id="project",
        environment_id="reviewed",
        services=SERVICES,
    )
    assert [row["service_id"] for row in evidence] == [row[0] for row in SERVICES]


@pytest.mark.parametrize("drift", ["project", "environment", "service", "domain", "running"])
def test_status_fails_closed_on_authority_drift(drift: str) -> None:
    payload = status_payload(environment_id="wrong" if drift == "environment" else "reviewed")
    if drift == "project":
        payload["id"] = "wrong"
    service = payload["environments"]["edges"][0]["node"]["serviceInstances"]["edges"][0]["node"]
    if drift == "service":
        service["serviceId"] = "wrong"
    elif drift == "domain":
        service["domains"]["serviceDomains"] = [{"domain": "wrong.example.test"}]
    elif drift == "running":
        service["latestDeployment"]["deploymentStopped"] = False
    with pytest.raises(authority.RailwayAuthorityError):
        authority.validate_status(
            payload,
            project_id="project",
            environment_id="reviewed",
            services=SERVICES,
        )
