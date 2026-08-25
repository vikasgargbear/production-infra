import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]


def test_api_and_mcp_health_publish_render_commit_identity() -> None:
    api = (ROOT / "backend/app/main.py").read_text(encoding="utf-8")
    mcp = (
        ROOT / "backend/mcp_runtime/aasopharma_mcp/server.py"
    ).read_text(encoding="utf-8")

    assert 'os.getenv("RENDER_GIT_COMMIT"' in api
    assert '"git_commit": _deployed_git_commit()' in api
    assert 'os.getenv("RENDER_GIT_COMMIT"' in mcp
    assert '"git_commit": git_commit' in mcp


def test_frontend_build_publishes_exact_commit_metadata() -> None:
    package = json.loads((ROOT / "frontend/package.json").read_text(encoding="utf-8"))
    script = (
        ROOT / "frontend/scripts/write-build-metadata.mjs"
    ).read_text(encoding="utf-8")

    assert package["scripts"]["postbuild"] == "node scripts/write-build-metadata.mjs"
    assert "RENDER_GIT_COMMIT" in script
    assert "GITHUB_SHA" in script
    assert "build-metadata.json" in script
    assert "A full Git commit SHA is required" in script
