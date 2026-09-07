import argparse
import hashlib
import json

import pytest

from scripts.migrate_marg import _instance_id, compile_package


def test_resume_keeps_original_package_and_rejects_changed_profile(tmp_path):
    profile = tmp_path / "profile.json"
    profile.write_text('{"inputs": {}}')
    bundle = {
        "opening_date": "2026-08-29",
        "summary": {"source_profile_sha256": hashlib.sha256(profile.read_bytes()).hexdigest()},
    }
    (tmp_path / "migration-bundle.json").write_text(json.dumps(bundle))
    args = argparse.Namespace(output=tmp_path, profile=profile)
    target = {"opening_date": "2026-08-29"}
    assert compile_package(args, target) == bundle
    with pytest.raises(ValueError, match="Opening date changed"):
        compile_package(args, {"opening_date": "2026-09-01"})
    profile.write_text('{"inputs": {"different": true}}')
    with pytest.raises(ValueError, match="Source profile changed"):
        compile_package(args, target)


def test_instance_selection_is_bound_to_project_environment_and_service():
    provider = {"environment_id": "chosen", "services": {"api": {"name": "api"}}}
    service = {"serviceName": "api", "activeDeployments": [{"instances": [
        {"id": "active", "status": "RUNNING"}, {"id": "old", "status": "STOPPED"},
    ]}]}
    status = {"environments": {"edges": [{"node": {
        "id": "chosen", "serviceInstances": {"edges": [{"node": service}]},
    }}]}}
    assert _instance_id(status, provider) == "active"
    service["activeDeployments"][0]["instances"].append({"id": "second", "status": "RUNNING"})
    with pytest.raises(ValueError, match="settle"):
        _instance_id(status, provider)
