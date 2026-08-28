"""Bounded, parse-only purchase-invoice upload utility.

The parser extracts candidate facts from a caller-supplied PDF. It does not
resolve canonical supplier identity, validate canonical invoice uniqueness, or
persist business data. Those decisions require the reviewed supplier-invoice
command context (including supplier UUID, invoice date, and fiscal year).
"""

from __future__ import annotations

import logging
import os
import tempfile
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from .....core.auth.org_context import OrgContext, get_org_context
from .....core.money import money_json
from .....core.security.permissions import PermissionChecker
from .....core.utils.file_validation import validate_upload

try:
    from bill_parser import parse_pdf

    BILL_PARSER_AVAILABLE = True
except ImportError:
    BILL_PARSER_AVAILABLE = False
    parse_pdf = None

try:
    from ....parsers import InvoiceParserFactory

    FACTORY_PARSER_AVAILABLE = True
except ImportError:
    FACTORY_PARSER_AVAILABLE = False

try:
    from ..pharma_invoice_parser import parse_pharma_invoice

    CUSTOM_PARSER_AVAILABLE = True
except ImportError:
    CUSTOM_PARSER_AVAILABLE = False


logger = logging.getLogger(__name__)
router = APIRouter(tags=["purchase-upload"])

_SUPPLIER_AUTHORITY_FIELDS = frozenset({
    "existing_supplier",
    "supplier_exists",
    "supplier_id",
    "supplier_match_type",
})


def _mark_supplier_match_not_performed(result: dict[str, Any]) -> dict[str, Any]:
    """Remove parser-owned identity guesses from a parse-only response."""

    extracted_data = result.get("extracted_data")
    if isinstance(extracted_data, dict):
        for field in _SUPPLIER_AUTHORITY_FIELDS:
            extracted_data.pop(field, None)
        extracted_data["supplier_match_status"] = "not_performed"
    return result


@router.post("/parse-invoice-safe")
async def parse_purchase_invoice_safe(
    file: UploadFile = File(...),
    _: dict = Depends(PermissionChecker("purchase", "view")),
    _context: OrgContext = Depends(get_org_context),
):
    """Extract candidate invoice facts without database reads or persistence."""

    try:
        # This remains the authority for extension, magic-byte, and size checks.
        content = await validate_upload(file, allowed_types=["pdf"], max_size_mb=10)

        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp_file:
            tmp_file.write(content)
            tmp_path = tmp_file.name

        try:
            try:
                if not BILL_PARSER_AVAILABLE:
                    raise ImportError("bill_parser not available")
                invoice_data = parse_pdf(tmp_path)
                items_found = hasattr(invoice_data, "items") and len(invoice_data.items) > 0
                supplier_found = bool(getattr(invoice_data, "supplier_name", ""))

                response_data = {
                    "success": items_found,
                    "extracted_data": {
                        "invoice_number": getattr(invoice_data, "invoice_number", ""),
                        "invoice_date": (
                            invoice_data.invoice_date.isoformat()
                            if hasattr(invoice_data, "invoice_date") and invoice_data.invoice_date
                            else None
                        ),
                        "supplier_name": getattr(invoice_data, "supplier_name", ""),
                        "supplier_gstin": getattr(invoice_data, "supplier_gstin", ""),
                        "supplier_address": getattr(invoice_data, "supplier_address", ""),
                        "drug_license": getattr(invoice_data, "drug_license_number", ""),
                        "subtotal": (
                            money_json(invoice_data.subtotal)
                            if getattr(invoice_data, "subtotal", None) is not None
                            else None
                        ),
                        "tax_amount": (
                            money_json(invoice_data.tax_amount)
                            if getattr(invoice_data, "tax_amount", None) is not None
                            else None
                        ),
                        "discount_amount": (
                            money_json(invoice_data.discount_amount)
                            if getattr(invoice_data, "discount_amount", None) is not None
                            else None
                        ),
                        "grand_total": (
                            money_json(invoice_data.grand_total)
                            if getattr(invoice_data, "grand_total", None) is not None
                            else None
                        ),
                        "items": [],
                    },
                    "confidence_score": getattr(invoice_data, "confidence", None),
                    "manual_review_required": True,
                }

                if hasattr(invoice_data, "items") and invoice_data.items:
                    for item in invoice_data.items:
                        try:
                            response_data["extracted_data"]["items"].append({
                                "product_name": getattr(item, "description", ""),
                                "hsn_code": getattr(item, "hsn_code", ""),
                                "batch_number": getattr(item, "batch_number", ""),
                                "expiry_date": getattr(item, "expiry_date", ""),
                                "quantity": (
                                    int(item.quantity)
                                    if getattr(item, "quantity", None) is not None
                                    else None
                                ),
                                "unit": getattr(item, "unit", None),
                                "cost_price": (
                                    money_json(item.rate)
                                    if getattr(item, "rate", None) is not None
                                    else None
                                ),
                                "mrp": (
                                    money_json(item.mrp)
                                    if getattr(item, "mrp", None) is not None
                                    else None
                                ),
                                "discount_percent": (
                                    float(item.discount_percent)
                                    if getattr(item, "discount_percent", None) is not None
                                    else None
                                ),
                                "tax_percent": (
                                    float(item.tax_percent)
                                    if getattr(item, "tax_percent", None) is not None
                                    else None
                                ),
                                "amount": (
                                    money_json(item.amount)
                                    if getattr(item, "amount", None) is not None
                                    else None
                                ),
                            })
                        except Exception as exc:
                            logger.warning("Error processing parsed item: %s", exc)

                if not items_found:
                    if FACTORY_PARSER_AVAILABLE:
                        try:
                            factory_result = InvoiceParserFactory.parse_invoice(tmp_path)
                            if factory_result["success"] and factory_result["extracted_data"]["items"]:
                                return _mark_supplier_match_not_performed(factory_result)
                        except Exception:
                            pass
                    if CUSTOM_PARSER_AVAILABLE:
                        try:
                            custom_result = parse_pharma_invoice(tmp_path)
                            if custom_result["success"] and custom_result["extracted_data"]["items"]:
                                if supplier_found:
                                    custom_result["extracted_data"]["supplier_name"] = invoice_data.supplier_name
                                    custom_result["extracted_data"]["supplier_gstin"] = invoice_data.supplier_gstin
                                return _mark_supplier_match_not_performed(custom_result)
                        except Exception:
                            pass
                    if supplier_found:
                        response_data["message"] = "Partial extraction: found supplier text but no items."
                        response_data["partial_extraction"] = True

                return _mark_supplier_match_not_performed(response_data)
            except Exception:
                if FACTORY_PARSER_AVAILABLE:
                    try:
                        factory_result = InvoiceParserFactory.parse_invoice(tmp_path)
                        if factory_result["success"] and factory_result["extracted_data"]["items"]:
                            return _mark_supplier_match_not_performed(factory_result)
                    except Exception:
                        pass
                if CUSTOM_PARSER_AVAILABLE:
                    try:
                        custom_result = parse_pharma_invoice(tmp_path)
                        if custom_result["success"]:
                            return _mark_supplier_match_not_performed(custom_result)
                    except Exception:
                        pass
                return _mark_supplier_match_not_performed({
                    "success": False,
                    "message": "Could not extract data automatically.",
                    "extracted_data": {
                        "invoice_number": "",
                        "invoice_date": None,
                        "supplier_name": "",
                        "supplier_gstin": "",
                        "items": [],
                    },
                    "confidence_score": None,
                    "manual_review_required": True,
                })
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error in parse_invoice_safe: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to process invoice") from exc
