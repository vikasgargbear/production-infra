import hashlib
import json
from pathlib import Path

import pytest

from scripts import generate_canonical_baseline as generator


REPO_ROOT = Path(__file__).resolve().parents[3]
CATALOG_ROOT = REPO_ROOT / "database" / "canonical" / "domains"
CANONICAL_ROOT = REPO_ROOT / "database" / "canonical"


@pytest.fixture(scope="module")
def catalog():
    return generator.load_and_validate_catalog(CATALOG_ROOT)


@pytest.fixture(scope="module")
def draft(catalog):
    return generator.generate_baseline(catalog, allow_draft=True)


def test_generation_validates_the_complete_authoritative_catalog(catalog) -> None:
    assert len(catalog.tables) == catalog.contract["table_count"]
    assert {table["name"] for table in catalog.tables} == {
        name
        for tables in catalog.authority["canonical_tables"].values()
        for name in tables
    }


def test_enforcement_root_discovers_every_checked_in_fragment() -> None:
    expected = tuple(
        sorted(CANONICAL_ROOT.glob("**/baseline-*-enforcements.json"))
    )

    assert expected
    assert generator._discover_enforcement_mapping_paths(CANONICAL_ROOT) == expected
    relative_paths = {path.relative_to(CANONICAL_ROOT).as_posix() for path in expected}
    assert {
        "commands_finance/baseline-finance-command-enforcements.json",
        "commands_trade/baseline-trade-command-enforcements.json",
        "invariants/baseline-stable-enforcements.json",
        "invariants_agent/baseline-invariants-agent-enforcements.json",
        "invariants_finance/baseline-finance-enforcements.json",
        "invariants_trade/baseline-trade-enforcements.json",
        "platform/baseline-platform-enforcements.json",
        "plumbing/baseline-plumbing-enforcements.json",
        "security/baseline-platform-enforcements.json",
    } <= relative_paths


def test_enforcement_root_discovery_is_fail_closed(tmp_path: Path) -> None:
    with pytest.raises(generator.GenerationError, match="no baseline-.* files"):
        generator._discover_enforcement_mapping_paths(tmp_path)
    with pytest.raises(generator.GenerationError, match="is not a directory"):
        generator._discover_enforcement_mapping_paths(tmp_path / "missing")


def test_default_generation_refuses_every_unreviewed_deployment_category(catalog) -> None:
    invariant_count = sum(
        len(table.get("cross_row_invariants", [])) for table in catalog.tables
    )
    platform_count = len(catalog.tables) + 23
    expected_total = invariant_count + platform_count
    with pytest.raises(
        generator.GenerationError,
        match=rf"{expected_total} baseline requirements",
    ) as error:
        generator.generate_baseline(catalog)

    message = str(error.value)
    for expected in (
        f"cross_row_invariant={invariant_count}",
        "global_reference_seed=2",
        "preflight=13",
        "rls_helper=1",
        f"rls_policy={len(catalog.tables)}",
        "roles_grants=4",
        "trigger_plumbing=3",
    ):
        assert expected in message


def test_draft_is_mechanically_non_deployable_and_has_complete_blockers(
    catalog, draft
) -> None:
    expected_keys = sorted(
        f"{table['name']}:{invariant['name']}"
        for table in catalog.tables
        for invariant in table.get("cross_row_invariants", [])
    )

    assert draft.deployable is False
    assert "-- NON-DEPLOYABLE DRAFT" in draft.sql
    assert "RAISE EXCEPTION 'NON-DEPLOYABLE canonical baseline draft'" in draft.sql
    invariant_blockers = [
        blocker
        for blocker in draft.blockers
        if blocker["category"] == "cross_row_invariant"
    ]
    assert [blocker["key"] for blocker in invariant_blockers] == expected_keys
    assert all(blocker["requirement"].strip() for blocker in draft.blockers)


