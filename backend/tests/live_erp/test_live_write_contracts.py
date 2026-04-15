from datetime import date, timedelta


def _today_iso():
    return date.today().isoformat()


def _future_iso(days: int = 720):
    return (date.today() + timedelta(days=days)).isoformat()


def _select_stock_seed(db_query, org_id: str, *, min_quantity: int = 2):
    rows = db_query(
        """
        SELECT
            b.product_id,
            p.product_name,
            b.batch_id,
            b.batch_number,
            b.quantity_available AS batch_qty,
            COALESCE(b.mrp_per_unit, 0) AS mrp,
            COALESCE(b.sale_price_per_unit, 0) AS sale_price,
            COALESCE(b.cost_per_unit, 0) AS unit_cost,
            l.location_id,
            COALESCE(l.quantity_available, 0) AS lws_qty
        FROM inventory.batches b
        JOIN inventory.products p ON p.product_id = b.product_id
        JOIN inventory.location_wise_stock l ON l.batch_id = b.batch_id
        WHERE b.org_id = %s
          AND b.batch_status = 'active'
          AND b.quantity_available >= %s
          AND COALESCE(l.quantity_available, 0) >= %s
        ORDER BY b.batch_id DESC
        LIMIT 1
        """,
        (org_id, min_quantity, min_quantity),
    )
    assert rows, "no live batch with enough stock found"
    return rows[0]


def _select_supplier_id(db_scalar, org_id: str):
    return db_scalar(
        """
        SELECT supplier_id
        FROM parties.suppliers
        WHERE org_id = %s
        ORDER BY supplier_id
        LIMIT 1
        """,
        (org_id,),
    )


def _location_stock_quantity(db_query, batch_id: int, location_id: int):
    rows = db_query(
        """
        SELECT quantity_available
        FROM inventory.location_wise_stock
        WHERE batch_id = %s AND location_id = %s
        ORDER BY stock_id
        LIMIT 1
        """,
        (batch_id, location_id),
    )
    return float(rows[0]["quantity_available"]) if rows else 0.0


def _select_transfer_destination(db_query, org_id: str, source_location_id: int):
    rows = db_query(
        """
        SELECT location_id
        FROM inventory.storage_locations
        WHERE org_id = %s
          AND is_active = TRUE
          AND location_id <> %s
        ORDER BY location_id
        LIMIT 1
        """,
        (org_id, source_location_id),
    )
    assert rows, f"no destination location found for source {source_location_id}"
    return rows[0]["location_id"]


def _select_customer(db_query, org_id: str, *, require_gst: bool = False):
    sql = """
        SELECT customer_id, customer_name, COALESCE(gst_number, '') AS gst_number
        FROM parties.customers
        WHERE org_id = %s
    """
    params = [org_id]
    if require_gst:
        sql += " AND COALESCE(NULLIF(TRIM(gst_number), ''), '') <> ''"
    sql += " ORDER BY customer_id LIMIT 1"
    rows = db_query(sql, tuple(params))
    assert rows, f"no live customer found for org {org_id}"
    return rows[0]


def _create_live_invoice(api_json, db_query, live_config, unique_suffix, *, quantity: int = 1, require_gst_customer: bool = False):
    seed = _select_stock_seed(db_query, live_config.test_org_id, min_quantity=quantity + 1)
    customer = _select_customer(
        db_query,
        live_config.test_org_id,
        require_gst=require_gst_customer,
    )

    unit_price = float(seed["sale_price"] or seed["mrp"] or 90)
    mrp = float(seed["mrp"] or unit_price)
    invoice_payload = {
        "customer_id": customer["customer_id"],
        "invoice_date": _today_iso(),
        "notes": f"LIVE ERP invoice verification {unique_suffix}",
        "items": [
            {
                "product_id": seed["product_id"],
                "batch_id": seed["batch_id"],
                "batch_number": seed["batch_number"],
                "quantity": quantity,
                "unit_price": unit_price,
                "mrp": mrp,
                "discount_percent": 0,
                "gst_percent": 18,
            }
        ],
    }

    response, body = api_json("POST", "/api/invoices/", payload=invoice_payload)
    assert response.status_code == 201, body
    assert body.get("invoice_id"), body
    assert body.get("order_id"), body

    invoice_item_rows = db_query(
        """
        SELECT invoice_item_id, quantity, line_total, unit_price, batch_id,
               discount_percent, discount_amount, taxable_amount,
               igst_rate, igst_amount, cgst_rate, cgst_amount, sgst_rate, sgst_amount,
               cess_rate, cess_amount, total_tax_amount
        FROM sales.invoice_items
        WHERE invoice_id = %s
        ORDER BY invoice_item_id
        """,
        (body["invoice_id"],),
    )
    assert invoice_item_rows, f"invoice items not found for {body['invoice_id']}"

    return {
        "response": body,
        "seed": seed,
        "customer": customer,
        "invoice_item": invoice_item_rows[0],
    }


def _create_live_purchase_entry(api_json, db_query, db_scalar, live_config, unique_suffix, *, quantity: int = 2):
    seed = _select_stock_seed(db_query, live_config.test_org_id, min_quantity=2)
    supplier_id = _select_supplier_id(db_scalar, live_config.test_org_id)
    invoice_number = f"LIVE-PE-{unique_suffix}"
    batch_number = f"LIVE-PE-BATCH-{unique_suffix}"

    payload = {
        "supplier_id": supplier_id,
        "invoice_number": invoice_number,
        "invoice_date": _today_iso(),
        "subtotal_amount": 50 * quantity,
        "discount_amount": 0,
        "tax_amount": 9 * quantity,
        "final_amount": 59 * quantity,
        "payment_terms": "immediate",
        "notes": f"LIVE ERP purchase entry verification {unique_suffix}",
        "items": [
            {
                "product_id": seed["product_id"],
                "product_name": seed["product_name"],
                "quantity": quantity,
                "cost_price": 50,
                "mrp": 100,
                "selling_price": 90,
                "tax_percent": 18,
                "batch_number": batch_number,
                "expiry_date": _future_iso(),
            }
        ],
    }

    response, body = api_json("POST", "/api/purchases/purchase-entry", payload=payload)
    assert response.status_code == 200, body

    invoice_item = db_query(
        """
        SELECT invoice_item_id, batch_id, batch_number, quantity, quantity_returned, unit_price,
               discount_percent, discount_amount, taxable_amount,
               cgst_percent, sgst_percent, igst_percent,
               cgst_amount, sgst_amount, igst_amount, total_amount
        FROM procurement.supplier_invoice_items
        WHERE supplier_invoice_id = %s
        ORDER BY invoice_item_id
        LIMIT 1
        """,
        (body["invoice_id"],),
    )[0]

    batch = db_query(
        """
        SELECT batch_id, product_id, quantity_available, quantity_returned
        FROM inventory.batches
        WHERE batch_number = %s
        ORDER BY batch_id DESC
        LIMIT 1
        """,
        (batch_number,),
    )[0]

    grn_item = db_query(
        """
        SELECT grn_item_id, grn_id, quantity_returned
        FROM procurement.grn_items
        WHERE grn_id = %s AND product_id = %s
        ORDER BY grn_item_id DESC
        LIMIT 1
        """,
        (body["grn_id"], seed["product_id"]),
    )[0]

    lws = db_query(
        """
        SELECT location_id, quantity_available
        FROM inventory.location_wise_stock
        WHERE batch_id = %s
        ORDER BY stock_id DESC
        LIMIT 1
        """,
        (batch["batch_id"],),
    )[0]

    return {
        "response": body,
        "seed": seed,
        "supplier_id": supplier_id,
        "invoice_item": invoice_item,
        "batch": batch,
        "grn_item": grn_item,
        "location_id": lws["location_id"],
    }


def _create_live_sales_return(api_json, invoice_context, unique_suffix):
    invoice = invoice_context["response"]
    seed = invoice_context["seed"]
    customer = invoice_context["customer"]
    invoice_item = invoice_context["invoice_item"]

    return_payload = {
        "customer_id": customer["customer_id"],
        "invoice_id": invoice["invoice_id"],
        "invoice_number": invoice["invoice_number"],
        "return_date": _today_iso(),
        "return_reason": f"LIVE ERP return verification {unique_suffix}",
        "return_category": "OTHER",
        "return_method": "credit_note",
        "notes": f"LIVE ERP return verification {unique_suffix}",
        "items": [
            {
                "invoice_item_id": invoice_item["invoice_item_id"],
                "product_id": seed["product_id"],
                "batch_id": seed["batch_id"],
                "return_quantity": 1,
                "unit_price": float(invoice_item["unit_price"]),
                "tax_percent": 18,
                "return_reason": "Automated live verification",
                "disposition": "RESTOCK",
            }
        ],
    }

    response, body = api_json("POST", "/api/sale-returns/", payload=return_payload)
    assert response.status_code in (200, 201), body
    assert body.get("return_id"), body
    return body


