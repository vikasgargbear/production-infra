"""
Temporary migration endpoints - REMOVE AFTER USE
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from ...core.database import get_db

router = APIRouter()

@router.post("/add-supplier-website-column")
def add_supplier_website_column(db: Session = Depends(get_db)):
    """
    TEMPORARY: Add website column to suppliers table
    Remove this endpoint after running once
    """
    try:
        migration_sql = """
        DO $$
        BEGIN
            -- Add website column if not exists
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'parties' 
                AND table_name = 'suppliers' 
                AND column_name = 'website'
            ) THEN
                ALTER TABLE parties.suppliers 
                ADD COLUMN website TEXT;
                
                RAISE NOTICE 'Added website column to suppliers table';
            ELSE
                RAISE NOTICE 'Website column already exists in suppliers table';
            END IF;
        END $$;
        
        COMMENT ON COLUMN parties.suppliers.website IS 'Supplier website URL for reference and communication';
        """
        
        result = db.execute(text(migration_sql))
        db.commit()
        
        return {
            "success": True,
            "message": "Website column migration completed successfully",
            "action": "Added website column to parties.suppliers table"
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Migration failed: {str(e)}"
        )