def test_platform_blockers_are_derived_from_catalog_scope(catalog, draft) -> None:
    counts: dict[str, int] = {}
    for blocker in draft.blockers:
        counts[blocker["category"]] = counts.get(blocker["category"], 0) + 1

    invariant_count = sum(
        len(table.get("cross_row_invariants", [])) for table in catalog.tables
    )
    assert counts == {
        "cross_row_invariant": invariant_count,
        "global_reference_seed": 2,
        "preflight": 13,
        "rls_helper": 1,
        "rls_policy": len(catalog.tables),
        "roles_grants": 4,
        "trigger_plumbing": 3,
    }
    rls_policy_keys = {
        blocker["key"]
        for blocker in draft.blockers
        if blocker["category"] == "rls_policy"
    }
    assert rls_policy_keys == {f"rls_policy:{table['name']}" for table in catalog.tables}


def test_reviewed_cross_row_sql_alone_cannot_make_baseline_deployable(catalog) -> None:
    invariant_mapping = {}
    for table in catalog.tables:
        for invariant in table.get("cross_row_invariants", []):
            key = f"{table['name']}:{invariant['name']}"
            invariant_mapping[key] = (
                invariant["enforcement"],
                hashlib.sha256(invariant["rule"].encode()).hexdigest(),
                ("SELECT 1;",),
            )

    result = generator.generate_baseline(
        catalog, enforcement_mapping=invariant_mapping, allow_draft=True
    )

    assert result.deployable is False
    assert len(result.blockers) == len(catalog.tables) + 23
    assert all(blocker["category"] != "cross_row_invariant" for blocker in result.blockers)


def test_structural_sql_is_complete_and_fail_closed(catalog, draft) -> None:
    forced = sum(table["rls"]["force"] is True for table in catalog.tables)

    assert draft.sql.count("CREATE TABLE ") == len(catalog.tables)
    assert draft.sql.count(" ENABLE ROW LEVEL SECURITY;") == len(catalog.tables)
    assert draft.sql.count(" FORCE ROW LEVEL SECURITY;") == forced
    assert "IF NOT EXISTS" not in draft.sql
    assert 'CREATE TABLE "public".' not in draft.sql
    assert 'CREATE SCHEMA "auth";' not in draft.sql
    assert 'CREATE SCHEMA "core";\nCREATE SCHEMA "parties";\nCREATE SCHEMA "catalog";' in draft.sql


def test_constraints_foreign_keys_and_indexes_preserve_catalog_semantics(
    catalog, draft
) -> None:
    unconditional = next(
        (table, unique)
        for table in catalog.tables
        for unique in table["uniques"]
        if unique["where"] is None
    )
    partial = next(
        (table, unique)
        for table in catalog.tables
        for unique in table["uniques"]
        if unique["where"] is not None
    )
    deferred = next(
        (table, foreign_key)
        for table in catalog.tables
        for foreign_key in table["foreign_keys"]
        if foreign_key["deferrable"] == "INITIALLY_DEFERRED"
    )
    checked = next(
        (table, check)
        for table in catalog.tables
        for check in table["checks"]
    )

    assert f'ADD CONSTRAINT "{unconditional[1]["name"]}" UNIQUE' in draft.sql
    assert f'CREATE UNIQUE INDEX "{partial[1]["name"]}"' in draft.sql
    assert f'WHERE {partial[1]["where"]};' in draft.sql
    deferred_line = next(
        line
        for line in draft.sql.splitlines()
        if f'ADD CONSTRAINT "{deferred[1]["name"]}" FOREIGN KEY' in line
    )
    assert deferred_line.endswith("DEFERRABLE INITIALLY DEFERRED;")
    assert (
        f'ADD CONSTRAINT "{checked[1]["name"]}" CHECK '
        f'({checked[1]["expression"]});'
    ) in draft.sql


def test_dependency_order_is_parent_first_and_stable() -> None:
    tables = [
        {"name": "erp.child", "foreign_keys": [{"references": "erp.parent"}]},
        {"name": "erp.unrelated", "foreign_keys": []},
        {"name": "erp.parent", "foreign_keys": []},
    ]

    first = generator._dependency_order(tables)
    second = generator._dependency_order(list(reversed(tables)))

    assert first == second
    assert first.index("erp.parent") < first.index("erp.child")