def _invoice_outstanding_rows(db_query, invoice_id: int):
    return db_query(
        """
        SELECT document_type, original_amount, outstanding_amount, paid_amount, status
        FROM financial.customer_outstanding
        WHERE document_id = %s
        ORDER BY outstanding_id
        """,
        (invoice_id,),
    )


def _supplier_invoice_outstanding_rows(db_query, supplier_invoice_id: int):
    return db_query(
        """
        SELECT document_type, original_amount, outstanding_amount, paid_amount, status
        FROM financial.supplier_outstanding
        WHERE document_type = 'invoice'
          AND document_id = %s
        ORDER BY outstanding_id
        """,
        (supplier_invoice_id,),
    )


def test_stock_receive_impacts_expected_tables(api_json, db_query, live_config):
    seed = _select_stock_seed(db_query, live_config.test_org_id, min_quantity=6)
    quantity = 1

    response, body = api_json(
        "POST",
        "/api/stock-movements/receive",
        payload={
            "product_id": seed["product_id"],
            "batch_id": seed["batch_id"],
            "quantity": quantity,
            "movement_date": _today_iso(),
            "reason": "adjustment",
            "notes": "live_erp automated stock receive verification",
        },
    )

    assert response.status_code == 200, body
    assert body.get("movement_id"), body

    movement_rows = db_query(
        """
        SELECT movement_id, movement_type, movement_direction, quantity, location_id
        FROM inventory.inventory_movements
        WHERE movement_id = %s
        """,
        (body["movement_id"],),
    )
    assert movement_rows, "stock receive movement row not found"
    movement = movement_rows[0]
    assert movement["movement_type"] == "receive"
    assert movement["movement_direction"] == "in"
    assert float(movement["quantity"]) == quantity

    batch_after = db_query(
        "SELECT quantity_available FROM inventory.batches WHERE batch_id = %s",
        (seed["batch_id"],),
    )[0]["quantity_available"]
    assert float(batch_after) == float(seed["batch_qty"]) + quantity

    lws_after = db_query(
        """
        SELECT quantity_available
        FROM inventory.location_wise_stock
        WHERE batch_id = %s AND location_id = %s
        """,
        (seed["batch_id"], seed["location_id"]),
    )[0]["quantity_available"]
    assert float(lws_after) == float(seed["lws_qty"]) + quantity

    cleanup_response, cleanup_body = api_json(
        "POST",
        "/api/stock-movements/issue",
        payload={
            "product_id": seed["product_id"],
            "batch_id": seed["batch_id"],
            "quantity": quantity,
            "movement_date": _today_iso(),
            "reason": "damaged",
            "notes": "live_erp cleanup after stock receive verification",
        },
    )
    assert cleanup_response.status_code == 200, cleanup_body


def test_purchase_order_commitment_impacts_expected_tables(api_json, db_query, db_scalar, live_config, unique_suffix):
    seed = _select_stock_seed(db_query, live_config.test_org_id, min_quantity=2)
    supplier_id = _select_supplier_id(db_scalar, live_config.test_org_id)
    before_batch_count = db_scalar(
        "SELECT COUNT(*) FROM inventory.batches WHERE org_id = %s",
        (live_config.test_org_id,),
    )
    before_movement_count = db_scalar(
        "SELECT COUNT(*) FROM inventory.inventory_movements WHERE org_id = %s",
        (live_config.test_org_id,),
    )

    payload = {
        "supplier_id": supplier_id,
        "supplier_name": "Live ERP Supplier",
        "purchase_date": _today_iso(),
        "subtotal_amount": 50,
        "discount_amount": 0,
        "tax_amount": 9,
        "other_charges": 0,
        "final_amount": 59,
        "purchase_status": "draft",
        "payment_mode": "cash",
        "notes": f"LIVE ERP PO verification {unique_suffix}",
        "items": [
            {
                "product_id": seed["product_id"],
                "product_name": seed["product_name"],
                "ordered_quantity": 2,
                "cost_price": 25,
                "mrp": 50,
                "selling_price": 45,
                "tax_percent": 18,
                "batch_number": "",
                "expiry_date": _future_iso(),
            }
        ],
    }

    response, body = api_json("POST", "/api/purchases/with-items", payload=payload)
    assert response.status_code == 200, body
    purchase_id = body["purchase_id"]

    po_rows = db_query(
        """
        SELECT purchase_order_id, supplier_id, po_status, receipt_status, total_amount
        FROM procurement.purchase_orders
        WHERE purchase_order_id = %s
        """,
        (purchase_id,),
    )
    assert po_rows, f"purchase order {purchase_id} not found"
    po = po_rows[0]
    assert po["supplier_id"] == supplier_id
    assert po["po_status"] == "draft"
    assert po["receipt_status"] == "pending"
    assert float(po["total_amount"]) == 59

    item_rows = db_query(
        """
        SELECT product_id, ordered_quantity, received_quantity, pending_quantity
        FROM procurement.purchase_order_items
        WHERE purchase_order_id = %s
        """,
        (purchase_id,),
    )
    assert len(item_rows) == 1
    item = item_rows[0]
    assert item["product_id"] == seed["product_id"]
    assert float(item["ordered_quantity"]) == 2
    assert float(item["received_quantity"] or 0) == 0

    after_batch_count = db_scalar(
        "SELECT COUNT(*) FROM inventory.batches WHERE org_id = %s",
        (live_config.test_org_id,),
    )
    after_movement_count = db_scalar(
        "SELECT COUNT(*) FROM inventory.inventory_movements WHERE org_id = %s",
        (live_config.test_org_id,),
    )
    assert after_batch_count == before_batch_count
    assert after_movement_count == before_movement_count


