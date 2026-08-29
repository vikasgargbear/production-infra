#!/usr/bin/env python3
"""Render canonical finance-role resolution for party master creation."""

from __future__ import annotations

from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "backend/alembic/sql/20260826_0027_master_code_commands.sql"
OUTPUT = (
    ROOT
    / "backend/alembic/sql/20260829_0057_master_create_account_role_resolution.sql"
)


CUSTOMER_ACCOUNT_SCAN = """  SELECT count(*),(array_agg(account.id ORDER BY account.code,account.id))[1]
    INTO posting_count,receivable_account_id
    FROM finance.accounts account
   WHERE account.org_id=organization_id AND account.account_type='asset'
     AND account.allows_party_posting AND account.status='active'
     AND account.currency_code='INR';
  IF posting_count<>1 THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='exactly one customer receivable posting account is required';
  END IF;"""

SUPPLIER_ACCOUNT_SCAN = """  SELECT count(*),(array_agg(account.id ORDER BY account.code,account.id))[1]
    INTO posting_count,payable_account_id
    FROM finance.accounts account
   WHERE account.org_id=organization_id AND account.account_type='liability'
     AND account.allows_party_posting AND account.status='active'
     AND account.currency_code='INR';
  IF posting_count<>1 THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='exactly one supplier payable posting account is required';
  END IF;"""


def _replace_once(source: str, old: str, new: str) -> str:
    if source.count(old) != 1:
        raise ValueError(f"expected exactly one source occurrence: {old[:80]!r}")
    return source.replace(old, new, 1)


def _function(source: str, name: str, next_name: str) -> str:
    start = source.index(f"CREATE FUNCTION erp_master_commands.{name}(")
    end = source.index(f"\nCREATE FUNCTION erp_master_commands.{next_name}(", start)
    return source[start:end].rstrip().replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION", 1)


def render() -> str:
    baseline = SOURCE.read_text(encoding="utf-8")
    customer = _function(baseline, "create_customer", "create_supplier")
    supplier = _function(baseline, "create_supplier", "create_product_draft")

    customer = _replace_once(
        customer,
        "account_identifier uuid; receivable_account_id uuid; posting_count integer;",
        "account_identifier uuid; receivable_account_id uuid;",
    )
    customer = _replace_once(
        customer,
        CUSTOMER_ACCOUNT_SCAN,
        """  receivable_account_id:=erp_commercial_commands.resolve_role_account(
    organization_id,NULL::uuid,'accounts_receivable','asset','INR',true
  );""",
    )
    supplier = _replace_once(
        supplier,
        "account_identifier uuid; payable_account_id uuid; posting_count integer;",
        "account_identifier uuid; payable_account_id uuid;",
    )
    supplier = _replace_once(
        supplier,
        SUPPLIER_ACCOUNT_SCAN,
        """  payable_account_id:=erp_commercial_commands.resolve_role_account(
    organization_id,NULL::uuid,'accounts_payable','liability','INR',true
  );""",
    )

    return f"""SET LOCAL ROLE erp_migration_owner;

{customer}

{supplier}

ALTER FUNCTION erp_master_commands.create_customer(
  uuid,text,text,text,text,text,text,text,text,text,text,text,text,numeric,integer,bytea,timestamptz
) OWNER TO erp_migration_owner;
ALTER FUNCTION erp_master_commands.create_supplier(
  uuid,text,text,text,text,text,text,text,text,text,text,text,integer,bytea,timestamptz
) OWNER TO erp_migration_owner;

REVOKE ALL ON FUNCTION erp_master_commands.create_customer(
  uuid,text,text,text,text,text,text,text,text,text,text,text,text,numeric,integer,bytea,timestamptz
) FROM PUBLIC,erp_app,erp_runtime;
REVOKE ALL ON FUNCTION erp_master_commands.create_supplier(
  uuid,text,text,text,text,text,text,text,text,text,text,text,integer,bytea,timestamptz
) FROM PUBLIC,erp_app,erp_runtime;
GRANT EXECUTE ON FUNCTION erp_master_commands.create_customer(
  uuid,text,text,text,text,text,text,text,text,text,text,text,text,numeric,integer,bytea,timestamptz
) TO erp_runtime;
GRANT EXECUTE ON FUNCTION erp_master_commands.create_supplier(
  uuid,text,text,text,text,text,text,text,text,text,text,text,integer,bytea,timestamptz
) TO erp_runtime;

RESET ROLE;
"""


if __name__ == "__main__":
    rendered = render()
    if sys.argv[1:] == ["--write"]:
        OUTPUT.write_text(rendered, encoding="utf-8")
    elif sys.argv[1:]:
        raise SystemExit(
            "usage: generate_master_create_account_role_resolution_migration.py [--write]"
        )
    else:
        print(rendered, end="")
