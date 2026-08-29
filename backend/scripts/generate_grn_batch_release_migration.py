#!/usr/bin/env python3
"""Render the canonical posted-GRN batch-release migration."""

from __future__ import annotations

import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[2]
TRADE = ROOT / "database/canonical/commands_trade/baseline-trade-command-enforcements.json"
INVARIANTS = ROOT / "database/canonical/invariants_trade/baseline-trade-enforcements.json"
OUTPUT = ROOT / "backend/alembic/sql/20260829_0059_grn_batch_release.sql"


def _statement(path: Path, prefix: str) -> str:
    artifact = json.loads(path.read_text(encoding="utf-8"))
    matches = [
        statement
        for enforcement in artifact["enforcements"]
        for statement in enforcement["statements"]
        if statement.startswith(prefix)
    ]
    if len(matches) != 1:
        raise RuntimeError(f"expected one reviewed statement for {prefix}")
    return matches[0]


def render() -> str:
    post = _statement(
        TRADE,
        'CREATE FUNCTION "erp_trade_commands"."post_goods_receipt"',
    ).replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION", 1)
    guard = _statement(
        INVARIANTS,
        'CREATE FUNCTION "erp_trade_invariants"."guard_batch"',
    ).replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION", 1)
    return f'''SET LOCAL ROLE erp_migration_owner;

CREATE TABLE erp_trade_commands.command_scopes (
  backend_pid integer NOT NULL,
  transaction_id bigint NOT NULL,
  scope text NOT NULL,
  org_id uuid NOT NULL,
  entity_id uuid NOT NULL,
  PRIMARY KEY (backend_pid,transaction_id,scope,org_id,entity_id)
);
ALTER TABLE erp_trade_commands.command_scopes OWNER TO erp_migration_owner;
REVOKE ALL ON TABLE erp_trade_commands.command_scopes FROM PUBLIC,erp_app,erp_runtime;

{guard};

{post};

ALTER FUNCTION erp_trade_invariants.guard_batch() OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_trade_invariants.guard_batch() FROM PUBLIC,erp_app,erp_runtime;
ALTER FUNCTION erp_trade_commands.post_goods_receipt(
  uuid,uuid,uuid,uuid,bytea,bytea,timestamptz
) OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_trade_commands.post_goods_receipt(
  uuid,uuid,uuid,uuid,bytea,bytea,timestamptz
) FROM PUBLIC,erp_app,erp_runtime;
GRANT EXECUTE ON FUNCTION erp_trade_commands.post_goods_receipt(
  uuid,uuid,uuid,uuid,bytea,bytea,timestamptz
) TO erp_app,erp_runtime;

RESET ROLE;
'''


if __name__ == "__main__":
    rendered = render()
    if sys.argv[1:] == ["--write"]:
        OUTPUT.write_text(rendered, encoding="utf-8")
    elif sys.argv[1:]:
        raise SystemExit("usage: generate_grn_batch_release_migration.py [--write]")
    else:
        print(rendered, end="")