def test_purchase_entry_direct_impacts_expected_tables(api_json, db_query, db_scalar, live_config, unique_suffix):
    seed = _select_stock_seed(db_query, live_config.test_org_id, min_quantity=2)
    supplier_id = _select_supplier_id(db_scalar, live_config.test_org_id)
    invoice_number = f"LIVE-PE-{unique_suffix}"
    batch_number = f"LIVE-PE-BATCH-{unique_suffix}"

    payload = {
        "supplier_id": supplier_id,
        "invoice_number": invoice_number,
        "invoice_date": _today_iso(),
        "subtotal_amount": 100,
        "discount_amount": 0,
        "tax_amount": 18,
        "final_amount": 118,
        "payment_terms": "immediate",
        "notes": f"LIVE ERP purchase entry verification {unique_suffix}",
        "items": [
            {
                "product_id": seed["product_id"],
                "product_name": seed["product_name"],
                "quantity": 2,
                "cost_price": 50,
                "mrp": 100,
                "selling_price": 90,
                "tax_percent": 18,
                "batch_number": batch_number,
                "expiry_date": _future_iso(),
            }
        ],
    }

    response, body = api_json("POST", "/api/purchases/purchase-entry", payload=payload)
    assert response.status_code == 200, body
    assert body["items_created"] == 1

    invoice_rows = db_query(
        """
        SELECT supplier_invoice_id, supplier_id, supplier_invoice_number, invoice_total
        FROM procurement.supplier_invoices
        WHERE supplier_invoice_id = %s
        """,
        (body["invoice_id"],),
    )
    assert invoice_rows, f"supplier invoice {body['invoice_id']} not found"
    invoice = invoice_rows[0]
    assert invoice["supplier_id"] == supplier_id
    assert invoice["supplier_invoice_number"] == invoice_number
    assert float(invoice["invoice_total"]) == 118

    invoice_item_rows = db_query(
        """
        SELECT product_id, batch_number, quantity, total_amount
        FROM procurement.supplier_invoice_items
        WHERE supplier_invoice_id = %s
        """,
        (body["invoice_id"],),
    )
    assert len(invoice_item_rows) == 1
    invoice_item = invoice_item_rows[0]
    assert invoice_item["product_id"] == seed["product_id"]
    assert invoice_item["batch_number"] == batch_number
    assert float(invoice_item["quantity"]) == 2

    grn_rows = db_query(
        """
        SELECT grn_id, supplier_invoice_id, supplier_invoice_number, source, stock_updated
        FROM procurement.goods_receipt_notes
        WHERE grn_id = %s
        """,
        (body["grn_id"],),
    )
    assert grn_rows, f"grn {body['grn_id']} not found"
    grn = grn_rows[0]
    assert grn["supplier_invoice_id"] == body["invoice_id"]
    assert grn["supplier_invoice_number"] == invoice_number
    assert grn["source"] == "DIRECT"
    assert grn["stock_updated"] is True

    supplier_outstanding_rows = _supplier_invoice_outstanding_rows(db_query, body["invoice_id"])
    assert len(supplier_outstanding_rows) == 1, supplier_outstanding_rows
    supplier_outstanding = supplier_outstanding_rows[0]
    assert supplier_outstanding["document_type"] == "invoice"
    assert float(supplier_outstanding["original_amount"]) == 118
    assert float(supplier_outstanding["outstanding_amount"]) == 118
    assert float(supplier_outstanding["paid_amount"] or 0) == 0
    assert supplier_outstanding["status"] == "open"

    grn_item_rows = db_query(
        """
        SELECT product_id, batch_number, received_quantity, accepted_quantity
        FROM procurement.grn_items
        WHERE grn_id = %s
        """,
        (body["grn_id"],),
    )
    assert len(grn_item_rows) == 1
    grn_item = grn_item_rows[0]
    assert grn_item["product_id"] == seed["product_id"]
    assert grn_item["batch_number"] == batch_number
    assert float(grn_item["received_quantity"]) == 2
    assert float(grn_item["accepted_quantity"]) == 2

    batch_rows = db_query(
        """
        SELECT batch_id, product_id, quantity_available
        FROM inventory.batches
        WHERE batch_number = %s
        ORDER BY batch_id DESC
        LIMIT 1
        """,
        (batch_number,),
    )
    assert batch_rows, f"batch {batch_number} not found"
    batch = batch_rows[0]
    assert batch["product_id"] == seed["product_id"]
    assert float(batch["quantity_available"]) == 2

    movement_rows = db_query(
        """
        SELECT movement_type, movement_direction, batch_id, quantity
        FROM inventory.inventory_movements
        WHERE reference_type = 'supplier_invoice'
          AND reference_id = %s
        ORDER BY movement_id
        """,
        (body["invoice_id"],),
    )
    assert len(movement_rows) == 1
    movement = movement_rows[0]
    assert movement["movement_type"] == "purchase"
    assert movement["movement_direction"] == "in"
    assert movement["batch_id"] == batch["batch_id"]
    assert float(movement["quantity"]) == 2

    lws_rows = db_query(
        """
        SELECT quantity_available
        FROM inventory.location_wise_stock
        WHERE batch_id = %s
        """,
        (batch["batch_id"],),
    )
    assert lws_rows, f"location wise stock missing for batch {batch['batch_id']}"
    assert any(float(row["quantity_available"]) >= 2 for row in lws_rows)


def test_purchase_entry_tax_calculations_reconcile_line_and_header_values(api_json, db_query, db_scalar, live_config, unique_suffix):
    purchase = _create_live_purchase_entry(
        api_json,
        db_query,
        db_scalar,
        live_config,
        f"{unique_suffix}-tax",
        quantity=2,
    )

    supplier_invoice = db_query(
        """
        SELECT subtotal_amount, discount_amount, taxable_amount,
               cgst_amount, sgst_amount, igst_amount, cess_amount, tax_amount,
               freight_charges, insurance_charges, other_charges, round_off_amount,
               invoice_total, gst_type
        FROM procurement.supplier_invoices
        WHERE supplier_invoice_id = %s
        """,
        (purchase["response"]["invoice_id"],),
    )[0]
    item = purchase["invoice_item"]

    quantity = float(item["quantity"])
    unit_price = float(item["unit_price"])
    discount_percent = float(item["discount_percent"] or 0)
    discount_amount = round(quantity * unit_price * discount_percent / 100, 2)
    taxable_amount = round(quantity * unit_price - discount_amount, 2)
    line_tax_total = round(
        float(item["cgst_amount"] or 0)
        + float(item["sgst_amount"] or 0)
        + float(item["igst_amount"] or 0),
        2,
    )

    assert round(float(item["discount_amount"] or 0), 2) == discount_amount
    assert round(float(item["taxable_amount"] or 0), 2) == taxable_amount
    assert round(float(item["total_amount"] or 0), 2) == round(taxable_amount + line_tax_total, 2)

    cgst_percent = round(float(item["cgst_percent"] or 0), 2)
    sgst_percent = round(float(item["sgst_percent"] or 0), 2)
    igst_percent = round(float(item["igst_percent"] or 0), 2)
    total_rate = round(cgst_percent + sgst_percent + igst_percent, 2)
    assert total_rate == 18.00

    if igst_percent > 0:
        assert cgst_percent == 0
        assert sgst_percent == 0
        assert round(float(item["igst_amount"] or 0), 2) == round(taxable_amount * igst_percent / 100, 2)
    else:
        assert cgst_percent == sgst_percent
        assert round(float(item["cgst_amount"] or 0), 2) == round(taxable_amount * cgst_percent / 100, 2)
        assert round(float(item["sgst_amount"] or 0), 2) == round(taxable_amount * sgst_percent / 100, 2)

    assert round(float(supplier_invoice["subtotal_amount"] or 0), 2) == round(quantity * unit_price, 2)
    assert round(float(supplier_invoice["discount_amount"] or 0), 2) == discount_amount
    assert round(float(supplier_invoice["taxable_amount"] or 0), 2) == taxable_amount
    assert round(float(supplier_invoice["cgst_amount"] or 0), 2) == round(float(item["cgst_amount"] or 0), 2)
    assert round(float(supplier_invoice["sgst_amount"] or 0), 2) == round(float(item["sgst_amount"] or 0), 2)
    assert round(float(supplier_invoice["igst_amount"] or 0), 2) == round(float(item["igst_amount"] or 0), 2)
    assert round(float(supplier_invoice["tax_amount"] or 0), 2) == line_tax_total

    amount_before_round = round(
        float(supplier_invoice["taxable_amount"] or 0)
        + float(supplier_invoice["tax_amount"] or 0)
        + float(supplier_invoice["freight_charges"] or 0)
        + float(supplier_invoice["insurance_charges"] or 0)
        + float(supplier_invoice["other_charges"] or 0),
        2,
    )
    expected_total = float(round(amount_before_round))
    expected_round_off = round(expected_total - amount_before_round, 2)

    assert round(float(supplier_invoice["invoice_total"] or 0), 2) == round(expected_total, 2)
    assert round(float(supplier_invoice["round_off_amount"] or 0), 2) == expected_round_off
    assert round(
        amount_before_round + float(supplier_invoice["round_off_amount"] or 0),
        2,
    ) == round(float(supplier_invoice["invoice_total"] or 0), 2)


