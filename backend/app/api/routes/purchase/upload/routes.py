"""
Purchase Order Upload and Extraction API Router
REFACTORED: Uses UploadService for database operations
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
import logging
from datetime import datetime
import os
import tempfile
import shutil
from ....services.document_number_service import DocumentNumberService
from ....services.purchase.upload.service import UploadService
from ....services.master.product.service import ProductService
from decimal import Decimal

from .....core.utils.constants import ProductDefaults, PackDefaults
from .....core.auth.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession
from .....core.auth.org_context import get_org_context, OrgContext
from .....core.security.permissions import PermissionChecker

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


def _check_supplier_in_result(extracted_data: dict, db: TenantAwareSession):
    """Check if supplier exists and add supplier info to result"""
    try:
        gstin = extracted_data.get("supplier_gstin")
        name = extracted_data.get("supplier_name")
        
        if gstin:
            supplier = UploadService.get_supplier_by_gstin(db, gstin)
            if supplier:
                extracted_data["supplier_exists"] = True
                extracted_data["supplier_id"] = supplier["supplier_id"]
                extracted_data["existing_supplier"] = {
                    "supplier_id": supplier["supplier_id"], "supplier_name": supplier["supplier_name"],
                    "address": supplier.get("address"), "phone": supplier.get("phone"),
                    "drug_license_number": supplier.get("drug_license_number")
                }
                return
        
        if name:
            supplier = UploadService.get_supplier_by_name(db, name)
            if supplier:
                extracted_data["supplier_exists"] = True
                extracted_data["supplier_match_type"] = "name"
                extracted_data["supplier_id"] = supplier["supplier_id"]
                extracted_data["existing_supplier"] = {
                    "supplier_id": supplier["supplier_id"], "supplier_name": supplier["supplier_name"],
                    "gst_number": supplier.get("gst_number"), "address": supplier.get("address"),
                    "phone": supplier.get("phone"), "drug_license_number": supplier.get("drug_license_number")
                }
                return
        
        extracted_data["supplier_exists"] = False
    except Exception as e:
        logger.warning(f"Error checking supplier: {e}")


@router.get("/version")
@with_tenant_context
async def get_parser_version():
    return {"status": "ok", "custom_parser": "available" if CUSTOM_PARSER_AVAILABLE else "not found",
            "version": "1.2", "module_imported": CUSTOM_PARSER_AVAILABLE}


@router.get("/check-supplier")
@with_tenant_context
async def check_supplier(
    gstin: Optional[str] = None, name: Optional[str] = None,
    _: dict = Depends(PermissionChecker("purchase", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Check if supplier exists by GSTIN or name"""
    try:
        if gstin:
            supplier = UploadService.get_supplier_by_gstin(db, gstin)
            if supplier:
                return {"exists": True, "supplier": {
                    "supplier_id": supplier["supplier_id"], "supplier_name": supplier["supplier_name"],
                    "gst_number": supplier.get("gst_number"), "address": supplier.get("address"),
                    "phone": supplier.get("phone"), "email": supplier.get("email"),
                    "drug_license_number": supplier.get("drug_license_number")
                }}
        
        if name:
            supplier = UploadService.get_supplier_by_name_fuzzy(db, name)
            if supplier:
                return {"exists": True, "match_type": "name", "supplier": {
                    "supplier_id": supplier["supplier_id"], "supplier_name": supplier["supplier_name"],
                    "gst_number": supplier.get("gst_number"), "address": supplier.get("address"),
                    "phone": supplier.get("phone"), "email": supplier.get("email"),
                    "drug_license_number": supplier.get("drug_license_number")
                }}
        
        return {"exists": False}
    except Exception as e:
        logger.error(f"Error checking supplier: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/parse-pdf")
