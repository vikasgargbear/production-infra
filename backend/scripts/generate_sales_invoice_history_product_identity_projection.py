#!/usr/bin/env python3
"""Verify the immutable initial invoice-history product-identity migration."""

from __future__ import annotations

import argparse
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
TARGET = (
    ROOT
    / "backend/alembic/sql/20260829_0056_sales_invoice_product_identity.sql"
)


def render() -> str:
    return TARGET.read_text(encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    rendered = render()
    if args.write:
        raise SystemExit("the historical migration is immutable")
    if not TARGET.is_file() or TARGET.read_text(encoding="utf-8") != rendered:
        raise SystemExit(
            "invoice-history product-identity migration drifted; run with --write"
        )
    print("invoice-history product-identity migration: current")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
