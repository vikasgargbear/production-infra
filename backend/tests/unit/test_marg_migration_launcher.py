import argparse
import hashlib
import json

import pytest

from scripts.migrate_marg import _instance_id, acquire_profile, compile_package


def test_acquisition_collects_each_folder_and_reuses_completed_capture(tmp_path, monkeypatch):
    script = tmp_path / "migration-work/agent/acquire_marg.py"
    script.parent.mkdir(parents=True)
    script.touch()
    args = argparse.Namespace(profile=None, output=tmp_path / "bundle", source_repo=tmp_path,
                              source=[tmp_path / "MARG", tmp_path / "Exports"])
    calls = []

    def collect(command, **kwargs):
        calls.append(command)
        capture = tmp_path / "bundle-capture"
        capture.mkdir()
        (capture / "evidence-profile.json").write_text('{}')
        return argparse.Namespace(returncode=0)

    monkeypatch.setattr("scripts.migrate_marg.subprocess.run", collect)
    profile = acquire_profile(args)
    assert profile.is_file()
    assert calls[0].count("--source") == 2
    assert acquire_profile(args) == profile
    assert len(calls) == 1


def test_missing_exports_stop_before_compilation(tmp_path, monkeypatch):
    script = tmp_path / "migration-work/agent/acquire_marg.py"
    script.parent.mkdir(parents=True)
    script.touch()
    args = argparse.Namespace(profile=None, output=tmp_path / "bundle", source_repo=tmp_path,
                              source=[tmp_path / "MARG"])
    monkeypatch.setattr("scripts.migrate_marg.subprocess.run",
                        lambda *a, **kw: argparse.Namespace(returncode=2))
    with pytest.raises(ValueError, match="MARG exports are incomplete"):
        acquire_profile(args)
    assert not args.output.exists()


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
