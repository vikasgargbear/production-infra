import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
RAILWAY_SCHEMA = "https://railway.com/railway.schema.json"
SINGAPORE_REGION = "asia-southeast1-eqsg3a"


def _config(name: str) -> dict:
    return json.loads(
        (ROOT / "deploy/railway" / f"{name}.railway.json").read_text(
            encoding="utf-8"
        )
    )


def test_each_railway_service_is_a_single_singapore_docker_replica() -> None:
    expected_dockerfiles = {
        "api": "/deploy/railway/api.Dockerfile",
        "mcp": "/deploy/railway/mcp.Dockerfile",
        "frontend": "/frontend/Dockerfile",
    }

    for service, dockerfile in expected_dockerfiles.items():
        config = _config(service)
        assert config["$schema"] == RAILWAY_SCHEMA
        assert config["build"]["builder"] == "DOCKERFILE"
        assert config["build"]["dockerfilePath"] == dockerfile
        assert config["deploy"]["sleepApplication"] is False
        assert config["deploy"]["multiRegionConfig"] == {
            SINGAPORE_REGION: {"numReplicas": 1}
        }


def test_railway_healthchecks_match_service_readiness_boundaries() -> None:
    assert _config("api")["deploy"]["healthcheckPath"] == "/ready"
    assert _config("mcp")["deploy"]["healthcheckPath"] == "/health"
    assert _config("frontend")["deploy"]["healthcheckPath"] == "/health"


def test_frontend_container_builds_once_and_serves_spa_with_healthcheck() -> None:
    dockerfile = (ROOT / "frontend/Dockerfile").read_text(encoding="utf-8")
    caddyfile = (ROOT / "frontend/Caddyfile").read_text(encoding="utf-8")

    assert "FROM node:22-alpine AS build" in dockerfile
    assert "ARG RAILWAY_GIT_COMMIT_SHA" in dockerfile
    assert "npm run test:ci -- --runInBand" in dockerfile
    assert "CI=false npm run build" in dockerfile
    assert "FROM caddy:2.10.2-alpine" in dockerfile
    assert "COPY . ." in dockerfile
    assert "COPY --from=build /workspace/frontend/build /srv" in dockerfile
    assert "handle /health" in caddyfile
    assert "try_files {path} /index.html" in caddyfile