def test_purchase_receipt_from_po_impacts_expected_tables(api_json, db_query, db_scalar, live_config, unique_suffix):
    seed = _select_stock_seed(db_query, live_config.test_org_id, min_quantity=2)
    supplier_id = _select_supplier_id(db_scalar, live_config.test_org_id)

    po_payload = {
        "supplier_id": supplier_id,
        "supplier_name": "Live ERP Supplier",
        "purchase_date": _today_iso(),
        "subtotal_amount": 100,
        "discount_amount": 0,
        "tax_amount": 18,
        "other_charges": 0,
        "final_amount": 118,
        "purchase_status": "draft",
        "payment_mode": "cash",
        "notes": f"LIVE ERP PO receipt verification {unique_suffix}",
        "items": [
            {
                "product_id": seed["product_id"],
                "product_name": seed["product_name"],
                "ordered_quantity": 2,
                "cost_price": 50,
                "mrp": 100,
                "selling_price": 90,
                "tax_percent": 18,
                "batch_number": "",
                "expiry_date": _future_iso(),
            }
        ],
    }
    po_response, po_body = api_json("POST", "/api/purchases/with-items", payload=po_payload)
    assert po_response.status_code == 200, po_body
    purchase_order_id = po_body["purchase_id"]

    po_item = db_query(
        """
        SELECT po_item_id, ordered_quantity, received_quantity
        FROM procurement.purchase_order_items
        WHERE purchase_order_id = %s
        ORDER BY po_item_id
        LIMIT 1
        """,
        (purchase_order_id,),
    )[0]

    invoice_number = f"LIVE-PO-RECEIPT-{unique_suffix}"
    batch_number = f"LIVE-PO-BATCH-{unique_suffix}"
    receipt_payload = {
        "supplier_id": supplier_id,
        "purchase_order_id": purchase_order_id,
        "invoice_number": invoice_number,
        "invoice_date": _today_iso(),
        "subtotal_amount": 100,
        "discount_amount": 0,
        "tax_amount": 18,
        "final_amount": 118,
        "payment_terms": "immediate",
        "items": [
            {
                "po_item_id": po_item["po_item_id"],
                "product_id": seed["product_id"],
                "product_name": seed["product_name"],
                "ordered_quantity": 2,
                "quantity": 2,
                "cost_price": 50,
                "mrp": 100,
                "selling_price": 90,
                "tax_percent": 18,
                "batch_number": batch_number,
                "expiry_date": _future_iso(),
            }
        ],
    }

    receipt_response, receipt_body = api_json("POST", "/api/purchases/purchase-entry", payload=receipt_payload)
    assert receipt_response.status_code == 200, receipt_body
    assert receipt_body["purchase_order_id"] == purchase_order_id
    assert receipt_body["po_status"] == "completed"

    po_rows = db_query(
        """
        SELECT po_status, receipt_status
        FROM procurement.purchase_orders
        WHERE purchase_order_id = %s
        """,
        (purchase_order_id,),
    )
    assert po_rows, f"purchase order {purchase_order_id} not found after receipt"
    po = po_rows[0]
    assert po["po_status"] == "completed"
    assert po["receipt_status"] == "received"

    po_item_after = db_query(
        """
        SELECT ordered_quantity, received_quantity
        FROM procurement.purchase_order_items
        WHERE po_item_id = %s
        """,
        (po_item["po_item_id"],),
    )[0]
    assert float(po_item_after["ordered_quantity"]) == 2
    assert float(po_item_after["received_quantity"]) == 2

    supplier_invoice = db_query(
        """
        SELECT supplier_invoice_id, supplier_invoice_number, purchase_order_ids
        FROM procurement.supplier_invoices
        WHERE supplier_invoice_id = %s
        """,
        (receipt_body["invoice_id"],),
    )[0]
    assert supplier_invoice["supplier_invoice_number"] == invoice_number
    assert purchase_order_id in (supplier_invoice["purchase_order_ids"] or [])

    grn = db_query(
        """
        SELECT source, purchase_order_id, supplier_invoice_id
        FROM procurement.goods_receipt_notes
        WHERE grn_id = %s
        """,
        (receipt_body["grn_id"],),
    )[0]
    assert grn["source"] == "PO"
    assert grn["purchase_order_id"] == purchase_order_id
    assert grn["supplier_invoice_id"] == receipt_body["invoice_id"]

    supplier_outstanding_rows = _supplier_invoice_outstanding_rows(db_query, receipt_body["invoice_id"])
    assert len(supplier_outstanding_rows) == 1, supplier_outstanding_rows
    supplier_outstanding = supplier_outstanding_rows[0]
    assert supplier_outstanding["document_type"] == "invoice"
    assert float(supplier_outstanding["original_amount"]) == 118
    assert float(supplier_outstanding["outstanding_amount"]) == 118
    assert float(supplier_outstanding["paid_amount"] or 0) == 0
    assert supplier_outstanding["status"] == "open"

    batch = db_query(
        """
        SELECT batch_id, quantity_available
        FROM inventory.batches
        WHERE batch_number = %s
        ORDER BY batch_id DESC
        LIMIT 1
        """,
        (batch_number,),
    )[0]
    assert float(batch["quantity_available"]) == 2

    movement_rows = db_query(
        """
        SELECT movement_type, movement_direction, batch_id, quantity
        FROM inventory.inventory_movements
        WHERE reference_type = 'supplier_invoice'
          AND reference_id = %s
        """,
        (receipt_body["invoice_id"],),
    )
    assert len(movement_rows) == 1
    movement = movement_rows[0]
    assert movement["movement_type"] == "purchase"
    assert movement["movement_direction"] == "in"
    assert movement["batch_id"] == batch["batch_id"]
    assert float(movement["quantity"]) == 2


def test_sales_invoice_create_impacts_expected_tables(api_json, db_query, live_config, unique_suffix):
    invoice_context = _create_live_invoice(
        api_json,
        db_query,
        live_config,
        unique_suffix,
        quantity=1,
        require_gst_customer=True,
    )

    invoice = invoice_context["response"]
    seed = invoice_context["seed"]

    invoice_rows = db_query(
        """
        SELECT invoice_id, order_id, customer_id, payment_status, final_amount, invoice_status, paid_amount, credit_amount
        FROM sales.invoices
        WHERE invoice_id = %s
        """,
        (invoice["invoice_id"],),
    )
    assert invoice_rows, f"invoice {invoice['invoice_id']} not found"
    invoice_row = invoice_rows[0]
    assert invoice_row["order_id"] == invoice["order_id"]
    assert invoice_row["payment_status"] == "pending"
    assert invoice_row["invoice_status"] == "posted"
    assert float(invoice_row["final_amount"]) == float(invoice["final_amount"])
    assert float(invoice_row["paid_amount"] or 0) == 0
    assert float(invoice_row["credit_amount"]) == float(invoice["final_amount"])

    order_rows = db_query(
        """
        SELECT order_id, customer_id, final_amount, order_status, payment_status
        FROM sales.orders
        WHERE order_id = %s
        """,
        (invoice["order_id"],),
    )
    assert order_rows, f"order {invoice['order_id']} not found"
    order_row = order_rows[0]
    assert order_row["customer_id"] == invoice_row["customer_id"]
    assert float(order_row["final_amount"]) == float(invoice["final_amount"])
    assert order_row["order_status"] == "invoiced"
    assert order_row["payment_status"] == "pending"

    movement_rows = db_query(
        """
        SELECT movement_type, movement_direction, quantity
        FROM inventory.inventory_movements
        WHERE reference_type = 'invoice'
          AND reference_id = %s
        ORDER BY movement_id
        """,
        (invoice["invoice_id"],),
    )
    assert len(movement_rows) == 1
    movement = movement_rows[0]
    assert movement["movement_type"] == "sale"
    assert movement["movement_direction"] == "out"
    assert float(movement["quantity"]) == 1

    batch_after = db_query(
        "SELECT quantity_available FROM inventory.batches WHERE batch_id = %s",
        (seed["batch_id"],),
    )[0]["quantity_available"]
    assert float(batch_after) == float(seed["batch_qty"]) - 1

    lws_after = db_query(
        """
        SELECT quantity_available
        FROM inventory.location_wise_stock
        WHERE batch_id = %s AND location_id = %s
        """,
        (seed["batch_id"], seed["location_id"]),
    )[0]["quantity_available"]
    assert float(lws_after) == float(seed["lws_qty"]) - 1

    outstanding_rows = _invoice_outstanding_rows(db_query, invoice["invoice_id"])
    assert len(outstanding_rows) == 1, outstanding_rows
    outstanding = outstanding_rows[0]
    assert outstanding["document_type"] == "INVOICE"
    assert float(outstanding["original_amount"]) == float(invoice["final_amount"])
    assert float(outstanding["outstanding_amount"]) == float(invoice["final_amount"])
    assert float(outstanding["paid_amount"]) == 0
    assert outstanding["status"] == "open"

    _create_live_sales_return(api_json, invoice_context, f"{unique_suffix}-cleanup")