def test_dependency_order_handles_fk_cycles_deterministically() -> None:
    tables = [
        {"name": "erp.a", "foreign_keys": [{"references": "erp.b"}]},
        {"name": "erp.b", "foreign_keys": [{"references": "erp.a"}]},
        {"name": "erp.c", "foreign_keys": [{"references": "erp.a"}]},
    ]

    assert generator._dependency_order(tables) == ("erp.a", "erp.b", "erp.c")


def test_invariant_owned_roles_are_provisioned_before_dependent_grants() -> None:
    roles, remaining = generator._partition_auxiliary_roles(
        (
            (
                "automation.command_requests:guard",
                ('GRANT USAGE ON SCHEMA "erp" TO "erp_calculator";',),
            ),
            (
                "calculation.artifacts:authority",
                (
                    'CREATE ROLE "erp_calculator" LOGIN NOSUPERUSER;',
                    'REVOKE "erp_app" FROM "erp_calculator";',
                ),
            ),
        )
    )

    assert roles == ('CREATE ROLE "erp_calculator" LOGIN NOSUPERUSER;',)
    assert remaining == (
        (
            "automation.command_requests:guard",
            ('GRANT USAGE ON SCHEMA "erp" TO "erp_calculator";',),
        ),
        (
            "calculation.artifacts:authority",
            ('REVOKE "erp_app" FROM "erp_calculator";',),
        ),
    )


def test_mapping_must_match_invariant_method_and_exact_requirement_text(catalog) -> None:
    table = next(table for table in catalog.tables if table.get("cross_row_invariants"))
    invariant = table["cross_row_invariants"][0]
    key = f"{table['name']}:{invariant['name']}"
    requirement_hash = hashlib.sha256(invariant["rule"].encode("utf-8")).hexdigest()

    with pytest.raises(generator.GenerationError, match="method does not match"):
        generator._resolve_invariants(
            catalog.tables,
            {key: ("wrong_method", requirement_hash, ("SELECT 1;",))},
        )
    with pytest.raises(generator.GenerationError, match="different invariant text"):
        generator._resolve_invariants(
            catalog.tables,
            {key: (invariant["enforcement"], "0" * 64, ("SELECT 1;",))},
        )


def test_blocker_manifest_binds_to_generated_sql(catalog, draft) -> None:
    manifest = generator.blocker_manifest(draft, catalog)
    invariant_count = sum(
        len(table.get("cross_row_invariants", [])) for table in catalog.tables
    )

    assert manifest["deployable"] is False
    assert manifest["catalog_table_count"] == len(catalog.tables)
    assert manifest["unresolved_blocker_count"] == len(draft.blockers) == invariant_count + len(catalog.tables) + 23
    assert manifest["unresolved_invariant_count"] == invariant_count
    assert manifest["unresolved_blocker_counts_by_category"]["rls_policy"] == len(catalog.tables)
    assert manifest["sql_sha256"] == hashlib.sha256(draft.sql.encode()).hexdigest()


def test_check_mode_detects_drift_without_rewriting_file(
    catalog, draft, tmp_path
) -> None:
    target = tmp_path / "canonical.sql"
    target.write_text(draft.sql, encoding="utf-8")

    command = ["--catalog-root", str(CATALOG_ROOT), "--draft", "--check", str(target)]
    assert generator.main(command) == 0
    target.write_text(draft.sql + "-- drift\n", encoding="utf-8")
    assert generator.main(command) == 1


def test_output_mode_writes_default_blocker_manifest(tmp_path) -> None:
    output = tmp_path / "canonical.sql"

    assert generator.main(
        ["--catalog-root", str(CATALOG_ROOT), "--draft", "--output", str(output)]
    ) == 0
    manifest_path = output.with_name(output.name + ".blockers.json")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    assert output.exists()
    assert manifest["deployable"] is False
    assert manifest["unresolved_blocker_count"] == (
        manifest["unresolved_invariant_count"]
        + manifest["catalog_table_count"]
        + 23
    )
