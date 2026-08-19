from tests.live_erp.test_live_write_contracts import (
    _create_live_invoice,
    _create_live_purchase_entry,
    _create_live_sales_return,
    _invoice_outstanding_rows,
    _location_stock_quantity,
    _today_iso,
)


def _create_live_purchase_return(api_json, purchase, unique_suffix):
    response, body = api_json(
        "POST",
        "/api/purchase-returns/",
        payload={
            "supplier_id": purchase["supplier_id"],
            "supplier_invoice_id": purchase["response"]["invoice_id"],
            "grn_id": purchase["response"]["grn_id"],
            "return_date": _today_iso(),
            "return_reason": "Quality Issue",
            "return_category": "QUALITY",
            "notes": f"LIVE ERP purchase journey verification {unique_suffix}",
            "items": [
                {
                    "selected": True,
                    "invoice_item_id": purchase["invoice_item"]["invoice_item_id"],
                    "grn_item_id": purchase["grn_item"]["grn_item_id"],
                    "product_id": purchase["seed"]["product_id"],
                    "batch_id": purchase["batch"]["batch_id"],
                    "batch_number": purchase["invoice_item"]["batch_number"],
                    "return_quantity": 1,
                    "unit_price": float(purchase["invoice_item"]["unit_price"]),
                    "tax_percent": 18,
                    "unit": "PCS",
                    "return_reason": "Quality Issue",
                    "condition": "good",
                }
            ],
        },
    )
    assert response.status_code in (200, 201), body
    return body


def test_purchase_entry_return_journey_reconciles_supplier_ledger(api_json, db_query, db_scalar, live_config, unique_suffix):
    purchase = _create_live_purchase_entry(
        api_json,
        db_query,
        db_scalar,
        live_config,
        f"{unique_suffix}-purchase-journey",
        quantity=2,
    )

    supplier_invoice_row = db_query(
        """
        SELECT supplier_invoice_id, supplier_invoice_number, invoice_total, payment_status
        FROM procurement.supplier_invoices
        WHERE supplier_invoice_id = %s
        """,
        (purchase["response"]["invoice_id"],),
    )[0]
    assert supplier_invoice_row["supplier_invoice_id"] == purchase["response"]["invoice_id"]
    assert supplier_invoice_row["supplier_invoice_number"] == purchase["response"]["invoice_number"]
    assert float(supplier_invoice_row["invoice_total"]) == 118
    assert supplier_invoice_row["payment_status"] in {"pending", "unpaid", "partially_paid", "paid"}

    supplier_invoice_outstanding = db_query(
        """
        SELECT document_type, document_id, original_amount, outstanding_amount, status
        FROM financial.supplier_outstanding
        WHERE document_type = 'invoice'
          AND document_id = %s
        ORDER BY outstanding_id DESC
        LIMIT 1
        """,
        (purchase["response"]["invoice_id"],),
    )[0]
    assert supplier_invoice_outstanding["document_type"] == "invoice"
    assert supplier_invoice_outstanding["document_id"] == purchase["response"]["invoice_id"]
    assert float(supplier_invoice_outstanding["original_amount"]) == 118
    assert float(supplier_invoice_outstanding["outstanding_amount"]) == 118
    assert supplier_invoice_outstanding["status"] == "open"

    batch_before_return = float(purchase["batch"]["quantity_available"])
    location_before_return = _location_stock_quantity(
        db_query,
        purchase["batch"]["batch_id"],
        purchase["location_id"],
    )

    purchase_return = _create_live_purchase_return(api_json, purchase, unique_suffix)

    debit_note_row = db_query(
        """
        SELECT debit_note_id, total_amount, status
        FROM financial.debit_notes
        WHERE reference_type = 'PURCHASE_RETURN'
          AND reference_id = %s
        ORDER BY debit_note_id DESC
        LIMIT 1
        """,
        (purchase_return["return_id"],),
    )[0]
    assert float(debit_note_row["total_amount"]) == 59
    assert debit_note_row["status"] == "approved"

    debit_note_outstanding = db_query(
        """
        SELECT document_type, document_id, original_amount, outstanding_amount, status
        FROM financial.supplier_outstanding
        WHERE document_type = 'debit_note'
          AND document_id = %s
        ORDER BY outstanding_id DESC
        LIMIT 1
        """,
        (debit_note_row["debit_note_id"],),
    )[0]
    assert float(debit_note_outstanding["original_amount"]) == -59
    assert float(debit_note_outstanding["outstanding_amount"]) == -59
    assert debit_note_outstanding["status"] == "open"

    supplier_net_rows = db_query(
        """
        SELECT COALESCE(SUM(outstanding_amount), 0) AS net_outstanding
        FROM financial.supplier_outstanding
        WHERE (document_type = 'invoice' AND document_id = %s)
           OR (document_type = 'debit_note' AND document_id = %s)
        """,
        (purchase["response"]["invoice_id"], debit_note_row["debit_note_id"]),
    )
    assert float(supplier_net_rows[0]["net_outstanding"]) == 59

    batch_after_return = db_query(
        "SELECT quantity_available FROM inventory.batches WHERE batch_id = %s",
        (purchase["batch"]["batch_id"],),
    )[0]["quantity_available"]
    assert float(batch_after_return) == batch_before_return - 1
    assert _location_stock_quantity(db_query, purchase["batch"]["batch_id"], purchase["location_id"]) == location_before_return - 1

    cancel_response, cancel_body = api_json("DELETE", f"/api/purchase-returns/{purchase_return['return_id']}")
    assert cancel_response.status_code == 200, cancel_body

    supplier_invoice_outstanding_after_cancel = db_query(
        """
        SELECT outstanding_amount, status
        FROM financial.supplier_outstanding
        WHERE document_type = 'invoice'
          AND document_id = %s
        ORDER BY outstanding_id DESC
        LIMIT 1
        """,
        (purchase["response"]["invoice_id"],),
    )[0]
    assert float(supplier_invoice_outstanding_after_cancel["outstanding_amount"]) == 118
    assert supplier_invoice_outstanding_after_cancel["status"] == "open"

    debit_note_outstanding_after_cancel = db_query(
        """
        SELECT outstanding_amount, status
        FROM financial.supplier_outstanding
        WHERE document_type = 'debit_note'
          AND document_id = %s
        ORDER BY outstanding_id DESC
        LIMIT 1
        """,
        (debit_note_row["debit_note_id"],),
    )[0]
    assert float(debit_note_outstanding_after_cancel["outstanding_amount"]) == 0
    assert debit_note_outstanding_after_cancel["status"] == "cancelled"

    batch_after_cancel = db_query(
        "SELECT quantity_available FROM inventory.batches WHERE batch_id = %s",
        (purchase["batch"]["batch_id"],),
    )[0]["quantity_available"]
    assert float(batch_after_cancel) == batch_before_return
    assert _location_stock_quantity(db_query, purchase["batch"]["batch_id"], purchase["location_id"]) == location_before_return


