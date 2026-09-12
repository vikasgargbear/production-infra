"""Package the single migrated-sale-rate read owner; never modify older revisions."""
import argparse
import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "database/canonical/operations/automation/migrated_batch_sale_rate.sql"
OUTPUT = ROOT / "backend/alembic/sql/20260913_0078_migrated_sale_rate.sql"


def render():
    return "SET LOCAL ROLE erp_migration_owner;\n\n" + SOURCE.read_text() + "\nRESET ROLE;\n"


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    sql = render()
    if args.check:
        assert OUTPUT.read_text() == sql, "migrated sale-rate package differs from source"
    else:
        OUTPUT.write_text(sql)
    print(hashlib.sha256(sql.encode()).hexdigest())