def test_invoice_tax_calculations_reconcile_line_and_header_values(api_json, db_query, live_config, unique_suffix):
    invoice_context = _create_live_invoice(
        api_json,
        db_query,
        live_config,
        f"{unique_suffix}-tax",
        quantity=1,
        require_gst_customer=True,
    )

    invoice = invoice_context["response"]
    item = invoice_context["invoice_item"]

    invoice_row = db_query(
        """
        SELECT subtotal_amount, discount_amount, scheme_discount, taxable_amount,
               cgst_amount, sgst_amount, igst_amount, cess_amount, total_tax_amount,
               freight_charges, insurance_charges, other_charges, round_off_amount,
               final_amount, gst_type
        FROM sales.invoices
        WHERE invoice_id = %s
        """,
        (invoice["invoice_id"],),
    )[0]

    quantity = float(item["quantity"])
    unit_price = float(item["unit_price"])
    discount_percent = float(item["discount_percent"] or 0)
    discount_amount = round(quantity * unit_price * discount_percent / 100, 2)
    taxable_amount = round(quantity * unit_price - discount_amount, 2)
    line_tax_total = round(
        float(item["cgst_amount"] or 0)
        + float(item["sgst_amount"] or 0)
        + float(item["igst_amount"] or 0)
        + float(item["cess_amount"] or 0),
        2,
    )

    assert round(float(item["discount_amount"] or 0), 2) == discount_amount
    assert round(float(item["taxable_amount"] or 0), 2) == taxable_amount
    assert round(float(item["total_tax_amount"] or 0), 2) == line_tax_total
    assert round(float(item["line_total"] or 0), 2) == round(taxable_amount + line_tax_total, 2)

    igst_rate = round(float(item["igst_rate"] or 0), 2)
    cgst_rate = round(float(item["cgst_rate"] or 0), 2)
    sgst_rate = round(float(item["sgst_rate"] or 0), 2)
    cess_rate = round(float(item["cess_rate"] or 0), 2)
    total_rate = round(igst_rate + cgst_rate + sgst_rate + cess_rate, 2)
    assert total_rate == 18.00

    if igst_rate > 0:
        assert cgst_rate == 0
        assert sgst_rate == 0
        assert round(float(item["igst_amount"] or 0), 2) == round(taxable_amount * igst_rate / 100, 2)
    else:
        assert cgst_rate == sgst_rate
        assert round(float(item["cgst_amount"] or 0), 2) == round(taxable_amount * cgst_rate / 100, 2)
        assert round(float(item["sgst_amount"] or 0), 2) == round(taxable_amount * sgst_rate / 100, 2)

    assert round(float(invoice_row["subtotal_amount"] or 0), 2) == round(quantity * unit_price, 2)
    assert round(float(invoice_row["discount_amount"] or 0), 2) == discount_amount
    assert round(float(invoice_row["taxable_amount"] or 0), 2) == taxable_amount
    assert round(float(invoice_row["cgst_amount"] or 0), 2) == round(float(item["cgst_amount"] or 0), 2)
    assert round(float(invoice_row["sgst_amount"] or 0), 2) == round(float(item["sgst_amount"] or 0), 2)
    assert round(float(invoice_row["igst_amount"] or 0), 2) == round(float(item["igst_amount"] or 0), 2)
    assert round(float(invoice_row["cess_amount"] or 0), 2) == round(float(item["cess_amount"] or 0), 2)
    assert round(float(invoice_row["total_tax_amount"] or 0), 2) == line_tax_total

    amount_before_round = round(
        float(invoice_row["taxable_amount"] or 0)
        + float(invoice_row["total_tax_amount"] or 0)
        + float(invoice_row["freight_charges"] or 0)
        + float(invoice_row["insurance_charges"] or 0)
        + float(invoice_row["other_charges"] or 0),
        2,
    )
    expected_final = float(round(amount_before_round))
    expected_round_off = round(expected_final - amount_before_round, 2)

    assert round(float(invoice_row["final_amount"] or 0), 2) == round(expected_final, 2)
    assert round(float(invoice_row["round_off_amount"] or 0), 2) == expected_round_off
    assert round(
        amount_before_round + float(invoice_row["round_off_amount"] or 0),
        2,
    ) == round(float(invoice_row["final_amount"] or 0), 2)

    _create_live_sales_return(api_json, invoice_context, f"{unique_suffix}-cleanup")


def test_sales_return_restock_impacts_expected_tables(api_json, db_query, live_config, unique_suffix):
    invoice_context = _create_live_invoice(
        api_json,
        db_query,
        live_config,
        f"{unique_suffix}-seed",
        quantity=1,
        require_gst_customer=True,
    )

    invoice = invoice_context["response"]
    seed = invoice_context["seed"]
    invoice_item = invoice_context["invoice_item"]
    batch_after_invoice = db_query(
        "SELECT quantity_available FROM inventory.batches WHERE batch_id = %s",
        (seed["batch_id"],),
    )[0]["quantity_available"]
    lws_after_invoice = db_query(
        """
        SELECT quantity_available
        FROM inventory.location_wise_stock
        WHERE batch_id = %s AND location_id = %s
        """,
        (seed["batch_id"], seed["location_id"]),
    )[0]["quantity_available"]

    body = _create_live_sales_return(api_json, invoice_context, unique_suffix)

    sales_return_rows = db_query(
        """
        SELECT invoice_id, customer_id, total_amount, return_method
        FROM sales.sales_returns
        WHERE return_id = %s
        """,
        (body["return_id"],),
    )
    assert sales_return_rows, f"sales return {body['return_id']} not found"
    sales_return = sales_return_rows[0]
    assert sales_return["invoice_id"] == invoice["invoice_id"]
    assert sales_return["customer_id"] == invoice_context["customer"]["customer_id"]
    assert sales_return["return_method"] == "credit_note"
    assert float(sales_return["total_amount"]) == float(body["total_amount"])
    assert float(sales_return["total_amount"]) == float(invoice["final_amount"])

    return_item_rows = db_query(
        """
        SELECT invoice_item_id, batch_id, return_quantity, saleable_quantity, disposition
        FROM sales.sales_return_items
        WHERE return_id = %s
        """,
        (body["return_id"],),
    )
    assert len(return_item_rows) == 1
    return_item = return_item_rows[0]
    assert return_item["invoice_item_id"] == invoice_item["invoice_item_id"]
    assert return_item["batch_id"] == seed["batch_id"]
    assert float(return_item["return_quantity"]) == 1
    assert float(return_item["saleable_quantity"]) == 1
    assert return_item["disposition"] == "RESTOCK"

    movement_rows = db_query(
        """
        SELECT movement_type, movement_direction, quantity, reference_type
        FROM inventory.inventory_movements
        WHERE reference_type = 'SALES_RETURN'
          AND reference_id = %s
        ORDER BY movement_id
        """,
        (body["return_id"],),
    )
    assert len(movement_rows) == 1
    movement = movement_rows[0]
    assert movement["movement_type"] == "return"
    assert movement["movement_direction"] == "in"
    assert float(movement["quantity"]) == 1
    assert movement["reference_type"] == "SALES_RETURN"

    batch_after_return = db_query(
        "SELECT quantity_available, quantity_returned FROM inventory.batches WHERE batch_id = %s",
        (seed["batch_id"],),
    )[0]
    assert float(batch_after_return["quantity_available"]) == float(batch_after_invoice) + 1
    assert float(batch_after_return["quantity_available"]) == float(seed["batch_qty"])
    assert float(batch_after_return["quantity_returned"] or 0) >= 1

    lws_after_return = db_query(
        """
        SELECT quantity_available
        FROM inventory.location_wise_stock
        WHERE batch_id = %s AND location_id = %s
        """,
        (seed["batch_id"], seed["location_id"]),
    )[0]["quantity_available"]
    assert float(lws_after_return) == float(lws_after_invoice) + 1
    assert float(lws_after_return) == float(seed["lws_qty"])

    credit_note_rows = db_query(
        """
        SELECT reference_id, reference_type, total_amount, status
        FROM financial.credit_notes
        WHERE credit_note_id = %s
        """,
        (body["credit_note_id"],),
    )
    assert credit_note_rows, f"credit note {body['credit_note_id']} not found"
    credit_note = credit_note_rows[0]
    assert credit_note["reference_id"] == body["return_id"]
    assert credit_note["reference_type"] == "sales_return"
    assert float(credit_note["total_amount"]) == float(body["total_amount"])
    assert float(credit_note["total_amount"]) == float(invoice["final_amount"])
    assert credit_note["status"] == "approved"

    outstanding_rows = db_query(
        """
        SELECT original_amount, outstanding_amount, status
        FROM financial.customer_outstanding
        WHERE document_type = 'credit_note'
          AND document_id = %s
        ORDER BY outstanding_id DESC
        LIMIT 1
        """,
        (body["credit_note_id"],),
    )
    assert outstanding_rows, f"customer outstanding missing for credit note {body['credit_note_id']}"
    outstanding = outstanding_rows[0]
    assert float(outstanding["original_amount"]) < 0
    assert float(outstanding["outstanding_amount"]) < 0
    assert outstanding["status"] == "open"