def test_invoice_payment_return_journey_reconciles_customer_ledger(api_json, db_query, live_config, unique_suffix):
    invoice_context = _create_live_invoice(
        api_json,
        db_query,
        live_config,
        f"{unique_suffix}-sales-journey",
        quantity=1,
        require_gst_customer=True,
    )

    invoice = invoice_context["response"]
    seed = invoice_context["seed"]

    payment_response, payment_body = api_json(
        "POST",
        "/api/payments/record",
        payload={
            "invoice_id": invoice["invoice_id"],
            "payment_date": _today_iso(),
            "payment_mode": "cash",
            "amount": float(invoice["final_amount"]),
            "transaction_reference": f"LIVE-JOURNEY-PAY-{unique_suffix}",
            "notes": f"LIVE ERP customer journey verification {unique_suffix}",
        },
    )
    assert payment_response.status_code == 200, payment_body
    assert payment_body["payment_status"] == "paid"

    sales_return = _create_live_sales_return(api_json, invoice_context, unique_suffix)

    invoice_outstanding_rows = _invoice_outstanding_rows(db_query, invoice["invoice_id"])
    assert len(invoice_outstanding_rows) == 1
    invoice_outstanding = invoice_outstanding_rows[0]
    assert float(invoice_outstanding["paid_amount"]) == float(invoice["final_amount"])
    assert float(invoice_outstanding["outstanding_amount"]) == 0
    assert invoice_outstanding["status"] == "paid"

    credit_note_outstanding = db_query(
        """
        SELECT original_amount, outstanding_amount, status
        FROM financial.customer_outstanding
        WHERE document_type = 'credit_note'
          AND document_id = %s
        ORDER BY outstanding_id DESC
        LIMIT 1
        """,
        (sales_return["credit_note_id"],),
    )[0]
    assert float(credit_note_outstanding["original_amount"]) == -float(invoice["final_amount"])
    assert float(credit_note_outstanding["outstanding_amount"]) == -float(invoice["final_amount"])
    assert credit_note_outstanding["status"] == "open"

    customer_net_rows = db_query(
        """
        SELECT COALESCE(SUM(outstanding_amount), 0) AS net_outstanding
        FROM financial.customer_outstanding
        WHERE (document_type = 'INVOICE' AND document_id = %s)
           OR (document_type = 'credit_note' AND document_id = %s)
        """,
        (invoice["invoice_id"], sales_return["credit_note_id"]),
    )
    assert float(customer_net_rows[0]["net_outstanding"]) == -float(invoice["final_amount"])

    invoice_row = db_query(
        """
        SELECT payment_status, paid_amount, credit_amount, invoice_status
        FROM sales.invoices
        WHERE invoice_id = %s
        """,
        (invoice["invoice_id"],),
    )[0]
    assert invoice_row["payment_status"] == "paid"
    assert float(invoice_row["paid_amount"]) == float(invoice["final_amount"])
    assert float(invoice_row["credit_amount"] or 0) == 0
    assert invoice_row["invoice_status"] == "posted"

    batch_after_return = db_query(
        "SELECT quantity_available FROM inventory.batches WHERE batch_id = %s",
        (seed["batch_id"],),
    )[0]["quantity_available"]
    assert float(batch_after_return) == float(seed["batch_qty"])
    assert _location_stock_quantity(db_query, seed["batch_id"], seed["location_id"]) == float(seed["lws_qty"])
