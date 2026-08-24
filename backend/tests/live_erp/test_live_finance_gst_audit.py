"""
Read-only live finance/GST audits.

These tests validate database-wide invariants that journey tests can miss:
duplicate outstanding rows, denormalized amount drift, allocation drift, and
GST dashboard values matching the database source of truth.
"""
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID

import pytest


VALID_GST_TYPES = {"CGST/SGST", "CGST_SGST", "IGST", "EXEMPT", "NON_GST"}


@pytest.fixture(scope="module", autouse=True)
def require_read_only_database(live_config):
    assert live_config.database_read_only, (
        "Set PHARMA_LIVE_DATABASE_READ_ONLY=true for the finance/GST audit"
    )


def _money(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _default_branch_id(db_query, org_id: UUID) -> UUID:
    rows = db_query(
        """
        SELECT branch_id
        FROM master.org_branches
        WHERE org_id = %s
          AND is_default_location = true
          AND is_active = true
        LIMIT 1
        """,
        (org_id,),
    )
    if rows:
        return rows[0]["branch_id"]

    rows = db_query(
        """
        SELECT branch_id
        FROM master.org_branches
        WHERE org_id = %s
          AND is_active = true
        ORDER BY branch_id
        LIMIT 1
        """,
        (org_id,),
    )
    assert rows, f"no active branch found for org {org_id}"
    return rows[0]["branch_id"]


def test_no_duplicate_active_outstanding_documents(db_query, live_config):
    customer_duplicates = db_query(
        """
        SELECT document_type, document_id, COUNT(*) AS duplicate_count
        FROM financial.customer_outstanding
        WHERE org_id = %s
          AND COALESCE(status, '') <> 'cancelled'
        GROUP BY document_type, document_id
        HAVING COUNT(*) > 1
        ORDER BY duplicate_count DESC, document_type, document_id
        LIMIT 20
        """,
        (live_config.test_org_id,),
    )
    supplier_duplicates = db_query(
        """
        SELECT document_type, document_id, COUNT(*) AS duplicate_count
        FROM financial.supplier_outstanding
        WHERE org_id = %s
          AND COALESCE(status, '') <> 'cancelled'
        GROUP BY document_type, document_id
        HAVING COUNT(*) > 1
        ORDER BY duplicate_count DESC, document_type, document_id
        LIMIT 20
        """,
        (live_config.test_org_id,),
    )

    assert customer_duplicates == []
    assert supplier_duplicates == []


def test_customer_invoice_outstanding_matches_invoice_amounts(db_query, live_config):
    mismatches = db_query(
        """
        SELECT
            i.invoice_id,
            i.invoice_number,
            i.final_amount,
            COALESCE(i.paid_amount, 0) AS invoice_paid_amount,
            COALESCE(i.credit_amount, i.final_amount - COALESCE(i.paid_amount, 0)) AS invoice_credit_amount,
            co.original_amount,
            COALESCE(co.paid_amount, 0) AS outstanding_paid_amount,
            co.outstanding_amount,
            co.status
        FROM sales.invoices i
        JOIN financial.customer_outstanding co
          ON co.org_id = i.org_id
         AND co.document_type = 'INVOICE'
         AND co.document_id = i.invoice_id
        WHERE i.org_id = %s
          AND i.invoice_status NOT IN ('cancelled', 'void')
          AND (
              ABS(COALESCE(co.original_amount, 0) - COALESCE(i.final_amount, 0)) > 0.01
              OR ABS(COALESCE(co.paid_amount, 0) - COALESCE(i.paid_amount, 0)) > 0.01
              OR ABS(COALESCE(co.outstanding_amount, 0) - COALESCE(i.credit_amount, i.final_amount - COALESCE(i.paid_amount, 0))) > 0.01
          )
        ORDER BY i.invoice_id DESC
        LIMIT 20
        """,
        (live_config.test_org_id,),
    )

    assert mismatches == []


def test_supplier_invoice_outstanding_matches_supplier_invoice_amounts(db_query, live_config):
    mismatches = db_query(
        """
        SELECT
            si.supplier_invoice_id,
            si.supplier_invoice_number,
            si.invoice_total,
            COALESCE(si.paid_amount, 0) AS invoice_paid_amount,
            so.original_amount,
            COALESCE(so.paid_amount, 0) AS outstanding_paid_amount,
            so.outstanding_amount,
            so.status
        FROM procurement.supplier_invoices si
        JOIN financial.supplier_outstanding so
          ON so.org_id = si.org_id
         AND so.document_type = 'invoice'
         AND so.document_id = si.supplier_invoice_id
        WHERE si.org_id = %s
          AND si.invoice_status != 'cancelled'
          AND (
              ABS(COALESCE(so.original_amount, 0) - COALESCE(si.invoice_total, 0)) > 0.01
              OR ABS(COALESCE(so.paid_amount, 0) - COALESCE(si.paid_amount, 0)) > 0.01
              OR ABS(COALESCE(so.outstanding_amount, 0) - (COALESCE(si.invoice_total, 0) - COALESCE(si.paid_amount, 0))) > 0.01
          )
        ORDER BY si.supplier_invoice_id DESC
        LIMIT 20
        """,
        (live_config.test_org_id,),
    )

    assert mismatches == []


def test_payment_rollups_match_active_allocations(db_query, live_config):
    payment_mismatches = db_query(
        """
        WITH allocation_totals AS (
            SELECT payment_id, COALESCE(SUM(allocated_amount), 0) AS allocated_amount
            FROM financial.allocations
            WHERE allocation_status = 'active'
            GROUP BY payment_id
        )
        SELECT
            p.payment_id,
            p.payment_number,
            p.payment_amount,
            COALESCE(p.allocated_amount, 0) AS payment_allocated_amount,
            COALESCE(p.unallocated_amount, 0) AS payment_unallocated_amount,
            COALESCE(a.allocated_amount, 0) AS allocation_sum
        FROM financial.payments p
        LEFT JOIN allocation_totals a ON a.payment_id = p.payment_id
        WHERE p.org_id = %s
          AND COALESCE(p.payment_status, '') <> 'cancelled'
          AND (
              ABS(COALESCE(p.allocated_amount, 0) - COALESCE(a.allocated_amount, 0)) > 0.01
              OR ABS(COALESCE(p.unallocated_amount, 0) - (COALESCE(p.payment_amount, 0) - COALESCE(a.allocated_amount, 0))) > 0.01
          )
        ORDER BY p.payment_id DESC
        LIMIT 20
        """,
        (live_config.test_org_id,),
    )

    assert payment_mismatches == []


def test_stored_gst_types_use_supported_values(db_query, live_config):
    invalid_sales = db_query(
        """
        SELECT invoice_id, invoice_number, gst_type
        FROM sales.invoices
        WHERE org_id = %s
          AND NULLIF(TRIM(COALESCE(gst_type, '')), '') IS NOT NULL
          AND gst_type NOT IN %s
        ORDER BY invoice_id DESC
        LIMIT 20
        """,
        (live_config.test_org_id, tuple(VALID_GST_TYPES)),
    )
    invalid_purchases = db_query(
        """
        SELECT supplier_invoice_id, supplier_invoice_number, gst_type
        FROM procurement.supplier_invoices
        WHERE org_id = %s
          AND NULLIF(TRIM(COALESCE(gst_type, '')), '') IS NOT NULL
          AND gst_type NOT IN %s
        ORDER BY supplier_invoice_id DESC
        LIMIT 20
        """,
        (live_config.test_org_id, tuple(VALID_GST_TYPES)),
    )

    assert invalid_sales == []
    assert invalid_purchases == []


def test_gst_dashboard_matches_current_period_database_totals(api_json, db_query, live_config):
    branch_id = _default_branch_id(db_query, live_config.test_org_id)
    now = datetime.now()

    sales = db_query(
        """
        SELECT
            COUNT(*) AS total_invoices,
            COALESCE(SUM(subtotal_amount - COALESCE(discount_amount, 0)), 0) AS total_taxable,
            COALESCE(SUM(cgst_amount), 0) AS total_cgst,
            COALESCE(SUM(sgst_amount), 0) AS total_sgst,
            COALESCE(SUM(igst_amount), 0) AS total_igst
        FROM sales.invoices
        WHERE org_id = %s
          AND branch_id = %s
          AND invoice_status NOT IN ('cancelled', 'void')
          AND EXTRACT(year FROM invoice_date) = %s
          AND EXTRACT(month FROM invoice_date) = %s
        """,
        (live_config.test_org_id, branch_id, now.year, now.month),
    )[0]
    purchases = db_query(
        """
        SELECT
            COUNT(*) AS total_supplier_invoices,
            COALESCE(SUM(taxable_amount), 0) AS total_purchase_taxable,
            COALESCE(SUM(cgst_amount), 0) AS total_purchase_cgst,
            COALESCE(SUM(sgst_amount), 0) AS total_purchase_sgst,
            COALESCE(SUM(igst_amount), 0) AS total_purchase_igst
        FROM procurement.supplier_invoices
        WHERE org_id = %s
          AND branch_id = %s
          AND invoice_status != 'cancelled'
          AND EXTRACT(year FROM invoice_date) = %s
          AND EXTRACT(month FROM invoice_date) = %s
        """,
        (live_config.test_org_id, branch_id, now.year, now.month),
    )[0]

    response, body = api_json("GET", "/api/gst/dashboard", params={"period": "current"})
    assert response.status_code == 200, body

    expected_output_tax = _money(sales["total_cgst"]) + _money(sales["total_sgst"]) + _money(sales["total_igst"])
    expected_input_credit = (
        _money(purchases["total_purchase_cgst"])
        + _money(purchases["total_purchase_sgst"])
        + _money(purchases["total_purchase_igst"])
    )

    assert _money(body["outputTax"]) == expected_output_tax
    assert _money(body["inputCredit"]) == expected_input_credit
    assert _money(body["netPayable"]) == expected_output_tax - expected_input_credit
    assert body["summary"]["total_invoices"] == sales["total_invoices"]
    assert body["summary"]["total_supplier_invoices"] == purchases["total_supplier_invoices"]
    assert _money(body["summary"]["total_taxable"]) == _money(sales["total_taxable"])
    assert _money(body["summary"]["total_purchase_taxable"]) == _money(purchases["total_purchase_taxable"])
