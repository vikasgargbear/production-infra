"""
Purchase Order Upload and Extraction API Router
Handles PDF/image upload, parsing, and purchase order creation
"""
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging
from datetime import datetime
import os
import tempfile
import shutil
from decimal import Decimal

from ...database import get_db
from bill_parser import parse_pdf
from bill_parser.models import Invoice, InvoiceItem

# Try to import custom parser at module level
try:
    from ...parsers import InvoiceParserFactory
    CUSTOM_PARSER_AVAILABLE = True
except ImportError:
    # Fallback to old parser if new one not available
    try:
        from .pharma_invoice_parser import parse_pharma_invoice
        CUSTOM_PARSER_AVAILABLE = True
    except ImportError:
        CUSTOM_PARSER_AVAILABLE = False

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/purchase-upload", tags=["purchase-upload"])

def _check_supplier_in_result(extracted_data: dict, db: Session):
    """
    Check if supplier exists and add supplier info to result
    """
    try:
        gstin = extracted_data.get("supplier_gstin")
        name = extracted_data.get("supplier_name")
        
        if gstin:
            # Check by GSTIN first
            supplier = db.execute(
                text("SELECT * FROM suppliers WHERE gst_number = :gstin"),
                {"gstin": gstin}
            ).first()
            
            if supplier:
                extracted_data["supplier_exists"] = True
                extracted_data["supplier_id"] = supplier.supplier_id
                extracted_data["existing_supplier"] = {
                    "supplier_id": supplier.supplier_id,
                    "supplier_name": supplier.supplier_name,
                    "address": supplier.address,
                    "phone": supplier.phone,
                    "drug_license_number": supplier.drug_license_number
                }
                return
        
        if name:
            # Check by name
            supplier = db.execute(
                text("SELECT * FROM suppliers WHERE LOWER(supplier_name) LIKE LOWER(:name)"),
                {"name": f"%{name}%"}
            ).first()
            
            if supplier:
                extracted_data["supplier_exists"] = True
                extracted_data["supplier_match_type"] = "name"
                extracted_data["supplier_id"] = supplier.supplier_id
                extracted_data["existing_supplier"] = {
                    "supplier_id": supplier.supplier_id,
                    "supplier_name": supplier.supplier_name,
                    "gst_number": supplier.gst_number,
                    "address": supplier.address,
                    "phone": supplier.phone,
                    "drug_license_number": supplier.drug_license_number
                }
                return
        
        extracted_data["supplier_exists"] = False
    except Exception as e:
        logger.warning(f"Error checking supplier: {e}")

@router.get("/version")
def get_parser_version():
    """Check if custom parser is available"""
    return {
        "status": "ok", 
        "custom_parser": "available" if CUSTOM_PARSER_AVAILABLE else "not found",
        "version": "1.2",
        "module_imported": CUSTOM_PARSER_AVAILABLE
    }

