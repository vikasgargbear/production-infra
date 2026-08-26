#!/usr/bin/env python3
"""Generate the reviewed post-baseline master-code authority manifest."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
MIGRATION_SQL = (
    REPO_ROOT / "backend/alembic/sql/20260826_0027_master_code_commands.sql"
)
MANIFEST_PATH = Path(__file__).with_name("master-code-authority.json")


def render() -> str:
    migration_hash = hashlib.sha256(MIGRATION_SQL.read_bytes()).hexdigest()
    contract = {
        "version": 1,
        "authority": "post_baseline_alembic",
        "relation": "core.master_code_sequences",
        "migration_revision": "20260826_0027",
        "migration_sql": "backend/alembic/sql/20260826_0027_master_code_commands.sql",
        "migration_sql_sha256": migration_hash,
        "scope": "organization_global_perpetual",
        "code_kinds": ["customer", "product", "supplier"],
        "reviewed_configuration": ["prefix", "suffix", "padding"],
        "allocation": {
            "strategy": "row_lock_increment_once",
            "idempotency": "core.idempotency_keys",
            "forbidden_strategies": [
                "application_generated",
                "count_plus_one",
                "max_plus_one",
                "random_code",
                "uuid_code",
            ],
        },
        "commands": [
            "erp_master_commands.create_customer",
            "erp_master_commands.create_product_draft",
            "erp_master_commands.create_supplier",
        ],
        "create_privilege_cutover": {
            "revoked_from": ["erp_app", "erp_runtime"],
            "relations": [
                "catalog.products",
                "parties.customer_accounts",
                "parties.supplier_accounts",
            ],
            "legacy_update_privilege": "preserved_with_code_immutability_guard",
            "supersedes": "baseline erp_insert grants at migration head",
        },
        "public_request_code_fields": [],
        "runtime_authority": "execute_typed_commands_only_for_create",
        "retention": {
            "sequence": "permanent",
            "assigned_code": "immutable",
            "reuse": "forbidden",
        },
    }
    return json.dumps(contract, indent=2, sort_keys=True) + "\n"


def generated_artifacts() -> tuple[str]:
    return (render(),)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    rendered = render()
    if args.check:
        if not MANIFEST_PATH.exists() or MANIFEST_PATH.read_text(encoding="utf-8") != rendered:
            raise SystemExit("master-code authority manifest is stale")
        return 0
    MANIFEST_PATH.write_text(rendered, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