def test_payment_receipt_impacts_expected_tables(api_json, db_query, live_config, unique_suffix):
    invoice_context = _create_live_invoice(
        api_json,
        db_query,
        live_config,
        f"{unique_suffix}-payment",
        quantity=1,
        require_gst_customer=True,
    )

    invoice = invoice_context["response"]
    payment_amount = float(invoice["final_amount"])
    payment_payload = {
        "invoice_id": invoice["invoice_id"],
        "payment_date": _today_iso(),
        "payment_mode": "cash",
        "amount": payment_amount,
        "transaction_reference": f"LIVE-PAY-{unique_suffix}",
        "notes": f"LIVE ERP payment verification {unique_suffix}",
    }

    response, body = api_json("POST", "/api/payments/record", payload=payment_payload)
    assert response.status_code == 200, body
    assert body.get("payment_id"), body
    assert body.get("payment_reference"), body
    assert body.get("payment_status") == "paid"
    assert float(body.get("balance_amount", -1)) == 0

    payment_rows = db_query(
        """
        SELECT payment_id, payment_number, payment_amount, payment_status, reference_number
        FROM financial.payments
        WHERE payment_id = %s
        """,
        (body["payment_id"],),
    )
    assert payment_rows, f"payment {body['payment_id']} not found"
    payment = payment_rows[0]
    assert payment["payment_number"] == body["payment_reference"]
    assert float(payment["payment_amount"]) == payment_amount
    assert payment["payment_status"] == "cleared"
    assert payment["reference_number"] == payment_payload["transaction_reference"]

    allocation_rows = db_query(
        """
        SELECT reference_type, reference_id, reference_number, allocated_amount
        FROM financial.allocations
        WHERE payment_id = %s
        """,
        (body["payment_id"],),
    )
    assert len(allocation_rows) == 1
    allocation = allocation_rows[0]
    assert allocation["reference_type"] == "INVOICE"
    assert allocation["reference_id"] == invoice["invoice_id"]
    assert allocation["reference_number"] == invoice["invoice_number"]
    assert float(allocation["allocated_amount"]) == payment_amount

    invoice_rows = db_query(
        """
        SELECT paid_amount, credit_amount, payment_status, order_id
        FROM sales.invoices
        WHERE invoice_id = %s
        """,
        (invoice["invoice_id"],),
    )
    assert invoice_rows, f"invoice {invoice['invoice_id']} not found after payment"
    invoice_row = invoice_rows[0]
    assert float(invoice_row["paid_amount"]) == payment_amount
    assert float(invoice_row["credit_amount"] or 0) == 0
    assert invoice_row["payment_status"] == "paid"

    outstanding_rows = _invoice_outstanding_rows(db_query, invoice["invoice_id"])
    assert len(outstanding_rows) == 1, outstanding_rows
    outstanding = outstanding_rows[0]
    assert outstanding["document_type"] == "INVOICE"
    assert float(outstanding["paid_amount"]) == payment_amount
    assert float(outstanding["outstanding_amount"]) == 0
    assert outstanding["status"] == "paid"

    order_rows = db_query(
        """
        SELECT payment_status
        FROM sales.orders
        WHERE order_id = %s
        """,
        (invoice_row["order_id"],),
    )
    assert order_rows, f"order {invoice_row['order_id']} not found after payment"
    assert order_rows[0]["payment_status"] == "paid"


def test_invoice_trigger_contracts_enforce_single_outstanding_and_order_sync(api_json, db_query, live_config, unique_suffix):
    invoice_context = _create_live_invoice(
        api_json,
        db_query,
        live_config,
        f"{unique_suffix}-trigger",
        quantity=1,
        require_gst_customer=True,
    )
    invoice = invoice_context["response"]

    invoice_row = db_query(
        """
        SELECT final_amount, paid_amount, credit_amount, payment_status, invoice_status, order_id
        FROM sales.invoices
        WHERE invoice_id = %s
        """,
        (invoice["invoice_id"],),
    )[0]
    assert float(invoice_row["paid_amount"] or 0) == 0
    assert float(invoice_row["credit_amount"]) == float(invoice_row["final_amount"])
    assert invoice_row["payment_status"] == "pending"
    assert invoice_row["invoice_status"] == "posted"

    outstanding_rows = _invoice_outstanding_rows(db_query, invoice["invoice_id"])
    assert len(outstanding_rows) == 1, outstanding_rows
    assert outstanding_rows[0]["document_type"] == "INVOICE"
    assert float(outstanding_rows[0]["outstanding_amount"]) == float(invoice_row["credit_amount"])

    order_row = db_query(
        """
        SELECT order_status, payment_status
        FROM sales.orders
        WHERE order_id = %s
        """,
        (invoice_row["order_id"],),
    )[0]
    assert order_row["order_status"] == "invoiced"
    assert order_row["payment_status"] == "pending"

    _create_live_sales_return(api_json, invoice_context, f"{unique_suffix}-cleanup")


def test_invoice_allocation_trigger_contracts_match_allocation_sum(api_json, db_query, live_config, unique_suffix):
    invoice_context = _create_live_invoice(
        api_json,
        db_query,
        live_config,
        f"{unique_suffix}-alloc",
        quantity=1,
        require_gst_customer=True,
    )
    invoice = invoice_context["response"]
    payment_amount = float(invoice["final_amount"])

    response, body = api_json(
        "POST",
        "/api/payments/record",
        payload={
            "invoice_id": invoice["invoice_id"],
            "payment_date": _today_iso(),
            "payment_mode": "cash",
            "amount": payment_amount,
            "transaction_reference": f"LIVE-ALLOC-{unique_suffix}",
            "notes": f"LIVE ERP allocation verification {unique_suffix}",
        },
    )
    assert response.status_code == 200, body

    allocation_sum = db_query(
        """
        SELECT COALESCE(SUM(allocated_amount), 0) AS allocated
        FROM financial.allocations
        WHERE reference_type = 'INVOICE'
          AND reference_id = %s
          AND allocation_status = 'active'
        """,
        (invoice["invoice_id"],),
    )[0]["allocated"]

    invoice_row = db_query(
        """
        SELECT final_amount, paid_amount, credit_amount, payment_status
        FROM sales.invoices
        WHERE invoice_id = %s
        """,
        (invoice["invoice_id"],),
    )[0]
    assert float(invoice_row["paid_amount"]) == float(allocation_sum)
    assert float(invoice_row["credit_amount"]) == float(invoice_row["final_amount"]) - float(allocation_sum)
    assert invoice_row["payment_status"] == "paid"

    payment_row = db_query(
        """
        SELECT allocation_status, allocated_amount, unallocated_amount
        FROM financial.payments
        WHERE payment_id = %s
        """,
        (body["payment_id"],),
    )[0]
    assert float(payment_row["allocated_amount"]) == float(allocation_sum)
    assert float(payment_row["unallocated_amount"] or 0) == 0
    assert payment_row["allocation_status"] in {"full", "allocated"}

    outstanding_rows = _invoice_outstanding_rows(db_query, invoice["invoice_id"])
    assert len(outstanding_rows) == 1, outstanding_rows
    assert float(outstanding_rows[0]["paid_amount"]) == float(allocation_sum)
    assert float(outstanding_rows[0]["outstanding_amount"]) == 0


def test_stock_transfer_impacts_expected_tables(api_json, db_query, live_config):
    seed = _select_stock_seed(db_query, live_config.test_org_id, min_quantity=3)
    quantity = 1
    destination_location = _select_transfer_destination(
        db_query,
        live_config.test_org_id,
        seed["location_id"],
    )
    source_before = float(seed["lws_qty"])
    destination_before = _location_stock_quantity(db_query, seed["batch_id"], destination_location)
    batch_before = float(seed["batch_qty"])

    response, body = api_json(
        "POST",
        "/api/stock-movements/transfer",
        payload={
            "product_id": seed["product_id"],
            "batch_id": seed["batch_id"],
            "quantity": quantity,
            "movement_date": _today_iso(),
            "source_location": seed["location_id"],
            "destination_location": destination_location,
            "reason": "live_erp stock transfer verification",
        },
    )

    assert response.status_code == 200, body
    assert body.get("out_movement_id"), body
    assert body.get("in_movement_id"), body

    movements = db_query(
        """
        SELECT movement_id, movement_type, movement_direction, location_id, quantity
        FROM inventory.inventory_movements
        WHERE movement_id IN (%s, %s)
        ORDER BY movement_id
        """,
        (body["out_movement_id"], body["in_movement_id"]),
    )
    assert len(movements) == 2
    assert {row["movement_type"] for row in movements} == {"transfer_out", "transfer_in"}
    assert {row["movement_direction"] for row in movements} == {"out", "in"}
    assert {row["location_id"] for row in movements} == {seed["location_id"], destination_location}
    assert {float(row["quantity"]) for row in movements} == {quantity}

    assert _location_stock_quantity(db_query, seed["batch_id"], seed["location_id"]) == source_before - quantity
    assert _location_stock_quantity(db_query, seed["batch_id"], destination_location) == destination_before + quantity
    batch_after = db_query(
        "SELECT quantity_available FROM inventory.batches WHERE batch_id = %s",
        (seed["batch_id"],),
    )[0]["quantity_available"]
    assert float(batch_after) == batch_before

    cleanup_response, cleanup_body = api_json(
        "POST",
        "/api/stock-movements/transfer",
        payload={
            "product_id": seed["product_id"],
            "batch_id": seed["batch_id"],
            "quantity": quantity,
            "movement_date": _today_iso(),
            "source_location": destination_location,
            "destination_location": seed["location_id"],
            "reason": "live_erp cleanup after stock transfer verification",
        },
    )
    assert cleanup_response.status_code == 200, cleanup_body