@router.get("/check-supplier")
async def check_supplier(
    gstin: Optional[str] = None,
    name: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Check if supplier exists by GSTIN or name
    """
    try:
        if gstin:
            # First try exact GSTIN match
            supplier = db.execute(
                text("SELECT * FROM suppliers WHERE gst_number = :gstin"),
                {"gstin": gstin}
            ).first()
            
            if supplier:
                return {
                    "exists": True,
                    "supplier": {
                        "supplier_id": supplier.supplier_id,
                        "supplier_name": supplier.supplier_name,
                        "gst_number": supplier.gst_number,
                        "address": supplier.address,
                        "phone": supplier.phone,
                        "email": supplier.email,
                        "drug_license_number": supplier.drug_license_number
                    }
                }
        
        if name:
            # Try fuzzy name match
            supplier = db.execute(
                text("""
                    SELECT * FROM suppliers 
                    WHERE LOWER(supplier_name) LIKE LOWER(:name)
                    OR LOWER(supplier_name) LIKE LOWER(:partial_name)
                """),
                {
                    "name": name,
                    "partial_name": f"%{name}%"
                }
            ).first()
            
            if supplier:
                return {
                    "exists": True,
                    "match_type": "name",
                    "supplier": {
                        "supplier_id": supplier.supplier_id,
                        "supplier_name": supplier.supplier_name,
                        "gst_number": supplier.gst_number,
                        "address": supplier.address,
                        "phone": supplier.phone,
                        "email": supplier.email,
                        "drug_license_number": supplier.drug_license_number
                    }
                }
        
        return {"exists": False}
        
    except Exception as e:
        logger.error(f"Error checking supplier: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/parse-invoice-safe")
async def parse_purchase_invoice_safe(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Parse a purchase invoice PDF with better error handling
    Falls back to template structure if parsing fails
    """
    try:
        # Validate file type
        if not file.filename.lower().endswith('.pdf'):
            raise HTTPException(
                status_code=400, 
                detail="Only PDF files are supported"
            )
        
        # Create temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as tmp_file:
            shutil.copyfileobj(file.file, tmp_file)
            tmp_path = tmp_file.name
        
        try:
            # Try to parse with bill_parser
            try:
                from bill_parser import parse_pdf
                invoice_data = parse_pdf(tmp_path)
                
                # Check if we got any useful data
                items_found = hasattr(invoice_data, 'items') and len(invoice_data.items) > 0
                supplier_found = bool(getattr(invoice_data, 'supplier_name', ''))
                
                # Successfully parsed - return structured data
                response_data = {
                    "success": items_found,  # Only successful if items were found
                    "extracted_data": {
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
                    },
                    "confidence_score": getattr(invoice_data, 'confidence', 0.5),
                    "manual_review_required": True
                }
                
                # Process items safely
                if hasattr(invoice_data, 'items') and invoice_data.items:
                    for item in invoice_data.items:
                        try:
                            item_data = {
                                "product_name": getattr(item, 'description', ''),
                                "hsn_code": getattr(item, 'hsn_code', ''),
                                "batch_number": getattr(item, 'batch_number', ''),
                                "expiry_date": getattr(item, 'expiry_date', ''),
                                "quantity": int(getattr(item, 'quantity', 0) or 0),
                                "unit": getattr(item, 'unit', ''),
                                "cost_price": float(getattr(item, 'rate', 0) or 0),
                                "mrp": float(getattr(item, 'mrp', 0) or 0),
                                "discount_percent": float(getattr(item, 'discount_percent', 0) or 0),
                                "tax_percent": float(getattr(item, 'tax_percent', 12) or 12),
                                "amount": float(getattr(item, 'amount', 0) or 0)
                            }
                            response_data["extracted_data"]["items"].append(item_data)
                        except Exception as e:
                            logger.warning(f"Error processing item: {e}")
                            continue
                
                # If no items found, try our custom parser
                if not items_found and CUSTOM_PARSER_AVAILABLE:
                    logger.info("Bill parser found no items, trying custom pharma parser...")
                    try:
                        # Use new modular parser if available
                        if 'InvoiceParserFactory' in globals():
                            custom_result = InvoiceParserFactory.parse_invoice(tmp_path)
                        else:
                            # Fallback to old parser
                            custom_result = parse_pharma_invoice(tmp_path)
                        
                        if custom_result["success"] and custom_result["extracted_data"]["items"]:
                            logger.info(f"Custom parser found {len(custom_result['extracted_data']['items'])} items")
                            # Merge results - keep bill_parser supplier info if available
                            if supplier_found:
                                custom_result["extracted_data"]["supplier_name"] = invoice_data.supplier_name
                                custom_result["extracted_data"]["supplier_gstin"] = invoice_data.supplier_gstin
                            
                            # Check for existing supplier
                            _check_supplier_in_result(custom_result["extracted_data"], db)
                            return custom_result
                    except Exception as custom_err:
                        logger.warning(f"Custom parser failed: {custom_err}")
                    
                    # If still no items, provide partial extraction message
                    if supplier_found:
                        response_data["message"] = f"Partial extraction: Found supplier '{invoice_data.supplier_name}' but no line items. Please add items manually."
                        response_data["partial_extraction"] = True
                
                # Check for existing supplier before returning
                _check_supplier_in_result(response_data["extracted_data"], db)
                return response_data
                
            except Exception as parse_error:
                logger.warning(f"Bill parser failed: {parse_error}")
                
                # Try our custom parser before giving up
                if CUSTOM_PARSER_AVAILABLE:
                    try:
                        logger.info("Trying custom pharma parser as fallback...")
                        # Use new modular parser if available
                        if 'InvoiceParserFactory' in globals():
                            custom_result = InvoiceParserFactory.parse_invoice(tmp_path)
                        else:
                            # Fallback to old parser
                            custom_result = parse_pharma_invoice(tmp_path)
                            
                        if custom_result["success"]:
                            # Check for existing supplier
                            _check_supplier_in_result(custom_result["extracted_data"], db)
                            return custom_result
                    except Exception as custom_err:
                        logger.error(f"Custom parser also failed: {custom_err}")
                
                # Fallback: Return template for manual entry
                return {
                    "success": False,
                    "message": "Could not extract data automatically. Please fill in manually.",
                    "extracted_data": {
                        "invoice_number": "",
                        "invoice_date": datetime.now().isoformat()[:10],
                        "supplier_name": "",
                        "supplier_gstin": "",
                        "supplier_address": "",
                        "drug_license": "",
                        "subtotal": 0,
                        "tax_amount": 0,
                        "discount_amount": 0,
                        "grand_total": 0,
                        "items": [
                            {
                                "product_name": "",
                                "hsn_code": "",
                                "batch_number": "",  # Will auto-generate if left empty
                                "expiry_date": "",   # Will default to 2 years if left empty
                                "quantity": 0,
                                "unit": "strip",
                                "cost_price": 0,
                                "mrp": 0,
                                "discount_percent": 0,
                                "tax_percent": 12,
                                "amount": 0
                            }
                        ]
                    },
                    "confidence_score": 0,
                    "manual_review_required": True,
                    "parsing_error": str(parse_error)
                }
                
        finally:
            # Clean up temp file
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
                
    except Exception as e:
        logger.error(f"Error in parse_invoice_safe: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process invoice: {str(e)}"
        )

@router.post("/parse-invoice")
async def parse_purchase_invoice(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Upload and parse a purchase invoice (PDF/image)
    Returns extracted data for user verification
    """
    try:
        # Validate file type
        allowed_types = ["application/pdf", "image/jpeg", "image/png", "image/jpg"]
        if file.content_type not in allowed_types:
            raise HTTPException(
                status_code=400,
                detail=f"File type {file.content_type} not allowed. Use PDF or image files."
            )
        
        # Create temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1]) as tmp_file:
            # Copy uploaded file to temp file
            shutil.copyfileobj(file.file, tmp_file)
            tmp_path = tmp_file.name
        
        try:
            # Parse the invoice
            invoice_data = parse_pdf(tmp_path)
            
            if not invoice_data:
                raise HTTPException(
                    status_code=422,
                    detail="Could not extract data from the invoice. Please try manual entry."
                )
            
            # Convert Invoice model to dict for JSON response
            response_data = {
                "status": "success",
                "confidence_score": getattr(invoice_data, 'confidence_score', 0.0),
                "extracted_data": {
                    "invoice_number": invoice_data.invoice_number,
                    "invoice_date": invoice_data.invoice_date.isoformat() if invoice_data.invoice_date else None,
                    "supplier_name": invoice_data.supplier_name,
                    "supplier_gstin": invoice_data.supplier_gstin,
                    "supplier_address": invoice_data.supplier_address,
                    "drug_license": invoice_data.drug_license_number,
                    "subtotal": float(invoice_data.subtotal or 0),
                    "tax_amount": float(invoice_data.tax_amount or 0),
                    "discount_amount": float(invoice_data.discount_amount or 0),
                    "grand_total": float(invoice_data.grand_total or 0),
                    "items": []
                },
                "manual_review_required": False
            }
            
            # Process items
            for item in invoice_data.items:
                item_data = {
                    "description": item.description,
                    "hsn_code": item.hsn_code,
                    "batch_number": item.batch_number,
                    "expiry_date": item.expiry_date,
                    "quantity": item.quantity,
                    "unit": item.unit,
                    "rate": float(item.rate or 0),
                    "mrp": float(item.mrp or 0),
                    "discount_percent": float(item.discount_percent or 0),
                    "tax_percent": float(item.tax_percent or 0),
                    "amount": float(item.amount or 0)
                }
                response_data["extracted_data"]["items"].append(item_data)
            
            # Check if manual review is needed based on confidence
            if getattr(invoice_data, 'confidence_score', 0) < 0.8:
                response_data["manual_review_required"] = True
                response_data["review_reason"] = "Low confidence score in extraction"
            
            # Try to match supplier
            if invoice_data.supplier_gstin:
                supplier = db.execute(
                    text("SELECT supplier_id, supplier_name FROM suppliers WHERE gst_number = :gstin"),
                    {"gstin": invoice_data.supplier_gstin}
                ).first()
                
                if supplier:
                    response_data["extracted_data"]["supplier_id"] = supplier.supplier_id
                    response_data["extracted_data"]["supplier_matched"] = True
                else:
                    response_data["extracted_data"]["supplier_matched"] = False
            
            # Try to match products by name or HSN
            for item in response_data["extracted_data"]["items"]:
                product_match = None
                
                # Try exact name match first
                if item["description"]:
                    product_match = db.execute(
                        text("""
                            SELECT product_id, product_name, hsn_code 
                            FROM products 
                            WHERE LOWER(product_name) = LOWER(:name)
                            LIMIT 1
                        """),
                        {"name": item["description"]}
                    ).first()
                
                # Try HSN match if name didn't work
                if not product_match and item["hsn_code"]:
                    product_match = db.execute(
                        text("""
                            SELECT product_id, product_name, hsn_code 
                            FROM products 
                            WHERE hsn_code = :hsn
                            LIMIT 1
                        """),
                        {"hsn": item["hsn_code"]}
                    ).first()
                
                if product_match:
                    item["product_id"] = product_match.product_id
                    item["product_matched"] = True
                    item["matched_product_name"] = product_match.product_name
                else:
                    item["product_matched"] = False
            
            # Check for existing supplier before returning
            _check_supplier_in_result(response_data["extracted_data"], db)
            return response_data
            
        finally:
            # Clean up temp file
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error parsing invoice: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to parse invoice: {str(e)}"
        )

@router.post("/create-from-parsed")
def create_purchase_from_parsed(
    purchase_data: dict,
    db: Session = Depends(get_db)
):
    """
    Create purchase order from parsed/verified invoice data
    Allows user to edit extracted data before creation
    """
    try:
        # Begin transaction
        
        # 1. Handle supplier
        supplier_id = purchase_data.get("supplier_id")
        if not supplier_id:
            # Create new supplier if needed
            supplier_data = purchase_data.get("supplier", {})
            if not supplier_data.get("supplier_name"):
                raise HTTPException(status_code=400, detail="Supplier name is required")
            
            # Generate supplier code
            supplier_code = f"SUP{datetime.now().strftime('%Y%m%d%H%M')}"
            
            supplier_id = db.execute(
                text("""
                    INSERT INTO suppliers (
                        org_id, supplier_code, supplier_name, 
                        gst_number, address, phone, email, drug_license_number
                    ) VALUES (
                        '12de5e22-eee7-4d25-b3a7-d16d01c6170f', -- Default org
                        :code, :name, :gstin, :address, :phone, :email, :drug_license
                    ) RETURNING supplier_id
                """),
                {
                    "code": supplier_code,
                    "name": supplier_data.get("supplier_name"),
                    "gstin": supplier_data.get("supplier_gstin", supplier_data.get("gst_number")),
                    "address": supplier_data.get("supplier_address", supplier_data.get("address")),
                    "phone": supplier_data.get("phone", ""),
                    "email": supplier_data.get("email", ""),
                    "drug_license": supplier_data.get("drug_license_number", supplier_data.get("drug_license", ""))
                }
            ).scalar()
        
        # 2. Create purchase order
        purchase_number = f"PO-{datetime.now().strftime('%Y%m%d-%H%M')}"
        
        purchase_id = db.execute(
            text("""
                INSERT INTO purchases (
                    org_id, purchase_number, purchase_date,
                    supplier_id, supplier_invoice_number, supplier_invoice_date,
                    subtotal_amount, discount_amount, tax_amount, 
                    other_charges, final_amount, purchase_status
                ) VALUES (
                    '12de5e22-eee7-4d25-b3a7-d16d01c6170f', -- Default org
                    :purchase_number, :purchase_date,
                    :supplier_id, :invoice_number, :invoice_date,
                    :subtotal, :discount, :tax, :other_charges, :total, 'draft'
                ) RETURNING purchase_id
            """),
            {
                "purchase_number": purchase_number,
                "purchase_date": purchase_data.get("purchase_date", datetime.now().date()),
                "supplier_id": supplier_id,
                "invoice_number": purchase_data.get("invoice_number"),
                "invoice_date": purchase_data.get("invoice_date"),
                "subtotal": Decimal(str(purchase_data.get("subtotal", 0))),
                "discount": Decimal(str(purchase_data.get("discount_amount", 0))),
                "tax": Decimal(str(purchase_data.get("tax_amount", 0))),
                "other_charges": Decimal(str(purchase_data.get("other_charges", 0))),
                "total": Decimal(str(purchase_data.get("grand_total", 0)))
            }
        ).scalar()
        
        # 3. Create purchase items
        items_created = 0
        for item in purchase_data.get("items", []):
            # Handle product matching/creation
            product_id = item.get("product_id")
            
            if not product_id and item.get("create_product", False):
                # Create new product
                product_code = f"PROD{datetime.now().strftime('%Y%m%d%H%M%S')}"
                product_id = db.execute(
                    text("""
                        INSERT INTO products (
                            org_id, product_code, product_name,
                            hsn_code, category, purchase_price, sale_price, mrp,
                            gst_percent
                        ) VALUES (
                            '12de5e22-eee7-4d25-b3a7-d16d01c6170f',
                            :code, :name, :hsn, :category,
                            :purchase_price, :sale_price, :mrp, :gst
                        ) RETURNING product_id
                    """),
                    {
                        "code": product_code,
                        "name": item.get("description"),
                        "hsn": item.get("hsn_code"),
                        "category": "General", # Default category
                        "purchase_price": Decimal(str(item.get("rate", 0))),
                        "sale_price": Decimal(str(item.get("rate", 0) * 1.2)), # 20% markup default
                        "mrp": Decimal(str(item.get("mrp", 0))),
                        "gst": Decimal(str(item.get("tax_percent", 12)))
                    }
                ).scalar()
            
            if product_id:
                # Create purchase item
                db.execute(
                    text("""
                        INSERT INTO purchase_items (
                            purchase_id, product_id, product_name,
                            ordered_quantity, cost_price, mrp,
                            discount_percent, discount_amount,
                            tax_percent, tax_amount, total_price,
                            batch_number, expiry_date,
                            item_status
                        ) VALUES (
                            :purchase_id, :product_id, :product_name,
                            :quantity, :cost_price, :mrp,
                            :discount_percent, :discount_amount,
                            :tax_percent, :tax_amount, :total,
                            :batch_number, :expiry_date,
                            'pending'
                        )
                    """),
                    {
                        "purchase_id": purchase_id,
                        "product_id": product_id,
                        "product_name": item.get("description"),
                        "quantity": item.get("quantity", 0),
                        "cost_price": Decimal(str(item.get("rate", 0))),
                        "mrp": Decimal(str(item.get("mrp", 0))),
                        "discount_percent": Decimal(str(item.get("discount_percent", 0))),
                        "discount_amount": Decimal(str(item.get("discount_amount", 0))),
                        "tax_percent": Decimal(str(item.get("tax_percent", 12))),
                        "tax_amount": Decimal(str(item.get("tax_amount", 0))),
                        "total": Decimal(str(item.get("amount", 0))),
                        "batch_number": item.get("batch_number"),
                        "expiry_date": item.get("expiry_date")
                    }
                )
                items_created += 1
        
        db.commit()
        
        return {
            "status": "success",
            "purchase_id": purchase_id,
            "purchase_number": purchase_number,
            "items_created": items_created,
            "message": f"Purchase order {purchase_number} created successfully"
        }
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating purchase from parsed data: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create purchase order: {str(e)}"
        )

@router.get("/parse-history")
def get_parse_history(
    skip: int = 0,
    limit: int = 10,
    db: Session = Depends(get_db)
):
    """
    Get history of parsed invoices (for future enhancement)
    """
    # This would retrieve from a parse_history table if we implement one
    return {
        "message": "Parse history not yet implemented",
        "total": 0,
        "items": []
    }

@router.post("/validate-invoice")
def validate_invoice_data(
    invoice_data: dict,
    db: Session = Depends(get_db)
):
    """
    Validate parsed invoice data before creation
    Check for duplicates, validate amounts, etc.
    """
    try:
        validations = {
            "is_valid": True,
            "errors": [],
            "warnings": []
        }
        
        # Check for duplicate invoice
        if invoice_data.get("invoice_number") and invoice_data.get("supplier_id"):
            duplicate = db.execute(
                text("""
                    SELECT purchase_id, purchase_number 
                    FROM purchases 
                    WHERE supplier_invoice_number = :invoice_num 
                    AND supplier_id = :supplier_id
                """),
                {
                    "invoice_num": invoice_data.get("invoice_number"),
                    "supplier_id": invoice_data.get("supplier_id")
                }
            ).first()
            
            if duplicate:
                validations["errors"].append(
                    f"Duplicate invoice found: {duplicate.purchase_number}"
                )
                validations["is_valid"] = False
        
        # Validate totals
        items_total = sum(
            Decimal(str(item.get("amount", 0))) 
            for item in invoice_data.get("items", [])
        )
        
        invoice_total = Decimal(str(invoice_data.get("grand_total", 0)))
        
        if abs(items_total - invoice_total) > Decimal("1.00"):
            validations["warnings"].append(
                f"Items total ({items_total}) doesn't match invoice total ({invoice_total})"
            )
        
        # Validate items
        for idx, item in enumerate(invoice_data.get("items", [])):
            if not item.get("product_id") and not item.get("create_product"):
                validations["warnings"].append(
                    f"Item {idx + 1}: Product not matched and not marked for creation"
                )
            
            if item.get("expiry_date"):
                try:
                    expiry = datetime.fromisoformat(item["expiry_date"]).date()
                    if expiry <= datetime.now().date():
                        validations["errors"].append(
                            f"Item {idx + 1}: Product already expired"
                        )
                        validations["is_valid"] = False
                except:
                    validations["warnings"].append(
                        f"Item {idx + 1}: Invalid expiry date format"
                    )
        
        return validations
        
    except Exception as e:
        logger.error(f"Error validating invoice: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to validate invoice: {str(e)}"
        )