#!/usr/bin/env python3
"""
Repair denormalized finance drift for one organization.

Source-of-truth rules:
- financial.payments allocated/unallocated rollups derive from active allocations.
- financial.customer_outstanding invoice rows derive from sales.invoices.
- financial.supplier_outstanding invoice rows derive from procurement.supplier_invoices.

The script is intentionally narrow: it does not create/delete business events and
does not invent missing allocations or payments.
"""
import argparse
import os
from typing import Iterable

import psycopg2
from psycopg2.extras import RealDictCursor


def _database_url() -> str:
    value = os.getenv("DATABASE_URL") or os.getenv("PHARMA_LIVE_DATABASE_URL")
    if not value:
        raise SystemExit("DATABASE_URL or PHARMA_LIVE_DATABASE_URL is required")
    return value


def _print_rows(title: str, rows: Iterable[dict]) -> None:
    rows = list(rows)
    print(f"\n{title}: {len(rows)} row(s)")
    for row in rows:
        print(row)


def repair(org_id: str, *, dry_run: bool) -> None:
    conn = psycopg2.connect(_database_url())
    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    WITH allocation_totals AS (
                        SELECT payment_id, COALESCE(SUM(allocated_amount), 0) AS allocated_amount
                        FROM financial.allocations
                        WHERE allocation_status = 'active'
                        GROUP BY payment_id
                    ),
                    candidates AS (
                        SELECT
                            p.payment_id,
                            COALESCE(a.allocated_amount, 0) AS expected_allocated_amount,
                            COALESCE(p.payment_amount, 0) - COALESCE(a.allocated_amount, 0) AS expected_unallocated_amount,
                            CASE
                                WHEN COALESCE(a.allocated_amount, 0) = 0 THEN 'unallocated'
                                WHEN COALESCE(p.payment_amount, 0) - COALESCE(a.allocated_amount, 0) <= 0 THEN 'full'
                                ELSE 'partial'
                            END AS expected_allocation_status
                        FROM financial.payments p
                        LEFT JOIN allocation_totals a ON a.payment_id = p.payment_id
                        WHERE p.org_id = %s
                          AND COALESCE(p.payment_status, '') <> 'cancelled'
                          AND (
                              ABS(COALESCE(p.allocated_amount, 0) - COALESCE(a.allocated_amount, 0)) > 0.01
                              OR ABS(COALESCE(p.unallocated_amount, 0) - (COALESCE(p.payment_amount, 0) - COALESCE(a.allocated_amount, 0))) > 0.01
                              OR COALESCE(p.allocation_status, '') <> CASE
                                  WHEN COALESCE(a.allocated_amount, 0) = 0 THEN 'unallocated'
                                  WHEN COALESCE(p.payment_amount, 0) - COALESCE(a.allocated_amount, 0) <= 0 THEN 'full'
                                  ELSE 'partial'
                              END
                          )
                    )
                    UPDATE financial.payments p
                    SET allocated_amount = c.expected_allocated_amount,
                        unallocated_amount = c.expected_unallocated_amount,
                        allocation_status = c.expected_allocation_status,
                        updated_at = NOW()
                    FROM candidates c
                    WHERE p.payment_id = c.payment_id
                    RETURNING
                        p.payment_id,
                        p.payment_number,
                        p.payment_amount,
                        p.allocated_amount,
                        p.unallocated_amount,
                        p.allocation_status
                    """,
                    (org_id,),
                )
                payment_rows = cur.fetchall()

                cur.execute(
                    """
                    WITH candidates AS (
                        SELECT
                            co.outstanding_id,
                            COALESCE(i.final_amount, 0) AS expected_original_amount,
                            COALESCE(i.paid_amount, 0) AS expected_paid_amount,
                            COALESCE(i.credit_amount, i.final_amount - COALESCE(i.paid_amount, 0)) AS expected_outstanding_amount,
                            CASE
                                WHEN COALESCE(i.credit_amount, i.final_amount - COALESCE(i.paid_amount, 0)) <= 0 THEN 'paid'
                                WHEN COALESCE(i.paid_amount, 0) > 0 THEN 'partial'
                                ELSE 'open'
                            END AS expected_status
                        FROM financial.customer_outstanding co
                        JOIN sales.invoices i
                          ON i.org_id = co.org_id
                         AND co.document_type = 'INVOICE'
                         AND co.document_id = i.invoice_id
                        WHERE i.org_id = %s
                          AND i.invoice_status NOT IN ('cancelled', 'void')
                          AND (
                              ABS(COALESCE(co.original_amount, 0) - COALESCE(i.final_amount, 0)) > 0.01
                              OR ABS(COALESCE(co.paid_amount, 0) - COALESCE(i.paid_amount, 0)) > 0.01
                              OR ABS(COALESCE(co.outstanding_amount, 0) - COALESCE(i.credit_amount, i.final_amount - COALESCE(i.paid_amount, 0))) > 0.01
                              OR COALESCE(co.status, '') <> CASE
                                  WHEN COALESCE(i.credit_amount, i.final_amount - COALESCE(i.paid_amount, 0)) <= 0 THEN 'paid'
                                  WHEN COALESCE(i.paid_amount, 0) > 0 THEN 'partial'
                                  ELSE 'open'
                              END
                          )
                    )
                    UPDATE financial.customer_outstanding co
                    SET original_amount = c.expected_original_amount,
                        paid_amount = c.expected_paid_amount,
                        outstanding_amount = c.expected_outstanding_amount,
                        status = c.expected_status,
                        updated_at = NOW()
                    FROM candidates c
                    WHERE co.outstanding_id = c.outstanding_id
                    RETURNING
                        co.outstanding_id,
                        co.document_type,
                        co.document_id,
                        co.original_amount,
                        co.paid_amount,
                        co.outstanding_amount,
                        co.status
                    """,
                    (org_id,),
                )
                customer_rows = cur.fetchall()

                cur.execute(
                    """
                    WITH candidates AS (
                        SELECT
                            so.outstanding_id,
                            COALESCE(si.invoice_total, 0) AS expected_original_amount,
                            COALESCE(si.paid_amount, 0) AS expected_paid_amount,
                            COALESCE(si.invoice_total, 0) - COALESCE(si.paid_amount, 0) AS expected_outstanding_amount,
                            CASE
                                WHEN COALESCE(si.invoice_total, 0) - COALESCE(si.paid_amount, 0) <= 0 THEN 'paid'
                                WHEN COALESCE(si.paid_amount, 0) > 0 THEN 'partial'
                                ELSE 'open'
                            END AS expected_status
                        FROM financial.supplier_outstanding so
                        JOIN procurement.supplier_invoices si
                          ON si.org_id = so.org_id
                         AND so.document_type = 'invoice'
                         AND so.document_id = si.supplier_invoice_id
                        WHERE si.org_id = %s
                          AND si.invoice_status != 'cancelled'
                          AND (
                              ABS(COALESCE(so.original_amount, 0) - COALESCE(si.invoice_total, 0)) > 0.01
                              OR ABS(COALESCE(so.paid_amount, 0) - COALESCE(si.paid_amount, 0)) > 0.01
                              OR ABS(COALESCE(so.outstanding_amount, 0) - (COALESCE(si.invoice_total, 0) - COALESCE(si.paid_amount, 0))) > 0.01
                              OR COALESCE(so.status, '') <> CASE
                                  WHEN COALESCE(si.invoice_total, 0) - COALESCE(si.paid_amount, 0) <= 0 THEN 'paid'
                                  WHEN COALESCE(si.paid_amount, 0) > 0 THEN 'partial'
                                  ELSE 'open'
                              END
                          )
                    )
                    UPDATE financial.supplier_outstanding so
                    SET original_amount = c.expected_original_amount,
                        paid_amount = c.expected_paid_amount,
                        outstanding_amount = c.expected_outstanding_amount,
                        status = c.expected_status,
                        updated_at = NOW()
                    FROM candidates c
                    WHERE so.outstanding_id = c.outstanding_id
                    RETURNING
                        so.outstanding_id,
                        so.document_type,
                        so.document_id,
                        so.original_amount,
                        so.paid_amount,
                        so.outstanding_amount,
                        so.status
                    """,
                    (org_id,),
                )
                supplier_rows = cur.fetchall()

                _print_rows("payments repaired", payment_rows)
                _print_rows("customer outstanding repaired", customer_rows)
                _print_rows("supplier outstanding repaired", supplier_rows)

                if dry_run:
                    conn.rollback()
                    print("\ndry-run: rolled back")
                else:
                    print("\ncommitted")
    finally:
        conn.close()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--org-id", required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    repair(args.org_id, dry_run=args.dry_run)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
