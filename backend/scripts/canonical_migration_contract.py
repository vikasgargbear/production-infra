#!/usr/bin/env python3
"""Derive and validate the canonical Alembic deployment contract from source."""

from __future__ import annotations

import argparse
import ast
from dataclasses import dataclass
import json
from pathlib import Path
import re


@dataclass(frozen=True)
class SourceLayout:
    backend_root: Path
    data_root: Path


def _source_layout(script_path: Path) -> SourceLayout:
    backend_root = script_path.resolve().parent.parent
    checkout_root = backend_root.parent
    checkout_authority = checkout_root / "database/schema-authority.json"
    packaged_authority = backend_root / "database/schema-authority.json"
    if checkout_authority.is_file():
        data_root = checkout_root
    elif packaged_authority.is_file():
        data_root = backend_root
    else:
        data_root = checkout_root
    return SourceLayout(backend_root=backend_root, data_root=data_root)


SOURCE_LAYOUT = _source_layout(Path(__file__))
BACKEND_ROOT = SOURCE_LAYOUT.backend_root
REPOSITORY_ROOT = SOURCE_LAYOUT.data_root
VERSIONS_ROOT = BACKEND_ROOT / "alembic/versions"
SQL_ROOT = BACKEND_ROOT / "alembic/sql"
AUTHORITY_PATH = REPOSITORY_ROOT / "database/schema-authority.json"
DOMAIN_CONTRACT_PATH = REPOSITORY_ROOT / "database/canonical/domains/_contract.json"


class CanonicalMigrationContractError(RuntimeError):
    """Raised when the checked-in migration authority is ambiguous or incomplete."""


@dataclass(frozen=True)
class Revision:
    revision: str
    down_revision: str | None
    path: Path


@dataclass(frozen=True)
class MigrationContract:
    revisions: tuple[Revision, ...]
    head: str
    canonical_table_count: int
    required_files: tuple[str, ...]


def _literal_assignment(tree: ast.Module, name: str):
    for node in tree.body:
        if isinstance(node, (ast.Assign, ast.AnnAssign)):
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            if any(isinstance(target, ast.Name) and target.id == name for target in targets):
                return ast.literal_eval(node.value)
    raise CanonicalMigrationContractError(f"migration omits {name}")


def _revision(path: Path) -> Revision:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    revision = _literal_assignment(tree, "revision")
    down_revision = _literal_assignment(tree, "down_revision")
    if not isinstance(revision, str) or not revision:
        raise CanonicalMigrationContractError(f"{path.name}: revision must be text")
    if down_revision is not None and not isinstance(down_revision, str):
        raise CanonicalMigrationContractError(
            f"{path.name}: canonical history must be a single linear chain"
        )
    return Revision(revision=revision, down_revision=down_revision, path=path)


def _linear_revisions() -> tuple[Revision, ...]:
    revisions = tuple(
        _revision(path)
        for path in sorted(VERSIONS_ROOT.glob("*.py"))
        if path.name != "__init__.py"
    )
    by_id = {item.revision: item for item in revisions}
    if len(by_id) != len(revisions) or not revisions:
        raise CanonicalMigrationContractError("canonical revisions are empty or duplicated")
    roots = [item for item in revisions if item.down_revision is None]
    if len(roots) != 1:
        raise CanonicalMigrationContractError("canonical history must have exactly one root")
    children: dict[str, list[Revision]] = {}
    for item in revisions:
        if item.down_revision is None:
            continue
        if item.down_revision not in by_id:
            raise CanonicalMigrationContractError(
                f"{item.revision}: unknown parent {item.down_revision}"
            )
        children.setdefault(item.down_revision, []).append(item)
    if any(len(items) != 1 for items in children.values()):
        raise CanonicalMigrationContractError("canonical history must not branch")

    ordered = [roots[0]]
    while ordered[-1].revision in children:
        ordered.append(children[ordered[-1].revision][0])
    if len(ordered) != len(revisions):
        raise CanonicalMigrationContractError("canonical history is disconnected or cyclic")
    return tuple(ordered)


def _required_files(revisions: tuple[Revision, ...]) -> tuple[str, ...]:
    required: list[Path] = []
    for item in revisions:
        required.append(item.path)
        sql_matches = sorted(SQL_ROOT.glob(f"{item.revision}_*.sql"))
        if len(sql_matches) != 1:
            raise CanonicalMigrationContractError(
                f"{item.revision}: expected exactly one hash-bound SQL source"
            )
        required.extend(sql_matches)
        manifest = sql_matches[0].with_suffix(".manifest.json")
        if manifest.exists():
            required.append(manifest)
    return tuple(
        (Path("backend") / path.relative_to(BACKEND_ROOT)).as_posix()
        for path in required
    )


def _canonical_table_count(revisions: tuple[Revision, ...]) -> int:
    domain_contract = json.loads(DOMAIN_CONTRACT_PATH.read_text(encoding="utf-8"))
    schemas = {Path(name).stem for name in domain_contract["domain_files"]}
    create_table = re.compile(
        r'(?im)^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?'
        r'"?(?P<schema>[a-z_][a-z0-9_]*)"?\."?(?P<table>[a-z_][a-z0-9_]*)"?'
    )
    tables: set[str] = set()
    for item in revisions:
        sql_path = next(iter(sorted(SQL_ROOT.glob(f"{item.revision}_*.sql"))))
        for match in create_table.finditer(sql_path.read_text(encoding="utf-8")):
            if match.group("schema") in schemas:
                tables.add(f'{match.group("schema")}.{match.group("table")}')
    if len(tables) < int(domain_contract["table_count"]):
        raise CanonicalMigrationContractError(
            "migration chain creates fewer canonical tables than the reviewed domain contract"
        )
    return len(tables)


def load_contract() -> MigrationContract:
    revisions = _linear_revisions()
    required_files = _required_files(revisions)
    authority = json.loads(AUTHORITY_PATH.read_text(encoding="utf-8"))
    declared = set(authority.get("required_migration_files", []))
    missing = sorted(set(required_files) - declared)
    if missing:
        raise CanonicalMigrationContractError(
            "schema authority omits canonical migration files: " + ", ".join(missing)
        )
    return MigrationContract(
        revisions=revisions,
        head=revisions[-1].revision,
        canonical_table_count=_canonical_table_count(revisions),
        required_files=required_files,
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    output = parser.add_mutually_exclusive_group()
    output.add_argument("--print-head", action="store_true")
    output.add_argument("--print-table-count", action="store_true")
    output.add_argument("--json", action="store_true")
    args = parser.parse_args()
    contract = load_contract()
    if args.print_head:
        print(contract.head)
    elif args.print_table_count:
        print(contract.canonical_table_count)
    elif args.json:
        print(json.dumps({
            "head": contract.head,
            "canonical_table_count": contract.canonical_table_count,
            "revision_count": len(contract.revisions),
            "required_files": contract.required_files,
        }, indent=2))
    else:
        print(
            "canonical migration contract: "
            f"head={contract.head} revisions={len(contract.revisions)} "
            f"canonical_tables={contract.canonical_table_count}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
