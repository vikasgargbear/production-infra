from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
CANONICAL_ROOT = REPOSITORY_ROOT / "database/canonical"
FUNCTION_DECLARATION = re.compile(
    r'^CREATE(?: OR REPLACE)? FUNCTION\s+"([^"]+)"\."([^"]+)"\((.*?)\)',
    re.DOTALL,
)


def _function_sources():
    owners = defaultdict(list)
    for artifact in sorted(CANONICAL_ROOT.glob("**/baseline-*-enforcements.json")):
        document = json.loads(artifact.read_text(encoding="utf-8"))
        for enforcement in document.get("enforcements", []):
            for statement in enforcement.get("statements", []):
                match = FUNCTION_DECLARATION.match(statement)
                if match is None:
                    continue
                signature = (
                    match.group(1),
                    match.group(2),
                    " ".join(match.group(3).split()),
                )
                owners[signature].append(artifact.relative_to(REPOSITORY_ROOT))
    return owners


def test_every_reviewed_function_signature_has_one_source_owner() -> None:
    owners = _function_sources()

    assert len(owners) >= 271
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