@router.post("/parse-invoice-safe")
@with_tenant_context
async def parse_purchase_invoice_safe(
    file: UploadFile = File(...),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Parse a purchase invoice PDF with better error handling"""
    try:
        if not file.filename.lower().endswith('.pdf'):
            raise HTTPException(status_code=400, detail="Only PDF files are supported")
        
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as tmp_file:
            shutil.copyfileobj(file.file, tmp_file)
            tmp_path = tmp_file.name
        
        try:
            try:
                if not BILL_PARSER_AVAILABLE:
                    raise ImportError("bill_parser not available")
                invoice_data = parse_pdf(tmp_path)
                items_found = hasattr(invoice_data, 'items') and len(invoice_data.items) > 0
                supplier_found = bool(getattr(invoice_data, 'supplier_name', ''))
                
                response_data = {
                    "success": items_found, "extracted_data": {
                        "invoice_number": getattr(invoice_data, 'invoice_number', ''),
                        "invoice_date": getattr(invoice_data, 'invoice_date', datetime.now()).isoformat() if hasattr(invoice_data, 'invoice_date') and invoice_data.invoice_date else datetime.now().isoformat()[:10],
                        "supplier_name": getattr(invoice_data, 'supplier_name', ''),
                        "supplier_gstin": getattr(invoice_data, 'supplier_gstin', ''),
                        "supplier_address": getattr(invoice_data, 'supplier_address', ''),
                        "drug_license": getattr(invoice_data, 'drug_license_number', ''),
                        "subtotal": float(getattr(invoice_data, 'subtotal', 0) or 0),
                        "tax_amount": float(getattr(invoice_data, 'tax_amount', 0) or 0),
                        "discount_amount": float(getattr(invoice_data, 'discount_amount', 0) or 0),
                        "grand_total": float(getattr(invoice_data, 'grand_total', 0) or 0),
                        "items": []
                    }, "confidence_score": getattr(invoice_data, 'confidence', 0.5), "manual_review_required": True
                }
                
                if hasattr(invoice_data, 'items') and invoice_data.items:
                    for item in invoice_data.items:
                        try:
                            response_data["extracted_data"]["items"].append({
                                "product_name": getattr(item, 'description', ''), "hsn_code": getattr(item, 'hsn_code', ''),
                                "batch_number": getattr(item, 'batch_number', ''), "expiry_date": getattr(item, 'expiry_date', ''),
                                "quantity": int(getattr(item, 'quantity', 0) or 0), "unit": getattr(item, 'unit', ''),
                                "cost_price": float(getattr(item, 'rate', 0) or 0), "mrp": float(getattr(item, 'mrp', 0) or 0),
                                "discount_percent": float(getattr(item, 'discount_percent', 0) or 0),
                                "tax_percent": float(getattr(item, 'tax_percent', 12) or 12),
                                "amount": float(getattr(item, 'amount', 0) or 0)
                            })
                        except Exception as e:
                            logger.warning(f"Error processing item: {e}")
                
                if not items_found:
                    if FACTORY_PARSER_AVAILABLE:
                        try:
                            factory_result = InvoiceParserFactory.parse_invoice(tmp_path)
                            if factory_result["success"] and factory_result["extracted_data"]["items"]:
                                _check_supplier_in_result(factory_result["extracted_data"], db)
                                return factory_result
                        except Exception:
                            pass
                    if CUSTOM_PARSER_AVAILABLE:
                        try:
                            custom_result = parse_pharma_invoice(tmp_path)
                            if custom_result["success"] and custom_result["extracted_data"]["items"]:
                                if supplier_found:
                                    custom_result["extracted_data"]["supplier_name"] = invoice_data.supplier_name
                                    custom_result["extracted_data"]["supplier_gstin"] = invoice_data.supplier_gstin
                                _check_supplier_in_result(custom_result["extracted_data"], db)
                                return custom_result
                        except Exception:
                            pass
                    if supplier_found:
                        response_data["message"] = f"Partial extraction: Found supplier but no items."
                        response_data["partial_extraction"] = True
                
                _check_supplier_in_result(response_data["extracted_data"], db)
                return response_data
            except Exception:
                if FACTORY_PARSER_AVAILABLE:
                    try:
                        factory_result = InvoiceParserFactory.parse_invoice(tmp_path)
                        if factory_result["success"] and factory_result["extracted_data"]["items"]:
                            _check_supplier_in_result(factory_result["extracted_data"], db)
                            return factory_result
                    except Exception:
                        pass
                if CUSTOM_PARSER_AVAILABLE:
                    try:
                        custom_result = parse_pharma_invoice(tmp_path)
                        if custom_result["success"]:
                            _check_supplier_in_result(custom_result["extracted_data"], db)
                            return custom_result
                    except Exception:
                        pass
                return {
                    "success": False, "message": "Could not extract data automatically.",
                    "extracted_data": {"invoice_number": "", "invoice_date": datetime.now().isoformat()[:10],
                                      "supplier_name": "", "supplier_gstin": "", "items": []},
                    "confidence_score": 0, "manual_review_required": True
                }
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
    except Exception as e:
        logger.error(f"Error in parse_invoice_safe: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to process invoice: {str(e)}")


@router.post("/parse-invoice")
@with_tenant_context
async def parse_purchase_invoice(
    file: UploadFile = File(...),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Upload and parse a purchase invoice (PDF/image)"""
    try:
        allowed_types = ["application/pdf", "image/jpeg", "image/png", "image/jpg"]
        if file.content_type not in allowed_types:
            raise HTTPException(status_code=400, detail=f"File type {file.content_type} not allowed")
        
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1]) as tmp_file:
            shutil.copyfileobj(file.file, tmp_file)
            tmp_path = tmp_file.name
        
        try:
            invoice_data = parse_pdf(tmp_path)
            if not invoice_data:
                raise HTTPException(status_code=422, detail="Could not extract data")
            
            response_data = {
                "status": "success", "confidence_score": getattr(invoice_data, 'confidence_score', 0.0),
                "extracted_data": {
                    "invoice_number": invoice_data.invoice_number,
                    "invoice_date": invoice_data.invoice_date.isoformat() if invoice_data.invoice_date else None,
                    "supplier_name": invoice_data.supplier_name, "supplier_gstin": invoice_data.supplier_gstin,
                    "supplier_address": invoice_data.supplier_address, "drug_license": invoice_data.drug_license_number,
                    "subtotal": float(invoice_data.subtotal or 0), "tax_amount": float(invoice_data.tax_amount or 0),
                    "discount_amount": float(invoice_data.discount_amount or 0), "grand_total": float(invoice_data.grand_total or 0),
                    "items": []
                }, "manual_review_required": False
            }
            
            for item in invoice_data.items:
                response_data["extracted_data"]["items"].append({
                    "description": item.description, "hsn_code": item.hsn_code, "batch_number": item.batch_number,
                    "expiry_date": item.expiry_date, "quantity": item.quantity, "unit": item.unit,
                    "rate": float(item.rate or 0), "mrp": float(item.mrp or 0),
                    "discount_percent": float(item.discount_percent or 0), "tax_percent": float(item.tax_percent or 0),
                    "amount": float(item.amount or 0)
                })
            
            if getattr(invoice_data, 'confidence_score', 0) < 0.8:
                response_data["manual_review_required"] = True
                response_data["review_reason"] = "Low confidence score"
            
            if invoice_data.supplier_gstin:
                supplier = UploadService.get_supplier_by_gstin(db, invoice_data.supplier_gstin)
                if supplier:
                    response_data["extracted_data"]["supplier_id"] = supplier["supplier_id"]
                    response_data["extracted_data"]["supplier_matched"] = True
                else:
                    response_data["extracted_data"]["supplier_matched"] = False
            
            for item in response_data["extracted_data"]["items"]:
                if item["description"]:
                    product = UploadService.get_product_by_name(db, item["description"])
                    if not product and item.get("hsn_code"):
                        product = UploadService.get_product_by_hsn(db, item["hsn_code"])
                    if product:
                        item["product_id"] = product["product_id"]
                        item["product_matched"] = True
                        item["matched_product_name"] = product["product_name"]
                    else:
                        item["product_matched"] = False
            
            _check_supplier_in_result(response_data["extracted_data"], db)
            return response_data
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error parsing invoice: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to parse invoice: {str(e)}")