def test_stock_adjustment_impacts_expected_tables(api_json, db_query, live_config):
    seed = _select_stock_seed(db_query, live_config.test_org_id, min_quantity=3)
    quantity = 1

    response, body = api_json(
        "POST",
        "/api/stock-adjustments/",
        payload={
            "batch_id": seed["batch_id"],
            "quantity_adjusted": quantity,
            "adjustment_type": "other",
            "adjustment_date": _today_iso(),
            "reason": "live_erp stock adjustment verification",
            "location_id": seed["location_id"],
        },
    )

    assert response.status_code == 200, body
    assert body.get("movement_id"), body
    assert float(body["old_quantity"]) == float(seed["batch_qty"])
    assert float(body["new_quantity"]) == float(seed["batch_qty"]) + quantity
    assert body["adjustment_type"] == "stock_adjustment"

    movement = db_query(
        """
        SELECT movement_type, movement_direction, quantity, reference_type
        FROM inventory.inventory_movements
        WHERE movement_id = %s
        """,
        (body["movement_id"],),
    )[0]
    assert movement["movement_type"] == "stock_adjustment"
    assert movement["movement_direction"] == "in"
    assert float(movement["quantity"]) == quantity
    assert movement["reference_type"] == "adjustment"

    batch_after = db_query(
        "SELECT quantity_available FROM inventory.batches WHERE batch_id = %s",
        (seed["batch_id"],),
    )[0]["quantity_available"]
    assert float(batch_after) == float(seed["batch_qty"]) + quantity
    assert _location_stock_quantity(db_query, seed["batch_id"], seed["location_id"]) == float(seed["lws_qty"]) + quantity

    cleanup_response, cleanup_body = api_json(
        "POST",
        "/api/stock-movements/issue",
        payload={
            "product_id": seed["product_id"],
            "batch_id": seed["batch_id"],
            "quantity": quantity,
            "movement_date": _today_iso(),
            "reason": "damaged",
            "notes": "live_erp cleanup after stock adjustment verification",
        },
    )
    assert cleanup_response.status_code == 200, cleanup_body


def test_stock_writeoff_impacts_expected_tables(api_json, db_query, live_config):
    seed = _select_stock_seed(db_query, live_config.test_org_id, min_quantity=3)
    quantity = 1
    unit_cost = float(seed["unit_cost"] or 50)

    response, body = api_json(
        "POST",
        "/api/stock-writeoff/",
        payload={
            "write_off_date": _today_iso(),
            "reason": "damaged",
            "reason_notes": "live_erp stock writeoff verification",
            "items": [
                {
                    "product_id": seed["product_id"],
                    "batch_id": seed["batch_id"],
                    "quantity": quantity,
                    "cost_price": unit_cost,
                    "gst_percent": 18,
                }
            ],
        },
    )

    assert response.status_code == 200, body
    assert body["success"] is True
    assert body["requires_itc_reversal"] is True
    assert float(body["total_cost_value"]) == unit_cost * quantity
    assert round(float(body["total_itc_reversal"]), 2) == round(unit_cost * quantity * 0.18, 2)

    writeoff = db_query(
        """
        SELECT writeoff_number, reason, total_cost_value, total_itc_reversal, requires_itc_reversal, status
        FROM inventory.stock_writeoffs
        WHERE writeoff_id = %s
        """,
        (body["writeoff_id"],),
    )[0]
    assert writeoff["reason"] == "damaged"
    assert float(writeoff["total_cost_value"]) == unit_cost * quantity
    assert round(float(writeoff["total_itc_reversal"]), 2) == round(unit_cost * quantity * 0.18, 2)
    assert writeoff["requires_itc_reversal"] is True
    assert writeoff["status"] == "approved"

    writeoff_item = db_query(
        """
        SELECT product_id, batch_id, quantity, cost_price, gst_percent
        FROM inventory.stock_writeoff_items
        WHERE writeoff_id = %s
        """,
        (body["writeoff_id"],),
    )[0]
    assert writeoff_item["product_id"] == seed["product_id"]
    assert writeoff_item["batch_id"] == seed["batch_id"]
    assert float(writeoff_item["quantity"]) == quantity
    assert float(writeoff_item["cost_price"]) == unit_cost
    assert float(writeoff_item["gst_percent"]) == 18

    movement = db_query(
        """
        SELECT movement_type, movement_direction, quantity, reference_type, reference_number
        FROM inventory.inventory_movements
        WHERE reference_type = 'stock_writeoff'
          AND reference_number = %s
        ORDER BY movement_id DESC
        LIMIT 1
        """,
        (body["writeoff_id"],),
    )[0]
    assert movement["movement_type"] == "writeoff"
    assert movement["movement_direction"] == "out"
    assert float(movement["quantity"]) == quantity
    assert movement["reference_type"] == "stock_writeoff"

    batch_after = db_query(
        "SELECT quantity_available FROM inventory.batches WHERE batch_id = %s",
        (seed["batch_id"],),
    )[0]["quantity_available"]
    assert float(batch_after) == float(seed["batch_qty"]) - quantity
    assert _location_stock_quantity(db_query, seed["batch_id"], seed["location_id"]) == float(seed["lws_qty"]) - quantity

    gst_adjustment = db_query(
        """
        SELECT adjustment_type, reference_type, amount
        FROM compliance.gst_adjustments
        WHERE reference_type = 'stock_writeoff'
          AND reference_id = %s
        ORDER BY adjustment_id DESC
        LIMIT 1
        """,
        (body["writeoff_id"],),
    )[0]
    assert gst_adjustment["adjustment_type"] == "itc_reversal"
    assert gst_adjustment["reference_type"] == "stock_writeoff"
    assert round(float(gst_adjustment["amount"]), 2) == round(unit_cost * quantity * 0.18, 2)

    cleanup_response, cleanup_body = api_json(
        "POST",
        "/api/stock-movements/receive",
        payload={
            "product_id": seed["product_id"],
            "batch_id": seed["batch_id"],
            "quantity": quantity,
            "movement_date": _today_iso(),
            "reason": "adjustment",
            "notes": "live_erp cleanup after stock writeoff verification",
        },
    )
    assert cleanup_response.status_code == 200, cleanup_body


