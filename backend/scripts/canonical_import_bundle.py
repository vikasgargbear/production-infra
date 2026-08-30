#!/usr/bin/env python3
"""Validate, plan, and apply one reviewed canonical import bundle."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from migration_support.canonical_import import (  # noqa: E402
    CanonicalImportClient,
    CanonicalImportError,
    apply_bundle,
    audit_candidate_manifest,
    build_plan,
    load_import_bundle,
    verify_plan,
)


def _write_json(path: Path, value: dict) -> None:
    with path.open("x", encoding="utf-8") as stream:
        stream.write(json.dumps(value, sort_keys=True, indent=2) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)

    audit = subparsers.add_parser("audit-candidates")
    audit.add_argument("--manifest", type=Path, required=True)

    plan_parser = subparsers.add_parser("plan")
    plan_parser.add_argument("--bundle", type=Path, required=True)
    plan_parser.add_argument("--out", type=Path, required=True)

    preflight_parser = subparsers.add_parser("preflight")
    preflight_parser.add_argument("--bundle", type=Path, required=True)
    preflight_parser.add_argument("--plan", type=Path, required=True)
    preflight_parser.add_argument("--api-origin", required=True)
    preflight_parser.add_argument("--token-env", default="ERP_IMPORT_ACCESS_TOKEN")

    apply_parser = subparsers.add_parser("apply")
    apply_parser.add_argument("--bundle", type=Path, required=True)
    apply_parser.add_argument("--plan", type=Path, required=True)
    apply_parser.add_argument("--receipt", type=Path, required=True)
    apply_parser.add_argument("--api-origin", required=True)
    apply_parser.add_argument("--confirmation", required=True)
    apply_parser.add_argument("--token-env", default="ERP_IMPORT_ACCESS_TOKEN")

    args = parser.parse_args()
    try:
        if args.command == "audit-candidates":
            result = audit_candidate_manifest(args.manifest)
            print(json.dumps(result, sort_keys=True, indent=2))
            return 0 if result["apply_allowed"] else 2
        bundle = load_import_bundle(args.bundle)
        if args.command == "plan":
            plan = build_plan(bundle)
            _write_json(args.out, plan)
            print(json.dumps(plan, sort_keys=True, indent=2))
            return 0
        plan = json.loads(args.plan.read_text(encoding="utf-8"))
        token = os.getenv(args.token_env, "")
        client = CanonicalImportClient(args.api_origin, token)
        try:
            if args.command == "preflight":
                verify_plan(plan, bundle)
                result = client.verify_boundary(bundle.target_organization_id)
                print(json.dumps(result, sort_keys=True, indent=2))
                return 0
            receipt = apply_bundle(
                bundle,
                plan,
                client,
                confirmation=args.confirmation,
                receipt_path=args.receipt,
            )
        finally:
            client.close()
        print(json.dumps(receipt, sort_keys=True, indent=2))
        return 0
    except (CanonicalImportError, OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"canonical import refused: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
