from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
CANONICAL_ROOT = REPOSITORY_ROOT / "database/canonical"
FUNCTION_DECLARATION = re.compile(
    r'^\s*CREATE(?: OR REPLACE)? FUNCTION\s+'
    r'(?:"(?P<quoted_schema>[^"]+)"|(?P<schema>[a-z_][a-z0-9_]*))\.'
    r'(?:"(?P<quoted_function>[^"]+)"|(?P<function>[a-z_][a-z0-9_]*))'
    r'\((?P<arguments>.*?)\)\s*(?:RETURNS|LANGUAGE)',
    re.DOTALL | re.IGNORECASE | re.MULTILINE,
)


def _function_sources():
    owners = defaultdict(list)

    def add_declarations(source: str, owner: Path) -> None:
        for match in FUNCTION_DECLARATION.finditer(source):
            signature = (
                match.group("quoted_schema") or match.group("schema"),
                match.group("quoted_function") or match.group("function"),
                " ".join(match.group("arguments").split()),
            )
            owners[signature].append(owner)

    for artifact in sorted(CANONICAL_ROOT.glob("**/baseline-*-enforcements.json")):
        document = json.loads(artifact.read_text(encoding="utf-8"))
        for enforcement in document.get("enforcements", []):
            for statement in enforcement.get("statements", []):
                add_declarations(statement, artifact.relative_to(REPOSITORY_ROOT))
    for operation in sorted((CANONICAL_ROOT / "operations").rglob("*.sql")):
        add_declarations(
            operation.read_text(encoding="utf-8"),
            operation.relative_to(REPOSITORY_ROOT),
        )
    return owners


def test_every_reviewed_function_signature_has_one_source_owner() -> None:
    owners = _function_sources()

    assert len(owners) >= 277
    assert {
        signature: paths for signature, paths in owners.items() if len(paths) != 1
    } == {}


def test_every_enforcement_artifact_has_exactly_one_generator_owner() -> None:
    artifacts = sorted(CANONICAL_ROOT.glob("**/baseline-*-enforcements.json"))

    assert len(artifacts) >= 17
    assert {
        artifact.parent.relative_to(REPOSITORY_ROOT).as_posix(): sorted(
            generator.name for generator in artifact.parent.glob("generate*.py")
        )
        for artifact in artifacts
        if len(list(artifact.parent.glob("generate*.py"))) != 1
    } == {}
