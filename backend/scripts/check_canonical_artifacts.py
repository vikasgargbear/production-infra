#!/usr/bin/env python3
"""Check or regenerate every catalog-bound canonical artifact.

The canonical database contract is split into small reviewed generators.  This
orchestrator is the single inventory and execution order for those generators;
it fails when a new generator is added without being registered here.
"""

from __future__ import annotations

import argparse
import importlib.util
import sys
from dataclasses import dataclass
from pathlib import Path
from types import ModuleType
from typing import Sequence


REPO_ROOT = Path(__file__).resolve().parents[2]
CANONICAL_ROOT = REPO_ROOT / "database" / "canonical"


@dataclass(frozen=True)
class GeneratorContract:
    source: str
    outputs: tuple[str, ...]


# Order is significant: later command generators bind to earlier manifests.
CONTRACTS = (
    GeneratorContract(
        "security/generate_security_contract.py",
        ("DEFAULT_SQL_PATH", "DEFAULT_MANIFEST_PATH", "DEFAULT_BASELINE_MAPPING_PATH"),
    ),
    GeneratorContract(
        "platform/generate_platform_contract.py",
        ("DEFAULT_MANIFEST_PATH", "DEFAULT_MAPPING_PATH", "DEFAULT_TRIGGER_PATH"),
    ),
    GeneratorContract(
        "plumbing/generate_plumbing_contract.py",
        ("MAPPING_PATH", "MANIFEST_PATH", "SQL_PATH"),
    ),
    GeneratorContract(
        "invariants/generate_stable_contract.py", ("MAPPING_PATH", "MANIFEST_PATH")
    ),
    GeneratorContract(
        "invariants_trade/generate_trade_contract.py", ("MAPPING_PATH", "MANIFEST_PATH")
    ),
    GeneratorContract(
        "invariants_finance/generate_finance_contract.py", ("MAPPING_PATH", "MANIFEST_PATH")
    ),
    GeneratorContract(
        "invariants_agent/generate_invariants_agent_contract.py",
        ("MAPPING_PATH", "MANIFEST_PATH"),
    ),
    GeneratorContract(
        "calculation_authority/generate_calculation_authority.py",
        ("SQL_PATH", "MANIFEST_PATH", "MAPPING_PATH"),
    ),
    GeneratorContract(
        "commands_core/generate_core_commands_contract.py", ("MAPPING_PATH", "MANIFEST_PATH")
    ),
    GeneratorContract(
        "commands_trade/generate_trade_commands_contract.py", ("MAPPING_PATH", "MANIFEST_PATH")
    ),
    GeneratorContract(
        "commands_trade_v2/generate_trade_posting_contract.py",
        ("MAPPING_PATH", "MANIFEST_PATH"),
    ),
    GeneratorContract(
        "commands_finance/generate_finance_commands.py", ("MAPPING_PATH", "MANIFEST_PATH")
    ),
    GeneratorContract(
        "commands_compliance/generate_compliance_commands.py", ("MAPPING_PATH", "MANIFEST_PATH")
    ),
    GeneratorContract(
        "commands_automation/generate_automation_commands.py", ("MAPPING_PATH", "MANIFEST_PATH")
    ),
    GeneratorContract(
        "commands_regulatory/generate_regulatory_commands.py", ("MAPPING_PATH", "MANIFEST_PATH")
    ),
    GeneratorContract(
        "commands_tax_provider/generate_tax_provider_commands.py",
        ("SQL_PATH", "MANIFEST_PATH", "MAPPING_PATH"),
    ),
    GeneratorContract(
        "commands_commercial/generate_commercial_commands.py", ("MAPPING_PATH", "MANIFEST_PATH")
    ),
    GeneratorContract(
        "master_codes/generate_master_code_contract.py", ("MANIFEST_PATH",)
    ),
    GeneratorContract(
        "session_authority/generate_session_authority.py",
        ("SQL_PATH", "MANIFEST_PATH"),
    ),
)


class ArtifactError(RuntimeError):
    """A generator or checked-in artifact is inconsistent."""


def _registered_sources() -> set[str]:
    return {contract.source for contract in CONTRACTS}


def _discovered_sources() -> set[str]:
    return {
        path.relative_to(CANONICAL_ROOT).as_posix()
        for path in CANONICAL_ROOT.glob("**/generate_*.py")
    }


def validate_inventory() -> None:
    registered = _registered_sources()
    discovered = _discovered_sources()
    if registered != discovered:
        missing = sorted(discovered - registered)
        stale = sorted(registered - discovered)
        raise ArtifactError(
            f"canonical generator inventory drift: unregistered={missing}, missing={stale}"
        )


def _load_module(contract: GeneratorContract, index: int) -> ModuleType:
    source = CANONICAL_ROOT / contract.source
    name = f"canonical_artifact_generator_{index}"
    spec = importlib.util.spec_from_file_location(name, source)
    if spec is None or spec.loader is None:
        raise ArtifactError(f"cannot import canonical generator: {contract.source}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    try:
        spec.loader.exec_module(module)
    except Exception as exc:
        raise ArtifactError(f"canonical generator failed: {contract.source}: {exc}") from exc
    return module


def _generated_outputs(
    contract: GeneratorContract, module: ModuleType
) -> tuple[tuple[Path, str], ...]:
    generator = getattr(module, "generated_artifacts", None)
    if not callable(generator):
        raise ArtifactError(f"generator lacks generated_artifacts(): {contract.source}")
    values = generator()
    if not isinstance(values, tuple) or len(values) != len(contract.outputs):
        raise ArtifactError(
            f"generator output contract drift: {contract.source}: "
            f"expected {len(contract.outputs)}, got {len(values) if isinstance(values, tuple) else 'non-tuple'}"
        )

    outputs: list[tuple[Path, str]] = []
    for path_attribute, value in zip(contract.outputs, values):
        path = getattr(module, path_attribute, None)
        if not isinstance(path, Path) or not isinstance(value, str):
            raise ArtifactError(
                f"invalid generated output {path_attribute}: {contract.source}"
            )
        try:
            path.resolve().relative_to(CANONICAL_ROOT.resolve())
        except ValueError as exc:
            raise ArtifactError(f"generator writes outside canonical root: {path}") from exc
        outputs.append((path, value))
    return tuple(outputs)


def run(*, write: bool) -> list[str]:
    validate_inventory()
    drift: list[str] = []
    for index, contract in enumerate(CONTRACTS):
        module = _load_module(contract, index)
        try:
            outputs = _generated_outputs(contract, module)
        except Exception as exc:
            if isinstance(exc, ArtifactError):
                raise
            raise ArtifactError(
                f"canonical generator failed: {contract.source}: {exc}"
            ) from exc
        for path, generated in outputs:
            checked_in = path.read_text(encoding="utf-8") if path.exists() else None
            if checked_in == generated:
                continue
            relative = path.relative_to(REPO_ROOT).as_posix()
            if write:
                path.write_text(generated, encoding="utf-8")
            else:
                drift.append(relative)
    return drift


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--write",
        action="store_true",
        help="regenerate registered artifacts in dependency order",
    )
    args = parser.parse_args(argv)
    try:
        drift = run(write=args.write)
    except ArtifactError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    if drift:
        print("canonical generated artifacts are stale:", file=sys.stderr)
        for path in drift:
            print(f"- {path}", file=sys.stderr)
        print("run backend/scripts/check_canonical_artifacts.py --write", file=sys.stderr)
        return 1
    print(
        f"canonical artifacts: OK ({len(CONTRACTS)} generators, "
        f"{'regenerated' if args.write else 'checked'})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
