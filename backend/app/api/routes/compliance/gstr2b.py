"""
GSTR-2B Reconciliation API Routes
Handles GSTR-2B file upload, parsing, and reconciliation against purchase invoices

PRODUCTION-READY: Uses TenantAwareSession for AI-agent safety
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy import text
from typing import Dict, Any, List, Optional
from datetime import datetime
import json
import uuid
import logging

from ....core.auth.tenant_service import get_tenant_aware_db, TenantAwareSession, with_tenant_context
from ....core.auth.org_context import get_org_context, OrgContext
from ....core.security.permissions import PermissionChecker

router = APIRouter(tags=["GSTR-2B Reconciliation"])
logger = logging.getLogger(__name__)


def parse_gstr2b_date(date_str: str) -> Optional[str]:
    """Parse GSTR-2B date format (DD-MM-YYYY or DD/MM/YYYY) to YYYY-MM-DD"""
    if not date_str:
        return None
    try:
        for fmt in ['%d-%m-%Y', '%d/%m/%Y', '%Y-%m-%d']:
            try:
                dt = datetime.strptime(date_str, fmt)
                return dt.strftime('%Y-%m-%d')
            except ValueError:
                continue
        return None
    except:
        return None


def normalize_invoice_number(inv_num: str) -> str:
    """Normalize invoice number for matching (remove spaces, convert to upper)"""
    if not inv_num:
        return ""
    return inv_num.strip().upper().replace(" ", "").replace("-", "").replace("/", "")


@router.post("/gstr2b/upload")
@with_tenant_context
async def upload_gstr2b(
    file: UploadFile = File(...),
    _: dict = Depends(PermissionChecker("gst", "create")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Upload GSTR-2B JSON file from GST Portal
    
    The JSON should be the direct download from GST Portal for GSTR-2B.
    """
    org_id = str(context.org_id)
    
    try:
        # Validate file
        if not file.filename.endswith('.json'):
            raise HTTPException(status_code=400, detail="Only JSON files are supported")
        
        # Read file content
        content = await file.read()
        file_size = len(content)
        
        try:
            data = json.loads(content.decode('utf-8'))
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid JSON file")
        
        # Extract basic info from GSTR-2B JSON
        gstin = data.get('gstin', '')
        ret_period = data.get('ret_period', data.get('rtnprd', ''))  # Handle different formats
        
        if not gstin:
            raise HTTPException(status_code=400, detail="GSTIN not found in file")
        if not ret_period:
            raise HTTPException(status_code=400, detail="Return period not found in file")
        
        # Format return period (MMYYYY to YYYY-MM)
        if len(ret_period) == 6:
            return_period = f"{ret_period[2:6]}-{ret_period[0:2]}"
        else:
            return_period = ret_period
        
        # Create upload record
        upload_id = str(uuid.uuid4())
        
        insert_upload = text("""
            INSERT INTO gst.gstr2b_uploads 
            (upload_id, org_id, return_period, file_name, file_size_bytes, gstin, status)
            VALUES (:upload_id, :org_id, :return_period, :file_name, :file_size, :gstin, 'processing')
        """)
        
        db.execute(insert_upload, {
            'upload_id': upload_id,
            'org_id': org_id,
            'return_period': return_period,
            'file_name': file.filename,
            'file_size': file_size,
            'gstin': gstin
        })
        
        # Parse and store invoices
        invoices_inserted = 0
        total_itc = 0
        suppliers_set = set()
        
        # Parse B2B section (main invoices from registered suppliers)
        b2b_data = data.get('b2b', data.get('docdata', {}).get('b2b', []))
        
        for supplier in b2b_data:
            supplier_gstin = supplier.get('ctin', supplier.get('sup_gstin', ''))
            supplier_name = supplier.get('trdnm', supplier.get('sup_name', ''))
            suppliers_set.add(supplier_gstin)
            
            invoices = supplier.get('inv', supplier.get('invoices', []))
            
            for inv in invoices:
                inv_num = inv.get('inum', inv.get('invoice_number', ''))
                inv_date = parse_gstr2b_date(inv.get('dt', inv.get('invoice_date', '')))
                inv_value = float(inv.get('val', inv.get('invoice_value', 0)) or 0)
                
                # Tax amounts - handle nested structure
                items = inv.get('itms', inv.get('items', [{}]))
                if items and len(items) > 0:
                    item = items[0] if isinstance(items[0], dict) else {}
                    itm_det = item.get('itm_det', item)
                    txval = float(itm_det.get('txval', inv.get('txval', 0)) or 0)
                    igst = float(itm_det.get('igst', inv.get('igst', 0)) or 0)
                    cgst = float(itm_det.get('cgst', inv.get('cgst', 0)) or 0)
                    sgst = float(itm_det.get('sgst', inv.get('sgst', 0)) or 0)
                    cess = float(itm_det.get('cess', inv.get('cess', 0)) or 0)
                else:
                    txval = float(inv.get('txval', 0) or 0)
                    igst = float(inv.get('igst', 0) or 0)
                    cgst = float(inv.get('cgst', 0) or 0)
                    sgst = float(inv.get('sgst', 0) or 0)
                    cess = float(inv.get('cess', 0) or 0)
                
                itc_available = igst + cgst + sgst + cess
                total_itc += itc_available
                
                # Insert invoice
                insert_inv = text("""
                    INSERT INTO gst.gstr2b_invoices
                    (upload_id, org_id, return_period, supplier_gstin, supplier_name,
                     invoice_number, invoice_date, invoice_type, invoice_value, taxable_value,
                     igst, cgst, sgst, cess, itc_available, match_status)
                    VALUES (:upload_id, :org_id, :return_period, :supplier_gstin, :supplier_name,
                            :invoice_number, :invoice_date, 'B2B', :invoice_value, :taxable_value,
                            :igst, :cgst, :sgst, :cess, :itc_available, 'pending')
                """)
                
                db.execute(insert_inv, {
                    'upload_id': upload_id,
                    'org_id': org_id,
                    'return_period': return_period,
                    'supplier_gstin': supplier_gstin,
                    'supplier_name': supplier_name,
                    'invoice_number': inv_num,
                    'invoice_date': inv_date,
                    'invoice_value': inv_value,
                    'taxable_value': txval,
                    'igst': igst,
                    'cgst': cgst,
                    'sgst': sgst,
                    'cess': cess,
                    'itc_available': itc_available
                })
                invoices_inserted += 1
        
        # Update upload with totals
        update_upload = text("""
            UPDATE gst.gstr2b_uploads 
            SET total_invoices = :total_invoices,
                total_itc_available = :total_itc,
                total_suppliers = :total_suppliers,
                status = 'completed'
            WHERE upload_id = :upload_id
        """)
        
        db.execute(update_upload, {
            'upload_id': upload_id,
            'total_invoices': invoices_inserted,
            'total_itc': total_itc,
            'total_suppliers': len(suppliers_set)
        })
        
        db.commit()
        
        return {
            "success": True,
            "upload_id": upload_id,
            "return_period": return_period,
            "gstin": gstin,
            "invoices_parsed": invoices_inserted,
            "suppliers_found": len(suppliers_set),
            "total_itc_available": round(total_itc, 2),
            "message": f"Successfully uploaded {invoices_inserted} invoices from GSTR-2B",
            "next_step": "reconcile"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"GSTR-2B upload error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/gstr2b/reconcile/{upload_id}")