def test_purchase_return_create_and_cancel_impacts_expected_tables(api_json, db_query, db_scalar, live_config, unique_suffix):
    purchase = _create_live_purchase_entry(api_json, db_query, db_scalar, live_config, f"{unique_suffix}-pr", quantity=2)
    batch_before = float(purchase["batch"]["quantity_available"])
    location_before = _location_stock_quantity(db_query, purchase["batch"]["batch_id"], purchase["location_id"])

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
            "notes": f"LIVE ERP purchase return verification {unique_suffix}",
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
    assert body.get("return_id"), body
    assert body.get("debit_note_number"), body

    purchase_return = db_query(
        """
        SELECT supplier_invoice_id, grn_id, supplier_id, return_amount, tax_amount, total_amount,
               debit_note_number, debit_note_status, approval_status
        FROM procurement.purchase_returns
        WHERE return_id = %s
        """,
        (body["return_id"],),
    )[0]
    assert purchase_return["supplier_invoice_id"] == purchase["response"]["invoice_id"]
    assert purchase_return["grn_id"] == purchase["response"]["grn_id"]
    assert purchase_return["supplier_id"] == purchase["supplier_id"]
    assert float(purchase_return["return_amount"]) == 50
    assert float(purchase_return["tax_amount"]) == 9
    assert float(purchase_return["total_amount"]) == 59
    assert purchase_return["debit_note_number"] == body["debit_note_number"]
    assert purchase_return["debit_note_status"] == "issued"

    return_item = db_query(
        """
        SELECT grn_item_id, product_id, batch_id, return_quantity, saleable_quantity, disposition
        FROM procurement.purchase_return_items
        WHERE return_id = %s
        """,
        (body["return_id"],),
    )[0]
    assert return_item["grn_item_id"] == purchase["grn_item"]["grn_item_id"]
    assert return_item["product_id"] == purchase["seed"]["product_id"]
    assert return_item["batch_id"] == purchase["batch"]["batch_id"]
    assert float(return_item["return_quantity"]) == 1
    assert float(return_item["saleable_quantity"]) == 1
    assert return_item["disposition"] == "RETURN_TO_SUPPLIER"

    invoice_item_after_create = db_query(
        """
        SELECT quantity_returned
        FROM procurement.supplier_invoice_items
        WHERE invoice_item_id = %s
        """,
        (purchase["invoice_item"]["invoice_item_id"],),
    )[0]["quantity_returned"]
    assert float(invoice_item_after_create or 0) == 1

    grn_item_after_create = db_query(
        """
        SELECT quantity_returned
        FROM procurement.grn_items
        WHERE grn_item_id = %s
        """,
        (purchase["grn_item"]["grn_item_id"],),
    )[0]["quantity_returned"]
    assert float(grn_item_after_create or 0) == 1

    movement = db_query(
        """
        SELECT movement_type, movement_direction, quantity, location_id, reference_type
        FROM inventory.inventory_movements
        WHERE reference_type = 'PURCHASE_RETURN'
          AND reference_id = %s
        ORDER BY movement_id DESC
        LIMIT 1
        """,
        (body["return_id"],),
    )[0]
    assert movement["movement_type"] == "PURCHASE_RETURN"
    assert movement["movement_direction"] == "out"
    assert float(movement["quantity"]) == 1
    assert movement["location_id"] == purchase["location_id"]

    batch_after_create = db_query(
        """
        SELECT quantity_available, quantity_returned
        FROM inventory.batches
        WHERE batch_id = %s
        """,
        (purchase["batch"]["batch_id"],),
    )[0]
    assert float(batch_after_create["quantity_available"]) == batch_before - 1
    assert float(batch_after_create["quantity_returned"] or 0) >= 1
    assert _location_stock_quantity(db_query, purchase["batch"]["batch_id"], purchase["location_id"]) == location_before - 1

    debit_note = db_query(
        """
        SELECT debit_note_id, reference_type, reference_id, total_amount, status
        FROM financial.debit_notes
        WHERE reference_type = 'PURCHASE_RETURN'
          AND reference_id = %s
        ORDER BY debit_note_id DESC
        LIMIT 1
        """,
        (body["return_id"],),
    )[0]
    assert debit_note["reference_type"] == "PURCHASE_RETURN"
    assert debit_note["reference_id"] == body["return_id"]
    assert float(debit_note["total_amount"]) == 59
    assert debit_note["status"] == "approved"

    supplier_outstanding = db_query(
        """
        SELECT document_type, document_id, original_amount, outstanding_amount, status
        FROM financial.supplier_outstanding
        WHERE document_type = 'debit_note'
          AND document_id = %s
        ORDER BY outstanding_id DESC
        LIMIT 1
        """,
        (debit_note["debit_note_id"],),
    )[0]
    assert supplier_outstanding["document_type"] == "debit_note"
    assert supplier_outstanding["document_id"] == debit_note["debit_note_id"]
    assert float(supplier_outstanding["original_amount"]) == -59
    assert float(supplier_outstanding["outstanding_amount"]) == -59
    assert supplier_outstanding["status"] == "open"

    cancel_response, cancel_body = api_json("DELETE", f"/api/purchase-returns/{body['return_id']}")
    assert cancel_response.status_code == 200, cancel_body

    purchase_return_after_cancel = db_query(
        """
        SELECT approval_status, debit_note_status
        FROM procurement.purchase_returns
        WHERE return_id = %s
        """,
        (body["return_id"],),
    )[0]
    assert purchase_return_after_cancel["approval_status"] == "cancelled"
    assert purchase_return_after_cancel["debit_note_status"] == "cancelled"

    invoice_item_after_cancel = db_query(
        """
        SELECT quantity_returned
        FROM procurement.supplier_invoice_items
        WHERE invoice_item_id = %s
        """,
        (purchase["invoice_item"]["invoice_item_id"],),
    )[0]["quantity_returned"]
    assert float(invoice_item_after_cancel or 0) == 0

    grn_item_after_cancel = db_query(
        """
        SELECT quantity_returned
        FROM procurement.grn_items
        WHERE grn_item_id = %s
        """,
        (purchase["grn_item"]["grn_item_id"],),
    )[0]["quantity_returned"]
    assert float(grn_item_after_cancel or 0) == 0

    batch_after_cancel = db_query(
        """
        SELECT quantity_available
        FROM inventory.batches
        WHERE batch_id = %s
        """,
        (purchase["batch"]["batch_id"],),
    )[0]["quantity_available"]
    assert float(batch_after_cancel) == batch_before
    assert _location_stock_quantity(db_query, purchase["batch"]["batch_id"], purchase["location_id"]) == location_before

    remaining_movements = db_query(
        """
        SELECT movement_id
        FROM inventory.inventory_movements
        WHERE reference_type = 'PURCHASE_RETURN'
          AND reference_id = %s
        """,
        (body["return_id"],),
    )
    assert remaining_movements == []

    debit_note_after_cancel = db_query(
        """
        SELECT status
        FROM financial.debit_notes
        WHERE debit_note_id = %s
        """,
        (debit_note["debit_note_id"],),
    )[0]["status"]
    assert debit_note_after_cancel == "cancelled"

    supplier_outstanding_after_cancel = db_query(
        """
        SELECT outstanding_amount, status
        FROM financial.supplier_outstanding
        WHERE document_type = 'debit_note'
          AND document_id = %s
        ORDER BY outstanding_id DESC
        LIMIT 1
        """,
        (debit_note["debit_note_id"],),
    )[0]
    assert float(supplier_outstanding_after_cancel["outstanding_amount"]) == 0
    assert supplier_outstanding_after_cancel["status"] == "cancelled"


def test_invoice_cancel_reverses_inventory_and_outstanding(api_json, db_query, live_config, unique_suffix):
    invoice_context = _create_live_invoice(
        api_json,
        db_query,
        live_config,
        f"{unique_suffix}-cancel",
        quantity=1,
        require_gst_customer=True,
    )
    invoice = invoice_context["response"]
    seed = invoice_context["seed"]

    batch_after_invoice = db_query(
        "SELECT quantity_available FROM inventory.batches WHERE batch_id = %s",
        (seed["batch_id"],),
    )[0]["quantity_available"]
    lws_after_invoice = _location_stock_quantity(db_query, seed["batch_id"], seed["location_id"])
    assert float(batch_after_invoice) == float(seed["batch_qty"]) - 1
    assert float(lws_after_invoice) == float(seed["lws_qty"]) - 1

    response, body = api_json(
        "POST",
        f"/api/invoices/{invoice['invoice_id']}/cancel",
        payload={
            "reason": f"LIVE ERP invoice cancel verification {unique_suffix}",
            "create_credit_note": False,
            "reverse_inventory": True,
        },
    )
    assert response.status_code == 200, body
    assert body["success"] is True

    invoice_after_cancel = db_query(
        """
        SELECT invoice_status
        FROM sales.invoices
        WHERE invoice_id = %s
        """,
        (invoice["invoice_id"],),
    )[0]["invoice_status"]
    assert invoice_after_cancel == "cancelled"

    batch_after_cancel = db_query(
        "SELECT quantity_available FROM inventory.batches WHERE batch_id = %s",
        (seed["batch_id"],),
    )[0]["quantity_available"]
    assert float(batch_after_cancel) == float(seed["batch_qty"])
    assert _location_stock_quantity(db_query, seed["batch_id"], seed["location_id"]) == float(seed["lws_qty"])

    movement_rows = db_query(
        """
        SELECT movement_id
        FROM inventory.inventory_movements
        WHERE reference_type = 'invoice'
          AND reference_id = %s
        """,
        (invoice["invoice_id"],),
    )
    assert movement_rows == []

    outstanding_rows = _invoice_outstanding_rows(db_query, invoice["invoice_id"])
    assert len(outstanding_rows) == 1, outstanding_rows
    assert outstanding_rows[0]["document_type"] == "INVOICE"
    assert float(outstanding_rows[0]["outstanding_amount"]) == 0
    assert outstanding_rows[0]["status"] == "cancelled"
