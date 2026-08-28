from scripts.ci_change_plan import AREAS, classify


def test_docs_only_change_runs_no_product_lane() -> None:
    assert classify(["docs/architecture/readme.md"]) == {
        area: False for area in AREAS
    }


def test_frontend_source_does_not_start_backend_or_postgres() -> None:
    plan = classify(["frontend/src/components/CustomerFlow.tsx"])
    assert plan["frontend"] is True
    assert plan["backend"] is False
    assert plan["mcp"] is False
    assert plan["postgres"] is False
    assert plan["frontend_dependencies"] is False
    assert plan["deploy_frontend"] is True


def test_frontend_lockfile_adds_only_frontend_dependency_audit() -> None:
    plan = classify(["frontend/package-lock.json"])
    assert plan["frontend"] is True
    assert plan["frontend_dependencies"] is True
    assert plan["backend_dependencies"] is False


def test_api_contract_change_runs_backend_and_mcp() -> None:
    plan = classify(["backend/app/api/routes/customers.py"])
    assert plan["backend"] is True
    assert plan["mcp"] is True
    assert plan["postgres"] is False
    assert plan["deploy_api"] is True


def test_database_change_runs_backend_and_both_postgres_gates() -> None:
    plan = classify(["database/canonical/domains/customer.sql"])
    assert plan["backend"] is True
    assert plan["postgres"] is True
    assert plan["frontend"] is False
    assert plan["release_required"] is True
    assert plan["deploy_api"] is False


def test_mcp_runtime_change_does_not_run_frontend_or_postgres() -> None:
    plan = classify(["backend/mcp_runtime/aasopharma_mcp/server.py"])
    assert plan["backend"] is True
    assert plan["mcp"] is True
    assert plan["frontend"] is False
    assert plan["postgres"] is False
    assert plan["deploy_mcp"] is True
    assert plan["deploy_api"] is False


def test_test_only_backend_change_never_deploys_api() -> None:
    plan = classify(["backend/tests/unit/test_customer.py"])
    assert plan["backend"] is True
    assert plan["deploy_api"] is False


def test_workflow_change_runs_every_lane() -> None:
    plan = classify([".github/workflows/production-readiness.yml"])
    for area in (
        "backend",
        "frontend",
        "mcp",
        "postgres",
        "backend_dependencies",
        "frontend_dependencies",
    ):
        assert plan[area] is True
    assert plan["release_required"] is True
    assert plan["deploy_any"] is False


def test_release_runs_every_lane_even_without_a_diff() -> None:
    assert classify([], release=True) == {area: True for area in AREAS}
