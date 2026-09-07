#!/usr/bin/env python3
"""Compile and migrate a MARG export with one resumable operator command.

Private source rows travel directly to the selected ERP service over SSH. They
are never committed to GitHub or included in command arguments and logs.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from uuid import UUID

import httpx

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from scripts.apply_reviewed_historical_inventory import _migration_requests, _source_tax_variants


def _run(arguments, *, stdin=None):
    completed = subprocess.run(arguments, input=stdin, text=True, capture_output=True)
    if completed.returncode:
        # Provider/database diagnostics can contain credentials or imported rows.
        raise RuntimeError(f"{Path(arguments[0]).name} failed (exit {completed.returncode}); the same package can be resumed")
    return completed.stdout.strip()


def _read_json(file_path):
    value = json.loads(file_path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{file_path.name} must contain a JSON object")
    return value


def compile_package(args, target):
    output = args.output.resolve()
    bundle_path = output / "migration-bundle.json"
    if bundle_path.is_file():
        bundle = _read_json(bundle_path)
        profile_hash = hashlib.sha256(args.profile.read_bytes()).hexdigest()
        if bundle.get("summary", {}).get("source_profile_sha256") != profile_hash:
            raise ValueError("Source profile changed; use a new output directory for a new import")
        if bundle.get("opening_date") != target["opening_date"]:
            raise ValueError("Opening date changed; resume with the original target profile")
        return bundle
    compiler = args.source_repo / "migration-work/tools/compile_migration.py"
    if not compiler.is_file():
        raise ValueError("The source repository needs the reviewed compile_migration.py extractor")
    command = [sys.executable, str(compiler), "--profile", str(args.profile.resolve()),
               "--erp-root", str(ROOT), "--output", str(output)]
    for field in ("organization_id", "branch_id", "location_id", "dataset_id", "opening_date"):
        command += ["--" + field.replace("_", "-"), str(target[field])]
    # This choice is explicit in the reusable target profile, never inferred.
    command += ["--default-product-kind", target["default_product_kind"]]
    _run(command)
    return _read_json(bundle_path)


def acquire_profile(args):
    """Automatically snapshot/discover/decode supported MARG report exports."""
    if args.profile is not None:
        return args.profile
    capture = args.output.parent / (args.output.name + "-capture")
    profile = capture / "evidence-profile.json"
    if profile.is_file():
        return profile
    if capture.exists():
        raise ValueError("Capture is incomplete; inspect acquisition-status.json and use a new output for fresh exports")
    script = args.source_repo / "migration-work/agent/acquire_marg.py"
    if not script.is_file():
        raise ValueError("The source repository needs the reviewed acquire_marg.py collector")
    command = [sys.executable, str(script), "--output", str(capture.resolve())]
    for directory in args.source:
        command += ["--source", str(directory.resolve())]
    result = subprocess.run(command, text=True, capture_output=True)
    if result.returncode or not profile.is_file():
        status_path = capture / "acquisition-status.json"
        if status_path.is_file():
            status = _read_json(status_path)
            print(json.dumps({"acquisition_status": str(status_path),
                              "missing_exports": status.get("missing_exports", []),
                              "ambiguous_exports": status.get("ambiguous_exports", [])}), flush=True)
        raise ValueError("MARG exports are incomplete; connect to MARG and generate the missing reports")
    return profile


def _instance_id(status, provider):
    candidates = set()
    for edge in status.get("environments", {}).get("edges", []):
        environment = edge["node"]
        if environment["id"] != provider["environment_id"]:
            continue
        for service_edge in environment.get("serviceInstances", {}).get("edges", []):
            service = service_edge["node"]
            if service.get("serviceName") != provider["services"]["api"]["name"]:
                continue
            for deployment in service.get("activeDeployments", []):
                for instance in deployment.get("instances", []):
                    if instance.get("status") == "RUNNING":
                        candidates.add(instance["id"])
    if len(candidates) != 1:
        raise ValueError("Wait for the API deployment to settle before starting migration")
    return candidates.pop()


def apply_package(bundle, target, provider, supabase, password, expected_sha):
    command_base = ["railway", "ssh", "--project", provider["project_id"],
                    "--environment", provider["environment_id"],
                    "--service", provider["services"]["api"]["name"]]
    status = json.loads(_run(["railway", "status", "--project", provider["project_id"],
                             "--environment", provider["environment_id"], "--json"]))
    command_base += ["--deployment-instance", _instance_id(status, provider)]
    request = {
        "action": "migrate", "expected_sha": expected_sha,
        "project_ref": supabase["project_ref"],
        "production_project_refs": target.get("production_project_refs", ""),
        "password": password, "user_id": target["user_id"],
        **{field: bundle[field] for field in ("organization_id", "branch_id", "location_id", "dataset_id")},
        "confirmation": f"APPLY-REVIEWED-HISTORICAL-INVENTORY:{bundle['organization_id']}:{bundle['dataset_id']}",
        "migration_bundle": bundle,
    }
    # Temporary SSH access is removed even when a database chunk fails.
    with tempfile.TemporaryDirectory(prefix="aaso-migration-ssh-") as key_directory:
        key = str(Path(key_directory) / "key")
        _run(["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", key])
        fingerprint = _run(["ssh-keygen", "-E", "sha256", "-lf", key + ".pub"]).split()[1]
        registered = False
        try:
            _run(["railway", "ssh", "keys", "add", "--key", fingerprint, "--name", "marg-migration"])
            registered = True
            output = _run(command_base + ["--identity-file", key, "--", "python",
                          "/app/scripts/apply_reviewed_historical_inventory.py"],
                          stdin=json.dumps(request))
            receipts = []
            for line in output.splitlines():
                try:
                    candidate = json.loads(line)
                except ValueError:
                    continue
                if isinstance(candidate, dict) and candidate.get("action") == "migrate":
                    receipts.append(candidate)
            if len(receipts) != 1:
                raise ValueError("The migration did not return one completion receipt; rerun the same package")
            receipt = receipts[0]
            if (receipt.get("status") != "ok" or receipt.get("commit_sha") != expected_sha
                or receipt.get("organization_id") != bundle["organization_id"]
                or receipt.get("dataset_id") != bundle["dataset_id"]
                or receipt.get("operation", {}).get("complete") is not True):
                raise ValueError("The migration completion receipt does not match this package")
            return receipt
        finally:
            if registered:
                _run(["railway", "ssh", "keys", "remove", fingerprint])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-repo", type=Path, required=True)
    inputs = parser.add_mutually_exclusive_group(required=True)
    inputs.add_argument("--profile", type=Path)
    inputs.add_argument("--source", type=Path, action="append", help="MARG data/export folder; may be repeated")
    parser.add_argument("--target", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--apply", action="store_true", help="Apply the displayed target; otherwise prepare only")
    args = parser.parse_args()
    args.profile = acquire_profile(args)
    target = _read_json(args.target)
    for field in ("organization_id", "branch_id", "location_id", "user_id"):
        target[field] = str(UUID(target[field]))
    bundle = compile_package(args, target)
    requests = _migration_requests({
        **target, "branch_id": UUID(target["branch_id"]), "migration_bundle": bundle,
    })
    package_hash = hashlib.sha256(json.dumps(bundle, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    plan = {"organization_id": target["organization_id"], "dataset_id": target["dataset_id"],
            "records": sum(len(request.facts) for request in requests),
            "summary": bundle.get("summary", {}), "exclusions": bundle.get("exclusions", {}),
            "package_sha256": package_hash, "mixed_source_rates": _source_tax_variants(requests)}
    # This file contains counts and target identities, never credentials.
    (args.output / "migration-plan.json").write_text(json.dumps(plan, indent=2) + "\n", encoding="utf-8")
    print(f"Prepared {plan['records']} records for organization {target['organization_id']}", flush=True)
    if not args.apply:
        print("Review migration-plan.json, then rerun the same command with --apply.")
        return 0
    prior_receipt_path = args.output / "migration-receipt.json"
    if prior_receipt_path.is_file():
        prior = _read_json(prior_receipt_path)
        if prior.get("package_sha256") != package_hash:
            raise ValueError("Completed package has changed; restore the original bundle before retrying")
    manifest = _read_json(ROOT / "deploy/control-plane/canonical-staging.json")
    if manifest["deployment"]["selected_provider"] != "railway":
        raise ValueError("The selected deployment provider is not Railway")
    provider = manifest["providers"]["railway"]
    password = os.getenv("SUPABASE_DB_PASSWORD", "")
    if not password:
        raise ValueError("Set the operator SUPABASE_DB_PASSWORD credential before applying")
    with httpx.Client(timeout=30) as client:
        origin = provider["services"]["api"]["origin"]
        health = client.get(origin + "/health")
        health.raise_for_status()
        ready = client.get(origin + "/ready")
        ready.raise_for_status()
        if ready.json().get("status") != "ready":
            raise ValueError("The ERP is not ready for migration")
    deployed_sha = health.json()["git_commit"]
    checked_out_sha = _run(["git", "-C", str(ROOT), "rev-parse", "HEAD"])
    if deployed_sha != checked_out_sha:
        raise ValueError("Use the deployed version of this tool before importing")
    print("Applying source batches and reconciling balances and stock. Interrupted runs can resume with this package.", flush=True)
    receipt = apply_package(bundle, target, provider, manifest["supabase"], password, deployed_sha)
    receipt["package_sha256"] = package_hash
    (args.output / "migration-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print("Migration reconciled. See migration-receipt.json for counts, balances, stock and exclusions.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, KeyError, RuntimeError, OSError, httpx.HTTPError) as error:
        # Pydantic and SQL errors can embed private source values.
        print(f"Migration stopped ({type(error).__name__}). Completed batches are retained; rerun the same package after resolving the failure.", file=sys.stderr)
        raise SystemExit(2)
