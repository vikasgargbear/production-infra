from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]


def _requirements(path: Path) -> dict[str, str]:
    entries: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith(("#", "-r ")):
            continue
        name, separator, version = line.partition("==")
        assert separator == "==", f"dependency must be exactly pinned: {line}"
        entries[name.lower()] = version
    return entries


def test_runtime_dependencies_pin_reviewed_patched_releases() -> None:
    runtime = _requirements(ROOT / "backend" / "requirements.txt")
    assert runtime["python-jose[cryptography]"] == "3.4.0"
    assert runtime["python-multipart"] == "0.0.32"
    assert runtime["pillow"] == "12.3.0"
    assert runtime["requests"] == "2.34.2"
    assert "pytest" not in runtime
    assert "pytest-asyncio" not in runtime


def test_ci_installs_dev_dependencies_and_audits_runtime_only() -> None:
    dev_path = ROOT / "backend" / "requirements-dev.txt"
    dev_text = dev_path.read_text(encoding="utf-8")
    dev = _requirements(dev_path)
    workflow = (ROOT / ".github" / "workflows" / "production-readiness.yml").read_text(
        encoding="utf-8"
    )

    assert "-r requirements.txt" in dev_text
    assert dev["pytest"] == "9.1.1"
    assert dev["pytest-asyncio"] == "1.4.0"
    assert dev["pip-audit"] == "2.10.1"
    assert "pip install -r backend/requirements-dev.txt" in workflow
    assert "pip-audit -r backend/requirements.txt" in workflow
