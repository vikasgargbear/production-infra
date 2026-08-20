from pathlib import Path

from scripts.audit.test_implementation_audit import audit_paths


def _write(path: Path, source: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(source, encoding="utf-8")


def test_accepts_implemented_tests_and_cleanup_pass(tmp_path: Path) -> None:
    root = tmp_path / "api"
    _write(
        root / "test_example.py",
        """
def test_real_contract():
    assert 2 + 2 == 4

def cleanup():
    try:
        release_resource()
    except Exception:
        pass
""",
    )

    assert audit_paths([root]) == []


def test_rejects_missing_directory_and_empty_test(tmp_path: Path) -> None:
    root = tmp_path / "live"
    _write(root / "test_empty.py", "def test_missing_contract():\n    pass\n")

    issues = audit_paths([root, tmp_path / "missing"])

    assert any("only a placeholder body" in issue for issue in issues)
    assert any("missing critical test directory" in issue for issue in issues)


def test_rejects_placeholder_marker(tmp_path: Path) -> None:
    root = tmp_path / "scenarios"
    _write(
        root / "test_placeholder.py",
        "def test_contract():\n    # Actual integration would call the API\n    assert True\n",
    )

    assert any("placeholder test marker" in issue for issue in audit_paths([root]))