@with_tenant_context
async def reconcile_gstr2b(
    upload_id: str,
    _: dict = Depends(PermissionChecker("gst", "create")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Reconcile uploaded GSTR-2B against purchase invoices
    
    Matching logic:
    1. Exact match on supplier GSTIN + invoice number
    2. Fuzzy match on invoice number (normalized)
    3. Amount verification
    """
    org_id = str(context.org_id)
    
    try:
        # Get GSTR-2B invoices
        get_2b_invoices = text("""
            SELECT id, supplier_gstin, invoice_number, invoice_date, 
                   invoice_value, taxable_value, igst, cgst, sgst, itc_available
            FROM gst.gstr2b_invoices
            WHERE upload_id = :upload_id AND org_id = :org_id
        """)
        
        gstr2b_invoices = db.execute(get_2b_invoices, {
            'upload_id': upload_id,
            'org_id': org_id
        }).fetchall()
        
        if not gstr2b_invoices:
            raise HTTPException(status_code=404, detail="No invoices found for this upload")
        
        matched = 0
        mismatched = 0
        missing = 0
        
        for inv in gstr2b_invoices:
            inv_id = str(inv.id)
            supplier_gstin = inv.supplier_gstin
            invoice_number = inv.invoice_number
            normalized_inv_num = normalize_invoice_number(invoice_number)
            inv_value = float(inv.invoice_value or 0)
            
            # Try to find matching purchase invoice
            find_purchase = text("""
                SELECT si.supplier_invoice_id, si.supplier_invoice_number, 
                       si.invoice_total, si.taxable_amount, si.tax_amount,
                       s.gst_number as supplier_gst
                FROM procurement.supplier_invoices si
                LEFT JOIN parties.suppliers s ON si.supplier_id = s.supplier_id
                WHERE si.org_id = :org_id
                    AND (s.gst_number = :supplier_gstin OR s.gst_number IS NULL)
                    AND (
                        si.supplier_invoice_number = :invoice_number
                        OR UPPER(REPLACE(REPLACE(REPLACE(si.supplier_invoice_number, ' ', ''), '-', ''), '/', '')) = :normalized_inv_num
                    )
                LIMIT 1
            """)
            
            purchase = db.execute(find_purchase, {
                'org_id': org_id,
                'supplier_gstin': supplier_gstin,
                'invoice_number': invoice_number,
                'normalized_inv_num': normalized_inv_num
            }).fetchone()
            
            if purchase:
                purchase_value = float(purchase.invoice_total or 0)
                amount_diff = abs(inv_value - purchase_value)
                
                if amount_diff < 1:  # Allow ₹1 tolerance
                    # Exact match
                    update_status = text("""
                        UPDATE gst.gstr2b_invoices
                        SET match_status = 'matched',
                            matched_invoice_id = :purchase_id,
                            our_invoice_number = :our_inv_num,
                            our_invoice_amount = :our_amount,
                            amount_difference = 0,
                            updated_at = NOW()
                        WHERE id = :id
                    """)
                    db.execute(update_status, {
                        'id': inv_id,
                        'purchase_id': str(purchase.supplier_invoice_id),
                        'our_inv_num': purchase.supplier_invoice_number,
                        'our_amount': purchase_value
                    })
                    matched += 1
                else:
                    # Amount mismatch
                    mismatch_details = {
                        "type": "amount",
                        "gstr2b_amount": inv_value,
                        "our_amount": purchase_value,
                        "difference": round(amount_diff, 2)
                    }
                    update_status = text("""
                        UPDATE gst.gstr2b_invoices
                        SET match_status = 'mismatched',
                            mismatch_type = 'amount',
                            mismatch_details = :details,
                            matched_invoice_id = :purchase_id,
                            our_invoice_number = :our_inv_num,
                            our_invoice_amount = :our_amount,
                            amount_difference = :diff,
                            updated_at = NOW()
                        WHERE id = :id
                    """)
                    db.execute(update_status, {
                        'id': inv_id,
                        'purchase_id': str(purchase.supplier_invoice_id),
                        'our_inv_num': purchase.supplier_invoice_number,
                        'our_amount': purchase_value,
                        'diff': amount_diff,
                        'details': json.dumps(mismatch_details)
                    })
                    mismatched += 1
            else:
                # Not found in our books
                update_status = text("""
                    UPDATE gst.gstr2b_invoices
                    SET match_status = 'missing',
                        mismatch_type = 'not_in_books',
                        updated_at = NOW()
                    WHERE id = :id
                """)
                db.execute(update_status, {'id': inv_id})
                missing += 1
        
        # Update upload summary
        update_upload = text("""
            UPDATE gst.gstr2b_uploads
            SET reconciled_at = NOW(),
                matched_count = :matched,
                mismatched_count = :mismatched,
                missing_count = :missing,
                updated_at = NOW()
            WHERE upload_id = :upload_id
        """)
        db.execute(update_upload, {
            'upload_id': upload_id,
            'matched': matched,
            'mismatched': mismatched,
            'missing': missing
        })
        
        db.commit()
        
        total = len(gstr2b_invoices)
        match_rate = round((matched / total) * 100, 1) if total > 0 else 0
        
        return {
            "success": True,
            "upload_id": upload_id,
            "total_invoices": total,
            "matched": matched,
            "mismatched": mismatched,
            "missing": missing,
            "match_rate": match_rate,
            "itc_at_risk": round(sum(float(inv.itc_available or 0) for inv in gstr2b_invoices 
                                     if inv.id in [i.id for i in gstr2b_invoices]), 2),
            "message": f"Reconciliation complete: {match_rate}% match rate"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"GSTR-2B reconciliation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/gstr2b/status")
@with_tenant_context
async def get_gstr2b_status(
    period: Optional[str] = Query(None, description="Return period (YYYY-MM)"),
    _: dict = Depends(PermissionChecker("gst", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Get GSTR-2B reconciliation status summary
    """
    org_id = str(context.org_id)
    
    try:
        if period:
            query = text("""
                SELECT upload_id, return_period, gstin, file_name, uploaded_at,
                       total_invoices, total_itc_available, total_suppliers,
                       status, matched_count, mismatched_count, missing_count, reconciled_at
                FROM gst.gstr2b_uploads
                WHERE org_id = :org_id AND return_period = :period
                ORDER BY uploaded_at DESC
                LIMIT 1
            """)
            uploads = db.execute(query, {'org_id': org_id, 'period': period}).fetchall()
        else:
            query = text("""
                SELECT upload_id, return_period, gstin, file_name, uploaded_at,
                       total_invoices, total_itc_available, total_suppliers,
                       status, matched_count, mismatched_count, missing_count, reconciled_at
                FROM gst.gstr2b_uploads
                WHERE org_id = :org_id
                ORDER BY return_period DESC, uploaded_at DESC
                LIMIT 12
            """)
            uploads = db.execute(query, {'org_id': org_id}).fetchall()
        
        results = []
        for upload in uploads:
            total = upload.matched_count + upload.mismatched_count + upload.missing_count
            match_rate = round((upload.matched_count / total) * 100, 1) if total > 0 else 0
            
            results.append({
                "upload_id": str(upload.upload_id),
                "return_period": upload.return_period,
                "gstin": upload.gstin,
                "file_name": upload.file_name,
                "uploaded_at": upload.uploaded_at.isoformat() if upload.uploaded_at else None,
                "total_invoices": upload.total_invoices,
                "total_itc_available": float(upload.total_itc_available or 0),
                "total_suppliers": upload.total_suppliers,
                "status": upload.status,
                "reconciled": upload.reconciled_at is not None,
                "matched": upload.matched_count or 0,
                "mismatched": upload.mismatched_count or 0,
                "missing": upload.missing_count or 0,
                "match_rate": match_rate
            })
        
        return {"uploads": results}
        
    except Exception as e:
        logger.error(f"GSTR-2B status error: {e}")
        return {"uploads": [], "error": str(e)}


@router.get("/gstr2b/mismatches")
@with_tenant_context
async def get_gstr2b_mismatches(
    upload_id: Optional[str] = Query(None),
    status: str = Query("all", description="Filter: all, mismatched, missing"),
    limit: int = Query(50, le=200),
    _: dict = Depends(PermissionChecker("gst", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Get list of mismatched/missing invoices for review
    """
    org_id = str(context.org_id)
    
    try:
        conditions = ["org_id = :org_id"]
        params = {'org_id': org_id, 'limit': limit}
        
        if upload_id:
            conditions.append("upload_id = :upload_id")
            params['upload_id'] = upload_id
        
        if status == "mismatched":
            conditions.append("match_status = 'mismatched'")
        elif status == "missing":
            conditions.append("match_status = 'missing'")
        elif status != "all":
            conditions.append("match_status IN ('mismatched', 'missing')")
        
        query = text(f"""
            SELECT id, upload_id, return_period, supplier_gstin, supplier_name,
                   invoice_number, invoice_date, invoice_value, itc_available,
                   match_status, mismatch_type, mismatch_details,
                   our_invoice_number, our_invoice_amount, amount_difference
            FROM gst.gstr2b_invoices
            WHERE {' AND '.join(conditions)}
            ORDER BY itc_available DESC
            LIMIT :limit
        """)
        
        invoices = db.execute(query, params).fetchall()
        
        results = []
        total_itc_at_risk = 0
        
        for inv in invoices:
            itc = float(inv.itc_available or 0)
            if inv.match_status in ('mismatched', 'missing'):
                total_itc_at_risk += itc
            
            results.append({
                "id": str(inv.id),
                "return_period": inv.return_period,
                "supplier_gstin": inv.supplier_gstin,
                "supplier_name": inv.supplier_name,
                "invoice_number": inv.invoice_number,
                "invoice_date": inv.invoice_date.isoformat() if inv.invoice_date else None,
                "invoice_value": float(inv.invoice_value or 0),
                "itc_available": itc,
                "match_status": inv.match_status,
                "mismatch_type": inv.mismatch_type,
                "mismatch_details": inv.mismatch_details,
                "our_invoice_number": inv.our_invoice_number,
                "our_invoice_amount": float(inv.our_invoice_amount or 0) if inv.our_invoice_amount else None,
                "amount_difference": float(inv.amount_difference or 0) if inv.amount_difference else None
            })
        
        return {
            "invoices": results,
            "total_count": len(results),
            "total_itc_at_risk": round(total_itc_at_risk, 2)
        }
        
    except Exception as e:
        logger.error(f"GSTR-2B mismatches error: {e}")
        return {"invoices": [], "error": str(e)}


# Export router
__all__ = ["router"]
