"""
Legacy Document Number Generation Logic
Previously located in: backend/app/api/routes/documents.py

This manual SQL logic was replaced by DocumentNumberService to enforce DRY principles.
Archived for reference.
"""

# Original implementation of generate_document_number
# Used direct SQL instead of the unified service

'''
@router.get("/generate-number")
async def generate_document_number(
    type: str = Query(..., description="Document type code (INV, PO, etc.)"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_user_context_secure)
):
    """
    Generate next document number for any document type.
    
    Simplified version - returns incrementing numbers per document type.
    """
    try:
        org_id = current_user.get("org_id")
        if not org_id:
            raise HTTPException(status_code=400, detail="No organization ID found")
        
        # Map frontend code to backend type
        system_type = DOC_TYPE_MAPPING.get(type, type.lower())
        
        # Simple incrementing logic
        from sqlalchemy import text
        
        # Get last number for this document type
        result = db.execute(text("""
            SELECT MAX(CAST(REGEXP_REPLACE(document_number, '[^0-9]', '', 'g') AS BIGINT)) as last_number
            FROM (
                SELECT invoice_number as document_number FROM sales.invoices WHERE org_id = :org_id
                UNION ALL
                SELECT order_number as document_number FROM sales.orders WHERE org_id = :org_id
                UNION ALL
                SELECT challan_number as document_number FROM sales.delivery_challans WHERE org_id = :org_id
            ) docs
            WHERE document_number LIKE :prefix || '%'
        """), {"org_id": org_id, "prefix": type.upper()})
        
        row = result.fetchone()
        last_number = row[0] if row and row[0] else 0
        next_number = last_number + 1
        
        # Format: TYPE-00001
        new_number = f"{type.upper()}-{next_number:05d}"
        
        logger.info(f"Generated {type} number: {new_number} for org {org_id}")
        return {"number": new_number, "type": type}
        
    except Exception as e:
        logger.error(f"Failed to generate number for {type}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
'''
