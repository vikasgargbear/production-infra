#!/usr/bin/env python3
"""Generate the canonical public-session authority role contract."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent
SQL_PATH = ROOT / "session_authority.sql"
MANIFEST_PATH = ROOT / "session-authority.json"


def render_sql() -> str:
    return """-- Canonical public-session authority.
--
-- Command execution and public session admission are deliberately separate:
-- deployment provisioning may use the command boundary without admitting
-- normal browser or MCP sessions.

-- Incremental migrations enter the canonical owner context explicitly.  Role
-- creation is cluster-level administration, so the reviewed migration
-- principal resumes only for that bounded bootstrap below.
SET LOCAL ROLE erp_migration_owner;
RESET ROLE;

DO $session_authority_role$
DECLARE
    existing pg_catalog.pg_roles%ROWTYPE;
BEGIN
    SELECT * INTO existing
      FROM pg_catalog.pg_roles
     WHERE rolname='erp_session_authority';
    IF NOT FOUND THEN
        CREATE ROLE erp_session_authority
          NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
          INHERIT NOBYPASSRLS NOREPLICATION;
    ELSIF existing.rolcanlogin
       OR existing.rolsuper
       OR existing.rolcreatedb
       OR existing.rolcreaterole
       OR NOT existing.rolinherit
       OR existing.rolbypassrls
       OR existing.rolreplication THEN
        RAISE EXCEPTION USING
          ERRCODE='42501',
          MESSAGE='erp_session_authority role posture is invalid';
    END IF;
END
$session_authority_role$;

-- A migration never opens public traffic.  Only the reviewed write-fence
-- transition may grant this role to the runtime login after provisioning.
REVOKE erp_session_authority FROM
  erp_app,
  erp_runtime,
  erp_calculator,
  erp_regulatory_importer,
  erp_tax_provider;

-- Restore and then release the canonical owner context before Alembic returns
-- this connection to its pool.
SET LOCAL ROLE erp_migration_owner;
RESET ROLE;
"""


def render_manifest() -> str:
    return json.dumps(
        {
            "version": 1,
            "role": "erp_session_authority",
            "role_posture": {
                "login": False,
                "superuser": False,
                "create_database": False,
                "create_role": False,
                "inherit": True,
                "bypass_rls": False,
                "replication": False,
            },
            "membership_authority": "backend/scripts/manage_canonical_write_fence.py",
            "public_session_principal": "erp_runtime",
            "migration_default": "closed",
            "states": {
                "closed": {
                    "command_authority": False,
                    "public_session_authority": False,
                },
                "provisioning": {
                    "command_authority": True,
                    "public_session_authority": False,
                },
                "open": {
                    "command_authority": True,
                    "public_session_authority": True,
                },
            },
        },
        indent=2,
        sort_keys=True,
    ) + "\n"


def generated_artifacts() -> tuple[str, str]:
    return render_sql(), render_manifest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    artifacts = ((SQL_PATH, render_sql()), (MANIFEST_PATH, render_manifest()))
    if args.check:
        drift = [
            str(path)
            for path, expected in artifacts
            if not path.is_file()
            or path.read_text(encoding="utf-8") != expected
        ]
        if drift:
            raise SystemExit("session-authority artifacts are stale: " + ", ".join(drift))
        return 0
    for path, content in artifacts:
        path.write_text(content, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