@router.post("/create-from-parsed")
@with_tenant_context
async def create_purchase_from_parsed(
    purchase_data: dict,
    _: dict = Depends(PermissionChecker("purchase", "create")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Create purchase order from parsed/verified invoice data"""
    try:
        supplier_id = purchase_data.get("supplier_id")
        if not supplier_id:
            supplier_data = purchase_data.get("supplier", {})
            if not supplier_data.get("supplier_name"):
                raise HTTPException(status_code=400, detail="Supplier name is required")
            supplier_code = f"SUP{datetime.now().strftime('%Y%m%d%H%M')}"
            supplier_id = UploadService.create_supplier(db, {
                "org_id": str(context.org_id), "code": supplier_code,
                "name": supplier_data.get("supplier_name"),
                "gstin": supplier_data.get("supplier_gstin", supplier_data.get("gst_number")),
                "address": supplier_data.get("supplier_address", supplier_data.get("address")),
                "phone": supplier_data.get("phone", ""), "email": supplier_data.get("email", ""),
                "drug_license": supplier_data.get("drug_license_number", supplier_data.get("drug_license", ""))
            })
        
        purchase_number = DocumentNumberService.generate_number(db, "purchase_order", str(context.org_id))
        purchase_id = UploadService.create_purchase_order(db, {
            "org_id": str(context.org_id), "branch_id": context.branch_id or context.primary_branch_id,
            "purchase_number": purchase_number, "purchase_date": purchase_data.get("purchase_date", datetime.now().date()),
            "supplier_id": supplier_id, "invoice_number": purchase_data.get("invoice_number"),
            "subtotal": Decimal(str(purchase_data.get("subtotal", 0))),
            "discount": Decimal(str(purchase_data.get("discount_amount", 0))),
            "tax": Decimal(str(purchase_data.get("tax_amount", 0))),
            "other_charges": Decimal(str(purchase_data.get("other_charges", 0))),
            "total": Decimal(str(purchase_data.get("grand_total", 0)))
        })
        
        items_created = 0
        for item in purchase_data.get("items", []):
            product_id = item.get("product_id")
            if not product_id and item.get("create_product", False):
                product_id = ProductService.get_or_create_product(
                    db=db,
                    org_id=str(context.org_id),
                    product_name=item.get("description", "Unknown Product"),
                    hsn_code=item.get("hsn_code"),
                    user_id=getattr(context, 'user_id', None),
                    gst_percent=float(item.get("tax_percent", ProductDefaults.DEFAULT_GST_PERCENT))
                )
            
            if product_id:
                UploadService.create_purchase_order_item(db, {
                    "purchase_order_id": purchase_id, "product_id": product_id,
                    "product_name": item.get("description"), "quantity": item.get("quantity", 0),
                    "unit_price": Decimal(str(item.get("rate", 0))), "mrp": Decimal(str(item.get("mrp", 0))),
                    "discount_percent": Decimal(str(item.get("discount_percent", 0))),
                    "discount_amount": Decimal(str(item.get("discount_amount", 0))),
                    "tax_percent": Decimal(str(item.get("tax_percent", ProductDefaults.DEFAULT_GST_PERCENT))),
                    "tax_amount": Decimal(str(item.get("tax_amount", 0))),
                    "line_total": Decimal(str(item.get("amount", 0))),
                    "batch_number": item.get("batch_number"), "expiry_date": item.get("expiry_date"),
                    "uom": item.get("unit", ProductDefaults.DEFAULT_BASE_UOM), "pack_type": item.get("pack_type", PackDefaults.PACK_TYPE)
                })
                items_created += 1
        
        return {"status": "success", "purchase_id": purchase_id, "purchase_number": purchase_number,
                "items_created": items_created, "message": f"Purchase order {purchase_number} created successfully"}
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating purchase: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create purchase order: {str(e)}")


@router.get("/parse-history")
@with_tenant_context
async def get_parse_history(
    skip: int = 0, limit: int = 10,
    _: dict = Depends(PermissionChecker("purchase", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    return {"message": "Parse history not yet implemented", "total": 0, "items": []}


@router.post("/validate-invoice")
@with_tenant_context
async def validate_invoice_data(
    invoice_data: dict,
    _: dict = Depends(PermissionChecker("purchase", "create")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Validate parsed invoice data before creation"""
    try:
        validations = {"is_valid": True, "errors": [], "warnings": []}
        
        if invoice_data.get("invoice_number") and invoice_data.get("supplier_id"):
            duplicate = UploadService.check_duplicate_invoice(db, invoice_data["invoice_number"], invoice_data["supplier_id"])
            if duplicate:
                validations["errors"].append(f"Duplicate invoice: {duplicate['supplier_invoice_number']}")
                validations["is_valid"] = False
        
        items_total = sum(Decimal(str(item.get("amount", 0))) for item in invoice_data.get("items", []))
        invoice_total = Decimal(str(invoice_data.get("grand_total", 0)))
        if abs(items_total - invoice_total) > Decimal("1.00"):
            validations["warnings"].append(f"Items total ({items_total}) doesn't match invoice total ({invoice_total})")
        
        for idx, item in enumerate(invoice_data.get("items", [])):
            if not item.get("product_id") and not item.get("create_product"):
                validations["warnings"].append(f"Item {idx + 1}: Product not matched")
            if item.get("expiry_date"):
                try:
                    expiry = datetime.fromisoformat(item["expiry_date"]).date()
                    if expiry <= datetime.now().date():
                        validations["errors"].append(f"Item {idx + 1}: Already expired")
                        validations["is_valid"] = False
                except:
                    validations["warnings"].append(f"Item {idx + 1}: Invalid expiry date format")
        
        return validations
    except Exception as e:
        logger.error(f"Error validating invoice: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to validate invoice: {str(e)}")