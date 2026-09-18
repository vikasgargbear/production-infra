"""Package reviewed explicit MCP connection consent into its forward migration."""
import argparse
import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "database/canonical/operations/automation/mcp_connection_consent.sql"
OUTPUT = ROOT / "backend/alembic/sql/20260918_0083_mcp_connection_consent.sql"


def render():
    return "SET LOCAL ROLE erp_migration_owner;\n" + SOURCE.read_text() + "\nRESET ROLE;\n"


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    sql = render()
    if args.check:
        assert OUTPUT.read_text() == sql
    else:
        OUTPUT.write_text(sql)
    print(hashlib.sha256(sql.encode()).hexdigest())
